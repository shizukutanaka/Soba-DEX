/**
 * User Behavior Analytics Service Tests
 * @version 3.4.0
 */

const userBehaviorAnalytics = require('../../services/userBehaviorAnalytics');

describe('User Behavior Analytics Service', () => {
  beforeAll(async () => {
    await userBehaviorAnalytics.initialize();
  });

  describe('Initialization', () => {
    test('should initialize successfully', () => {
      expect(userBehaviorAnalytics.initialized).toBe(true);
    });
  });

  describe('Event Tracking', () => {
    test('should track user event', async () => {
      const event = await userBehaviorAnalytics.trackEvent(
        'user-001',
        'page_view',
        { page: '/dashboard' },
        { userAgent: 'Test Browser' }
      );

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('userId', 'user-001');
      expect(event).toHaveProperty('eventName', 'page_view');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('sessionId');
    });

    test('should assign session ID', async () => {
      const event1 = await userBehaviorAnalytics.trackEvent('user-002', 'login');
      const event2 = await userBehaviorAnalytics.trackEvent('user-002', 'page_view');

      // Same session for same user
      expect(event1.sessionId).toBe(event2.sessionId);
    });

    test('should create new session after timeout', async () => {
      const event1 = await userBehaviorAnalytics.trackEvent('user-003', 'login');

      // Simulate session timeout by manipulating session
      const sessions = userBehaviorAnalytics.sessions;
      const session = sessions.get(event1.sessionId);
      session.lastActivity = new Date(Date.now() - 2000000); // 33 minutes ago

      const event2 = await userBehaviorAnalytics.trackEvent('user-003', 'page_view');

      // Should create new session
      expect(event1.sessionId).not.toBe(event2.sessionId);
    });
  });

  describe('Journey Analysis', () => {
    beforeAll(async () => {
      // Create sample journey for user-004
      await userBehaviorAnalytics.trackEvent('user-004', 'landing', { page: '/' });
      await userBehaviorAnalytics.trackEvent('user-004', 'page_view', { page: '/products' });
      await userBehaviorAnalytics.trackEvent('user-004', 'add_to_cart', { product: 'item-1' });
      await userBehaviorAnalytics.trackEvent('user-004', 'checkout');
      await userBehaviorAnalytics.trackEvent('user-004', 'purchase', { amount: 100 });
    });

    test('should analyze user journey', async () => {
      const journey = await userBehaviorAnalytics.analyzeJourney('user-004');

      expect(journey).toHaveProperty('userId', 'user-004');
      expect(journey).toHaveProperty('totalSessions');
      expect(journey).toHaveProperty('totalEvents');
      expect(journey).toHaveProperty('journey');
      expect(journey).toHaveProperty('insights');
      expect(Array.isArray(journey.journey)).toBe(true);
    });

    test('should include session details', async () => {
      const journey = await userBehaviorAnalytics.analyzeJourney('user-004');

      expect(journey.journey.length).toBeGreaterThan(0);

      const session = journey.journey[0];
      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('startTime');
      expect(session).toHaveProperty('endTime');
      expect(session).toHaveProperty('duration');
      expect(session).toHaveProperty('events');
      expect(session).toHaveProperty('path');
      expect(session).toHaveProperty('outcome');
    });

    test('should determine session outcome', async () => {
      const journey = await userBehaviorAnalytics.analyzeJourney('user-004');

      const session = journey.journey[0];
      expect(['converted', 'engaged', 'bounced', 'explored']).toContain(session.outcome);
    });

    test('should generate journey insights', async () => {
      const journey = await userBehaviorAnalytics.analyzeJourney('user-004');

      expect(journey.insights).toHaveProperty('averageSessionDuration');
      expect(journey.insights).toHaveProperty('mostCommonEvent');
      expect(journey.insights).toHaveProperty('conversionRate');
      expect(journey.insights).toHaveProperty('bounceRate');
    });
  });

  describe('Cohort Analysis', () => {
    beforeAll(async () => {
      // Create users in different cohorts
      const users = ['cohort-user-1', 'cohort-user-2', 'cohort-user-3'];

      for (const userId of users) {
        await userBehaviorAnalytics.trackEvent(userId, 'signup');
      }
    });

    test('should analyze cohorts', async () => {
      const analysis = await userBehaviorAnalytics.analyzeCohorts();

      expect(analysis).toHaveProperty('cohorts');
      expect(analysis).toHaveProperty('totalCohorts');
      expect(analysis).toHaveProperty('totalUsers');
      expect(analysis).toHaveProperty('analysis');
      expect(Array.isArray(analysis.cohorts)).toBe(true);
    });

    test('should group users by cohort', async () => {
      const analysis = await userBehaviorAnalytics.analyzeCohorts({
        cohortBy: 'signup_week'
      });

      expect(analysis.cohorts.length).toBeGreaterThan(0);

      const cohort = analysis.cohorts[0];
      expect(cohort).toHaveProperty('cohortKey');
      expect(cohort).toHaveProperty('cohortDate');
      expect(cohort).toHaveProperty('size');
      expect(cohort).toHaveProperty('retention');
    });

    test('should calculate retention rates', async () => {
      const analysis = await userBehaviorAnalytics.analyzeCohorts();

      if (analysis.cohorts.length > 0) {
        const cohort = analysis.cohorts[0];
        const retentionKeys = Object.keys(cohort.retention);

        expect(retentionKeys.length).toBeGreaterThan(0);

        retentionKeys.forEach(key => {
          expect(cohort.retention[key]).toHaveProperty('count');
          expect(cohort.retention[key]).toHaveProperty('rate');
        });
      }
    });
  });

  describe('Funnel Analysis', () => {
    let testFunnel;

    beforeAll(async () => {
      // Create test funnel
      testFunnel = userBehaviorAnalytics.createFunnel(
        'Purchase Funnel',
        ['landing', 'product_view', 'add_to_cart', 'checkout', 'purchase']
      );

      // Create users going through funnel
      const users = ['funnel-user-1', 'funnel-user-2', 'funnel-user-3'];

      // User 1: Complete funnel
      for (const step of testFunnel.steps) {
        await userBehaviorAnalytics.trackEvent(users[0], step);
      }

      // User 2: Drop off at add_to_cart
      await userBehaviorAnalytics.trackEvent(users[1], 'landing');
      await userBehaviorAnalytics.trackEvent(users[1], 'product_view');

      // User 3: Drop off at checkout
      await userBehaviorAnalytics.trackEvent(users[2], 'landing');
      await userBehaviorAnalytics.trackEvent(users[2], 'product_view');
      await userBehaviorAnalytics.trackEvent(users[2], 'add_to_cart');
      await userBehaviorAnalytics.trackEvent(users[2], 'checkout');
    });

    test('should create funnel definition', () => {
      expect(testFunnel).toHaveProperty('id');
      expect(testFunnel).toHaveProperty('name', 'Purchase Funnel');
      expect(testFunnel).toHaveProperty('steps');
      expect(testFunnel.steps).toHaveLength(5);
    });

    test('should analyze funnel', async () => {
      const analysis = await userBehaviorAnalytics.analyzeFunnel(testFunnel.id);

      expect(analysis).toHaveProperty('funnelId', testFunnel.id);
      expect(analysis).toHaveProperty('steps');
      expect(analysis).toHaveProperty('totalEntrants');
      expect(analysis).toHaveProperty('totalConversions');
      expect(analysis).toHaveProperty('conversionRate');
      expect(analysis).toHaveProperty('insights');
    });

    test('should calculate drop-off rates', async () => {
      const analysis = await userBehaviorAnalytics.analyzeFunnel(testFunnel.id);

      expect(analysis.steps).toHaveLength(5);

      analysis.steps.forEach((step, index) => {
        expect(step).toHaveProperty('step', index + 1);
        expect(step).toHaveProperty('name');
        expect(step).toHaveProperty('users');
        expect(step).toHaveProperty('rate');
        expect(step).toHaveProperty('dropoff');
        expect(step).toHaveProperty('dropoffRate');
      });
    });

    test('should identify biggest drop-off', async () => {
      const analysis = await userBehaviorAnalytics.analyzeFunnel(testFunnel.id);

      expect(analysis.insights).toHaveProperty('biggestDropoffStep');
      expect(analysis.insights).toHaveProperty('biggestDropoffRate');
    });
  });

  describe('Churn Prediction', () => {
    beforeAll(async () => {
      // Create active user
      for (let i = 0; i < 10; i++) {
        await userBehaviorAnalytics.trackEvent('active-user', 'activity');
      }

      // Create inactive user (no recent activity)
      await userBehaviorAnalytics.trackEvent('inactive-user', 'signup');
    });

    test('should predict churn for user', async () => {
      const prediction = await userBehaviorAnalytics.predictChurn('active-user');

      expect(prediction).toHaveProperty('userId', 'active-user');
      expect(prediction).toHaveProperty('churnScore');
      expect(prediction).toHaveProperty('churnRisk');
      expect(prediction).toHaveProperty('features');
      expect(prediction).toHaveProperty('recommendations');
    });

    test('should calculate churn score', async () => {
      const prediction = await userBehaviorAnalytics.predictChurn('active-user');

      expect(typeof prediction.churnScore).toBe('number');
      expect(prediction.churnScore).toBeGreaterThanOrEqual(0);
      expect(prediction.churnScore).toBeLessThanOrEqual(100);
    });

    test('should classify churn risk', async () => {
      const prediction = await userBehaviorAnalytics.predictChurn('active-user');

      expect(['low', 'medium', 'high']).toContain(prediction.churnRisk);
    });

    test('should provide churn prevention recommendations', async () => {
      const prediction = await userBehaviorAnalytics.predictChurn('active-user');

      expect(Array.isArray(prediction.recommendations)).toBe(true);
    });

    test('should identify high churn risk for inactive users', async () => {
      const prediction = await userBehaviorAnalytics.predictChurn('inactive-user');

      // Inactive user should have higher churn score
      expect(prediction.churnScore).toBeGreaterThan(30);
    });
  });

  describe('User Segmentation', () => {
    beforeAll(async () => {
      // Create power user
      for (let i = 0; i < 100; i++) {
        await userBehaviorAnalytics.trackEvent('power-user', 'action');
      }

      // Create casual user
      await userBehaviorAnalytics.trackEvent('casual-user', 'login');

      // Create new user
      await userBehaviorAnalytics.trackEvent('new-user', 'signup');
    });

    test('should segment users', async () => {
      const segments = await userBehaviorAnalytics.segmentUsers();

      expect(segments).toHaveProperty('segments');
      expect(segments).toHaveProperty('totalUsers');
      expect(Array.isArray(segments.segments)).toBe(true);
    });

    test('should identify segment types', async () => {
      const segments = await userBehaviorAnalytics.segmentUsers();

      const segmentNames = segments.segments.map(s => s.name);
      expect(segmentNames).toContain('power_users');
      expect(segmentNames).toContain('casual_users');
      expect(segmentNames).toContain('new_users');
    });

    test('should calculate segment sizes', async () => {
      const segments = await userBehaviorAnalytics.segmentUsers();

      segments.segments.forEach(segment => {
        expect(segment).toHaveProperty('name');
        expect(segment).toHaveProperty('size');
        expect(segment).toHaveProperty('percentage');
        expect(typeof segment.size).toBe('number');
        expect(typeof segment.percentage).toBe('string');
      });
    });
  });

  describe('Analytics Summary', () => {
    test('should get analytics summary', () => {
      const summary = userBehaviorAnalytics.getAnalyticsSummary();

      expect(summary).toHaveProperty('totalUsers');
      expect(summary).toHaveProperty('totalSessions');
      expect(summary).toHaveProperty('totalEvents');
      expect(summary).toHaveProperty('activeSessions');
      expect(typeof summary.totalUsers).toBe('number');
      expect(typeof summary.totalSessions).toBe('number');
      expect(typeof summary.totalEvents).toBe('number');
    });
  });
});
