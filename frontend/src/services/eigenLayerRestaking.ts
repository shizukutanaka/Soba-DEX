/**
 * @title EigenLayer Restaking Service
 * @dev Frontend integration for EigenLayer restaking ($15B TVL)
 *
 * MARKET STATUS (2025):
 * - Total Value Locked: $15 billion
 * - Operators: 1,500+ registered
 * - AVS (Actively Validated Services): 39 services
 * - APR Range: 8-15% (vs 3-4% base staking)
 * - Competitors: Symbiotic, Karak
 *
 * YIELD BREAKDOWN:
 * 1. Ethereum staking: ~3-4% APR
 * 2. EigenLayer restaking: ~2-5% APR
 * 3. AVS service fees: ~1-3% per service
 * Total potential: 8-15% APR
 *
 * FEATURES:
 * - Restake ETH and LSTs (stETH, rETH, cbETH)
 * - Multi-AVS opt-in for diversified yield
 * - Operator selection and delegation
 * - Withdrawal queue management (7-day delay)
 * - Slashing risk monitoring
 * - Real-time APR calculation
 *
 * BASED ON:
 * - EigenLayer protocol documentation
 * - EigenDA integration guide
 * - RedStone AVS oracle implementation
 */

import { ethers } from 'ethers';

// EigenLayer mainnet contract addresses
export const EIGEN_CONTRACTS = {
    STRATEGY_MANAGER: '0x858646372CC42E1A627fcE94aa7A7033e7CF075A',
    DELEGATION_MANAGER: '0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A',
};

// Supported liquid staking tokens
export const LST_TOKENS = {
    STETH: {
        address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
        name: 'Lido Staked ETH',
        symbol: 'stETH',
        baseAPR: 3.5,
    },
    RETH: {
        address: '0xae78736Cd615f374D3085123A210448E74Fc6393',
        name: 'Rocket Pool ETH',
        symbol: 'rETH',
        baseAPR: 3.2,
    },
    CBETH: {
        address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
        name: 'Coinbase Wrapped Staked ETH',
        symbol: 'cbETH',
        baseAPR: 3.0,
    },
};

// Restaking position
export interface RestakePosition {
    shares: string;
    depositedAmount: string;
    depositTime: number;
    avsOptIns: string[];
    operator: string;
    active: boolean;
    estimatedAPR: number;
}

// AVS (Actively Validated Service)
export interface AVS {
    address: string;
    name: string;
    description: string;
    minStake: string;
    slashingRate: number;
    rewards: string;
    active: boolean;
    category: 'oracle' | 'data-availability' | 'bridge' | 'sequencer' | 'other';
}

// Operator information
export interface Operator {
    address: string;
    name: string;
    totalDelegated: string;
    reputationScore: number; // 0-1000
    commissionRate: number; // Percentage
    metadata: string;
    active: boolean;
    avsSupport: string[]; // List of supported AVS
}

// Withdrawal request
export interface WithdrawalRequest {
    id: number;
    user: string;
    shares: string;
    requestTime: number;
    availableTime: number;
    completed: boolean;
    estimatedAmount: string;
}

// Known AVS services (2025)
export const KNOWN_AVS: AVS[] = [
    {
        address: '0x0000000000000000000000000000000000000001', // Example
        name: 'EigenDA',
        description: 'Data availability layer for rollups',
        minStake: ethers.utils.parseEther('1').toString(),
        slashingRate: 10, // 10% max
        rewards: '0',
        active: true,
        category: 'data-availability',
    },
    {
        address: '0x0000000000000000000000000000000000000002',
        name: 'RedStone Oracle',
        description: 'Decentralized oracle network',
        minStake: ethers.utils.parseEther('2').toString(),
        slashingRate: 15,
        rewards: '0',
        active: true,
        category: 'oracle',
    },
    {
        address: '0x0000000000000000000000000000000000000003',
        name: 'Hyperlane Bridge',
        description: 'Cross-chain message bridge security',
        minStake: ethers.utils.parseEther('5').toString(),
        slashingRate: 20,
        rewards: '0',
        active: true,
        category: 'bridge',
    },
];

/**
 * @class EigenLayerRestakingService
 */
export class EigenLayerRestakingService {
    private contract: ethers.Contract | null = null;
    private provider: ethers.providers.Provider | null = null;
    private signer: ethers.Signer | null = null;

    /**
     * Initialize service
     */
    async initialize(contractAddress: string, provider: ethers.providers.Provider) {
        this.provider = provider;
        this.signer = provider.getSigner();

        // ABI for EigenLayerRestaking contract
        const abi = [
            'function restakeETH(address operator) external payable returns (uint256 shares)',
            'function restakeLST(address token, uint256 amount, address operator) external returns (uint256 shares)',
            'function optIntoAVS(address avs) external',
            'function optOutOfAVS(address avs) external',
            'function requestWithdrawal(uint256 shares) external returns (uint256 withdrawalId)',
            'function completeWithdrawal(uint256 withdrawalId) external returns (uint256 amount)',
            'function getRestakePosition(address user) external view returns (uint256 shares, uint256 depositedAmount, uint256 depositTime, address[] memory avsOptIns, address operator, bool active)',
            'function estimateAPR(address user) external view returns (uint256 apr)',
            'function getAllAVS() external view returns (address[] memory)',
            'function getAllOperators() external view returns (address[] memory)',
            'event Restaked(address indexed user, uint256 amount, uint256 shares, address operator)',
            'event AVSOptedIn(address indexed user, address indexed avs)',
            'event WithdrawalRequested(uint256 indexed withdrawalId, address indexed user, uint256 shares)',
            'event Slashed(address indexed user, address indexed avs, uint256 amount, string reason)',
        ];

        this.contract = new ethers.Contract(contractAddress, abi, this.signer);
    }

    /**
     * Restake ETH
     *
     * @param amount Amount in ETH
     * @param operator Operator address to delegate to
     * @returns Transaction receipt
     */
    async restakeETH(amount: string, operator: string): Promise<ethers.ContractReceipt> {
        if (!this.contract) throw new Error('Service not initialized');

        const tx = await this.contract.restakeETH(operator, {
            value: ethers.utils.parseEther(amount),
        });

        return await tx.wait();
    }

    /**
     * Restake liquid staking token
     *
     * @param token LST token address (stETH, rETH, cbETH)
     * @param amount Amount to restake
     * @param operator Operator address
     * @returns Transaction receipt
     */
    async restakeLST(
        token: string,
        amount: string,
        operator: string
    ): Promise<ethers.ContractReceipt> {
        if (!this.contract) throw new Error('Service not initialized');

        // First approve token
        const tokenContract = new ethers.Contract(
            token,
            ['function approve(address spender, uint256 amount) external returns (bool)'],
            this.signer!
        );

        const approveTx = await tokenContract.approve(
            this.contract.address,
            ethers.utils.parseEther(amount)
        );
        await approveTx.wait();

        // Then restake
        const tx = await this.contract.restakeLST(
            token,
            ethers.utils.parseEther(amount),
            operator
        );

        return await tx.wait();
    }

    /**
     * Opt into AVS (Actively Validated Service)
     *
     * @param avsAddress AVS contract address
     * @returns Transaction receipt
     */
    async optIntoAVS(avsAddress: string): Promise<ethers.ContractReceipt> {
        if (!this.contract) throw new Error('Service not initialized');

        const tx = await this.contract.optIntoAVS(avsAddress);
        return await tx.wait();
    }

    /**
     * Opt out of AVS
     *
     * @param avsAddress AVS contract address
     * @returns Transaction receipt
     */
    async optOutOfAVS(avsAddress: string): Promise<ethers.ContractReceipt> {
        if (!this.contract) throw new Error('Service not initialized');

        const tx = await this.contract.optOutOfAVS(avsAddress);
        return await tx.wait();
    }

    /**
     * Request withdrawal (7-day delay)
     *
     * @param shares Amount of shares to withdraw
     * @returns Withdrawal ID
     */
    async requestWithdrawal(shares: string): Promise<number> {
        if (!this.contract) throw new Error('Service not initialized');

        const tx = await this.contract.requestWithdrawal(ethers.utils.parseEther(shares));
        const receipt = await tx.wait();

        // Extract withdrawal ID from event
        const event = receipt.events?.find((e: any) => e.event === 'WithdrawalRequested');
        return event?.args?.withdrawalId.toNumber() || 0;
    }

    /**
     * Complete withdrawal after 7-day delay
     *
     * @param withdrawalId Withdrawal request ID
     * @returns Transaction receipt
     */
    async completeWithdrawal(withdrawalId: number): Promise<ethers.ContractReceipt> {
        if (!this.contract) throw new Error('Service not initialized');

        const tx = await this.contract.completeWithdrawal(withdrawalId);
        return await tx.wait();
    }

    /**
     * Get user's restaking position
     *
     * @param userAddress User address
     * @returns Restaking position
     */
    async getRestakePosition(userAddress: string): Promise<RestakePosition> {
        if (!this.contract) throw new Error('Service not initialized');

        const position = await this.contract.getRestakePosition(userAddress);

        // Get estimated APR
        const apr = await this.contract.estimateAPR(userAddress);

        return {
            shares: ethers.utils.formatEther(position.shares),
            depositedAmount: ethers.utils.formatEther(position.depositedAmount),
            depositTime: position.depositTime.toNumber(),
            avsOptIns: position.avsOptIns,
            operator: position.operator,
            active: position.active,
            estimatedAPR: apr.toNumber() / 10, // Convert basis points to percentage
        };
    }

    /**
     * Get all available AVS
     *
     * @returns List of AVS addresses
     */
    async getAllAVS(): Promise<string[]> {
        if (!this.contract) throw new Error('Service not initialized');

        return await this.contract.getAllAVS();
    }

    /**
     * Get all registered operators
     *
     * @returns List of operator addresses
     */
    async getAllOperators(): Promise<string[]> {
        if (!this.contract) throw new Error('Service not initialized');

        return await this.contract.getAllOperators();
    }

    /**
     * Calculate potential APR for restaking
     *
     * @param amount Amount to restake
     * @param avsCount Number of AVS to opt into
     * @returns Estimated APR breakdown
     */
    calculateEstimatedAPR(
        amount: string,
        avsCount: number
    ): {
        baseStaking: number;
        restaking: number;
        avsRewards: number;
        total: number;
        yearlyEarnings: string;
    } {
        const baseStaking = 3.5; // 3.5% base Ethereum staking
        const restaking = 3.0; // 3% EigenLayer restaking
        const avsRewards = avsCount * 2.0; // 2% per AVS

        const total = baseStaking + restaking + avsRewards;

        const amountNum = parseFloat(amount);
        const yearlyEarnings = (amountNum * total) / 100;

        return {
            baseStaking,
            restaking,
            avsRewards,
            total,
            yearlyEarnings: yearlyEarnings.toFixed(4),
        };
    }

    /**
     * Get operator reputation and details
     *
     * @param operatorAddress Operator address
     * @returns Operator details
     */
    async getOperatorDetails(operatorAddress: string): Promise<Operator | null> {
        // In production, would fetch from EigenLayer subgraph or API
        // For now, return mock data

        return {
            address: operatorAddress,
            name: 'Example Operator',
            totalDelegated: '1000000',
            reputationScore: 850, // Out of 1000
            commissionRate: 10, // 10%
            metadata: 'https://operator-metadata.example.com',
            active: true,
            avsSupport: KNOWN_AVS.map(avs => avs.address),
        };
    }

    /**
     * Check slashing risk for AVS combination
     *
     * @param avsAddresses List of AVS to opt into
     * @param depositAmount Deposit amount
     * @returns Risk assessment
     */
    assessSlashingRisk(
        avsAddresses: string[],
        depositAmount: string
    ): {
        totalRisk: number; // Percentage
        maxPotentialLoss: string;
        riskLevel: 'low' | 'medium' | 'high';
        recommendations: string[];
    } {
        let totalSlashingRate = 0;
        const recommendations: string[] = [];

        // Calculate cumulative slashing risk
        for (const avsAddr of avsAddresses) {
            const avs = KNOWN_AVS.find(a => a.address === avsAddr);
            if (avs) {
                totalSlashingRate += avs.slashingRate;
            }
        }

        // Cap at reasonable maximum (50%)
        totalSlashingRate = Math.min(totalSlashingRate, 50);

        const amountNum = parseFloat(depositAmount);
        const maxPotentialLoss = (amountNum * totalSlashingRate) / 100;

        let riskLevel: 'low' | 'medium' | 'high';

        if (totalSlashingRate < 15) {
            riskLevel = 'low';
            recommendations.push('✅ Low risk profile - suitable for most users');
        } else if (totalSlashingRate < 30) {
            riskLevel = 'medium';
            recommendations.push('⚠️ Medium risk - diversify across operators');
            recommendations.push('💡 Consider insurance protocols (Nexus Mutual)');
        } else {
            riskLevel = 'high';
            recommendations.push('🚨 High risk - only for advanced users');
            recommendations.push('💰 Reduce AVS count or deposit amount');
            recommendations.push('🛡️ Essential: Use insurance coverage');
        }

        return {
            totalRisk: totalSlashingRate,
            maxPotentialLoss: maxPotentialLoss.toFixed(4),
            riskLevel,
            recommendations,
        };
    }

    /**
     * Get withdrawal queue status
     *
     * @param withdrawalId Withdrawal request ID
     * @returns Status information
     */
    async getWithdrawalStatus(withdrawalId: number): Promise<{
        available: boolean;
        remainingTime: number; // seconds
        estimatedAmount: string;
    }> {
        // In production, would query contract
        // Mock implementation

        const WITHDRAWAL_DELAY = 7 * 24 * 60 * 60; // 7 days

        return {
            available: false,
            remainingTime: WITHDRAWAL_DELAY,
            estimatedAmount: '0',
        };
    }

    /**
     * Subscribe to restaking events
     *
     * @param callback Event callback
     */
    subscribeToEvents(
        callback: (event: {
            type: 'restaked' | 'avs_opted_in' | 'withdrawal_requested' | 'slashed';
            data: any;
        }) => void
    ) {
        if (!this.contract) throw new Error('Service not initialized');

        this.contract.on('Restaked', (user, amount, shares, operator) => {
            callback({
                type: 'restaked',
                data: { user, amount: ethers.utils.formatEther(amount), shares, operator },
            });
        });

        this.contract.on('AVSOptedIn', (user, avs) => {
            callback({
                type: 'avs_opted_in',
                data: { user, avs },
            });
        });

        this.contract.on('WithdrawalRequested', (withdrawalId, user, shares) => {
            callback({
                type: 'withdrawal_requested',
                data: { withdrawalId: withdrawalId.toNumber(), user, shares },
            });
        });

        this.contract.on('Slashed', (user, avs, amount, reason) => {
            callback({
                type: 'slashed',
                data: { user, avs, amount: ethers.utils.formatEther(amount), reason },
            });
        });
    }
}

// Export singleton instance
export const eigenLayerRestaking = new EigenLayerRestakingService();

export default eigenLayerRestaking;
