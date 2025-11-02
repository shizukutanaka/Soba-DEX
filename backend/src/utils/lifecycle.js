
'use strict';

const VALID_STATUSES = new Set([
  'starting',
  'healthy',
  'degraded',
  'shutting_down',
  'stopped'
]);

const MAX_HISTORY_LENGTH = 50;

const state = {
  status: 'starting',
  updatedAt: Date.now(),
  metadata: {}
};

const history = [];

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  if (Array.isArray(metadata)) {
    return {};
  }
  return { ...metadata };
}

function recordHistory(entry) {
  history.push(entry);
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }
}

function setStatus(status, metadata = {}) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid lifecycle status: ${status}`);
  }

  const timestamp = Date.now();
  const sanitizedMetadata = sanitizeMetadata(metadata);

  recordHistory({
    status,
    timestamp,
    metadata: sanitizedMetadata,
    previousStatus: state.status
  });

  state.status = status;
  state.updatedAt = timestamp;
  state.metadata = sanitizedMetadata;
}

function markHealthy(metadata) {
  setStatus('healthy', metadata);
}

function markDegraded(metadata) {
  setStatus('degraded', metadata);
}

function markShuttingDown(metadata) {
  setStatus('shutting_down', metadata);
}

function markStopped(metadata) {
  setStatus('stopped', metadata);
}

function getStatus() {
  return {
    status: state.status,
    updatedAt: state.updatedAt,
    metadata: { ...state.metadata }
  };
}

function isShuttingDown() {
  return state.status === 'shutting_down' || state.status === 'stopped';
}

function getHistory(limit = 10) {
  const clampedLimit = Math.max(1, Math.min(limit, MAX_HISTORY_LENGTH));
  return history.slice(-clampedLimit).map(entry => ({
    status: entry.status,
    timestamp: entry.timestamp,
    metadata: { ...entry.metadata },
    previousStatus: entry.previousStatus
  }));
}

module.exports = {
  setStatus,
  markHealthy,
  markDegraded,
  markShuttingDown,
  markStopped,
  getStatus,
  isShuttingDown,
  getHistory
};
