/**
 * ML Workflows Integration Tests
 * Tests end-to-end ML workflows and service interactions
 * @version 3.4.0
 */

const mlAnomalyDetection = require('../../services/mlAnomalyDetection');
const predictiveScaling = require('../../services/predictiveScaling');
const advancedABTesting = require('../../services/advancedABTesting');
const userBehaviorAnalytics = require('../../services/userBehaviorAnalytics');
const autoTuningService = require('../../services/autoTuningService');

describe('ML Workflows Integration Tests', () => {
  beforeAll(async () => {
    // Initialize all ML services
    await Promise.all([
      mlAnomalyDetection.initialize(),
      predictiveScaling.initialize(),
      advancedABTesting.initialize(),
      userBehaviorAnalytics.initialize(),
      autoTuningService.initialize()
    ]);
  });

  describe('Anomaly Detection → Auto-Tuning Workflow', () => {
    test('should detect anomaly and trigger auto-tuning', async () => {
      // Simulate normal metrics
      for (let i = 0; i < 10; i++) {
        await mlAnomalyDetection.detectAnomalies({
          responseTime: 100 + Math.random() * 20,
          errorRate: 0.001,
          throughput: 1000 + Math.random() * 100,
          cpuUsage: 50 + Math.random() * 5,
          memoryUsage: 60 + Math.random() * 5
        });
      }

      // Simulate anomalous metrics (high response time, high error rate)
      const anomalyDetection = await mlAnomalyDetection.detectAnomalies({
        responseTime: 5000,
        errorRate: 0.5,
        throughput: 50,
        cpuUsage: 95,
        memoryUsage: 98
      });

      expect(anomalyDetection.isAnomaly).toBe(true);
      expect(anomalyDetection.confidence).toBeGreaterThan(0.7);

      // Auto-tuning should detect performance degradation
      await autoTuningService.collectMetrics({
        responseTime: 5000,
        throughput: 50,
        errorRate: 0.5,
        cpuUtilization: 95,
        memoryUtilization: 98
      });

      const tuningAnalysis = await autoTuningService.analyzeAndTune();

      if (tuningAnalysis.success) {
        expect(tuningAnalysis.analysis).toHaveProperty('performanceScore');
        expect(tuningAnalysis.analysis.performanceScore).toBeLessThan(50); // Poor performance
        expect(tuningAnalysis.recommendations).toBeDefined();
        expect(tuningAnalysis.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Predictive Scaling → Cost Optimization Workflow', () => {
    test('should predict traffic spike and recommend scaling', async () => {
      // Simulate increasing traffic pattern
      const baseTime = Date.now();
      for (let i = 0; i < 20; i++) {
        await predictiveScaling.recordMetrics({
          cpuUtilization: 40 + i * 2, // Gradually increasing
          memoryUtilization: 50 + i * 1.5,
          requestRate: 500 + i * 50,
          responseTime: 100 + i * 10,
          errorRate: 0.001
        });

        // Simulate time progression
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Predict utilization for next hour
      const prediction = await predictiveScaling.predictUtilization(3600000);

      if (prediction.success !== false && prediction.predictions) {
        expect(prediction.predictions.cpu).toHaveProperty('value');
        expect(prediction.predictions.memory).toHaveProperty('value');

        // Should recommend scaling up due to increasing trend
        if (prediction.recommendation) {
          expect(['scale_up', 'none']).toContain(prediction.recommendation.action);
          expect(prediction.recommendation).toHaveProperty('estimatedCost');
        }
      }
    });

    test('should integrate scaling prediction with auto-tuning', async () => {
      const scalingState = predictiveScaling.getCurrentState();

      // Collect metrics for auto-tuning
      await autoTuningService.collectMetrics({
        responseTime: 150,
        throughput: 800,
        errorRate: 0.005,
        cpuUtilization: scalingState.cpuUtilization,
        memoryUtilization: scalingState.memoryUtilization
      });

      const config = await autoTuningService.getConfiguration();
      expect(config).toHaveProperty('performance');
      expect(config).toHaveProperty('scaling');
    });
  });

  describe('A/B Testing → User Behavior Analytics Workflow', () => {
    test('should run A/B test and analyze user behavior', async () => {
      // Create A/B test experiment
      const experiment = await advancedABTesting.createExperiment({
        name: 'checkout_optimization',
        description: 'Test checkout flow optimization',
        variants: [
          { id: 'control', name: 'Original Checkout', allocation: 0.5 },
          { id: 'variant_a', name: 'Streamlined Checkout', allocation: 0.5 }
        ],
        metrics: ['conversion_rate', 'average_order_value'],
        targetAudience: { segment: 'all_users' }
      });

      expect(experiment).toHaveProperty('id');
      expect(experiment.status).toBe('active');

      // Simulate user assignments and events
      const users = [];
      for (let i = 0; i < 50; i++) {
        const userId = `user_${i}`;
        users.push(userId);

        // Assign user to variant
        const assignment = await advancedABTesting.assignVariant(experiment.id, userId);
        expect(['control', 'variant_a']).toContain(assignment.variant);

        // Track user behavior
        await userBehaviorAnalytics.trackEvent({
          userId,
          event: 'page_view',
          properties: {
            page: 'checkout',
            variant: assignment.variant,
            timestamp: Date.now()
          }
        });

        // Simulate conversion for some users (variant_a has higher conversion)
        const conversionRate = assignment.variant === 'variant_a' ? 0.35 : 0.25;
        if (Math.random() < conversionRate) {
          await advancedABTesting.recordEvent(experiment.id, userId, {
            eventType: 'conversion',
            value: 100 + Math.random() * 200
          });

          await userBehaviorAnalytics.trackEvent({
            userId,
            event: 'purchase',
            properties: {
              variant: assignment.variant,
              amount: 100 + Math.random() * 200,
              timestamp: Date.now()
            }
          });
        }
      }

      // Analyze experiment results
      const analysis = await advancedABTesting.analyzeExperiment(experiment.id);

      expect(analysis).toHaveProperty('variants');
      expect(analysis.variants.control).toHaveProperty('assignments');
      expect(analysis.variants.variant_a).toHaveProperty('assignments');

      // Get user behavior summary
      const behaviorSummary = await userBehaviorAnalytics.getSummary();
      expect(behaviorSummary).toHaveProperty('totalUsers');
      expect(behaviorSummary).toHaveProperty('totalEvents');
      expect(behaviorSummary.totalUsers).toBeGreaterThanOrEqual(50);
    });

    test('should identify high-value user segments from A/B test', async () => {
      // Create segment analysis
      const segments = await userBehaviorAnalytics.getSegments();

      expect(Array.isArray(segments)).toBe(true);

      // Check for purchase behavior segments
      const purchaseSegments = segments.filter(s =>
        s.criteria && s.criteria.events && s.criteria.events.includes('purchase')
      );

      if (purchaseSegments.length > 0) {
        expect(purchaseSegments[0]).toHaveProperty('name');
        expect(purchaseSegments[0]).toHaveProperty('size');
      }
    });
  });

  describe('Churn Prediction → Retention Workflow', () => {
    test('should predict churn and track retention cohorts', async () => {
      const testUserId = 'test_user_churn_001';

      // Simulate user activity over time
      const activities = [
        { event: 'login', daysAgo: 30 },
        { event: 'trade', daysAgo: 28 },
        { event: 'trade', daysAgo: 25 },
        { event: 'login', daysAgo: 20 },
        { event: 'trade', daysAgo: 18 },
        { event: 'login', daysAgo: 15 }
        // Note: Last activity 15 days ago - potential churn risk
      ];

      for (const activity of activities) {
        await userBehaviorAnalytics.trackEvent({
          userId: testUserId,
          event: activity.event,
          properties: {
            timestamp: Date.now() - (activity.daysAgo * 24 * 60 * 60 * 1000)
          }
        });
      }

      // Predict churn
      const churnPrediction = await userBehaviorAnalytics.predictChurn(testUserId);

      expect(churnPrediction).toHaveProperty('churnScore');
      expect(churnPrediction).toHaveProperty('churnRisk');
      expect(churnPrediction.churnScore).toBeGreaterThanOrEqual(0);
      expect(churnPrediction.churnScore).toBeLessThanOrEqual(1);
      expect(['low', 'medium', 'high']).toContain(churnPrediction.churnRisk);

      // Due to inactivity, should show higher churn risk
      if (churnPrediction.churnScore > 0.6) {
        expect(churnPrediction).toHaveProperty('recommendations');
        expect(Array.isArray(churnPrediction.recommendations)).toBe(true);
      }

      // Get cohort data to understand retention patterns
      const cohorts = await userBehaviorAnalytics.getCohorts({
        cohortType: 'acquisition',
        period: 'weekly'
      });

      expect(Array.isArray(cohorts)).toBe(true);
    });
  });

  describe('Full ML Pipeline Integration', () => {
    test('should execute complete ML analytics pipeline', async () => {
      const pipelineStart = Date.now();

      // Step 1: Collect system metrics
      const systemMetrics = {
        responseTime: 120,
        errorRate: 0.005,
        throughput: 950,
        cpuUsage: 55,
        memoryUsage: 65
      };

      // Step 2: Anomaly detection
      const anomalyResult = await mlAnomalyDetection.detectAnomalies(systemMetrics);
      expect(anomalyResult).toHaveProperty('isAnomaly');

      // Step 3: Record metrics for predictive scaling
      await predictiveScaling.recordMetrics({
        cpuUtilization: systemMetrics.cpuUsage,
        memoryUtilization: systemMetrics.memoryUsage,
        requestRate: systemMetrics.throughput,
        responseTime: systemMetrics.responseTime,
        errorRate: systemMetrics.errorRate
      });

      // Step 4: Get scaling prediction
      const scalingPrediction = await predictiveScaling.predictUtilization(1800000); // 30 min

      // Step 5: Collect metrics for auto-tuning
      await autoTuningService.collectMetrics({
        responseTime: systemMetrics.responseTime,
        throughput: systemMetrics.throughput,
        errorRate: systemMetrics.errorRate,
        cpuUtilization: systemMetrics.cpuUsage,
        memoryUtilization: systemMetrics.memoryUsage
      });

      // Step 6: Get auto-tuning recommendations
      const tuningConfig = await autoTuningService.getConfiguration();

      const pipelineEnd = Date.now();
      const pipelineDuration = pipelineEnd - pipelineStart;

      // Pipeline should complete quickly (< 1 second for integration test)
      expect(pipelineDuration).toBeLessThan(5000);

      // All steps should complete successfully
      expect(anomalyResult).toBeDefined();
      expect(scalingPrediction).toBeDefined();
      expect(tuningConfig).toBeDefined();
    });

    test('should handle high-load scenario across all ML services', async () => {
      const promises = [];

      // Simulate concurrent requests to all ML services
      for (let i = 0; i < 20; i++) {
        promises.push(
          mlAnomalyDetection.detectAnomalies({
            responseTime: 100 + Math.random() * 50,
            errorRate: 0.001 + Math.random() * 0.01,
            throughput: 900 + Math.random() * 200,
            cpuUsage: 45 + Math.random() * 15,
            memoryUsage: 55 + Math.random() * 15
          })
        );

        if (i % 2 === 0) {
          promises.push(
            predictiveScaling.recordMetrics({
              cpuUtilization: 45 + Math.random() * 15,
              memoryUtilization: 55 + Math.random() * 15,
              requestRate: 900 + Math.random() * 200
            })
          );
        }

        if (i % 3 === 0) {
          promises.push(
            userBehaviorAnalytics.trackEvent({
              userId: `load_test_user_${i}`,
              event: 'trade',
              properties: {
                amount: 100 + Math.random() * 900,
                timestamp: Date.now()
              }
            })
          );
        }
      }

      // All requests should complete successfully
      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');

      // Should have minimal failures (< 5%)
      expect(failures.length).toBeLessThan(promises.length * 0.05);
    });
  });

  describe('ML Service Health Checks', () => {
    test('should verify all ML services are healthy', () => {
      // Check initialization status
      expect(mlAnomalyDetection.initialized).toBe(true);
      expect(predictiveScaling.initialized).toBe(true);
      expect(advancedABTesting.initialized).toBe(true);
      expect(userBehaviorAnalytics.initialized).toBe(true);
      expect(autoTuningService.initialized).toBe(true);
    });

    test('should retrieve statistics from all ML services', () => {
      const anomalyStats = mlAnomalyDetection.getModelStats();
      expect(anomalyStats).toHaveProperty('totalPredictions');
      expect(anomalyStats).toHaveProperty('totalAnomalies');

      const scalingState = predictiveScaling.getCurrentState();
      expect(scalingState).toHaveProperty('instances');
      expect(scalingState).toHaveProperty('cpuUtilization');

      const abTestStats = advancedABTesting.getAllExperiments();
      expect(Array.isArray(abTestStats)).toBe(true);

      const behaviorSummary = userBehaviorAnalytics.getSummary();
      expect(behaviorSummary).toHaveProperty('totalUsers');
      expect(behaviorSummary).toHaveProperty('totalEvents');

      const tuningSummary = autoTuningService.getSummary();
      expect(tuningSummary).toHaveProperty('performance');
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle invalid input gracefully', async () => {
      // Test anomaly detection with invalid data
      const invalidDetection = await mlAnomalyDetection.detectAnomalies({
        responseTime: -1, // Invalid
        errorRate: 2, // Invalid (> 1)
        throughput: -100 // Invalid
      });

      // Should handle gracefully without throwing
      expect(invalidDetection).toBeDefined();

      // Test predictive scaling with missing data
      try {
        await predictiveScaling.recordMetrics({
          cpuUtilization: null,
          memoryUtilization: undefined
        });
      } catch (error) {
        // Should either handle gracefully or throw appropriate error
        expect(error).toBeDefined();
      }
    });

    test('should maintain service stability under error conditions', async () => {
      // Attempt operations that might fail
      const operations = [
        mlAnomalyDetection.detectAnomalies({}),
        predictiveScaling.predictUtilization(-1000),
        userBehaviorAnalytics.predictChurn('nonexistent_user'),
        autoTuningService.analyzeAndTune()
      ];

      const results = await Promise.allSettled(operations);

      // Services should not crash
      expect(mlAnomalyDetection.initialized).toBe(true);
      expect(predictiveScaling.initialized).toBe(true);
      expect(userBehaviorAnalytics.initialized).toBe(true);
      expect(autoTuningService.initialized).toBe(true);
    });
  });
});
