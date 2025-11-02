// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SecurityManager is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant SECURITY_OFFICER_ROLE = keccak256("SECURITY_OFFICER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    enum ThreatLevel { LOW, MEDIUM, HIGH, CRITICAL }
    enum SecurityEventType {
        FAILED_LOGIN,
        SUSPICIOUS_TRANSACTION,
        RATE_LIMIT_EXCEEDED,
        POTENTIAL_FLASH_LOAN_ATTACK,
        UNUSUAL_PATTERN,
        LARGE_WITHDRAWAL,
        BLACKLISTED_ADDRESS,
        SMART_CONTRACT_ANOMALY
    }

    struct SecurityEvent {
        uint256 id;
        address user;
        SecurityEventType eventType;
        ThreatLevel threatLevel;
        uint256 timestamp;
        bytes32 dataHash;
        string description;
        bool resolved;
        address resolvedBy;
    }

    struct UserSecurityProfile {
        uint256 riskScore;
        uint256 lastActivityTime;
        uint256 failedAttempts;
        uint256 suspiciousTransactions;
        bool isBlacklisted;
        bool requiresAdditionalAuth;
        uint256 dailyTransactionLimit;
        uint256 dailyTransactionVolume;
        uint256 lastDailyReset;
        mapping(address => bool) trustedContracts;
    }

    struct TransactionPattern {
        uint256 amount;
        address token;
        address recipient;
        uint256 timestamp;
        bytes32 transactionHash;
    }

    struct RateLimitConfig {
        uint256 maxTransactionsPerHour;
        uint256 maxVolumePerHour;
        uint256 maxTransactionsPerDay;
        uint256 maxVolumePerDay;
        uint256 cooldownPeriod;
        bool enabled;
    }

    struct MultiSigConfig {
        uint256 requiredSignatures;
        address[] signers;
        uint256 timelock;
        mapping(address => bool) isSigner;
    }

    struct CircuitBreaker {
        bool isActive;
        uint256 triggerThreshold;
        uint256 pauseDuration;
        uint256 lastTriggered;
        uint256 triggerCount;
    }

    // State variables
    mapping(address => UserSecurityProfile) public userProfiles;
    mapping(uint256 => SecurityEvent) public securityEvents;
    mapping(address => TransactionPattern[]) public userTransactions;
    mapping(address => RateLimitConfig) public rateLimits;
    mapping(bytes32 => MultiSigConfig) public multiSigConfigs;
    mapping(address => CircuitBreaker) public circuitBreakers;

    // Global security settings
    uint256 public maxRiskScore = 1000;
    uint256 public suspiciousThreshold = 800;
    uint256 public blacklistThreshold = 900;
    uint256 public maxFailedAttempts = 5;
    uint256 public maxSuspiciousTransactions = 10;

    // Flash loan protection
    mapping(address => uint256) private flashLoanAmounts;
    mapping(bytes32 => bool) private usedNonces;

    uint256 public nextEventId = 1;
    uint256 public emergencyContactsCount = 0;

    // Emergency contacts
    address[] public emergencyContacts;
    mapping(address => bool) public isEmergencyContact;

    // Events
    event SecurityEventLogged(uint256 indexed eventId, address indexed user, SecurityEventType eventType, ThreatLevel threatLevel);
    event UserBlacklisted(address indexed user, string reason);
    event UserWhitelisted(address indexed user);
    event RiskScoreUpdated(address indexed user, uint256 oldScore, uint256 newScore);
    event EmergencyPause(address indexed caller, string reason);
    event CircuitBreakerTriggered(address indexed contract_, uint256 threshold);
    event SuspiciousActivityDetected(address indexed user, string pattern);

    bytes32 private constant TRANSACTION_TYPEHASH = keccak256(
        "SecureTransaction(address user,address token,uint256 amount,address recipient,uint256 nonce,uint256 deadline)"
    );

    modifier onlySecurityOfficer() {
        require(hasRole(SECURITY_OFFICER_ROLE, msg.sender), "Not security officer");
        _;
    }

    modifier onlyEmergencyRole() {
        require(hasRole(EMERGENCY_ROLE, msg.sender), "Not emergency role");
        _;
    }

    modifier notBlacklisted(address user) {
        require(!userProfiles[user].isBlacklisted, "User blacklisted");
        _;
    }

    modifier rateLimited(address user) {
        require(checkRateLimit(user), "Rate limit exceeded");
        _;
    }

    constructor(address admin) EIP712("SecurityManager", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SECURITY_OFFICER_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);
        _grantRole(AUDITOR_ROLE, admin);

        // Initialize default rate limits
        _setDefaultRateLimits();
    }

    // Core security functions
    function validateTransaction(
        address user,
        address token,
        uint256 amount,
        address recipient,
        bytes memory signature,
        uint256 nonce,
        uint256 deadline
    ) external notBlacklisted(user) rateLimited(user) returns (bool) {
        require(block.timestamp <= deadline, "Transaction expired");
        require(!usedNonces[keccak256(abi.encodePacked(user, nonce))], "Nonce already used");

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSACTION_TYPEHASH,
                user,
                token,
                amount,
                recipient,
                nonce,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == user, "Invalid signature");

        // Mark nonce as used
        usedNonces[keccak256(abi.encodePacked(user, nonce))] = true;

        // Perform security checks
        _performSecurityChecks(user, token, amount, recipient);

        // Update user profile
        _updateUserActivity(user, amount);

        return true;
    }

    function _performSecurityChecks(
        address user,
        address token,
        uint256 amount,
        address recipient
    ) internal {
        UserSecurityProfile storage profile = userProfiles[user];

        // Check for flash loan attacks
        if (flashLoanAmounts[user] > 0) {
            _logSecurityEvent(
                user,
                SecurityEventType.POTENTIAL_FLASH_LOAN_ATTACK,
                ThreatLevel.HIGH,
                "Transaction during flash loan"
            );
        }

        // Check for large withdrawals
        if (amount > profile.dailyTransactionLimit * 50 / 100) { // 50% of daily limit
            _logSecurityEvent(
                user,
                SecurityEventType.LARGE_WITHDRAWAL,
                ThreatLevel.MEDIUM,
                "Large withdrawal detected"
            );
        }

        // Pattern analysis
        _analyzeTransactionPattern(user, token, amount, recipient);

        // Update risk score
        _updateRiskScore(user, amount);
    }

    function _analyzeTransactionPattern(
        address user,
        address token,
        uint256 amount,
        address recipient
    ) internal {
        TransactionPattern[] storage patterns = userTransactions[user];

        // Add current transaction to pattern
        patterns.push(TransactionPattern({
            amount: amount,
            token: token,
            recipient: recipient,
            timestamp: block.timestamp,
            transactionHash: keccak256(abi.encodePacked(user, token, amount, recipient, block.timestamp))
        }));

        // Analyze patterns (last 10 transactions)
        if (patterns.length >= 3) {
            uint256 start = patterns.length > 10 ? patterns.length - 10 : 0;

            // Check for rapid transactions to same recipient
            uint256 sameRecipientCount = 0;
            uint256 rapidTransactionCount = 0;

            for (uint256 i = start; i < patterns.length; i++) {
                if (patterns[i].recipient == recipient) {
                    sameRecipientCount++;
                }

                if (patterns[i].timestamp > block.timestamp - 1 hours) {
                    rapidTransactionCount++;
                }
            }

            // Suspicious pattern detection
            if (sameRecipientCount >= 5) {
                _logSecurityEvent(
                    user,
                    SecurityEventType.UNUSUAL_PATTERN,
                    ThreatLevel.MEDIUM,
                    "Multiple transactions to same recipient"
                );
            }

            if (rapidTransactionCount >= 10) {
                _logSecurityEvent(
                    user,
                    SecurityEventType.UNUSUAL_PATTERN,
                    ThreatLevel.HIGH,
                    "Rapid transaction pattern detected"
                );
            }
        }
    }

    function _updateRiskScore(address user, uint256 amount) internal {
        UserSecurityProfile storage profile = userProfiles[user];
        uint256 oldScore = profile.riskScore;

        // Factors that increase risk score
        if (amount > 1000 ether) profile.riskScore += 50;
        if (profile.failedAttempts > 0) profile.riskScore += profile.failedAttempts * 20;
        if (profile.suspiciousTransactions > 0) profile.riskScore += profile.suspiciousTransactions * 30;

        // Time-based decay (reduce risk over time)
        if (block.timestamp > profile.lastActivityTime + 7 days) {
            profile.riskScore = profile.riskScore * 90 / 100; // 10% reduction
        }

        // Cap at maximum
        if (profile.riskScore > maxRiskScore) {
            profile.riskScore = maxRiskScore;
        }

        // Auto-blacklist if threshold exceeded
        if (profile.riskScore >= blacklistThreshold && !profile.isBlacklisted) {
            profile.isBlacklisted = true;
            emit UserBlacklisted(user, "Risk score threshold exceeded");
        }

        if (oldScore != profile.riskScore) {
            emit RiskScoreUpdated(user, oldScore, profile.riskScore);
        }
    }

    function _updateUserActivity(address user, uint256 amount) internal {
        UserSecurityProfile storage profile = userProfiles[user];

        // Reset daily counters if needed
        if (block.timestamp >= profile.lastDailyReset + 1 days) {
            profile.dailyTransactionVolume = 0;
            profile.lastDailyReset = block.timestamp;
        }

        profile.lastActivityTime = block.timestamp;
        profile.dailyTransactionVolume += amount;

        // Check daily limits
        if (profile.dailyTransactionVolume > profile.dailyTransactionLimit) {
            _logSecurityEvent(
                user,
                SecurityEventType.RATE_LIMIT_EXCEEDED,
                ThreatLevel.MEDIUM,
                "Daily transaction limit exceeded"
            );
        }
    }

    function checkRateLimit(address user) public view returns (bool) {
        RateLimitConfig storage config = rateLimits[user];
        if (!config.enabled) return true;

        TransactionPattern[] storage patterns = userTransactions[user];

        uint256 hourlyCount = 0;
        uint256 hourlyVolume = 0;
        uint256 dailyCount = 0;
        uint256 dailyVolume = 0;

        for (uint256 i = patterns.length; i > 0; i--) {
            TransactionPattern storage pattern = patterns[i - 1];

            if (pattern.timestamp > block.timestamp - 1 hours) {
                hourlyCount++;
                hourlyVolume += pattern.amount;
            }

            if (pattern.timestamp > block.timestamp - 1 days) {
                dailyCount++;
                dailyVolume += pattern.amount;
            } else {
                break; // Patterns are ordered by timestamp
            }
        }

        return (hourlyCount < config.maxTransactionsPerHour &&
                hourlyVolume < config.maxVolumePerHour &&
                dailyCount < config.maxTransactionsPerDay &&
                dailyVolume < config.maxVolumePerDay);
    }

    // Flash loan protection
    function registerFlashLoan(address user, uint256 amount) external {
        require(userProfiles[user].trustedContracts[msg.sender], "Not trusted contract");
        flashLoanAmounts[user] = amount;
    }

    function clearFlashLoan(address user) external {
        require(userProfiles[user].trustedContracts[msg.sender], "Not trusted contract");
        flashLoanAmounts[user] = 0;
    }

    // Multi-signature functionality
    function createMultiSigConfig(
        bytes32 configId,
        address[] calldata signers,
        uint256 requiredSignatures,
        uint256 timelock
    ) external onlySecurityOfficer {
        require(signers.length >= requiredSignatures, "Invalid signer count");
        require(requiredSignatures > 0, "Must require at least one signature");

        MultiSigConfig storage config = multiSigConfigs[configId];
        config.requiredSignatures = requiredSignatures;
        config.signers = signers;
        config.timelock = timelock;

        for (uint256 i = 0; i < signers.length; i++) {
            config.isSigner[signers[i]] = true;
        }
    }

    // Circuit breaker functionality
    function setCircuitBreaker(
        address contract_,
        uint256 triggerThreshold,
        uint256 pauseDuration
    ) external onlySecurityOfficer {
        CircuitBreaker storage breaker = circuitBreakers[contract_];
        breaker.triggerThreshold = triggerThreshold;
        breaker.pauseDuration = pauseDuration;
        breaker.isActive = true;
    }

    function triggerCircuitBreaker(address contract_) external {
        CircuitBreaker storage breaker = circuitBreakers[contract_];
        require(breaker.isActive, "Circuit breaker not active");

        breaker.lastTriggered = block.timestamp;
        breaker.triggerCount++;

        // Pause the contract if implemented
        if (contract_.code.length > 0) {
            (bool success,) = contract_.call(abi.encodeWithSignature("pause()"));
            require(success, "Failed to pause contract");
        }

        emit CircuitBreakerTriggered(contract_, breaker.triggerThreshold);
    }

    // Security event logging
    function _logSecurityEvent(
        address user,
        SecurityEventType eventType,
        ThreatLevel threatLevel,
        string memory description
    ) internal {
        uint256 eventId = nextEventId++;

        SecurityEvent storage securityEvent = securityEvents[eventId];
        securityEvent.id = eventId;
        securityEvent.user = user;
        securityEvent.eventType = eventType;
        securityEvent.threatLevel = threatLevel;
        securityEvent.timestamp = block.timestamp;
        securityEvent.description = description;
        securityEvent.dataHash = keccak256(abi.encodePacked(user, eventType, block.timestamp));

        // Update user profile based on event
        UserSecurityProfile storage profile = userProfiles[user];
        if (eventType == SecurityEventType.FAILED_LOGIN) {
            profile.failedAttempts++;
        } else if (eventType == SecurityEventType.SUSPICIOUS_TRANSACTION) {
            profile.suspiciousTransactions++;
        }

        // Auto-escalate critical events
        if (threatLevel == ThreatLevel.CRITICAL) {
            _notifyEmergencyContacts(eventId);
        }

        emit SecurityEventLogged(eventId, user, eventType, threatLevel);
    }

    function _notifyEmergencyContacts(uint256 eventId) internal {
        // In a real implementation, this would trigger off-chain notifications
        // For now, we emit an event that external systems can monitor
        emit EmergencyPause(msg.sender, string(abi.encodePacked("Critical security event: ", eventId)));
    }

    // Administrative functions
    function blacklistUser(address user, string calldata reason) external onlySecurityOfficer {
        userProfiles[user].isBlacklisted = true;
        emit UserBlacklisted(user, reason);
    }

    function whitelistUser(address user) external onlySecurityOfficer {
        userProfiles[user].isBlacklisted = false;
        userProfiles[user].riskScore = 0;
        userProfiles[user].failedAttempts = 0;
        userProfiles[user].suspiciousTransactions = 0;
        emit UserWhitelisted(user);
    }

    function setUserRateLimit(
        address user,
        uint256 maxTransactionsPerHour,
        uint256 maxVolumePerHour,
        uint256 maxTransactionsPerDay,
        uint256 maxVolumePerDay
    ) external onlySecurityOfficer {
        RateLimitConfig storage config = rateLimits[user];
        config.maxTransactionsPerHour = maxTransactionsPerHour;
        config.maxVolumePerHour = maxVolumePerHour;
        config.maxTransactionsPerDay = maxTransactionsPerDay;
        config.maxVolumePerDay = maxVolumePerDay;
        config.enabled = true;
    }

    function addTrustedContract(address user, address contract_) external onlySecurityOfficer {
        userProfiles[user].trustedContracts[contract_] = true;
    }

    function removeTrustedContract(address user, address contract_) external onlySecurityOfficer {
        userProfiles[user].trustedContracts[contract_] = false;
    }

    function addEmergencyContact(address contact) external onlySecurityOfficer {
        require(!isEmergencyContact[contact], "Already emergency contact");
        emergencyContacts.push(contact);
        isEmergencyContact[contact] = true;
        emergencyContactsCount++;
    }

    function removeEmergencyContact(address contact) external onlySecurityOfficer {
        require(isEmergencyContact[contact], "Not emergency contact");

        for (uint256 i = 0; i < emergencyContacts.length; i++) {
            if (emergencyContacts[i] == contact) {
                emergencyContacts[i] = emergencyContacts[emergencyContacts.length - 1];
                emergencyContacts.pop();
                break;
            }
        }

        isEmergencyContact[contact] = false;
        emergencyContactsCount--;
    }

    function resolveSecurityEvent(uint256 eventId) external onlySecurityOfficer {
        SecurityEvent storage securityEvent = securityEvents[eventId];
        require(!securityEvent.resolved, "Already resolved");

        securityEvent.resolved = true;
        securityEvent.resolvedBy = msg.sender;
    }

    // View functions
    function getUserRiskScore(address user) external view returns (uint256) {
        return userProfiles[user].riskScore;
    }

    function isUserBlacklisted(address user) external view returns (bool) {
        return userProfiles[user].isBlacklisted;
    }

    function getUserTransactionCount(address user) external view returns (uint256) {
        return userTransactions[user].length;
    }

    function getSecurityEvent(uint256 eventId) external view returns (SecurityEvent memory) {
        return securityEvents[eventId];
    }

    function getEmergencyContacts() external view returns (address[] memory) {
        return emergencyContacts;
    }

    // Internal functions
    function _setDefaultRateLimits() internal {
        // Set default rate limits for new users
        RateLimitConfig storage defaultConfig = rateLimits[address(0)];
        defaultConfig.maxTransactionsPerHour = 100;
        defaultConfig.maxVolumePerHour = 10000 ether;
        defaultConfig.maxTransactionsPerDay = 1000;
        defaultConfig.maxVolumePerDay = 100000 ether;
        defaultConfig.enabled = true;
    }

    // Emergency functions
    function emergencyPause(string calldata reason) external onlyEmergencyRole {
        _pause();
        emit EmergencyPause(msg.sender, reason);
    }

    function emergencyUnpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).transfer(msg.sender, amount);
    }

    // Audit functions
    function generateAuditReport(uint256 fromTime, uint256 toTime)
        external
        view
        onlyRole(AUDITOR_ROLE)
        returns (uint256[] memory eventIds)
    {
        uint256 count = 0;

        // Count events in time range
        for (uint256 i = 1; i < nextEventId; i++) {
            if (securityEvents[i].timestamp >= fromTime && securityEvents[i].timestamp <= toTime) {
                count++;
            }
        }

        // Populate result array
        eventIds = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i < nextEventId; i++) {
            if (securityEvents[i].timestamp >= fromTime && securityEvents[i].timestamp <= toTime) {
                eventIds[index] = i;
                index++;
            }
        }
    }
}