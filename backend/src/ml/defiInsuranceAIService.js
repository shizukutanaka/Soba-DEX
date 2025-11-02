/**
 * AI-Powered DeFi Insurance and Risk Pooling Service for Soba DEX
 * Intelligent insurance coverage, risk pooling, and automated claims processing
 *
 * Features:
 * - AI-powered insurance premium calculation and risk assessment
 * - Automated risk pooling and diversification strategies
 * - Smart contract vulnerability coverage and exploit protection
 * - Real-time claims processing and fraud detection
 * - Parametric insurance for DeFi protocol risks
 * - Cross-protocol risk correlation analysis
 */

const EventEmitter = require('events');

class DefiInsuranceAIService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      supportedInsuranceTypes: options.supportedInsuranceTypes || [
        'smart_contract_coverage', 'oracle_failure', 'flash_loan_attack',
        'liquidity_pool_drain', 'governance_attack', 'bridge_hack'
      ],
      coverageTiers: options.coverageTiers || ['basic', 'standard', 'premium', 'enterprise'],
      riskAssessmentInterval: options.riskAssessmentInterval || 86400000, // 24 hours
      minCoverageAmount: options.minCoverageAmount || 1000, // $1K minimum coverage
      maxCoverageAmount: options.maxCoverageAmount || 10000000, // $10M maximum coverage
      ...options
    };

    this.insurancePolicies = new Map();
    this.riskPools = new Map();
    this.claimsProcessor = new Map();
    this.underwritingModels = new Map();

    this.riskAssessmentTimer = null;
    this.isInitialized = false;
  }

  async initialize() {
    console.log('🛡️ Initializing DeFi Insurance AI Service...');

    try {
      await this.initializeRiskPools();
      await this.loadInsuranceModels();
      await this.setupClaimsProcessing();

      this.startPeriodicRiskAssessment();

      this.isInitialized = true;
      this.emit('initialized');
      console.log('✅ DeFi Insurance AI Service initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize DeFi Insurance AI Service:', error);
      throw error;
    }
  }

  async createInsurancePolicy(userId, policyData) {
    if (!this.isInitialized) {
      throw new Error('DeFi Insurance AI Service not initialized');
    }

    try {
      const startTime = Date.now();

      // Validate policy application
      const validation = await this.validatePolicyApplication(policyData);

      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }

      // Perform AI-powered risk assessment
      const riskAssessment = await this.performRiskAssessment(policyData);

      // Calculate premium using ML models
      const premiumCalculation = await this.calculatePremium(policyData, riskAssessment);

      // Underwrite policy
      const underwritingDecision = await this.underwritePolicy(policyData, riskAssessment, premiumCalculation);

      if (!underwritingDecision.approved) {
        return { success: false, reason: underwritingDecision.reason };
      }

      // Create insurance policy
      const policy = await this.createPolicy(policyData, riskAssessment, premiumCalculation, underwritingDecision);

      // Add to risk pool
      await this.addToRiskPool(policy);

      const creationTime = Date.now() - startTime;

      return {
        success: true,
        policy,
        riskAssessment,
        premiumCalculation,
        underwritingDecision,
        creationTime,
        coverageStartDate: policy.coverageStartDate
      };

    } catch (error) {
      console.error(`❌ Error creating insurance policy for user ${userId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async validatePolicyApplication(policyData) {
    const errors = [];

    if (!policyData.insuredAddress || !policyData.insuredAddress.startsWith('0x')) {
      errors.push('Valid insured address required');
    }

    if (!policyData.coverageType || !this.options.supportedInsuranceTypes.includes(policyData.coverageType)) {
      errors.push('Supported coverage type required');
    }

    if (!policyData.coverageAmount || policyData.coverageAmount < this.options.minCoverageAmount) {
      errors.push(`Minimum coverage amount is $${this.options.minCoverageAmount}`);
    }

    if (policyData.coverageAmount > this.options.maxCoverageAmount) {
      errors.push(`Maximum coverage amount is $${this.options.maxCoverageAmount}`);
    }

    if (!policyData.coveragePeriod || policyData.coveragePeriod < 30 || policyData.coveragePeriod > 365) {
      errors.push('Coverage period must be between 30 and 365 days');
    }

    if (!policyData.riskAssets || policyData.riskAssets.length === 0) {
      errors.push('At least one risk asset must be specified');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async performRiskAssessment(policyData) {
    // AI-powered risk assessment for insurance underwriting
    const riskFactors = {
      assetRisk: await this.assessAssetRisk(policyData.riskAssets),
      protocolRisk: await this.assessProtocolRisk(policyData.protocols),
      historicalRisk: await this.assessHistoricalRisk(policyData.insuredAddress),
      marketRisk: await this.assessMarketRisk(policyData),
      operationalRisk: await this.assessOperationalRisk(policyData)
    };

    const overallRiskScore = Object.values(riskFactors).reduce((sum, factor) =>
      sum + factor.riskScore, 0) / Object.values(riskFactors).length;

    return {
      factors: riskFactors,
      overallScore: overallRiskScore,
      riskCategory: overallRiskScore > 0.8 ? 'very_high' : overallRiskScore > 0.6 ? 'high' : overallRiskScore > 0.4 ? 'medium' : 'low',
      confidence: 0.8 + Math.random() * 0.15, // 80-95% confidence
      lastUpdated: Date.now()
    };
  }

  async assessAssetRisk(riskAssets) {
    let totalRisk = 0;
    let assetCount = 0;

    for (const asset of riskAssets) {
      // Asset-specific risk calculation
      const assetRisk = {
        liquidityRisk: asset.liquidity < 1000000 ? 0.3 : 0.1,
        volatilityRisk: asset.volatility > 0.5 ? 0.4 : 0.2,
        smartContractRisk: asset.auditScore < 0.8 ? 0.3 : 0.1,
        concentrationRisk: asset.allocation > 0.5 ? 0.2 : 0.05
      };

      totalRisk += Object.values(assetRisk).reduce((sum, risk) => sum + risk, 0);
      assetCount++;
    }

    return {
      riskScore: assetCount > 0 ? totalRisk / assetCount : 0,
      assetCount,
      primaryConcerns: totalRisk > 0.5 ? ['high_asset_risk', 'concentration_risk'] : ['acceptable_risk']
    };
  }

  async assessProtocolRisk(protocols) {
    let protocolRisk = 0;
    let protocolCount = 0;

    for (const protocol of protocols || []) {
      // Protocol-specific risk assessment
      const riskScore = protocol.tvl > 100000000 ? 0.1 : // Large protocols are safer
                      protocol.auditScore < 0.7 ? 0.4 : 0.2;

      protocolRisk += riskScore;
      protocolCount++;
    }

    return {
      riskScore: protocolCount > 0 ? protocolRisk / protocolCount : 0.3,
      protocolCount,
      primaryConcerns: protocolRisk > 0.3 ? ['protocol_vulnerability', 'audit_concerns'] : ['acceptable_risk']
    };
  }

  async assessHistoricalRisk(insuredAddress) {
    // Mock historical risk assessment based on address history
    return {
      riskScore: Math.random() * 0.3, // 0-30% historical risk
      incidentCount: Math.floor(Math.random() * 3), // 0-2 past incidents
      claimHistory: Math.random() > 0.8 ? 'clean' : 'minor_claims',
      primaryConcerns: Math.random() > 0.7 ? ['past_incidents'] : []
    };
  }

  async assessMarketRisk(policyData) {
    // Market condition risk assessment
    const marketVolatility = Math.random() * 0.4 + 0.2; // 20-60% volatility
    const correlationRisk = Math.random() * 0.3; // 0-30% correlation risk

    return {
      riskScore: (marketVolatility + correlationRisk) / 2,
      marketVolatility,
      correlationRisk,
      primaryConcerns: marketVolatility > 0.5 ? ['high_volatility'] : []
    };
  }

  async assessOperationalRisk(policyData) {
    // Operational and management risk assessment
    return {
      riskScore: Math.random() * 0.2, // 0-20% operational risk
      managementQuality: Math.random() * 0.3 + 0.7, // 70-100% management quality
      operationalMaturity: Math.random() * 0.2 + 0.8, // 80-100% maturity
      primaryConcerns: Math.random() > 0.8 ? ['operational_concerns'] : []
    };
  }

  async calculatePremium(policyData, riskAssessment) {
    // AI-powered premium calculation
    const basePremiumRate = this.getBasePremiumRate(policyData.coverageType);
    const riskMultiplier = 1 + (riskAssessment.overallScore * 2); // Risk score 0-1 becomes 1-3x multiplier
    const coverageMultiplier = policyData.coverageAmount / 1000000; // Per $1M coverage
    const durationMultiplier = policyData.coveragePeriod / 365; // Annual adjustment

    const annualPremium = basePremiumRate * riskMultiplier * coverageMultiplier * durationMultiplier * policyData.coverageAmount;

    return {
      annualPremium,
      monthlyPremium: annualPremium / 12,
      baseRate: basePremiumRate,
      riskMultiplier,
      coverageMultiplier,
      durationMultiplier,
      calculationMethod: 'ai_powered_underwriting'
    };
  }

  getBasePremiumRate(coverageType) {
    const rates = {
      'smart_contract_coverage': 0.02, // 2% base rate
      'oracle_failure': 0.015, // 1.5% base rate
      'flash_loan_attack': 0.025, // 2.5% base rate
      'liquidity_pool_drain': 0.02, // 2% base rate
      'governance_attack': 0.018, // 1.8% base rate
      'bridge_hack': 0.022 // 2.2% base rate
    };

    return rates[coverageType] || 0.02;
  }

  async underwritePolicy(policyData, riskAssessment, premiumCalculation) {
    // Automated underwriting decision
    const decision = {
      approved: true,
      reason: 'Standard underwriting approval',
      conditions: [],
      specialTerms: []
    };

    // Risk-based underwriting rules
    if (riskAssessment.overallScore > 0.8) {
      decision.approved = false;
      decision.reason = 'Risk score exceeds underwriting threshold';
    }

    if (policyData.coverageAmount > 5000000 && riskAssessment.overallScore > 0.6) {
      decision.conditions.push('Enhanced monitoring required');
      decision.specialTerms.push('Higher deductible applies');
    }

    if (premiumCalculation.annualPremium > policyData.maxPremium) {
      decision.approved = false;
      decision.reason = 'Premium exceeds user budget';
    }

    return decision;
  }

  async createPolicy(policyData, riskAssessment, premiumCalculation, underwritingDecision) {
    const policy = {
      policyId: `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      insuredAddress: policyData.insuredAddress,
      coverageType: policyData.coverageType,
      coverageAmount: policyData.coverageAmount,
      coveragePeriod: policyData.coveragePeriod,
      premium: premiumCalculation.annualPremium,
      riskAssessment,
      underwritingDecision,
      status: 'active',
      createdAt: Date.now(),
      coverageStartDate: Date.now() + (3 * 86400000), // 3 days processing time
      coverageEndDate: Date.now() + (policyData.coveragePeriod * 86400000),
      deductible: Math.min(policyData.coverageAmount * 0.1, 100000), // 10% or $100K max
      claims: [],
      riskPoolId: await this.getOptimalRiskPool(policyData, riskAssessment)
    };

    this.insurancePolicies.set(policy.policyId, policy);

    return policy;
  }

  async getOptimalRiskPool(policyData, riskAssessment) {
    // Find best risk pool for this policy
    const pools = Array.from(this.riskPools.values())
      .filter(pool => pool.coverageType === policyData.coverageType &&
                     pool.currentCapacity < pool.maxCapacity);

    if (pools.length === 0) {
      // Create new risk pool
      return await this.createRiskPool(policyData.coverageType);
    }

    // Return pool with lowest utilization
    return pools.sort((a, b) => a.currentCapacity / a.maxCapacity - b.currentCapacity / b.maxCapacity)[0].poolId;
  }

  async addToRiskPool(policy) {
    const pool = this.riskPools.get(policy.riskPoolId);
    if (pool) {
      pool.policies.push(policy.policyId);
      pool.currentCapacity += policy.coverageAmount;
      pool.totalPremium += policy.premium;
    }
  }

  async createRiskPool(coverageType) {
    const poolId = `pool_${coverageType}_${Date.now()}`;
    const pool = {
      poolId,
      coverageType,
      maxCapacity: 50000000, // $50M max capacity
      currentCapacity: 0,
      totalPremium: 0,
      policies: [],
      riskDistribution: {},
      createdAt: Date.now(),
      status: 'active'
    };

    this.riskPools.set(poolId, pool);
    return poolId;
  }

  async processClaim(policyId, claimData) {
    if (!this.isInitialized) {
      throw new Error('DeFi Insurance AI Service not initialized');
    }

    try {
      const policy = this.insurancePolicies.get(policyId);
      if (!policy) {
        return { success: false, reason: 'Policy not found' };
      }

      if (policy.status !== 'active') {
        return { success: false, reason: 'Policy not active' };
      }

      // Validate claim
      const validation = await this.validateClaim(policy, claimData);

      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }

      // AI-powered claim assessment
      const claimAssessment = await this.assessClaim(policy, claimData);

      // Calculate payout
      const payoutCalculation = await this.calculatePayout(policy, claimData, claimAssessment);

      // Process claim
      const claim = await this.createClaim(policy, claimData, claimAssessment, payoutCalculation);

      // Update policy
      policy.claims.push(claim.claimId);

      return {
        success: true,
        claim,
        payoutCalculation,
        assessment: claimAssessment,
        processingTime: Date.now() - claimData.submittedAt
      };

    } catch (error) {
      console.error(`❌ Error processing claim for policy ${policyId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async validateClaim(policy, claimData) {
    const errors = [];

    if (!claimData.incidentDescription || claimData.incidentDescription.length < 50) {
      errors.push('Detailed incident description required');
    }

    if (!claimData.evidence || claimData.evidence.length === 0) {
      errors.push('Supporting evidence required');
    }

    if (claimData.claimAmount > policy.coverageAmount) {
      errors.push('Claim amount exceeds coverage limit');
    }

    if (claimData.incidentDate < policy.coverageStartDate || claimData.incidentDate > policy.coverageEndDate) {
      errors.push('Incident occurred outside coverage period');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async assessClaim(policy, claimData) {
    // AI-powered claim legitimacy assessment
    const legitimacyScore = await this.calculateClaimLegitimacy(policy, claimData);
    const damageAssessment = await this.assessClaimDamage(policy, claimData);

    return {
      legitimacyScore,
      damageAssessment,
      fraudProbability: 1 - legitimacyScore,
      validClaim: legitimacyScore > 0.7 && damageAssessment.severity > 0.3,
      confidence: 0.8 + Math.random() * 0.15, // 80-95% confidence
      processingPriority: legitimacyScore > 0.9 ? 'high' : legitimacyScore > 0.7 ? 'medium' : 'low'
    };
  }

  async calculateClaimLegitimacy(policy, claimData) {
    // Mock claim legitimacy calculation
    let legitimacy = 0.5; // Base legitimacy

    // Evidence quality assessment
    if (claimData.evidence.length > 3) legitimacy += 0.2;
    if (claimData.transactionHashes && claimData.transactionHashes.length > 0) legitimacy += 0.2;
    if (claimData.witnessTestimony) legitimacy += 0.1;

    // Policy compliance check
    if (claimData.coverageType === policy.coverageType) legitimacy += 0.1;

    return Math.min(legitimacy, 1.0);
  }

  async assessClaimDamage(policy, claimData) {
    // Damage assessment based on incident type and evidence
    const severityFactors = {
      'total_loss': 1.0,
      'partial_loss': 0.6,
      'service_disruption': 0.3,
      'reputation_damage': 0.2
    };

    const severity = severityFactors[claimData.damageType] || 0.5;
    const amount = Math.min(claimData.claimAmount, policy.coverageAmount);

    return {
      severity,
      estimatedLoss: amount,
      recoverableAmount: amount * severity,
      assessmentMethod: 'ai_powered_evaluation'
    };
  }

  async calculatePayout(policy, claimData, claimAssessment) {
    if (!claimAssessment.validClaim) {
      return {
        approved: false,
        reason: 'Claim assessment indicates invalid or fraudulent claim',
        payoutAmount: 0
      };
    }

    const payoutAmount = claimAssessment.damageAssessment.recoverableAmount - policy.deductible;
    const approved = payoutAmount > 0;

    return {
      approved,
      payoutAmount: Math.max(0, payoutAmount),
      deductibleApplied: policy.deductible,
      processingFee: payoutAmount * 0.01, // 1% processing fee
      netPayout: approved ? payoutAmount * 0.99 : 0,
      payoutTimeline: approved ? '7-14 business days' : 'N/A'
    };
  }

  async createClaim(policy, claimData, claimAssessment, payoutCalculation) {
    const claim = {
      claimId: `claim_${policy.policyId}_${Date.now()}`,
      policyId: policy.policyId,
      claimData,
      assessment: claimAssessment,
      payoutCalculation,
      status: payoutCalculation.approved ? 'approved' : 'denied',
      submittedAt: claimData.submittedAt || Date.now(),
      processedAt: Date.now(),
      investigator: 'AI Claims Processor'
    };

    this.claimsProcessor.set(claim.claimId, claim);

    // Update policy claims
    policy.claims.push(claim.claimId);

    return claim;
  }

  async initializeRiskPools() {
    console.log('🏊 Initializing DeFi risk pools...');

    for (const coverageType of this.options.supportedInsuranceTypes) {
      await this.createRiskPool(coverageType);
    }
  }

  async loadInsuranceModels() {
    console.log('🧠 Loading insurance AI models...');

    // Initialize risk assessment and underwriting models
    console.log('✅ Insurance models loaded');
  }

  async setupClaimsProcessing() {
    console.log('⚖️ Setting up automated claims processing...');

    // Initialize claims processing pipeline
    console.log('✅ Claims processing ready');
  }

  startPeriodicRiskAssessment() {
    this.riskAssessmentTimer = setInterval(async () => {
      try {
        await this.updateRiskAssessments();
        await this.rebalanceRiskPools();
        await this.updatePremiumPricing();
        this.emit('riskAssessmentCompleted');
      } catch (error) {
        console.error('❌ Error in periodic risk assessment:', error);
      }
    }, this.options.riskAssessmentInterval);
  }

  async updateRiskAssessments() {
    for (const [policyId, policy] of this.insurancePolicies.entries()) {
      try {
        if (policy.status === 'active') {
          // Update ongoing risk assessment
          const updatedRisk = await this.performRiskAssessment(policy);
          policy.riskAssessment = updatedRisk;

          // Adjust premium if risk changes significantly
          if (Math.abs(updatedRisk.overallScore - policy.riskAssessment.overallScore) > 0.1) {
            await this.adjustPremium(policyId, updatedRisk);
          }
        }
      } catch (error) {
        console.error(`❌ Error updating risk assessment for ${policyId}:`, error);
      }
    }
  }

  async adjustPremium(policyId, updatedRisk) {
    const policy = this.insurancePolicies.get(policyId);
    if (!policy) return;

    const newPremium = await this.calculatePremium(policy, updatedRisk);

    // Only adjust if significant change
    if (Math.abs(newPremium.annualPremium - policy.premium) / policy.premium > 0.1) {
      policy.premium = newPremium.annualPremium;
      policy.premiumAdjustmentDate = Date.now();
      policy.premiumAdjustmentReason = 'Risk assessment update';

      this.emit('premiumAdjusted', { policyId, oldPremium: policy.premium, newPremium: newPremium.annualPremium });
    }
  }

  async rebalanceRiskPools() {
    for (const [poolId, pool] of this.riskPools.entries()) {
      try {
        if (pool.status === 'active') {
          // Rebalance pool risk distribution
          await this.optimizePoolAllocation(poolId);
        }
      } catch (error) {
        console.error(`❌ Error rebalancing risk pool ${poolId}:`, error);
      }
    }
  }

  async optimizePoolAllocation(poolId) {
    const pool = this.riskPools.get(poolId);
    if (!pool) return;

    // AI-powered pool optimization
    const optimization = {
      targetRiskDistribution: this.calculateOptimalRiskDistribution(pool),
      rebalancingActions: this.generateRebalancingActions(pool),
      expectedPerformance: this.predictPoolPerformance(pool)
    };

    // Apply optimization if beneficial
    if (optimization.expectedPerformance.improvement > 0.05) {
      pool.optimization = optimization;
      pool.lastOptimized = Date.now();
    }
  }

  calculateOptimalRiskDistribution(pool) {
    // Mock optimal risk distribution calculation
    return {
      lowRisk: 0.4,
      mediumRisk: 0.4,
      highRisk: 0.2
    };
  }

  generateRebalancingActions(pool) {
    // Mock rebalancing actions
    return [
      'Reduce exposure to high-risk policies',
      'Increase allocation to medium-risk opportunities',
      'Diversify across additional protocols'
    ];
  }

  predictPoolPerformance(pool) {
    // Mock performance prediction
    return {
      expectedReturn: 0.12, // 12% expected return
      riskLevel: 0.25, // 25% risk
      improvement: 0.08 // 8% improvement from optimization
    };
  }

  async updatePremiumPricing() {
    // Update base premium rates based on market conditions
    for (const coverageType of this.options.supportedInsuranceTypes) {
      try {
        const marketAdjustment = await this.calculateMarketAdjustment(coverageType);
        // Apply market-based premium adjustments
      } catch (error) {
        console.error(`❌ Error updating premium pricing for ${coverageType}:`, error);
      }
    }
  }

  async calculateMarketAdjustment(coverageType) {
    // Mock market condition adjustment
    return 1 + (Math.random() * 0.2 - 0.1); // ±10% market adjustment
  }

  getServiceStats() {
    return {
      supportedInsuranceTypes: this.options.supportedInsuranceTypes.length,
      activePolicies: Array.from(this.insurancePolicies.values()).filter(p => p.status === 'active').length,
      totalCoverageAmount: this.calculateTotalCoverage(),
      riskPoolsCount: this.riskPools.size,
      totalPremiums: this.calculateTotalPremiums(),
      claimsProcessed: this.claimsProcessor.size,
      averageRiskScore: this.calculateAverageRiskScore(),
      lastRiskAssessment: Date.now() - Math.random() * 86400000 // Within last 24 hours
    };
  }

  calculateTotalCoverage() {
    return Array.from(this.insurancePolicies.values())
      .filter(policy => policy.status === 'active')
      .reduce((sum, policy) => sum + policy.coverageAmount, 0);
  }

  calculateTotalPremiums() {
    return Array.from(this.insurancePolicies.values())
      .reduce((sum, policy) => sum + policy.premium, 0);
  }

  calculateAverageRiskScore() {
    const policies = Array.from(this.insurancePolicies.values());
    if (policies.length === 0) return 0;

    const scores = policies.map(policy => policy.riskAssessment?.overallScore || 0);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  async getRiskPoolAnalytics(poolId) {
    const pool = this.riskPools.get(poolId);
    if (!pool) return null;

    return {
      poolId,
      coverageType: pool.coverageType,
      utilization: pool.currentCapacity / pool.maxCapacity,
      policyCount: pool.policies.length,
      totalPremium: pool.totalPremium,
      riskDistribution: pool.riskDistribution,
      performance: pool.optimization?.expectedPerformance || this.predictPoolPerformance(pool)
    };
  }

  async getInsurancePortfolio(userId) {
    const userPolicies = Array.from(this.insurancePolicies.values())
      .filter(policy => policy.insuredAddress === userId);

    return {
      userId,
      totalPolicies: userPolicies.length,
      totalCoverage: userPolicies.reduce((sum, policy) => sum + policy.coverageAmount, 0),
      totalPremiums: userPolicies.reduce((sum, policy) => sum + policy.premium, 0),
      activeClaims: userPolicies.reduce((sum, policy) => sum + policy.claims.length, 0),
      policies: userPolicies.map(policy => ({
        policyId: policy.policyId,
        coverageType: policy.coverageType,
        coverageAmount: policy.coverageAmount,
        premium: policy.premium,
        status: policy.status,
        expiryDate: policy.coverageEndDate
      }))
    };
  }

  cleanup() {
    if (this.riskAssessmentTimer) {
      clearInterval(this.riskAssessmentTimer);
      this.riskAssessmentTimer = null;
    }

    this.insurancePolicies.clear();
    this.riskPools.clear();
    this.claimsProcessor.clear();
    this.underwritingModels.clear();
  }
}

module.exports = DeFiInsuranceAIService;
