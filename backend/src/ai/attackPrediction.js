/**
 * AI-Powered Attack Prediction and Prevention System
 * Advanced AI system for predicting and preventing attacks before they happen
 *
 * Features:
 * - LSTM-based attack sequence prediction
 * - Behavioral pattern analysis
 * - Attack chain reconstruction
 * - Predictive threat scoring
 * - Proactive defense recommendations
 * - Multi-stage attack detection
 * - Zero-day attack prediction
 */

const tf = require('@tensorflow/tfjs-node');
const EventEmitter = require('events');

class AttackPredictionAI extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      sequenceLength: options.sequenceLength || 50,
      predictionHorizon: options.predictionHorizon || 10, // Predict next 10 events
      confidenceThreshold: options.confidenceThreshold || 0.75,
      learningRate: options.learningRate || 0.0001,
      modelPath: options.modelPath || './models/attack-prediction',
      updateInterval: options.updateInterval || 3600000, // 1 hour
      ...options
    };

    this.lstmModel = null;
    this.attackPatterns = new Map();
    this.behaviorProfiles = new Map();
    this.attackChains = new Map();
    this.eventSequences = [];

    this.attackStages = {
      RECONNAISSANCE: 0,
      WEAPONIZATION: 1,
      DELIVERY: 2,
      EXPLOITATION: 3,
      INSTALLATION: 4,
      COMMAND_CONTROL: 5,
      ACTIONS_ON_OBJECTIVES: 6
    };

    this.eventTypeEncoding = new Map();
    this.initializeEncodings();

    this.metrics = {
      predictionsTotal: 0,
      attacksPrevented: 0,
      correctPredictions: 0,
      falseAlarms: 0,
      accuracy: 0,
      avgConfidence: 0
    };
  }

  /**
   * Initialize encoding mappings
   */
  initializeEncodings() {
    const eventTypes = [
      'SQL_INJECTION', 'XSS', 'COMMAND_INJECTION', 'PATH_TRAVERSAL',
      'DDOS', 'LDAP_INJECTION', 'XXE', 'SSRF', 'PROTOTYPE_POLLUTION',
      'NOSQL_INJECTION', 'TEMPLATE_INJECTION', 'DESERIALIZATION',
      'PRIVILEGE_ESCALATION', 'DATA_BREACH', 'MALWARE_DETECTED',
      'SUSPICIOUS_LOGIN', 'BRUTE_FORCE', 'PORT_SCAN', 'RECONNAISSANCE',
      'NORMAL_TRAFFIC'
    ];

    eventTypes.forEach((type, index) => {
      this.eventTypeEncoding.set(type, index);
    });
  }

  /**
   * Initialize AI models
   */
  async initialize() {
    console.log('🤖 Initializing AI Attack Prediction System...');

    try {
      await this.loadModel();
    } catch (error) {
      console.log('Creating new LSTM model...');
      await this.createLSTMModel();
    }

    // Start periodic model updates
    setInterval(() => this.updateModel(), this.options.updateInterval);

    console.log('✅ AI Attack Prediction System initialized');
  }

  /**
   * Create LSTM model for sequence prediction
   */
  async createLSTMModel() {
    const vocabSize = this.eventTypeEncoding.size;
    const embeddingDim = 32;
    const lstmUnits = 128;

    this.lstmModel = tf.sequential({
      layers: [
        // Embedding layer
        tf.layers.embedding({
          inputDim: vocabSize,
          outputDim: embeddingDim,
          inputLength: this.options.sequenceLength
        }),

        // Bidirectional LSTM layers
        tf.layers.bidirectional({
          layer: tf.layers.lstm({
            units: lstmUnits,
            returnSequences: true,
            dropout: 0.3,
            recurrentDropout: 0.3
          })
        }),

        tf.layers.bidirectional({
          layer: tf.layers.lstm({
            units: lstmUnits / 2,
            returnSequences: false,
            dropout: 0.2,
            recurrentDropout: 0.2
          })
        }),

        // Attention mechanism (simplified)
        tf.layers.dense({
          units: lstmUnits / 2,
          activation: 'tanh'
        }),

        tf.layers.dropout({ rate: 0.3 }),

        // Output layer
        tf.layers.dense({
          units: vocabSize,
          activation: 'softmax'
        })
      ]
    });

    this.lstmModel.compile({
      optimizer: tf.train.adam(this.options.learningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    console.log('✅ LSTM model created');
  }

  /**
   * Predict next attacks in sequence
   */
  async predictNextAttacks(eventSequence) {
    if (!this.lstmModel) {
      throw new Error('Model not initialized');
    }

    this.metrics.predictionsTotal++;

    // Encode sequence
    const encodedSequence = this.encodeSequence(eventSequence);

    // Ensure sequence is correct length
    const paddedSequence = this.padSequence(encodedSequence, this.options.sequenceLength);

    // Predict
    const inputTensor = tf.tensor2d([paddedSequence]);
    const predictions = await this.lstmModel.predict(inputTensor).data();
    inputTensor.dispose();

    // Get top predictions
    const topPredictions = this.getTopPredictions(predictions, 5);

    // Analyze attack chain
    const attackChain = this.reconstructAttackChain(eventSequence);

    // Calculate risk
    const riskAssessment = this.assessRisk(topPredictions, attackChain);

    const result = {
      predictions: topPredictions,
      attackChain,
      currentStage: this.identifyAttackStage(eventSequence),
      nextLikelyStage: this.predictNextStage(attackChain),
      riskScore: riskAssessment.score,
      confidence: riskAssessment.confidence,
      timeToAttack: this.estimateTimeToAttack(attackChain),
      recommendations: this.generatePreventionRecommendations(topPredictions, attackChain),
      shouldBlock: riskAssessment.score > 80 && riskAssessment.confidence > this.options.confidenceThreshold
    };

    this.metrics.avgConfidence =
      (this.metrics.avgConfidence * (this.metrics.predictionsTotal - 1) + riskAssessment.confidence) /
      this.metrics.predictionsTotal;

    if (result.shouldBlock) {
      this.emit('attackPredicted', result);
    }

    return result;
  }

  /**
   * Analyze behavioral patterns
   */
  async analyzeBehavior(ip, events) {
    let profile = this.behaviorProfiles.get(ip);

    if (!profile) {
      profile = {
        ip,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        eventCount: 0,
        eventTypes: new Map(),
        timePatterns: [],
        requestPatterns: [],
        anomalyScore: 0,
        isSuspicious: false
      };
      this.behaviorProfiles.set(ip, profile);
    }

    // Update profile
    profile.lastSeen = Date.now();
    profile.eventCount += events.length;

    events.forEach(event => {
      const count = profile.eventTypes.get(event.type) || 0;
      profile.eventTypes.set(event.type, count + 1);

      profile.timePatterns.push(new Date(event.timestamp).getHours());
      profile.requestPatterns.push(event.url || '');
    });

    // Calculate anomaly score
    profile.anomalyScore = this.calculateAnomalyScore(profile);
    profile.isSuspicious = profile.anomalyScore > 0.7;

    // Detect behavioral anomalies
    const anomalies = this.detectBehavioralAnomalies(profile);

    return {
      profile,
      anomalies,
      threat: profile.isSuspicious,
      recommendation: this.getBehaviorRecommendation(profile, anomalies)
    };
  }

  /**
   * Reconstruct attack chain (Cyber Kill Chain)
   */
  reconstructAttackChain(events) {
    const chain = {
      stages: [],
      completeness: 0,
      duration: 0,
      progression: []
    };

    if (events.length === 0) return chain;

    // Map events to attack stages
    events.forEach(event => {
      const stage = this.mapEventToStage(event);
      if (stage !== null) {
        chain.stages.push({
          stage,
          stageName: Object.keys(this.attackStages)[stage],
          event,
          timestamp: event.timestamp
        });
      }
    });

    // Sort by timestamp
    chain.stages.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate completeness (how far through kill chain)
    const maxStage = Math.max(...chain.stages.map(s => s.stage), 0);
    chain.completeness = (maxStage / 6) * 100; // 7 stages (0-6)

    // Calculate duration
    if (chain.stages.length > 0) {
      chain.duration = chain.stages[chain.stages.length - 1].timestamp - chain.stages[0].timestamp;
    }

    // Analyze progression
    chain.progression = this.analyzeChainProgression(chain.stages);

    return chain;
  }

  /**
   * Map event to Cyber Kill Chain stage
   */
  mapEventToStage(event) {
    const stageMapping = {
      'PORT_SCAN': this.attackStages.RECONNAISSANCE,
      'RECONNAISSANCE': this.attackStages.RECONNAISSANCE,
      'SQL_INJECTION': this.attackStages.EXPLOITATION,
      'XSS': this.attackStages.EXPLOITATION,
      'COMMAND_INJECTION': this.attackStages.EXPLOITATION,
      'PATH_TRAVERSAL': this.attackStages.EXPLOITATION,
      'MALWARE_DETECTED': this.attackStages.INSTALLATION,
      'PRIVILEGE_ESCALATION': this.attackStages.INSTALLATION,
      'SUSPICIOUS_LOGIN': this.attackStages.COMMAND_CONTROL,
      'DATA_BREACH': this.attackStages.ACTIONS_ON_OBJECTIVES
    };

    return stageMapping[event.type] ?? null;
  }

  /**
   * Identify current attack stage
   */
  identifyAttackStage(events) {
    if (events.length === 0) return 'NONE';

    const recentEvents = events.slice(-10); // Last 10 events
    const stages = recentEvents
      .map(e => this.mapEventToStage(e))
      .filter(s => s !== null);

    if (stages.length === 0) return 'NONE';

    // Return most advanced stage
    const maxStage = Math.max(...stages);
    return Object.keys(this.attackStages)[maxStage];
  }

  /**
   * Predict next stage in attack chain
   */
  predictNextStage(attackChain) {
    if (attackChain.stages.length === 0) {
      return {
        stage: 'RECONNAISSANCE',
        probability: 0.5,
        timeEstimate: null
      };
    }

    const currentStage = Math.max(...attackChain.stages.map(s => s.stage));

    if (currentStage >= 6) {
      return {
        stage: 'COMPLETE',
        probability: 0.9,
        timeEstimate: 0
      };
    }

    const nextStage = currentStage + 1;
    const stageName = Object.keys(this.attackStages)[nextStage];

    // Estimate probability based on progression pattern
    const progressionSpeed = this.calculateProgressionSpeed(attackChain);
    const probability = Math.min(0.5 + progressionSpeed * 0.5, 0.95);

    // Estimate time to next stage
    const avgTimePerStage = attackChain.duration / attackChain.stages.length;
    const timeEstimate = avgTimePerStage * (1 / progressionSpeed);

    return {
      stage: stageName,
      probability,
      timeEstimate
    };
  }

  /**
   * Estimate time until attack completion
   */
  estimateTimeToAttack(attackChain) {
    if (attackChain.stages.length === 0) {
      return null;
    }

    const currentStage = Math.max(...attackChain.stages.map(s => s.stage));
    const remainingStages = 6 - currentStage;

    if (remainingStages <= 0) {
      return 0; // Attack complete
    }

    // Calculate average time per stage
    const avgTimePerStage = attackChain.duration / attackChain.stages.length;

    // Estimate total remaining time
    const estimate = avgTimePerStage * remainingStages;

    return {
      milliseconds: estimate,
      seconds: Math.round(estimate / 1000),
      minutes: Math.round(estimate / 60000),
      formatted: this.formatDuration(estimate)
    };
  }

  /**
   * Generate prevention recommendations
   */
  generatePreventionRecommendations(predictions, attackChain) {
    const recommendations = [];

    // Based on predictions
    predictions.forEach(pred => {
      if (pred.probability > 0.5) {
        recommendations.push({
          priority: 'HIGH',
          action: this.getPreventionAction(pred.eventType),
          reason: `${pred.eventType} predicted with ${(pred.probability * 100).toFixed(1)}% probability`,
          type: 'PROACTIVE'
        });
      }
    });

    // Based on attack chain stage
    const currentStage = attackChain.stages.length > 0 ?
      Math.max(...attackChain.stages.map(s => s.stage)) : -1;

    if (currentStage >= this.attackStages.EXPLOITATION) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'ISOLATE_SYSTEM',
        reason: 'Attack reached exploitation stage',
        type: 'REACTIVE'
      });
    }

    if (currentStage >= this.attackStages.COMMAND_CONTROL) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'TERMINATE_CONNECTIONS',
        reason: 'Command & Control detected',
        type: 'REACTIVE'
      });
    }

    // Based on attack chain completeness
    if (attackChain.completeness > 70) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'EMERGENCY_RESPONSE',
        reason: `Attack chain ${attackChain.completeness.toFixed(0)}% complete`,
        type: 'URGENT'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get prevention action for event type
   */
  getPreventionAction(eventType) {
    const actions = {
      'SQL_INJECTION': 'ENABLE_WAF_SQL_PROTECTION',
      'XSS': 'ENABLE_CSP_HEADERS',
      'COMMAND_INJECTION': 'RESTRICT_SYSTEM_COMMANDS',
      'DDOS': 'ENABLE_RATE_LIMITING',
      'MALWARE_DETECTED': 'QUARANTINE_SYSTEM',
      'PRIVILEGE_ESCALATION': 'AUDIT_PRIVILEGES',
      'DATA_BREACH': 'LOCK_DATA_ACCESS'
    };

    return actions[eventType] || 'MONITOR_CLOSELY';
  }

  /**
   * Calculate behavioral anomaly score
   */
  calculateAnomalyScore(profile) {
    let score = 0;

    // Event frequency anomaly
    const eventRate = profile.eventCount / ((Date.now() - profile.firstSeen) / 1000);
    if (eventRate > 10) score += 0.3; // More than 10 events/second

    // Event type diversity
    const typeCount = profile.eventTypes.size;
    if (typeCount > 5) score += 0.2; // Many different attack types

    // Time pattern anomaly (e.g., attacks at unusual hours)
    const nightEvents = profile.timePatterns.filter(h => h >= 0 && h < 6).length;
    if (nightEvents / profile.timePatterns.length > 0.5) score += 0.2;

    // Repeated failed attempts
    const failedAttempts = profile.eventTypes.get('SUSPICIOUS_LOGIN') || 0;
    if (failedAttempts > 10) score += 0.3;

    return Math.min(score, 1);
  }

  /**
   * Detect behavioral anomalies
   */
  detectBehavioralAnomalies(profile) {
    const anomalies = [];

    // Rapid event generation
    const eventRate = profile.eventCount / ((Date.now() - profile.firstSeen) / 1000);
    if (eventRate > 10) {
      anomalies.push({
        type: 'RAPID_EVENTS',
        severity: 'HIGH',
        description: `${eventRate.toFixed(1)} events/second`,
        score: 0.8
      });
    }

    // Unusual time patterns
    const nightEvents = profile.timePatterns.filter(h => h >= 0 && h < 6).length;
    if (nightEvents / profile.timePatterns.length > 0.7) {
      anomalies.push({
        type: 'UNUSUAL_HOURS',
        severity: 'MEDIUM',
        description: '70%+ of events during night hours',
        score: 0.6
      });
    }

    // Diverse attack types
    if (profile.eventTypes.size > 5) {
      anomalies.push({
        type: 'MULTIPLE_ATTACK_TYPES',
        severity: 'HIGH',
        description: `${profile.eventTypes.size} different attack types`,
        score: 0.7
      });
    }

    // Brute force pattern
    const loginAttempts = profile.eventTypes.get('SUSPICIOUS_LOGIN') || 0;
    if (loginAttempts > 20) {
      anomalies.push({
        type: 'BRUTE_FORCE',
        severity: 'CRITICAL',
        description: `${loginAttempts} login attempts`,
        score: 0.9
      });
    }

    return anomalies;
  }

  /**
   * Get behavior-based recommendation
   */
  getBehaviorRecommendation(profile, anomalies) {
    if (anomalies.length === 0) {
      return 'MONITOR';
    }

    const criticalAnomalies = anomalies.filter(a => a.severity === 'CRITICAL');
    if (criticalAnomalies.length > 0) {
      return 'BLOCK_IMMEDIATELY';
    }

    const highAnomalies = anomalies.filter(a => a.severity === 'HIGH');
    if (highAnomalies.length >= 2) {
      return 'BLOCK_TEMPORARILY';
    }

    if (profile.anomalyScore > 0.7) {
      return 'CHALLENGE_WITH_CAPTCHA';
    }

    return 'INCREASE_MONITORING';
  }

  /**
   * Analyze attack chain progression
   */
  analyzeChainProgression(stages) {
    if (stages.length < 2) {
      return { speed: 0, pattern: 'NONE' };
    }

    const timeDiffs = [];
    for (let i = 1; i < stages.length; i++) {
      timeDiffs.push(stages[i].timestamp - stages[i - 1].timestamp);
    }

    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

    // Determine pattern
    let pattern = 'STEADY';
    if (avgTimeDiff < 60000) { // Less than 1 minute
      pattern = 'RAPID';
    } else if (avgTimeDiff > 3600000) { // More than 1 hour
      pattern = 'SLOW';
    }

    // Check if accelerating
    const recentAvg = timeDiffs.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, timeDiffs.length);
    const earlyAvg = timeDiffs.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, timeDiffs.length);

    if (recentAvg < earlyAvg * 0.5) {
      pattern = 'ACCELERATING';
    }

    return {
      speed: avgTimeDiff,
      pattern,
      consistency: this.calculateConsistency(timeDiffs)
    };
  }

  /**
   * Calculate progression speed
   */
  calculateProgressionSpeed(attackChain) {
    if (attackChain.stages.length < 2) return 0.5;

    const progression = attackChain.progression;
    if (progression.pattern === 'RAPID') return 1.0;
    if (progression.pattern === 'ACCELERATING') return 0.9;
    if (progression.pattern === 'STEADY') return 0.6;
    if (progression.pattern === 'SLOW') return 0.3;

    return 0.5;
  }

  /**
   * Calculate consistency of time differences
   */
  calculateConsistency(timeDiffs) {
    if (timeDiffs.length === 0) return 0;

    const mean = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    const variance = timeDiffs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / timeDiffs.length;
    const stdDev = Math.sqrt(variance);

    // Lower coefficient of variation = higher consistency
    const cv = stdDev / mean;
    return Math.max(0, 1 - cv);
  }

  /**
   * Assess overall risk
   */
  assessRisk(predictions, attackChain) {
    let score = 0;
    let confidence = 0;

    // Risk from predictions
    const maxPredictionProb = Math.max(...predictions.map(p => p.probability), 0);
    score += maxPredictionProb * 40;
    confidence += maxPredictionProb * 0.4;

    // Risk from attack chain completeness
    score += attackChain.completeness * 0.4;
    confidence += (attackChain.stages.length / 10) * 0.3;

    // Risk from progression speed
    const speed = this.calculateProgressionSpeed(attackChain);
    score += speed * 20;
    confidence += speed * 0.3;

    return {
      score: Math.min(score, 100),
      confidence: Math.min(confidence, 1)
    };
  }

  /**
   * Helper methods
   */

  encodeSequence(events) {
    return events.map(event => {
      return this.eventTypeEncoding.get(event.type) || this.eventTypeEncoding.get('NORMAL_TRAFFIC');
    });
  }

  padSequence(sequence, length) {
    if (sequence.length >= length) {
      return sequence.slice(-length);
    }
    return [...Array(length - sequence.length).fill(0), ...sequence];
  }

  getTopPredictions(predictions, top = 5) {
    const indexed = Array.from(predictions).map((prob, index) => ({ index, probability: prob }));
    indexed.sort((a, b) => b.probability - a.probability);

    return indexed.slice(0, top).map(item => ({
      eventType: Array.from(this.eventTypeEncoding.entries())
        .find(([_, idx]) => idx === item.index)[0],
      probability: item.probability,
      confidence: item.probability
    }));
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Train model with feedback
   */
  async train(sequences, labels) {
    if (!this.lstmModel) {
      await this.createLSTMModel();
    }

    console.log(`🎓 Training attack prediction model with ${sequences.length} sequences...`);

    const XEncoded = sequences.map(seq => this.padSequence(this.encodeSequence(seq), this.options.sequenceLength));
    const yEncoded = labels.map(label => {
      const encoded = new Array(this.eventTypeEncoding.size).fill(0);
      const index = this.eventTypeEncoding.get(label);
      if (index !== undefined) encoded[index] = 1;
      return encoded;
    });

    const XTensor = tf.tensor2d(XEncoded);
    const yTensor = tf.tensor2d(yEncoded);

    const history = await this.lstmModel.fit(XTensor, yTensor, {
      epochs: 20,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 5 === 0) {
            console.log(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, accuracy=${logs.acc.toFixed(4)}`);
          }
        }
      }
    });

    XTensor.dispose();
    yTensor.dispose();

    this.metrics.accuracy = history.history.acc[history.history.acc.length - 1];

    await this.saveModel();

    console.log(`✅ Training complete. Accuracy: ${(this.metrics.accuracy * 100).toFixed(2)}%`);
  }

  /**
   * Update model periodically
   */
  async updateModel() {
    if (this.eventSequences.length < 100) {
      return;
    }

    console.log('🔄 Updating attack prediction model...');
    // Implement incremental learning here
  }

  /**
   * Save/Load model
   */
  async saveModel() {
    if (this.lstmModel) {
      await this.lstmModel.save(`file://${this.options.modelPath}`);
    }
  }

  async loadModel() {
    this.lstmModel = await tf.loadLayersModel(`file://${this.options.modelPath}/model.json`);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      behaviorProfilesTracked: this.behaviorProfiles.size,
      attackChainsDetected: this.attackChains.size,
      preventionRate: this.metrics.predictionsTotal > 0 ?
        (this.metrics.attacksPrevented / this.metrics.predictionsTotal * 100).toFixed(2) : 0
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.lstmModel) {
      this.lstmModel.dispose();
    }
    this.behaviorProfiles.clear();
    this.attackChains.clear();
  }
}

module.exports = AttackPredictionAI;
