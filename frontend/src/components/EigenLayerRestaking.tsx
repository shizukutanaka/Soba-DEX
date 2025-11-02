/**
 * @title EigenLayer Restaking Component
 * @dev React UI for EigenLayer restaking integration
 *
 * FEATURES:
 * - Restake ETH and LSTs (stETH, rETH, cbETH)
 * - Multi-AVS selection with risk assessment
 * - Operator comparison and selection
 * - Real-time APR calculation
 * - Withdrawal queue management
 * - Slashing event notifications
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
    eigenLayerRestaking,
    LST_TOKENS,
    KNOWN_AVS,
    type AVS,
    type Operator,
    type RestakePosition,
} from '../services/eigenLayerRestaking';

interface Props {
    provider: ethers.providers.Web3Provider;
    contractAddress: string;
}

const EigenLayerRestaking: React.FC<Props> = ({ provider, contractAddress }) => {
    // State
    const [position, setPosition] = useState<RestakePosition | null>(null);
    const [amount, setAmount] = useState<string>('');
    const [selectedToken, setSelectedToken] = useState<'ETH' | 'stETH' | 'rETH' | 'cbETH'>('ETH');
    const [selectedOperator, setSelectedOperator] = useState<string>('');
    const [selectedAVS, setSelectedAVS] = useState<string[]>([]);
    const [operators, setOperators] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState<string>('');

    // Initialize service
    useEffect(() => {
        const init = async () => {
            try {
                await eigenLayerRestaking.initialize(contractAddress, provider);

                // Load user position
                const signer = provider.getSigner();
                const address = await signer.getAddress();
                const pos = await eigenLayerRestaking.getRestakePosition(address);
                setPosition(pos);

                // Load operators
                const ops = await eigenLayerRestaking.getAllOperators();
                setOperators(ops);
            } catch (err: any) {
                setError(`Failed to initialize: ${err.message}`);
            }
        };

        init();
    }, [contractAddress, provider]);

    // Subscribe to events
    useEffect(() => {
        eigenLayerRestaking.subscribeToEvents((event) => {
            if (event.type === 'restaked') {
                setSuccess(`Restaked ${event.data.amount} ETH successfully!`);
                refreshPosition();
            } else if (event.type === 'slashed') {
                setError(`⚠️ SLASHED: ${event.data.amount} ETH - Reason: ${event.data.reason}`);
                refreshPosition();
            }
        });
    }, []);

    // Refresh position
    const refreshPosition = async () => {
        try {
            const signer = provider.getSigner();
            const address = await signer.getAddress();
            const pos = await eigenLayerRestaking.getRestakePosition(address);
            setPosition(pos);
        } catch (err: any) {
            console.error('Failed to refresh position:', err);
        }
    };

    // Handle restaking
    const handleRestake = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        if (!selectedOperator) {
            setError('Please select an operator');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            if (selectedToken === 'ETH') {
                await eigenLayerRestaking.restakeETH(amount, selectedOperator);
                setSuccess(`Successfully restaked ${amount} ETH!`);
            } else {
                const tokenAddress = LST_TOKENS[selectedToken].address;
                await eigenLayerRestaking.restakeLST(tokenAddress, amount, selectedOperator);
                setSuccess(`Successfully restaked ${amount} ${selectedToken}!`);
            }

            await refreshPosition();
            setAmount('');
        } catch (err: any) {
            setError(`Restaking failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Handle AVS opt-in
    const handleAVSOptIn = async (avsAddress: string) => {
        setLoading(true);
        setError('');

        try {
            await eigenLayerRestaking.optIntoAVS(avsAddress);
            setSuccess('Successfully opted into AVS!');
            await refreshPosition();
        } catch (err: any) {
            setError(`AVS opt-in failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Handle withdrawal request
    const handleWithdrawalRequest = async () => {
        if (!position || parseFloat(position.shares) === 0) {
            setError('No shares to withdraw');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const withdrawalId = await eigenLayerRestaking.requestWithdrawal(position.shares);
            setSuccess(`Withdrawal requested! ID: ${withdrawalId}. Available in 7 days.`);
            await refreshPosition();
        } catch (err: any) {
            setError(`Withdrawal request failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Calculate estimated APR
    const estimatedAPR = amount
        ? eigenLayerRestaking.calculateEstimatedAPR(amount, selectedAVS.length)
        : null;

    // Calculate slashing risk
    const slashingRisk = amount
        ? eigenLayerRestaking.assessSlashingRisk(selectedAVS, amount)
        : null;

    return (
        <div className="eigenlayer-restaking">
            <h2>🔷 EigenLayer Restaking</h2>
            <p className="subtitle">
                Earn 8-15% APR through restaking and shared security
            </p>

            {/* Current Position */}
            {position && position.active && (
                <div className="position-card">
                    <h3>📊 Your Restaking Position</h3>
                    <div className="position-stats">
                        <div className="stat">
                            <span className="label">Deposited:</span>
                            <span className="value">{parseFloat(position.depositedAmount).toFixed(4)} ETH</span>
                        </div>
                        <div className="stat">
                            <span className="label">Shares:</span>
                            <span className="value">{parseFloat(position.shares).toFixed(4)}</span>
                        </div>
                        <div className="stat">
                            <span className="label">Estimated APR:</span>
                            <span className="value apr">{position.estimatedAPR.toFixed(2)}%</span>
                        </div>
                        <div className="stat">
                            <span className="label">Operator:</span>
                            <span className="value small">{position.operator.slice(0, 10)}...</span>
                        </div>
                        <div className="stat">
                            <span className="label">AVS Opted In:</span>
                            <span className="value">{position.avsOptIns.length}</span>
                        </div>
                    </div>
                    <button onClick={handleWithdrawalRequest} className="btn-secondary" disabled={loading}>
                        Request Withdrawal (7-day delay)
                    </button>
                </div>
            )}

            {/* Restaking Form */}
            <div className="restake-form">
                <h3>💎 Restake Assets</h3>

                {/* Token Selection */}
                <div className="form-group">
                    <label>Select Asset:</label>
                    <div className="token-selector">
                        {['ETH', 'stETH', 'rETH', 'cbETH'].map((token) => (
                            <button
                                key={token}
                                className={`token-btn ${selectedToken === token ? 'active' : ''}`}
                                onClick={() => setSelectedToken(token as any)}
                            >
                                {token}
                                {token !== 'ETH' && (
                                    <span className="base-apr">
                                        {LST_TOKENS[token as keyof typeof LST_TOKENS].baseAPR}% base
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Amount Input */}
                <div className="form-group">
                    <label>Amount:</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        step="0.01"
                        min="0"
                    />
                </div>

                {/* Operator Selection */}
                <div className="form-group">
                    <label>Select Operator:</label>
                    <select value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)}>
                        <option value="">-- Choose operator --</option>
                        {operators.map((op) => (
                            <option key={op} value={op}>
                                {op.slice(0, 10)}... (Reputation: TBD)
                            </option>
                        ))}
                    </select>
                    <p className="help-text">
                        💡 Operators validate AVS services. Choose based on reputation and commission.
                    </p>
                </div>

                {/* APR Projection */}
                {estimatedAPR && (
                    <div className="apr-breakdown">
                        <h4>📈 Estimated APR Breakdown</h4>
                        <div className="breakdown-item">
                            <span>Base Ethereum Staking:</span>
                            <span>{estimatedAPR.baseStaking}%</span>
                        </div>
                        <div className="breakdown-item">
                            <span>EigenLayer Restaking:</span>
                            <span>{estimatedAPR.restaking}%</span>
                        </div>
                        <div className="breakdown-item">
                            <span>AVS Rewards ({selectedAVS.length} services):</span>
                            <span>{estimatedAPR.avsRewards}%</span>
                        </div>
                        <div className="breakdown-item total">
                            <span>Total APR:</span>
                            <span className="highlight">{estimatedAPR.total}%</span>
                        </div>
                        <div className="yearly-earnings">
                            <span>Estimated Yearly Earnings:</span>
                            <span className="earnings">{estimatedAPR.yearlyEarnings} ETH</span>
                        </div>
                    </div>
                )}

                <button onClick={handleRestake} className="btn-primary" disabled={loading || !amount || !selectedOperator}>
                    {loading ? 'Restaking...' : 'Restake Now'}
                </button>
            </div>

            {/* AVS Selection */}
            <div className="avs-section">
                <h3>🔧 Actively Validated Services (AVS)</h3>
                <p className="subtitle">
                    Opt into AVS to earn additional rewards (1-3% per service)
                </p>

                <div className="avs-grid">
                    {KNOWN_AVS.map((avs) => {
                        const isOptedIn = position?.avsOptIns.includes(avs.address) || false;

                        return (
                            <div key={avs.address} className={`avs-card ${isOptedIn ? 'opted-in' : ''}`}>
                                <div className="avs-header">
                                    <h4>{avs.name}</h4>
                                    <span className={`badge ${avs.category}`}>{avs.category}</span>
                                </div>
                                <p className="avs-description">{avs.description}</p>
                                <div className="avs-stats">
                                    <div className="stat">
                                        <span className="label">Min Stake:</span>
                                        <span className="value">
                                            {ethers.utils.formatEther(avs.minStake)} ETH
                                        </span>
                                    </div>
                                    <div className="stat">
                                        <span className="label">Slashing Risk:</span>
                                        <span className="value risk">{avs.slashingRate}% max</span>
                                    </div>
                                </div>
                                {isOptedIn ? (
                                    <div className="opted-in-badge">✅ Opted In</div>
                                ) : (
                                    <button
                                        onClick={() => handleAVSOptIn(avs.address)}
                                        className="btn-secondary"
                                        disabled={loading || !position?.active}
                                    >
                                        Opt In
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Slashing Risk Assessment */}
                {slashingRisk && (
                    <div className={`risk-assessment ${slashingRisk.riskLevel}`}>
                        <h4>🛡️ Slashing Risk Assessment</h4>
                        <div className="risk-stats">
                            <div className="stat">
                                <span className="label">Total Risk:</span>
                                <span className="value">{slashingRisk.totalRisk}%</span>
                            </div>
                            <div className="stat">
                                <span className="label">Max Potential Loss:</span>
                                <span className="value">{slashingRisk.maxPotentialLoss} ETH</span>
                            </div>
                            <div className="stat">
                                <span className="label">Risk Level:</span>
                                <span className={`badge ${slashingRisk.riskLevel}`}>
                                    {slashingRisk.riskLevel.toUpperCase()}
                                </span>
                            </div>
                        </div>
                        <div className="recommendations">
                            <h5>Recommendations:</h5>
                            <ul>
                                {slashingRisk.recommendations.map((rec, idx) => (
                                    <li key={idx}>{rec}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="message error">
                    ❌ {error}
                </div>
            )}
            {success && (
                <div className="message success">
                    ✅ {success}
                </div>
            )}

            {/* Info Section */}
            <div className="info-section">
                <h3>ℹ️ About EigenLayer Restaking</h3>
                <div className="info-grid">
                    <div className="info-card">
                        <h4>💰 Enhanced Yields</h4>
                        <p>
                            Earn 8-15% APR by restaking your ETH or LSTs. Combine base staking
                            rewards with EigenLayer restaking and AVS service fees.
                        </p>
                    </div>
                    <div className="info-card">
                        <h4>🔒 Shared Security</h4>
                        <p>
                            Your restaked assets secure multiple services (oracles, data availability,
                            bridges). Help decentralize critical infrastructure.
                        </p>
                    </div>
                    <div className="info-card">
                        <h4>⚠️ Slashing Risk</h4>
                        <p>
                            If validators misbehave, a portion of staked assets can be slashed.
                            Choose reputable operators and diversify across AVS to mitigate risk.
                        </p>
                    </div>
                    <div className="info-card">
                        <h4>⏱️ Withdrawal Delay</h4>
                        <p>
                            Withdrawals have a 7-day delay for security. Plan accordingly and
                            keep liquid reserves for immediate needs.
                        </p>
                    </div>
                </div>

                <div className="market-stats">
                    <h4>📊 Market Statistics (2025)</h4>
                    <ul>
                        <li>Total Value Locked: <strong>$15 billion</strong></li>
                        <li>Registered Operators: <strong>1,500+</strong></li>
                        <li>Active AVS Services: <strong>39</strong></li>
                        <li>Average APR Range: <strong>8-15%</strong></li>
                        <li>Slashing Implementation: <strong>April 2025</strong></li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default EigenLayerRestaking;
