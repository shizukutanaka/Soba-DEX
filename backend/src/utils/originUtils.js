'use strict';

const { URL } = require('url');

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Parse and validate a comma-separated list of origins.
 * Ensures only explicit origins with supported protocols are retained.
 *
 * @param {string} rawOrigins - Comma separated origins string
 * @param {Object} [options]
 * @param {boolean} [options.allowHttpLocalhost=true] - Permit http for localhost/loopback
 * @param {string[]} [options.allowedProtocols=['https:', 'wss:']] - Allowed non-http protocols
 * @param {string[]} [options.allowHttpFor=[]] - Additional hostnames allowed over http
 * @returns {{
 *   validOrigins: string[],
 *   invalidOrigins: string[],
 *   duplicateOrigins: string[],
 *   rawOrigins: string[]
 * }}
 */
function parseAndValidateOrigins(rawOrigins, options = {}) {
  const {
    allowHttpLocalhost = true,
    allowedProtocols = ['https:', 'wss:'],
    allowHttpFor = []
  } = options;

  const httpPermittedHosts = new Set(
    allowHttpFor.map(host => host.trim().toLowerCase()).filter(Boolean)
  );

  const entries = (rawOrigins || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  const validSet = new Set();
  const duplicateOrigins = new Set();
  const invalidOrigins = [];

  for (const origin of entries) {
    if (origin === '*') {
      invalidOrigins.push(origin);
      continue;
    }

    let parsed;
    try {
      parsed = new URL(origin);
    } catch (_error) {
      invalidOrigins.push(origin);
      continue;
    }

    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      invalidOrigins.push(origin);
      continue;
    }

    const protocol = parsed.protocol;
    const hostname = parsed.hostname.toLowerCase();

    const protocolAllowed =
      allowedProtocols.includes(protocol) ||
      (protocol === 'http:' &&
        (httpPermittedHosts.has(hostname) ||
          (allowHttpLocalhost && LOCALHOST_HOSTNAMES.has(hostname))));

    if (!protocolAllowed) {
      invalidOrigins.push(origin);
      continue;
    }

    const normalized = `${protocol}//${parsed.host}`;

    if (validSet.has(normalized)) {
      duplicateOrigins.add(origin);
      continue;
    }

    validSet.add(normalized);
  }

  return {
    validOrigins: Array.from(validSet),
    invalidOrigins,
    duplicateOrigins: Array.from(duplicateOrigins),
    rawOrigins: entries
  };
}

module.exports = {
  parseAndValidateOrigins
};
