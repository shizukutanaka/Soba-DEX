// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract MainnetDEX is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct Pool {
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint256 totalLiquidity;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(address => uint256)) public liquidityBalances;
    mapping(address => bool) public supportedTokens;

    uint256 public constant MINIMUM_LIQUIDITY = 10**3;
    uint256 public feeRate = 30; // 0.3%
    uint256 public constant FEE_DENOMINATOR = 10000;

    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 poolId
    );

    event AddLiquidity(
        address indexed user,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        bytes32 poolId
    );

    event RemoveLiquidity(
        address indexed user,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        bytes32 poolId
    );

    event PoolCreated(
        address indexed token0,
        address indexed token1,
        bytes32 poolId
    );

    constructor() {
        _transferOwnership(msg.sender);
    }

    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
    }

    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
    }

    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 1000, "Fee too high"); // Max 10%
        feeRate = _feeRate;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getPoolId(address token0, address token1) public pure returns (bytes32) {
        (address tokenA, address tokenB) = token0 < token1 ? (token0, token1) : (token1, token0);
        return keccak256(abi.encodePacked(tokenA, tokenB));
    }

    function createPool(address token0, address token1) external whenNotPaused {
        require(token0 != token1, "Identical tokens");
        require(token0 != address(0) && token1 != address(0), "Zero address");
        require(supportedTokens[token0] && supportedTokens[token1], "Unsupported token");

        bytes32 poolId = getPoolId(token0, token1);
        require(pools[poolId].token0 == address(0), "Pool exists");

        (address tokenA, address tokenB) = token0 < token1 ? (token0, token1) : (token1, token0);

        pools[poolId] = Pool({
            token0: tokenA,
            token1: tokenB,
            reserve0: 0,
            reserve1: 0,
            totalLiquidity: 0
        });

        emit PoolCreated(tokenA, tokenB, poolId);
    }

    function addLiquidity(
        address token0,
        address token1,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant whenNotPaused returns (uint256 liquidity) {
        bytes32 poolId = getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        require(pool.token0 != address(0), "Pool does not exist");

        (uint256 amount0, uint256 amount1) = _calculateLiquidityAmounts(
            pool,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min
        );

        IERC20(pool.token0).safeTransferFrom(msg.sender, address(this), amount0);
        IERC20(pool.token1).safeTransferFrom(msg.sender, address(this), amount1);

        if (pool.totalLiquidity == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            liquidityBalances[poolId][address(0)] = MINIMUM_LIQUIDITY;
        } else {
            liquidity = _min(
                (amount0 * pool.totalLiquidity) / pool.reserve0,
                (amount1 * pool.totalLiquidity) / pool.reserve1
            );
        }

        require(liquidity > 0, "Insufficient liquidity minted");

        liquidityBalances[poolId][msg.sender] += liquidity;
        pool.totalLiquidity += liquidity;
        pool.reserve0 += amount0;
        pool.reserve1 += amount1;

        emit AddLiquidity(msg.sender, pool.token0, pool.token1, amount0, amount1, liquidity, poolId);
    }

    function removeLiquidity(
        address token0,
        address token1,
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant whenNotPaused returns (uint256 amount0, uint256 amount1) {
        bytes32 poolId = getPoolId(token0, token1);
        Pool storage pool = pools[poolId];
        require(pool.token0 != address(0), "Pool does not exist");
        require(liquidityBalances[poolId][msg.sender] >= liquidity, "Insufficient liquidity");

        amount0 = (liquidity * pool.reserve0) / pool.totalLiquidity;
        amount1 = (liquidity * pool.reserve1) / pool.totalLiquidity;

        require(amount0 >= amount0Min && amount1 >= amount1Min, "Insufficient output amount");

        liquidityBalances[poolId][msg.sender] -= liquidity;
        pool.totalLiquidity -= liquidity;
        pool.reserve0 -= amount0;
        pool.reserve1 -= amount1;

        IERC20(pool.token0).safeTransfer(msg.sender, amount0);
        IERC20(pool.token1).safeTransfer(msg.sender, amount1);

        emit RemoveLiquidity(msg.sender, pool.token0, pool.token1, amount0, amount1, liquidity, poolId);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        // 1. CHECKS - All validations first
        require(tokenIn != tokenOut, "Identical tokens");
        require(supportedTokens[tokenIn] && supportedTokens[tokenOut], "Unsupported token");
        require(amountIn > 0, "Invalid amount");

        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        require(pool.token0 != address(0), "Pool does not exist");

        bool isToken0 = tokenIn == pool.token0;
        (uint256 reserveIn, uint256 reserveOut) = isToken0
            ? (pool.reserve0, pool.reserve1)
            : (pool.reserve1, pool.reserve0);

        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        // Calculate output amount
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        amountOut = numerator / denominator;

        require(amountOut >= amountOutMin, "Insufficient output amount");
        require(amountOut < reserveOut, "Insufficient liquidity");

        // 2. EFFECTS - Update state BEFORE external calls
        if (isToken0) {
            pool.reserve0 += amountIn;
            pool.reserve1 -= amountOut;
        } else {
            pool.reserve1 += amountIn;
            pool.reserve0 -= amountOut;
        }

        // 3. INTERACTIONS - External calls LAST (Checks-Effects-Interactions pattern)
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, poolId);
    }

    function getAmountOut(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) external view returns (uint256 amountOut) {
        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool memory pool = pools[poolId];
        require(pool.token0 != address(0), "Pool does not exist");

        bool isToken0 = tokenIn == pool.token0;
        (uint256 reserveIn, uint256 reserveOut) = isToken0
            ? (pool.reserve0, pool.reserve1)
            : (pool.reserve1, pool.reserve0);

        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function _calculateLiquidityAmounts(
        Pool memory pool,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (pool.reserve0 == 0 && pool.reserve1 == 0) {
            (amount0, amount1) = (amount0Desired, amount1Desired);
        } else {
            uint256 amount1Optimal = (amount0Desired * pool.reserve1) / pool.reserve0;
            if (amount1Optimal <= amount1Desired) {
                require(amount1Optimal >= amount1Min, "Insufficient amount1");
                (amount0, amount1) = (amount0Desired, amount1Optimal);
            } else {
                uint256 amount0Optimal = (amount1Desired * pool.reserve0) / pool.reserve1;
                require(amount0Optimal <= amount0Desired && amount0Optimal >= amount0Min, "Insufficient amount0");
                (amount0, amount1) = (amount0Optimal, amount1Desired);
            }
        }
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function _min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }
}