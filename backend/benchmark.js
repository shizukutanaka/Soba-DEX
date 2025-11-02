#!/usr/bin/env node

const { DEXBenchmarks } = require('./src/utils/performanceBenchmark');
const fs = require('fs').promises;
const path = require('path');

async function runBenchmark() {
  console.log('🎯 DEX Performance Benchmark Suite');
  console.log('=====================================\n');

  // Get command line arguments
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3001';
  const outputFile = args[1];

  console.log(`Target URL: ${baseUrl}`);
  console.log(`Concurrency: 10 requests`);
  console.log(`Duration: 30 seconds\n`);

  try {
    // Create benchmark instance
    const dexBenchmarks = new DEXBenchmarks();

    // Run all benchmark suites
    const results = await dexBenchmarks.runAllBenchmarks();

    // Generate summary
    const totalBenchmarks = results.reduce((sum, suite) => sum + suite.benchmarks.length, 0);
    const totalTime = results.reduce((sum, suite) => sum + suite.totalTime, 0);
    const avgOpsPerSec = results.reduce((sum, suite) => {
      const suiteAvg = suite.benchmarks.reduce((s, b) => s + b.opsPerSecond, 0) / suite.benchmarks.length;
      return sum + suiteAvg;
    }, 0) / results.length;

    // Display summary
    console.log('\n📊 BENCHMARK RESULTS SUMMARY');
    console.log('============================');
    console.log(`Total Benchmark Suites: ${results.length}`);
    console.log(`Total Benchmarks: ${totalBenchmarks}`);
    console.log(`Total Execution Time: ${totalTime.toFixed(2)}ms`);
    console.log(`Average Operations/Second: ${Math.round(avgOpsPerSec).toLocaleString()}`);

    // Display detailed results
    for (const suite of results) {
      console.log(`\n📈 ${suite.suite}:`);
      for (const benchmark of suite.benchmarks) {
        console.log(`  ${benchmark.name}: ${benchmark.opsPerSecond.toLocaleString()} ops/sec (${benchmark.averageTime}ms avg)`);
      }
    }

    // Generate HTML report
    const htmlReport = dexBenchmarks.benchmark.generateHTMLReport();

    // Save results
    if (outputFile) {
      const outputPath = path.resolve(outputFile);
      await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n📄 Detailed results saved to: ${outputPath}`);
    }

    // Save HTML report
    const reportPath = path.resolve('benchmark-report.html');
    await fs.writeFile(reportPath, htmlReport);
    console.log(`📄 HTML Report saved to: ${reportPath}`);

    console.log('\n✅ Benchmark completed successfully');
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    console.error('Make sure the server is running and accessible');
    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  runBenchmark().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
