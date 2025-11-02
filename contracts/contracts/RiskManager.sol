// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256);
    function getTWAP(address asset, uint256 window) external view returns (uint256);
}

interface IVolatilityOracle {
    function getVolatility(address asset) external view returns (uint256);
    function getCorrelation(address assetA, address assetB) external view returns (int256);
}

contract RiskManager is AccessControl, Pausable, ReentrancyGuard {
    using SafeMath for uint256;

    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    struct RiskParameters {
        uint256 maxLeverage;
        uint256 liquidationThreshold;
        uint256 maintenanceMargin;
        uint256 maxPositionSize;
        uint256 maxPortfolioRisk;
        uint256 correlationLimit;
        uint256 volatilityLimit;
        uint256 concentrationLimit;
        bool enableDynamicMargin;
        bool enableStressTest;
    }

    struct UserRiskProfile {
        uint256 riskScore;
        uint256 maxLeverage;
        uint256 totalExposure;
        uint256 availableMargin;
        uint256 usedMargin;
        uint256 portfolioValue;
        uint256 unrealizedPnL;
        uint256 dailyLoss;
        uint256 weeklyLoss;
        uint256 monthlyLoss;
        uint256 maxDrawdown;
        bool isLiquidationEligible;
        uint256 lastUpdate;
    }

    struct Position {
        address user;
        address asset;
        uint256 size;
        uint256 notional;
        uint256 entryPrice;
        uint256 currentPrice;
        uint256 unrealizedPnL;
        uint256 requiredMargin;
        uint256 leverage;
        bool isLong;
        uint256 openTime;
        uint256 lastUpdate;
    }

    struct RiskMetrics {
        uint256 var95; // Value at Risk 95%
        uint256 var99; // Value at Risk 99%
        uint256 expectedShortfall;
        uint256 beta;
        uint256 sharpeRatio;
        uint256 sortinoRatio;
        uint256 maxDrawdown;
        uint256 calmarRatio;
        uint256 portfolioVolatility;
        uint256 correlation;
        uint256 lastCalculation;
    }

    struct LiquidationEvent {
        address user;
        address asset;
        uint256 positionSize;
        uint256 liquidationPrice;
        uint256 timestamp;
        uint256 liquidatorReward;
        bool executed;
    }

    struct MarketConditions {
        uint256 overallVolatility;
        uint256 marketTrend;
        uint256 liquidityIndex;
        uint256 fearGreedIndex;
        bool isHighRiskPeriod;
        uint256 lastUpdate;
    }

    RiskParameters public globalRiskParams;
    MarketConditions public marketConditions;

    mapping(address => UserRiskProfile) public userRiskProfiles;
    mapping(address => mapping(address => Position)) public positions; // user => asset => position
    mapping(address => RiskMetrics) public userRiskMetrics;
    mapping(address => RiskParameters) public userRiskParameters;
    mapping(bytes32 => LiquidationEvent) public liquidationEvents;

    mapping(address => address[]) public userAssets;
    mapping(address => uint256) public assetRiskWeights;
    mapping(address => uint256) public assetVolatility;
    mapping(address => bool) public blacklistedAssets;

    IPriceOracle public priceOracle;
    IVolatilityOracle public volatilityOracle;

    uint256 public constant PRECISION = 1e18;
    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant LIQUIDATION_PENALTY = 500; // 5%
    uint256 public constant LIQUIDATOR_REWARD = 200; // 2%
    uint256 public constant INSURANCE_FUND_SHARE = 300; // 3%

    address public insuranceFund;
    uint256 public totalLiquidations;
    uint256 public totalLiquidationVolume;

    event RiskParametersUpdated(address indexed user, RiskParameters params);
    event PositionOpened(address indexed user, address indexed asset, uint256 size, uint256 leverage);
    event PositionClosed(address indexed user, address indexed asset, uint256 pnl);
    event LiquidationTriggered(address indexed user, address indexed asset, uint256 liquidationPrice);
    event LiquidationExecuted(bytes32 indexed eventId, address indexed liquidator, uint256 reward);
    event RiskLimitViolation(address indexed user, string riskType, uint256 currentValue, uint256 limit);
    event EmergencyStop(address indexed user, string reason);

    modifier onlyRiskAdmin() {
        require(hasRole(RISK_ADMIN_ROLE, msg.sender), "Not risk admin");
        _;
    }

    modifier onlyLiquidator() {
        require(hasRole(LIQUIDATOR_ROLE, msg.sender), "Not liquidator");
        _;
    }

    modifier validAsset(address asset) {
        require(!blacklistedAssets[asset], "Asset blacklisted");
        _;
    }

    constructor(
        address _priceOracle,
        address _volatilityOracle,
        address _insuranceFund
    ) {
        require(_priceOracle != address(0), "Invalid price oracle");
        require(_volatilityOracle != address(0), "Invalid volatility oracle");
        require(_insuranceFund != address(0), "Invalid insurance fund");

        priceOracle = IPriceOracle(_priceOracle);
        volatilityOracle = IVolatilityOracle(_volatilityOracle);
        insuranceFund = _insuranceFund;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RISK_ADMIN_ROLE, msg.sender);
        _setupRole(EMERGENCY_ROLE, msg.sender);

        _initializeGlobalRiskParameters();
    }

    function _initializeGlobalRiskParameters() internal {
        globalRiskParams = RiskParameters({
            maxLeverage: 10 * PRECISION, // 10x
            liquidationThreshold: 8000, // 80%
            maintenanceMargin: 500, // 5%
            maxPositionSize: 1000000 * PRECISION, // 1M USD
            maxPortfolioRisk: 2000, // 20%
            correlationLimit: 7000, // 70%
            volatilityLimit: 5000, // 50%
            concentrationLimit: 3000, // 30%
            enableDynamicMargin: true,
            enableStressTest: true
        });
    }

    function openPosition(
        address user,
        address asset,
        uint256 size,
        uint256 leverage,
        bool isLong
    ) external validAsset(asset) whenNotPaused returns (bool) {
        require(size > 0, "Invalid size");
        require(leverage > 0 && leverage <= globalRiskParams.maxLeverage, "Invalid leverage");

        _updateUserRiskProfile(user);

        RiskParameters memory userParams = _getUserRiskParameters(user);
        require(leverage <= userParams.maxLeverage, "Leverage exceeds user limit");

        uint256 currentPrice = priceOracle.getPrice(asset);
        uint256 notional = size.mul(currentPrice).div(PRECISION);
        uint256 requiredMargin = notional.div(leverage);

        UserRiskProfile storage profile = userRiskProfiles[user];
        require(profile.availableMargin >= requiredMargin, "Insufficient margin");

        // Check position size limits
        require(notional <= userParams.maxPositionSize, "Position size exceeds limit");

        // Check portfolio concentration
        uint256 newExposure = profile.totalExposure.add(notional);
        require(
            notional.mul(10000).div(newExposure) <= userParams.concentrationLimit,
            "Concentration limit exceeded"
        );

        // Check correlation limits if enabled
        if (userParams.correlationLimit > 0) {
            require(_checkCorrelationLimits(user, asset, notional), "Correlation limit exceeded");
        }

        // Create position
        positions[user][asset] = Position({
            user: user,
            asset: asset,
            size: size,
            notional: notional,
            entryPrice: currentPrice,
            currentPrice: currentPrice,
            unrealizedPnL: 0,
            requiredMargin: requiredMargin,
            leverage: leverage,
            isLong: isLong,
            openTime: block.timestamp,
            lastUpdate: block.timestamp
        });

        // Update user profile
        profile.totalExposure = newExposure;
        profile.usedMargin = profile.usedMargin.add(requiredMargin);
        profile.availableMargin = profile.availableMargin.sub(requiredMargin);

        // Add asset to user's asset list
        bool assetExists = false;
        for (uint i = 0; i < userAssets[user].length; i++) {
            if (userAssets[user][i] == asset) {
                assetExists = true;
                break;
            }
        }
        if (!assetExists) {
            userAssets[user].push(asset);
        }

        emit PositionOpened(user, asset, size, leverage);
        return true;
    }

    function closePosition(address user, address asset) external whenNotPaused returns (uint256) {
        Position storage position = positions[user][asset];
        require(position.size > 0, "No position to close");

        _updatePositionPnL(user, asset);

        uint256 pnl = position.unrealizedPnL;
        uint256 requiredMargin = position.requiredMargin;

        // Update user profile
        UserRiskProfile storage profile = userRiskProfiles[user];
        profile.totalExposure = profile.totalExposure.sub(position.notional);
        profile.usedMargin = profile.usedMargin.sub(requiredMargin);
        profile.availableMargin = profile.availableMargin.add(requiredMargin);

        // Apply PnL to portfolio
        if (pnl > 0) {
            profile.portfolioValue = profile.portfolioValue.add(pnl);
        } else {
            profile.portfolioValue = profile.portfolioValue.sub(uint256(-int256(pnl)));
        }

        // Remove position
        delete positions[user][asset];

        emit PositionClosed(user, asset, pnl);
        return pnl;
    }

    function liquidatePosition(bytes32 eventId) external onlyLiquidator nonReentrant {
        LiquidationEvent storage liquidation = liquidationEvents[eventId];
        require(!liquidation.executed, "Already executed");
        require(block.timestamp <= liquidation.timestamp.add(3600), "Liquidation expired"); // 1 hour

        address user = liquidation.user;
        address asset = liquidation.asset;

        Position storage position = positions[user][asset];
        require(position.size > 0, "Position not found");

        _updatePositionPnL(user, asset);

        // Verify liquidation is still valid
        require(_isLiquidationEligible(user, asset), "Liquidation no longer valid");

        uint256 positionValue = position.notional;
        uint256 penalty = positionValue.mul(LIQUIDATION_PENALTY).div(10000);
        uint256 liquidatorReward = positionValue.mul(LIQUIDATOR_REWARD).div(10000);
        uint256 insuranceShare = positionValue.mul(INSURANCE_FUND_SHARE).div(10000);

        // Close position
        UserRiskProfile storage profile = userRiskProfiles[user];
        profile.totalExposure = profile.totalExposure.sub(position.notional);
        profile.usedMargin = profile.usedMargin.sub(position.requiredMargin);

        // Apply liquidation penalty
        profile.portfolioValue = profile.portfolioValue.sub(penalty);

        // Transfer rewards
        IERC20(asset).transfer(msg.sender, liquidatorReward);
        IERC20(asset).transfer(insuranceFund, insuranceShare);

        // Update statistics
        totalLiquidations++;
        totalLiquidationVolume = totalLiquidationVolume.add(positionValue);

        liquidation.executed = true;
        liquidation.liquidatorReward = liquidatorReward;

        delete positions[user][asset];

        emit LiquidationExecuted(eventId, msg.sender, liquidatorReward);
    }

    function checkLiquidations() external view returns (bytes32[] memory) {
        // This would typically iterate through positions to find liquidation candidates
        // Implementation simplified for brevity
        bytes32[] memory candidates = new bytes32[](0);
        return candidates;
    }

    function calculateRiskMetrics(address user) external view returns (RiskMetrics memory) {
        UserRiskProfile memory profile = userRiskProfiles[user];
        RiskMetrics memory metrics;

        if (profile.portfolioValue == 0) {
            return metrics;
        }

        // Calculate VaR using historical simulation method
        metrics.var95 = _calculateVaR(user, 95);
        metrics.var99 = _calculateVaR(user, 99);
        metrics.expectedShortfall = _calculateExpectedShortfall(user);
        metrics.portfolioVolatility = _calculatePortfolioVolatility(user);
        metrics.maxDrawdown = profile.maxDrawdown;
        metrics.lastCalculation = block.timestamp;

        return metrics;
    }

    function setUserRiskParameters(
        address user,
        RiskParameters memory params
    ) external onlyRiskAdmin {
        require(params.maxLeverage <= globalRiskParams.maxLeverage, "Leverage exceeds global limit");
        require(params.liquidationThreshold <= 9000, "Liquidation threshold too high");

        userRiskParameters[user] = params;
        emit RiskParametersUpdated(user, params);
    }

    function updateGlobalRiskParameters(
        RiskParameters memory params
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        globalRiskParams = params;
    }

    function setAssetRiskWeight(address asset, uint256 weight) external onlyRiskAdmin {
        require(weight <= 10000, "Weight too high");
        assetRiskWeights[asset] = weight;
    }

    function blacklistAsset(address asset, bool isBlacklisted) external onlyRiskAdmin {
        blacklistedAssets[asset] = isBlacklisted;
    }

    function emergencyStopUser(address user, string memory reason) external onlyRole(EMERGENCY_ROLE) {
        UserRiskProfile storage profile = userRiskProfiles[user];
        profile.isLiquidationEligible = true;

        // Close all positions for user
        address[] memory assets = userAssets[user];
        for (uint i = 0; i < assets.length; i++) {
            if (positions[user][assets[i]].size > 0) {
                this.closePosition(user, assets[i]);
            }
        }

        emit EmergencyStop(user, reason);
    }

    function _updateUserRiskProfile(address user) internal {
        UserRiskProfile storage profile = userRiskProfiles[user];

        uint256 totalPnL = 0;
        uint256 portfolioValue = 0;

        address[] memory assets = userAssets[user];
        for (uint i = 0; i < assets.length; i++) {
            if (positions[user][assets[i]].size > 0) {
                _updatePositionPnL(user, assets[i]);
                totalPnL = totalPnL.add(positions[user][assets[i]].unrealizedPnL);
                portfolioValue = portfolioValue.add(positions[user][assets[i]].notional);
            }
        }

        profile.unrealizedPnL = totalPnL;
        profile.portfolioValue = portfolioValue;
        profile.lastUpdate = block.timestamp;

        // Check risk limits
        _checkRiskLimits(user);
    }

    function _updatePositionPnL(address user, address asset) internal {
        Position storage position = positions[user][asset];
        if (position.size == 0) return;

        uint256 currentPrice = priceOracle.getPrice(asset);
        position.currentPrice = currentPrice;

        int256 priceDiff = int256(currentPrice) - int256(position.entryPrice);
        if (!position.isLong) {
            priceDiff = -priceDiff;
        }

        position.unrealizedPnL = uint256(int256(position.size) * priceDiff / int256(PRECISION));
        position.lastUpdate = block.timestamp;
    }

    function _checkRiskLimits(address user) internal {
        UserRiskProfile storage profile = userRiskProfiles[user];
        RiskParameters memory params = _getUserRiskParameters(user);

        // Check portfolio risk
        if (profile.totalExposure > 0) {
            uint256 portfolioRisk = profile.unrealizedPnL.mul(10000).div(profile.portfolioValue);
            if (portfolioRisk > params.maxPortfolioRisk) {
                emit RiskLimitViolation(user, "Portfolio Risk", portfolioRisk, params.maxPortfolioRisk);
            }
        }

        // Check for liquidation eligibility
        if (_isLiquidationEligible(user, address(0))) {
            profile.isLiquidationEligible = true;
        }
    }

    function _isLiquidationEligible(address user, address asset) internal view returns (bool) {
        if (asset != address(0)) {
            Position memory position = positions[user][asset];
            if (position.size == 0) return false;

            uint256 marginRatio = position.requiredMargin.mul(10000).div(position.notional.add(position.unrealizedPnL));
            return marginRatio < globalRiskParams.maintenanceMargin;
        }

        UserRiskProfile memory profile = userRiskProfiles[user];
        if (profile.totalExposure == 0) return false;

        uint256 totalMarginRatio = profile.usedMargin.mul(10000).div(profile.portfolioValue);
        return totalMarginRatio > globalRiskParams.liquidationThreshold;
    }

    function _checkCorrelationLimits(address user, address asset, uint256 notional) internal view returns (bool) {
        address[] memory assets = userAssets[user];
        RiskParameters memory params = _getUserRiskParameters(user);

        for (uint i = 0; i < assets.length; i++) {
            if (assets[i] != asset && positions[user][assets[i]].size > 0) {
                int256 correlation = volatilityOracle.getCorrelation(asset, assets[i]);
                if (uint256(correlation) > params.correlationLimit) {
                    uint256 combinedExposure = notional.add(positions[user][assets[i]].notional);
                    uint256 totalExposure = userRiskProfiles[user].totalExposure.add(notional);

                    if (combinedExposure.mul(10000).div(totalExposure) > params.concentrationLimit) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    function _getUserRiskParameters(address user) internal view returns (RiskParameters memory) {
        if (userRiskParameters[user].maxLeverage > 0) {
            return userRiskParameters[user];
        }
        return globalRiskParams;
    }

    function _calculateVaR(address user, uint256 confidence) internal pure returns (uint256) {
        // Simplified VaR calculation - in production, this would use historical data
        return 0;
    }

    function _calculateExpectedShortfall(address user) internal pure returns (uint256) {
        // Expected Shortfall calculation
        return 0;
    }

    function _calculatePortfolioVolatility(address user) internal view returns (uint256) {
        // Portfolio volatility calculation using asset weights and correlations
        return 0;
    }

    function getUserRiskProfile(address user) external view returns (UserRiskProfile memory) {
        return userRiskProfiles[user];
    }

    function getPosition(address user, address asset) external view returns (Position memory) {
        return positions[user][asset];
    }

    function getUserAssets(address user) external view returns (address[] memory) {
        return userAssets[user];
    }

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }
}