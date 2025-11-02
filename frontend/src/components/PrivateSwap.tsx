/**
 * @title Private Swap Component
 * @dev React component for zero-knowledge private trading
 *
 * FEATURES:
 * - Private token swaps with hidden amounts
 * - Deposit/withdraw interface
 * - Secret backup/restore
 * - Privacy set size display
 * - Proof generation progress
 *
 * PRIVACY BENEFITS:
 * - Transaction amounts hidden
 * - Trading patterns unlinkable
 * - MEV-resistant
 * - Anonymous liquidity
 */

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
    privateTransactionBuilder,
    ZKProofGenerator,
} from '../services/zkProofGenerator';

interface PrivateSwapProps {
    contract: ethers.Contract;
    signer: ethers.Signer;
}

export const PrivateSwap: React.FC<PrivateSwapProps> = ({ contract, signer }) => {
    // State
    const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'swap'>('deposit');
    const [token, setToken] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [recipient, setRecipient] = useState<string>('');
    const [isGeneratingProof, setIsGeneratingProof] = useState(false);
    const [proofProgress, setProofProgress] = useState<string>('');
    const [userCommitments, setUserCommitments] = useState<any[]>([]);
    const [privacySetSize, setPrivacySetSize] = useState<number>(0);

    // Load user commitments on mount
    useEffect(() => {
        loadUserCommitments();
        loadPrivacySetSize();
    }, [token]);

    /**
     * Load user's commitments from local storage
     */
    const loadUserCommitments = () => {
        const stored = localStorage.getItem('zk_commitments');
        if (stored) {
            setUserCommitments(JSON.parse(stored));
        }
    };

    /**
     * Save commitment to local storage
     */
    const saveCommitment = (commitment: any) => {
        const commitments = [...userCommitments, commitment];
        setUserCommitments(commitments);
        localStorage.setItem('zk_commitments', JSON.stringify(commitments));
    };

    /**
     * Load privacy set size from contract
     */
    const loadPrivacySetSize = async () => {
        if (!token) return;

        try {
            const size = await contract.getPrivacySetSize(token);
            setPrivacySetSize(size.toNumber());
        } catch (error) {
            console.error('Failed to load privacy set size:', error);
        }
    };

    /**
     * Handle private deposit
     */
    const handleDeposit = async () => {
        if (!token || !amount) {
            alert('Please enter token and amount');
            return;
        }

        try {
            setIsGeneratingProof(true);
            setProofProgress('Generating zero-knowledge proof...');

            // Generate proof (client-side, 2-5 seconds)
            const { proof, commitment, secret } = await privateTransactionBuilder.createPrivateDeposit(
                token,
                ethers.utils.parseEther(amount).toString()
            );

            setProofProgress('Proof generated! Submitting transaction...');

            // Submit to contract
            const tx = await contract.privateDeposit(token, commitment, proof);

            setProofProgress('Waiting for confirmation...');

            await tx.wait();

            // Save commitment locally
            saveCommitment({
                commitment,
                token,
                amount,
                timestamp: Date.now(),
                secret,
            });

            setProofProgress('');
            setIsGeneratingProof(false);

            alert(`✅ Private deposit successful!\n\nCommitment: ${commitment}\n\n⚠️ IMPORTANT: Backup your secrets!`);

            // Refresh privacy set size
            loadPrivacySetSize();
        } catch (error) {
            console.error('Private deposit failed:', error);
            setProofProgress('');
            setIsGeneratingProof(false);
            alert(`❌ Deposit failed: ${error}`);
        }
    };

    /**
     * Handle private withdrawal
     */
    const handleWithdraw = async (commitmentData: any) => {
        try {
            setIsGeneratingProof(true);
            setProofProgress('Loading Merkle proof from contract...');

            // Get Merkle proof from contract
            const leafIndex = await contract.getCommitmentIndex(commitmentData.commitment);
            const merkleProof = await contract.getMerklePath(leafIndex);

            setProofProgress('Generating zero-knowledge proof...');

            // Generate withdrawal proof
            const { proof, nullifier } = await privateTransactionBuilder.createPrivateWithdraw(
                commitmentData.token,
                commitmentData.amount,
                commitmentData.commitment,
                recipient || (await signer.getAddress()),
                merkleProof,
                leafIndex
            );

            setProofProgress('Proof generated! Submitting transaction...');

            // Calculate Merkle root
            const root = await contract._calculateMerkleRoot();

            // Submit withdrawal
            const tx = await contract.privateWithdraw(
                commitmentData.token,
                recipient || (await signer.getAddress()),
                nullifier,
                root,
                proof
            );

            setProofProgress('Waiting for confirmation...');

            await tx.wait();

            setProofProgress('');
            setIsGeneratingProof(false);

            alert('✅ Private withdrawal successful!');

            // Remove spent commitment
            const updated = userCommitments.filter(c => c.commitment !== commitmentData.commitment);
            setUserCommitments(updated);
            localStorage.setItem('zk_commitments', JSON.stringify(updated));
        } catch (error) {
            console.error('Private withdrawal failed:', error);
            setProofProgress('');
            setIsGeneratingProof(false);
            alert(`❌ Withdrawal failed: ${error}`);
        }
    };

    /**
     * Export secrets for backup
     */
    const handleExportSecrets = () => {
        const password = prompt('Enter password to encrypt backup:');
        if (!password) return;

        try {
            const encrypted = privateTransactionBuilder.exportSecrets(password);

            // Download as file
            const blob = new Blob([encrypted], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `zk-secrets-backup-${Date.now()}.enc`;
            a.click();

            alert('✅ Secrets exported!\n\n⚠️ Keep this file safe - you cannot recover without it!');
        } catch (error) {
            alert(`❌ Export failed: ${error}`);
        }
    };

    /**
     * Import secrets from backup
     */
    const handleImportSecrets = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.enc';

        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const encrypted = await file.text();
            const password = prompt('Enter decryption password:');

            if (!password) return;

            try {
                privateTransactionBuilder.importSecrets(encrypted, password);
                alert('✅ Secrets imported successfully!');
                loadUserCommitments();
            } catch (error) {
                alert(`❌ Import failed: ${error}\n\nWrong password or corrupted file.`);
            }
        };

        input.click();
    };

    return (
        <div className="private-swap-container">
            <div className="privacy-header">
                <h2>🔐 Private Swap</h2>
                <div className="privacy-stats">
                    <div className="stat">
                        <span className="label">Privacy Set Size:</span>
                        <span className="value">{privacySetSize}</span>
                    </div>
                    <div className="stat">
                        <span className="label">Your Deposits:</span>
                        <span className="value">{userCommitments.length}</span>
                    </div>
                </div>
            </div>

            <div className="tab-buttons">
                <button
                    className={activeTab === 'deposit' ? 'active' : ''}
                    onClick={() => setActiveTab('deposit')}
                >
                    Deposit
                </button>
                <button
                    className={activeTab === 'withdraw' ? 'active' : ''}
                    onClick={() => setActiveTab('withdraw')}
                >
                    Withdraw
                </button>
                <button
                    className={activeTab === 'swap' ? 'active' : ''}
                    onClick={() => setActiveTab('swap')}
                >
                    Private Swap
                </button>
            </div>

            {/* Deposit Tab */}
            {activeTab === 'deposit' && (
                <div className="tab-content">
                    <h3>Private Deposit</h3>
                    <p className="info">
                        Deposit tokens privately. Amounts will be hidden on-chain.
                    </p>

                    <div className="form-group">
                        <label>Token Address</label>
                        <input
                            type="text"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="0x..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Amount</label>
                        <input
                            type="text"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                        />
                    </div>

                    {isGeneratingProof && (
                        <div className="proof-progress">
                            <div className="spinner"></div>
                            <p>{proofProgress}</p>
                        </div>
                    )}

                    <button
                        className="primary-button"
                        onClick={handleDeposit}
                        disabled={isGeneratingProof}
                    >
                        {isGeneratingProof ? 'Generating Proof...' : 'Deposit Privately'}
                    </button>

                    <div className="privacy-notice">
                        <p>⚠️ <strong>IMPORTANT:</strong></p>
                        <ul>
                            <li>Backup your secrets after deposit</li>
                            <li>You cannot withdraw without your secrets</li>
                            <li>Larger privacy set = better anonymity</li>
                        </ul>
                    </div>
                </div>
            )}

            {/* Withdraw Tab */}
            {activeTab === 'withdraw' && (
                <div className="tab-content">
                    <h3>Private Withdrawal</h3>
                    <p className="info">
                        Withdraw from your private deposits. Recipients cannot link to deposits.
                    </p>

                    <div className="form-group">
                        <label>Recipient (optional - defaults to your address)</label>
                        <input
                            type="text"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="0x... (optional)"
                        />
                    </div>

                    {isGeneratingProof && (
                        <div className="proof-progress">
                            <div className="spinner"></div>
                            <p>{proofProgress}</p>
                        </div>
                    )}

                    <div className="commitments-list">
                        <h4>Your Private Deposits:</h4>
                        {userCommitments.length === 0 ? (
                            <p className="empty-state">No deposits found</p>
                        ) : (
                            userCommitments.map((c, i) => (
                                <div key={i} className="commitment-card">
                                    <div className="commitment-info">
                                        <div className="commitment-amount">{c.amount} tokens</div>
                                        <div className="commitment-time">
                                            {new Date(c.timestamp).toLocaleDateString()}
                                        </div>
                                        <div className="commitment-hash">
                                            {c.commitment.slice(0, 10)}...{c.commitment.slice(-8)}
                                        </div>
                                    </div>
                                    <button
                                        className="withdraw-button"
                                        onClick={() => handleWithdraw(c)}
                                        disabled={isGeneratingProof}
                                    >
                                        Withdraw
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Swap Tab */}
            {activeTab === 'swap' && (
                <div className="tab-content">
                    <h3>Private Swap</h3>
                    <p className="info">
                        Swap tokens privately without revealing amounts or trading patterns.
                    </p>

                    <div className="coming-soon">
                        <p>🚧 Coming Soon</p>
                        <p>Private swaps will allow fully anonymous trading with MEV protection.</p>
                    </div>
                </div>
            )}

            {/* Secret Management */}
            <div className="secret-management">
                <h4>Secret Management</h4>
                <div className="secret-buttons">
                    <button onClick={handleExportSecrets} className="secondary-button">
                        📥 Export Secrets
                    </button>
                    <button onClick={handleImportSecrets} className="secondary-button">
                        📤 Import Secrets
                    </button>
                </div>
                <p className="warning">
                    ⚠️ Never share your secrets! They are required to withdraw your funds.
                </p>
            </div>

            <style jsx>{`
                .private-swap-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                }

                .privacy-header {
                    margin-bottom: 30px;
                }

                .privacy-header h2 {
                    margin: 0 0 15px 0;
                    font-size: 28px;
                }

                .privacy-stats {
                    display: flex;
                    gap: 30px;
                }

                .stat {
                    display: flex;
                    flex-direction: column;
                }

                .stat .label {
                    font-size: 12px;
                    color: #666;
                    text-transform: uppercase;
                }

                .stat .value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #4CAF50;
                }

                .tab-buttons {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #eee;
                }

                .tab-buttons button {
                    padding: 12px 24px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 16px;
                    color: #666;
                    transition: all 0.3s;
                }

                .tab-buttons button.active {
                    color: #4CAF50;
                    border-bottom: 2px solid #4CAF50;
                    margin-bottom: -2px;
                }

                .tab-content {
                    background: #f9f9f9;
                    padding: 30px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }

                .tab-content h3 {
                    margin: 0 0 10px 0;
                }

                .tab-content .info {
                    color: #666;
                    margin-bottom: 20px;
                }

                .form-group {
                    margin-bottom: 20px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 500;
                }

                .form-group input {
                    width: 100%;
                    padding: 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 16px;
                }

                .proof-progress {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding: 20px;
                    background: #fff;
                    border-radius: 4px;
                    margin: 20px 0;
                }

                .spinner {
                    width: 30px;
                    height: 30px;
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #4CAF50;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .primary-button {
                    width: 100%;
                    padding: 15px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: background 0.3s;
                }

                .primary-button:hover:not(:disabled) {
                    background: #45a049;
                }

                .primary-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .secondary-button {
                    padding: 10px 20px;
                    background: #fff;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .secondary-button:hover {
                    background: #f5f5f5;
                }

                .privacy-notice {
                    margin-top: 20px;
                    padding: 15px;
                    background: #fff3cd;
                    border-left: 4px solid #ffc107;
                    border-radius: 4px;
                }

                .privacy-notice ul {
                    margin: 10px 0 0 0;
                    padding-left: 20px;
                }

                .privacy-notice li {
                    margin: 5px 0;
                }

                .commitments-list {
                    margin-top: 20px;
                }

                .commitments-list h4 {
                    margin-bottom: 15px;
                }

                .commitment-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    margin-bottom: 10px;
                }

                .commitment-info {
                    flex: 1;
                }

                .commitment-amount {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }

                .commitment-time {
                    font-size: 12px;
                    color: #666;
                }

                .commitment-hash {
                    font-size: 12px;
                    color: #999;
                    font-family: monospace;
                }

                .withdraw-button {
                    padding: 10px 20px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .withdraw-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .empty-state {
                    text-align: center;
                    color: #999;
                    padding: 40px 0;
                }

                .coming-soon {
                    text-align: center;
                    padding: 60px 20px;
                }

                .coming-soon p:first-child {
                    font-size: 48px;
                    margin-bottom: 20px;
                }

                .secret-management {
                    background: #f9f9f9;
                    padding: 20px;
                    border-radius: 8px;
                }

                .secret-management h4 {
                    margin: 0 0 15px 0;
                }

                .secret-buttons {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }

                .warning {
                    color: #d32f2f;
                    font-size: 14px;
                    margin: 0;
                }
            `}</style>
        </div>
    );
};

export default PrivateSwap;
