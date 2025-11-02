// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDEXRouter.sol";
import "./interfaces/IPriceOracle.sol";

contract TradingBot is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum StrategyType {
        GRID,
        DCA,
        MOMENTUM,
        MEAN_REVERSION,
        ARBITRAGE,
        MARKET_MAKING,
        SCALPING,
        BREAKOUT
    }

    enum OrderType { BUY, SELL }
    enum BotStatus { INACTIVE, ACTIVE, PAUSED, STOPPED }

    struct TradingStrategy {
        StrategyType strategyType;
        address baseToken;
        address quoteToken;
        uint256 maxInvestment;
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 targetProfit;
        uint256 stopLoss;
        uint256 timeframe;
        bool isActive;
        mapping(string => uint256) parameters;
    }

    struct GridStrategy {
        uint256 gridLevels;
        uint256 gridSpacing;
        uint256 upperPrice;
        uint256 lowerPrice;
        uint256 totalInvestment;
        uint256[] buyLevels;
        uint256[] sellLevels;
        bool[] levelExecuted;
    }

    struct DCAStrategy {
        uint256 interval;
        uint256 amountPerOrder;
        uint256 totalOrders;
        uint256 executedOrders;
        uint256 lastExecutionTime;
        uint256 targetPrice;
        bool buyOnlyDown;
    }

    struct MomentumStrategy {
        uint256 lookbackPeriod;
        uint256 momentumThreshold;
        uint256 rsiPeriod;
        uint256 rsiOverbought;
        uint256 rsiOversold;
        bool followTrend;
    }

    struct ArbitrageStrategy {
        address[] exchanges;
        uint256 minPriceDifference;
        uint256 maxSlippage;
        uint256 gasLimit;
        bool crossExchange;
    }

    struct Order {
        uint256 id;
        address user;
        OrderType orderType;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 price;
        uint256 timestamp;
        uint256 strategyId;
        bool executed;
        bool cancelled;
    }

    struct BotConfiguration {
        uint256 id;
        address owner;
        StrategyType strategy;
        BotStatus status;
        uint256 totalInvested;
        uint256 currentPnL;
        uint256 totalTrades;
        uint256 successfulTrades;
        uint256 createdAt;
        uint256 lastTradeAt;
    }

    struct PerformanceMetrics {
        uint256 totalReturn;
        uint256 sharpeRatio;
        uint256 maxDrawdown;
        uint256 winRate;
        uint256 avgTradeProfit;
        uint256 totalFees;
        uint256[] dailyReturns;
    }

    // State variables
    IDEXRouter public dexRouter;
    IPriceOracle public priceOracle;

    mapping(uint256 => TradingStrategy) public strategies;
    mapping(uint256 => GridStrategy) public gridStrategies;
    mapping(uint256 => DCAStrategy) public dcaStrategies;
    mapping(uint256 => MomentumStrategy) public momentumStrategies;
    mapping(uint256 => ArbitrageStrategy) public arbitrageStrategies;

    mapping(uint256 => BotConfiguration) public bots;
    mapping(address => uint256[]) public userBots;
    mapping(uint256 => Order[]) public botOrders;
    mapping(uint256 => PerformanceMetrics) public botPerformance;

    uint256 public nextStrategyId = 1;
    uint256 public nextBotId = 1;
    uint256 public nextOrderId = 1;

    uint256 public constant MAX_BOTS_PER_USER = 50;
    uint256 public constant MAX_SLIPPAGE = 1000; // 10%
    uint256 public constant MIN_TRADE_INTERVAL = 300; // 5 minutes

    // Fee structure
    uint256 public performanceFee = 200; // 2%
    uint256 public managementFee = 50; // 0.5% annually
    address public feeRecipient;

    // Events
    event StrategyCreated(uint256 indexed strategyId, StrategyType strategyType, address creator);
    event BotCreated(uint256 indexed botId, address indexed owner, uint256 strategyId);
    event BotStatusChanged(uint256 indexed botId, BotStatus oldStatus, BotStatus newStatus);
    event OrderExecuted(uint256 indexed orderId, uint256 indexed botId, OrderType orderType, uint256 amountIn, uint256 amountOut);
    event ProfitRealized(uint256 indexed botId, uint256 profit, uint256 fee);
    event EmergencyStop(uint256 indexed botId, string reason);

    modifier onlyBotOwner(uint256 botId) {
        require(bots[botId].owner == msg.sender, "Not bot owner");
        _;
    }

    modifier validStrategy(uint256 strategyId) {
        require(strategies[strategyId].isActive, "Invalid strategy");
        _;
    }

    constructor(
        address _dexRouter,
        address _priceOracle,
        address _feeRecipient
    ) {
        dexRouter = IDEXRouter(_dexRouter);
        priceOracle = IPriceOracle(_priceOracle);
        feeRecipient = _feeRecipient;
    }

    // Strategy creation functions
    function createGridStrategy(
        address baseToken,
        address quoteToken,
        uint256 maxInvestment,
        uint256 gridLevels,
        uint256 upperPrice,
        uint256 lowerPrice
    ) external returns (uint256) {
        require(gridLevels >= 3 && gridLevels <= 50, "Invalid grid levels");
        require(upperPrice > lowerPrice, "Invalid price range");

        uint256 strategyId = nextStrategyId++;

        TradingStrategy storage strategy = strategies[strategyId];
        strategy.strategyType = StrategyType.GRID;
        strategy.baseToken = baseToken;
        strategy.quoteToken = quoteToken;
        strategy.maxInvestment = maxInvestment;
        strategy.isActive = true;

        GridStrategy storage gridStrategy = gridStrategies[strategyId];
        gridStrategy.gridLevels = gridLevels;
        gridStrategy.upperPrice = upperPrice;
        gridStrategy.lowerPrice = lowerPrice;
        gridStrategy.gridSpacing = (upperPrice - lowerPrice) / (gridLevels - 1);

        // Initialize grid levels
        gridStrategy.buyLevels = new uint256[](gridLevels);
        gridStrategy.sellLevels = new uint256[](gridLevels);
        gridStrategy.levelExecuted = new bool[](gridLevels);

        for (uint256 i = 0; i < gridLevels; i++) {
            gridStrategy.buyLevels[i] = lowerPrice + (i * gridStrategy.gridSpacing);
            gridStrategy.sellLevels[i] = gridStrategy.buyLevels[i] + gridStrategy.gridSpacing;
        }

        emit StrategyCreated(strategyId, StrategyType.GRID, msg.sender);
        return strategyId;
    }

    function createDCAStrategy(
        address baseToken,
        address quoteToken,
        uint256 interval,
        uint256 amountPerOrder,
        uint256 totalOrders,
        uint256 targetPrice
    ) external returns (uint256) {
        require(interval >= MIN_TRADE_INTERVAL, "Interval too short");
        require(totalOrders > 0 && totalOrders <= 1000, "Invalid order count");

        uint256 strategyId = nextStrategyId++;

        TradingStrategy storage strategy = strategies[strategyId];
        strategy.strategyType = StrategyType.DCA;
        strategy.baseToken = baseToken;
        strategy.quoteToken = quoteToken;
        strategy.maxInvestment = amountPerOrder * totalOrders;
        strategy.isActive = true;

        DCAStrategy storage dcaStrategy = dcaStrategies[strategyId];
        dcaStrategy.interval = interval;
        dcaStrategy.amountPerOrder = amountPerOrder;
        dcaStrategy.totalOrders = totalOrders;
        dcaStrategy.targetPrice = targetPrice;

        emit StrategyCreated(strategyId, StrategyType.DCA, msg.sender);
        return strategyId;
    }

    function createMomentumStrategy(
        address baseToken,
        address quoteToken,
        uint256 maxInvestment,
        uint256 lookbackPeriod,
        uint256 momentumThreshold,
        bool followTrend
    ) external returns (uint256) {
        require(lookbackPeriod >= 1 hours && lookbackPeriod <= 7 days, "Invalid lookback period");

        uint256 strategyId = nextStrategyId++;

        TradingStrategy storage strategy = strategies[strategyId];
        strategy.strategyType = StrategyType.MOMENTUM;
        strategy.baseToken = baseToken;
        strategy.quoteToken = quoteToken;
        strategy.maxInvestment = maxInvestment;
        strategy.isActive = true;

        MomentumStrategy storage momentumStrategy = momentumStrategies[strategyId];
        momentumStrategy.lookbackPeriod = lookbackPeriod;
        momentumStrategy.momentumThreshold = momentumThreshold;
        momentumStrategy.followTrend = followTrend;
        momentumStrategy.rsiPeriod = 14;
        momentumStrategy.rsiOverbought = 70;
        momentumStrategy.rsiOversold = 30;

        emit StrategyCreated(strategyId, StrategyType.MOMENTUM, msg.sender);
        return strategyId;
    }

    // Bot management functions
    function createBot(uint256 strategyId) external validStrategy(strategyId) returns (uint256) {
        require(userBots[msg.sender].length < MAX_BOTS_PER_USER, "Max bots reached");

        uint256 botId = nextBotId++;

        BotConfiguration storage bot = bots[botId];
        bot.id = botId;
        bot.owner = msg.sender;
        bot.strategy = strategies[strategyId].strategyType;
        bot.status = BotStatus.INACTIVE;
        bot.createdAt = block.timestamp;

        userBots[msg.sender].push(botId);

        emit BotCreated(botId, msg.sender, strategyId);
        return botId;
    }

    function startBot(uint256 botId) external onlyBotOwner(botId) {
        BotConfiguration storage bot = bots[botId];
        require(bot.status == BotStatus.INACTIVE || bot.status == BotStatus.PAUSED, "Invalid status");

        BotStatus oldStatus = bot.status;
        bot.status = BotStatus.ACTIVE;

        emit BotStatusChanged(botId, oldStatus, BotStatus.ACTIVE);
    }

    function pauseBot(uint256 botId) external onlyBotOwner(botId) {
        BotConfiguration storage bot = bots[botId];
        require(bot.status == BotStatus.ACTIVE, "Bot not active");

        bot.status = BotStatus.PAUSED;
        emit BotStatusChanged(botId, BotStatus.ACTIVE, BotStatus.PAUSED);
    }

    function stopBot(uint256 botId) external onlyBotOwner(botId) {
        BotConfiguration storage bot = bots[botId];
        require(bot.status != BotStatus.STOPPED, "Already stopped");

        BotStatus oldStatus = bot.status;
        bot.status = BotStatus.STOPPED;

        emit BotStatusChanged(botId, oldStatus, BotStatus.STOPPED);
    }

    // Trading execution functions
    function executeGridTrade(uint256 botId, uint256 strategyId) external {
        require(bots[botId].status == BotStatus.ACTIVE, "Bot not active");

        GridStrategy storage grid = gridStrategies[strategyId];
        TradingStrategy storage strategy = strategies[strategyId];

        uint256 currentPrice = priceOracle.getPrice(strategy.baseToken, strategy.quoteToken);

        // Find appropriate grid level
        for (uint256 i = 0; i < grid.gridLevels; i++) {
            if (!grid.levelExecuted[i]) {
                if (currentPrice <= grid.buyLevels[i]) {
                    // Execute buy order
                    executeBuyOrder(botId, strategyId, grid.buyLevels[i], currentPrice);
                    grid.levelExecuted[i] = true;
                    break;
                } else if (currentPrice >= grid.sellLevels[i] && i > 0) {
                    // Execute sell order
                    executeSellOrder(botId, strategyId, grid.sellLevels[i], currentPrice);
                    grid.levelExecuted[i] = true;
                    break;
                }
            }
        }
    }

    function executeDCATrade(uint256 botId, uint256 strategyId) external {
        require(bots[botId].status == BotStatus.ACTIVE, "Bot not active");

        DCAStrategy storage dca = dcaStrategies[strategyId];
        require(dca.executedOrders < dca.totalOrders, "DCA completed");
        require(
            block.timestamp >= dca.lastExecutionTime + dca.interval,
            "Too early for next order"
        );

        TradingStrategy storage strategy = strategies[strategyId];
        uint256 currentPrice = priceOracle.getPrice(strategy.baseToken, strategy.quoteToken);

        // Execute DCA buy order
        if (!dca.buyOnlyDown || currentPrice < dca.targetPrice) {
            executeBuyOrder(botId, strategyId, currentPrice, currentPrice);
            dca.executedOrders++;
            dca.lastExecutionTime = block.timestamp;
        }
    }

    function executeMomentumTrade(uint256 botId, uint256 strategyId) external {
        require(bots[botId].status == BotStatus.ACTIVE, "Bot not active");

        MomentumStrategy storage momentum = momentumStrategies[strategyId];
        TradingStrategy storage strategy = strategies[strategyId];

        uint256 currentPrice = priceOracle.getPrice(strategy.baseToken, strategy.quoteToken);

        // Calculate momentum indicators
        (uint256 priceChange, bool isUptrend) = calculateMomentum(
            strategy.baseToken,
            strategy.quoteToken,
            momentum.lookbackPeriod
        );

        uint256 rsi = calculateRSI(strategy.baseToken, strategy.quoteToken, momentum.rsiPeriod);

        // Execute trades based on momentum signals
        if (momentum.followTrend) {
            if (isUptrend && rsi < momentum.rsiOverbought && priceChange > momentum.momentumThreshold) {
                executeBuyOrder(botId, strategyId, currentPrice, currentPrice);
            } else if (!isUptrend && rsi > momentum.rsiOversold && priceChange > momentum.momentumThreshold) {
                executeSellOrder(botId, strategyId, currentPrice, currentPrice);
            }
        }
    }

    // Internal execution functions
    function executeBuyOrder(
        uint256 botId,
        uint256 strategyId,
        uint256 targetPrice,
        uint256 currentPrice
    ) internal {
        TradingStrategy storage strategy = strategies[strategyId];

        uint256 slippage = calculateSlippage(targetPrice, currentPrice);
        require(slippage <= MAX_SLIPPAGE, "Slippage too high");

        uint256 amountIn = calculateTradeAmount(botId, strategyId, true);

        // Execute trade through DEX
        address[] memory path = new address[](2);
        path[0] = strategy.quoteToken;
        path[1] = strategy.baseToken;

        uint256[] memory amounts = dexRouter.swapExactTokensForTokens(
            amountIn,
            0, // Accept any amount of base tokens
            path,
            address(this),
            block.timestamp + 300
        );

        // Record order
        recordOrder(botId, strategyId, OrderType.BUY, amountIn, amounts[1], currentPrice);
        updateBotMetrics(botId, amountIn, amounts[1], true);
    }

    function executeSellOrder(
        uint256 botId,
        uint256 strategyId,
        uint256 targetPrice,
        uint256 currentPrice
    ) internal {
        TradingStrategy storage strategy = strategies[strategyId];

        uint256 slippage = calculateSlippage(targetPrice, currentPrice);
        require(slippage <= MAX_SLIPPAGE, "Slippage too high");

        uint256 amountIn = calculateTradeAmount(botId, strategyId, false);

        // Execute trade through DEX
        address[] memory path = new address[](2);
        path[0] = strategy.baseToken;
        path[1] = strategy.quoteToken;

        uint256[] memory amounts = dexRouter.swapExactTokensForTokens(
            amountIn,
            0, // Accept any amount of quote tokens
            path,
            address(this),
            block.timestamp + 300
        );

        // Record order
        recordOrder(botId, strategyId, OrderType.SELL, amountIn, amounts[1], currentPrice);
        updateBotMetrics(botId, amounts[1], amountIn, false);
    }

    // Utility functions
    function calculateTradeAmount(
        uint256 botId,
        uint256 strategyId,
        bool isBuy
    ) internal view returns (uint256) {
        TradingStrategy storage strategy = strategies[strategyId];
        BotConfiguration storage bot = bots[botId];

        if (strategy.strategyType == StrategyType.GRID) {
            GridStrategy storage grid = gridStrategies[strategyId];
            return grid.totalInvestment / grid.gridLevels;
        } else if (strategy.strategyType == StrategyType.DCA) {
            DCAStrategy storage dca = dcaStrategies[strategyId];
            return dca.amountPerOrder;
        } else {
            // For momentum and other strategies, use percentage of total investment
            return (bot.totalInvested * 10) / 100; // 10% per trade
        }
    }

    function calculateSlippage(uint256 targetPrice, uint256 currentPrice) internal pure returns (uint256) {
        if (targetPrice == 0) return 0;
        return ((currentPrice > targetPrice ? currentPrice - targetPrice : targetPrice - currentPrice) * 10000) / targetPrice;
    }

    function calculateMomentum(
        address baseToken,
        address quoteToken,
        uint256 lookbackPeriod
    ) internal view returns (uint256 priceChange, bool isUptrend) {
        uint256 currentPrice = priceOracle.getPrice(baseToken, quoteToken);
        uint256 pastPrice = priceOracle.getHistoricalPrice(baseToken, quoteToken, block.timestamp - lookbackPeriod);

        if (pastPrice == 0) return (0, false);

        if (currentPrice > pastPrice) {
            priceChange = ((currentPrice - pastPrice) * 10000) / pastPrice;
            isUptrend = true;
        } else {
            priceChange = ((pastPrice - currentPrice) * 10000) / pastPrice;
            isUptrend = false;
        }
    }

    function calculateRSI(
        address baseToken,
        address quoteToken,
        uint256 period
    ) internal view returns (uint256) {
        // Simplified RSI calculation - in production, use more sophisticated implementation
        uint256 currentPrice = priceOracle.getPrice(baseToken, quoteToken);
        uint256 pastPrice = priceOracle.getHistoricalPrice(baseToken, quoteToken, block.timestamp - (period * 1 hours));

        if (pastPrice == 0) return 50; // Neutral RSI

        if (currentPrice > pastPrice) {
            return 70; // Simplified: assume overbought when price increased
        } else if (currentPrice < pastPrice) {
            return 30; // Simplified: assume oversold when price decreased
        }

        return 50; // Neutral
    }

    function recordOrder(
        uint256 botId,
        uint256 strategyId,
        OrderType orderType,
        uint256 amountIn,
        uint256 amountOut,
        uint256 price
    ) internal {
        uint256 orderId = nextOrderId++;

        Order memory newOrder = Order({
            id: orderId,
            user: bots[botId].owner,
            orderType: orderType,
            tokenIn: orderType == OrderType.BUY ? strategies[strategyId].quoteToken : strategies[strategyId].baseToken,
            tokenOut: orderType == OrderType.BUY ? strategies[strategyId].baseToken : strategies[strategyId].quoteToken,
            amountIn: amountIn,
            minAmountOut: amountOut,
            price: price,
            timestamp: block.timestamp,
            strategyId: strategyId,
            executed: true,
            cancelled: false
        });

        botOrders[botId].push(newOrder);
        emit OrderExecuted(orderId, botId, orderType, amountIn, amountOut);
    }

    function updateBotMetrics(
        uint256 botId,
        uint256 amountIn,
        uint256 amountOut,
        bool isBuy
    ) internal {
        BotConfiguration storage bot = bots[botId];
        bot.totalTrades++;
        bot.lastTradeAt = block.timestamp;

        // Update PnL calculation (simplified)
        if (isBuy) {
            bot.totalInvested += amountIn;
        } else {
            // Calculate profit/loss on sell
            uint256 profit = amountOut > amountIn ? amountOut - amountIn : 0;
            if (profit > 0) {
                bot.successfulTrades++;
                bot.currentPnL += profit;

                // Charge performance fee
                uint256 fee = (profit * performanceFee) / 10000;
                bot.currentPnL -= fee;

                emit ProfitRealized(botId, profit - fee, fee);
            }
        }
    }

    // View functions
    function getBotOrders(uint256 botId) external view returns (Order[] memory) {
        return botOrders[botId];
    }

    function getUserBots(address user) external view returns (uint256[] memory) {
        return userBots[user];
    }

    function getBotPerformance(uint256 botId) external view returns (PerformanceMetrics memory) {
        return botPerformance[botId];
    }

    // Emergency functions
    function emergencyStopBot(uint256 botId, string calldata reason) external onlyOwner {
        BotConfiguration storage bot = bots[botId];
        bot.status = BotStatus.STOPPED;

        emit EmergencyStop(botId, reason);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // Admin functions
    function setFees(uint256 _performanceFee, uint256 _managementFee) external onlyOwner {
        require(_performanceFee <= 2000, "Fee too high"); // Max 20%
        require(_managementFee <= 1000, "Fee too high"); // Max 10%

        performanceFee = _performanceFee;
        managementFee = _managementFee;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid address");
        feeRecipient = _feeRecipient;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}