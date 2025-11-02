// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ComplianceManager is AccessControl, Pausable, EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant KYC_VERIFIER_ROLE = keccak256("KYC_VERIFIER_ROLE");
    bytes32 public constant SANCTIONS_ORACLE_ROLE = keccak256("SANCTIONS_ORACLE_ROLE");

    enum KYCStatus { NotVerified, Pending, Verified, Rejected, Suspended }
    enum RiskLevel { Low, Medium, High, Blocked }
    enum JurisdictionStatus { Allowed, Restricted, Blocked }

    struct KYCData {
        KYCStatus status;
        RiskLevel riskLevel;
        uint256 verificationDate;
        uint256 expiryDate;
        bytes32 documentHash;
        address verifier;
        string jurisdiction;
        uint256 dailyLimit;
        uint256 monthlyLimit;
        uint256 totalVolume;
        uint256 dailyVolume;
        uint256 monthlyVolume;
        uint256 lastTradeDate;
        bool accreditedInvestor;
    }

    struct ComplianceRule {
        bool enabled;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 dailyLimit;
        uint256 monthlyLimit;
        RiskLevel maxRiskLevel;
        bool requiresKYC;
        bool requiresAccredited;
        uint256 cooldownPeriod;
    }

    struct SanctionsData {
        bool isBlacklisted;
        uint256 addedDate;
        string reason;
        bytes32 evidenceHash;
        address addedBy;
    }

    struct AMLAlert {
        uint256 id;
        address user;
        string alertType;
        uint256 amount;
        string description;
        uint256 timestamp;
        bool resolved;
        address resolvedBy;
    }

    mapping(address => KYCData) public kycData;
    mapping(string => JurisdictionStatus) public jurisdictions;
    mapping(address => SanctionsData) public sanctionsList;
    mapping(string => ComplianceRule) public complianceRules;
    mapping(address => mapping(uint256 => uint256)) public dailyVolumes;
    mapping(address => mapping(uint256 => uint256)) public monthlyVolumes;

    AMLAlert[] public amlAlerts;
    mapping(address => uint256[]) public userAlerts;

    uint256 public constant KYC_VALIDITY_PERIOD = 365 days;
    uint256 public constant SUSPICIOUS_AMOUNT_THRESHOLD = 10000 * 10**18;
    uint256 public constant RAPID_TRADING_THRESHOLD = 10;

    bytes32 private constant KYC_TYPEHASH = keccak256(
        "KYCVerification(address user,string jurisdiction,uint256 riskLevel,bytes32 documentHash,uint256 deadline)"
    );

    event KYCStatusUpdated(address indexed user, KYCStatus status, address verifier);
    event SanctionsUpdated(address indexed user, bool blacklisted, string reason);
    event ComplianceViolation(address indexed user, string violation, uint256 amount);
    event AMLAlertGenerated(uint256 indexed alertId, address indexed user, string alertType);
    event JurisdictionUpdated(string jurisdiction, JurisdictionStatus status);
    event ComplianceRuleUpdated(string ruleType, bool enabled);

    modifier onlyVerifiedUser(address user) {
        require(isUserCompliant(user), "User not compliant");
        _;
    }

    modifier notSanctioned(address user) {
        require(!sanctionsList[user].isBlacklisted, "User is sanctioned");
        _;
    }

    modifier validJurisdiction(string memory jurisdiction) {
        require(
            jurisdictions[jurisdiction] == JurisdictionStatus.Allowed,
            "Jurisdiction not allowed"
        );
        _;
    }

    constructor(address admin) EIP712("ComplianceManager", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, admin);

        // Initialize default compliance rules
        _setDefaultComplianceRules();

        // Initialize allowed jurisdictions
        _initializeJurisdictions();
    }

    function submitKYC(
        string memory jurisdiction,
        bytes32 documentHash,
        bytes memory signature,
        uint256 deadline
    ) external {
        require(block.timestamp <= deadline, "Signature expired");
        require(
            jurisdictions[jurisdiction] != JurisdictionStatus.Blocked,
            "Jurisdiction blocked"
        );

        bytes32 structHash = keccak256(
            abi.encode(
                KYC_TYPEHASH,
                msg.sender,
                keccak256(bytes(jurisdiction)),
                uint256(RiskLevel.Medium),
                documentHash,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(hasRole(KYC_VERIFIER_ROLE, signer), "Invalid KYC verifier");

        KYCData storage userData = kycData[msg.sender];
        userData.status = KYCStatus.Pending;
        userData.jurisdiction = jurisdiction;
        userData.documentHash = documentHash;
        userData.verifier = signer;

        emit KYCStatusUpdated(msg.sender, KYCStatus.Pending, signer);
    }

    function verifyKYC(
        address user,
        RiskLevel riskLevel,
        uint256 dailyLimit,
        uint256 monthlyLimit,
        bool accreditedInvestor
    ) external onlyRole(KYC_VERIFIER_ROLE) {
        require(!sanctionsList[user].isBlacklisted, "User is sanctioned");

        KYCData storage userData = kycData[user];
        require(userData.status == KYCStatus.Pending, "No pending KYC");

        userData.status = KYCStatus.Verified;
        userData.riskLevel = riskLevel;
        userData.verificationDate = block.timestamp;
        userData.expiryDate = block.timestamp + KYC_VALIDITY_PERIOD;
        userData.dailyLimit = dailyLimit;
        userData.monthlyLimit = monthlyLimit;
        userData.accreditedInvestor = accreditedInvestor;

        emit KYCStatusUpdated(user, KYCStatus.Verified, msg.sender);
    }

    function rejectKYC(address user, string memory reason)
        external
        onlyRole(KYC_VERIFIER_ROLE)
    {
        KYCData storage userData = kycData[user];
        require(userData.status == KYCStatus.Pending, "No pending KYC");

        userData.status = KYCStatus.Rejected;

        emit KYCStatusUpdated(user, KYCStatus.Rejected, msg.sender);
        emit ComplianceViolation(user, reason, 0);
    }

    function addToSanctionsList(
        address user,
        string memory reason,
        bytes32 evidenceHash
    ) external onlyRole(SANCTIONS_ORACLE_ROLE) {
        sanctionsList[user] = SanctionsData({
            isBlacklisted: true,
            addedDate: block.timestamp,
            reason: reason,
            evidenceHash: evidenceHash,
            addedBy: msg.sender
        });

        // Suspend KYC if exists
        if (kycData[user].status == KYCStatus.Verified) {
            kycData[user].status = KYCStatus.Suspended;
            emit KYCStatusUpdated(user, KYCStatus.Suspended, msg.sender);
        }

        emit SanctionsUpdated(user, true, reason);
    }

    function removeFromSanctionsList(address user)
        external
        onlyRole(SANCTIONS_ORACLE_ROLE)
    {
        require(sanctionsList[user].isBlacklisted, "User not sanctioned");

        delete sanctionsList[user];
        emit SanctionsUpdated(user, false, "Removed from sanctions");
    }

    function checkTransactionCompliance(
        address user,
        uint256 amount,
        string memory transactionType
    ) external onlyVerifiedUser(user) notSanctioned(user) returns (bool) {
        KYCData storage userData = kycData[user];

        // Check KYC expiry
        require(block.timestamp <= userData.expiryDate, "KYC expired");

        // Check compliance rules
        ComplianceRule memory rule = complianceRules[transactionType];
        if (rule.enabled) {
            require(amount >= rule.minAmount, "Amount below minimum");
            require(amount <= rule.maxAmount, "Amount exceeds maximum");
            require(
                userData.riskLevel <= rule.maxRiskLevel,
                "Risk level too high"
            );

            if (rule.requiresAccredited) {
                require(userData.accreditedInvestor, "Requires accredited investor");
            }
        }

        // Update volume tracking
        uint256 currentDay = block.timestamp / 1 days;
        uint256 currentMonth = block.timestamp / 30 days;

        dailyVolumes[user][currentDay] += amount;
        monthlyVolumes[user][currentMonth] += amount;
        userData.totalVolume += amount;

        // Check limits
        require(
            dailyVolumes[user][currentDay] <= userData.dailyLimit,
            "Daily limit exceeded"
        );
        require(
            monthlyVolumes[user][currentMonth] <= userData.monthlyLimit,
            "Monthly limit exceeded"
        );

        // AML checks
        _performAMLChecks(user, amount, transactionType);

        userData.lastTradeDate = block.timestamp;
        return true;
    }

    function _performAMLChecks(
        address user,
        uint256 amount,
        string memory transactionType
    ) internal {
        // Large transaction alert
        if (amount >= SUSPICIOUS_AMOUNT_THRESHOLD) {
            _generateAMLAlert(
                user,
                "LARGE_TRANSACTION",
                amount,
                string(abi.encodePacked("Large ", transactionType, " transaction"))
            );
        }

        // Rapid trading detection
        KYCData storage userData = kycData[user];
        if (block.timestamp - userData.lastTradeDate < 1 hours) {
            uint256 currentDay = block.timestamp / 1 days;
            if (dailyVolumes[user][currentDay] / amount > RAPID_TRADING_THRESHOLD) {
                _generateAMLAlert(
                    user,
                    "RAPID_TRADING",
                    amount,
                    "Rapid trading pattern detected"
                );
            }
        }

        // Structuring detection (multiple transactions just under reporting threshold)
        uint256 reportingThreshold = SUSPICIOUS_AMOUNT_THRESHOLD / 2;
        if (amount > reportingThreshold * 8 / 10 && amount < reportingThreshold) {
            uint256 currentHour = block.timestamp / 1 hours;
            // This would need more sophisticated tracking in production
            _generateAMLAlert(
                user,
                "POTENTIAL_STRUCTURING",
                amount,
                "Potential structuring activity"
            );
        }
    }

    function _generateAMLAlert(
        address user,
        string memory alertType,
        uint256 amount,
        string memory description
    ) internal {
        uint256 alertId = amlAlerts.length;

        amlAlerts.push(AMLAlert({
            id: alertId,
            user: user,
            alertType: alertType,
            amount: amount,
            description: description,
            timestamp: block.timestamp,
            resolved: false,
            resolvedBy: address(0)
        }));

        userAlerts[user].push(alertId);

        emit AMLAlertGenerated(alertId, user, alertType);
    }

    function resolveAMLAlert(uint256 alertId, string memory resolution)
        external
        onlyRole(COMPLIANCE_OFFICER_ROLE)
    {
        require(alertId < amlAlerts.length, "Invalid alert ID");
        require(!amlAlerts[alertId].resolved, "Alert already resolved");

        amlAlerts[alertId].resolved = true;
        amlAlerts[alertId].resolvedBy = msg.sender;
    }

    function updateJurisdictionStatus(
        string memory jurisdiction,
        JurisdictionStatus status
    ) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        jurisdictions[jurisdiction] = status;
        emit JurisdictionUpdated(jurisdiction, status);
    }

    function updateComplianceRule(
        string memory ruleType,
        ComplianceRule memory rule
    ) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        complianceRules[ruleType] = rule;
        emit ComplianceRuleUpdated(ruleType, rule.enabled);
    }

    function isUserCompliant(address user) public view returns (bool) {
        KYCData memory userData = kycData[user];

        return userData.status == KYCStatus.Verified &&
               block.timestamp <= userData.expiryDate &&
               !sanctionsList[user].isBlacklisted &&
               jurisdictions[userData.jurisdiction] == JurisdictionStatus.Allowed;
    }

    function getUserKYCData(address user) external view returns (KYCData memory) {
        return kycData[user];
    }

    function getUserAlerts(address user) external view returns (uint256[] memory) {
        return userAlerts[user];
    }

    function getAMLAlert(uint256 alertId) external view returns (AMLAlert memory) {
        require(alertId < amlAlerts.length, "Invalid alert ID");
        return amlAlerts[alertId];
    }

    function _setDefaultComplianceRules() internal {
        // Standard trading rule
        complianceRules["TRADE"] = ComplianceRule({
            enabled: true,
            minAmount: 1 * 10**18,
            maxAmount: 1000000 * 10**18,
            dailyLimit: 100000 * 10**18,
            monthlyLimit: 2000000 * 10**18,
            maxRiskLevel: RiskLevel.High,
            requiresKYC: true,
            requiresAccredited: false,
            cooldownPeriod: 0
        });

        // High-risk trading rule
        complianceRules["HIGH_RISK_TRADE"] = ComplianceRule({
            enabled: true,
            minAmount: 10 * 10**18,
            maxAmount: 100000 * 10**18,
            dailyLimit: 50000 * 10**18,
            monthlyLimit: 500000 * 10**18,
            maxRiskLevel: RiskLevel.Medium,
            requiresKYC: true,
            requiresAccredited: true,
            cooldownPeriod: 1 hours
        });

        // Liquidity provision rule
        complianceRules["LIQUIDITY"] = ComplianceRule({
            enabled: true,
            minAmount: 100 * 10**18,
            maxAmount: 5000000 * 10**18,
            dailyLimit: 1000000 * 10**18,
            monthlyLimit: 10000000 * 10**18,
            maxRiskLevel: RiskLevel.High,
            requiresKYC: true,
            requiresAccredited: false,
            cooldownPeriod: 0
        });
    }

    function _initializeJurisdictions() internal {
        // Allowed jurisdictions
        jurisdictions["US"] = JurisdictionStatus.Allowed;
        jurisdictions["EU"] = JurisdictionStatus.Allowed;
        jurisdictions["UK"] = JurisdictionStatus.Allowed;
        jurisdictions["CA"] = JurisdictionStatus.Allowed;
        jurisdictions["AU"] = JurisdictionStatus.Allowed;
        jurisdictions["SG"] = JurisdictionStatus.Allowed;
        jurisdictions["JP"] = JurisdictionStatus.Allowed;
        jurisdictions["KR"] = JurisdictionStatus.Allowed;

        // Restricted jurisdictions (require special approval)
        jurisdictions["CN"] = JurisdictionStatus.Restricted;
        jurisdictions["RU"] = JurisdictionStatus.Restricted;

        // Blocked jurisdictions
        jurisdictions["XX"] = JurisdictionStatus.Blocked; // Placeholder for sanctioned countries
    }

    function pause() external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        _unpause();
    }

    function emergencyStop() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
}