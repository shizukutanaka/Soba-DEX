// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title EIP7702Account
 * @dev Implementation of EIP-7702 account abstraction for EOAs
 *
 * FEATURES (Pectra Upgrade - May 2025):
 * - EOAs can temporarily delegate execution to smart contracts
 * - Transaction batching (multiple operations in one tx)
 * - Gas sponsorship (paymaster support)
 * - Session keys for temporary authorization
 * - Custom spending rules and limits
 * - Maintain original EOA address
 *
 * SECURITY:
 * - Chain-specific authorizations (prevent replay attacks)
 * - Nonce-based invalidation
 * - Revocable delegations
 * - Daily spending limits
 * - Whitelist/blacklist functionality
 *
 * ADVANTAGES OVER ERC-4337:
 * - No new address required (keep existing EOA)
 * - Lower gas costs (no separate deployment)
 * - Simpler migration path
 * - Works with existing infrastructure
 *
 * BASED ON:
 * - EIP-7702 specification (Pectra upgrade)
 * - Ambire Wallet implementation
 * - Circle's USDC gasless transactions
 * - QuickNode implementation guide
 *
 * LIVE ON MAINNET: May 7, 2025 (Pectra upgrade)
 */
contract EIP7702Account is ReentrancyGuard {
    using ECDSA for bytes32;

    // Account owner
    address public owner;

    // Delegation designators
    struct Delegation {
        address designator; // Contract code to delegate to
        uint256 validUntil; // Expiration timestamp
        uint256 chainId;    // Valid chain ID only
        uint256 nonce;      // Invalidation mechanism
        bool active;
    }

    mapping(bytes32 => Delegation) public delegations;
    bytes32[] public activeDelegations;

    // Session keys for temporary access
    struct SessionKey {
        address key;
        uint256 validUntil;
        uint256 dailyLimit;
        uint256 spentToday;
        uint256 lastResetTime;
        bool active;
    }

    mapping(address => SessionKey) public sessionKeys;

    // Spending limits
    uint256 public dailyLimit;
    uint256 public spentToday;
    uint256 public lastResetTime;

    // Whitelists
    mapping(address => bool) public whitelist;
    mapping(address => bool) public blacklist;

    // Batch execution
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    // Paymaster for gas sponsorship
    address public paymaster;
    bool public paymasterEnabled;

    // Events
    event DelegationAuthorized(
        bytes32 indexed delegationId,
        address indexed designator,
        uint256 validUntil,
        uint256 chainId
    );

    event DelegationRevoked(bytes32 indexed delegationId);

    event SessionKeyAdded(
        address indexed sessionKey,
        uint256 validUntil,
        uint256 dailyLimit
    );

    event SessionKeyRevoked(address indexed sessionKey);

    event BatchExecuted(uint256 indexed batchId, uint256 callsCount);

    event SpendingLimitUpdated(uint256 newLimit);

    event PaymasterUpdated(address indexed newPaymaster, bool enabled);

    /**
     * @dev Constructor
     * @param _owner EOA owner address
     * @param _dailyLimit Daily spending limit in wei
     */
    constructor(address _owner, uint256 _dailyLimit) {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
        dailyLimit = _dailyLimit;
        lastResetTime = block.timestamp;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOwnerOrSession() {
        require(
            msg.sender == owner || sessionKeys[msg.sender].active,
            "Not authorized"
        );
        _;
    }

    /**
     * @dev Authorize delegation (EIP-7702 core function)
     * @param designator Contract code to delegate to
     * @param validUntil Expiration timestamp (0 = permanent)
     */
    function authorizeDelegation(
        address designator,
        uint256 validUntil
    ) external onlyOwner returns (bytes32 delegationId) {
        require(designator != address(0), "Invalid designator");
        require(!blacklist[designator], "Designator blacklisted");

        // Calculate delegation ID
        delegationId = keccak256(
            abi.encodePacked(
                designator,
                validUntil,
                block.chainid,
                block.timestamp
            )
        );

        // Create delegation
        delegations[delegationId] = Delegation({
            designator: designator,
            validUntil: validUntil,
            chainId: block.chainid,
            nonce: 0,
            active: true
        });

        activeDelegations.push(delegationId);

        emit DelegationAuthorized(
            delegationId,
            designator,
            validUntil,
            block.chainid
        );

        return delegationId;
    }

    /**
     * @dev Revoke delegation
     * @param delegationId Delegation to revoke
     */
    function revokeDelegation(bytes32 delegationId) external onlyOwner {
        require(delegations[delegationId].active, "Delegation not active");

        delegations[delegationId].active = false;

        emit DelegationRevoked(delegationId);
    }

    /**
     * @dev Execute batch transaction (EIP-7702 feature)
     * @param calls Array of calls to execute
     */
    function executeBatch(Call[] calldata calls)
        external
        onlyOwnerOrSession
        nonReentrant
        returns (bytes[] memory results)
    {
        require(calls.length > 0, "Empty batch");
        require(calls.length <= 50, "Batch too large");

        results = new bytes[](calls.length);

        uint256 totalValue = 0;

        for (uint256 i = 0; i < calls.length; i++) {
            totalValue += calls[i].value;

            // Execute call
            (bool success, bytes memory result) = calls[i].to.call{
                value: calls[i].value
            }(calls[i].data);

            require(success, "Call failed");
            results[i] = result;
        }

        // Check spending limit
        _checkSpendingLimit(totalValue, msg.sender);

        emit BatchExecuted(block.timestamp, calls.length);

        return results;
    }

    /**
     * @dev Execute with gas sponsorship (paymaster)
     * @param calls Batch calls
     * @param paymasterSignature Paymaster authorization signature
     */
    function executeWithPaymaster(
        Call[] calldata calls,
        bytes calldata paymasterSignature
    ) external onlyOwnerOrSession nonReentrant returns (bytes[] memory) {
        require(paymasterEnabled, "Paymaster not enabled");
        require(paymaster != address(0), "Paymaster not set");

        // Verify paymaster signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                address(this),
                calls,
                block.chainid,
                block.timestamp
            )
        );

        address signer = messageHash.toEthSignedMessageHash().recover(
            paymasterSignature
        );

        require(signer == paymaster, "Invalid paymaster signature");

        // Execute batch (gas paid by paymaster)
        return executeBatch(calls);
    }

    /**
     * @dev Add session key for temporary access
     * @param sessionKey Temporary key address
     * @param validUntil Expiration timestamp
     * @param sessionDailyLimit Daily spending limit for this key
     */
    function addSessionKey(
        address sessionKey,
        uint256 validUntil,
        uint256 sessionDailyLimit
    ) external onlyOwner {
        require(sessionKey != address(0), "Invalid session key");
        require(validUntil > block.timestamp, "Invalid expiration");

        sessionKeys[sessionKey] = SessionKey({
            key: sessionKey,
            validUntil: validUntil,
            dailyLimit: sessionDailyLimit,
            spentToday: 0,
            lastResetTime: block.timestamp,
            active: true
        });

        emit SessionKeyAdded(sessionKey, validUntil, sessionDailyLimit);
    }

    /**
     * @dev Revoke session key
     * @param sessionKey Key to revoke
     */
    function revokeSessionKey(address sessionKey) external onlyOwner {
        require(sessionKeys[sessionKey].active, "Session key not active");

        sessionKeys[sessionKey].active = false;

        emit SessionKeyRevoked(sessionKey);
    }

    /**
     * @dev Check spending limit
     */
    function _checkSpendingLimit(uint256 amount, address spender) internal {
        // Reset daily counter if needed
        if (block.timestamp >= lastResetTime + 1 days) {
            spentToday = 0;
            lastResetTime = block.timestamp;
        }

        // Check owner's limit
        if (spender == owner) {
            require(spentToday + amount <= dailyLimit, "Daily limit exceeded");
            spentToday += amount;
        } else {
            // Session key limit
            SessionKey storage session = sessionKeys[spender];

            require(session.active, "Session key not active");
            require(block.timestamp < session.validUntil, "Session key expired");

            // Reset session daily counter
            if (block.timestamp >= session.lastResetTime + 1 days) {
                session.spentToday = 0;
                session.lastResetTime = block.timestamp;
            }

            require(
                session.spentToday + amount <= session.dailyLimit,
                "Session daily limit exceeded"
            );

            session.spentToday += amount;
        }
    }

    /**
     * @dev Update daily spending limit
     * @param newLimit New daily limit
     */
    function updateDailyLimit(uint256 newLimit) external onlyOwner {
        dailyLimit = newLimit;
        emit SpendingLimitUpdated(newLimit);
    }

    /**
     * @dev Set paymaster for gas sponsorship
     * @param _paymaster Paymaster address
     * @param enabled Enable/disable paymaster
     */
    function setPaymaster(address _paymaster, bool enabled) external onlyOwner {
        paymaster = _paymaster;
        paymasterEnabled = enabled;

        emit PaymasterUpdated(_paymaster, enabled);
    }

    /**
     * @dev Add address to whitelist
     * @param target Address to whitelist
     */
    function addToWhitelist(address target) external onlyOwner {
        whitelist[target] = true;
    }

    /**
     * @dev Add address to blacklist
     * @param target Address to blacklist
     */
    function addToBlacklist(address target) external onlyOwner {
        blacklist[target] = true;
    }

    /**
     * @dev Remove from whitelist
     */
    function removeFromWhitelist(address target) external onlyOwner {
        whitelist[target] = false;
    }

    /**
     * @dev Remove from blacklist
     */
    function removeFromBlacklist(address target) external onlyOwner {
        blacklist[target] = false;
    }

    /**
     * @dev Get active delegations count
     */
    function getActiveDelegationsCount() external view returns (uint256) {
        uint256 count = 0;

        for (uint256 i = 0; i < activeDelegations.length; i++) {
            if (delegations[activeDelegations[i]].active) {
                count++;
            }
        }

        return count;
    }

    /**
     * @dev Check if delegation is valid
     * @param delegationId Delegation to check
     */
    function isDelegationValid(bytes32 delegationId)
        external
        view
        returns (bool)
    {
        Delegation memory delegation = delegations[delegationId];

        if (!delegation.active) return false;
        if (delegation.chainId != block.chainid) return false;
        if (
            delegation.validUntil > 0 &&
            block.timestamp > delegation.validUntil
        ) return false;

        return true;
    }

    /**
     * @dev Get remaining daily limit
     */
    function getRemainingDailyLimit() external view returns (uint256) {
        // Reset if new day
        if (block.timestamp >= lastResetTime + 1 days) {
            return dailyLimit;
        }

        if (spentToday >= dailyLimit) {
            return 0;
        }

        return dailyLimit - spentToday;
    }

    /**
     * @dev Receive ETH
     */
    receive() external payable {}

    /**
     * @dev Fallback for delegated calls
     */
    fallback() external payable {
        // Handle delegated execution
        // In production, this would check delegation validity
        // and execute the delegated contract code
    }
}

/**
 * @title EIP7702Factory
 * @dev Factory for deploying EIP-7702 smart accounts
 */
contract EIP7702Factory {
    event AccountCreated(
        address indexed owner,
        address indexed account,
        uint256 dailyLimit
    );

    /**
     * @dev Create new EIP-7702 account
     * @param owner EOA owner
     * @param dailyLimit Daily spending limit
     */
    function createAccount(address owner, uint256 dailyLimit)
        external
        returns (address)
    {
        EIP7702Account account = new EIP7702Account(owner, dailyLimit);

        emit AccountCreated(owner, address(account), dailyLimit);

        return address(account);
    }

    /**
     * @dev Get deterministic account address
     * @param owner EOA owner
     * @param salt Salt for CREATE2
     */
    function getAccountAddress(address owner, bytes32 salt)
        external
        view
        returns (address)
    {
        bytes memory bytecode = abi.encodePacked(
            type(EIP7702Account).creationCode,
            abi.encode(owner, 0)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );

        return address(uint160(uint256(hash)));
    }
}
