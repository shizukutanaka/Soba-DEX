// Lightweight production-safe logger
export const logger = {
  error: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[DEX Error] ${message}`, data);
    }
    // In production, could send to error tracking service
  },

  warn: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[DEX Warning] ${message}`, data);
    }
  },

  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEX Info] ${message}`, data);
    }
  }
};