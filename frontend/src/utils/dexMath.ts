// Essential DEX mathematical calculations
export const dexMath = {
  // Calculate output amount for a swap using constant product formula (x * y = k)
  getAmountOut: (amountIn: number, reserveIn: number, reserveOut: number, fee: number = 0.003): number => {
    if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;

    const amountInWithFee = amountIn * (1 - fee);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn + amountInWithFee;

    return numerator / denominator;
  },

  // Calculate input amount needed for desired output
  getAmountIn: (amountOut: number, reserveIn: number, reserveOut: number, fee: number = 0.003): number => {
    if (amountOut <= 0 || reserveIn <= 0 || reserveOut <= 0 || amountOut >= reserveOut) return 0;

    const numerator = reserveIn * amountOut;
    const denominator = (reserveOut - amountOut) * (1 - fee);

    return numerator / denominator;
  },

  // Calculate price impact of a trade
  getPriceImpact: (amountIn: number, reserveIn: number, reserveOut: number): number => {
    if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;

    const priceBefore = reserveOut / reserveIn;
    const newReserveIn = reserveIn + amountIn;
    const amountOut = dexMath.getAmountOut(amountIn, reserveIn, reserveOut);
    const newReserveOut = reserveOut - amountOut;
    const priceAfter = newReserveOut / newReserveIn;

    return Math.abs((priceAfter - priceBefore) / priceBefore) * 100;
  },

  // Calculate liquidity tokens to mint
  getLiquidityMinted: (
    totalSupply: number,
    amount0: number,
    amount1: number,
    reserve0: number,
    reserve1: number
  ): number => {
    if (totalSupply === 0) {
      return Math.sqrt(amount0 * amount1);
    }

    return Math.min(
      (amount0 * totalSupply) / reserve0,
      (amount1 * totalSupply) / reserve1
    );
  },

  // Calculate tokens received when burning liquidity
  getLiquidityValue: (
    liquidity: number,
    totalSupply: number,
    reserve0: number,
    reserve1: number
  ): { amount0: number; amount1: number } => {
    const amount0 = (liquidity * reserve0) / totalSupply;
    const amount1 = (liquidity * reserve1) / totalSupply;

    return { amount0, amount1 };
  },

  // Calculate minimum amount out considering slippage
  getAmountOutMin: (amountOut: number, slippageTolerance: number): number => {
    return amountOut * (1 - slippageTolerance / 100);
  },

  // Calculate maximum amount in considering slippage
  getAmountInMax: (amountIn: number, slippageTolerance: number): number => {
    return amountIn * (1 + slippageTolerance / 100);
  },

  // Format large numbers with appropriate suffixes
  formatAmount: (amount: number, decimals: number = 2): string => {
    if (amount >= 1e9) {
      return (amount / 1e9).toFixed(decimals) + 'B';
    } else if (amount >= 1e6) {
      return (amount / 1e6).toFixed(decimals) + 'M';
    } else if (amount >= 1e3) {
      return (amount / 1e3).toFixed(decimals) + 'K';
    }
    return amount.toFixed(decimals);
  },

  // Calculate APY for liquidity providers
  calculateAPY: (
    dailyVolume: number,
    totalLiquidity: number,
    feeRate: number = 0.003
  ): number => {
    if (totalLiquidity <= 0) return 0;

    const dailyFees = dailyVolume * feeRate;
    const dailyAPR = dailyFees / totalLiquidity;
    const annualAPY = (Math.pow(1 + dailyAPR, 365) - 1) * 100;

    return annualAPY;
  }
};