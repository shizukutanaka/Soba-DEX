# E2E Testing Setup Guide

## Quick Start

```bash
# Install Playwright
npm install -D @playwright/test

# Initialize Playwright
npx playwright install

# Run tests
npx playwright test
```

## Test Structure

```
e2e/
├── tests/
│   ├── auth.spec.ts          # Authentication flows
│   ├── trading.spec.ts        # Trading operations
│   ├── wallet.spec.ts         # Wallet connections
│   └── performance.spec.ts    # Performance tests
├── fixtures/
│   └── test-data.json         # Test data
├── playwright.config.ts       # Playwright configuration
└── setup.md                   # This file
```

## Example Test

```typescript
// e2e/tests/trading.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Trading Flow', () => {
  test('should complete a swap', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:3000');

    // Connect wallet (mock)
    await page.click('[data-testid="connect-wallet"]');

    // Select tokens
    await page.fill('[data-testid="token-in"]', 'ETH');
    await page.fill('[data-testid="token-out"]', 'USDT');

    // Enter amount
    await page.fill('[data-testid="amount"]', '1.0');

    // Check price
    const price = await page.textContent('[data-testid="price"]');
    expect(price).toBeTruthy();

    // Execute swap
    await page.click('[data-testid="swap-button"]');

    // Confirm transaction
    await page.waitForSelector('[data-testid="success-message"]');
    expect(await page.textContent('[data-testid="success-message"]'))
      .toContain('Swap successful');
  });

  test('should handle errors gracefully', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Try to swap without wallet
    await page.click('[data-testid="swap-button"]');

    // Should show error
    await page.waitForSelector('[data-testid="error-message"]');
    expect(await page.textContent('[data-testid="error-message"]'))
      .toContain('Please connect wallet');
  });
});
```

## Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Test Scenarios

### Authentication
- [ ] User registration
- [ ] User login
- [ ] Logout
- [ ] Password reset
- [ ] Session persistence

### Trading
- [ ] Token swap
- [ ] Add liquidity
- [ ] Remove liquidity
- [ ] Order history
- [ ] Price charts

### Wallet
- [ ] Connect MetaMask
- [ ] Disconnect wallet
- [ ] Switch network
- [ ] Account balance display
- [ ] Transaction signing

### Performance
- [ ] Page load time < 3s
- [ ] Swap execution < 5s
- [ ] Chart rendering smooth
- [ ] No memory leaks

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Color contrast
- [ ] ARIA labels

## Running Tests

```bash
# All tests
npx playwright test

# Specific test
npx playwright test trading.spec.ts

# Headed mode (see browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug

# UI mode
npx playwright test --ui

# Generate report
npx playwright show-report
```

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

1. **Use data-testid attributes**
   ```tsx
   <button data-testid="swap-button">Swap</button>
   ```

2. **Wait for elements**
   ```typescript
   await page.waitForSelector('[data-testid="success"]');
   ```

3. **Mock external services**
   ```typescript
   await page.route('**/api/**', route => route.fulfill({
     status: 200,
     body: JSON.stringify({ success: true })
   }));
   ```

4. **Test user flows, not implementation**
   - Focus on user experience
   - Test complete workflows
   - Avoid testing internal state

5. **Keep tests independent**
   - Each test should be self-contained
   - Clean up after tests
   - Use fixtures for common setup

## Debugging

```bash
# VS Code extension
# Install: Playwright Test for VSCode

# Debug in VS Code
# Click on test name → Right click → Debug Test

# Playwright Inspector
npx playwright test --debug

# Trace viewer
npx playwright show-trace trace.zip
```

## Next Steps

1. Install Playwright: `npm install -D @playwright/test`
2. Create test files in `e2e/tests/`
3. Add data-testid attributes to components
4. Run tests: `npx playwright test`
5. Review reports: `npx playwright show-report`
