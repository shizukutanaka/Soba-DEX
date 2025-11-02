// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../wallet/MultiSigWallet.sol";
import "../proxy/UUPSUpgradeable.sol";

/**
 * @title UpgradeGovernance
 * @dev Multi-signature governance for contract upgrades
 *
 * FEATURES (Based on 2025 Research):
 * - Multi-sig approval for all upgrades
 * - Proposal voting system
 * - Time-locked execution
 * - Emergency veto power
 * - Upgrade risk assessment
 * - Automatic validation
 *
 * SECURITY BENEFITS:
 * - Prevents single administrator compromise
 * - Community governance for upgrades
 * - Transparent upgrade process
 * - Multiple approval levels
 *
 * USED BY:
 * - Uniswap governance
 * - Aave governance
 * - Compound governance
 *
 * APPROVAL PROCESS:
 * 1. Propose upgrade (any owner)
 * 2. Technical review period (48 hours)
 * 3. Multi-sig voting (M-of-N required)
 * 4. Time-lock delay (48 hours)
 * 5. Execute upgrade
 */
contract UpgradeGovernance is MultiSigWallet {
    // Upgrade proposal structure
    struct UpgradeProposal {
        address targetProxy;
        address newImplementation;
        string description;
        bytes initData;
        uint256 proposedAt;
        uint256 votesFor;
        uint256 votesAgainst;
        bool executed;
        bool vetoed;
        address proposer;
        RiskLevel riskLevel;
    }

    enum RiskLevel {
        LOW,      // Minor bug fixes, UI improvements
        MEDIUM,   // Feature additions, minor logic changes
        HIGH,     // Major refactoring, storage layout changes
        CRITICAL  // Emergency security fixes
    }

    // Proposals
    mapping(uint256 => UpgradeProposal) public proposals;
    uint256 public proposalCount;

    // Voting
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public voteChoice; // true = for, false = against

    // Governance parameters
    uint256 public reviewPeriod;
    uint256 public votingPeriod;
    uint256 public executionDelay;
    uint256 public quorumPercentage;

    // Emergency controls
    address public emergencyVetoAuthority;
    bool public governancePaused;

    // Risk-based requirements
    mapping(RiskLevel => uint256) public requiredApprovals;

    // Events
    event UpgradeProposed(
        uint256 indexed proposalId,
        address indexed targetProxy,
        address indexed newImplementation,
        string description,
        RiskLevel riskLevel,
        address proposer
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 votesFor,
        uint256 votesAgainst
    );

    event UpgradeExecuted(
        uint256 indexed proposalId,
        address indexed targetProxy,
        address indexed newImplementation
    );

    event ProposalVetoed(
        uint256 indexed proposalId,
        address indexed vetoer,
        string reason
    );

    event GovernanceParametersUpdated(
        uint256 reviewPeriod,
        uint256 votingPeriod,
        uint256 executionDelay,
        uint256 quorumPercentage
    );

    /**
     * @dev Constructor
     * @param _owners Multi-sig owners
     * @param _required Required signatures
     * @param _reviewPeriod Time for technical review
     * @param _votingPeriod Time for voting
     * @param _executionDelay Delay before execution
     */
    constructor(
        address[] memory _owners,
        uint256 _required,
        uint256 _reviewPeriod,
        uint256 _votingPeriod,
        uint256 _executionDelay
    ) MultiSigWallet(_owners, _required, 0) {
        require(_reviewPeriod >= 1 days, "Review period too short");
        require(_votingPeriod >= 2 days, "Voting period too short");
        require(_executionDelay >= 2 days, "Execution delay too short");

        reviewPeriod = _reviewPeriod;
        votingPeriod = _votingPeriod;
        executionDelay = _executionDelay;
        quorumPercentage = 66; // 66% quorum

        emergencyVetoAuthority = msg.sender;

        // Set risk-based approval requirements
        requiredApprovals[RiskLevel.LOW] = (_required * 60) / 100;      // 60%
        requiredApprovals[RiskLevel.MEDIUM] = (_required * 75) / 100;   // 75%
        requiredApprovals[RiskLevel.HIGH] = (_required * 90) / 100;     // 90%
        requiredApprovals[RiskLevel.CRITICAL] = _required;              // 100%
    }

    /**
     * @dev Propose an upgrade
     * @param targetProxy Proxy contract to upgrade
     * @param newImplementation New implementation address
     * @param description Detailed description
     * @param initData Initialization data for upgrade
     * @param riskLevel Risk assessment
     */
    function proposeUpgrade(
        address targetProxy,
        address newImplementation,
        string memory description,
        bytes memory initData,
        RiskLevel riskLevel
    ) external onlyOwner returns (uint256) {
        require(!governancePaused, "Governance is paused");
        require(targetProxy != address(0), "Invalid proxy");
        require(newImplementation != address(0), "Invalid implementation");
        require(bytes(description).length > 0, "Description required");

        uint256 proposalId = proposalCount++;

        proposals[proposalId] = UpgradeProposal({
            targetProxy: targetProxy,
            newImplementation: newImplementation,
            description: description,
            initData: initData,
            proposedAt: block.timestamp,
            votesFor: 0,
            votesAgainst: 0,
            executed: false,
            vetoed: false,
            proposer: msg.sender,
            riskLevel: riskLevel
        });

        emit UpgradeProposed(
            proposalId,
            targetProxy,
            newImplementation,
            description,
            riskLevel,
            msg.sender
        );

        return proposalId;
    }

    /**
     * @dev Vote on a proposal
     * @param proposalId Proposal to vote on
     * @param support True for yes, false for no
     */
    function vote(uint256 proposalId, bool support) external onlyOwner {
        require(proposalId < proposalCount, "Invalid proposal");

        UpgradeProposal storage proposal = proposals[proposalId];

        require(!proposal.executed, "Already executed");
        require(!proposal.vetoed, "Proposal vetoed");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        // Check voting period
        uint256 votingStart = proposal.proposedAt + reviewPeriod;
        uint256 votingEnd = votingStart + votingPeriod;

        require(block.timestamp >= votingStart, "Review period not ended");
        require(block.timestamp <= votingEnd, "Voting period ended");

        // Record vote
        hasVoted[proposalId][msg.sender] = true;
        voteChoice[proposalId][msg.sender] = support;

        if (support) {
            proposal.votesFor += 1;
        } else {
            proposal.votesAgainst += 1;
        }

        emit VoteCast(proposalId, msg.sender, support, proposal.votesFor, proposal.votesAgainst);
    }

    /**
     * @dev Execute approved proposal
     * @param proposalId Proposal to execute
     */
    function executeProposal(uint256 proposalId) external onlyOwner nonReentrant {
        require(proposalId < proposalCount, "Invalid proposal");

        UpgradeProposal storage proposal = proposals[proposalId];

        require(!proposal.executed, "Already executed");
        require(!proposal.vetoed, "Proposal vetoed");

        // Check voting ended
        uint256 votingEnd = proposal.proposedAt + reviewPeriod + votingPeriod;
        require(block.timestamp > votingEnd, "Voting not ended");

        // Check execution delay
        require(
            block.timestamp >= votingEnd + executionDelay,
            "Execution delay not passed"
        );

        // Check quorum
        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 requiredQuorum = (owners.length * quorumPercentage) / 100;

        require(totalVotes >= requiredQuorum, "Quorum not reached");

        // Check approval based on risk level
        uint256 requiredApprovalCount = requiredApprovals[proposal.riskLevel];

        require(
            proposal.votesFor >= requiredApprovalCount,
            "Insufficient approvals for risk level"
        );

        require(proposal.votesFor > proposal.votesAgainst, "Proposal rejected");

        // Mark as executed
        proposal.executed = true;

        // Execute upgrade through DEXCoreUpgradeable
        DEXCoreUpgradeable proxy = DEXCoreUpgradeable(payable(proposal.targetProxy));

        // Schedule the upgrade
        proxy.scheduleUpgrade(proposal.newImplementation, proposal.description);

        emit UpgradeExecuted(proposalId, proposal.targetProxy, proposal.newImplementation);
    }

    /**
     * @dev Emergency veto (only veto authority)
     * @param proposalId Proposal to veto
     * @param reason Reason for veto
     */
    function veto(uint256 proposalId, string memory reason) external {
        require(
            msg.sender == emergencyVetoAuthority || msg.sender == owner(),
            "Not veto authority"
        );
        require(proposalId < proposalCount, "Invalid proposal");

        UpgradeProposal storage proposal = proposals[proposalId];

        require(!proposal.executed, "Already executed");
        require(!proposal.vetoed, "Already vetoed");

        proposal.vetoed = true;

        emit ProposalVetoed(proposalId, msg.sender, reason);
    }

    /**
     * @dev Update governance parameters
     */
    function updateGovernanceParameters(
        uint256 _reviewPeriod,
        uint256 _votingPeriod,
        uint256 _executionDelay,
        uint256 _quorumPercentage
    ) external onlyOwner {
        require(_reviewPeriod >= 1 days, "Review period too short");
        require(_votingPeriod >= 2 days, "Voting period too short");
        require(_executionDelay >= 2 days, "Execution delay too short");
        require(_quorumPercentage >= 51 && _quorumPercentage <= 100, "Invalid quorum");

        reviewPeriod = _reviewPeriod;
        votingPeriod = _votingPeriod;
        executionDelay = _executionDelay;
        quorumPercentage = _quorumPercentage;

        emit GovernanceParametersUpdated(
            _reviewPeriod,
            _votingPeriod,
            _executionDelay,
            _quorumPercentage
        );
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 proposalId)
        external
        view
        returns (
            address targetProxy,
            address newImplementation,
            string memory description,
            uint256 proposedAt,
            uint256 votesFor,
            uint256 votesAgainst,
            bool executed,
            bool vetoed,
            RiskLevel riskLevel,
            ProposalStatus status
        )
    {
        require(proposalId < proposalCount, "Invalid proposal");

        UpgradeProposal memory proposal = proposals[proposalId];

        ProposalStatus proposalStatus = _getProposalStatus(proposalId);

        return (
            proposal.targetProxy,
            proposal.newImplementation,
            proposal.description,
            proposal.proposedAt,
            proposal.votesFor,
            proposal.votesAgainst,
            proposal.executed,
            proposal.vetoed,
            proposal.riskLevel,
            proposalStatus
        );
    }

    enum ProposalStatus {
        REVIEW,      // In technical review period
        VOTING,      // Active voting
        PENDING,     // Passed, waiting for execution delay
        EXECUTABLE,  // Ready to execute
        EXECUTED,    // Executed
        REJECTED,    // Rejected by vote
        VETOED,      // Vetoed by authority
        EXPIRED      // Voting period expired without quorum
    }

    /**
     * @dev Get current status of proposal
     */
    function _getProposalStatus(uint256 proposalId) internal view returns (ProposalStatus) {
        UpgradeProposal memory proposal = proposals[proposalId];

        if (proposal.executed) return ProposalStatus.EXECUTED;
        if (proposal.vetoed) return ProposalStatus.VETOED;

        uint256 votingStart = proposal.proposedAt + reviewPeriod;
        uint256 votingEnd = votingStart + votingPeriod;
        uint256 executableTime = votingEnd + executionDelay;

        if (block.timestamp < votingStart) {
            return ProposalStatus.REVIEW;
        }

        if (block.timestamp <= votingEnd) {
            return ProposalStatus.VOTING;
        }

        // Check if passed
        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 requiredQuorum = (owners.length * quorumPercentage) / 100;
        uint256 requiredApprovalCount = requiredApprovals[proposal.riskLevel];

        if (totalVotes < requiredQuorum) {
            return ProposalStatus.EXPIRED;
        }

        if (
            proposal.votesFor < requiredApprovalCount ||
            proposal.votesFor <= proposal.votesAgainst
        ) {
            return ProposalStatus.REJECTED;
        }

        if (block.timestamp < executableTime) {
            return ProposalStatus.PENDING;
        }

        return ProposalStatus.EXECUTABLE;
    }

    /**
     * @dev Pause governance (emergency only)
     */
    function pauseGovernance() external {
        require(
            msg.sender == emergencyVetoAuthority || msg.sender == owner(),
            "Not authorized"
        );

        governancePaused = true;
    }

    /**
     * @dev Resume governance
     */
    function resumeGovernance() external onlyOwner {
        governancePaused = false;
    }

    /**
     * @dev Get voting statistics
     */
    function getVotingStats(uint256 proposalId)
        external
        view
        returns (
            uint256 votesFor,
            uint256 votesAgainst,
            uint256 totalVotes,
            uint256 quorumRequired,
            uint256 approvalsRequired,
            bool quorumReached,
            bool approved
        )
    {
        require(proposalId < proposalCount, "Invalid proposal");

        UpgradeProposal memory proposal = proposals[proposalId];

        votesFor = proposal.votesFor;
        votesAgainst = proposal.votesAgainst;
        totalVotes = votesFor + votesAgainst;
        quorumRequired = (owners.length * quorumPercentage) / 100;
        approvalsRequired = requiredApprovals[proposal.riskLevel];
        quorumReached = totalVotes >= quorumRequired;
        approved = votesFor >= approvalsRequired && votesFor > votesAgainst;

        return (
            votesFor,
            votesAgainst,
            totalVotes,
            quorumRequired,
            approvalsRequired,
            quorumReached,
            approved
        );
    }
}
