/**
 * Machine Learning Threat Prediction Module
 * Uses TensorFlow.js for real-time threat prediction and anomaly detection
 *
 * Features:
 * - Anomaly detection using autoencoder
 * - Threat score prediction
 * - Behavioral analysis
 * - Pattern recognition
 * - Real-time learning and adaptation
 */

const tf = require('@tensorflow/tfjs-node');
const EventEmitter = require('events');

class ThreatPredictionML extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      modelPath: options.modelPath || './models/threat-prediction',
      learningRate: options.learningRate || 0.001,
      batchSize: options.batchSize || 32,
      epochs: options.epochs || 50,
      validationSplit: options.validationSplit || 0.2,
      anomalyThreshold: options.anomalyThreshold || 0.85,
      retrainInterval: options.retrainInterval || 86400000, // 24 hours
      minTrainingData: options.minTrainingData || 1000,
      ...options
    };

    this.model = null;
    this.anomalyModel = null;
    this.scaler = null;
    this.trainingData = [];
    this.featureStats = null;
    this.isTraining = false;
    this.lastTraining = null;

    this.metrics = {
      predictionsTotal: 0,
      anomaliesDetected: 0,
      threatsPredict: 0,
      accuracy: 0,
      lastUpdate: Date.now()
    };
  }

  /**
   * Initialize ML models
   */
  async initialize() {
    console.log('🧠 Initializing ML Threat Prediction...');

    try {
      // Try to load existing model
      await this.loadModel();
    } catch (error) {
      console.log('No existing model found, creating new models...');
      await this.createModels();
    }

    // Start periodic retraining
    setInterval(() => this.checkAndRetrain(), this.options.retrainInterval);

    console.log('✅ ML Threat Prediction initialized');
  }

  /**
   * Create neural network models
   */
  async createModels() {
    // Threat Classification Model
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [20], // 20 features
          units: 64,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid' // Binary: threat or not
        })
      ]
    });

    this.model.compile({
      optimizer: tf.train.adam(this.options.learningRate),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    // Anomaly Detection Model (Autoencoder)
    const encoderInput = tf.input({ shape: [20] });
    const encoded1 = tf.layers.dense({ units: 16, activation: 'relu' }).apply(encoderInput);
    const encoded2 = tf.layers.dense({ units: 8, activation: 'relu' }).apply(encoded1);
    const encoded3 = tf.layers.dense({ units: 4, activation: 'relu' }).apply(encoded2);

    const decoded1 = tf.layers.dense({ units: 8, activation: 'relu' }).apply(encoded3);
    const decoded2 = tf.layers.dense({ units: 16, activation: 'relu' }).apply(decoded1);
    const decoderOutput = tf.layers.dense({ units: 20, activation: 'sigmoid' }).apply(decoded2);

    this.anomalyModel = tf.model({
      inputs: encoderInput,
      outputs: decoderOutput
    });

    this.anomalyModel.compile({
      optimizer: tf.train.adam(this.options.learningRate),
      loss: 'meanSquaredError'
    });

    console.log('✅ ML models created');
  }

  /**
   * Extract features from security event
   */
  extractFeatures(event) {
    const features = {
      // Request characteristics
      requestLength: (event.url?.length || 0) / 1000,
      parameterCount: this.countParameters(event.url || ''),
      hasSpecialChars: this.hasSpecialCharacters(event.url || '') ? 1 : 0,

      // Attack patterns
      sqlInjectionScore: this.calculateSQLInjectionScore(event),
      xssScore: this.calculateXSSScore(event),
      pathTraversalScore: this.calculatePathTraversalScore(event),

      // IP reputation
      ipEntropy: this.calculateIPEntropy(event.ip || ''),
      ipFrequency: this.getIPFrequency(event.ip || ''),

      // Timing patterns
      hourOfDay: new Date(event.timestamp).getHours() / 24,
      dayOfWeek: new Date(event.timestamp).getDay() / 7,
      requestInterval: this.calculateRequestInterval(event.ip || ''),

      // User agent analysis
      userAgentEntropy: this.calculateEntropy(event.userAgent || ''),
      isBotUserAgent: this.isBotUserAgent(event.userAgent || '') ? 1 : 0,

      // Geographic
      geoRisk: this.calculateGeoRisk(event.ip || ''),

      // Historical patterns
      ipHistoricalThreatScore: this.getIPHistoricalScore(event.ip || ''),
      recentFailureRate: this.getRecentFailureRate(event.ip || ''),

      // Request complexity
      requestComplexity: this.calculateRequestComplexity(event),
      encodingLayers: this.countEncodingLayers(event.url || ''),

      // Pattern matching
      knownAttackPatternMatch: this.matchesKnownPattern(event) ? 1 : 0,

      // Behavioral
      deviationFromNormal: this.calculateDeviationFromNormal(event)
    };

    return Object.values(features);
  }

  /**
   * Predict threat probability
   */
  async predictThreat(event) {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    this.metrics.predictionsTotal++;

    try {
      const features = this.extractFeatures(event);
      const normalizedFeatures = this.normalizeFeatures(features);

      const inputTensor = tf.tensor2d([normalizedFeatures]);
      const prediction = await this.model.predict(inputTensor).data();
      inputTensor.dispose();

      const threatProbability = prediction[0];
      const isAnomaly = await this.detectAnomaly(normalizedFeatures);

      if (isAnomaly) {
        this.metrics.anomaliesDetected++;
      }

      if (threatProbability > 0.7 || isAnomaly) {
        this.metrics.threatsPredict++;
      }

      const result = {
        threatProbability,
        isAnomaly,
        riskScore: this.calculateRiskScore(threatProbability, isAnomaly),
        confidence: this.calculateConfidence(threatProbability),
        features: this.explainFeatures(features),
        recommendation: this.getRecommendation(threatProbability, isAnomaly)
      };

      this.emit('prediction', result);
      return result;

    } catch (error) {
      console.error('Prediction error:', error);
      throw error;
    }
  }

  /**
   * Detect anomalies using autoencoder
   */
  async detectAnomaly(features) {
    if (!this.anomalyModel) {
      return false;
    }

    try {
      const inputTensor = tf.tensor2d([features]);
      const reconstruction = await this.anomalyModel.predict(inputTensor).data();

      // Calculate reconstruction error
      let error = 0;
      for (let i = 0; i < features.length; i++) {
        error += Math.pow(features[i] - reconstruction[i], 2);
      }
      error = Math.sqrt(error / features.length);

      inputTensor.dispose();

      return error > this.options.anomalyThreshold;

    } catch (error) {
      console.error('Anomaly detection error:', error);
      return false;
    }
  }

  /**
   * Train model with new data
   */
  async train(trainingEvents) {
    if (this.isTraining) {
      console.log('Training already in progress');
      return;
    }

    if (trainingEvents.length < this.options.minTrainingData) {
      console.log(`Insufficient training data: ${trainingEvents.length} < ${this.options.minTrainingData}`);
      return;
    }

    this.isTraining = true;
    console.log(`🎓 Training model with ${trainingEvents.length} events...`);

    try {
      // Extract features and labels
      const X = trainingEvents.map(e => this.extractFeatures(e));
      const y = trainingEvents.map(e => e.isThreat ? 1 : 0);

      // Calculate feature statistics for normalization
      this.calculateFeatureStats(X);

      // Normalize features
      const XNormalized = X.map(features => this.normalizeFeatures(features));

      // Convert to tensors
      const XTensor = tf.tensor2d(XNormalized);
      const yTensor = tf.tensor2d(y, [y.length, 1]);

      // Train threat classification model
      console.log('Training threat classification model...');
      const history = await this.model.fit(XTensor, yTensor, {
        epochs: this.options.epochs,
        batchSize: this.options.batchSize,
        validationSplit: this.options.validationSplit,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, accuracy=${logs.acc.toFixed(4)}`);
            }
          }
        }
      });

      this.metrics.accuracy = history.history.acc[history.history.acc.length - 1];

      // Train anomaly detection model (on normal traffic only)
      console.log('Training anomaly detection model...');
      const normalTraffic = XNormalized.filter((_, i) => y[i] === 0);
      const normalTensor = tf.tensor2d(normalTraffic);

      await this.anomalyModel.fit(normalTensor, normalTensor, {
        epochs: Math.floor(this.options.epochs / 2),
        batchSize: this.options.batchSize,
        validationSplit: this.options.validationSplit
      });

      // Clean up
      XTensor.dispose();
      yTensor.dispose();
      normalTensor.dispose();

      this.lastTraining = Date.now();
      this.metrics.lastUpdate = Date.now();

      console.log(`✅ Training complete. Accuracy: ${(this.metrics.accuracy * 100).toFixed(2)}%`);

      // Save model
      await this.saveModel();

      this.emit('trainingComplete', {
        accuracy: this.metrics.accuracy,
        dataSize: trainingEvents.length
      });

    } catch (error) {
      console.error('Training error:', error);
      throw error;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Online learning - update model with single example
   */
  async updateWithFeedback(event, isThreat) {
    this.trainingData.push({ ...event, isThreat });

    // Limit training data size
    if (this.trainingData.length > 10000) {
      this.trainingData = this.trainingData.slice(-10000);
    }

    // Trigger retraining if enough new data
    if (this.trainingData.length >= this.options.minTrainingData &&
        (!this.lastTraining || Date.now() - this.lastTraining > 3600000)) {
      this.checkAndRetrain();
    }
  }

  /**
   * Check if retraining is needed
   */
  async checkAndRetrain() {
    if (this.trainingData.length >= this.options.minTrainingData && !this.isTraining) {
      console.log('🔄 Automatic retraining triggered');
      await this.train(this.trainingData);
    }
  }

  /**
   * Calculate feature statistics for normalization
   */
  calculateFeatureStats(features) {
    const numFeatures = features[0].length;
    this.featureStats = {
      mean: new Array(numFeatures).fill(0),
      std: new Array(numFeatures).fill(1)
    };

    // Calculate mean
    for (let i = 0; i < numFeatures; i++) {
      let sum = 0;
      for (let j = 0; j < features.length; j++) {
        sum += features[j][i];
      }
      this.featureStats.mean[i] = sum / features.length;
    }

    // Calculate standard deviation
    for (let i = 0; i < numFeatures; i++) {
      let sum = 0;
      for (let j = 0; j < features.length; j++) {
        sum += Math.pow(features[j][i] - this.featureStats.mean[i], 2);
      }
      this.featureStats.std[i] = Math.sqrt(sum / features.length) || 1;
    }
  }

  /**
   * Normalize features using z-score normalization
   */
  normalizeFeatures(features) {
    if (!this.featureStats) {
      return features; // Return as-is if no stats available
    }

    return features.map((value, i) => {
      return (value - this.featureStats.mean[i]) / this.featureStats.std[i];
    });
  }

  /**
   * Save model to disk
   */
  async saveModel() {
    try {
      await this.model.save(`file://${this.options.modelPath}/classification`);
      await this.anomalyModel.save(`file://${this.options.modelPath}/anomaly`);

      // Save feature stats
      const fs = require('fs').promises;
      await fs.mkdir(this.options.modelPath, { recursive: true });
      await fs.writeFile(
        `${this.options.modelPath}/feature-stats.json`,
        JSON.stringify(this.featureStats)
      );

      console.log('✅ Model saved');
    } catch (error) {
      console.error('Error saving model:', error);
    }
  }

  /**
   * Load model from disk
   */
  async loadModel() {
    this.model = await tf.loadLayersModel(`file://${this.options.modelPath}/classification/model.json`);
    this.anomalyModel = await tf.loadLayersModel(`file://${this.options.modelPath}/anomaly/model.json`);

    // Load feature stats
    const fs = require('fs').promises;
    const statsData = await fs.readFile(`${this.options.modelPath}/feature-stats.json`, 'utf8');
    this.featureStats = JSON.parse(statsData);

    console.log('✅ Model loaded');
  }

  // Feature calculation helpers
  countParameters(url) {
    return (url.match(/[?&]/g) || []).length;
  }

  hasSpecialCharacters(str) {
    return /[<>"'%;()&+]/.test(str);
  }

  calculateSQLInjectionScore(event) {
    const patterns = [
      /(\bor\b|\band\b).*?=.*?/i,
      /union.*?select/i,
      /drop\s+table/i,
      /'.*?--/,
      /;.*?exec/i
    ];

    const url = (event.url || '') + (JSON.stringify(event.details) || '');
    let score = 0;
    patterns.forEach(pattern => {
      if (pattern.test(url)) score += 0.2;
    });
    return Math.min(score, 1);
  }

  calculateXSSScore(event) {
    const patterns = [
      /<script/i,
      /javascript:/i,
      /onerror=/i,
      /onload=/i,
      /<iframe/i
    ];

    const url = (event.url || '') + (JSON.stringify(event.details) || '');
    let score = 0;
    patterns.forEach(pattern => {
      if (pattern.test(url)) score += 0.2;
    });
    return Math.min(score, 1);
  }

  calculatePathTraversalScore(event) {
    const url = event.url || '';
    let score = 0;
    if (url.includes('../')) score += 0.3;
    if (url.includes('..\\')) score += 0.3;
    if (url.includes('%2e%2e')) score += 0.4;
    return Math.min(score, 1);
  }

  calculateIPEntropy(ip) {
    return this.calculateEntropy(ip) / 4; // Normalize
  }

  calculateEntropy(str) {
    const freq = {};
    for (let char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;
    for (let char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  getIPFrequency(ip) {
    // This would query the actual frequency from storage
    // For now, return a placeholder
    return 0.5;
  }

  calculateRequestInterval(ip) {
    // Calculate time since last request from this IP
    // Placeholder implementation
    return 0.5;
  }

  isBotUserAgent(userAgent) {
    const botPatterns = /bot|crawler|spider|scraper/i;
    return botPatterns.test(userAgent);
  }

  calculateGeoRisk(ip) {
    // Would use GeoIP database
    // Placeholder implementation
    return 0.5;
  }

  getIPHistoricalScore(ip) {
    // Query historical threat score for this IP
    // Placeholder implementation
    return 0.5;
  }

  getRecentFailureRate(ip) {
    // Calculate recent failure rate for this IP
    // Placeholder implementation
    return 0.5;
  }

  calculateRequestComplexity(event) {
    const url = event.url || '';
    let complexity = 0;
    complexity += (url.length / 1000);
    complexity += this.countParameters(url) * 0.1;
    complexity += this.hasSpecialCharacters(url) ? 0.3 : 0;
    return Math.min(complexity, 1);
  }

  countEncodingLayers(url) {
    let layers = 0;
    if (/%[0-9a-f]{2}/i.test(url)) layers++;
    if (/%25[0-9a-f]{2}/i.test(url)) layers++;
    return layers / 3; // Normalize
  }

  matchesKnownPattern(event) {
    // Check against known attack patterns
    return this.calculateSQLInjectionScore(event) > 0.3 ||
           this.calculateXSSScore(event) > 0.3 ||
           this.calculatePathTraversalScore(event) > 0.3;
  }

  calculateDeviationFromNormal(event) {
    // Calculate how much this request deviates from normal patterns
    // Placeholder implementation
    return 0.5;
  }

  calculateRiskScore(threatProbability, isAnomaly) {
    let score = threatProbability * 70;
    if (isAnomaly) score += 30;
    return Math.min(Math.round(score), 100);
  }

  calculateConfidence(probability) {
    // Higher confidence when probability is close to 0 or 1
    return Math.abs(probability - 0.5) * 2;
  }

  explainFeatures(features) {
    const labels = [
      'Request Length', 'Parameter Count', 'Special Characters',
      'SQL Injection Pattern', 'XSS Pattern', 'Path Traversal',
      'IP Entropy', 'IP Frequency', 'Hour', 'Day',
      'Request Interval', 'User Agent Entropy', 'Bot Detection',
      'Geo Risk', 'IP Historical Score', 'Recent Failures',
      'Request Complexity', 'Encoding Layers', 'Known Pattern',
      'Deviation from Normal'
    ];

    return features.map((value, i) => ({
      name: labels[i] || `Feature ${i}`,
      value: value.toFixed(3)
    }));
  }

  getRecommendation(threatProbability, isAnomaly) {
    if (threatProbability > 0.9 || isAnomaly) {
      return 'BLOCK';
    } else if (threatProbability > 0.7) {
      return 'CHALLENGE';
    } else if (threatProbability > 0.5) {
      return 'MONITOR';
    } else {
      return 'ALLOW';
    }
  }

  /**
   * Get model metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isTraining: this.isTraining,
      lastTraining: this.lastTraining,
      trainingDataSize: this.trainingData.length,
      modelLoaded: this.model !== null
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.model) {
      this.model.dispose();
    }
    if (this.anomalyModel) {
      this.anomalyModel.dispose();
    }
  }
}

module.exports = ThreatPredictionML;
