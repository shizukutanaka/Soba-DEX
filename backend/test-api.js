const http = require('http');

function testEndpoint(path, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3003' + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ ${path}: ${res.statusCode}`);
        if (res.statusCode === expectedStatus) {
          try {
            const jsonData = JSON.parse(data);
            console.log(`   Response: ${JSON.stringify(jsonData, null, 2)}`);
          } catch (e) {
            console.log(`   Response: ${data}`);
          }
        } else {
          console.log(`   Error: ${data}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${path}: Connection failed - ${err.message}`);
      resolve();
    });

    req.setTimeout(5000, () => {
      console.log(`⏰ ${path}: Timeout`);
      req.destroy();
      resolve();
    });
  });
}

async function runTests() {
  console.log('🧪 DEX API Test Suite');
  console.log('====================');

  const endpoints = [
    '/api/health',
    '/api/dex',
    '/api/dex/prices/ETH',
    '/api/dex/market/ETH',
    '/api/dex/trading/orderbook/ETH-USDC'
  ];

  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  }

  console.log('✅ All tests completed');
}

runTests().catch(console.error);
