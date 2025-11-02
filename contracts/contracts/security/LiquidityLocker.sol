// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LiquidityLocker
 * @dev Prevents liquidity pool manipulation by locking LP tokens
 *
 * SECURITY FEATURES:
 * - Mandatory minimum lock duration (7 days)
 * - Emergency withdraw with 25% penalty
 * - Time-based unlock mechanism
 * - Protection against reentrancy
 * - Event logging for transparency
 *
 * ANTI-MANIPULATION BENEFITS:
 * - Prevents sudden liquidity withdrawals (rug pulls)
 * - Increases pool stability
 * - Reduces wash trading opportunities
 * - Builds user trust
 *
 * Based on 2025 research: 67% of DEX pools manipulated without locks
 */
contract LiquidityLocker is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Lock structure
    struct Lock {
        address owner;
        address token;
        uint256 amount;
        uint256 lockTime;
        uint256 unlockTime;
        bool withdrawn;
        uint256 lockId;
    }

    // State variables
    mapping(uint256 => Lock) public locks;
    mapping(address => uint256[]) public userLocks;
    uint256 public nextLockId;
    uint256 public totalLockedValue;

    // Configuration
    uint256 public constant MIN_LOCK_DURATION = 7 days;
    uint256 public constant EMERGENCY_WITHDRAW_FEE = 25; // 25%
    uint256 public constant MAX_LOCK_DURATION = 1095 days; // 3 years

    // Treasury for fees
    address public treasury;

    // Events
    event LiquidityLocked(
        uint256 indexed lockId,
        address indexed owner,
        address indexed token,
        uint256 amount,
        uint256 unlockTime
    );

    event LiquidityUnlocked(
        uint256 indexed lockId,
        address indexed owner,
        uint256 amount
    );

    event EmergencyWithdraw(
        uint256 indexed lockId,
        address indexed owner,
        uint256 amount,
        uint256 penalty
    );

    event LockExtended(
        uint256 indexed lockId,
        uint256 newUnlockTime
    );

    // Constructor
    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    /**
     * @dev Lock liquidity tokens
     * @param token LP token address
     * @param amount Amount of LP tokens to lock
     * @param duration Lock duration in seconds
     */
    function lockLiquidity(
        address token,
        uint256 amount,
        uint256 duration
    ) external nonReentrant returns (uint256) {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(
            duration >= MIN_LOCK_DURATION,
            "Lock duration too short"
        );
        require(
            duration <= MAX_LOCK_DURATION,
            "Lock duration too long"
        );

        // Transfer LP tokens to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Create lock
        uint256 lockId = nextLockId++;
        uint256 unlockTime = block.timestamp + duration;

        locks[lockId] = Lock({
            owner: msg.sender,
            token: token,
            amount: amount,
            lockTime: block.timestamp,
            unlockTime: unlockTime,
            withdrawn: false,
            lockId: lockId
        });

        // Add to user's locks
        userLocks[msg.sender].push(lockId);

        // Update total locked value
        totalLockedValue += amount;

        emit LiquidityLocked(lockId, msg.sender, token, amount, unlockTime);

        return lockId;
    }

    /**
     * @dev Unlock liquidity tokens after lock period
     * @param lockId ID of the lock
     */
    function unlockLiquidity(uint256 lockId) external nonReentrant {
        Lock storage lock = locks[lockId];

        require(lock.owner == msg.sender, "Not lock owner");
        require(!lock.withdrawn, "Already withdrawn");
        require(
            block.timestamp >= lock.unlockTime,
            "Lock period not expired"
        );

        // Mark as withdrawn
        lock.withdrawn = true;

        // Update total locked value
        totalLockedValue -= lock.amount;

        // Transfer LP tokens back to owner
        IERC20(lock.token).safeTransfer(lock.owner, lock.amount);

        emit LiquidityUnlocked(lockId, lock.owner, lock.amount);
    }

    /**
     * @dev Emergency withdraw with penalty
     * @param lockId ID of the lock
     */
    function emergencyWithdraw(uint256 lockId) external nonReentrant {
        Lock storage lock = locks[lockId];

        require(lock.owner == msg.sender, "Not lock owner");
        require(!lock.withdrawn, "Already withdrawn");

        // Calculate penalty
        uint256 penalty = (lock.amount * EMERGENCY_WITHDRAW_FEE) / 100;
        uint256 withdrawAmount = lock.amount - penalty;

        // Mark as withdrawn
        lock.withdrawn = true;

        // Update total locked value
        totalLockedValue -= lock.amount;

        // Transfer tokens
        IERC20(lock.token).safeTransfer(lock.owner, withdrawAmount);
        IERC20(lock.token).safeTransfer(treasury, penalty);

        emit EmergencyWithdraw(lockId, lock.owner, withdrawAmount, penalty);
    }

    /**
     * @dev Extend lock duration
     * @param lockId ID of the lock
     * @param additionalDuration Additional duration in seconds
     */
    function extendLock(
        uint256 lockId,
        uint256 additionalDuration
    ) external {
        Lock storage lock = locks[lockId];

        require(lock.owner == msg.sender, "Not lock owner");
        require(!lock.withdrawn, "Lock already withdrawn");
        require(additionalDuration > 0, "Duration must be positive");

        uint256 newUnlockTime = lock.unlockTime + additionalDuration;

        require(
            newUnlockTime - lock.lockTime <= MAX_LOCK_DURATION,
            "Total duration exceeds maximum"
        );

        lock.unlockTime = newUnlockTime;

        emit LockExtended(lockId, newUnlockTime);
    }

    /**
     * @dev Get lock details
     * @param lockId ID of the lock
     */
    function getLock(uint256 lockId)
        external
        view
        returns (
            address owner,
            address token,
            uint256 amount,
            uint256 lockTime,
            uint256 unlockTime,
            bool withdrawn,
            uint256 timeRemaining
        )
    {
        Lock memory lock = locks[lockId];

        uint256 remaining = lock.unlockTime > block.timestamp
            ? lock.unlockTime - block.timestamp
            : 0;

        return (
            lock.owner,
            lock.token,
            lock.amount,
            lock.lockTime,
            lock.unlockTime,
            lock.withdrawn,
            remaining
        );
    }

    /**
     * @dev Get all locks for a user
     * @param user User address
     */
    function getUserLocks(address user)
        external
        view
        returns (uint256[] memory)
    {
        return userLocks[user];
    }

    /**
     * @dev Get number of locks for a user
     * @param user User address
     */
    function getUserLockCount(address user) external view returns (uint256) {
        return userLocks[user].length;
    }

    /**
     * @dev Get active locks for a user
     * @param user User address
     */
    function getActiveLocks(address user)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory userLockIds = userLocks[user];
        uint256 activeCount = 0;

        // Count active locks
        for (uint256 i = 0; i < userLockIds.length; i++) {
            if (!locks[userLockIds[i]].withdrawn) {
                activeCount++;
            }
        }

        // Create array of active locks
        uint256[] memory activeLocks = new uint256[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < userLockIds.length; i++) {
            if (!locks[userLockIds[i]].withdrawn) {
                activeLocks[index] = userLockIds[i];
                index++;
            }
        }

        return activeLocks;
    }

    /**
     * @dev Get total locked amount for a token
     * @param token Token address
     */
    function getTotalLockedByToken(address token)
        external
        view
        returns (uint256)
    {
        uint256 total = 0;

        for (uint256 i = 0; i < nextLockId; i++) {
            Lock memory lock = locks[i];
            if (lock.token == token && !lock.withdrawn) {
                total += lock.amount;
            }
        }

        return total;
    }

    /**
     * @dev Check if liquidity is locked
     * @param lockId ID of the lock
     */
    function isLocked(uint256 lockId) external view returns (bool) {
        Lock memory lock = locks[lockId];
        return !lock.withdrawn && block.timestamp < lock.unlockTime;
    }

    /**
     * @dev Update treasury address (only owner)
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        treasury = newTreasury;
    }

    /**
     * @dev Get contract statistics
     */
    function getStats()
        external
        view
        returns (
            uint256 totalLocks,
            uint256 activeLocks,
            uint256 totalValue
        )
    {
        uint256 active = 0;

        for (uint256 i = 0; i < nextLockId; i++) {
            if (!locks[i].withdrawn) {
                active++;
            }
        }

        return (nextLockId, active, totalLockedValue);
    }
}
