/**
 * Component Props and State Types
 */

import { PriceData, Pool, Transaction, PriceAlert, TokenBalance } from './api';

export interface SwapPanelProps {
  onSwap?: (tokenIn: string, tokenOut: string, amount: string) => void;
  onError?: (error: string) => void;
  isLoading?: boolean;
}

export interface SwapFormData {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  slippage: number;
}

export interface LiquidityPanelProps {
  onAddLiquidity?: (token0: string, token1: string, amount0: string, amount1: string) => void;
  onRemoveLiquidity?: (poolId: string, amount: string) => void;
  pools?: Pool[];
  isLoading?: boolean;
}

export interface TradingViewProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  interval?: string;
  theme?: 'light' | 'dark';
}

export interface PortfolioProps {
  address: string;
  balances?: TokenBalance[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export interface PriceAlertsProps {
  alerts?: PriceAlert[];
  onCreateAlert?: (symbol: string, targetPrice: number, condition: 'above' | 'below') => void;
  onDeleteAlert?: (id: number) => void;
  isLoading?: boolean;
}

export interface WalletConnectProps {
  onConnect?: (address: string, balance: string) => void;
  onDisconnect?: () => void;
  isConnected?: boolean;
  address?: string;
  balance?: string;
}

export interface OrderBookProps {
  symbol: string;
  maxRows?: number;
  precision?: number;
}

export interface TradeHistoryProps {
  transactions?: Transaction[];
  address?: string;
  limit?: number;
  onLoadMore?: () => void;
}

export interface ChartData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartConfig {
  symbol: string;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  theme: 'light' | 'dark';
  indicators: string[];
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

export interface ToastOptions {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface TableColumn<T = any> {
  key: keyof T;
  label: string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface TableProps<T = any> {
  data: T[];
  columns: TableColumn<T>[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}
