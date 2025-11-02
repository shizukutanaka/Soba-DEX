import { ethers, parseEther, formatEther, parseUnits, formatUnits, BrowserProvider } from 'ethers';

// DEX Contract ABIs (simplified for demo)
const DEX_ABI = [
  'function getReserves() view returns (uint112, uint112)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) payable',
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB, uint liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)'
];

// SECURITY: Validate Ethereum address format
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// SECURITY: Validate contract addresses on load
function validateContractAddress(name: string, address: string): string {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid contract address for ${name}: ${address}`);
  }
  if (address === '0x0000000000000000000000000000000000000000') {
    console.warn(`WARNING: ${name} address not configured (zero address)`);
  }
  return address;
}

// Contract addresses - Loaded from environment with validation
export const CONTRACT_ADDRESSES = {
  DEX_FACTORY: validateContractAddress(
    'DEX_FACTORY',
    process.env.REACT_APP_DEX_FACTORY || '0x0000000000000000000000000000000000000000'
  ),
  DEX_ROUTER: validateContractAddress(
    'DEX_ROUTER',
    process.env.REACT_APP_DEX_ROUTER || '0x0000000000000000000000000000000000000000'
  ),
  WETH: validateContractAddress(
    'WETH',
    process.env.REACT_APP_WETH || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  ),
  USDC: validateContractAddress(
    'USDC',
    process.env.REACT_APP_USDC || '0xA0b86a33E6417c0e30F9C4c5B94E6c5f4a5e6D1E'
  ),
  USDT: validateContractAddress(
    'USDT',
    process.env.REACT_APP_USDT || '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  )
};

class Web3Service {
  private provider: BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private _contracts: Map<string, ethers.Contract> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      this.initializeWeb3();
    }
  }

  private async initializeWeb3() {
    try {
      if ((window as any).ethereum) {
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        this.provider = new BrowserProvider((window as any).ethereum);
        this.signer = await this.provider.getSigner();
        console.log('Web3 initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize Web3:', error);
    }
  }

  // Get connected wallet address
  async getAccount(): Promise<string | null> {
    if (!this.provider) return null;
    try {
      const accounts = await this.provider.listAccounts();
      return accounts[0] ? await accounts[0].getAddress() : null;
    } catch (error) {
      console.error('Failed to get account:', error);
      return null;
    }
  }

  // Get network information
  async getNetwork(): Promise<{ chainId: number; name: string } | null> {
    if (!this.provider) return null;
    try {
      const network = await this.provider.getNetwork();
      return {
        chainId: Number(network.chainId),
        name: network.name
      };
    } catch (error) {
      console.error('Failed to get network:', error);
      return null;
    }
  }

  // Get token balance
  async getTokenBalance(tokenAddress: string, account?: string): Promise<string> {
    if (!this.provider) throw new Error('Web3 not initialized');

    const address = account || await this.getAccount();
    if (!address) throw new Error('No account connected');

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const balance = await contract.balanceOf(address);
    const decimals = await contract.decimals();

    return formatUnits(balance, decimals);
  }

  // Approve token spending
  async approveToken(tokenAddress: string, spender: string, amount: string): Promise<string> {
    if (!this.signer) throw new Error('No signer available');

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
    const decimals = await contract.decimals();
    const amountBN = parseUnits(amount, decimals);

    const tx = await contract.approve(spender, amountBN);
    await tx.wait();

    return tx.hash;
  }

  // Get DEX pair reserves
  async getPairReserves(pairAddress: string): Promise<{ reserve0: string; reserve1: string }> {
    if (!this.provider) throw new Error('Web3 not initialized');

    const contract = new ethers.Contract(pairAddress, DEX_ABI, this.provider);
    const [reserve0, reserve1] = await contract.getReserves();

    return {
      reserve0: formatEther(reserve0),
      reserve1: formatEther(reserve1)
    };
  }

  // Perform token swap
  async swapTokens(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMin: string,
    to: string,
    _deadline: number
  ): Promise<string> {
    if (!this.signer) throw new Error('No signer available');

    // For demo purposes, using a simple swap contract
    const contract = new ethers.Contract(CONTRACT_ADDRESSES.DEX_ROUTER, DEX_ABI, this.signer);

    const amountInBN = parseEther(amountIn);
    const amountOutMinBN = parseEther(amountOutMin);

    const tx = await contract.swap(
      tokenIn === '0x0000000000000000000000000000000000000000' ? amountOutMinBN : 0,
      tokenOut === '0x0000000000000000000000000000000000000000' ? amountOutMinBN : 0,
      to,
      [],
      { value: tokenIn === '0x0000000000000000000000000000000000000000' ? amountInBN : 0 }
    );

    await tx.wait();
    return tx.hash;
  }

  // Add liquidity to pool
  async addLiquidity(
    tokenA: string,
    tokenB: string,
    amountADesired: string,
    amountBDesired: string,
    amountAMin: string,
    amountBMin: string,
    to: string,
    deadline: number
  ): Promise<string> {
    if (!this.signer) throw new Error('No signer available');

    const contract = new ethers.Contract(CONTRACT_ADDRESSES.DEX_ROUTER, DEX_ABI, this.signer);

    const amountADesiredBN = parseEther(amountADesired);
    const amountBDesiredBN = parseEther(amountBDesired);
    const amountAMinBN = parseEther(amountAMin);
    const amountBMinBN = parseEther(amountBMin);

    const tx = await contract.addLiquidity(
      tokenA,
      tokenB,
      amountADesiredBN,
      amountBDesiredBN,
      amountAMinBN,
      amountBMinBN,
      to,
      deadline
    );

    await tx.wait();
    return tx.hash;
  }

  // Remove liquidity from pool
  async removeLiquidity(
    tokenA: string,
    tokenB: string,
    liquidity: string,
    amountAMin: string,
    amountBMin: string,
    to: string,
    deadline: number
  ): Promise<string> {
    if (!this.signer) throw new Error('No signer available');

    const contract = new ethers.Contract(CONTRACT_ADDRESSES.DEX_ROUTER, DEX_ABI, this.signer);

    const liquidityBN = parseEther(liquidity);
    const amountAMinBN = parseEther(amountAMin);
    const amountBMinBN = parseEther(amountBMin);

    const tx = await contract.removeLiquidity(
      tokenA,
      tokenB,
      liquidityBN,
      amountAMinBN,
      amountBMinBN,
      to,
      deadline
    );

    await tx.wait();
    return tx.hash;
  }

  // Get contract instance
  getContract(address: string, abi: any[] = DEX_ABI): ethers.Contract | null {
    if (!this.provider) return null;
    return new ethers.Contract(address, abi, this.provider);
  }

  // Get signer contract instance
  getSignerContract(address: string, abi: any[] = DEX_ABI): ethers.Contract | null {
    if (!this.signer) return null;
    return new ethers.Contract(address, abi, this.signer);
  }
}

export const web3Service = new Web3Service();
export default web3Service;
