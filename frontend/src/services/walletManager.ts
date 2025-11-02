/**
 * Secure Wallet Manager
 *
 * SECURITY: Wallet addresses are stored ONLY in memory (session-only)
 * Never persisted to localStorage to prevent XSS attacks
 */

interface WalletState {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  provider: any | null;
}

class WalletManager {
  private static instance: WalletManager;
  private state: WalletState = {
    address: null,
    chainId: null,
    connected: false,
    provider: null
  };

  private listeners: Set<(state: WalletState) => void> = new Set();

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  /**
   * Connect wallet - stores address only in memory
   */
  connect(address: string, chainId: number, provider: any): void {
    this.state = {
      address: address.toLowerCase(),
      chainId,
      connected: true,
      provider
    };

    this.notifyListeners();
  }

  /**
   * Disconnect wallet - clears all sensitive data
   */
  disconnect(): void {
    this.state = {
      address: null,
      chainId: null,
      connected: false,
      provider: null
    };

    this.notifyListeners();
  }

  /**
   * Get current wallet state
   */
  getState(): Readonly<WalletState> {
    return { ...this.state };
  }

  /**
   * Get wallet address (null if not connected)
   */
  getAddress(): string | null {
    return this.state.address;
  }

  /**
   * Get chain ID
   */
  getChainId(): number | null {
    return this.state.chainId;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.state.connected && this.state.address !== null;
  }

  /**
   * Update chain ID
   */
  updateChainId(chainId: number): void {
    if (this.state.connected) {
      this.state.chainId = chainId;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to wallet state changes
   */
  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in wallet state listener:', error);
      }
    });
  }

  /**
   * Validate Ethereum address format
   */
  static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Format address for display (0x1234...5678)
   */
  static formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}

// Export singleton instance
export const walletManager = WalletManager.getInstance();
export type { WalletState };
