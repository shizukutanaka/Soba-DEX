/**
 * Voice Command Service - DISABLED
 *
 * This service has been disabled due to:
 * 1. Overly complex implementation (800+ lines)
 * 2. Security risks with voice-controlled trading
 * 3. Unnecessary complexity for a DEX mobile app
 * 4. Missing dependencies in package.json
 * 5. Potential privacy concerns with voice data
 *
 * If voice commands are needed in the future, implement a simpler,
 * more secure version with proper validation and user confirmation.
 *
 * @deprecated This service is disabled and should be removed
 * @version 6.0.0
 */

// Stub implementation for backward compatibility
export class VoiceCommandService {
  async initialize() {
    console.warn('VoiceCommandService is disabled for security reasons');
    return { success: false, reason: 'disabled' };
  }

  async startListening() {
    throw new Error('VoiceCommandService is disabled');
  }

  async stopListening() {
    throw new Error('VoiceCommandService is disabled');
  }

  async processCommand() {
    throw new Error('VoiceCommandService is disabled');
  }

  cleanup() {
    // No-op
  }
}

const voiceCommandService = new VoiceCommandService();

export default voiceCommandService;
