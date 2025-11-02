// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256);
    function getTWAP(address asset, uint256 window) external view returns (uint256);
}

contract AutomatedMarketMaker is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    bytes32 public constant STRATEGY_MANAGER_ROLE = keccak256("STRATEGY_MANAGER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum StrategyType {
        GRID_TRADING,
        DCA_STRATEGY,
        MOMENTUM_FOLLOWING,
        MEAN_REVERSION,
        ARBITRAGE,
        LIQUIDITY_PROVIDING,
        DELTA_NEUTRAL,
        YIELD_FARMING
    }

    enum StrategyStatus {
        INACTIVE,
        ACTIVE,
        PAUSED,
        EMERGENCY_STOP
    }

    struct Strategy {
        uint256 id;
        StrategyType strategyType;
        StrategyStatus status;
        address creator;
        address baseToken;
        address quoteToken;
        uint256 totalCapital;
        uint256 activeCapital;
        uint256 minInvestment;
        uint256 maxInvestment;
        uint256 performanceFee; // basis points
        uint256 managementFee; // basis points per year
        uint256 createdAt;
        uint256 lastRebalance;
        mapping(address => uint256) investorShares;
        mapping(address => uint256) investorCapital;
        StrategyParams params;
        StrategyMetrics metrics;
    }

    struct StrategyParams {
        uint256 gridLevels;
        uint256 gridSpacing;
        uint256 dcaInterval;
        uint256 dcaAmount;
        uint256 stopLoss;
        uint256 takeProfit;
        uint256 rebalanceThreshold;
        uint256 maxSlippage;
        uint256 maxDrawdown;
        bool useOracle;
        bool compoundRewards;
        uint256[] customParams;
    }

    struct StrategyMetrics {
        uint256 totalReturn;
        uint256 sharpeRatio;
        uint256 maxDrawdown;
        uint256 winRate;
        uint256 totalTrades;
        uint256 profitableTrades;
        uint256 averageReturn;
        uint256 volatility;
        uint256 lastUpdate;
    }

    struct GridOrder {
        uint256 strategyId;
        uint256 price;
        uint256 amount;
        bool isBuy;
        bool isActive;
        uint256 createdAt;
    }

    struct ArbitrageOpportunity {
        address tokenA;
        address tokenB;
        address dexA;
        address dexB;
        uint256 priceA;
        uint256 priceB;
        uint256 profit;
        uint256 timestamp;
    }

    mapping(uint256 => Strategy) public strategies;
    mapping(address => uint256[]) public userStrategies;
    mapping(uint256 => GridOrder[]) public gridOrders;
    mapping(bytes32 => ArbitrageOpportunity) public arbitrageOpportunities;

    uint256 public nextStrategyId = 1;
    uint256 public totalStrategiesCount;
    uint256 public totalValueLocked;
    uint256 public protocolFee = 100; // 1%
    uint256 public constant FEE_DENOMINATOR = 10000;

    IPriceOracle public priceOracle;
    address public feeRecipient;

    uint256[] public activeStrategies;
    mapping(uint256 => bool) public isStrategyActive;

    event StrategyCreated(
        uint256 indexed strategyId,
        address indexed creator,
        StrategyType strategyType,
        address baseToken,
        address quoteToken
    );

    event StrategyInvestment(
        uint256 indexed strategyId,
        address indexed investor,
        uint256 amount,
        uint256 shares
    );

    event StrategyWithdrawal(
        uint256 indexed strategyId,
        address indexed investor,
        uint256 shares,
        uint256 amount
    );

    event StrategyRebalanced(
        uint256 indexed strategyId,
        uint256 timestamp,
        uint256 newValue
    );

    event GridOrderExecuted(
        uint256 indexed strategyId,
        uint256 price,
        uint256 amount,
        bool isBuy
    );

    event ArbitrageExecuted(
        bytes32 indexed opportunityId,
        uint256 profit,
        address tokenA,
        address tokenB
    );

    modifier onlyStrategyManager() {
        require(hasRole(STRATEGY_MANAGER_ROLE, msg.sender), "Not strategy manager");
        _;
    }

    modifier strategyExists(uint256 strategyId) {
        require(strategies[strategyId].id != 0, "Strategy does not exist");
        _;
    }

    modifier strategyActive(uint256 strategyId) {
        require(strategies[strategyId].status == StrategyStatus.ACTIVE, "Strategy not active");
        _;
    }

    constructor(address _priceOracle, address _feeRecipient) {
        require(_priceOracle != address(0), "Invalid oracle");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        priceOracle = IPriceOracle(_priceOracle);
        feeRecipient = _feeRecipient;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(STRATEGY_MANAGER_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
    }

    function createStrategy(
        StrategyType _strategyType,
        address _baseToken,
        address _quoteToken,
        uint256 _minInvestment,
        uint256 _maxInvestment,
        uint256 _performanceFee,
        uint256 _managementFee,
        StrategyParams memory _params
    ) external onlyStrategyManager returns (uint256) {
        require(_baseToken != address(0) && _quoteToken != address(0), "Invalid tokens");
        require(_baseToken != _quoteToken, "Same tokens");
        require(_performanceFee <= 2000, "Performance fee too high"); // Max 20%
        require(_managementFee <= 500, "Management fee too high"); // Max 5%

        uint256 strategyId = nextStrategyId++;

        Strategy storage newStrategy = strategies[strategyId];
        newStrategy.id = strategyId;
        newStrategy.strategyType = _strategyType;
        newStrategy.status = StrategyStatus.INACTIVE;
        newStrategy.creator = msg.sender;
        newStrategy.baseToken = _baseToken;
        newStrategy.quoteToken = _quoteToken;
        newStrategy.minInvestment = _minInvestment;
        newStrategy.maxInvestment = _maxInvestment;
        newStrategy.performanceFee = _performanceFee;
        newStrategy.managementFee = _managementFee;
        newStrategy.createdAt = block.timestamp;
        newStrategy.params = _params;

        userStrategies[msg.sender].push(strategyId);
        totalStrategiesCount++;

        emit StrategyCreated(strategyId, msg.sender, _strategyType, _baseToken, _quoteToken);

        return strategyId;
    }

    function activateStrategy(uint256 strategyId) external onlyStrategyManager strategyExists(strategyId) {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.status == StrategyStatus.INACTIVE, "Strategy already active");

        strategy.status = StrategyStatus.ACTIVE;
        activeStrategies.push(strategyId);
        isStrategyActive[strategyId] = true;

        if (strategy.strategyType == StrategyType.GRID_TRADING) {
            _initializeGridStrategy(strategyId);
        }
    }

    function investInStrategy(uint256 strategyId, uint256 amount)
        external
        nonReentrant
        strategyExists(strategyId)
        strategyActive(strategyId)
    {
        Strategy storage strategy = strategies[strategyId];
        require(amount >= strategy.minInvestment, "Below minimum investment");
        require(
            strategy.maxInvestment == 0 ||
            strategy.investorCapital[msg.sender].add(amount) <= strategy.maxInvestment,
            "Exceeds maximum investment"
        );

        IERC20(strategy.baseToken).safeTransferFrom(msg.sender, address(this), amount);

        uint256 shares = _calculateShares(strategyId, amount);

        strategy.investorShares[msg.sender] = strategy.investorShares[msg.sender].add(shares);
        strategy.investorCapital[msg.sender] = strategy.investorCapital[msg.sender].add(amount);
        strategy.totalCapital = strategy.totalCapital.add(amount);
        strategy.activeCapital = strategy.activeCapital.add(amount);

        totalValueLocked = totalValueLocked.add(amount);

        emit StrategyInvestment(strategyId, msg.sender, amount, shares);
    }

    function withdrawFromStrategy(uint256 strategyId, uint256 shares)
        external
        nonReentrant
        strategyExists(strategyId)
    {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.investorShares[msg.sender] >= shares, "Insufficient shares");

        uint256 withdrawAmount = _calculateWithdrawAmount(strategyId, shares);

        // Apply management fee
        uint256 managementFee = _calculateManagementFee(strategyId, withdrawAmount);
        uint256 netAmount = withdrawAmount.sub(managementFee);

        strategy.investorShares[msg.sender] = strategy.investorShares[msg.sender].sub(shares);
        strategy.totalCapital = strategy.totalCapital.sub(withdrawAmount);
        strategy.activeCapital = strategy.activeCapital.sub(withdrawAmount);

        totalValueLocked = totalValueLocked.sub(withdrawAmount);

        IERC20(strategy.baseToken).safeTransfer(msg.sender, netAmount);
        if (managementFee > 0) {
            IERC20(strategy.baseToken).safeTransfer(feeRecipient, managementFee);
        }

        emit StrategyWithdrawal(strategyId, msg.sender, shares, netAmount);
    }

    function rebalanceStrategy(uint256 strategyId) external onlyRole(OPERATOR_ROLE) strategyExists(strategyId) {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.status == StrategyStatus.ACTIVE, "Strategy not active");

        if (strategy.strategyType == StrategyType.GRID_TRADING) {
            _rebalanceGridStrategy(strategyId);
        } else if (strategy.strategyType == StrategyType.DCA_STRATEGY) {
            _executeDCAStrategy(strategyId);
        } else if (strategy.strategyType == StrategyType.MOMENTUM_FOLLOWING) {
            _executeMomentumStrategy(strategyId);
        } else if (strategy.strategyType == StrategyType.MEAN_REVERSION) {
            _executeMeanReversionStrategy(strategyId);
        }

        strategy.lastRebalance = block.timestamp;
        _updateStrategyMetrics(strategyId);

        emit StrategyRebalanced(strategyId, block.timestamp, strategy.totalCapital);
    }

    function executeArbitrage(bytes32 opportunityId) external onlyRole(OPERATOR_ROLE) {
        ArbitrageOpportunity storage opportunity = arbitrageOpportunities[opportunityId];
        require(opportunity.timestamp > 0, "Opportunity does not exist");
        require(block.timestamp.sub(opportunity.timestamp) <= 300, "Opportunity expired"); // 5 minutes

        // Execute arbitrage logic here
        uint256 profit = _executeArbitrageLogic(opportunity);

        emit ArbitrageExecuted(opportunityId, profit, opportunity.tokenA, opportunity.tokenB);

        delete arbitrageOpportunities[opportunityId];
    }

    function _initializeGridStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];
        uint256 basePrice = priceOracle.getPrice(strategy.baseToken);
        uint256 gridSpacing = strategy.params.gridSpacing;
        uint256 gridLevels = strategy.params.gridLevels;

        for (uint256 i = 0; i < gridLevels; i++) {
            uint256 buyPrice = basePrice.sub(gridSpacing.mul(i + 1));
            uint256 sellPrice = basePrice.add(gridSpacing.mul(i + 1));

            gridOrders[strategyId].push(GridOrder({
                strategyId: strategyId,
                price: buyPrice,
                amount: strategy.activeCapital.div(gridLevels.mul(2)),
                isBuy: true,
                isActive: true,
                createdAt: block.timestamp
            }));

            gridOrders[strategyId].push(GridOrder({
                strategyId: strategyId,
                price: sellPrice,
                amount: strategy.activeCapital.div(gridLevels.mul(2)),
                isBuy: false,
                isActive: true,
                createdAt: block.timestamp
            }));
        }
    }

    function _rebalanceGridStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];
        uint256 currentPrice = priceOracle.getPrice(strategy.baseToken);

        GridOrder[] storage orders = gridOrders[strategyId];

        for (uint256 i = 0; i < orders.length; i++) {
            GridOrder storage order = orders[i];
            if (!order.isActive) continue;

            bool shouldExecute = (order.isBuy && currentPrice <= order.price) ||
                               (!order.isBuy && currentPrice >= order.price);

            if (shouldExecute) {
                _executeGridOrder(strategyId, i);
            }
        }
    }

    function _executeGridOrder(uint256 strategyId, uint256 orderIndex) internal {
        GridOrder storage order = gridOrders[strategyId][orderIndex];
        order.isActive = false;

        emit GridOrderExecuted(strategyId, order.price, order.amount, order.isBuy);

        // Create new order on opposite side
        uint256 newPrice = order.isBuy
            ? order.price.add(strategies[strategyId].params.gridSpacing.mul(2))
            : order.price.sub(strategies[strategyId].params.gridSpacing.mul(2));

        gridOrders[strategyId].push(GridOrder({
            strategyId: strategyId,
            price: newPrice,
            amount: order.amount,
            isBuy: !order.isBuy,
            isActive: true,
            createdAt: block.timestamp
        }));
    }

    function _executeDCAStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];

        if (block.timestamp.sub(strategy.lastRebalance) >= strategy.params.dcaInterval) {
            uint256 dcaAmount = strategy.params.dcaAmount;
            if (dcaAmount <= strategy.activeCapital) {
                // Execute DCA buy/sell logic
                _updateStrategyValue(strategyId, dcaAmount);
            }
        }
    }

    function _executeMomentumStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];

        uint256 currentPrice = priceOracle.getPrice(strategy.baseToken);
        uint256 twapPrice = priceOracle.getTWAP(strategy.baseToken, 3600); // 1 hour TWAP

        uint256 momentum = currentPrice > twapPrice
            ? currentPrice.sub(twapPrice).mul(10000).div(twapPrice)
            : twapPrice.sub(currentPrice).mul(10000).div(twapPrice);

        if (momentum >= strategy.params.rebalanceThreshold) {
            // Execute momentum trade
            bool isUptrend = currentPrice > twapPrice;
            _executeMomentumTrade(strategyId, isUptrend);
        }
    }

    function _executeMeanReversionStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];

        uint256 currentPrice = priceOracle.getPrice(strategy.baseToken);
        uint256 twapPrice = priceOracle.getTWAP(strategy.baseToken, 14400); // 4 hour TWAP

        uint256 deviation = currentPrice > twapPrice
            ? currentPrice.sub(twapPrice).mul(10000).div(twapPrice)
            : twapPrice.sub(currentPrice).mul(10000).div(twapPrice);

        if (deviation >= strategy.params.rebalanceThreshold) {
            // Execute mean reversion trade
            bool isOverbought = currentPrice > twapPrice;
            _executeMeanReversionTrade(strategyId, isOverbought);
        }
    }

    function _executeMomentumTrade(uint256 strategyId, bool isUptrend) internal {
        // Implementation for momentum trading logic
    }

    function _executeMeanReversionTrade(uint256 strategyId, bool isOverbought) internal {
        // Implementation for mean reversion trading logic
    }

    function _executeArbitrageLogic(ArbitrageOpportunity memory opportunity) internal returns (uint256) {
        // Implementation for arbitrage execution
        return opportunity.profit;
    }

    function _calculateShares(uint256 strategyId, uint256 amount) internal view returns (uint256) {
        Strategy storage strategy = strategies[strategyId];
        if (strategy.totalCapital == 0) {
            return amount;
        }
        // SECURITY FIX: Avoid intermediate division to prevent precision loss
        // Old: amount.mul(1e18).div(strategy.totalCapital.div(1e18))
        // New: (amount * 1e18) / strategy.totalCapital
        return amount.mul(1e18).div(strategy.totalCapital);
    }

    function _calculateWithdrawAmount(uint256 strategyId, uint256 shares) internal view returns (uint256) {
        Strategy storage strategy = strategies[strategyId];
        uint256 totalShares = strategy.totalCapital; // Simplified
        return shares.mul(strategy.totalCapital).div(totalShares);
    }

    function _calculateManagementFee(uint256 strategyId, uint256 amount) internal view returns (uint256) {
        Strategy storage strategy = strategies[strategyId];
        uint256 timeElapsed = block.timestamp.sub(strategy.lastRebalance);
        uint256 yearlyFee = amount.mul(strategy.managementFee).div(FEE_DENOMINATOR);
        return yearlyFee.mul(timeElapsed).div(365 days);
    }

    function _updateStrategyValue(uint256 strategyId, uint256 newValue) internal {
        strategies[strategyId].activeCapital = newValue;
    }

    function _updateStrategyMetrics(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];
        // Update metrics calculations
        strategy.metrics.lastUpdate = block.timestamp;
    }

    function getStrategy(uint256 strategyId) external view returns (
        uint256 id,
        StrategyType strategyType,
        StrategyStatus status,
        address creator,
        address baseToken,
        address quoteToken,
        uint256 totalCapital,
        uint256 activeCapital
    ) {
        Strategy storage strategy = strategies[strategyId];
        return (
            strategy.id,
            strategy.strategyType,
            strategy.status,
            strategy.creator,
            strategy.baseToken,
            strategy.quoteToken,
            strategy.totalCapital,
            strategy.activeCapital
        );
    }

    function getStrategyMetrics(uint256 strategyId) external view returns (StrategyMetrics memory) {
        return strategies[strategyId].metrics;
    }

    function getUserStrategies(address user) external view returns (uint256[] memory) {
        return userStrategies[user];
    }

    function getActiveStrategies() external view returns (uint256[] memory) {
        return activeStrategies;
    }

    function emergencyStop(uint256 strategyId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        strategies[strategyId].status = StrategyStatus.EMERGENCY_STOP;
    }

    function updateProtocolFee(uint256 _protocolFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_protocolFee <= 1000, "Fee too high");
        protocolFee = _protocolFee;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}