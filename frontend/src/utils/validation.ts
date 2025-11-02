// Essential validation utilities
import DOMPurify from 'dompurify';

export const validation = {
  isValidAddress: (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },

  isValidAmount: (amount: string): boolean => {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0 && isFinite(num) && /^\d+(\.\d+)?$/.test(amount);
  },

  isValidPercentage: (percentage: string): boolean => {
    const num = parseFloat(percentage);
    return !isNaN(num) && num >= 0 && num <= 100;
  },

  /**
   * SECURITY: Sanitize user input using DOMPurify to prevent XSS
   */
  sanitizeInput: (input: string): string => {
    const purified = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    return purified.trim();
  },

  /**
   * Sanitize HTML content for display
   */
  sanitizeHtml: (html: string): string => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOW_DATA_ATTR: false
    });
  },

  formatAmount: (amount: string | number, decimals: number = 4): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '0' : num.toFixed(decimals);
  },

  shortenAddress: (address: string): string => {
    if (!validation.isValidAddress(address)) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
};