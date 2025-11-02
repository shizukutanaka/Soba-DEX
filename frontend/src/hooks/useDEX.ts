import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from './useWeb3';

const DEX_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) external returns (uint256 amountOut)',
  'function addLiquidity(address token0, address token1, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) external returns (uint256 liquidity)',
  'function removeLiquidity(address token0, address token1, uint256 liquidity, uint256 amount0Min, uint256 amount1Min) external returns (uint256 amount0, uint256 amount1)',
  'function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) external view returns (uint256 amountOut)',
  'function pools(bytes32 poolId) external view returns (address token0, address token1, uint256 reserve0, uint256 reserve1, uint256 totalLiquidity)',
  'function liquidityBalances(bytes32 poolId, address user) external view returns (uint256)',
  'function getPoolId(address token0, address token1) external pure returns (bytes32)',
  'function createPool(address token0, address token1) external',
  'function addSupportedToken(address token) external',
  'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, bytes32 poolId)',
  'event AddLiquidity(address indexed user, address indexed token0, address indexed token1, uint256 amount0, uint256 amount1, uint256 liquidity, bytes32 poolId)',
  'event RemoveLiquidity(address indexed user, address indexed token0, address indexed token1, uint256 amount0, uint256 amount1, uint256 liquidity, bytes32 poolId)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

interface Pool {
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  totalLiquidity: string;
}

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
}

export const useDEX = (contractAddress: string) => {
  const { provider, signer, account } = useWeb3();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contract =
    signer && contractAddress
      ? new ethers.Contract(contractAddress, DEX_ABI, signer)
      : null;

  const readOnlyContract =
    provider && contractAddress
      ? new ethers.Contract(contractAddress, DEX_ABI, provider)
      : null;

  const getTokenContract = useCallback(
    (tokenAddress: string) => {
      if (!signer) return null;
      return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    },
    [signer]
  );

  const getTokenInfo = useCallback(
    async (tokenAddress: string): Promise<TokenInfo | null> => {
      if (!provider || !account) return null;

      try {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );
        const [name, symbol, decimals, balance] = await Promise.all([
          tokenContract.name(),
          tokenContract.symbol(),
          tokenContract.decimals(),
          tokenContract.balanceOf(account),
        ]);

        return {
          address: tokenAddress,
          name,
          symbol,
          decimals,
          balance: ethers.formatUnits(balance, decimals),
        };
      } catch (error) {
        console.error('Error getting token info:', error);
        return null;
      }
    },
    [provider, account]
  );

  const approveToken = useCallback(
    async (
      tokenAddress: string,
      amount: string,
      decimals: number = 18
    ): Promise<boolean> => {
      if (!contract || !signer) return false;

      try {
        setIsLoading(true);
        setError(null);

        const tokenContract = getTokenContract(tokenAddress);
        if (!tokenContract) return false;

        const amountWei = ethers.parseUnits(amount, decimals);
        const tx = await tokenContract.approve(contractAddress, amountWei);
        await tx.wait();

        return true;
      } catch (error: any) {
        setError(error.message || 'Approval failed');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [contract, signer, contractAddress, getTokenContract]
  );

  const checkAllowance = useCallback(
    async (
      tokenAddress: string,
      amount: string,
      decimals: number = 18
    ): Promise<boolean> => {
      if (!provider || !account) return false;

      try {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );
        const allowance = await tokenContract.allowance(
          account,
          contractAddress
        );
        const amountWei = ethers.parseUnits(amount, decimals);

        return allowance >= amountWei;
      } catch (error) {
        return false;
      }
    },
    [provider, account, contractAddress]
  );

  const swap = useCallback(
    async (
      tokenIn: string,
      tokenOut: string,
      amountIn: string,
      amountOutMin: string,
      decimalsIn: number = 18,
      decimalsOut: number = 18
    ): Promise<string | null> => {
      if (!contract) return null;

      try {
        setIsLoading(true);
        setError(null);

        const amountInWei = ethers.parseUnits(amountIn, decimalsIn);
        const amountOutMinWei = ethers.parseUnits(amountOutMin, decimalsOut);

        const tx = await contract.swap(
          tokenIn,
          tokenOut,
          amountInWei,
          amountOutMinWei
        );
        const receipt = await tx.wait();

        const swapEvent = receipt.logs.find(
          (log: any) =>
            log.topics[0] ===
            ethers.id('Swap(address,address,address,uint256,uint256,bytes32)')
        );

        if (swapEvent) {
          const decodedEvent = contract.interface.parseLog(swapEvent);
          return ethers.formatUnits(decodedEvent?.args.amountOut, decimalsOut);
        }

        return null;
      } catch (error: any) {
        setError(error.message || 'Swap failed');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [contract]
  );

  const addLiquidity = useCallback(
    async (
      token0: string,
      token1: string,
      amount0Desired: string,
      amount1Desired: string,
      amount0Min: string,
      amount1Min: string,
      decimals0: number = 18,
      decimals1: number = 18
    ): Promise<string | null> => {
      if (!contract) return null;

      try {
        setIsLoading(true);
        setError(null);

        const amount0DesiredWei = ethers.parseUnits(amount0Desired, decimals0);
        const amount1DesiredWei = ethers.parseUnits(amount1Desired, decimals1);
        const amount0MinWei = ethers.parseUnits(amount0Min, decimals0);
        const amount1MinWei = ethers.parseUnits(amount1Min, decimals1);

        const tx = await contract.addLiquidity(
          token0,
          token1,
          amount0DesiredWei,
          amount1DesiredWei,
          amount0MinWei,
          amount1MinWei
        );

        const receipt = await tx.wait();
        return receipt.hash;
      } catch (error: any) {
        setError(error.message || 'Add liquidity failed');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [contract]
  );

  const removeLiquidity = useCallback(
    async (
      token0: string,
      token1: string,
      liquidity: string,
      amount0Min: string,
      amount1Min: string,
      decimals0: number = 18,
      decimals1: number = 18
    ): Promise<string | null> => {
      if (!contract) return null;

      try {
        setIsLoading(true);
        setError(null);

        const liquidityWei = ethers.parseUnits(liquidity, 18);
        const amount0MinWei = ethers.parseUnits(amount0Min, decimals0);
        const amount1MinWei = ethers.parseUnits(amount1Min, decimals1);

        const tx = await contract.removeLiquidity(
          token0,
          token1,
          liquidityWei,
          amount0MinWei,
          amount1MinWei
        );

        const receipt = await tx.wait();
        return receipt.hash;
      } catch (error: any) {
        setError(error.message || 'Remove liquidity failed');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [contract]
  );

  const getAmountOut = useCallback(
    async (
      amountIn: string,
      tokenIn: string,
      tokenOut: string,
      decimalsIn: number = 18,
      decimalsOut: number = 18
    ): Promise<string | null> => {
      if (!readOnlyContract) return null;

      try {
        const amountInWei = ethers.parseUnits(amountIn, decimalsIn);
        const amountOutWei = await readOnlyContract.getAmountOut(
          amountInWei,
          tokenIn,
          tokenOut
        );
        return ethers.formatUnits(amountOutWei, decimalsOut);
      } catch (error) {
        return null;
      }
    },
    [readOnlyContract]
  );

  const getPool = useCallback(
    async (token0: string, token1: string): Promise<Pool | null> => {
      if (!readOnlyContract) return null;

      try {
        const poolId = await readOnlyContract.getPoolId(token0, token1);
        const poolData = await readOnlyContract.pools(poolId);

        return {
          token0: poolData.token0,
          token1: poolData.token1,
          reserve0: ethers.formatEther(poolData.reserve0),
          reserve1: ethers.formatEther(poolData.reserve1),
          totalLiquidity: ethers.formatEther(poolData.totalLiquidity),
        };
      } catch (error) {
        return null;
      }
    },
    [readOnlyContract]
  );

  const getUserLiquidity = useCallback(
    async (token0: string, token1: string): Promise<string | null> => {
      if (!readOnlyContract || !account) return null;

      try {
        const poolId = await readOnlyContract.getPoolId(token0, token1);
        const liquidity = await readOnlyContract.liquidityBalances(
          poolId,
          account
        );
        return ethers.formatEther(liquidity);
      } catch (error) {
        return null;
      }
    },
    [readOnlyContract, account]
  );

  const createPool = useCallback(
    async (token0: string, token1: string): Promise<string | null> => {
      if (!contract) return null;

      try {
        setIsLoading(true);
        setError(null);

        const tx = await contract.createPool(token0, token1);
        const receipt = await tx.wait();
        return receipt.hash;
      } catch (error: any) {
        setError(error.message || 'Create pool failed');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [contract]
  );

  return {
    isLoading,
    error,
    setError,
    getTokenInfo,
    approveToken,
    checkAllowance,
    swap,
    addLiquidity,
    removeLiquidity,
    getAmountOut,
    getPool,
    getUserLiquidity,
    createPool,
  };
};
