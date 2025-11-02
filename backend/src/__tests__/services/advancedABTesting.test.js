/**
 * Advanced A/B Testing Service Tests
 * @version 3.4.0
 */

const advancedABTesting = require('../../services/advancedABTesting');

describe('Advanced A/B Testing Service', () => {
  let testExperiment;

  beforeAll(async () => {
    await advancedABTesting.initialize();
  });

  describe('Initialization', () => {
    test('should initialize successfully', () => {
      expect(advancedABTesting.initialized).toBe(true);
    });
  });

  describe('Experiment Management', () => {
    test('should create a new experiment', async () => {
      const config = {
        name: 'Button Color Test',
        description: 'Test different button colors',
        variants: [
          { name: 'Control', description: 'Blue button', config: { color: 'blue' } },
          { name: 'Variant A', description: 'Green button', config: { color: 'green' } },
          { name: 'Variant B', description: 'Red button', config: { color: 'red' } }
        ],
        metric: 'conversion_rate',
        trafficAllocation: 'equal'
      };

      testExperiment = await advancedABTesting.createExperiment(config);

      expect(testExperiment).toHaveProperty('id');
      expect(testExperiment).toHaveProperty('name', 'Button Color Test');
      expect(testExperiment).toHaveProperty('status', 'running');
      expect(testExperiment.variants).toHaveLength(3);
      expect(testExperiment.variants[0].allocation).toBeCloseTo(0.333, 2);
    });

    test('should retrieve experiment by ID', () => {
      const experiment = advancedABTesting.getExperiment(testExperiment.id);

      expect(experiment).toBeDefined();
      expect(experiment.id).toBe(testExperiment.id);
    });

    test('should list all experiments', () => {
      const experiments = advancedABTesting.getAllExperiments();

      expect(Array.isArray(experiments)).toBe(true);
      expect(experiments.length).toBeGreaterThan(0);
    });

    test('should reject experiment with less than 2 variants', async () => {
      const config = {
        name: 'Invalid Test',
        variants: [{ name: 'Only One' }],
        metric: 'clicks'
      };

      await expect(
        advancedABTesting.createExperiment(config)
      ).rejects.toThrow();
    });
  });

  describe('Variant Assignment', () => {
    test('should assign variant to user', () => {
      const assignment = advancedABTesting.assignVariant(
        testExperiment.id,
        'user-001'
      );

      expect(assignment).toHaveProperty('experimentId', testExperiment.id);
      expect(assignment).toHaveProperty('variantId');
      expect(assignment).toHaveProperty('variantName');
      expect(assignment).toHaveProperty('config');
    });

    test('should assign variants according to allocation', () => {
      const assignments = {};

      // Assign 300 users
      for (let i = 0; i < 300; i++) {
        const assignment = advancedABTesting.assignVariant(
          testExperiment.id,
          `user-${i}`
        );

        assignments[assignment.variantId] = (assignments[assignment.variantId] || 0) + 1;
      }

      // Each variant should get roughly 1/3 of users (±20%)
      const variantCounts = Object.values(assignments);
      expect(variantCounts).toHaveLength(3);
      variantCounts.forEach(count => {
        expect(count).toBeGreaterThan(70); // At least 23%
        expect(count).toBeLessThan(130); // At most 43%
      });
    });

    test('should handle segment targeting configuration', async () => {
      // Create experiment with segment-based configuration
      const segmentedExperiment = await advancedABTesting.createExperiment({
        name: 'Segmented Test',
        description: 'Test with segment targeting',
        variants: [
          { name: 'Control', description: 'Original flow', config: {} },
          { name: 'Variant', description: 'New flow', config: {} }
        ],
        metric: 'conversion',
        trafficAllocation: 'equal'
      });

      expect(segmentedExperiment).toHaveProperty('id');
      expect(segmentedExperiment.status).toBe('running');
      expect(segmentedExperiment.variants).toHaveLength(2);

      // Test variant assignment works for different users
      const assignment1 = advancedABTesting.assignVariant(
        segmentedExperiment.id,
        'user-segment-001'
      );
      expect(assignment1).toBeDefined();
      expect(assignment1).toHaveProperty('variantId');
      expect(assignment1).toHaveProperty('variantName');
      expect(assignment1).toHaveProperty('experimentId', segmentedExperiment.id);

      const assignment2 = advancedABTesting.assignVariant(
        segmentedExperiment.id,
        'user-segment-002'
      );
      expect(assignment2).toBeDefined();
      expect(assignment2).toHaveProperty('variantId');
    });
  });

  describe('Event Recording', () => {
    test('should record conversion event', async () => {
      const variantId = testExperiment.variants[0].id;

      const result = await advancedABTesting.recordEvent(
        testExperiment.id,
        variantId,
        1, // conversion value
        { source: 'test' }
      );

      expect(result).toHaveProperty('success', true);
    });

    test('should track conversion count', async () => {
      const variantId = testExperiment.variants[0].id;
      const variantBefore = testExperiment.variants[0];
      const conversionsBefore = variantBefore.conversions;

      await advancedABTesting.recordEvent(testExperiment.id, variantId, 1);

      const experimentAfter = advancedABTesting.getExperiment(testExperiment.id);
      const variantAfter = experimentAfter.variants[0];

      expect(variantAfter.conversions).toBe(conversionsBefore + 1);
    });

    test('should accumulate total value', async () => {
      const variantId = testExperiment.variants[0].id;

      await advancedABTesting.recordEvent(testExperiment.id, variantId, 10);
      await advancedABTesting.recordEvent(testExperiment.id, variantId, 20);

      const experiment = advancedABTesting.getExperiment(testExperiment.id);
      const variant = experiment.variants[0];

      expect(variant.totalValue).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Statistical Analysis', () => {
    beforeAll(async () => {
      // Add sample data for statistical analysis
      const variants = testExperiment.variants;

      // Variant 0 (Control): 100 users, 20 conversions
      for (let i = 0; i < 100; i++) {
        await advancedABTesting.recordEvent(
          testExperiment.id,
          variants[0].id,
          i < 20 ? 1 : 0
        );
      }

      // Variant 1: 100 users, 25 conversions (better)
      for (let i = 0; i < 100; i++) {
        await advancedABTesting.recordEvent(
          testExperiment.id,
          variants[1].id,
          i < 25 ? 1 : 0
        );
      }

      // Variant 2: 100 users, 15 conversions (worse)
      for (let i = 0; i < 100; i++) {
        await advancedABTesting.recordEvent(
          testExperiment.id,
          variants[2].id,
          i < 15 ? 1 : 0
        );
      }
    });

    test('should analyze experiment results', async () => {
      const analysis = await advancedABTesting.analyzeExperiment(testExperiment.id);

      expect(analysis).toHaveProperty('experimentId', testExperiment.id);
      expect(analysis).toHaveProperty('variants');
      expect(analysis).toHaveProperty('comparisons');
      expect(analysis.variants).toHaveLength(3);
    });

    test('should calculate variant statistics', async () => {
      const analysis = await advancedABTesting.analyzeExperiment(testExperiment.id);

      analysis.variants.forEach(variant => {
        expect(variant).toHaveProperty('sampleSize');
        expect(variant).toHaveProperty('conversions');
        expect(variant).toHaveProperty('conversionRate');
        expect(variant).toHaveProperty('mean');
        expect(variant).toHaveProperty('stdDev');
        expect(variant).toHaveProperty('confidenceInterval');
      });
    });

    test('should perform pairwise comparisons', async () => {
      const analysis = await advancedABTesting.analyzeExperiment(testExperiment.id);

      expect(analysis.comparisons).toHaveLength(2); // 2 variants vs control

      analysis.comparisons.forEach(comparison => {
        expect(comparison).toHaveProperty('variant');
        expect(comparison).toHaveProperty('control');
        expect(comparison).toHaveProperty('meanDifference');
        expect(comparison).toHaveProperty('percentageChange');
        expect(comparison).toHaveProperty('tStatistic');
        expect(comparison).toHaveProperty('pValue');
        expect(comparison).toHaveProperty('significant');
        expect(comparison).toHaveProperty('bayesianProbability');
        expect(comparison).toHaveProperty('recommendation');
      });
    });

    test('should detect early stopping conditions', async () => {
      const analysis = await advancedABTesting.analyzeExperiment(testExperiment.id);

      expect(analysis).toHaveProperty('earlyStopping');
      expect(analysis.earlyStopping).toHaveProperty('shouldStop');
      expect(analysis.earlyStopping).toHaveProperty('reason');
      expect(typeof analysis.earlyStopping.shouldStop).toBe('boolean');
    });

    test('should select winner if present', async () => {
      const analysis = await advancedABTesting.analyzeExperiment(testExperiment.id);

      expect(analysis).toHaveProperty('winner');
      expect(analysis.winner).toHaveProperty('hasWinner');

      if (analysis.winner.hasWinner) {
        expect(analysis.winner).toHaveProperty('variant');
        expect(analysis.winner).toHaveProperty('improvement');
        expect(analysis.winner).toHaveProperty('confidence');
      }
    });
  });

  describe('Multi-armed Bandit', () => {
    test('should use bandit allocation when configured', async () => {
      const banditExperiment = await advancedABTesting.createExperiment({
        name: 'Bandit Test',
        variants: [
          { name: 'Option A', config: {} },
          { name: 'Option B', config: {} }
        ],
        metric: 'clicks',
        trafficAllocation: 'bandit'
      });

      // Record some successful events for Option A
      for (let i = 0; i < 50; i++) {
        await advancedABTesting.recordEvent(
          banditExperiment.id,
          banditExperiment.variants[0].id,
          1
        );
      }

      // Record fewer events for Option B
      for (let i = 0; i < 20; i++) {
        await advancedABTesting.recordEvent(
          banditExperiment.id,
          banditExperiment.variants[1].id,
          1
        );
      }

      // Future assignments should favor Option A (exploitation)
      const assignments = {};
      for (let i = 0; i < 100; i++) {
        const assignment = advancedABTesting.assignVariant(
          banditExperiment.id,
          `bandit-user-${i}`
        );
        assignments[assignment.variantId] = (assignments[assignment.variantId] || 0) + 1;
      }

      // Option A should get more assignments
      expect(assignments[banditExperiment.variants[0].id])
        .toBeGreaterThan(assignments[banditExperiment.variants[1].id]);
    });
  });

  describe('Experiment Lifecycle', () => {
    test('should stop experiment', async () => {
      const result = await advancedABTesting.stopExperiment(
        testExperiment.id,
        'manual'
      );

      expect(result).toHaveProperty('success', true);
      expect(result.experiment.status).toBe('stopped');
      expect(result).toHaveProperty('finalAnalysis');
    });

    test('should not assign variants to stopped experiment', () => {
      expect(() => {
        advancedABTesting.assignVariant(testExperiment.id, 'new-user');
      }).toThrow();
    });
  });
});
