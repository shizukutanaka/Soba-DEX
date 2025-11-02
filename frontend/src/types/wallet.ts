/**
 * Wallet and Blockchain Types
 */

export interface WalletState {
  address: string;
  balance: string;
  chainId: number;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
}

export interface ConnectorOptions {
  name: 'metamask' | 'walletconnect' | 'coinbase' | 'injected';
  provider?: any;
}

export interface SignatureRequest {
  message: string;
  signature?: string;
  address?: string;
}

export interface TransactionRequest {
  to: string;
  from?: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId?: number;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  gasUsed: string;
  status: boolean;
  logs: any[];
}

export interface AllowanceInfo {
  token: string;
  owner: string;
  spender: string;
  amount: string;
}
