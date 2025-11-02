/**
 * Formatters Utility
 *
 * Common formatting functions for numbers, currency, dates
 * Centralized for consistency across the application
 *
 * @version 1.0.0
 */

/**
 * Format number as currency
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(amount);
};

/**
 * Format number as percentage
 */
export const formatPercentage = (value: number, decimals: number = 2): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

/**
 * Format large numbers with K, M, B suffixes
 */
export const formatLargeNumber = (num: number): string => {
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(1)}B`;
  }
  if (num >= 1e6) {
    return `${(num / 1e6).toFixed(1)}M`;
  }
  if (num >= 1e3) {
    return `${(num / 1e3).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Format price change with appropriate decimals
 */
export const formatPriceChange = (change: number): string => {
  if (Math.abs(change) < 0.01) {
    return change.toFixed(6);
  } else if (Math.abs(change) < 0.1) {
    return change.toFixed(4);
  } else if (Math.abs(change) < 1) {
    return change.toFixed(3);
  } else {
    return change.toFixed(2);
  }
};

/**
 * Format trading amount
 */
export const formatTradingAmount = (amount: string | number): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num)) return '0';

  if (num < 0.000001) {
    return num.toFixed(8);
  } else if (num < 0.01) {
    return num.toFixed(6);
  } else if (num < 1) {
    return num.toFixed(4);
  } else {
    return num.toFixed(2);
  }
};

/**
 * Format gas price in gwei
 */
export const formatGasPrice = (gasPrice: number): string => {
  return `${gasPrice.toFixed(0)} gwei`;
};

/**
 * Format wallet address for display
 */
export const formatAddress = (address: string, chars: number = 4): string => {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};

/**
 * Format transaction hash for display
 */
export const formatTxHash = (hash: string, chars: number = 6): string => {
  return formatAddress(hash, chars);
};

/**
 * Format date for display
 */
export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format time ago (simplified)
 */
export const formatTimeAgo = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(d);
};
