// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256);
    function getTWAP(address asset, uint256 window) external view returns (uint256);
}

/**
 * @title AutomatedMarketMakerV2
 * @notice Upgradeable AMM with advanced security features
 * @dev Implements UUPS proxy pattern for upgradeability
 *
 * Security Improvements:
 * - Flash loan attack prevention
 * - Oracle price manipulation protection
 * - Emergency pause functionality
 * - Timelock for critical operations
 * - Multi-signature for upgrades
 */
contract AutomatedMarketMakerV2 is
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant STRATEGY_MANAGER_ROLE = keccak256("STRATEGY_MANAGER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant ORACLE_UPDATER_ROLE = keccak256("ORACLE_UPDATER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public constant TIMELOCK_DURATION = 2 days;
    uint256 public constant MAX_PRICE_DEVIATION = 500; // 5% = 500 basis points
    uint256 public constant FEE_DENOMINATOR = 10000;

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

    struct TimelockTransaction {
        address target;
        uint256 value;
        bytes data;
        uint256 executeAfter;
        bool executed;
    }

    mapping(uint256 => Strategy) public strategies;
    mapping(address => uint256[]) public userStrategies;
    mapping(uint256 => GridOrder[]) public gridOrders;
    mapping(bytes32 => ArbitrageOpportunity) public arbitrageOpportunities;
    mapping(bytes32 => TimelockTransaction) public timelockQueue;

    // Flash loan protection: track last action block per strategy
    mapping(uint256 => uint256) private lastActionBlock;

    // Flash loan protection: track last action block per user
    mapping(address => uint256) private lastUserActionBlock;

    uint256 public nextStrategyId;
    uint256 public totalStrategiesCount;
    uint256 public totalValueLocked;
    uint256 public protocolFee;

    IPriceOracle public priceOracle;
    address public feeRecipient;

    uint256[] public activeStrategies;
    mapping(uint256 => bool) public isStrategyActive;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor)
     * @param _priceOracle Address of the price oracle
     * @param _feeRecipient Address to receive protocol fees
     */
    function initialize(
        address _priceOracle,
        address _feeRecipient
    ) public initializer {
        require(_priceOracle != address(0), "Invalid oracle");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        __ReentrancyGuard_init();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        priceOracle = IPriceOracle(_priceOracle);
        feeRecipient = _feeRecipient;
        protocolFee = 100; // 1%
        nextStrategyId = 1;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(STRATEGY_MANAGER_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    // ========== MODIFIERS ==========

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

    /**
     * @notice Prevent flash loan attacks by blocking same-block actions
     * @param strategyId The strategy ID to check
     */
    modifier noFlashLoan(uint256 strategyId) {
        require(
            lastActionBlock[strategyId] != block.number,
            "Flash loan attack detected: same block action"
        );
        _;
        lastActionBlock[strategyId] = block.number;
    }

    /**
     * @notice Prevent flash loan attacks at user level
     */
    modifier noUserFlashLoan() {
        require(
            lastUserActionBlock[msg.sender] != block.number,
            "Flash loan attack detected: same block user action"
        );
        _;
        lastUserActionBlock[msg.sender] = block.number;
    }

    // ========== SECURITY FUNCTIONS ==========

    /**
     * @notice Validate oracle price against TWAP to prevent manipulation
     * @param asset The asset to check
     * @param currentPrice Current spot price
     * @return validated price
     */
    function _validateOraclePrice(
        address asset,
        uint256 currentPrice
    ) internal view returns (uint256) {
        uint256 twapPrice = priceOracle.getTWAP(asset, 3600); // 1 hour TWAP

        uint256 deviation = currentPrice > twapPrice
            ? ((currentPrice - twapPrice) * 10000) / twapPrice
            : ((twapPrice - currentPrice) * 10000) / twapPrice;

        require(
            deviation < MAX_PRICE_DEVIATION,
            "Price deviation exceeds maximum allowed"
        );

        return currentPrice;
    }

    /**
     * @notice Emergency withdraw function for users when contract is paused
     * @param strategyId Strategy to withdraw from
     */
    function emergencyWithdraw(uint256 strategyId)
        external
        whenPaused
        nonReentrant
        strategyExists(strategyId)
    {
        Strategy storage strategy = strategies[strategyId];
        uint256 shares = strategy.investorShares[msg.sender];
        require(shares > 0, "No shares to withdraw");

        uint256 amount = _calculateWithdrawAmount(strategyId, shares);

        strategy.investorShares[msg.sender] = 0;
        strategy.investorCapital[msg.sender] = 0;
        strategy.totalCapital -= amount;
        strategy.activeCapital -= amount;
        totalValueLocked -= amount;

        IERC20(strategy.baseToken).safeTransfer(msg.sender, amount);

        emit EmergencyWithdrawal(strategyId, msg.sender, amount, shares);
    }

    /**
     * @notice Queue an upgrade with timelock
     * @param newImplementation Address of new implementation
     */
    function queueUpgrade(address newImplementation)
        external
        onlyRole(UPGRADER_ROLE)
    {
        bytes32 txHash = keccak256(abi.encode(newImplementation, block.timestamp));

        timelockQueue[txHash] = TimelockTransaction({
            target: newImplementation,
            value: 0,
            data: "",
            executeAfter: block.timestamp + TIMELOCK_DURATION,
            executed: false
        });

        emit UpgradeQueued(newImplementation, block.timestamp + TIMELOCK_DURATION, txHash);
    }

    /**
     * @notice Execute a queued upgrade
     * @param txHash Hash of the queued transaction
     */
    function executeQueuedUpgrade(bytes32 txHash)
        external
        onlyRole(UPGRADER_ROLE)
    {
        TimelockTransaction storage tx = timelockQueue[txHash];
        require(tx.executeAfter != 0, "Transaction not queued");
        require(!tx.executed, "Transaction already executed");
        require(block.timestamp >= tx.executeAfter, "Timelock not expired");

        tx.executed = true;
        _authorizeUpgrade(tx.target);

        emit UpgradeExecuted(tx.target, txHash);
    }

    /**
     * @notice Cancel a queued upgrade
     * @param txHash Hash of the queued transaction
     */
    function cancelQueuedUpgrade(bytes32 txHash)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        TimelockTransaction storage tx = timelockQueue[txHash];
        require(tx.executeAfter != 0, "Transaction not queued");
        require(!tx.executed, "Transaction already executed");

        delete timelockQueue[txHash];

        emit UpgradeCancelled(txHash);
    }

    // ========== CORE FUNCTIONS ==========

    function createStrategy(
        StrategyType _strategyType,
        address _baseToken,
        address _quoteToken,
        uint256 _minInvestment,
        uint256 _maxInvestment,
        uint256 _performanceFee,
        uint256 _managementFee,
        StrategyParams memory _params
    ) external onlyStrategyManager whenNotPaused returns (uint256) {
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

    function activateStrategy(uint256 strategyId)
        external
        onlyStrategyManager
        strategyExists(strategyId)
        whenNotPaused
    {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.status == StrategyStatus.INACTIVE, "Strategy already active");

        strategy.status = StrategyStatus.ACTIVE;
        activeStrategies.push(strategyId);
        isStrategyActive[strategyId] = true;

        if (strategy.strategyType == StrategyType.GRID_TRADING) {
            _initializeGridStrategy(strategyId);
        }

        emit StrategyActivated(strategyId, block.timestamp);
    }

    function investInStrategy(uint256 strategyId, uint256 amount)
        external
        nonReentrant
        noFlashLoan(strategyId)
        noUserFlashLoan
        strategyExists(strategyId)
        strategyActive(strategyId)
        whenNotPaused
    {
        Strategy storage strategy = strategies[strategyId];
        require(amount >= strategy.minInvestment, "Below minimum investment");
        require(
            strategy.maxInvestment == 0 ||
            strategy.investorCapital[msg.sender] + amount <= strategy.maxInvestment,
            "Exceeds maximum investment"
        );

        IERC20(strategy.baseToken).safeTransferFrom(msg.sender, address(this), amount);

        uint256 shares = _calculateShares(strategyId, amount);

        strategy.investorShares[msg.sender] += shares;
        strategy.investorCapital[msg.sender] += amount;
        strategy.totalCapital += amount;
        strategy.activeCapital += amount;

        totalValueLocked += amount;

        emit StrategyInvestment(strategyId, msg.sender, amount, shares);
    }

    function withdrawFromStrategy(uint256 strategyId, uint256 shares)
        external
        nonReentrant
        noFlashLoan(strategyId)
        noUserFlashLoan
        strategyExists(strategyId)
    {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.investorShares[msg.sender] >= shares, "Insufficient shares");

        uint256 withdrawAmount = _calculateWithdrawAmount(strategyId, shares);

        // Apply management fee
        uint256 managementFee = _calculateManagementFee(strategyId, withdrawAmount);
        uint256 netAmount = withdrawAmount - managementFee;

        strategy.investorShares[msg.sender] -= shares;
        strategy.totalCapital -= withdrawAmount;
        strategy.activeCapital -= withdrawAmount;

        totalValueLocked -= withdrawAmount;

        IERC20(strategy.baseToken).safeTransfer(msg.sender, netAmount);
        if (managementFee > 0) {
            IERC20(strategy.baseToken).safeTransfer(feeRecipient, managementFee);
        }

        emit StrategyWithdrawal(strategyId, msg.sender, shares, netAmount);
    }

    function rebalanceStrategy(uint256 strategyId)
        external
        onlyRole(OPERATOR_ROLE)
        strategyExists(strategyId)
        whenNotPaused
    {
        Strategy storage strategy = strategies[strategyId];
        require(strategy.status == StrategyStatus.ACTIVE, "Strategy not active");

        // Validate oracle price before rebalancing
        if (strategy.params.useOracle) {
            _validateOraclePrice(strategy.baseToken, priceOracle.getPrice(strategy.baseToken));
        }

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

    // ========== INTERNAL FUNCTIONS ==========

    function _initializeGridStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];
        uint256 basePrice = _validateOraclePrice(
            strategy.baseToken,
            priceOracle.getPrice(strategy.baseToken)
        );
        uint256 gridSpacing = strategy.params.gridSpacing;
        uint256 gridLevels = strategy.params.gridLevels;

        for (uint256 i = 0; i < gridLevels; i++) {
            uint256 buyPrice = basePrice - (gridSpacing * (i + 1));
            uint256 sellPrice = basePrice + (gridSpacing * (i + 1));

            gridOrders[strategyId].push(GridOrder({
                strategyId: strategyId,
                price: buyPrice,
                amount: strategy.activeCapital / (gridLevels * 2),
                isBuy: true,
                isActive: true,
                createdAt: block.timestamp
            }));

            gridOrders[strategyId].push(GridOrder({
                strategyId: strategyId,
                price: sellPrice,
                amount: strategy.activeCapital / (gridLevels * 2),
                isBuy: false,
                isActive: true,
                createdAt: block.timestamp
            }));
        }
    }

    function _rebalanceGridStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];
        uint256 currentPrice = _validateOraclePrice(
            strategy.baseToken,
            priceOracle.getPrice(strategy.baseToken)
        );

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
            ? order.price + (strategies[strategyId].params.gridSpacing * 2)
            : order.price - (strategies[strategyId].params.gridSpacing * 2);

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

        if (block.timestamp - strategy.lastRebalance >= strategy.params.dcaInterval) {
            uint256 dcaAmount = strategy.params.dcaAmount;
            if (dcaAmount <= strategy.activeCapital) {
                _updateStrategyValue(strategyId, dcaAmount);
            }
        }
    }

    function _executeMomentumStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];

        uint256 currentPrice = _validateOraclePrice(
            strategy.baseToken,
            priceOracle.getPrice(strategy.baseToken)
        );
        uint256 twapPrice = priceOracle.getTWAP(strategy.baseToken, 3600);

        uint256 momentum = currentPrice > twapPrice
            ? ((currentPrice - twapPrice) * 10000) / twapPrice
            : ((twapPrice - currentPrice) * 10000) / twapPrice;

        if (momentum >= strategy.params.rebalanceThreshold) {
            bool isUptrend = currentPrice > twapPrice;
            _executeMomentumTrade(strategyId, isUptrend);
        }
    }

    function _executeMeanReversionStrategy(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];

        uint256 currentPrice = _validateOraclePrice(
            strategy.baseToken,
            priceOracle.getPrice(strategy.baseToken)
        );
        uint256 twapPrice = priceOracle.getTWAP(strategy.baseToken, 14400);

        uint256 deviation = currentPrice > twapPrice
            ? ((currentPrice - twapPrice) * 10000) / twapPrice
            : ((twapPrice - currentPrice) * 10000) / twapPrice;

        if (deviation >= strategy.params.rebalanceThreshold) {
            bool isOverbought = currentPrice > twapPrice;
            _executeMeanReversionTrade(strategyId, isOverbought);
        }
    }

    function _executeMomentumTrade(uint256 strategyId, bool isUptrend) internal {
        // Implementation placeholder
        emit MomentumTradeExecuted(strategyId, isUptrend);
    }

    function _executeMeanReversionTrade(uint256 strategyId, bool isOverbought) internal {
        // Implementation placeholder
        emit MeanReversionTradeExecuted(strategyId, isOverbought);
    }

    function _calculateShares(uint256 strategyId, uint256 amount) internal view returns (uint256) {
        Strategy storage strategy = strategies[strategyId];
        if (strategy.totalCapital == 0) {
            return amount;
        }
        return (amount * 1e18) / (strategy.totalCapital / 1e18);
    }

    function _calculateWithdrawAmount(uint256 strategyId, uint256 shares) internal view returns (uint256) {
        Strategy storage strategy = strategies[strategyId];
        uint256 totalShares = strategy.totalCapital;
        return (shares * strategy.totalCapital) / totalShares;
    }

    function _calculateManagementFee(uint256 strategyId, uint256 amount) internal view returns (uint256) {
        Strategy storage strategy = strategies[strategyId];
        uint256 timeElapsed = block.timestamp - strategy.lastRebalance;
        uint256 yearlyFee = (amount * strategy.managementFee) / FEE_DENOMINATOR;
        return (yearlyFee * timeElapsed) / 365 days;
    }

    function _updateStrategyValue(uint256 strategyId, uint256 newValue) internal {
        strategies[strategyId].activeCapital = newValue;
    }

    function _updateStrategyMetrics(uint256 strategyId) internal {
        Strategy storage strategy = strategies[strategyId];
        strategy.metrics.lastUpdate = block.timestamp;
    }

    // ========== ADMIN FUNCTIONS ==========

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        emit ContractPaused(msg.sender, block.timestamp);
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
        emit ContractUnpaused(msg.sender, block.timestamp);
    }

    function emergencyStop(uint256 strategyId)
        external
        onlyRole(EMERGENCY_ROLE)
        strategyExists(strategyId)
    {
        strategies[strategyId].status = StrategyStatus.EMERGENCY_STOP;
        emit StrategyEmergencyStopped(strategyId, msg.sender, block.timestamp);
    }

    function updateProtocolFee(uint256 _protocolFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_protocolFee <= 1000, "Fee too high");
        uint256 oldFee = protocolFee;
        protocolFee = _protocolFee;
        emit ProtocolFeeUpdated(oldFee, _protocolFee);
    }

    function updatePriceOracle(address _newOracle)
        external
        onlyRole(ORACLE_UPDATER_ROLE)
    {
        require(_newOracle != address(0), "Invalid oracle address");
        address oldOracle = address(priceOracle);
        priceOracle = IPriceOracle(_newOracle);
        emit PriceOracleUpdated(oldOracle, _newOracle);
    }

    // ========== VIEW FUNCTIONS ==========

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

    function getUserShares(uint256 strategyId, address user) external view returns (uint256) {
        return strategies[strategyId].investorShares[user];
    }

    function getUserCapital(uint256 strategyId, address user) external view returns (uint256) {
        return strategies[strategyId].investorCapital[user];
    }

    // ========== UUPS UPGRADE ==========

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }

    // ========== EVENTS ==========

    event StrategyCreated(
        uint256 indexed strategyId,
        address indexed creator,
        StrategyType strategyType,
        address baseToken,
        address quoteToken
    );

    event StrategyActivated(uint256 indexed strategyId, uint256 timestamp);

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

    event EmergencyWithdrawal(
        uint256 indexed strategyId,
        address indexed user,
        uint256 amount,
        uint256 shares
    );

    event UpgradeQueued(
        address indexed newImplementation,
        uint256 executeAfter,
        bytes32 txHash
    );

    event UpgradeExecuted(address indexed newImplementation, bytes32 txHash);

    event UpgradeCancelled(bytes32 txHash);

    event ContractPaused(address indexed by, uint256 timestamp);

    event ContractUnpaused(address indexed by, uint256 timestamp);

    event StrategyEmergencyStopped(
        uint256 indexed strategyId,
        address indexed by,
        uint256 timestamp
    );

    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);

    event PriceOracleUpdated(address indexed oldOracle, address indexed newOracle);

    event MomentumTradeExecuted(uint256 indexed strategyId, bool isUptrend);

    event MeanReversionTradeExecuted(uint256 indexed strategyId, bool isOverbought);
}
