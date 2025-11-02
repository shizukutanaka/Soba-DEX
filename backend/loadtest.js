#!/usr/bin/env node

const { LoadTester, TestConfigurations } = require('./src/testing/loadTester');
const fs = require('fs').promises;
const path = require('path');

async function runLoadTest() {
  console.log('🚀 DEX Load Testing Suite');
  console.log('==========================\n');

  // Get command line arguments
  const args = process.argv.slice(2);
  const testType = args[0] || 'light';
  const baseUrl = args[1] || 'http://localhost:3001';
  const outputDir = args[2] || './load-test-results';

  // Validate test type
  if (!TestConfigurations[testType]) {
    console.error(`❌ Invalid test type: ${testType}`);
    console.error(`Available types: ${Object.keys(TestConfigurations).join(', ')}`);
    process.exit(1);
  }

  const config = TestConfigurations[testType];
  console.log(`📊 Test Configuration: ${testType.toUpperCase()}`);
  console.log(`🎯 Target URL: ${baseUrl}`);
  console.log(`⚡ Max Concurrent: ${config.maxConcurrentRequests}`);
  console.log(`⏱️  Duration: ${config.duration / 1000}s`);
  console.log(`📈 Target RPS: ${config.requestsPerSecond}`);
  console.log(`🔄 Ramp-up Time: ${config.rampUpTime / 1000}s\n`);

  try {
    // Create load tester
    const loadTester = new LoadTester({
      baseUrl,
      ...config,
    });

    // Set up event listeners
    let lastStatsUpdate = Date.now();

    loadTester.on('test_started', () => {
      console.log('🟢 Load test started...\n');
    });

    loadTester.on('stats_update', (stats) => {
      const now = Date.now();
      if (now - lastStatsUpdate >= 5000) { // Update every 5 seconds
        const elapsedSec = stats.duration / 1000;
        console.log(`⏰ ${elapsedSec.toFixed(0)}s | ` +
                   `📊 ${stats.totalRequests} req | ` +
                   `✅ ${stats.successRate.toFixed(1)}% | ` +
                   `⚡ ${stats.requestsPerSecond.toFixed(1)} RPS | ` +
                   `🕐 ${stats.averageResponseTime.toFixed(0)}ms avg | ` +
                   `🔄 ${stats.concurrentRequests} active`);
        lastStatsUpdate = now;
      }
    });

    loadTester.on('test_completed', async (finalStats) => {
      console.log('\n🏁 Load test completed!\n');

      // Display summary
      console.log('📊 FINAL RESULTS SUMMARY');
      console.log('========================');
      console.log(`Duration: ${(finalStats.duration / 1000).toFixed(2)}s`);
      console.log(`Total Requests: ${finalStats.totalRequests.toLocaleString()}`);
      console.log(`Successful Requests: ${finalStats.successfulRequests.toLocaleString()}`);
      console.log(`Failed Requests: ${finalStats.failedRequests.toLocaleString()}`);
      console.log(`Success Rate: ${finalStats.successRate.toFixed(2)}%`);
      console.log(`Average RPS: ${finalStats.requestsPerSecond.toFixed(2)}`);
      console.log(`Average Response Time: ${finalStats.averageResponseTime.toFixed(2)}ms`);
      console.log(`Min Response Time: ${finalStats.minResponseTime}ms`);
      console.log(`Max Response Time: ${finalStats.maxResponseTime}ms`);

      // Response time percentiles
      if (Object.keys(finalStats.responseTimePercentiles).length > 0) {
        console.log('\n📈 Response Time Percentiles:');
        for (const [percentile, time] of Object.entries(finalStats.responseTimePercentiles)) {
          console.log(`  ${percentile}: ${time}ms`);
        }
      }

      // Status codes
      if (Object.keys(finalStats.statusCodes).length > 0) {
        console.log('\n📋 Status Code Distribution:');
        for (const [code, count] of Object.entries(finalStats.statusCodes)) {
          const percentage = ((count / finalStats.totalRequests) * 100).toFixed(1);
          console.log(`  ${code}: ${count} (${percentage}%)`);
        }
      }

      // Error analysis
      if (Object.keys(finalStats.errorTypes).length > 0) {
        console.log('\n❌ Error Analysis:');
        for (const [error, count] of Object.entries(finalStats.errorTypes)) {
          console.log(`  ${error}: ${count}`);
        }
      }

      // Concurrency stats
      console.log('\n🔄 Concurrency:');
      console.log(`  Peak Concurrent Requests: ${finalStats.maxConcurrentRequests}`);
      console.log(`  Configured Max: ${config.maxConcurrentRequests}`);

      // Performance assessment
      console.log('\n🎯 Performance Assessment:');
      if (finalStats.successRate >= 99) {
        console.log('  ✅ Excellent: Success rate > 99%');
      } else if (finalStats.successRate >= 95) {
        console.log('  ✅ Good: Success rate > 95%');
      } else if (finalStats.successRate >= 90) {
        console.log('  ⚠️  Warning: Success rate < 95%');
      } else {
        console.log('  ❌ Poor: Success rate < 90%');
      }

      if (finalStats.averageResponseTime <= 100) {
        console.log('  ✅ Excellent: Average response time ≤ 100ms');
      } else if (finalStats.averageResponseTime <= 500) {
        console.log('  ✅ Good: Average response time ≤ 500ms');
      } else if (finalStats.averageResponseTime <= 1000) {
        console.log('  ⚠️  Warning: Average response time > 500ms');
      } else {
        console.log('  ❌ Poor: Average response time > 1000ms');
      }

      if (finalStats.requestsPerSecond >= config.requestsPerSecond * 0.9) {
        console.log('  ✅ Target RPS achieved');
      } else {
        console.log('  ⚠️  Target RPS not fully achieved');
      }

      // Save results
      try {
        await fs.mkdir(outputDir, { recursive: true });

        // Save JSON report
        const jsonReport = loadTester.generateReport();
        const jsonPath = path.join(outputDir, `loadtest-${testType}-${Date.now()}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));
        console.log(`\n📄 JSON Report saved: ${jsonPath}`);

        // Save HTML report
        const htmlReport = loadTester.generateHTMLReport();
        const htmlPath = path.join(outputDir, `loadtest-${testType}-${Date.now()}.html`);
        await fs.writeFile(htmlPath, htmlReport);
        console.log(`📄 HTML Report saved: ${htmlPath}`);

        // Save CSV data for analysis
        const csvData = generateCSVReport(finalStats);
        const csvPath = path.join(outputDir, `loadtest-${testType}-${Date.now()}.csv`);
        await fs.writeFile(csvPath, csvData);
        console.log(`📄 CSV Data saved: ${csvPath}`);

      } catch (error) {
        console.error(`❌ Failed to save reports: ${error.message}`);
      }

      console.log('\n✅ Load test analysis completed successfully');
    });

    loadTester.on('test_stopped', () => {
      console.log('\n⏹️  Load test stopped by user');
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n⏹️  Received SIGINT, stopping load test...');
      loadTester.stopTest();
    });

    process.on('SIGTERM', () => {
      console.log('\n⏹️  Received SIGTERM, stopping load test...');
      loadTester.stopTest();
    });

    // Start the test
    await loadTester.startTest();

  } catch (error) {
    console.error('❌ Load test failed:', error.message);
    console.error('Make sure the server is running and accessible');
    process.exit(1);
  }
}

// Generate CSV report for further analysis
function generateCSVReport(stats) {
  const headers = [
    'Timestamp',
    'Test Type',
    'Duration (s)',
    'Total Requests',
    'Successful Requests',
    'Failed Requests',
    'Success Rate (%)',
    'Requests/Second',
    'Avg Response Time (ms)',
    'Min Response Time (ms)',
    'Max Response Time (ms)',
    'P50 (ms)',
    'P90 (ms)',
    'P95 (ms)',
    'P99 (ms)',
    'Max Concurrent',
  ];

  const values = [
    new Date().toISOString(),
    process.argv[2] || 'light',
    (stats.duration / 1000).toFixed(2),
    stats.totalRequests,
    stats.successfulRequests,
    stats.failedRequests,
    stats.successRate.toFixed(2),
    stats.requestsPerSecond.toFixed(2),
    stats.averageResponseTime.toFixed(2),
    stats.minResponseTime,
    stats.maxResponseTime,
    stats.responseTimePercentiles.p50 || 0,
    stats.responseTimePercentiles.p90 || 0,
    stats.responseTimePercentiles.p95 || 0,
    stats.responseTimePercentiles.p99 || 0,
    stats.maxConcurrentRequests,
  ];

  return headers.join(',') + '\n' + values.join(',') + '\n';
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('🚀 DEX Load Testing Suite');
  console.log('==========================\n');
  console.log('Usage: node loadtest.js [test-type] [base-url] [output-dir]');
  console.log('');
  console.log('Test Types:');
  console.log('  light  - Light load (10 concurrent, 5 RPS, 30s)');
  console.log('  medium - Medium load (50 concurrent, 25 RPS, 2m)');
  console.log('  heavy  - Heavy load (200 concurrent, 100 RPS, 5m)');
  console.log('  stress - Stress test (500 concurrent, 200 RPS, 10m)');
  console.log('');
  console.log('Examples:');
  console.log('  node loadtest.js light');
  console.log('  node loadtest.js medium http://localhost:3001');
  console.log('  node loadtest.js heavy http://localhost:3001 ./results');
  console.log('');
  console.log('Reports are saved in JSON, HTML, and CSV formats.');
  process.exit(0);
}

// Handle command line execution
if (require.main === module) {
  runLoadTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runLoadTest };