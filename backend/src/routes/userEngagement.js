/**
 * Enhanced User Engagement API Routes
 *
 * Provides endpoints for:
 * - Gamification features (badges, achievements, levels)
 * - Social features (friends, groups, leaderboards)
 * - Personalization (recommendations, preferences)
 * - Loyalty program (tiers, rewards)
 * - User analytics and insights
 * - Notification management
 * - Community features
 *
 * @version 6.0.0
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const enhancedUserEngagement = require('../services/enhancedUserEngagementService');
const logger = require('../config/logger');

const router = express.Router();

// Rate limiting for engagement endpoints
const engagementRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many engagement requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
router.use(engagementRateLimit);

/**
 * @route GET /api/v6/engagement/profile/:userId
 * @desc Get user engagement profile
 * @access Public
 */
router.get('/profile/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const profile = enhancedUserEngagement.getUserProfile(userId);

    res.json({
      success: true,
      profile,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Profile error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/engagement/badge
 * @desc Award badge to user
 * @access Public
 */
router.post('/badge', async (req, res) => {
  try {
    const { userId, badgeId, context } = req.body;

    if (!userId || !badgeId) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, badgeId'
      });
    }

    logger.info('[EngagementAPI] Badge award request:', { userId, badgeId });

    const result = await enhancedUserEngagement.awardUserBadge(userId, badgeId, context);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Badge award error:', error);
    res.status(500).json({
      error: 'Badge award failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/achievements/:userId
 * @desc Get user achievements
 * @access Public
 */
router.get('/achievements/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const profile = enhancedUserEngagement.getUserProfile(userId);

    const achievements = profile.achievements.map(achievementId => {
      const achievement = enhancedUserEngagement.gamificationEngine.achievements.get(achievementId);
      return achievement ? { ...achievement, earned: true } : null;
    }).filter(Boolean);

    res.json({
      success: true,
      achievements,
      total: achievements.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Achievements error:', error);
    res.status(500).json({
      error: 'Achievements retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/engagement/achievement-check
 * @desc Check and award achievements for user action
 * @access Public
 */
router.post('/achievement-check', async (req, res) => {
  try {
    const { userId, action } = req.body;

    if (!userId || !action) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, action'
      });
    }

    logger.info('[EngagementAPI] Achievement check request:', { userId, action });

    const achievements = await enhancedUserEngagement.checkUserAchievements(userId, action);

    res.json({
      success: true,
      achievements,
      count: achievements.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Achievement check error:', error);
    res.status(500).json({
      error: 'Achievement check failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/engagement/friend
 * @desc Add friend connection
 * @access Public
 */
router.post('/friend', async (req, res) => {
  try {
    const { userId, friendId } = req.body;

    if (!userId || !friendId) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, friendId'
      });
    }

    logger.info('[EngagementAPI] Friend request:', { userId, friendId });

    const result = await enhancedUserEngagement.addUserFriend(userId, friendId);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Friend request error:', error);
    res.status(500).json({
      error: 'Friend request failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/recommendations/:userId
 * @desc Get personalized recommendations
 * @access Public
 */
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info('[EngagementAPI] Recommendations request:', { userId });

    const recommendations = await enhancedUserEngagement.generateUserRecommendations(userId);

    res.json({
      success: true,
      recommendations,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Recommendations error:', error);
    res.status(500).json({
      error: 'Recommendations failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/loyalty/:userId
 * @desc Get user loyalty tier information
 * @access Public
 */
router.get('/loyalty/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info('[EngagementAPI] Loyalty tier request:', { userId });

    const tierInfo = await enhancedUserEngagement.calculateUserLoyaltyTier(userId);

    res.json({
      success: true,
      tier: tierInfo,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Loyalty tier error:', error);
    res.status(500).json({
      error: 'Loyalty tier retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/leaderboard/:category
 * @desc Get leaderboard for category
 * @access Public
 */
router.get('/leaderboard/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { timeframe = 'weekly' } = req.query;

    logger.info('[EngagementAPI] Leaderboard request:', { category, timeframe });

    const leaderboard = await enhancedUserEngagement.getSocialLeaderboard(category, timeframe);

    res.json({
      success: true,
      leaderboard,
      category,
      timeframe,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Leaderboard error:', error);
    res.status(500).json({
      error: 'Leaderboard retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/engagement/notification
 * @desc Send personalized notification
 * @access Public
 */
router.post('/notification', async (req, res) => {
  try {
    const { userId, notification } = req.body;

    if (!userId || !notification) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, notification'
      });
    }

    logger.info('[EngagementAPI] Notification request:', { userId });

    const result = await enhancedUserEngagement.sendUserNotification(userId, notification);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Notification error:', error);
    res.status(500).json({
      error: 'Notification failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/health
 * @desc Get engagement service health
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    const health = enhancedUserEngagement.getHealth();

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Health check error:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/analytics
 * @desc Get engagement analytics
 * @access Public
 */
router.get('/analytics', (req, res) => {
  try {
    const metrics = {
      totalUsers: enhancedUserEngagement.userProfiles.size,
      averageLevel: enhancedUserEngagement.calculateAverageLevel(),
      averagePoints: enhancedUserEngagement.calculateAveragePoints(),
      engagementRate: enhancedUserEngagement.calculateAverageLevel() / enhancedUserEngagement.config.gamification.levels,
      loyaltyDistribution: enhancedUserEngagement.calculateLoyaltyDistribution(),
      badgeDistribution: enhancedUserEngagement.calculateBadgeDistribution()
    };

    res.json({
      success: true,
      analytics: metrics,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Analytics error:', error);
    res.status(500).json({
      error: 'Analytics retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/badges
 * @desc Get available badges
 * @access Public
 */
router.get('/badges', (req, res) => {
  try {
    const badges = Array.from(enhancedUserEngagement.gamificationEngine.badges.values());

    res.json({
      success: true,
      badges,
      total: badges.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Badges error:', error);
    res.status(500).json({
      error: 'Badges retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/levels
 * @desc Get level information
 * @access Public
 */
router.get('/levels', (req, res) => {
  try {
    const levels = enhancedUserEngagement.gamificationEngine.levels;

    res.json({
      success: true,
      levels,
      total: levels.length,
      maxLevel: enhancedUserEngagement.config.gamification.levels,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Levels error:', error);
    res.status(500).json({
      error: 'Levels retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/engagement/tiers
 * @desc Get loyalty tiers information
 * @access Public
 */
router.get('/tiers', (req, res) => {
  try {
    const tiers = enhancedUserEngagement.loyaltyEngine.tiers.map(tier => ({
      name: tier,
      benefits: enhancedUserEngagement.getTierBenefits(tier)
    }));

    res.json({
      success: true,
      tiers,
      total: tiers.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Tiers error:', error);
    res.status(500).json({
      error: 'Tiers retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/engagement/track-action
 * @desc Track user action for engagement
 * @access Public
 */
router.post('/track-action', async (req, res) => {
  try {
    const { userId, action, metadata } = req.body;

    if (!userId || !action) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, action'
      });
    }

    logger.info('[EngagementAPI] Action tracking:', { userId, action });

    // Update user activity
    const profile = enhancedUserEngagement.getUserProfile(userId);
    profile.lastActivity = Date.now();
    enhancedUserEngagement.userProfiles.set(userId, profile);

    // Check for achievements
    const achievements = await enhancedUserEngagement.checkUserAchievements(userId, action);

    // Generate recommendations if needed
    const recommendations = await enhancedUserEngagement.generateUserRecommendations(userId);

    res.json({
      success: true,
      achievements,
      recommendations,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[EngagementAPI] Action tracking error:', error);
    res.status(500).json({
      error: 'Action tracking failed',
      message: error.message
    });
  }
});

module.exports = router;
