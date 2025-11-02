// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract DEXGovernanceToken is ERC20, ERC20Burnable, ERC20Votes, AccessControl, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens

    constructor() ERC20("DEX Governance", "DEXG") ERC20Permit("DEX Governance") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        _setupRole(PAUSER_ROLE, msg.sender);
        _mint(msg.sender, 100_000_000 * 10**18); // Initial supply: 100M tokens
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Max supply exceeded");
        _mint(to, amount);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
}

contract DEXGovernor {
    using EnumerableSet for EnumerableSet.AddressSet;

    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    struct Proposal {
        uint256 id;
        address proposer;
        uint256 eta;
        address[] targets;
        uint256[] values;
        string[] signatures;
        bytes[] calldatas;
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool canceled;
        bool executed;
        mapping(address => Receipt) receipts;
    }

    struct Receipt {
        bool hasVoted;
        uint8 support;
        uint256 votes;
    }

    DEXGovernanceToken public governanceToken;
    uint256 public votingDelay = 13140; // ~2 days in blocks
    uint256 public votingPeriod = 45818; // ~7 days in blocks
    uint256 public proposalThreshold = 100_000 * 10**18; // 100k tokens
    uint256 public quorumVotes = 4_000_000 * 10**18; // 4M tokens (4% of initial supply)
    uint256 public timelockDelay = 172800; // 2 days in seconds

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public latestProposalIds;

    EnumerableSet.AddressSet private _executors;
    EnumerableSet.AddressSet private _proposers;

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 public constant BALLOT_TYPEHASH =
        keccak256("Ballot(uint256 proposalId,uint8 support)");

    event ProposalCreated(
        uint256 id,
        address proposer,
        address[] targets,
        uint256[] values,
        string[] signatures,
        bytes[] calldatas,
        uint256 startBlock,
        uint256 endBlock,
        string description
    );

    event VoteCast(
        address indexed voter,
        uint256 proposalId,
        uint8 support,
        uint256 votes,
        string reason
    );

    event ProposalCanceled(uint256 id);
    event ProposalQueued(uint256 id, uint256 eta);
    event ProposalExecuted(uint256 id);
    event VotingDelaySet(uint256 oldVotingDelay, uint256 newVotingDelay);
    event VotingPeriodSet(uint256 oldVotingPeriod, uint256 newVotingPeriod);
    event ProposalThresholdSet(uint256 oldProposalThreshold, uint256 newProposalThreshold);
    event QuorumVotesSet(uint256 oldQuorumVotes, uint256 newQuorumVotes);

    modifier onlyGovernance() {
        require(msg.sender == address(this), "Governor: onlyGovernance");
        _;
    }

    constructor(address _token) {
        governanceToken = DEXGovernanceToken(_token);
        _executors.add(msg.sender);
        _proposers.add(msg.sender);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory description
    ) public returns (uint256) {
        require(
            governanceToken.getPastVotes(msg.sender, block.number - 1) > proposalThreshold ||
            _proposers.contains(msg.sender),
            "Governor: proposer votes below proposal threshold"
        );
        require(
            targets.length == values.length &&
            targets.length == signatures.length &&
            targets.length == calldatas.length,
            "Governor: proposal function information arity mismatch"
        );
        require(targets.length != 0, "Governor: must provide actions");
        require(targets.length <= 10, "Governor: too many actions");

        uint256 latestProposalId = latestProposalIds[msg.sender];
        if (latestProposalId != 0) {
            ProposalState proposersLatestProposalState = state(latestProposalId);
            require(
                proposersLatestProposalState != ProposalState.Active,
                "Governor: one live proposal per proposer"
            );
            require(
                proposersLatestProposalState != ProposalState.Pending,
                "Governor: one live proposal per proposer"
            );
        }

        uint256 startBlock = block.number + votingDelay;
        uint256 endBlock = startBlock + votingPeriod;

        proposalCount++;
        uint256 newProposalID = proposalCount;
        Proposal storage newProposal = proposals[newProposalID];
        newProposal.id = newProposalID;
        newProposal.proposer = msg.sender;
        newProposal.eta = 0;
        newProposal.targets = targets;
        newProposal.values = values;
        newProposal.signatures = signatures;
        newProposal.calldatas = calldatas;
        newProposal.startBlock = startBlock;
        newProposal.endBlock = endBlock;
        newProposal.forVotes = 0;
        newProposal.againstVotes = 0;
        newProposal.abstainVotes = 0;
        newProposal.canceled = false;
        newProposal.executed = false;

        latestProposalIds[newProposal.proposer] = newProposal.id;

        emit ProposalCreated(
            newProposal.id,
            msg.sender,
            targets,
            values,
            signatures,
            calldatas,
            startBlock,
            endBlock,
            description
        );
        return newProposal.id;
    }

    function queue(uint256 proposalId) external {
        require(
            state(proposalId) == ProposalState.Succeeded,
            "Governor: proposal can only be queued if it is succeeded"
        );
        Proposal storage proposal = proposals[proposalId];
        uint256 eta = block.timestamp + timelockDelay;
        proposal.eta = eta;
        emit ProposalQueued(proposalId, eta);
    }

    function execute(uint256 proposalId) external payable {
        require(
            state(proposalId) == ProposalState.Queued,
            "Governor: proposal can only be executed if it is queued"
        );
        require(_executors.contains(msg.sender), "Governor: caller is not executor");

        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        for (uint256 i = 0; i < proposal.targets.length; i++) {
            _executeTransaction(
                proposal.targets[i],
                proposal.values[i],
                proposal.signatures[i],
                proposal.calldatas[i],
                proposal.eta
            );
        }
        emit ProposalExecuted(proposalId);
    }

    function cancel(uint256 proposalId) external {
        require(state(proposalId) != ProposalState.Executed, "Governor: cannot cancel executed proposal");

        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.proposer ||
            governanceToken.getPastVotes(proposal.proposer, block.number - 1) < proposalThreshold,
            "Governor: proposer above threshold"
        );

        proposal.canceled = true;
        emit ProposalCanceled(proposalId);
    }

    function castVote(uint256 proposalId, uint8 support) external {
        emit VoteCast(msg.sender, proposalId, support, _castVote(msg.sender, proposalId, support), "");
    }

    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external {
        emit VoteCast(msg.sender, proposalId, support, _castVote(msg.sender, proposalId, support), reason);
    }

    function castVoteBySig(
        uint256 proposalId,
        uint8 support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("DEX Governor")), block.chainid, address(this))
        );
        bytes32 structHash = keccak256(abi.encode(BALLOT_TYPEHASH, proposalId, support));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "Governor: invalid signature");
        emit VoteCast(signatory, proposalId, support, _castVote(signatory, proposalId, support), "");
    }

    function _castVote(
        address voter,
        uint256 proposalId,
        uint8 support
    ) internal returns (uint256) {
        require(state(proposalId) == ProposalState.Active, "Governor: voting is closed");
        require(support <= 2, "Governor: invalid vote type");
        Proposal storage proposal = proposals[proposalId];
        Receipt storage receipt = proposal.receipts[voter];
        require(receipt.hasVoted == false, "Governor: voter already voted");
        uint256 votes = governanceToken.getPastVotes(voter, proposal.startBlock);

        if (support == 0) {
            proposal.againstVotes += votes;
        } else if (support == 1) {
            proposal.forVotes += votes;
        } else if (support == 2) {
            proposal.abstainVotes += votes;
        }

        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        return votes;
    }

    function state(uint256 proposalId) public view returns (ProposalState) {
        require(proposalCount >= proposalId && proposalId > 0, "Governor: invalid proposal id");
        Proposal storage proposal = proposals[proposalId];
        if (proposal.canceled) {
            return ProposalState.Canceled;
        } else if (block.number <= proposal.startBlock) {
            return ProposalState.Pending;
        } else if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        } else if (proposal.forVotes <= proposal.againstVotes || proposal.forVotes < quorumVotes) {
            return ProposalState.Defeated;
        } else if (proposal.eta == 0) {
            return ProposalState.Succeeded;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else if (block.timestamp >= proposal.eta + 14 days) {
            return ProposalState.Expired;
        } else {
            return ProposalState.Queued;
        }
    }

    function getActions(uint256 proposalId)
        external
        view
        returns (
            address[] memory targets,
            uint256[] memory values,
            string[] memory signatures,
            bytes[] memory calldatas
        )
    {
        Proposal storage p = proposals[proposalId];
        return (p.targets, p.values, p.signatures, p.calldatas);
    }

    function getReceipt(uint256 proposalId, address voter)
        external
        view
        returns (Receipt memory)
    {
        return proposals[proposalId].receipts[voter];
    }

    function _executeTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) internal returns (bytes memory) {
        require(block.timestamp >= eta, "Governor: transaction hasn't surpassed time lock");
        require(block.timestamp <= eta + 14 days, "Governor: transaction is stale");

        bytes memory callData;
        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        // SECURITY FIX: External call happens after state changes in execute() function
        // This follows Checks-Effects-Interactions pattern set by the caller
        (bool success, bytes memory returnData) = target.call{value: value}(callData);
        require(success, "Governor: transaction execution reverted");

        return returnData;
    }

    function setVotingDelay(uint256 newVotingDelay) external onlyGovernance {
        uint256 oldVotingDelay = votingDelay;
        votingDelay = newVotingDelay;
        emit VotingDelaySet(oldVotingDelay, votingDelay);
    }

    function setVotingPeriod(uint256 newVotingPeriod) external onlyGovernance {
        uint256 oldVotingPeriod = votingPeriod;
        votingPeriod = newVotingPeriod;
        emit VotingPeriodSet(oldVotingPeriod, votingPeriod);
    }

    function setProposalThreshold(uint256 newProposalThreshold) external onlyGovernance {
        uint256 oldProposalThreshold = proposalThreshold;
        proposalThreshold = newProposalThreshold;
        emit ProposalThresholdSet(oldProposalThreshold, proposalThreshold);
    }

    function setQuorumVotes(uint256 newQuorumVotes) external onlyGovernance {
        uint256 oldQuorumVotes = quorumVotes;
        quorumVotes = newQuorumVotes;
        emit QuorumVotesSet(oldQuorumVotes, quorumVotes);
    }

    function addExecutor(address executor) external onlyGovernance {
        _executors.add(executor);
    }

    function removeExecutor(address executor) external onlyGovernance {
        _executors.remove(executor);
    }

    function addProposer(address proposer) external onlyGovernance {
        _proposers.add(proposer);
    }

    function removeProposer(address proposer) external onlyGovernance {
        _proposers.remove(proposer);
    }

    function isExecutor(address account) external view returns (bool) {
        return _executors.contains(account);
    }

    function isProposer(address account) external view returns (bool) {
        return _proposers.contains(account);
    }

    receive() external payable {}
}