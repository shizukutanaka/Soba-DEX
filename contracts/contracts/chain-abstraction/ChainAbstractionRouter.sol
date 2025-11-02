// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ChainAbstractionRouter
 * @dev CAKE Framework implementation (Chain Abstraction Key Elements)
 *
 * CAKE FRAMEWORK (4 LAYERS):
 * 1. APPLICATION LAYER - User interface and intent submission
 * 2. PERMISSION LAYER - Authorization and signature verification
 * 3. SOLVER LAYER - Cross-chain routing and execution competition
 * 4. SETTLEMENT LAYER - Final state updates and verification
 *
 * BENEFITS:
 * - Users unaware of which chain they're using
 * - Automatic best-path routing across chains
 * - Single-click multi-chain operations
 * - Unified liquidity across ecosystems
 * - No manual bridging required
 *
 * BASED ON:
 * - Socket Protocol (first chain abstraction protocol)
 * - NEAR Chain Signatures
 * - Particle Network's Universal Accounts
 * - deBridge MOFA (Modular Order Flow Auction)
 *
 * USE CASES:
 * - Swap USDC on Ethereum for SOL on Solana (single transaction)
 * - Deploy contracts to optimal chain automatically
 * - Aggregate liquidity from all chains
 * - Pay gas fees in any token on any chain
 *
 * MARKET STATUS (2025):
 * - Socket: First mover, 10+ chain integrations
 * - Particle Network: 900+ dApps integrated
 * - NEAR: Chain Signatures for Bitcoin, Ethereum
 */
contract ChainAbstractionRouter is ReentrancyGuard, Ownable {
    // Supported chains
    enum Chain {
        ETHEREUM,
        ARBITRUM,
        OPTIMISM,
        BASE,
        POLYGON,
        AVALANCHE,
        BSC,
        SOLANA, // Via wormhole
        NEAR // Via chain signatures
    }

    // Cross-chain intent
    struct CrossChainIntent {
        address user;
        Chain sourceChain;
        Chain destinationChain;
        address sourceToken;
        address destinationToken;
        uint256 amount;
        uint256 minReceive;
        uint256 deadline;
        bytes32 intentHash;
        bool executed;
        bool cancelled;
    }

    // Solver bid
    struct SolverBid {
        address solver;
        uint256 outputAmount;
        uint256 gasCost;
        bytes executionPath; // Encoded routing instructions
        uint256 estimatedTime; // Seconds to complete
        uint256 score; // Higher = better
    }

    // Chain route
    struct Route {
        Chain[] chainPath; // Sequence of chains
        address[] bridges; // Bridge contracts to use
        uint256 estimatedCost;
        uint256 estimatedTime;
        uint256 qualityScore; // Security + speed + cost
    }

    // Storage
    mapping(bytes32 => CrossChainIntent) public intents;
    mapping(bytes32 => SolverBid[]) public bids;
    mapping(Chain => bool) public supportedChains;
    mapping(Chain => address) public chainEndpoints; // Cross-chain messaging
    mapping(address => uint256) public solverBonds;
    mapping(address => uint256) public solverReputations; // 0-1000

    // Registered solvers
    address[] public solvers;

    // Constants
    uint256 public constant MIN_SOLVER_BOND = 10 ether;
    uint256 public constant SOLVER_TIMEOUT = 30 seconds;
    uint256 public constant MAX_CHAINS_PER_ROUTE = 5;

    // Events
    event CrossChainIntentSubmitted(
        bytes32 indexed intentHash,
        address indexed user,
        Chain sourceChain,
        Chain destinationChain,
        uint256 amount
    );

    event SolverBidSubmitted(
        bytes32 indexed intentHash,
        address indexed solver,
        uint256 outputAmount,
        uint256 score
    );

    event CrossChainExecuted(
        bytes32 indexed intentHash,
        address indexed solver,
        Chain[] chainPath,
        uint256 finalAmount
    );

    event ChainAdded(Chain indexed chain, address endpoint);

    /**
     * @dev Submit cross-chain intent
     * @param sourceChain Origin chain
     * @param destinationChain Target chain
     * @param sourceToken Token to swap from
     * @param destinationToken Token to receive
     * @param amount Amount to swap
     * @param minReceive Minimum acceptable output
     * @param deadline Expiration timestamp
     */
    function submitCrossChainIntent(
        Chain sourceChain,
        Chain destinationChain,
        address sourceToken,
        address destinationToken,
        uint256 amount,
        uint256 minReceive,
        uint256 deadline
    ) external nonReentrant returns (bytes32 intentHash) {
        require(supportedChains[sourceChain], "Source chain not supported");
        require(
            supportedChains[destinationChain],
            "Destination chain not supported"
        );
        require(amount > 0, "Invalid amount");
        require(deadline > block.timestamp, "Invalid deadline");

        // Calculate intent hash
        intentHash = keccak256(
            abi.encodePacked(
                msg.sender,
                sourceChain,
                destinationChain,
                sourceToken,
                destinationToken,
                amount,
                minReceive,
                deadline,
                block.timestamp
            )
        );

        // Store intent
        intents[intentHash] = CrossChainIntent({
            user: msg.sender,
            sourceChain: sourceChain,
            destinationChain: destinationChain,
            sourceToken: sourceToken,
            destinationToken: destinationToken,
            amount: amount,
            minReceive: minReceive,
            deadline: deadline,
            intentHash: intentHash,
            executed: false,
            cancelled: false
        });

        emit CrossChainIntentSubmitted(
            intentHash,
            msg.sender,
            sourceChain,
            destinationChain,
            amount
        );

        // Transfer source tokens to escrow
        IERC20(sourceToken).transferFrom(msg.sender, address(this), amount);

        return intentHash;
    }

    /**
     * @dev Solver submits bid for cross-chain execution
     * @param intentHash Intent to fulfill
     * @param outputAmount Amount solver will deliver
     * @param gasCost Estimated gas cost
     * @param executionPath Encoded routing path
     * @param estimatedTime Time to complete (seconds)
     */
    function submitSolverBid(
        bytes32 intentHash,
        uint256 outputAmount,
        uint256 gasCost,
        bytes memory executionPath,
        uint256 estimatedTime
    ) external {
        CrossChainIntent storage intent = intents[intentHash];

        require(!intent.executed, "Intent already executed");
        require(!intent.cancelled, "Intent cancelled");
        require(block.timestamp < intent.deadline, "Intent expired");
        require(
            solverBonds[msg.sender] >= MIN_SOLVER_BOND,
            "Insufficient bond"
        );
        require(outputAmount >= intent.minReceive, "Below minimum");

        // Calculate bid score
        // Higher output = better
        // Lower gas = better
        // Shorter time = better
        // Higher solver reputation = better
        uint256 outputScore = (outputAmount * 1000) / intent.amount;
        uint256 gasScore = gasCost > 0
            ? (1000 * 1 ether) / gasCost
            : 1000;
        uint256 timeScore = estimatedTime > 0
            ? (1000 * 60) / estimatedTime
            : 1000; // Prefer sub-60s
        uint256 reputationScore = solverReputations[msg.sender];

        uint256 score = (outputScore * 40 +
            gasScore * 20 +
            timeScore * 20 +
            reputationScore * 20) / 100;

        // Store bid
        bids[intentHash].push(
            SolverBid({
                solver: msg.sender,
                outputAmount: outputAmount,
                gasCost: gasCost,
                executionPath: executionPath,
                estimatedTime: estimatedTime,
                score: score
            })
        );

        emit SolverBidSubmitted(intentHash, msg.sender, outputAmount, score);
    }

    /**
     * @dev Execute cross-chain intent with best solver
     * @param intentHash Intent to execute
     */
    function executeCrossChainIntent(bytes32 intentHash)
        external
        nonReentrant
    {
        CrossChainIntent storage intent = intents[intentHash];

        require(!intent.executed, "Already executed");
        require(!intent.cancelled, "Intent cancelled");
        require(
            block.timestamp >= intent.deadline - SOLVER_TIMEOUT,
            "Bidding still open"
        );

        // Select best solver bid
        SolverBid memory bestBid = _selectBestBid(intentHash);

        require(bestBid.solver != address(0), "No valid bids");

        // Execute cross-chain swap via solver
        // In production, would:
        // 1. Lock source tokens
        // 2. Call cross-chain messaging (LayerZero, Axelar, Wormhole)
        // 3. Verify destination chain execution
        // 4. Release tokens to user on destination chain

        // Simplified: Transfer source tokens to solver
        IERC20(intent.sourceToken).transfer(bestBid.solver, intent.amount);

        // Solver is responsible for delivering tokens on destination chain
        // They would call destinationChainEndpoint to complete

        intent.executed = true;

        // Decode execution path for event
        Route memory route = _decodeExecutionPath(bestBid.executionPath);

        emit CrossChainExecuted(
            intentHash,
            bestBid.solver,
            route.chainPath,
            bestBid.outputAmount
        );

        // Update solver reputation
        solverReputations[bestBid.solver] += 10; // Reward successful execution
        if (solverReputations[bestBid.solver] > 1000) {
            solverReputations[bestBid.solver] = 1000;
        }
    }

    /**
     * @dev Select best solver bid
     */
    function _selectBestBid(bytes32 intentHash)
        internal
        view
        returns (SolverBid memory)
    {
        SolverBid[] storage bidList = bids[intentHash];

        if (bidList.length == 0) {
            return
                SolverBid({
                    solver: address(0),
                    outputAmount: 0,
                    gasCost: 0,
                    executionPath: "",
                    estimatedTime: 0,
                    score: 0
                });
        }

        uint256 bestIndex = 0;
        uint256 bestScore = 0;

        for (uint256 i = 0; i < bidList.length; i++) {
            if (bidList[i].score > bestScore) {
                bestScore = bidList[i].score;
                bestIndex = i;
            }
        }

        return bidList[bestIndex];
    }

    /**
     * @dev Decode execution path
     */
    function _decodeExecutionPath(bytes memory executionPath)
        internal
        pure
        returns (Route memory)
    {
        // Simplified decoding
        // In production, would decode complex routing instructions

        Chain[] memory chainPath = new Chain[](2);
        chainPath[0] = Chain.ETHEREUM;
        chainPath[1] = Chain.ARBITRUM;

        address[] memory bridges = new address[](1);

        return
            Route({
                chainPath: chainPath,
                bridges: bridges,
                estimatedCost: 0,
                estimatedTime: 0,
                qualityScore: 0
            });
    }

    /**
     * @dev Calculate optimal route between chains
     * @param sourceChain Origin chain
     * @param destinationChain Target chain
     */
    function calculateOptimalRoute(
        Chain sourceChain,
        Chain destinationChain
    ) external pure returns (Route memory) {
        // In production, would:
        // 1. Query all available bridges
        // 2. Calculate costs for each path
        // 3. Factor in security scores
        // 4. Return best route

        Chain[] memory chainPath;
        address[] memory bridges;

        // Direct route
        if (
            sourceChain == Chain.ETHEREUM &&
            destinationChain == Chain.ARBITRUM
        ) {
            chainPath = new Chain[](2);
            chainPath[0] = sourceChain;
            chainPath[1] = destinationChain;

            bridges = new address[](1);
            // Arbitrum canonical bridge

            return
                Route({
                    chainPath: chainPath,
                    bridges: bridges,
                    estimatedCost: 0.001 ether,
                    estimatedTime: 600, // 10 minutes
                    qualityScore: 950 // High security
                });
        }

        // Multi-hop route
        if (
            sourceChain == Chain.ETHEREUM && destinationChain == Chain.SOLANA
        ) {
            chainPath = new Chain[](3);
            chainPath[0] = Chain.ETHEREUM;
            chainPath[1] = Chain.ARBITRUM; // Cheaper to bridge from L2
            chainPath[2] = Chain.SOLANA;

            bridges = new address[](2);
            // Arbitrum bridge + Wormhole

            return
                Route({
                    chainPath: chainPath,
                    bridges: bridges,
                    estimatedCost: 0.005 ether,
                    estimatedTime: 1800, // 30 minutes
                    qualityScore: 850 // Medium-high security
                });
        }

        // Default empty route
        return
            Route({
                chainPath: new Chain[](0),
                bridges: new address[](0),
                estimatedCost: 0,
                estimatedTime: 0,
                qualityScore: 0
            });
    }

    /**
     * @dev Register as solver
     */
    function registerSolver() external payable {
        require(msg.value >= MIN_SOLVER_BOND, "Insufficient bond");

        solverBonds[msg.sender] += msg.value;
        solverReputations[msg.sender] = 500; // Start at 50%

        solvers.push(msg.sender);
    }

    /**
     * @dev Add supported chain
     * @param chain Chain to add
     * @param endpoint Cross-chain messaging endpoint
     */
    function addSupportedChain(Chain chain, address endpoint)
        external
        onlyOwner
    {
        supportedChains[chain] = true;
        chainEndpoints[chain] = endpoint;

        emit ChainAdded(chain, endpoint);
    }

    /**
     * @dev Cancel intent
     * @param intentHash Intent to cancel
     */
    function cancelIntent(bytes32 intentHash) external {
        CrossChainIntent storage intent = intents[intentHash];

        require(intent.user == msg.sender, "Not owner");
        require(!intent.executed, "Already executed");
        require(!intent.cancelled, "Already cancelled");

        intent.cancelled = true;

        // Return source tokens
        IERC20(intent.sourceToken).transfer(intent.user, intent.amount);
    }

    /**
     * @dev Get intent details
     */
    function getIntent(bytes32 intentHash)
        external
        view
        returns (
            address user,
            Chain sourceChain,
            Chain destinationChain,
            address sourceToken,
            address destinationToken,
            uint256 amount,
            uint256 minReceive,
            bool executed
        )
    {
        CrossChainIntent storage intent = intents[intentHash];

        return (
            intent.user,
            intent.sourceChain,
            intent.destinationChain,
            intent.sourceToken,
            intent.destinationToken,
            intent.amount,
            intent.minReceive,
            intent.executed
        );
    }

    /**
     * @dev Get bid count for intent
     */
    function getBidCount(bytes32 intentHash) external view returns (uint256) {
        return bids[intentHash].length;
    }

    /**
     * @dev Get all bids for intent
     */
    function getAllBids(bytes32 intentHash)
        external
        view
        returns (SolverBid[] memory)
    {
        return bids[intentHash];
    }

    /**
     * @dev Receive ETH
     */
    receive() external payable {}
}
