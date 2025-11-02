const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);
  console.log(
    'Account balance:',
    (await deployer.provider.getBalance(deployer.address)).toString()
  );

  const MainnetDEX = await hre.ethers.getContractFactory('MainnetDEX');
  console.log('Deploying MainnetDEX...');

  const dex = await MainnetDEX.deploy();
  await dex.waitForDeployment();

  const dexAddress = await dex.getAddress();
  console.log('MainnetDEX deployed to:', dexAddress);

  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contracts: {
      MainnetDEX: {
        address: dexAddress,
        deployer: deployer.address,
        deploymentTx: dex.deploymentTransaction()?.hash,
        timestamp: new Date().toISOString(),
      },
    },
  };

  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: ${deploymentFile}`);

  const artifactsDir = path.join(
    __dirname,
    '../artifacts/contracts/MainnetDEX.sol'
  );
  const frontendContractsDir = path.join(
    __dirname,
    '../../frontend/src/contracts'
  );

  if (fs.existsSync(artifactsDir)) {
    if (!fs.existsSync(frontendContractsDir)) {
      fs.mkdirSync(frontendContractsDir, { recursive: true });
    }

    const artifact = JSON.parse(
      fs.readFileSync(path.join(artifactsDir, 'MainnetDEX.json'), 'utf8')
    );
    const contractInfo = {
      address: dexAddress,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      network: hre.network.name,
      chainId: hre.network.config.chainId,
    };

    fs.writeFileSync(
      path.join(frontendContractsDir, 'MainnetDEX.json'),
      JSON.stringify(contractInfo, null, 2)
    );

    console.log('Contract ABI and address copied to frontend');
  }

  if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
    console.log('Waiting for block confirmations...');
    await dex.deploymentTransaction()?.wait(6);

    try {
      await hre.run('verify:verify', {
        address: dexAddress,
        constructorArguments: [],
      });
      console.log('Contract verified on Etherscan');
    } catch (error) {
      console.log('Verification failed:', error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
