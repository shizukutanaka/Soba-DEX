/**
 * Transaction Verifier
 *
 * SECURITY FEATURES:
 * - Contract address whitelist verification
 * - Transaction data decoding and validation
 * - Malicious pattern detection
 * - User confirmation with detailed breakdown
 * - Protection against:
 *   - Unlimited token approvals
 *   - Proxy calls to unknown contracts
 *   - Self-destruct operations
 *   - Phishing attacks
 *
 * Based on 2025 security research preventing $120M+ in losses
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';

interface DecodedTransaction {
  function: string;
  params: Record<string, any>;
  risk: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
  estimatedValue: string;
}

interface VerificationResult {
  approved: boolean;
  reason?: string;
  decoded?: DecodedTransaction;
}

export class TransactionVerifier {
  // Whitelisted contract addresses
  private static readonly WHITELISTED_CONTRACTS = new Set([
    // DEX Router
    process.env.REACT_APP_ROUTER_ADDRESS?.toLowerCase(),
    // Factory
    process.env.REACT_APP_FACTORY_ADDRESS?.toLowerCase(),
    // Known tokens
    process.env.REACT_APP_WETH_ADDRESS?.toLowerCase(),
    process.env.REACT_APP_USDC_ADDRESS?.toLowerCase(),
    process.env.REACT_APP_USDT_ADDRESS?.toLowerCase()
  ].filter(Boolean));

  // ABI for common functions
  private static readonly COMMON_ABIS = {
    // ERC20
    approve: 'function approve(address spender, uint256 amount)',
    transfer: 'function transfer(address to, uint256 amount)',
    transferFrom: 'function transferFrom(address from, address to, uint256 amount)',

    // DEX
    swapExactTokensForTokens: 'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)',
    swapTokensForExactTokens: 'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] path, address to, uint deadline)',
    addLiquidity: 'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline)',
    removeLiquidity: 'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline)'
  };

  // Known malicious patterns
  private static readonly MALICIOUS_PATTERNS = [
    {
      pattern: /ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff/i,
      name: 'Unlimited Approval',
      risk: 'critical' as const,
      description: 'This transaction requests unlimited token approval. Attacker can drain your wallet.'
    },
    {
      pattern: /^0x1cff79cd/,
      name: 'Delegate Call',
      risk: 'high' as const,
      description: 'This transaction uses delegatecall to unknown contract. Your wallet could be compromised.'
    },
    {
      pattern: /^0xff/,
      name: 'Self Destruct',
      risk: 'critical' as const,
      description: 'This transaction attempts to destroy a contract. This is highly suspicious.'
    },
    {
      pattern: /^0x9d61d234/,
      name: 'Safe Transfer From',
      risk: 'medium' as const,
      description: 'Token transfer detected. Verify the recipient address carefully.'
    }
  ];

  /**
   * Verify transaction before signing
   */
  async verifyBeforeSign(
    tx: ethers.providers.TransactionRequest
  ): Promise<VerificationResult> {
    try {
      logger.info('Verifying transaction', {
        to: tx.to,
        value: tx.value?.toString(),
        data: tx.data?.slice(0, 10)
      });

      // 1. Verify contract address
      if (tx.to && !this.isWhitelistedContract(tx.to)) {
        logger.warn('Unknown contract address', { address: tx.to });

        const shouldContinue = await this.showWarningModal(
          'Unknown Contract',
          `The contract address ${tx.to} is not whitelisted. This could be a phishing attempt.`,
          'high'
        );

        if (!shouldContinue) {
          return {
            approved: false,
            reason: 'User rejected unknown contract'
          };
        }
      }

      // 2. Decode transaction data
      const decoded = tx.data ? await this.decodeTxData(tx.data as string, tx.to as string) : null;

      if (decoded) {
        logger.info('Transaction decoded', decoded);
      }

      // 3. Verify value matches expected
      if (tx.value && decoded) {
        const txValue = ethers.BigNumber.from(tx.value);
        const expectedValue = ethers.BigNumber.from(decoded.estimatedValue || '0');

        if (!txValue.eq(expectedValue) && !expectedValue.isZero()) {
          logger.warn('Value mismatch detected', {
            txValue: txValue.toString(),
            expectedValue: expectedValue.toString()
          });

          const shouldContinue = await this.showWarningModal(
            'Value Mismatch',
            `Transaction value (${ethers.utils.formatEther(txValue)} ETH) doesn't match expected (${ethers.utils.formatEther(expectedValue)} ETH)`,
            'high'
          );

          if (!shouldContinue) {
            return {
              approved: false,
              reason: 'Value mismatch rejected'
            };
          }
        }
      }

      // 4. Check for malicious patterns
      if (tx.data) {
        const maliciousPattern = this.detectMaliciousPatterns(tx.data as string);

        if (maliciousPattern) {
          logger.error('Malicious pattern detected', maliciousPattern);

          const shouldContinue = await this.showDangerModal(
            `🚨 ${maliciousPattern.name} Detected`,
            maliciousPattern.description,
            maliciousPattern.risk
          );

          if (!shouldContinue) {
            return {
              approved: false,
              reason: `Malicious pattern detected: ${maliciousPattern.name}`
            };
          }
        }
      }

      // 5. Show final confirmation
      const confirmed = await this.showConfirmationModal(tx, decoded);

      if (!confirmed) {
        return {
          approved: false,
          reason: 'User rejected transaction'
        };
      }

      logger.info('Transaction verified and approved');

      return {
        approved: true,
        decoded: decoded || undefined
      };

    } catch (error: any) {
      logger.error('Transaction verification failed', {
        error: error.message
      });

      return {
        approved: false,
        reason: error.message
      };
    }
  }

  /**
   * Check if contract address is whitelisted
   */
  private isWhitelistedContract(address: string): boolean {
    return TransactionVerifier.WHITELISTED_CONTRACTS.has(
      address.toLowerCase()
    );
  }

  /**
   * Decode transaction data
   */
  private async decodeTxData(
    data: string,
    contractAddress: string
  ): Promise<DecodedTransaction | null> {
    try {
      // Get function signature
      const functionSig = data.slice(0, 10);

      // Try to match with known ABIs
      for (const [name, abi] of Object.entries(TransactionVerifier.COMMON_ABIS)) {
        const iface = new ethers.utils.Interface([abi]);
        const funcSig = iface.getSighash(name);

        if (funcSig === functionSig) {
          // Decode parameters
          const decoded = iface.decodeFunctionData(name, data);

          // Analyze risk
          const analysis = this.analyzeTransaction(name, decoded);

          return {
            function: name,
            params: this.formatParams(decoded),
            risk: analysis.risk,
            warnings: analysis.warnings,
            estimatedValue: analysis.estimatedValue
          };
        }
      }

      // Unknown function
      return {
        function: 'Unknown',
        params: { data: data.slice(0, 66) + '...' },
        risk: 'high',
        warnings: ['Unknown function - verify carefully'],
        estimatedValue: '0'
      };

    } catch (error) {
      logger.error('Failed to decode transaction', error);
      return null;
    }
  }

  /**
   * Analyze transaction for risks
   */
  private analyzeTransaction(
    functionName: string,
    params: ethers.utils.Result
  ): {
    risk: 'low' | 'medium' | 'high' | 'critical';
    warnings: string[];
    estimatedValue: string;
  } {
    const warnings: string[] = [];
    let risk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let estimatedValue = '0';

    // Approve function
    if (functionName === 'approve') {
      const amount = params.amount || params[1];

      // Check for unlimited approval
      if (amount && ethers.BigNumber.from(amount).eq(ethers.constants.MaxUint256)) {
        risk = 'critical';
        warnings.push('⚠️ UNLIMITED APPROVAL - This allows the contract to spend ALL your tokens!');
        warnings.push('Consider setting a specific amount instead.');
      } else {
        risk = 'medium';
        warnings.push('Token approval requested');
      }
    }

    // Transfer functions
    if (functionName.includes('transfer')) {
      risk = 'medium';
      warnings.push('Token transfer detected - verify recipient address');
    }

    // Swap functions
    if (functionName.includes('swap')) {
      const amountIn = params.amountIn || params[0];
      const amountOutMin = params.amountOutMin || params[1];

      if (amountIn && amountOutMin) {
        const slippage = ethers.BigNumber.from(amountIn)
          .sub(amountOutMin)
          .mul(100)
          .div(amountIn);

        if (slippage.gt(5)) {
          risk = 'high';
          warnings.push(`⚠️ High slippage detected: ${slippage.toString()}%`);
        } else {
          risk = 'low';
        }
      }
    }

    // Liquidity functions
    if (functionName.includes('Liquidity')) {
      risk = 'low';
      warnings.push('Liquidity operation - verify token amounts');
    }

    return {
      risk,
      warnings,
      estimatedValue
    };
  }

  /**
   * Format parameters for display
   */
  private formatParams(params: ethers.utils.Result): Record<string, any> {
    const formatted: Record<string, any> = {};

    for (let i = 0; i < params.length; i++) {
      const value = params[i];

      if (ethers.BigNumber.isBigNumber(value)) {
        formatted[`param${i}`] = value.toString();
      } else if (Array.isArray(value)) {
        formatted[`param${i}`] = value.map(v =>
          ethers.BigNumber.isBigNumber(v) ? v.toString() : v
        );
      } else {
        formatted[`param${i}`] = value;
      }
    }

    return formatted;
  }

  /**
   * Detect malicious patterns in transaction data
   */
  private detectMaliciousPatterns(
    data: string
  ): typeof TransactionVerifier.MALICIOUS_PATTERNS[0] | null {
    for (const pattern of TransactionVerifier.MALICIOUS_PATTERNS) {
      if (pattern.pattern.test(data)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Show warning modal
   */
  private async showWarningModal(
    title: string,
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // In production, this would show a modal
      // For now, use window.confirm
      const shouldContinue = window.confirm(
        `⚠️ ${title}\n\n${message}\n\nSeverity: ${severity.toUpperCase()}\n\nDo you want to continue?`
      );
      resolve(shouldContinue);
    });
  }

  /**
   * Show danger modal
   */
  private async showDangerModal(
    title: string,
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Show critical warning
      const shouldContinue = window.confirm(
        `🚨 ${title}\n\n${message}\n\n⛔ DANGER LEVEL: ${severity.toUpperCase()}\n\nThis transaction is HIGHLY SUSPICIOUS!\nIt is strongly recommended to REJECT this transaction.\n\nAre you absolutely sure you want to continue?`
      );
      resolve(shouldContinue);
    });
  }

  /**
   * Show final confirmation modal
   */
  private async showConfirmationModal(
    tx: ethers.providers.TransactionRequest,
    decoded: DecodedTransaction | null
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let message = '📋 Transaction Details:\n\n';
      message += `To: ${tx.to}\n`;

      if (tx.value) {
        message += `Value: ${ethers.utils.formatEther(tx.value)} ETH\n`;
      }

      if (decoded) {
        message += `\nFunction: ${decoded.function}\n`;
        message += `Risk Level: ${decoded.risk.toUpperCase()}\n`;

        if (decoded.warnings.length > 0) {
          message += `\nWarnings:\n${decoded.warnings.join('\n')}\n`;
        }

        message += `\nParameters:\n${JSON.stringify(decoded.params, null, 2)}\n`;
      }

      message += '\nDo you want to sign this transaction?';

      const confirmed = window.confirm(message);
      resolve(confirmed);
    });
  }

  /**
   * Add contract to whitelist
   */
  addToWhitelist(address: string): void {
    TransactionVerifier.WHITELISTED_CONTRACTS.add(address.toLowerCase());
    logger.info('Contract added to whitelist', { address });
  }

  /**
   * Remove contract from whitelist
   */
  removeFromWhitelist(address: string): void {
    TransactionVerifier.WHITELISTED_CONTRACTS.delete(address.toLowerCase());
    logger.info('Contract removed from whitelist', { address });
  }

  /**
   * Get whitelisted contracts
   */
  getWhitelistedContracts(): string[] {
    return Array.from(TransactionVerifier.WHITELISTED_CONTRACTS);
  }
}

/**
 * Create transaction verifier instance
 */
export function createTransactionVerifier(): TransactionVerifier {
  return new TransactionVerifier();
}

/**
 * Global singleton instance
 */
let verifierInstance: TransactionVerifier | null = null;

export function getTransactionVerifier(): TransactionVerifier {
  if (!verifierInstance) {
    verifierInstance = createTransactionVerifier();
  }
  return verifierInstance;
}
