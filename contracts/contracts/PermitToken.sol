// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PermitToken
 * @notice ERC20 token with EIP-2612 permit functionality
 * @dev Enables gasless approvals via off-chain signatures
 *
 * EIP-2612: Permit Extension for ERC-20
 * - Allows approvals via signatures instead of transactions
 * - Users sign approval off-chain, submit with swap transaction
 * - Reduces user friction from 2 transactions to 1
 * - Better UX than traditional approve + transferFrom pattern
 *
 * Use Cases:
 * - DEX swaps (permit + swap in single tx)
 * - Meta-transactions
 * - Gasless token operations
 * - Delegation of approvals
 *
 * Signature Format (EIP-712):
 * - Domain separator includes contract address and chain ID
 * - Prevents replay attacks across contracts/chains
 * - Includes nonce for replay protection
 * - Has expiration deadline
 */
contract PermitToken is ERC20, ERC20Permit, ERC20Burnable, Ownable {
    /**
     * @notice Constructor
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Mint new tokens (only owner)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Get current nonce for permit
     * @param owner Address to check nonce for
     * @return Current nonce
     */
    function getNonce(address owner) external view returns (uint256) {
        return nonces(owner);
    }

    /**
     * @notice Get domain separator for EIP-712
     * @return Domain separator hash
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}

/**
 * @title PermitRouter
 * @notice Router that accepts permit signatures and executes swaps atomically
 * @dev Combines approve + swap into single transaction via permit()
 */
contract PermitRouter {
    /**
     * @notice Swap tokens using permit
     * @param tokenIn Input token with permit support
     * @param tokenOut Output token
     * @param amountIn Amount to swap
     * @param minAmountOut Minimum output amount
     * @param deadline Permit and swap deadline
     * @param v Signature v
     * @param r Signature r
     * @param s Signature s
     */
    function swapWithPermit(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address swapTarget
    ) external {
        // Step 1: Use permit to approve this router
        IERC20Permit(tokenIn).permit(
            msg.sender,
            address(this),
            amountIn,
            deadline,
            v,
            r,
            s
        );

        // Step 2: Execute swap
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Call swap contract (simplified)
        // In production, this would call the actual swap router
        uint256 amountOut = _executeSwap(tokenIn, tokenOut, amountIn);

        require(amountOut >= minAmountOut, "Insufficient output");

        IERC20(tokenOut).transfer(msg.sender, amountOut);
    }

    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256) {
        // Placeholder swap logic
        return amountIn;
    }
}

/**
 * @title MultiPermitRouter
 * @notice Advanced router supporting multiple permits in single transaction
 * @dev Enables complex operations like: permit A, permit B, add liquidity
 */
contract MultiPermitRouter {
    struct PermitData {
        address token;
        uint256 amount;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * @notice Add liquidity with permits for both tokens
     * @param permits Array of permit data for each token
     * @param pool Liquidity pool address
     * @param amounts Token amounts to add
     * @param minLP Minimum LP tokens to receive
     */
    function addLiquidityWithPermits(
        PermitData[] calldata permits,
        address pool,
        uint256[] calldata amounts,
        uint256 minLP
    ) external returns (uint256 lpAmount) {
        require(permits.length == 2, "Need 2 permits");
        require(amounts.length == 2, "Need 2 amounts");

        // Execute permits
        for (uint256 i = 0; i < permits.length; i++) {
            IERC20Permit(permits[i].token).permit(
                msg.sender,
                address(this),
                permits[i].amount,
                permits[i].deadline,
                permits[i].v,
                permits[i].r,
                permits[i].s
            );

            // Transfer tokens
            IERC20(permits[i].token).transferFrom(
                msg.sender,
                address(this),
                amounts[i]
            );
        }

        // Add liquidity (simplified)
        lpAmount = minLP; // Placeholder

        require(lpAmount >= minLP, "Insufficient LP");
    }

    /**
     * @notice Batch swap with permits
     * @param permits Permit data for each swap
     * @param swapData Encoded swap data
     */
    function batchSwapWithPermits(
        PermitData[] calldata permits,
        bytes[] calldata swapData
    ) external {
        require(permits.length == swapData.length, "Length mismatch");

        // Execute all permits first
        for (uint256 i = 0; i < permits.length; i++) {
            IERC20Permit(permits[i].token).permit(
                msg.sender,
                address(this),
                permits[i].amount,
                permits[i].deadline,
                permits[i].v,
                permits[i].r,
                permits[i].s
            );
        }

        // Execute all swaps
        for (uint256 i = 0; i < swapData.length; i++) {
            // Decode and execute swap
            // (Implementation depends on swap format)
        }
    }
}

// Interface for ERC20Permit
interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function nonces(address owner) external view returns (uint256);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
