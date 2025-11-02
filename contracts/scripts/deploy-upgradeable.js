const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Deploying AutomatedMarketMakerV2 with UUPS proxy...");

  // Get deployment parameters from environment
  const priceOracleAddress = process.env.PRICE_ORACLE_ADDRESS || ethers.ZeroAddress;
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || (await ethers.getSigners())[0].address;

  console.log("Price Oracle:", priceOracleAddress);
  console.log("Fee Recipient:", feeRecipient);

  // Deploy the contract using UUPS proxy
  const AutomatedMarketMakerV2 = await ethers.getContractFactory("AutomatedMarketMakerV2");

  const ammProxy = await upgrades.deployProxy(
    AutomatedMarketMakerV2,
    [priceOracleAddress, feeRecipient],
    {
      kind: 'uups',
      initializer: 'initialize',
      timeout: 0
    }
  );

  await ammProxy.waitForDeployment();

  const proxyAddress = await ammProxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("✅ AutomatedMarketMakerV2 deployed successfully!");
  console.log("📍 Proxy Address:", proxyAddress);
  console.log("📍 Implementation Address:", implementationAddress);
  console.log("📍 Admin Address:", await upgrades.erc1967.getAdminAddress(proxyAddress));

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  const protocolFee = await ammProxy.protocolFee();
  const nextStrategyId = await ammProxy.nextStrategyId();

  console.log("Protocol Fee:", protocolFee.toString(), "basis points");
  console.log("Next Strategy ID:", nextStrategyId.toString());

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    proxy: proxyAddress,
    implementation: implementationAddress,
    admin: await upgrades.erc1967.getAdminAddress(proxyAddress),
    priceOracle: priceOracleAddress,
    feeRecipient: feeRecipient,
    deployedAt: new Date().toISOString(),
    deployer: (await ethers.getSigners())[0].address
  };

  const fs = require('fs');
  const path = require('path');
  const deploymentsDir = path.join(__dirname, '../deployments');

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentsDir, 'AutomatedMarketMakerV2.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾 Deployment info saved to deployments/AutomatedMarketMakerV2.json");

  return {
    proxy: ammProxy,
    proxyAddress,
    implementationAddress
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
