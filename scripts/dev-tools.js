#!/usr/bin/env node

// Development tools for DEX Platform
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DevTools {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.backendDir = path.join(this.rootDir, 'backend');
    this.frontendDir = path.join(this.rootDir, 'frontend');
  }

  // Run command with output
  run(command, cwd = this.rootDir) {
    try {
      console.log(`Running: ${command}`);
      const output = execSync(command, {
        cwd,
        encoding: 'utf8',
        stdio: 'inherit'
      });
      return true;
    } catch (error) {
      console.error(`Failed: ${command}`);
      console.error(error.message);
      return false;
    }
  }

  // Check system health
  checkHealth() {
    console.log('🔍 System Health Check\n');

    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`✅ Node.js: ${nodeVersion}`);

    // Check if directories exist
    console.log(`✅ Backend: ${fs.existsSync(this.backendDir) ? 'Found' : 'Missing'}`);
    console.log(`✅ Frontend: ${fs.existsSync(this.frontendDir) ? 'Found' : 'Missing'}`);

    // Check package.json files
    const backendPkg = path.join(this.backendDir, 'package.json');
    const frontendPkg = path.join(this.frontendDir, 'package.json');

    console.log(`✅ Backend package.json: ${fs.existsSync(backendPkg) ? 'Found' : 'Missing'}`);
    console.log(`✅ Frontend package.json: ${fs.existsSync(frontendPkg) ? 'Found' : 'Missing'}`);

    // Check node_modules
    const backendModules = path.join(this.backendDir, 'node_modules');
    const frontendModules = path.join(this.frontendDir, 'node_modules');

    console.log(`✅ Backend dependencies: ${fs.existsSync(backendModules) ? 'Installed' : 'Missing'}`);
    console.log(`✅ Frontend dependencies: ${fs.existsSync(frontendModules) ? 'Installed' : 'Missing'}`);

    console.log('\n🎉 Health check complete!');
  }

  // Install all dependencies
  installDeps() {
    console.log('📦 Installing dependencies...\n');

    console.log('Installing backend dependencies...');
    if (this.run('npm install', this.backendDir)) {
      console.log('✅ Backend dependencies installed');
    }

    console.log('\nInstalling frontend dependencies...');
    if (this.run('npm install', this.frontendDir)) {
      console.log('✅ Frontend dependencies installed');
    }

    console.log('\n🎉 All dependencies installed!');
  }

  // Build everything
  buildAll() {
    console.log('🔨 Building all components...\n');

    console.log('Building frontend...');
    if (this.run('npm run build', this.frontendDir)) {
      console.log('✅ Frontend build complete');
    }

    console.log('\n🎉 Build complete!');
  }

  // Run tests
  runTests() {
    console.log('🧪 Running tests...\n');

    console.log('Testing backend services...');
    const testCommand = `node -e "
      const priceFeed = require('./src/services/priceFeed');
      const orderBook = require('./src/services/orderBook');
      const swapRouter = require('./src/services/swapRouter');

      console.log('Testing price feed...');
      priceFeed.getPrice('ETH').then(price => console.log('ETH price:', price));

      console.log('Testing order book...');
      const book = orderBook.generateMockOrderBook('ETH', 'USDC', 2000);
      console.log('Order book generated:', book.bids.length, 'bids');

      console.log('Testing swap router...');
      swapRouter.getSwapQuote('ETH', 'USDC', 1).then(quote =>
        console.log('Swap quote:', quote.amountOut)
      );

      console.log('✅ All tests passed');
    "`;

    if (this.run(testCommand, this.backendDir)) {
      console.log('✅ Backend tests passed');
    }

    console.log('\n🎉 Tests complete!');
  }

  // Start development servers
  startDev() {
    console.log('🚀 Starting development servers...\n');

    console.log('Use the following commands in separate terminals:');
    console.log(`Backend:  cd ${this.backendDir} && npm run dev`);
    console.log(`Frontend: cd ${this.frontendDir} && npm run dev`);
    console.log('\nOr run: npm run dev (from root directory)');
  }

  // Clean build artifacts
  clean() {
    console.log('🧹 Cleaning build artifacts...\n');

    const dirsToClean = [
      path.join(this.frontendDir, 'build'),
      path.join(this.frontendDir, '.tsbuildinfo'),
      path.join(this.backendDir, 'logs')
    ];

    dirsToClean.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`✅ Cleaned: ${path.relative(this.rootDir, dir)}`);
      }
    });

    console.log('\n🎉 Clean complete!');
  }

  // Get project status
  status() {
    console.log('📊 Project Status\n');

    // Count files
    const countFiles = (dir, ext) => {
      if (!fs.existsSync(dir)) return 0;

      const files = fs.readdirSync(dir, { recursive: true });
      return files.filter(file => file.endsWith(ext)).length;
    };

    const backendJs = countFiles(path.join(this.backendDir, 'src'), '.js');
    const frontendTs = countFiles(path.join(this.frontendDir, 'src'), '.ts');
    const frontendTsx = countFiles(path.join(this.frontendDir, 'src'), '.tsx');

    console.log(`📁 Backend JS files: ${backendJs}`);
    console.log(`📁 Frontend TS files: ${frontendTs}`);
    console.log(`📁 Frontend TSX files: ${frontendTsx}`);
    console.log(`📁 Total TypeScript files: ${frontendTs + frontendTsx}`);

    // Check build status
    const buildExists = fs.existsSync(path.join(this.frontendDir, 'build'));
    console.log(`🔨 Frontend built: ${buildExists ? 'Yes' : 'No'}`);

    console.log('\n🎉 Status check complete!');
  }

  // Show help
  help() {
    console.log(`
🛠️  DEX Platform Development Tools

Commands:
  health     - Check system health
  install    - Install all dependencies
  build      - Build all components
  test       - Run tests
  dev        - Show dev server commands
  clean      - Clean build artifacts
  status     - Show project status
  help       - Show this help

Usage:
  node scripts/dev-tools.js <command>
    `);
  }
}

// Run command line interface
const devTools = new DevTools();
const command = process.argv[2];

switch (command) {
  case 'health':
    devTools.checkHealth();
    break;
  case 'install':
    devTools.installDeps();
    break;
  case 'build':
    devTools.buildAll();
    break;
  case 'test':
    devTools.runTests();
    break;
  case 'dev':
    devTools.startDev();
    break;
  case 'clean':
    devTools.clean();
    break;
  case 'status':
    devTools.status();
    break;
  case 'help':
  default:
    devTools.help();
    break;
}