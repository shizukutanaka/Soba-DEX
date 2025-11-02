// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AutomationManager
 * @dev Smart contract automation using Chainlink Automation + Gelato Network
 *
 * FEATURES:
 * - Automated limit orders (buy/sell at target price)
 * - DCA (Dollar Cost Averaging) strategies
 * - Liquidity rebalancing
 * - Yield harvesting and compounding
 * - Stop-loss / take-profit automation
 * - Gas-optimized execution
 *
 * CHAINLINK AUTOMATION (formerly Keepers):
 * - Most secure and decentralized
 * - 1,000+ node operators
 * - Used by: Aave, Synthetix, PoolTogether
 * - Gas: User pays for execution
 * - Reliability: 99.99% uptime
 *
 * GELATO NETWORK:
 * - Easiest to integrate
 * - MEV protection built-in
 * - Gasless transactions (1Balance)
 * - Used by: Uniswap, QuickSwap
 * - Fee: 0.1% of transaction value
 *
 * USE CASES:
 * 1. Limit Orders: "Sell 10 ETH when price reaches $3000"
 * 2. DCA: "Buy $100 of ETH every Monday at 10am"
 * 3. Rebalancing: "Keep my portfolio 50% ETH / 50% USDC"
 * 4. Yield Farming: "Harvest and compound rewards daily"
 * 5. Stop-Loss: "Sell if ETH drops below $2500"
 *
 * MARKET STATUS (2025):
 * - Chainlink Automation: 500+ integrations
 * - Gelato: 350+ dApps, $2B+ volume
 * - Keep3r Network: Open market for keepers
 */
contract AutomationManager is ReentrancyGuard, Ownable {
    // Automation types
    enum AutomationType {
        LIMIT_ORDER, // Execute at target price
        DCA, // Dollar cost averaging
        REBALANCE, // Portfolio rebalancing
        HARVEST, // Yield harvesting
        STOP_LOSS, // Stop-loss protection
        TAKE_PROFIT // Take profit target
    }

    // Automation job
    struct AutomationJob {
        uint256 id;
        address owner;
        AutomationType jobType;
        bool active;
        uint256 createdAt;
        uint256 lastExecuted;
        uint256 executionCount;
        bytes jobData; // Encoded parameters
    }

    // Limit order data
    struct LimitOrder {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 targetPrice; // Price in terms of tokenOut
        bool isBuyOrder; // true = buy, false = sell
    }

    // DCA data
    struct DCAStrategy {
        address tokenIn;
        address tokenOut;
        uint256 amountPerExecution;
        uint256 frequency; // Seconds between executions
        uint256 totalBudget;
        uint256 spent;
    }

    // Rebalance data
    struct RebalanceStrategy {
        address[] tokens;
        uint256[] targetPercentages; // Sum must be 100
        uint256 rebalanceThreshold; // Trigger if deviation > threshold
    }

    // Harvest data
    struct HarvestStrategy {
        address[] yieldSources; // Farming contracts
        bool autoCompound;
        uint256 minHarvestAmount; // Don't harvest if below this
    }

    // Stop-loss data
    struct StopLoss {
        address token;
        uint256 amount;
        uint256 stopPrice; // Sell if price drops below this
        address outputToken;
    }

    // Storage
    mapping(uint256 => AutomationJob) public jobs;
    mapping(address => uint256[]) public userJobs;
    uint256 public jobCount;

    // Chainlink Automation
    address public chainlinkRegistry;
    uint256 public chainlinkUpkeepID;

    // Gelato
    address public gelatoOps;
    bytes32 public gelatoTaskId;

    // Price oracle (simplified)
    mapping(address => uint256) public tokenPrices;

    // Events
    event JobCreated(
        uint256 indexed jobId,
        address indexed owner,
        AutomationType jobType
    );

    event JobExecuted(
        uint256 indexed jobId,
        address indexed executor,
        uint256 gasUsed
    );

    event JobCancelled(uint256 indexed jobId, address indexed owner);

    event LimitOrderFilled(
        uint256 indexed jobId,
        uint256 amountIn,
        uint256 amountOut,
        uint256 executionPrice
    );

    event DCAExecuted(
        uint256 indexed jobId,
        uint256 amountIn,
        uint256 amountOut,
        uint256 executionNumber
    );

    event PortfolioRebalanced(
        uint256 indexed jobId,
        address[] tokens,
        uint256[] newBalances
    );

    event YieldHarvested(
        uint256 indexed jobId,
        address[] sources,
        uint256 totalHarvested
    );

    /**
     * @dev Create limit order automation
     * @param tokenIn Token to sell/spend
     * @param tokenOut Token to buy/receive
     * @param amountIn Amount to sell
     * @param targetPrice Target execution price
     * @param isBuyOrder true for buy, false for sell
     */
    function createLimitOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 targetPrice,
        bool isBuyOrder
    ) external returns (uint256 jobId) {
        jobId = jobCount++;

        LimitOrder memory limitOrder = LimitOrder({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            targetPrice: targetPrice,
            isBuyOrder: isBuyOrder
        });

        jobs[jobId] = AutomationJob({
            id: jobId,
            owner: msg.sender,
            jobType: AutomationType.LIMIT_ORDER,
            active: true,
            createdAt: block.timestamp,
            lastExecuted: 0,
            executionCount: 0,
            jobData: abi.encode(limitOrder)
        });

        userJobs[msg.sender].push(jobId);

        emit JobCreated(jobId, msg.sender, AutomationType.LIMIT_ORDER);

        return jobId;
    }

    /**
     * @dev Create DCA strategy automation
     * @param tokenIn Token to spend (e.g., USDC)
     * @param tokenOut Token to buy (e.g., ETH)
     * @param amountPerExecution Amount to spend each time
     * @param frequency Seconds between executions
     * @param totalBudget Total budget for DCA
     */
    function createDCAStrategy(
        address tokenIn,
        address tokenOut,
        uint256 amountPerExecution,
        uint256 frequency,
        uint256 totalBudget
    ) external returns (uint256 jobId) {
        require(frequency >= 1 hours, "Frequency too high");
        require(totalBudget >= amountPerExecution, "Invalid budget");

        jobId = jobCount++;

        DCAStrategy memory dca = DCAStrategy({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountPerExecution: amountPerExecution,
            frequency: frequency,
            totalBudget: totalBudget,
            spent: 0
        });

        jobs[jobId] = AutomationJob({
            id: jobId,
            owner: msg.sender,
            jobType: AutomationType.DCA,
            active: true,
            createdAt: block.timestamp,
            lastExecuted: block.timestamp,
            executionCount: 0,
            jobData: abi.encode(dca)
        });

        userJobs[msg.sender].push(jobId);

        emit JobCreated(jobId, msg.sender, AutomationType.DCA);

        return jobId;
    }

    /**
     * @dev Create portfolio rebalancing automation
     * @param tokens List of tokens in portfolio
     * @param targetPercentages Target allocation percentages (sum = 100)
     * @param rebalanceThreshold Trigger if deviation > threshold
     */
    function createRebalanceStrategy(
        address[] memory tokens,
        uint256[] memory targetPercentages,
        uint256 rebalanceThreshold
    ) external returns (uint256 jobId) {
        require(tokens.length == targetPercentages.length, "Length mismatch");

        uint256 sum = 0;
        for (uint256 i = 0; i < targetPercentages.length; i++) {
            sum += targetPercentages[i];
        }
        require(sum == 100, "Percentages must sum to 100");

        jobId = jobCount++;

        RebalanceStrategy memory rebalance = RebalanceStrategy({
            tokens: tokens,
            targetPercentages: targetPercentages,
            rebalanceThreshold: rebalanceThreshold
        });

        jobs[jobId] = AutomationJob({
            id: jobId,
            owner: msg.sender,
            jobType: AutomationType.REBALANCE,
            active: true,
            createdAt: block.timestamp,
            lastExecuted: 0,
            executionCount: 0,
            jobData: abi.encode(rebalance)
        });

        userJobs[msg.sender].push(jobId);

        emit JobCreated(jobId, msg.sender, AutomationType.REBALANCE);

        return jobId;
    }

    /**
     * @dev Create yield harvesting automation
     * @param yieldSources List of farming contracts
     * @param autoCompound true to reinvest, false to withdraw
     * @param minHarvestAmount Minimum amount to trigger harvest
     */
    function createHarvestStrategy(
        address[] memory yieldSources,
        bool autoCompound,
        uint256 minHarvestAmount
    ) external returns (uint256 jobId) {
        jobId = jobCount++;

        HarvestStrategy memory harvest = HarvestStrategy({
            yieldSources: yieldSources,
            autoCompound: autoCompound,
            minHarvestAmount: minHarvestAmount
        });

        jobs[jobId] = AutomationJob({
            id: jobId,
            owner: msg.sender,
            jobType: AutomationType.HARVEST,
            active: true,
            createdAt: block.timestamp,
            lastExecuted: 0,
            executionCount: 0,
            jobData: abi.encode(harvest)
        });

        userJobs[msg.sender].push(jobId);

        emit JobCreated(jobId, msg.sender, AutomationType.HARVEST);

        return jobId;
    }

    /**
     * @dev Create stop-loss automation
     * @param token Token to protect
     * @param amount Amount to sell if triggered
     * @param stopPrice Price threshold (sell if below)
     * @param outputToken Token to receive
     */
    function createStopLoss(
        address token,
        uint256 amount,
        uint256 stopPrice,
        address outputToken
    ) external returns (uint256 jobId) {
        jobId = jobCount++;

        StopLoss memory stopLoss = StopLoss({
            token: token,
            amount: amount,
            stopPrice: stopPrice,
            outputToken: outputToken
        });

        jobs[jobId] = AutomationJob({
            id: jobId,
            owner: msg.sender,
            jobType: AutomationType.STOP_LOSS,
            active: true,
            createdAt: block.timestamp,
            lastExecuted: 0,
            executionCount: 0,
            jobData: abi.encode(stopLoss)
        });

        userJobs[msg.sender].push(jobId);

        emit JobCreated(jobId, msg.sender, AutomationType.STOP_LOSS);

        return jobId;
    }

    /**
     * @dev Check if automation job should be executed (Chainlink Automation)
     * @param jobId Job to check
     * @return upkeepNeeded true if job should run
     * @return performData Encoded job execution data
     */
    function checkUpkeep(uint256 jobId)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        AutomationJob storage job = jobs[jobId];

        if (!job.active) return (false, "");

        if (job.jobType == AutomationType.LIMIT_ORDER) {
            LimitOrder memory limitOrder = abi.decode(
                job.jobData,
                (LimitOrder)
            );
            uint256 currentPrice = _getCurrentPrice(
                limitOrder.tokenIn,
                limitOrder.tokenOut
            );

            bool priceReached = limitOrder.isBuyOrder
                ? currentPrice <= limitOrder.targetPrice
                : currentPrice >= limitOrder.targetPrice;

            return (priceReached, abi.encode(jobId));
        } else if (job.jobType == AutomationType.DCA) {
            DCAStrategy memory dca = abi.decode(job.jobData, (DCAStrategy));

            bool timeReached = block.timestamp >=
                job.lastExecuted + dca.frequency;
            bool budgetRemaining = dca.spent + dca.amountPerExecution <=
                dca.totalBudget;

            return (
                timeReached && budgetRemaining,
                abi.encode(jobId)
            );
        }

        // Other job types...
        return (false, "");
    }

    /**
     * @dev Execute automation job (Chainlink Automation callback)
     * @param performData Encoded job data
     */
    function performUpkeep(bytes calldata performData) external nonReentrant {
        uint256 jobId = abi.decode(performData, (uint256));
        AutomationJob storage job = jobs[jobId];

        require(job.active, "Job not active");

        uint256 gasStart = gasleft();

        if (job.jobType == AutomationType.LIMIT_ORDER) {
            _executeLimitOrder(jobId);
        } else if (job.jobType == AutomationType.DCA) {
            _executeDCA(jobId);
        } else if (job.jobType == AutomationType.REBALANCE) {
            _executeRebalance(jobId);
        } else if (job.jobType == AutomationType.HARVEST) {
            _executeHarvest(jobId);
        } else if (job.jobType == AutomationType.STOP_LOSS) {
            _executeStopLoss(jobId);
        }

        job.lastExecuted = block.timestamp;
        job.executionCount++;

        uint256 gasUsed = gasStart - gasleft();

        emit JobExecuted(jobId, msg.sender, gasUsed);
    }

    /**
     * @dev Execute limit order
     */
    function _executeLimitOrder(uint256 jobId) internal {
        AutomationJob storage job = jobs[jobId];
        LimitOrder memory limitOrder = abi.decode(job.jobData, (LimitOrder));

        // In production, would execute actual swap via DEX
        // For now, simplified

        uint256 currentPrice = _getCurrentPrice(
            limitOrder.tokenIn,
            limitOrder.tokenOut
        );

        uint256 amountOut = (limitOrder.amountIn * currentPrice) / 1e18;

        emit LimitOrderFilled(
            jobId,
            limitOrder.amountIn,
            amountOut,
            currentPrice
        );

        // Mark as inactive (one-time execution)
        job.active = false;
    }

    /**
     * @dev Execute DCA
     */
    function _executeDCA(uint256 jobId) internal {
        AutomationJob storage job = jobs[jobId];
        DCAStrategy memory dca = abi.decode(job.jobData, (DCAStrategy));

        // Execute swap
        uint256 currentPrice = _getCurrentPrice(dca.tokenIn, dca.tokenOut);
        uint256 amountOut = (dca.amountPerExecution * currentPrice) / 1e18;

        // Update spent amount
        dca.spent += dca.amountPerExecution;
        job.jobData = abi.encode(dca);

        emit DCAExecuted(
            jobId,
            dca.amountPerExecution,
            amountOut,
            job.executionCount + 1
        );

        // Deactivate if budget exhausted
        if (dca.spent >= dca.totalBudget) {
            job.active = false;
        }
    }

    /**
     * @dev Execute portfolio rebalancing
     */
    function _executeRebalance(uint256 jobId) internal {
        AutomationJob storage job = jobs[jobId];
        RebalanceStrategy memory rebalance = abi.decode(
            job.jobData,
            (RebalanceStrategy)
        );

        // Calculate current balances
        uint256[] memory currentBalances = new uint256[](
            rebalance.tokens.length
        );

        // In production, would query actual balances and rebalance

        emit PortfolioRebalanced(
            jobId,
            rebalance.tokens,
            currentBalances
        );
    }

    /**
     * @dev Execute yield harvesting
     */
    function _executeHarvest(uint256 jobId) internal {
        AutomationJob storage job = jobs[jobId];
        HarvestStrategy memory harvest = abi.decode(
            job.jobData,
            (HarvestStrategy)
        );

        // In production, would call harvest() on each yield source

        emit YieldHarvested(jobId, harvest.yieldSources, 0);
    }

    /**
     * @dev Execute stop-loss
     */
    function _executeStopLoss(uint256 jobId) internal {
        AutomationJob storage job = jobs[jobId];
        StopLoss memory stopLoss = abi.decode(job.jobData, (StopLoss));

        uint256 currentPrice = _getCurrentPrice(
            stopLoss.token,
            stopLoss.outputToken
        );

        // Execute emergency sell
        // In production, would swap on DEX

        // Deactivate after execution
        job.active = false;
    }

    /**
     * @dev Get current price (simplified oracle)
     * In production, would use Chainlink Price Feeds
     */
    function _getCurrentPrice(address tokenIn, address tokenOut)
        internal
        view
        returns (uint256)
    {
        // Mock price
        return 1e18;
    }

    /**
     * @dev Cancel automation job
     * @param jobId Job to cancel
     */
    function cancelJob(uint256 jobId) external {
        AutomationJob storage job = jobs[jobId];

        require(job.owner == msg.sender, "Not owner");
        require(job.active, "Job not active");

        job.active = false;

        emit JobCancelled(jobId, msg.sender);
    }

    /**
     * @dev Get user's active jobs
     * @param user User address
     */
    function getUserJobs(address user)
        external
        view
        returns (uint256[] memory)
    {
        return userJobs[user];
    }

    /**
     * @dev Get job details
     */
    function getJob(uint256 jobId)
        external
        view
        returns (
            address owner,
            AutomationType jobType,
            bool active,
            uint256 createdAt,
            uint256 lastExecuted,
            uint256 executionCount
        )
    {
        AutomationJob storage job = jobs[jobId];

        return (
            job.owner,
            job.jobType,
            job.active,
            job.createdAt,
            job.lastExecuted,
            job.executionCount
        );
    }

    /**
     * @dev Update mock price (for testing)
     */
    function updatePrice(address token, uint256 price) external onlyOwner {
        tokenPrices[token] = price;
    }
}
