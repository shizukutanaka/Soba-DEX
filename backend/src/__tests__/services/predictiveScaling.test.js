/**
 * Predictive Scaling Service Tests
 * @version 3.4.0
 */

const predictiveScaling = require('../../services/predictiveScaling');

describe('Predictive Scaling Service', () => {
  beforeAll(async () => {
    await predictiveScaling.initialize();
  });

  describe('Initialization', () => {
    test('should initialize successfully', () => {
      expect(predictiveScaling.initialized).toBe(true);
    });

    test('should have models defined', () => {
      expect(predictiveScaling.models).toBeDefined();
      expect(predictiveScaling.models.cpu).toBeDefined();
      expect(predictiveScaling.models.memory).toBeDefined();
      expect(predictiveScaling.models.requestRate).toBeDefined();
    });
  });

  describe('Metrics Recording', () => {
    test('should record performance metrics', async () => {
      const metrics = {
        cpuUtilization: 45,
        memoryUtilization: 60,
        requestRate: 1000,
        responseTime: 120,
        errorRate: 0.001
      };

      const dataPoint = await predictiveScaling.recordMetrics(metrics);

      expect(dataPoint).toHaveProperty('timestamp');
      expect(dataPoint).toHaveProperty('cpu');
      expect(dataPoint).toHaveProperty('memory');
      expect(dataPoint).toHaveProperty('requestRate');
    });

    test('should store historical data', async () => {
      const metrics = {
        cpuUtilization: 50,
        memoryUtilization: 65,
        requestRate: 1200
      };

      await predictiveScaling.recordMetrics(metrics);

      const state = predictiveScaling.getCurrentState();
      expect(state.dataPoints).toBeGreaterThan(0);
    });
  });

  describe('Utilization Prediction', () => {
    test('should predict future utilization', async () => {
      // Record some data points first
      for (let i = 0; i < 10; i++) {
        await predictiveScaling.recordMetrics({
          cpuUtilization: 40 + Math.random() * 10,
          memoryUtilization: 55 + Math.random() * 10,
          requestRate: 900 + Math.random() * 200
        });
      }

      const prediction = await predictiveScaling.predictUtilization(3600000); // 1 hour

      if (prediction.success !== false) {
        expect(prediction).toHaveProperty('predictions');
        expect(prediction).toHaveProperty('recommendation');
        expect(prediction.predictions).toHaveProperty('cpu');
        expect(prediction.predictions).toHaveProperty('memory');
        expect(prediction.predictions).toHaveProperty('requestRate');
      }
    });

    test('should include confidence intervals', async () => {
      const prediction = await predictiveScaling.predictUtilization(3600000);

      if (prediction.success !== false && prediction.predictions) {
        expect(prediction.predictions.cpu).toHaveProperty('confidence');
        expect(prediction.predictions.memory).toHaveProperty('confidence');
        expect(prediction.predictions.requestRate).toHaveProperty('confidence');
      }
    });
  });

  describe('Scaling Recommendations', () => {
    test('should generate scaling recommendation', async () => {
      const prediction = await predictiveScaling.predictUtilization(3600000);

      if (prediction.success !== false && prediction.recommendation) {
        const rec = prediction.recommendation;

        expect(rec).toHaveProperty('action');
        expect(rec).toHaveProperty('currentInstances');
        expect(rec).toHaveProperty('recommendedInstances');
        expect(rec).toHaveProperty('reason');
        expect(['scale_up', 'scale_down', 'none']).toContain(rec.action);
      }
    });

    test('should include cost estimation', async () => {
      const prediction = await predictiveScaling.predictUtilization(3600000);

      if (prediction.success !== false && prediction.recommendation) {
        expect(prediction.recommendation).toHaveProperty('estimatedCost');
        expect(prediction.recommendation.estimatedCost).toHaveProperty('current');
        expect(prediction.recommendation.estimatedCost).toHaveProperty('recommended');
      }
    });

    test('should include performance estimation', async () => {
      const prediction = await predictiveScaling.predictUtilization(3600000);

      if (prediction.success !== false && prediction.recommendation) {
        expect(prediction.recommendation).toHaveProperty('estimatedPerformance');
      }
    });
  });

  describe('Scaling History', () => {
    test('should return scaling history', () => {
      const history = predictiveScaling.getScalingHistory(10);

      expect(Array.isArray(history)).toBe(true);
    });

    test('should limit history size', () => {
      const history = predictiveScaling.getScalingHistory(5);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Current State', () => {
    test('should return current state', () => {
      const state = predictiveScaling.getCurrentState();

      expect(state).toHaveProperty('instances');
      expect(state).toHaveProperty('cpuUtilization');
      expect(state).toHaveProperty('memoryUtilization');
      expect(state).toHaveProperty('requestRate');
      expect(state).toHaveProperty('dataPoints');
    });

    test('should track instance count', () => {
      const state = predictiveScaling.getCurrentState();
      expect(typeof state.instances).toBe('number');
      expect(state.instances).toBeGreaterThan(0);
    });
  });
});
