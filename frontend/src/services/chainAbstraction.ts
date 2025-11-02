/**
 * @title Chain Abstraction Service
 * @dev Frontend integration for CAKE Framework (Chain Abstraction Key Elements)
 *
 * CAKE FRAMEWORK:
 * - APPLICATION LAYER: User submits intent (e.g., "swap USDC for SOL")
 * - PERMISSION LAYER: Signature verification and authorization
 * - SOLVER LAYER: Solvers compete to find best cross-chain route
 * - SETTLEMENT LAYER: Execute trades and verify final state
 *
 * USER EXPERIENCE:
 * - Single click to swap assets across any chains
 * - No manual bridging required
 * - Automatic optimal routing
 * - Pay gas in any token
 * - Unified balance view across all chains
 *
 * SUPPORTED CHAINS (2025):
 * - Ethereum, Arbitrum, Optimism, Base, Polygon
 * - Avalanche, BSC
 * - Solana (via Wormhole)
 * - NEAR (via Chain Signatures)
 *
 * BASED ON:
 * - Socket Protocol
 * - Particle Network Universal Accounts
 * - deBridge MOFA
 * - NEAR Chain Signatures
 */

import { ethers } from 'ethers';

// Supported chains
export enum Chain {
    ETHEREUM = 0,
    ARBITRUM = 1,
    OPTIMISM = 2,
    BASE = 3,
    POLYGON = 4,
    AVALANCHE = 5,
    BSC = 6,
    SOLANA = 7,
    NEAR = 8,
}

// Chain metadata
export const CHAIN_INFO: Record<
    Chain,
    {
        name: string;
        logo: string;
        rpcUrl: string;
        nativeCurrency: string;
        blockExplorer: string;
    }
> = {
    [Chain.ETHEREUM]: {
        name: 'Ethereum',
        logo: '⟠',
        rpcUrl: 'https://eth.llamarpc.com',
        nativeCurrency: 'ETH',
        blockExplorer: 'https://etherscan.io',
    },
    [Chain.ARBITRUM]: {
        name: 'Arbitrum',
        logo: '🔷',
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        nativeCurrency: 'ETH',
        blockExplorer: 'https://arbiscan.io',
    },
    [Chain.OPTIMISM]: {
        name: 'Optimism',
        logo: '🔴',
        rpcUrl: 'https://mainnet.optimism.io',
        nativeCurrency: 'ETH',
        blockExplorer: 'https://optimistic.etherscan.io',
    },
    [Chain.BASE]: {
        name: 'Base',
        logo: '🔵',
        rpcUrl: 'https://mainnet.base.org',
        nativeCurrency: 'ETH',
        blockExplorer: 'https://basescan.org',
    },
    [Chain.POLYGON]: {
        name: 'Polygon',
        logo: '🟣',
        rpcUrl: 'https://polygon-rpc.com',
        nativeCurrency: 'MATIC',
        blockExplorer: 'https://polygonscan.com',
    },
    [Chain.AVALANCHE]: {
        name: 'Avalanche',
        logo: '🔺',
        rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
        nativeCurrency: 'AVAX',
        blockExplorer: 'https://snowtrace.io',
    },
    [Chain.BSC]: {
        name: 'BNB Chain',
        logo: '🟡',
        rpcUrl: 'https://bsc-dataseed.binance.org',
        nativeCurrency: 'BNB',
        blockExplorer: 'https://bscscan.com',
    },
    [Chain.SOLANA]: {
        name: 'Solana',
        logo: '🌐',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        nativeCurrency: 'SOL',
        blockExplorer: 'https://solscan.io',
    },
    [Chain.NEAR]: {
        name: 'NEAR',
        logo: '🌈',
        rpcUrl: 'https://rpc.mainnet.near.org',
        nativeCurrency: 'NEAR',
        blockExplorer: 'https://explorer.near.org',
    },
};

// Cross-chain intent
export interface CrossChainIntent {
    user: string;
    sourceChain: Chain;
    destinationChain: Chain;
    sourceToken: string;
    destinationToken: string;
    amount: string;
    minReceive: string;
    deadline: number;
    intentHash: string;
    executed: boolean;
}

// Solver bid
export interface SolverBid {
    solver: string;
    outputAmount: string;
    gasCost: string;
    estimatedTime: number; // seconds
    score: number;
    route: Route;
}

// Cross-chain route
export interface Route {
    chainPath: Chain[];
    bridgeNames: string[];
    estimatedCost: string;
    estimatedTime: number;
    qualityScore: number; // 0-1000
    steps: RouteStep[];
}

// Route step
export interface RouteStep {
    action: 'bridge' | 'swap' | 'transfer';
    fromChain: Chain;
    toChain: Chain;
    protocol: string;
    estimatedTime: number;
}

/**
 * @class ChainAbstractionService
 */
export class ChainAbstractionService {
    private contract: ethers.Contract | null = null;
    private provider: ethers.providers.Provider | null = null;
    private signer: ethers.Signer | null = null;

    /**
     * Initialize service
     */
    async initialize(contractAddress: string, provider: ethers.providers.Provider) {
        this.provider = provider;
        this.signer = provider.getSigner();

        const abi = [
            'function submitCrossChainIntent(uint8 sourceChain, uint8 destinationChain, address sourceToken, address destinationToken, uint256 amount, uint256 minReceive, uint256 deadline) external returns (bytes32)',
            'function submitSolverBid(bytes32 intentHash, uint256 outputAmount, uint256 gasCost, bytes memory executionPath, uint256 estimatedTime) external',
            'function executeCrossChainIntent(bytes32 intentHash) external',
            'function calculateOptimalRoute(uint8 sourceChain, uint8 destinationChain) external pure returns (tuple(uint8[] chainPath, address[] bridges, uint256 estimatedCost, uint256 estimatedTime, uint256 qualityScore))',
            'function getIntent(bytes32 intentHash) external view returns (address user, uint8 sourceChain, uint8 destinationChain, address sourceToken, address destinationToken, uint256 amount, uint256 minReceive, bool executed)',
            'function getAllBids(bytes32 intentHash) external view returns (tuple(address solver, uint256 outputAmount, uint256 gasCost, bytes executionPath, uint256 estimatedTime, uint256 score)[])',
            'event CrossChainIntentSubmitted(bytes32 indexed intentHash, address indexed user, uint8 sourceChain, uint8 destinationChain, uint256 amount)',
            'event SolverBidSubmitted(bytes32 indexed intentHash, address indexed solver, uint256 outputAmount, uint256 score)',
            'event CrossChainExecuted(bytes32 indexed intentHash, address indexed solver, uint8[] chainPath, uint256 finalAmount)',
        ];

        this.contract = new ethers.Contract(contractAddress, abi, this.signer);
    }

    /**
     * Submit cross-chain swap intent
     *
     * Example: Swap USDC on Ethereum for SOL on Solana
     *
     * @param sourceChain Origin chain
     * @param destinationChain Target chain
     * @param sourceToken Token to swap from
     * @param destinationToken Token to receive
     * @param amount Amount to swap
     * @param minReceive Minimum acceptable output
     * @param deadline Expiration timestamp
     */
    async submitCrossChainIntent(
        sourceChain: Chain,
        destinationChain: Chain,
        sourceToken: string,
        destinationToken: string,
        amount: string,
        minReceive: string,
        deadline: number
    ): Promise<string> {
        if (!this.contract) throw new Error('Service not initialized');

        // Approve token spending
        const tokenContract = new ethers.Contract(
            sourceToken,
            ['function approve(address spender, uint256 amount) external returns (bool)'],
            this.signer!
        );

        const approveTx = await tokenContract.approve(
            this.contract.address,
            ethers.utils.parseUnits(amount, 18)
        );
        await approveTx.wait();

        // Submit intent
        const tx = await this.contract.submitCrossChainIntent(
            sourceChain,
            destinationChain,
            sourceToken,
            destinationToken,
            ethers.utils.parseUnits(amount, 18),
            ethers.utils.parseUnits(minReceive, 18),
            deadline
        );

        const receipt = await tx.wait();

        // Extract intent hash from event
        const event = receipt.events?.find((e: any) => e.event === 'CrossChainIntentSubmitted');
        return event?.args?.intentHash || '';
    }

    /**
     * Calculate optimal cross-chain route
     *
     * @param sourceChain Origin chain
     * @param destinationChain Target chain
     * @returns Optimal route with cost and time estimates
     */
    async calculateOptimalRoute(sourceChain: Chain, destinationChain: Chain): Promise<Route> {
        if (!this.contract) throw new Error('Service not initialized');

        const result = await this.contract.calculateOptimalRoute(sourceChain, destinationChain);

        const steps = this._generateRouteSteps(result.chainPath);

        return {
            chainPath: result.chainPath.map((c: number) => c as Chain),
            bridgeNames: this._getBridgeNames(result.bridges),
            estimatedCost: ethers.utils.formatEther(result.estimatedCost),
            estimatedTime: result.estimatedTime.toNumber(),
            qualityScore: result.qualityScore.toNumber(),
            steps,
        };
    }

    /**
     * Generate human-readable route steps
     */
    private _generateRouteSteps(chainPath: number[]): RouteStep[] {
        const steps: RouteStep[] = [];

        for (let i = 0; i < chainPath.length - 1; i++) {
            const fromChain = chainPath[i] as Chain;
            const toChain = chainPath[i + 1] as Chain;

            // Determine bridge protocol
            let protocol = 'Unknown';
            if (fromChain === Chain.ETHEREUM && toChain === Chain.ARBITRUM) {
                protocol = 'Arbitrum Official Bridge';
            } else if (fromChain === Chain.ETHEREUM && toChain === Chain.OPTIMISM) {
                protocol = 'Optimism Official Bridge';
            } else if (fromChain === Chain.ETHEREUM && toChain === Chain.SOLANA) {
                protocol = 'Wormhole';
            }

            steps.push({
                action: 'bridge',
                fromChain,
                toChain,
                protocol,
                estimatedTime: 600, // 10 minutes default
            });
        }

        return steps;
    }

    /**
     * Get bridge names from addresses
     */
    private _getBridgeNames(bridges: string[]): string[] {
        // In production, would map addresses to names
        return bridges.map((_, idx) => `Bridge ${idx + 1}`);
    }

    /**
     * Get intent details
     *
     * @param intentHash Intent hash
     */
    async getIntent(intentHash: string): Promise<CrossChainIntent> {
        if (!this.contract) throw new Error('Service not initialized');

        const result = await this.contract.getIntent(intentHash);

        return {
            user: result.user,
            sourceChain: result.sourceChain as Chain,
            destinationChain: result.destinationChain as Chain,
            sourceToken: result.sourceToken,
            destinationToken: result.destinationToken,
            amount: ethers.utils.formatUnits(result.amount, 18),
            minReceive: ethers.utils.formatUnits(result.minReceive, 18),
            deadline: result.deadline,
            intentHash,
            executed: result.executed,
        };
    }

    /**
     * Get all solver bids for intent
     *
     * @param intentHash Intent hash
     */
    async getAllBids(intentHash: string): Promise<SolverBid[]> {
        if (!this.contract) throw new Error('Service not initialized');

        const bids = await this.contract.getAllBids(intentHash);

        return bids.map((bid: any) => ({
            solver: bid.solver,
            outputAmount: ethers.utils.formatUnits(bid.outputAmount, 18),
            gasCost: ethers.utils.formatEther(bid.gasCost),
            estimatedTime: bid.estimatedTime.toNumber(),
            score: bid.score.toNumber(),
            route: {
                chainPath: [],
                bridgeNames: [],
                estimatedCost: '0',
                estimatedTime: bid.estimatedTime.toNumber(),
                qualityScore: bid.score.toNumber(),
                steps: [],
            },
        }));
    }

    /**
     * Execute cross-chain intent with best solver
     *
     * @param intentHash Intent hash
     */
    async executeCrossChainIntent(intentHash: string): Promise<ethers.ContractReceipt> {
        if (!this.contract) throw new Error('Service not initialized');

        const tx = await this.contract.executeCrossChainIntent(intentHash);
        return await tx.wait();
    }

    /**
     * Get unified balance across all chains
     *
     * @param userAddress User address
     * @param tokenSymbol Token symbol (e.g., "USDC")
     * @returns Total balance across all chains
     */
    async getUnifiedBalance(
        userAddress: string,
        tokenSymbol: string
    ): Promise<{
        total: string;
        breakdown: { chain: Chain; balance: string }[];
    }> {
        // In production, would query multiple chain providers in parallel
        // For now, return mock data

        const breakdown = [
            { chain: Chain.ETHEREUM, balance: '1000' },
            { chain: Chain.ARBITRUM, balance: '500' },
            { chain: Chain.OPTIMISM, balance: '250' },
        ];

        const total = breakdown.reduce((sum, item) => sum + parseFloat(item.balance), 0).toString();

        return { total, breakdown };
    }

    /**
     * Estimate cross-chain swap output
     *
     * @param sourceChain Origin chain
     * @param destinationChain Target chain
     * @param sourceToken Token to swap
     * @param destinationToken Token to receive
     * @param amount Input amount
     * @returns Estimated output and fees
     */
    async estimateSwapOutput(
        sourceChain: Chain,
        destinationChain: Chain,
        sourceToken: string,
        destinationToken: string,
        amount: string
    ): Promise<{
        outputAmount: string;
        priceImpact: number;
        bridgeFee: string;
        gasCost: string;
        totalCost: string;
    }> {
        // In production, would:
        // 1. Query optimal route
        // 2. Get quotes from multiple solvers
        // 3. Calculate all fees
        // 4. Return best estimate

        const route = await this.calculateOptimalRoute(sourceChain, destinationChain);

        // Simplified estimation
        const amountNum = parseFloat(amount);
        const bridgeFeePercent = 0.001; // 0.1%
        const slippage = 0.005; // 0.5%

        const bridgeFee = amountNum * bridgeFeePercent;
        const afterBridge = amountNum - bridgeFee;
        const priceImpact = slippage;
        const outputAmount = afterBridge * (1 - priceImpact);

        return {
            outputAmount: outputAmount.toFixed(6),
            priceImpact: priceImpact * 100, // Percentage
            bridgeFee: bridgeFee.toFixed(6),
            gasCost: route.estimatedCost,
            totalCost: (bridgeFee + parseFloat(route.estimatedCost)).toFixed(6),
        };
    }

    /**
     * Subscribe to cross-chain events
     *
     * @param callback Event callback
     */
    subscribeToEvents(
        callback: (event: {
            type: 'intent_submitted' | 'bid_submitted' | 'executed';
            data: any;
        }) => void
    ) {
        if (!this.contract) throw new Error('Service not initialized');

        this.contract.on('CrossChainIntentSubmitted', (intentHash, user, sourceChain, destChain, amount) => {
            callback({
                type: 'intent_submitted',
                data: {
                    intentHash,
                    user,
                    sourceChain,
                    destinationChain: destChain,
                    amount: ethers.utils.formatUnits(amount, 18),
                },
            });
        });

        this.contract.on('SolverBidSubmitted', (intentHash, solver, outputAmount, score) => {
            callback({
                type: 'bid_submitted',
                data: {
                    intentHash,
                    solver,
                    outputAmount: ethers.utils.formatUnits(outputAmount, 18),
                    score: score.toNumber(),
                },
            });
        });

        this.contract.on('CrossChainExecuted', (intentHash, solver, chainPath, finalAmount) => {
            callback({
                type: 'executed',
                data: {
                    intentHash,
                    solver,
                    chainPath,
                    finalAmount: ethers.utils.formatUnits(finalAmount, 18),
                },
            });
        });
    }
}

// Export singleton
export const chainAbstraction = new ChainAbstractionService();

export default chainAbstraction;
