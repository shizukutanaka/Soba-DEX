const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class JWTUtils {
  constructor() {
    this.config = {
      secret: process.env.JWT_SECRET || this.generateSecret(),
      algorithm: 'HS256',
      issuer: 'soba',
      audience: 'dex-users',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      resetTokenExpiry: '1h'
    };
    this.blacklist = new Set();
    this.refreshTokens = new Map();
  }

  // Generate a secure secret if none provided
  generateSecret() {
    const secret = crypto.randomBytes(64).toString('hex');
    console.warn('⚠️  Using generated JWT secret. Set JWT_SECRET environment variable for production.');
    return secret;
  }

  // Generate access token
  generateAccessToken(payload, options = {}) {
    const tokenPayload = {
      ...payload,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    };

    const tokenOptions = {
      expiresIn: options.expiresIn || this.config.accessTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm
    };

    return jwt.sign(tokenPayload, this.config.secret, tokenOptions);
  }

  // Generate refresh token
  generateRefreshToken(payload, options = {}) {
    const tokenPayload = {
      userId: payload.userId,
      sessionId: payload.sessionId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };

    const tokenOptions = {
      expiresIn: options.expiresIn || this.config.refreshTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm
    };

    const token = jwt.sign(tokenPayload, this.config.secret, tokenOptions);

    // Store refresh token with expiry
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    this.refreshTokens.set(token, {
      userId: payload.userId,
      sessionId: payload.sessionId,
      expiresAt
    });

    return token;
  }

  // Generate token pair
  generateTokenPair(payload, options = {}) {
    const accessToken = this.generateAccessToken(payload, options.access);
    const refreshToken = this.generateRefreshToken(payload, options.refresh);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.parseExpiry(options.access?.expiresIn || this.config.accessTokenExpiry)
    };
  }

  // Verify token
  verifyToken(token, options = {}) {
    if (!token) {
      throw new Error('Token is required');
    }

    // Check blacklist
    if (this.blacklist.has(token)) {
      throw new Error('Token has been revoked');
    }

    try {
      const decoded = jwt.verify(token, this.config.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm],
        ...options
      });

      return {
        valid: true,
        payload: decoded,
        userId: decoded.userId,
        sessionId: decoded.sessionId,
        type: decoded.type || 'access'
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      if (error.name === 'NotBeforeError') {
        throw new Error('Token not active yet');
      }
      throw new Error('Token verification failed');
    }
  }

  // Refresh access token
  refreshAccessToken(refreshToken) {
    // Verify refresh token
    const verification = this.verifyToken(refreshToken);

    if (verification.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }

    // Check if refresh token is stored
    const storedToken = this.refreshTokens.get(refreshToken);
    if (!storedToken) {
      throw new Error('Refresh token not found');
    }

    // Check expiry
    if (Date.now() > storedToken.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      throw new Error('Refresh token expired');
    }

    // Generate new access token
    const newAccessToken = this.generateAccessToken({
      userId: verification.userId,
      sessionId: verification.sessionId
    });

    return {
      accessToken: newAccessToken,
      tokenType: 'Bearer',
      expiresIn: this.parseExpiry(this.config.accessTokenExpiry)
    };
  }

  // Revoke token (add to blacklist)
  revokeToken(token) {
    this.blacklist.add(token);

    // Also remove from refresh tokens if it's a refresh token
    this.refreshTokens.delete(token);

    return true;
  }

  // Revoke all tokens for a user
  revokeUserTokens(userId) {
    let revokedCount = 0;

    // Remove refresh tokens for user
    this.refreshTokens.forEach((tokenData, token) => {
      if (tokenData.userId === userId) {
        this.refreshTokens.delete(token);
        this.blacklist.add(token);
        revokedCount++;
      }
    });

    return revokedCount;
  }

  // Decode token without verification (for inspection)
  decodeToken(token) {
    return jwt.decode(token, { complete: true });
  }

  // Check if token is expired
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      return Date.now() >= decoded.exp * 1000;
    } catch (_error) {
      return true;
    }
  }

  // Get token expiry time
  getTokenExpiry(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  // Parse expiry string to seconds
  parseExpiry(expiry) {
    if (typeof expiry === 'number') {
      return expiry;
    }

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // Default 15 minutes
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400
    };

    return value * multipliers[unit];
  }

  // Express middleware for token verification
  middleware(options = {}) {
    return (req, res, next) => {
      try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          if (options.required !== false) {
            return res.status(401).json({
              error: true,
              message: 'Access token required'
            });
          }
          return next();
        }

        const token = authHeader.substring(7);
        const verification = this.verifyToken(token);

        if (verification.type !== 'access') {
          return res.status(401).json({
            error: true,
            message: 'Invalid token type'
          });
        }

        // Add user info to request
        req.user = {
          id: verification.userId,
          sessionId: verification.sessionId,
          token: token
        };

        req.token = verification.payload;

        next();

      } catch (error) {
        res.status(401).json({
          error: true,
          message: error.message
        });
      }
    };
  }

  // Middleware that requires authentication
  requireAuth() {
    return this.middleware({ required: true });
  }

  // Middleware for optional authentication
  optionalAuth() {
    return this.middleware({ required: false });
  }

  // Generate password reset token
  generateResetToken(userId, email) {
    const payload = {
      userId,
      email,
      type: 'reset',
      purpose: 'password_reset'
    };

    return jwt.sign(payload, this.config.secret, {
      expiresIn: this.config.resetTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience
    });
  }

  // Verify password reset token
  verifyResetToken(token) {
    const verification = this.verifyToken(token);

    if (verification.type !== 'reset') {
      throw new Error('Invalid reset token');
    }

    return {
      userId: verification.userId,
      email: verification.payload.email
    };
  }

  // Clean up expired tokens
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // Clean refresh tokens
    this.refreshTokens.forEach((tokenData, token) => {
      if (now > tokenData.expiresAt) {
        this.refreshTokens.delete(token);
        cleaned++;
      }
    });

    // Clean blacklist (keep only non-expired tokens)
    const blacklistArray = Array.from(this.blacklist);
    this.blacklist.clear();

    blacklistArray.forEach(token => {
      if (!this.isTokenExpired(token)) {
        this.blacklist.add(token);
      } else {
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`JWT cleanup: removed ${cleaned} expired tokens`);
    }

    return cleaned;
  }

  // Get token statistics
  getStats() {
    return {
      blacklistedTokens: this.blacklist.size,
      refreshTokens: this.refreshTokens.size,
      algorithm: this.config.algorithm,
      accessTokenExpiry: this.config.accessTokenExpiry,
      refreshTokenExpiry: this.config.refreshTokenExpiry
    };
  }
}

module.exports = new JWTUtils();