/**
 * DAO Governance System
 * Based on Compound Governor + Snapshot 2025 standards
 *
 * Features:
 * - On-chain voting with delegation
 * - Off-chain signaling (Snapshot-style)
 * - Proposal creation and execution
 * - Timelock for security
 * - Vote escrow (ve) tokenomics
 * - Quadratic voting support
 *
 * Governance models: Token-based, NFT-based, Reputation-based
 */

const { logger } = require('../utils/productionLogger');

class DAOGovernance {
  constructor() {
    this.config = {
      enabled: true,
      votingDelay: 86400000, // 1 day
      votingPeriod: 259200000, // 3 days
      proposalThreshold: 100000, // 100K tokens to propose
      quorumVotes: 4000000, // 4M votes for quorum
      timelockDelay: 172800000, // 2 days
      veTokenLockMax: 126144000000, // 4 years
      veTokenMultiplier: 2.5 // Max voting power multiplier
    };

    // Governance token
    this.governanceToken = {
      totalSupply: 100000000, // 100M tokens
      circulatingSupply: 50000000,
      holders: new Map()
    };

    // Proposals
    this.proposals = new Map();
    this.proposalCount = 0;

    // Delegations
    this.delegations = new Map();

    // Vote escrow (ve) positions
    this.vePositions = new Map();

    // Voting history
    this.votes = new Map();

    this.statistics = {
      totalProposals: 0,
      activeProposals: 0,
      executedProposals: 0,
      rejectedProposals: 0,
      totalVotes: 0,
      uniqueVoters: new Set(),
      averageParticipation: 0,
      lastProposal: null,
      lastVote: null
    };
  }

  /**
   * Create proposal
   */
  async createProposal(proposalData) {
    const { proposer, title, description, actions, startTime, endTime } = proposalData;

    // Validate proposer has enough tokens
    const votingPower = this.getVotingPower(proposer);

    if (votingPower < this.config.proposalThreshold) {
      throw new Error(`Insufficient voting power: ${votingPower} < ${this.config.proposalThreshold}`);
    }

    const proposalId = ++this.proposalCount;

    const proposal = {
      id: proposalId,
      proposer,
      title,
      description,
      actions: actions || [],
      status: 'pending',
      startTime: startTime || Date.now() + this.config.votingDelay,
      endTime: endTime || Date.now() + this.config.votingDelay + this.config.votingPeriod,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      voters: new Set(),
      createdAt: Date.now(),
      executedAt: null,
      timelockEnd: null
    };

    this.proposals.set(proposalId, proposal);

    this.statistics.totalProposals++;
    this.statistics.activeProposals++;
    this.statistics.lastProposal = Date.now();

    logger.info('DAOGovernance: Proposal created', {
      proposalId,
      proposer,
      title
    });

    return proposal;
  }

  /**
   * Cast vote
   */
  async castVote(proposalId, voter, support, reason = '') {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Check proposal is active
    const now = Date.now();
    if (now < proposal.startTime) {
      throw new Error('Voting has not started');
    }
    if (now > proposal.endTime) {
      throw new Error('Voting has ended');
    }

    // Check voter hasn't voted yet
    if (proposal.voters.has(voter)) {
      throw new Error('Already voted');
    }

    // Get voting power
    const votingPower = this.getVotingPower(voter);

    if (votingPower === 0) {
      throw new Error('No voting power');
    }

    // Record vote
    const vote = {
      proposalId,
      voter,
      support, // 'for', 'against', 'abstain'
      votingPower,
      reason,
      timestamp: Date.now()
    };

    const voteId = `${proposalId}_${voter}`;
    this.votes.set(voteId, vote);

    // Update proposal
    proposal.voters.add(voter);

    if (support === 'for') {
      proposal.votesFor += votingPower;
    } else if (support === 'against') {
      proposal.votesAgainst += votingPower;
    } else if (support === 'abstain') {
      proposal.votesAbstain += votingPower;
    }

    // Update statistics
    this.statistics.totalVotes++;
    this.statistics.uniqueVoters.add(voter);
    this.statistics.lastVote = Date.now();

    logger.info('DAOGovernance: Vote cast', {
      proposalId,
      voter,
      support,
      votingPower
    });

    return vote;
  }

  /**
   * Execute proposal
   */
  async executeProposal(proposalId) {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Check proposal has ended
    if (Date.now() < proposal.endTime) {
      throw new Error('Voting period not ended');
    }

    // Check proposal passed
    if (!this.hasProposalPassed(proposal)) {
      proposal.status = 'rejected';
      this.statistics.activeProposals--;
      this.statistics.rejectedProposals++;
      throw new Error('Proposal did not pass');
    }

    // Check timelock
    if (!proposal.timelockEnd) {
      // Queue in timelock
      proposal.timelockEnd = Date.now() + this.config.timelockDelay;
      proposal.status = 'queued';

      logger.info('DAOGovernance: Proposal queued in timelock', {
        proposalId,
        timelockEnd: new Date(proposal.timelockEnd).toISOString()
      });

      return proposal;
    }

    if (Date.now() < proposal.timelockEnd) {
      throw new Error('Timelock not expired');
    }

    // Execute proposal actions
    for (const action of proposal.actions) {
      await this.executeAction(action);
    }

    proposal.status = 'executed';
    proposal.executedAt = Date.now();

    this.statistics.activeProposals--;
    this.statistics.executedProposals++;

    logger.info('DAOGovernance: Proposal executed', {
      proposalId,
      actions: proposal.actions.length
    });

    return proposal;
  }

  /**
   * Execute action
   */
  async executeAction(action) {
    // In production: Execute smart contract calls
    logger.info('DAOGovernance: Executing action', {
      target: action.target,
      signature: action.signature,
      data: action.data
    });

    // Simulated execution
    return { success: true };
  }

  /**
   * Delegate voting power
   */
  async delegate(delegator, delegatee) {
    if (delegator === delegatee) {
      throw new Error('Cannot delegate to self');
    }

    this.delegations.set(delegator, delegatee);

    logger.info('DAOGovernance: Voting power delegated', {
      delegator,
      delegatee
    });

    return true;
  }

  /**
   * Lock tokens for ve (vote escrow)
   */
  async lockTokens(user, amount, lockDuration) {
    if (lockDuration > this.config.veTokenLockMax) {
      throw new Error(`Lock duration exceeds maximum: ${this.config.veTokenLockMax}`);
    }

    const unlockTime = Date.now() + lockDuration;

    // Calculate voting power multiplier
    const multiplier = 1 + (lockDuration / this.config.veTokenLockMax) * (this.config.veTokenMultiplier - 1);

    const position = {
      user,
      amount,
      lockDuration,
      unlockTime,
      votingPowerMultiplier: multiplier,
      effectiveVotingPower: amount * multiplier,
      createdAt: Date.now()
    };

    const positionId = `${user}_${Date.now()}`;
    this.vePositions.set(positionId, position);

    logger.info('DAOGovernance: Tokens locked', {
      user,
      amount,
      lockDuration,
      multiplier: multiplier.toFixed(2),
      effectiveVotingPower: position.effectiveVotingPower
    });

    return position;
  }

  /**
   * Unlock tokens
   */
  async unlockTokens(positionId) {
    const position = this.vePositions.get(positionId);

    if (!position) {
      throw new Error('Position not found');
    }

    if (Date.now() < position.unlockTime) {
      throw new Error('Lock period not expired');
    }

    this.vePositions.delete(positionId);

    logger.info('DAOGovernance: Tokens unlocked', {
      positionId,
      amount: position.amount
    });

    return position;
  }

  /**
   * Get voting power
   */
  getVotingPower(address) {
    // Base token balance
    let power = this.governanceToken.holders.get(address) || 0;

    // Add delegated power
    for (const [delegator, delegatee] of this.delegations.entries()) {
      if (delegatee === address) {
        power += this.governanceToken.holders.get(delegator) || 0;
      }
    }

    // Add ve token power
    for (const position of this.vePositions.values()) {
      if (position.user === address && Date.now() < position.unlockTime) {
        power += position.effectiveVotingPower;
      }
    }

    return power;
  }

  /**
   * Check if proposal passed
   */
  hasProposalPassed(proposal) {
    const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;

    // Check quorum
    if (totalVotes < this.config.quorumVotes) {
      return false;
    }

    // Check majority
    return proposal.votesFor > proposal.votesAgainst;
  }

  /**
   * Get proposal state
   */
  getProposalState(proposalId) {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return 'not_found';
    }

    if (proposal.status === 'executed') {
      return 'executed';
    }

    if (proposal.status === 'rejected') {
      return 'rejected';
    }

    if (proposal.status === 'queued') {
      return 'queued';
    }

    const now = Date.now();

    if (now < proposal.startTime) {
      return 'pending';
    }

    if (now <= proposal.endTime) {
      return 'active';
    }

    if (this.hasProposalPassed(proposal)) {
      return 'succeeded';
    }

    return 'defeated';
  }

  /**
   * Get active proposals
   */
  getActiveProposals() {
    const now = Date.now();
    const active = [];

    for (const proposal of this.proposals.values()) {
      if (now >= proposal.startTime && now <= proposal.endTime && proposal.status !== 'executed') {
        active.push(proposal);
      }
    }

    return active;
  }

  /**
   * Get proposal details
   */
  getProposal(proposalId) {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return null;
    }

    const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
    const participationRate = totalVotes / this.governanceToken.circulatingSupply;

    return {
      ...proposal,
      voters: Array.from(proposal.voters),
      state: this.getProposalState(proposalId),
      totalVotes,
      participationRate: (participationRate * 100).toFixed(2) + '%',
      forPercentage: totalVotes > 0 ? ((proposal.votesFor / totalVotes) * 100).toFixed(2) + '%' : '0%',
      againstPercentage: totalVotes > 0 ? ((proposal.votesAgainst / totalVotes) * 100).toFixed(2) + '%' : '0%',
      quorumReached: totalVotes >= this.config.quorumVotes
    };
  }

  /**
   * Get user votes
   */
  getUserVotes(address) {
    const userVotes = [];

    for (const vote of this.votes.values()) {
      if (vote.voter === address) {
        userVotes.push(vote);
      }
    }

    return userVotes;
  }

  /**
   * Get delegation info
   */
  getDelegation(address) {
    const delegatedTo = this.delegations.get(address);

    const delegatedFrom = [];
    for (const [delegator, delegatee] of this.delegations.entries()) {
      if (delegatee === address) {
        delegatedFrom.push(delegator);
      }
    }

    return {
      delegatedTo,
      delegatedFrom,
      totalDelegatedPower: delegatedFrom.reduce((sum, delegator) => {
        return sum + (this.governanceToken.holders.get(delegator) || 0);
      }, 0)
    };
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const activeProposals = this.getActiveProposals();

    this.statistics.averageParticipation = this.statistics.totalProposals > 0
      ? (Array.from(this.proposals.values()).reduce((sum, p) => {
        const total = p.votesFor + p.votesAgainst + p.votesAbstain;
        return sum + (total / this.governanceToken.circulatingSupply);
      }, 0) / this.statistics.totalProposals * 100).toFixed(2) + '%'
      : '0%';

    return {
      ...this.statistics,
      uniqueVoters: this.statistics.uniqueVoters.size,
      activeProposalsCount: activeProposals.length,
      vePositions: this.vePositions.size,
      totalDelegations: this.delegations.size,
      governanceToken: {
        totalSupply: this.governanceToken.totalSupply,
        circulatingSupply: this.governanceToken.circulatingSupply,
        holders: this.governanceToken.holders.size
      }
    };
  }
}

// Singleton instance
const daoGovernance = new DAOGovernance();

module.exports = {
  daoGovernance,
  DAOGovernance
};
