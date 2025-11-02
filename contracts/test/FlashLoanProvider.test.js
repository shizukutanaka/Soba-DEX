const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashLoanProvider", function () {
  let flashLoanProvider;
  let mockToken;
  let mockReceiver;
  let owner;
  let treasury;
  let user;

  const INITIAL_LIQUIDITY = ethers.parseEther("10000");
  const FLASH_LOAN_PREMIUM = 9; // 0.09%
  const MAX_LOAN_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, treasury, user] = await ethers.getSigners();

    // Deploy mock token
    const Token = await ethers.getContractFactory("MockERC20");
    mockToken = await Token.deploy("MockToken", "MTK", INITIAL_LIQUIDITY);

    // Deploy FlashLoanProvider
    const FlashLoanProvider = await ethers.getContractFactory("FlashLoanProvider");
    flashLoanProvider = await FlashLoanProvider.deploy(treasury.address);

    // Add reserve
    await flashLoanProvider.addReserve(
      await mockToken.getAddress(),
      FLASH_LOAN_PREMIUM,
      MAX_LOAN_AMOUNT,
      ethers.ZeroAddress // aToken address
    );

    // Provide liquidity to the contract
    await mockToken.transfer(
      await flashLoanProvider.getAddress(),
      INITIAL_LIQUIDITY
    );

    // Deploy mock receiver
    const MockFlashLoanReceiver = await ethers.getContractFactory("MockFlashLoanReceiver");
    mockReceiver = await MockFlashLoanReceiver.deploy();
  });

  describe("Reserve Management", function () {
    it("Should add reserve successfully", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("NewToken", "NEW", INITIAL_LIQUIDITY);

      await expect(
        flashLoanProvider.addReserve(
          await newToken.getAddress(),
          FLASH_LOAN_PREMIUM,
          MAX_LOAN_AMOUNT,
          ethers.ZeroAddress
        )
      ).to.emit(flashLoanProvider, "ReserveAdded");
    });

    it("Should activate and deactivate reserve", async function () {
      await flashLoanProvider.setReserveActive(await mockToken.getAddress(), false);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [ethers.parseEther("100")],
          "0x"
        )
      ).to.be.revertedWith("Reserve not active");
    });

    it("Should freeze and unfreeze reserve", async function () {
      await flashLoanProvider.setReserveFreeze(await mockToken.getAddress(), true);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [ethers.parseEther("100")],
          "0x"
        )
      ).to.be.revertedWith("Reserve is frozen");
    });
  });

  describe("Flash Loan Execution", function () {
    const loanAmount = ethers.parseEther("100");

    beforeEach(async function () {
      // Fund receiver with tokens for repayment
      const premium = (loanAmount * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;
      await mockToken.transfer(
        await mockReceiver.getAddress(),
        premium
      );
    });

    it("Should execute flash loan successfully", async function () {
      await mockReceiver.setCanRepay(true);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [loanAmount],
          "0x"
        )
      ).to.emit(flashLoanProvider, "FlashLoan");
    });

    it("Should calculate premium correctly", async function () {
      await mockReceiver.setCanRepay(true);

      const contractBalanceBefore = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );

      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress()],
        [loanAmount],
        "0x"
      );

      const contractBalanceAfter = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );

      const expectedPremium = (loanAmount * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;
      expect(contractBalanceAfter - contractBalanceBefore).to.equal(expectedPremium);
    });

    it("Should fail if receiver doesn't repay", async function () {
      await mockReceiver.setCanRepay(false);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [loanAmount],
          "0x"
        )
      ).to.be.revertedWith("Flash loan execution failed");
    });

    it("Should enforce max loan amount", async function () {
      await mockReceiver.setCanRepay(true);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [MAX_LOAN_AMOUNT + ethers.parseEther("1")],
          "0x"
        )
      ).to.be.revertedWith("Amount exceeds max loan");
    });

    it("Should verify sufficient liquidity", async function () {
      await mockReceiver.setCanRepay(true);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [INITIAL_LIQUIDITY * 2n],
          "0x"
        )
      ).to.be.revertedWith("Insufficient liquidity");
    });

    it("Should protect against reentrancy", async function () {
      // This test verifies reentrancy protection through:
      // 1. Balance verification
      // 2. Gas limits on executeOperation
      // 3. NonReentrant modifier

      await mockReceiver.setCanRepay(true);
      await mockReceiver.setAttemptReentrancy(true);

      // Should fail or handle reentrancy gracefully
      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress()],
          [loanAmount],
          "0x"
        )
      ).to.be.reverted;
    });

    it("Should enforce gas limit on executeOperation", async function () {
      await mockReceiver.setCanRepay(true);
      await mockReceiver.setUseExcessiveGas(true);

      // Should handle gas limit gracefully
      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress()],
        [loanAmount],
        "0x"
      );

      // Verify contract state is still consistent
      const balance = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );
      expect(balance).to.be.gt(INITIAL_LIQUIDITY);
    });

    it("Should verify final balance (Reentrancy Protection)", async function () {
      await mockReceiver.setCanRepay(true);

      const balanceBefore = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );

      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress()],
        [loanAmount],
        "0x"
      );

      const balanceAfter = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );

      // Balance should increase by premium amount
      const premium = (loanAmount * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;
      expect(balanceAfter).to.equal(balanceBefore + premium);
    });
  });

  describe("Multiple Asset Flash Loans", function () {
    let mockToken2;
    const loanAmount1 = ethers.parseEther("100");
    const loanAmount2 = ethers.parseEther("50");

    beforeEach(async function () {
      // Deploy second token
      mockToken2 = await (await ethers.getContractFactory("MockERC20"))
        .deploy("Token2", "TK2", INITIAL_LIQUIDITY);

      // Add reserve for second token
      await flashLoanProvider.addReserve(
        await mockToken2.getAddress(),
        FLASH_LOAN_PREMIUM,
        MAX_LOAN_AMOUNT,
        ethers.ZeroAddress
      );

      // Provide liquidity
      await mockToken2.transfer(
        await flashLoanProvider.getAddress(),
        INITIAL_LIQUIDITY
      );

      // Fund receiver for repayment
      const premium1 = (loanAmount1 * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;
      const premium2 = (loanAmount2 * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;

      await mockToken.transfer(await mockReceiver.getAddress(), premium1);
      await mockToken2.transfer(await mockReceiver.getAddress(), premium2);
    });

    it("Should execute multi-asset flash loan", async function () {
      await mockReceiver.setCanRepay(true);

      await expect(
        flashLoanProvider.flashLoan(
          await mockReceiver.getAddress(),
          [await mockToken.getAddress(), await mockToken2.getAddress()],
          [loanAmount1, loanAmount2],
          "0x"
        )
      ).to.emit(flashLoanProvider, "FlashLoan");
    });

    it("Should verify repayment for all assets", async function () {
      await mockReceiver.setCanRepay(true);

      const balance1Before = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );
      const balance2Before = await mockToken2.balanceOf(
        await flashLoanProvider.getAddress()
      );

      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress(), await mockToken2.getAddress()],
        [loanAmount1, loanAmount2],
        "0x"
      );

      const balance1After = await mockToken.balanceOf(
        await flashLoanProvider.getAddress()
      );
      const balance2After = await mockToken2.balanceOf(
        await flashLoanProvider.getAddress()
      );

      expect(balance1After).to.be.gt(balance1Before);
      expect(balance2After).to.be.gt(balance2Before);
    });
  });

  describe("Premium Distribution", function () {
    const loanAmount = ethers.parseEther("100");

    beforeEach(async function () {
      const premium = (loanAmount * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;
      await mockToken.transfer(await mockReceiver.getAddress(), premium);
      await mockReceiver.setCanRepay(true);
    });

    it("Should send protocol premium to treasury", async function () {
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury.address);

      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress()],
        [loanAmount],
        "0x"
      );

      const treasuryBalanceAfter = await mockToken.balanceOf(treasury.address);

      expect(treasuryBalanceAfter).to.be.gt(treasuryBalanceBefore);
    });
  });

  describe("Statistics", function () {
    const loanAmount = ethers.parseEther("100");

    beforeEach(async function () {
      const premium = (loanAmount * BigInt(FLASH_LOAN_PREMIUM)) / 10000n;
      await mockToken.transfer(await mockReceiver.getAddress(), premium);
      await mockReceiver.setCanRepay(true);
    });

    it("Should track flash loan history", async function () {
      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress()],
        [loanAmount],
        "0x"
      );

      const history = await flashLoanProvider.flashLoanHistory(
        await mockReceiver.getAddress()
      );

      expect(history).to.equal(1);
    });

    it("Should track total volume", async function () {
      await flashLoanProvider.flashLoan(
        await mockReceiver.getAddress(),
        [await mockToken.getAddress()],
        [loanAmount],
        "0x"
      );

      const volume = await flashLoanProvider.totalFlashLoanVolume();

      expect(volume).to.be.gte(loanAmount);
    });
  });

  describe("Access Control", function () {
    it("Should not allow non-owner to add reserve", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("NewToken", "NEW", INITIAL_LIQUIDITY);

      await expect(
        flashLoanProvider.connect(user).addReserve(
          await newToken.getAddress(),
          FLASH_LOAN_PREMIUM,
          MAX_LOAN_AMOUNT,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow non-owner to set reserve active", async function () {
      await expect(
        flashLoanProvider.connect(user).setReserveActive(
          await mockToken.getAddress(),
          false
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
