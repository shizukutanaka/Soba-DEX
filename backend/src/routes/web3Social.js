/**
 * Web3 Social API Routes
 *
 * Provides endpoints for:
 * - Social profile management
 * - Social feed generation
 * - NFT collection browsing
 * - DAO governance and voting
 * - Social trading features
 * - Web3 identity verification
 *
 * @version 6.0.0
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const web3SocialService = require('../services/web3SocialService');
const logger = require('../config/logger');

const router = express.Router();

// Rate limiting for social endpoints
const socialRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many social requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
router.use(socialRateLimit);

/**
 * @route GET /api/v6/social/profile/:address
 * @desc Get social profile
 * @access Public
 */
router.get('/profile/:address', async (req, res) => {
  try {
    const { address } = req.params;

    logger.info('[SocialAPI] Profile request:', { address });

    const profile = await web3SocialService.getSocialProfile(address);

    res.json({
      success: true,
      profile,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Profile error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/social/profile
 * @desc Create or update social profile
 * @access Public
 */
router.post('/profile', async (req, res) => {
  try {
    const { address, profileData } = req.body;

    if (!address) {
      return res.status(400).json({
        error: 'Missing required parameter: address'
      });
    }

    logger.info('[SocialAPI] Profile update request:', { address });

    const result = await web3SocialService.createSocialProfile(address, profileData);

    res.json({
      success: true,
      profile: result.profile,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Profile update error:', error);
    res.status(500).json({
      error: 'Profile update failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/feed/:address
 * @desc Get social feed for user
 * @access Public
 */
router.get('/feed/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit, type } = req.query;

    logger.info('[SocialAPI] Feed request:', { address, limit, type });

    const feed = await web3SocialService.generateSocialFeed(address, {
      limit: parseInt(limit) || 20,
      type: type || 'all'
    });

    res.json({
      success: true,
      feed: feed.feed,
      total: feed.total,
      hasMore: feed.hasMore,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Feed error:', error);
    res.status(500).json({
      error: 'Feed generation failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/social/follow
 * @desc Follow social trader
 * @access Public
 */
router.post('/follow', async (req, res) => {
  try {
    const { follower, trader } = req.body;

    if (!follower || !trader) {
      return res.status(400).json({
        error: 'Missing required parameters: follower, trader'
      });
    }

    logger.info('[SocialAPI] Follow request:', { follower, trader });

    const result = await web3SocialService.followSocialTrader(follower, trader);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Follow error:', error);
    res.status(500).json({
      error: 'Follow failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/social/copy-trade
 * @desc Copy social trade
 * @access Public
 */
router.post('/copy-trade', async (req, res) => {
  try {
    const { follower, trade } = req.body;

    if (!follower || !trade) {
      return res.status(400).json({
        error: 'Missing required parameters: follower, trade'
      });
    }

    logger.info('[SocialAPI] Copy trade request:', { follower, trade });

    const result = await web3SocialService.copySocialTrade(follower, trade);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Copy trade error:', error);
    res.status(500).json({
      error: 'Copy trade failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/signals/:token
 * @desc Get social trading signals
 * @access Public
 */
router.get('/signals/:token', async (req, res) => {
  try {
    const { token } = req.params;

    logger.info('[SocialAPI] Signals request:', { token });

    const signals = await web3SocialService.getSocialTradingSignals(token);

    res.json({
      success: true,
      signals,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Signals error:', error);
    res.status(500).json({
      error: 'Signals retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/nft/collection/:address
 * @desc Get NFT collection
 * @access Public
 */
router.get('/nft/collection/:address', async (req, res) => {
  try {
    const { address } = req.params;

    logger.info('[SocialAPI] NFT collection request:', { address });

    const collection = await web3SocialService.getNFTCollection(address);

    res.json({
      success: true,
      collection,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] NFT collection error:', error);
    res.status(500).json({
      error: 'NFT collection retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/nft/token/:address/:tokenId
 * @desc Get NFT token details
 * @access Public
 */
router.get('/nft/token/:address/:tokenId', async (req, res) => {
  try {
    const { address, tokenId } = req.params;

    logger.info('[SocialAPI] NFT token request:', { address, tokenId });

    const token = await web3SocialService.nftManager.getToken(address, parseInt(tokenId));
    const rarity = await web3SocialService.calculateNFTRarity(address, parseInt(tokenId));
    const priceHistory = await web3SocialService.nftManager.getPriceHistory(address, parseInt(tokenId));

    res.json({
      success: true,
      token,
      rarity,
      priceHistory,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] NFT token error:', error);
    res.status(500).json({
      error: 'NFT token retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/social/dao/proposal
 * @desc Create DAO proposal
 * @access Public
 */
router.post('/dao/proposal', async (req, res) => {
  try {
    const { proposer, title, description, actions, value } = req.body;

    if (!proposer || !title || !description) {
      return res.status(400).json({
        error: 'Missing required parameters: proposer, title, description'
      });
    }

    logger.info('[SocialAPI] DAO proposal request:', { proposer, title });

    const result = await web3SocialService.createDAOProposal({
      proposer,
      title,
      description,
      actions,
      value
    });

    res.json({
      success: true,
      proposal: result.proposal,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] DAO proposal error:', error);
    res.status(500).json({
      error: 'DAO proposal creation failed',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v6/social/dao/vote
 * @desc Vote on DAO proposal
 * @access Public
 */
router.post('/dao/vote', async (req, res) => {
  try {
    const { proposalId, voter, option } = req.body;

    if (!proposalId || !voter || !option) {
      return res.status(400).json({
        error: 'Missing required parameters: proposalId, voter, option'
      });
    }

    logger.info('[SocialAPI] DAO vote request:', { proposalId, voter, option });

    const result = await web3SocialService.voteOnProposal(proposalId, voter, option);

    res.json({
      success: true,
      vote: result,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] DAO vote error:', error);
    res.status(500).json({
      error: 'DAO vote failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/dao/proposals
 * @desc Get active DAO proposals
 * @access Public
 */
router.get('/dao/proposals', async (req, res) => {
  try {
    const proposals = Array.from(web3SocialService.daoProposals.values())
      .filter(p => p.status === 'active')
      .map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        proposer: p.proposer,
        votes: p.votes,
        endTime: p.endTime,
        createdAt: p.createdAt
      }));

    res.json({
      success: true,
      proposals,
      total: proposals.length,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] DAO proposals error:', error);
    res.status(500).json({
      error: 'DAO proposals retrieval failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/health
 * @desc Get social service health status
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    const health = web3SocialService.getHealth();

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] Health check error:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v6/social/ens/resolve/:name
 * @desc Resolve ENS name
 * @access Public
 */
router.get('/ens/resolve/:name', async (req, res) => {
  try {
    const { name } = req.params;

    logger.info('[SocialAPI] ENS resolve request:', { name });

    const address = await web3SocialService.ensResolver.lookupAddress(name);

    res.json({
      success: true,
      name,
      address,
      timestamp: new Date().toISOString(),
      version: '6.0.0'
    });
  } catch (error) {
    logger.error('[SocialAPI] ENS resolve error:', error);
    res.status(500).json({
      error: 'ENS resolution failed',
      message: error.message
    });
  }
});

module.exports = router;
