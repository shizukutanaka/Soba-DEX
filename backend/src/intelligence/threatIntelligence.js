/**
 * Threat Intelligence Feed Integration
 * Integrates with multiple threat intelligence sources
 *
 * Features:
 * - Multi-source threat intelligence aggregation
 * - IP reputation scoring
 * - Malware hash checking
 * - Domain/URL reputation
 * - CVE vulnerability tracking
 * - Automated threat enrichment
 * - Real-time updates
 */

const EventEmitter = require('events');
const axios = require('axios');
const crypto = require('crypto');

class ThreatIntelligence extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      updateInterval: options.updateInterval || 3600000, // 1 hour
      cacheExpiry: options.cacheExpiry || 86400000, // 24 hours
      maxCacheSize: options.maxCacheSize || 100000,
      sources: options.sources || [
        'abuseipdb',
        'alienvault',
        'virustotal',
        'shodan',
        'threatcrowd',
        'custom'
      ],
      apiKeys: options.apiKeys || {},
      ...options
    };

    this.cache = options.cache; // Redis cache
    this.threatData = new Map();
    this.ipReputation = new Map();
    this.malwareHashes = new Set();
    this.maliciousDomains = new Set();
    this.cveDatabase = new Map();

    this.metrics = {
      lookupsTotal: 0,
      cacheHits: 0,
      cacheMisses: 0,
      threatsIdentified: 0,
      lastUpdate: null
    };

    this.feedUrls = {
      abuseipdb: 'https://api.abuseipdb.com/api/v2/check',
      alienvault: 'https://otx.alienvault.com/api/v1/indicators',
      virustotal: 'https://www.virustotal.com/api/v3',
      shodan: 'https://api.shodan.io',
      threatcrowd: 'https://www.threatcrowd.org/searchApi/v2',
      emergingthreats: 'https://rules.emergingthreats.net/open/suricata-5.0/emerging-compromised.rules'
    };
  }

  /**
   * Initialize threat intelligence
   */
  async initialize() {
    console.log('🔍 Initializing Threat Intelligence...');

    // Load from cache if available
    await this.loadFromCache();

    // Start periodic updates
    this.startPeriodicUpdates();

    // Initial feed update
    await this.updateFeeds();

    console.log('✅ Threat Intelligence initialized');
  }

  /**
   * Check IP reputation
   */
  async checkIPReputation(ip) {
    this.metrics.lookupsTotal++;

    // Check cache first
    const cached = await this.getFromCache(`ip:${ip}`);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    this.metrics.cacheMisses++;

    const reputation = {
      ip,
      score: 0, // 0-100, higher is more malicious
      sources: [],
      isMalicious: false,
      categories: [],
      lastSeen: null,
      confidence: 0
    };

    // Query multiple sources
    const results = await Promise.allSettled([
      this.queryAbuseIPDB(ip),
      this.queryAlienVault(ip),
      this.queryThreatCrowd(ip)
    ]);

    // Aggregate results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        reputation.sources.push(data.source);
        reputation.score += data.score || 0;
        reputation.categories.push(...(data.categories || []));
        if (data.lastSeen) {
          reputation.lastSeen = reputation.lastSeen ?
            Math.max(reputation.lastSeen, data.lastSeen) : data.lastSeen;
        }
      }
    });

    // Calculate final score and confidence
    reputation.score = Math.min(reputation.score / reputation.sources.length, 100);
    reputation.confidence = Math.min(reputation.sources.length / 3, 1);
    reputation.isMalicious = reputation.score > 50;

    if (reputation.isMalicious) {
      this.metrics.threatsIdentified++;
    }

    // Cache result
    await this.saveToCache(`ip:${ip}`, reputation);

    // Store in memory
    this.ipReputation.set(ip, reputation);

    return reputation;
  }

  /**
   * Check file hash for malware
   */
  async checkFileHash(hash, hashType = 'sha256') {
    this.metrics.lookupsTotal++;

    const cacheKey = `hash:${hashType}:${hash}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    this.metrics.cacheMisses++;

    const result = {
      hash,
      hashType,
      isMalicious: false,
      detections: 0,
      totalScans: 0,
      malwareFamily: null,
      sources: []
    };

    // Query VirusTotal
    if (this.options.apiKeys.virustotal) {
      try {
        const vtResult = await this.queryVirusTotal(hash, hashType);
        if (vtResult) {
          result.detections = vtResult.detections;
          result.totalScans = vtResult.totalScans;
          result.isMalicious = vtResult.detections > 0;
          result.malwareFamily = vtResult.malwareFamily;
          result.sources.push('virustotal');
        }
      } catch (error) {
        console.error('VirusTotal query error:', error.message);
      }
    }

    if (result.isMalicious) {
      this.metrics.threatsIdentified++;
      this.malwareHashes.add(hash);
    }

    await this.saveToCache(cacheKey, result);
    return result;
  }

  /**
   * Check domain reputation
   */
  async checkDomainReputation(domain) {
    this.metrics.lookupsTotal++;

    const cacheKey = `domain:${domain}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    this.metrics.cacheMisses++;

    const reputation = {
      domain,
      isMalicious: false,
      categories: [],
      score: 0,
      sources: []
    };

    // Query threat feeds
    const results = await Promise.allSettled([
      this.queryAlienVaultDomain(domain),
      this.queryThreatCrowdDomain(domain)
    ]);

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        reputation.sources.push(data.source);
        reputation.categories.push(...(data.categories || []));
        reputation.score += data.score || 0;
      }
    });

    reputation.score = Math.min(reputation.score / Math.max(reputation.sources.length, 1), 100);
    reputation.isMalicious = reputation.score > 50;

    if (reputation.isMalicious) {
      this.metrics.threatsIdentified++;
      this.maliciousDomains.add(domain);
    }

    await this.saveToCache(cacheKey, reputation);
    return reputation;
  }

  /**
   * Get CVE information
   */
  async getCVEInfo(cveId) {
    this.metrics.lookupsTotal++;

    const cacheKey = `cve:${cveId}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    this.metrics.cacheMisses++;

    try {
      const response = await axios.get(
        `https://cve.circl.lu/api/cve/${cveId}`,
        { timeout: 5000 }
      );

      const cveInfo = {
        id: cveId,
        description: response.data.summary,
        cvss: response.data.cvss,
        severity: this.calculateSeverity(response.data.cvss),
        published: response.data.Published,
        modified: response.data.Modified,
        references: response.data.references || []
      };

      await this.saveToCache(cacheKey, cveInfo);
      this.cveDatabase.set(cveId, cveInfo);

      return cveInfo;
    } catch (error) {
      console.error(`Error fetching CVE ${cveId}:`, error.message);
      return null;
    }
  }

  /**
   * Enrich security event with threat intelligence
   */
  async enrichEvent(event) {
    const enrichment = {
      ip: null,
      domain: null,
      hash: null,
      threatScore: 0,
      isMalicious: false,
      sources: []
    };

    // Check IP if available
    if (event.ip) {
      enrichment.ip = await this.checkIPReputation(event.ip);
      enrichment.threatScore += enrichment.ip.score * 0.5;
      enrichment.isMalicious = enrichment.isMalicious || enrichment.ip.isMalicious;
      enrichment.sources.push(...enrichment.ip.sources);
    }

    // Check domain if available
    if (event.url) {
      const domain = this.extractDomain(event.url);
      if (domain) {
        enrichment.domain = await this.checkDomainReputation(domain);
        enrichment.threatScore += enrichment.domain.score * 0.3;
        enrichment.isMalicious = enrichment.isMalicious || enrichment.domain.isMalicious;
        enrichment.sources.push(...enrichment.domain.sources);
      }
    }

    // Check file hash if available
    if (event.fileHash) {
      enrichment.hash = await this.checkFileHash(event.fileHash);
      enrichment.threatScore += enrichment.hash.isMalicious ? 50 : 0;
      enrichment.isMalicious = enrichment.isMalicious || enrichment.hash.isMalicious;
      enrichment.sources.push(...enrichment.hash.sources);
    }

    enrichment.threatScore = Math.min(enrichment.threatScore, 100);
    enrichment.sources = [...new Set(enrichment.sources)]; // Deduplicate

    return enrichment;
  }

  /**
   * Query AbuseIPDB
   */
  async queryAbuseIPDB(ip) {
    if (!this.options.apiKeys.abuseipdb) {
      return null;
    }

    try {
      const response = await axios.get(this.feedUrls.abuseipdb, {
        params: { ipAddress: ip, maxAgeInDays: 90 },
        headers: { 'Key': this.options.apiKeys.abuseipdb },
        timeout: 5000
      });

      const data = response.data.data;
      return {
        source: 'abuseipdb',
        score: data.abuseConfidenceScore,
        categories: data.usageType ? [data.usageType] : [],
        lastSeen: data.lastReportedAt ? new Date(data.lastReportedAt).getTime() : null
      };
    } catch (error) {
      console.error('AbuseIPDB query error:', error.message);
      return null;
    }
  }

  /**
   * Query AlienVault OTX
   */
  async queryAlienVault(ip) {
    try {
      const response = await axios.get(
        `${this.feedUrls.alienvault}/IPv4/${ip}/general`,
        { timeout: 5000 }
      );

      const data = response.data;
      return {
        source: 'alienvault',
        score: data.pulse_info?.count > 0 ? 70 : 0,
        categories: data.reputation?.tags || [],
        lastSeen: null
      };
    } catch (error) {
      console.error('AlienVault query error:', error.message);
      return null;
    }
  }

  /**
   * Query ThreatCrowd
   */
  async queryThreatCrowd(ip) {
    try {
      const response = await axios.get(
        `${this.feedUrls.threatcrowd}/ip/report/`,
        { params: { ip }, timeout: 5000 }
      );

      const data = response.data;
      return {
        source: 'threatcrowd',
        score: data.votes > 0 ? 60 : 0,
        categories: [],
        lastSeen: null
      };
    } catch (error) {
      console.error('ThreatCrowd query error:', error.message);
      return null;
    }
  }

  /**
   * Query VirusTotal
   */
  async queryVirusTotal(hash, hashType) {
    try {
      const response = await axios.get(
        `${this.feedUrls.virustotal}/files/${hash}`,
        {
          headers: { 'x-apikey': this.options.apiKeys.virustotal },
          timeout: 5000
        }
      );

      const data = response.data.data.attributes;
      return {
        detections: data.last_analysis_stats.malicious,
        totalScans: data.last_analysis_stats.malicious + data.last_analysis_stats.undetected,
        malwareFamily: data.popular_threat_classification?.suggested_threat_label
      };
    } catch (error) {
      console.error('VirusTotal query error:', error.message);
      return null;
    }
  }

  /**
   * Query AlienVault for domain
   */
  async queryAlienVaultDomain(domain) {
    try {
      const response = await axios.get(
        `${this.feedUrls.alienvault}/domain/${domain}/general`,
        { timeout: 5000 }
      );

      const data = response.data;
      return {
        source: 'alienvault',
        score: data.pulse_info?.count > 0 ? 70 : 0,
        categories: data.reputation?.tags || []
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Query ThreatCrowd for domain
   */
  async queryThreatCrowdDomain(domain) {
    try {
      const response = await axios.get(
        `${this.feedUrls.threatcrowd}/domain/report/`,
        { params: { domain }, timeout: 5000 }
      );

      const data = response.data;
      return {
        source: 'threatcrowd',
        score: data.votes > 0 ? 60 : 0,
        categories: []
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Update threat feeds
   */
  async updateFeeds() {
    console.log('🔄 Updating threat intelligence feeds...');
    const start = Date.now();

    try {
      await Promise.allSettled([
        this.updateEmergingThreatsRules(),
        this.updateMalwareHashList(),
        this.updateKnownMaliciousDomains()
      ]);

      this.metrics.lastUpdate = Date.now();
      console.log(`✅ Feeds updated in ${Date.now() - start}ms`);

      this.emit('feedsUpdated', { duration: Date.now() - start });
    } catch (error) {
      console.error('Error updating feeds:', error);
    }
  }

  /**
   * Update Emerging Threats rules
   */
  async updateEmergingThreatsRules() {
    try {
      const response = await axios.get(this.feedUrls.emergingthreats, {
        timeout: 30000
      });

      // Parse Suricata rules
      const rules = response.data.split('\n').filter(line => line.trim() && !line.startsWith('#'));

      console.log(`Loaded ${rules.length} Emerging Threats rules`);
    } catch (error) {
      console.error('Error updating Emerging Threats rules:', error.message);
    }
  }

  /**
   * Update malware hash list
   */
  async updateMalwareHashList() {
    // This would fetch from a malware hash feed
    // Placeholder implementation
    console.log('Updated malware hash list');
  }

  /**
   * Update known malicious domains
   */
  async updateKnownMaliciousDomains() {
    // This would fetch from a malicious domain feed
    // Placeholder implementation
    console.log('Updated malicious domains list');
  }

  /**
   * Start periodic updates
   */
  startPeriodicUpdates() {
    setInterval(() => {
      this.updateFeeds();
    }, this.options.updateInterval);
  }

  /**
   * Cache management
   */
  async saveToCache(key, value) {
    if (this.cache) {
      await this.cache.setWithExpiry(
        `threat_intel:${key}`,
        JSON.stringify(value),
        this.options.cacheExpiry
      );
    }
  }

  async getFromCache(key) {
    if (this.cache) {
      const cached = await this.cache.get(`threat_intel:${key}`);
      return cached ? JSON.parse(cached) : null;
    }
    return null;
  }

  async loadFromCache() {
    // Load frequently used data from cache
    console.log('Loading threat intelligence from cache...');
  }

  /**
   * Utility functions
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  calculateSeverity(cvss) {
    if (cvss >= 9.0) return 'CRITICAL';
    if (cvss >= 7.0) return 'HIGH';
    if (cvss >= 4.0) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.threatData.size,
      ipReputationSize: this.ipReputation.size,
      malwareHashesSize: this.malwareHashes.size,
      maliciousDomainsSize: this.maliciousDomains.size,
      cveSize: this.cveDatabase.size,
      cacheHitRate: this.metrics.lookupsTotal > 0 ?
        (this.metrics.cacheHits / this.metrics.lookupsTotal * 100).toFixed(2) : 0
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    this.threatData.clear();
    this.ipReputation.clear();
    this.malwareHashes.clear();
    this.maliciousDomains.clear();
    this.cveDatabase.clear();
  }
}

module.exports = ThreatIntelligence;
