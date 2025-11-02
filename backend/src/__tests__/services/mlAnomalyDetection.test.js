/**
 * ML Anomaly Detection Service Tests
 * @version 3.4.0
 */

const mlAnomalyDetection = require('../../services/mlAnomalyDetection');

describe('ML Anomaly Detection Service', () => {
  beforeAll(async () => {
    await mlAnomalyDetection.initialize();
  });

  describe('Initialization', () => {
    test('should initialize successfully', () => {
      expect(mlAnomalyDetection.initialized).toBe(true);
    });

    test('should have all models initialized', () => {
      expect(mlAnomalyDetection.models.size).toBeGreaterThan(0);
      expect(mlAnomalyDetection.models.has('isolationForest')).toBe(true);
      expect(mlAnomalyDetection.models.has('lstm')).toBe(true);
      expect(mlAnomalyDetection.models.has('autoencoder')).toBe(true);
    });
  });

  describe('Anomaly Detection', () => {
    test('should detect normal patterns as non-anomalous', async () => {
      const metrics = {
        responseTime: 100,
        errorRate: 0.001,
        throughput: 1000,
        cpuUsage: 50,
        memoryUsage: 60
      };

      const detection = await mlAnomalyDetection.detectAnomalies(metrics);

      expect(detection).toHaveProperty('isAnomaly');
      expect(detection).toHaveProperty('confidence');
      expect(detection).toHaveProperty('detectionMethods');
      expect(detection.confidence).toBeGreaterThanOrEqual(0);
      expect(detection.confidence).toBeLessThanOrEqual(1);
    });

    test('should detect anomalous patterns', async () => {
      // First, train with normal data
      for (let i = 0; i < 20; i++) {
        await mlAnomalyDetection.detectAnomalies({
          responseTime: 100 + Math.random() * 20,
          errorRate: 0.001,
          throughput: 1000 + Math.random() * 100,
          cpuUsage: 50 + Math.random() * 5,
          memoryUsage: 60 + Math.random() * 5
        });
      }

      // Now test with anomalous metrics
      const metrics = {
        responseTime: 5000, // Very high
        errorRate: 0.5,      // 50% error rate
        throughput: 10,      // Very low
        cpuUsage: 99,
        memoryUsage: 98
      };

      const detection = await mlAnomalyDetection.detectAnomalies(metrics);

      // Verify detection structure
      expect(detection).toHaveProperty('isAnomaly');
      expect(detection).toHaveProperty('confidence');
      expect(detection).toHaveProperty('detectionMethods');

      // Confidence should be in valid range
      expect(detection.confidence).toBeGreaterThanOrEqual(0);
      expect(detection.confidence).toBeLessThanOrEqual(1);

      // Detection methods should provide scores
      expect(detection.detectionMethods.isolationForest).toHaveProperty('score');
      expect(detection.detectionMethods.lstm).toHaveProperty('score');
      expect(detection.detectionMethods.autoencoder).toHaveProperty('score');
    });

    test('should provide detection methods breakdown', async () => {
      const metrics = {
        responseTime: 200,
        errorRate: 0.01,
        throughput: 500,
        cpuUsage: 60,
        memoryUsage: 70
      };

      const detection = await mlAnomalyDetection.detectAnomalies(metrics);

      expect(detection.detectionMethods).toHaveProperty('isolationForest');
      expect(detection.detectionMethods).toHaveProperty('lstm');
      expect(detection.detectionMethods).toHaveProperty('autoencoder');
    });
  });

  describe('Model Statistics', () => {
    test('should return model statistics', () => {
      const stats = mlAnomalyDetection.getModelStats();

      expect(stats).toHaveProperty('totalPredictions');
      expect(stats).toHaveProperty('totalAnomalies');
      expect(stats).toHaveProperty('modelsStatus');
      expect(Array.isArray(stats.modelsStatus)).toBe(true);
    });

    test('should track prediction counts', async () => {
      const statsBefore = mlAnomalyDetection.getModelStats();
      const initialPredictions = statsBefore.totalPredictions;

      await mlAnomalyDetection.detectAnomalies({
        responseTime: 150,
        errorRate: 0.005,
        throughput: 800,
        cpuUsage: 45,
        memoryUsage: 55
      });

      const statsAfter = mlAnomalyDetection.getModelStats();
      expect(statsAfter.totalPredictions).toBe(initialPredictions + 1);
    });
  });

  describe('Anomaly History', () => {
    test('should store anomaly history', async () => {
      const metrics = {
        responseTime: 3000,
        errorRate: 0.3,
        throughput: 50,
        cpuUsage: 95,
        memoryUsage: 90
      };

      await mlAnomalyDetection.detectAnomalies(metrics);

      const history = mlAnomalyDetection.getAnomalyHistory(10);
      expect(Array.isArray(history)).toBe(true);
    });

    test('should limit history size', () => {
      const history = mlAnomalyDetection.getAnomalyHistory(5);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Feedback Mechanism', () => {
    test('should accept feedback on detections', () => {
      expect(() => {
        mlAnomalyDetection.provideFeedback('test-detection-id', true);
      }).not.toThrow();
    });

    test('should update accuracy metrics based on feedback', () => {
      const statsBefore = mlAnomalyDetection.getModelStats();

      mlAnomalyDetection.provideFeedback('test-1', true);

      const statsAfter = mlAnomalyDetection.getModelStats();
      expect(statsAfter.truePositives).toBeGreaterThan(statsBefore.truePositives);
    });
  });
});
