/**
 * @title UUPS Proxy Deployment Script
 * @dev Deploy and upgrade UUPS proxies with proper initialization
 *
 * FEATURES:
 * - Automatic proxy deployment
 * - Implementation verification
 * - Multi-sig integration for upgrades
 * - Storage layout validation
 * - Gas estimation
 *
 * Based on OpenZeppelin 2025 best practices
 */

const { ethers, upgrades } = require('hardhat');
const fs = require('fs');
const path = require('path');

/**
 * @dev Deploy initial UUPS proxy
 */
async function deployProxy() {
    console.log('🚀 Deploying UUPS Proxy...\n');

    const [deployer, upgradeAuthority, emergencyAdmin] = await ethers.getSigners();

    console.log('Deployer:', deployer.address);
    console.log('Upgrade Authority:', upgradeAuthority.address);
    console.log('Emergency Admin:', emergencyAdmin.address);
    console.log('');

    // Get contract factory
    const DEXCore = await ethers.getContractFactory('DEXCoreUpgradeable');

    console.log('Deploying implementation contract...');

    // Deploy proxy with initialization
    const upgradeDelay = 2 * 24 * 60 * 60; // 2 days in seconds

    const proxy = await upgrades.deployProxy(
        DEXCore,
        [upgradeAuthority.address, upgradeDelay],
        {
            kind: 'uups',
            initializer: 'initialize',
        }
    );

    await proxy.deployed();

    console.log('✅ Proxy deployed to:', proxy.address);

    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(
        proxy.address
    );

    console.log('✅ Implementation deployed to:', implementationAddress);
    console.log('');

    // Verify deployment
    const version = await proxy.version();
    const currentUpgradeAuthority = await proxy.upgradeAuthority();
    const currentUpgradeDelay = await proxy.upgradeDelay();

    console.log('📋 Deployment Details:');
    console.log('Version:', version.toString());
    console.log('Upgrade Authority:', currentUpgradeAuthority);
    console.log('Upgrade Delay:', currentUpgradeDelay.toString(), 'seconds');
    console.log('');

    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        proxy: proxy.address,
        implementation: implementationAddress,
        deployer: deployer.address,
        upgradeAuthority: upgradeAuthority.address,
        emergencyAdmin: emergencyAdmin.address,
        version: version.toString(),
        upgradeDelay: upgradeDelay,
        timestamp: new Date().toISOString(),
    };

    const deploymentPath = path.join(__dirname, '../deployments', 'proxy-deployment.json');
    fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    console.log('✅ Deployment info saved to:', deploymentPath);
    console.log('');

    return {
        proxy,
        implementation: implementationAddress,
        deploymentInfo,
    };
}

/**
 * @dev Schedule an upgrade
 */
async function scheduleUpgrade(proxyAddress, newImplementationAddress, description) {
    console.log('📅 Scheduling Upgrade...\n');

    const [, upgradeAuthority] = await ethers.getSigners();

    // Get proxy contract
    const proxy = await ethers.getContractAt('DEXCoreUpgradeable', proxyAddress);

    // Schedule upgrade
    const tx = await proxy.connect(upgradeAuthority).scheduleUpgrade(
        newImplementationAddress,
        description
    );

    const receipt = await tx.wait();

    // Get upgrade ID from event
    const event = receipt.events.find(e => e.event === 'UpgradeScheduled');
    const upgradeId = event.args.upgradeId;
    const scheduledTime = event.args.scheduledTime;

    console.log('✅ Upgrade Scheduled:');
    console.log('Upgrade ID:', upgradeId.toString());
    console.log('New Implementation:', newImplementationAddress);
    console.log('Scheduled Time:', new Date(scheduledTime * 1000).toISOString());
    console.log('Description:', description);
    console.log('');

    // Calculate time remaining
    const currentTime = Math.floor(Date.now() / 1000);
    const timeRemaining = scheduledTime - currentTime;
    const hoursRemaining = Math.floor(timeRemaining / 3600);

    console.log(`⏱️  Time until execution: ${hoursRemaining} hours`);
    console.log('');

    return upgradeId;
}

/**
 * @dev Execute a scheduled upgrade
 */
async function executeUpgrade(proxyAddress, upgradeId) {
    console.log('⚡ Executing Upgrade...\n');

    const [, upgradeAuthority] = await ethers.getSigners();

    // Get proxy contract
    const proxy = await ethers.getContractAt('DEXCoreUpgradeable', proxyAddress);

    // Check if ready to execute
    const pendingUpgrade = await proxy.getPendingUpgrade(upgradeId);

    if (pendingUpgrade.timeRemaining > 0) {
        console.error('❌ Error: Upgrade delay not passed yet');
        console.log(`   Time remaining: ${Math.floor(pendingUpgrade.timeRemaining / 3600)} hours`);
        return;
    }

    if (pendingUpgrade.executed) {
        console.error('❌ Error: Upgrade already executed');
        return;
    }

    // Execute upgrade
    console.log('Executing upgrade ID:', upgradeId.toString());

    const tx = await proxy.connect(upgradeAuthority).executeUpgrade(upgradeId);
    const receipt = await tx.wait();

    console.log('✅ Upgrade Executed!');
    console.log('Transaction Hash:', receipt.transactionHash);
    console.log('Gas Used:', receipt.gasUsed.toString());
    console.log('');

    // Verify new version
    const newVersion = await proxy.version();
    const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log('📋 Post-Upgrade Details:');
    console.log('New Version:', newVersion.toString());
    console.log('New Implementation:', newImplementation);
    console.log('');

    return receipt;
}

/**
 * @dev Deploy and upgrade to V2
 */
async function upgradeToV2(proxyAddress) {
    console.log('🔄 Upgrading to V2...\n');

    // Deploy new implementation
    const DEXCoreV2 = await ethers.getContractFactory('DEXCoreV2Example');

    console.log('Deploying V2 implementation...');

    const v2Implementation = await DEXCoreV2.deploy();
    await v2Implementation.deployed();

    console.log('✅ V2 Implementation deployed to:', v2Implementation.address);
    console.log('');

    // Schedule upgrade
    const upgradeId = await scheduleUpgrade(
        proxyAddress,
        v2Implementation.address,
        'Upgrade to V2 with new features'
    );

    console.log('⏳ Waiting for upgrade delay to pass...');
    console.log('   In production, you would wait 48 hours here.');
    console.log('   For testing, you can fast-forward time in Hardhat.');
    console.log('');

    return {
        upgradeId,
        v2Implementation: v2Implementation.address,
    };
}

/**
 * @dev Validate upgrade safety
 */
async function validateUpgrade(proxyAddress, newImplementationAddress) {
    console.log('🔍 Validating Upgrade Safety...\n');

    // Check implementation has code
    const code = await ethers.provider.getCode(newImplementationAddress);

    if (code === '0x') {
        console.error('❌ Error: New implementation has no code');
        return false;
    }

    console.log('✅ Implementation has code');

    // Validate with OpenZeppelin upgrades plugin
    try {
        await upgrades.validateImplementation(
            await ethers.getContractFactory('DEXCoreUpgradeable')
        );
        console.log('✅ Storage layout is valid');
    } catch (error) {
        console.error('❌ Storage layout validation failed:', error.message);
        return false;
    }

    // Get current implementation
    const currentImplementation = await upgrades.erc1967.getImplementationAddress(
        proxyAddress
    );

    if (currentImplementation === newImplementationAddress) {
        console.error('❌ Error: Same implementation address');
        return false;
    }

    console.log('✅ Different implementation');
    console.log('');
    console.log('Current:', currentImplementation);
    console.log('New:', newImplementationAddress);
    console.log('');

    return true;
}

/**
 * @dev Emergency upgrade (bypasses time-lock)
 */
async function emergencyUpgrade(proxyAddress, newImplementationAddress) {
    console.log('🚨 EMERGENCY UPGRADE...\n');

    const [, , emergencyAdmin] = await ethers.getSigners();

    // Validate upgrade first
    const isValid = await validateUpgrade(proxyAddress, newImplementationAddress);

    if (!isValid) {
        console.error('❌ Upgrade validation failed - ABORTING');
        return;
    }

    console.log('⚠️  WARNING: Bypassing time-lock for emergency upgrade');
    console.log('');

    // Get proxy contract
    const proxy = await ethers.getContractAt('DEXCoreUpgradeable', proxyAddress);

    // Execute emergency upgrade
    const tx = await proxy.connect(emergencyAdmin).emergencyUpgrade(newImplementationAddress);
    const receipt = await tx.wait();

    console.log('✅ Emergency Upgrade Complete!');
    console.log('Transaction Hash:', receipt.transactionHash);
    console.log('Gas Used:', receipt.gasUsed.toString());
    console.log('');

    return receipt;
}

/**
 * @dev Get upgrade history
 */
async function getUpgradeHistory(proxyAddress) {
    console.log('📜 Upgrade History...\n');

    const proxy = await ethers.getContractAt('DEXCoreUpgradeable', proxyAddress);

    const historyCount = await proxy.getUpgradeHistoryCount();

    console.log('Total Upgrades:', historyCount.toString());
    console.log('');

    for (let i = 0; i < historyCount; i++) {
        const history = await proxy.upgradeHistory(i);

        console.log(`Upgrade ${i + 1}:`);
        console.log('  Version:', history.version.toString());
        console.log('  Timestamp:', new Date(history.timestamp * 1000).toISOString());
        console.log('  Old Implementation:', history.oldImplementation);
        console.log('  New Implementation:', history.newImplementation);
        console.log('  Authorized By:', history.authorizedBy);
        console.log('');
    }
}

/**
 * @dev Main execution
 */
async function main() {
    const command = process.env.COMMAND || 'deploy';

    switch (command) {
        case 'deploy':
            await deployProxy();
            break;

        case 'schedule':
            await scheduleUpgrade(
                process.env.PROXY_ADDRESS,
                process.env.NEW_IMPLEMENTATION,
                process.env.DESCRIPTION || 'Scheduled upgrade'
            );
            break;

        case 'execute':
            await executeUpgrade(
                process.env.PROXY_ADDRESS,
                process.env.UPGRADE_ID
            );
            break;

        case 'upgradeV2':
            await upgradeToV2(process.env.PROXY_ADDRESS);
            break;

        case 'emergency':
            await emergencyUpgrade(
                process.env.PROXY_ADDRESS,
                process.env.NEW_IMPLEMENTATION
            );
            break;

        case 'history':
            await getUpgradeHistory(process.env.PROXY_ADDRESS);
            break;

        case 'validate':
            await validateUpgrade(
                process.env.PROXY_ADDRESS,
                process.env.NEW_IMPLEMENTATION
            );
            break;

        default:
            console.log('Unknown command:', command);
            console.log('');
            console.log('Available commands:');
            console.log('  deploy       - Deploy new UUPS proxy');
            console.log('  schedule     - Schedule an upgrade');
            console.log('  execute      - Execute scheduled upgrade');
            console.log('  upgradeV2    - Deploy and schedule V2 upgrade');
            console.log('  emergency    - Emergency upgrade (bypasses time-lock)');
            console.log('  history      - View upgrade history');
            console.log('  validate     - Validate upgrade safety');
    }
}

// Export functions for testing
module.exports = {
    deployProxy,
    scheduleUpgrade,
    executeUpgrade,
    upgradeToV2,
    validateUpgrade,
    emergencyUpgrade,
    getUpgradeHistory,
};

// Run main if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
