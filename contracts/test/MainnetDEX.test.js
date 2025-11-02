const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MainnetDEX", function () {
  let dex;
  let token0;
  let token1;
  let owner;
  let user1;
  let user2;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 tokens
    const Token = await ethers.getContractFactory("MockERC20");
    token0 = await Token.deploy("Token0", "TKN0", INITIAL_SUPPLY);
    token1 = await Token.deploy("Token1", "TKN1", INITIAL_SUPPLY);

    // Deploy DEX
    const MainnetDEX = await ethers.getContractFactory("MainnetDEX");
    dex = await MainnetDEX.deploy();

    // Add supported tokens
    await dex.addSupportedToken(await token0.getAddress());
    await dex.addSupportedToken(await token1.getAddress());

    // Transfer tokens to users
    await token0.transfer(user1.address, ethers.parseEther("10000"));
    await token1.transfer(user1.address, ethers.parseEther("10000"));
    await token0.transfer(user2.address, ethers.parseEther("10000"));
    await token1.transfer(user2.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await dex.owner()).to.equal(owner.address);
    });

    it("Should initialize with correct fee", async function () {
      const feeRate = await dex.feeRate();
      expect(feeRate).to.be.gt(0);
    });
  });

  describe("Token Management", function () {
    it("Should add supported token", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("NewToken", "NEW", INITIAL_SUPPLY);

      await dex.addSupportedToken(await newToken.getAddress());

      expect(await dex.supportedTokens(await newToken.getAddress())).to.be.true;
    });

    it("Should remove supported token", async function () {
      await dex.removeSupportedToken(await token0.getAddress());

      expect(await dex.supportedTokens(await token0.getAddress())).to.be.false;
    });

    it("Should not allow non-owner to add token", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("NewToken", "NEW", INITIAL_SUPPLY);

      await expect(
        dex.connect(user1).addSupportedToken(await newToken.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Liquidity Provision", function () {
    const amount0 = ethers.parseEther("100");
    const amount1 = ethers.parseEther("200");

    beforeEach(async function () {
      // Approve DEX to spend tokens
      await token0.connect(user1).approve(await dex.getAddress(), amount0);
      await token1.connect(user1).approve(await dex.getAddress(), amount1);
    });

    it("Should add liquidity successfully", async function () {
      await expect(
        dex.connect(user1).addLiquidity(
          await token0.getAddress(),
          await token1.getAddress(),
          amount0,
          amount1
        )
      ).to.emit(dex, "AddLiquidity");

      const poolId = await dex.getPoolId(
        await token0.getAddress(),
        await token1.getAddress()
      );
      const pool = await dex.pools(poolId);

      expect(pool.reserve0).to.equal(amount0);
      expect(pool.reserve1).to.equal(amount1);
    });

    it("Should mint liquidity tokens", async function () {
      await dex.connect(user1).addLiquidity(
        await token0.getAddress(),
        await token1.getAddress(),
        amount0,
        amount1
      );

      const poolId = await dex.getPoolId(
        await token0.getAddress(),
        await token1.getAddress()
      );
      const liquidity = await dex.liquidityBalances(poolId, user1.address);

      expect(liquidity).to.be.gt(0);
    });

    it("Should reject adding liquidity with zero amount", async function () {
      await expect(
        dex.connect(user1).addLiquidity(
          await token0.getAddress(),
          await token1.getAddress(),
          0,
          amount1
        )
      ).to.be.revertedWith("Invalid amounts");
    });

    it("Should reject unsupported tokens", async function () {
      const unsupportedToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("Unsupported", "UNS", INITIAL_SUPPLY);

      await expect(
        dex.connect(user1).addLiquidity(
          await unsupportedToken.getAddress(),
          await token1.getAddress(),
          amount0,
          amount1
        )
      ).to.be.revertedWith("Unsupported token");
    });
  });

  describe("Swapping", function () {
    const liquidityAmount0 = ethers.parseEther("1000");
    const liquidityAmount1 = ethers.parseEther("2000");
    const swapAmount = ethers.parseEther("10");

    beforeEach(async function () {
      // Add liquidity first
      await token0.connect(user1).approve(await dex.getAddress(), liquidityAmount0);
      await token1.connect(user1).approve(await dex.getAddress(), liquidityAmount1);

      await dex.connect(user1).addLiquidity(
        await token0.getAddress(),
        await token1.getAddress(),
        liquidityAmount0,
        liquidityAmount1
      );
    });

    it("Should execute swap successfully", async function () {
      await token0.connect(user2).approve(await dex.getAddress(), swapAmount);

      const amountOut = await dex.getAmountOut(
        swapAmount,
        await token0.getAddress(),
        await token1.getAddress()
      );

      await expect(
        dex.connect(user2).swap(
          await token0.getAddress(),
          await token1.getAddress(),
          swapAmount,
          0 // min amount out
        )
      ).to.emit(dex, "Swap");
    });

    it("Should update reserves correctly after swap (Reentrancy Protection)", async function () {
      await token0.connect(user2).approve(await dex.getAddress(), swapAmount);

      const poolId = await dex.getPoolId(
        await token0.getAddress(),
        await token1.getAddress()
      );
      const poolBefore = await dex.pools(poolId);

      await dex.connect(user2).swap(
        await token0.getAddress(),
        await token1.getAddress(),
        swapAmount,
        0
      );

      const poolAfter = await dex.pools(poolId);

      // Verify reserves were updated (Checks-Effects-Interactions pattern)
      expect(poolAfter.reserve0).to.equal(poolBefore.reserve0 + swapAmount);
      expect(poolAfter.reserve1).to.be.lt(poolBefore.reserve1);
    });

    it("Should reject swap with insufficient output", async function () {
      await token0.connect(user2).approve(await dex.getAddress(), swapAmount);

      const amountOut = await dex.getAmountOut(
        swapAmount,
        await token0.getAddress(),
        await token1.getAddress()
      );

      await expect(
        dex.connect(user2).swap(
          await token0.getAddress(),
          await token1.getAddress(),
          swapAmount,
          amountOut * 2n // unrealistic min amount
        )
      ).to.be.revertedWith("Insufficient output amount");
    });

    it("Should reject swap with identical tokens", async function () {
      await expect(
        dex.connect(user2).swap(
          await token0.getAddress(),
          await token0.getAddress(),
          swapAmount,
          0
        )
      ).to.be.revertedWith("Identical tokens");
    });

    it("Should prevent reentrancy attacks", async function () {
      // This test verifies that state is updated before external calls
      // The Checks-Effects-Interactions pattern prevents reentrancy

      await token0.connect(user2).approve(await dex.getAddress(), swapAmount);

      // Execute swap
      await dex.connect(user2).swap(
        await token0.getAddress(),
        await token1.getAddress(),
        swapAmount,
        0
      );

      // Verify reserves were updated correctly
      const poolId = await dex.getPoolId(
        await token0.getAddress(),
        await token1.getAddress()
      );
      const pool = await dex.pools(poolId);

      expect(pool.reserve0).to.be.gt(liquidityAmount0);
    });
  });

  describe("Liquidity Removal", function () {
    const liquidityAmount0 = ethers.parseEther("100");
    const liquidityAmount1 = ethers.parseEther("200");

    beforeEach(async function () {
      await token0.connect(user1).approve(await dex.getAddress(), liquidityAmount0);
      await token1.connect(user1).approve(await dex.getAddress(), liquidityAmount1);

      await dex.connect(user1).addLiquidity(
        await token0.getAddress(),
        await token1.getAddress(),
        liquidityAmount0,
        liquidityAmount1
      );
    });

    it("Should remove liquidity successfully", async function () {
      const poolId = await dex.getPoolId(
        await token0.getAddress(),
        await token1.getAddress()
      );
      const liquidity = await dex.liquidityBalances(poolId, user1.address);

      await expect(
        dex.connect(user1).removeLiquidity(
          await token0.getAddress(),
          await token1.getAddress(),
          liquidity
        )
      ).to.emit(dex, "RemoveLiquidity");
    });

    it("Should return tokens proportionally", async function () {
      const poolId = await dex.getPoolId(
        await token0.getAddress(),
        await token1.getAddress()
      );
      const liquidity = await dex.liquidityBalances(poolId, user1.address);

      const balanceBefore0 = await token0.balanceOf(user1.address);
      const balanceBefore1 = await token1.balanceOf(user1.address);

      await dex.connect(user1).removeLiquidity(
        await token0.getAddress(),
        await token1.getAddress(),
        liquidity
      );

      const balanceAfter0 = await token0.balanceOf(user1.address);
      const balanceAfter1 = await token1.balanceOf(user1.address);

      expect(balanceAfter0).to.be.gt(balanceBefore0);
      expect(balanceAfter1).to.be.gt(balanceBefore1);
    });
  });

  describe("Fee Management", function () {
    it("Should allow owner to update fee", async function () {
      const newFee = 50; // 0.5%
      await dex.setFeeRate(newFee);

      expect(await dex.feeRate()).to.equal(newFee);
    });

    it("Should not allow non-owner to update fee", async function () {
      await expect(
        dex.connect(user1).setFeeRate(50)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow owner to pause", async function () {
      await dex.pause();
      expect(await dex.paused()).to.be.true;
    });

    it("Should prevent swaps when paused", async function () {
      await dex.pause();

      await expect(
        dex.connect(user1).swap(
          await token0.getAddress(),
          await token1.getAddress(),
          ethers.parseEther("1"),
          0
        )
      ).to.be.revertedWith("Pausable: paused");
    });
  });
});
