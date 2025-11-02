const { ethers, upgrades } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Upgrading AutomatedMarketMakerV2...");

  // Load existing deployment
  const deploymentPath = path.join(__dirname, '../deployments/AutomatedMarketMakerV2.json');

  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployment file not found. Deploy the contract first.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const proxyAddress = deployment.proxy;

  console.log("Current Proxy Address:", proxyAddress);
  console.log("Current Implementation:", deployment.implementation);

  // Get the new implementation
  const AutomatedMarketMakerV2 = await ethers.getContractFactory("AutomatedMarketMakerV2");

  console.log("\n⏳ Preparing upgrade...");

  // Validate the upgrade
  await upgrades.validateUpgrade(proxyAddress, AutomatedMarketMakerV2);
  console.log("✅ Upgrade validation passed");

  // Queue the upgrade (in production, this should use the timelock)
  console.log("\n⚠️  IMPORTANT: In production, this upgrade should be queued via queueUpgrade()");
  console.log("⚠️  And executed after the timelock period using executeQueuedUpgrade()");

  const upgradeChoice = process.env.FORCE_UPGRADE || 'no';

  if (upgradeChoice.toLowerCase() === 'yes') {
    console.log("\n⏳ Upgrading proxy to new implementation...");

    const upgraded = await upgrades.upgradeProxy(proxyAddress, AutomatedMarketMakerV2);
    await upgraded.waitForDeployment();

    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("✅ Upgrade successful!");
    console.log("📍 Proxy Address (unchanged):", proxyAddress);
    console.log("📍 New Implementation Address:", newImplementationAddress);

    // Update deployment info
    deployment.implementation = newImplementationAddress;
    deployment.upgradedAt = new Date().toISOString();
    deployment.previousImplementations = deployment.previousImplementations || [];
    deployment.previousImplementations.push({
      address: deployment.implementation,
      upgradedAt: deployment.upgradedAt
    });

    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log("\n💾 Deployment info updated");

    return {
      proxyAddress,
      newImplementationAddress,
      oldImplementationAddress: deployment.implementation
    };
  } else {
    console.log("\n⚠️  Upgrade not executed. Set FORCE_UPGRADE=yes to proceed.");
    console.log("📋 To upgrade in production:");
    console.log("1. Call queueUpgrade(newImplementationAddress) on the contract");
    console.log("2. Wait for timelock period (2 days)");
    console.log("3. Call executeQueuedUpgrade(txHash)");

    return {
      proxyAddress,
      validationPassed: true,
      note: "Upgrade not executed - validation only"
    };
  }
}

main()
  .then((result) => {
    console.log("\n📊 Result:", JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
