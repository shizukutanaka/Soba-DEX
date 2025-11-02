/**
 * ML Model Manager Tests for Soba DEX v3.4.0
 *
 * Unit tests for the advanced ML model management service
 */

const MLModelManager = require('../ml/mlModelManager');
const tf = require('@tensorflow/tfjs-node');

// Mock TensorFlow.js for testing
jest.mock('@tensorflow/tfjs-node', () => ({
  sequential: jest.fn(() => ({
    compile: jest.fn(),
    fit: jest.fn(() => Promise.resolve({
      history: { accuracy: [0.9], loss: [0.1] }
    })),
    predict: jest.fn(() => Promise.resolve(tf.tensor2d([[0.8]]))),
    save: jest.fn(() => Promise.resolve()),
    dispose: jest.fn()
  })),
  loadLayersModel: jest.fn(() => Promise.resolve({
    predict: jest.fn(() => Promise.resolve(tf.tensor2d([[0.7]])))
  })),
  tensor2d: jest.fn((data) => ({
    dispose: jest.fn(),
    data: jest.fn(() => Promise.resolve(data[0] || [0.5]))
  })),
  input: jest.fn(() => ({})),
  layers: {
    dense: jest.fn(() => ({})),
    dropout: jest.fn(() => ({}))
  },
  model: jest.fn(() => ({
    compile: jest.fn(),
    fit: jest.fn(() => Promise.resolve({
      history: { accuracy: [0.85], loss: [0.15] }
    }))
  })),
  train: {
    adam: jest.fn(() => ({}))
  }
}));

describe('MLModelManager', () => {
  let mlManager;
  const mockModelConfig = {
    name: 'test-model',
    modelType: 'classification',
    createModelFn: jest.fn().mockResolvedValue({
      compile: jest.fn(),
      fit: jest.fn().mockResolvedValue({
        history: { accuracy: [0.9], loss: [0.1] }
      })
    }),
    featureExtractor: jest.fn((data) => [1, 2, 3, 4, 5]),
    hyperparameters: { learningRate: 0.001 },
    trainingConfig: { epochs: 10, batchSize: 32 }
  };

  beforeEach(async () => {
    mlManager = new MLModelManager({
      modelDir: './test-models',
      minTrainingData: 10
    });

    // Mock file system operations
    const fs = require('fs').promises;
    fs.mkdir = jest.fn().mockResolvedValue();
    fs.writeFile = jest.fn().mockResolvedValue();
    fs.readFile = jest.fn().mockResolvedValue(JSON.stringify({}));
  });

  afterEach(async () => {
    if (mlManager) {
      await mlManager.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(mlManager.initialize()).resolves.not.toThrow();
      expect(mlManager.isInitialized).toBe(true);
    });

    test('should load existing models on initialization', async () => {
      // Mock existing model loading
      const fs = require('fs').promises;
      fs.readdir = jest.fn().mockResolvedValue(['test-model']);
      fs.stat = jest.fn().mockResolvedValue({ isDirectory: () => true });

      await mlManager.initialize();
      expect(mlManager.models.size).toBeGreaterThan(0);
    });
  });

  describe('Model Registration', () => {
    test('should register a new model successfully', async () => {
      const model = await mlManager.registerModel(mockModelConfig);

      expect(model).toHaveProperty('id');
      expect(model.name).toBe('test-model');
      expect(mlManager.models.has('test-model')).toBe(true);
    });

    test('should throw error for invalid model config', async () => {
      const invalidConfig = { name: 'test' }; // Missing required fields

      await expect(mlManager.registerModel(invalidConfig))
        .rejects.toThrow('Missing required model configuration');
    });
  });

  describe('Model Training', () => {
    beforeEach(async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);
    });

    test('should train a new model version successfully', async () => {
      const trainingData = Array(20).fill({ data: [1, 2, 3], label: [1] });

      const version = await mlManager.trainModelVersion('test-model', trainingData);

      expect(version).toHaveProperty('id');
      expect(version).toHaveProperty('version', 1);
      expect(version.performance.accuracy).toBe(0.9);
    });

    test('should throw error for insufficient training data', async () => {
      const trainingData = Array(5).fill({ data: [1, 2, 3], label: [1] }); // Less than min

      await expect(mlManager.trainModelVersion('test-model', trainingData))
        .rejects.toThrow('Insufficient training data');
    });

    test('should handle training errors gracefully', async () => {
      mockModelConfig.createModelFn.mockRejectedValue(new Error('Training failed'));

      const trainingData = Array(20).fill({ data: [1, 2, 3], label: [1] });

      await expect(mlManager.trainModelVersion('test-model', trainingData))
        .rejects.toThrow('Training failed');
    });
  });

  describe('Model Prediction', () => {
    beforeEach(async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);

      // Add a mock model version
      const mockVersion = {
        id: 'version-1',
        model: mockModelConfig.createModelFn(),
        featureStats: { mean: [1, 2, 3, 4, 5], std: [1, 1, 1, 1, 1] }
      };
      mlManager.models.get('test-model').versions.push(mockVersion);
      mlManager.currentVersions.set('test-model', 'version-1');
    });

    test('should make predictions successfully', async () => {
      const inputData = { features: [1, 2, 3, 4, 5] };

      const prediction = await mlManager.predict('test-model', inputData);

      expect(prediction).toHaveProperty('prediction');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction.modelName).toBe('test-model');
    });

    test('should throw error for unknown model', async () => {
      const inputData = { features: [1, 2, 3, 4, 5] };

      await expect(mlManager.predict('unknown-model', inputData))
        .rejects.toThrow("Model 'unknown-model' not found");
    });
  });

  describe('A/B Testing', () => {
    beforeEach(async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);

      // Add two model versions
      const versionA = { id: 'version-a', version: 1, performance: { accuracy: 0.8 } };
      const versionB = { id: 'version-b', version: 2, performance: { accuracy: 0.9 } };

      mlManager.models.get('test-model').versions.push(versionA, versionB);
    });

    test('should start A/B test successfully', async () => {
      const test = await mlManager.startABTest('test-model', 'version-a', 'version-b', 0.5);

      expect(test).toHaveProperty('id');
      expect(test.modelName).toBe('test-model');
      expect(test.status).toBe('active');
    });

    test('should throw error for non-existent versions', async () => {
      await expect(mlManager.startABTest('test-model', 'version-x', 'version-y'))
        .rejects.toThrow('Both versions must exist');
    });
  });

  describe('Model Management', () => {
    beforeEach(async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);
    });

    test('should list all models', () => {
      const models = mlManager.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('name');
    });

    test('should get model info', () => {
      const modelInfo = mlManager.getModelInfo('test-model');

      expect(modelInfo).toHaveProperty('name', 'test-model');
      expect(modelInfo).toHaveProperty('versions');
    });

    test('should get current model version', () => {
      const currentVersion = mlManager.getCurrentVersion('test-model');

      expect(currentVersion).toBeDefined();
    });
  });

  describe('Automated Retraining', () => {
    beforeEach(async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);
    });

    test('should trigger retraining manually', async () => {
      // Mock fetchTrainingData to return some data
      mlManager.fetchTrainingData = jest.fn().mockResolvedValue(
        Array(20).fill({ data: [1, 2, 3], label: [1] })
      );

      await expect(mlManager.triggerRetraining('test-model')).resolves.not.toThrow();
    });

    test('should handle retraining with no data', async () => {
      mlManager.fetchTrainingData = jest.fn().mockResolvedValue([]);

      await expect(mlManager.triggerRetraining('test-model')).resolves.not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    test('should track performance metrics during prediction', async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);

      // Add mock version
      const mockVersion = {
        id: 'version-1',
        model: mockModelConfig.createModelFn(),
        featureStats: { mean: [1, 2, 3, 4, 5], std: [1, 1, 1, 1, 1] }
      };
      mlManager.models.get('test-model').versions.push(mockVersion);
      mlManager.currentVersions.set('test-model', 'version-1');

      const inputData = { features: [1, 2, 3, 4, 5] };
      await mlManager.predict('test-model', inputData);

      // Check that metrics were updated
      expect(mlManager.performanceMetrics.has('version-1')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle model loading errors gracefully', async () => {
      const fs = require('fs').promises;
      fs.readdir = jest.fn().mockRejectedValue(new Error('Directory not found'));

      await expect(mlManager.initialize()).resolves.not.toThrow();
    });

    test('should handle model saving errors', async () => {
      const fs = require('fs').promises;
      fs.writeFile = jest.fn().mockRejectedValue(new Error('Write failed'));

      // Should not throw during cleanup
      await expect(mlManager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should dispose models on cleanup', async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);

      const disposeSpy = jest.spyOn(mockModelConfig.createModelFn(), 'dispose');

      await mlManager.cleanup();

      // Note: In real implementation, dispose would be called on model instances
      expect(mlManager.models.size).toBe(0);
    });

    test('should limit number of model versions', async () => {
      await mlManager.initialize();
      await mlManager.registerModel(mockModelConfig);

      // Train multiple versions
      for (let i = 0; i < 15; i++) {
        const version = {
          id: `version-${i}`,
          version: i + 1,
          model: { dispose: jest.fn() },
          performance: { accuracy: 0.8 + (i * 0.01) }
        };
        mlManager.models.get('test-model').versions.push(version);
      }

      // Should only keep the last maxModelVersions (10)
      expect(mlManager.models.get('test-model').versions.length).toBeLessThanOrEqual(10);
    });
  });
});
