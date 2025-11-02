// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract FlashLoanProvider is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant CONFIGURATOR_ROLE = keccak256("CONFIGURATOR_ROLE");
    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN_ROLE");

    struct ReserveData {
        uint256 availableLiquidity;
        uint256 totalBorrows;
        uint256 flashLoanPremium;
        uint256 utilizationRate;
        uint256 maxLoanAmount;
        bool isActive;
        bool isFreezed;
        address aTokenAddress;
        address interestRateStrategy;
        uint128 liquidityIndex;
        uint128 variableBorrowIndex;
        uint40 lastUpdateTimestamp;
    }

    struct FlashLoanData {
        address receiver;
        address[] assets;
        uint256[] amounts;
        uint256[] premiums;
        bytes params;
        uint256 timestamp;
        bool executed;
    }

    mapping(address => ReserveData) public reserves;
    mapping(bytes32 => FlashLoanData) public flashLoans;
    mapping(address => bool) public authorizedFlashBorrowers;
    mapping(address => uint256) public flashLoanHistory;

    uint256 public constant FLASHLOAN_PREMIUM_TOTAL = 9; // 0.09%
    uint256 public constant FLASHLOAN_PREMIUM_PROTOCOL = 3000; // 30% of premium goes to protocol
    uint256 public constant PERCENTAGE_FACTOR = 10000;
    uint256 public constant MAX_NUMBER_RESERVES = 128;

    uint256 public protocolTreasury;
    address public treasuryAddress;
    uint256 public totalFlashLoans;
    uint256 public totalFlashLoanVolume;

    address[] public reservesList;

    event FlashLoan(
        address indexed receiver,
        address indexed initiator,
        address[] assets,
        uint256[] amounts,
        uint256[] premiums,
        uint256 timestamp
    );

    event ReserveInitialized(
        address indexed asset,
        address indexed aToken,
        address interestRateStrategy
    );

    event ReserveConfigurationChanged(
        address indexed asset,
        uint256 flashLoanPremium,
        uint256 maxLoanAmount
    );

    event AuthorizedBorrowerAdded(address indexed borrower);
    event AuthorizedBorrowerRemoved(address indexed borrower);
    event TreasuryUpdated(address indexed newTreasury);

    modifier onlyAuthorizedBorrower(address borrower) {
        require(
            authorizedFlashBorrowers[borrower] || borrower == msg.sender,
            "Unauthorized borrower"
        );
        _;
    }

    constructor(address _treasuryAddress) {
        require(_treasuryAddress != address(0), "Invalid treasury");
        treasuryAddress = _treasuryAddress;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(CONFIGURATOR_ROLE, msg.sender);
        _setupRole(EMERGENCY_ADMIN_ROLE, msg.sender);
    }

    function initReserve(
        address asset,
        address aTokenAddress,
        address interestRateStrategy
    ) external onlyRole(CONFIGURATOR_ROLE) {
        require(reserves[asset].aTokenAddress == address(0), "Reserve already initialized");
        require(reservesList.length < MAX_NUMBER_RESERVES, "Maximum reserves reached");

        reserves[asset] = ReserveData({
            availableLiquidity: 0,
            totalBorrows: 0,
            flashLoanPremium: FLASHLOAN_PREMIUM_TOTAL,
            utilizationRate: 0,
            maxLoanAmount: type(uint256).max,
            isActive: true,
            isFreezed: false,
            aTokenAddress: aTokenAddress,
            interestRateStrategy: interestRateStrategy,
            liquidityIndex: uint128(1e27),
            variableBorrowIndex: uint128(1e27),
            lastUpdateTimestamp: uint40(block.timestamp)
        });

        reservesList.push(asset);

        emit ReserveInitialized(asset, aTokenAddress, interestRateStrategy);
    }

    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        bytes calldata params
    ) external nonReentrant whenNotPaused onlyAuthorizedBorrower(receiverAddress) {
        require(assets.length == amounts.length, "Inconsistent params length");
        require(assets.length > 0, "Empty arrays");

        FlashLoanData memory flashLoanData;
        flashLoanData.receiver = receiverAddress;
        flashLoanData.assets = assets;
        flashLoanData.amounts = amounts;
        flashLoanData.params = params;
        flashLoanData.timestamp = block.timestamp;

        uint256[] memory premiums = new uint256[](assets.length);
        address[] memory aTokenAddresses = new address[](assets.length);

        // Store initial balances before any transfers (for reentrancy protection)
        uint256[] memory initialBalances = new uint256[](assets.length);

        for (uint256 i = 0; i < assets.length; i++) {
            ReserveData storage reserve = reserves[assets[i]];

            require(reserve.isActive, "Reserve not active");
            require(!reserve.isFreezed, "Reserve is frozen");
            require(amounts[i] > 0, "Invalid amount");
            require(amounts[i] <= reserve.maxLoanAmount, "Amount exceeds max loan");

            uint256 availableLiquidity = IERC20(assets[i]).balanceOf(address(this));
            require(availableLiquidity >= amounts[i], "Insufficient liquidity");

            premiums[i] = (amounts[i] * reserve.flashLoanPremium) / PERCENTAGE_FACTOR;
            aTokenAddresses[i] = reserve.aTokenAddress;

            // Store initial balance for verification
            initialBalances[i] = availableLiquidity;

            // Transfer funds to receiver
            IERC20(assets[i]).safeTransfer(receiverAddress, amounts[i]);
        }

        // Execute receiver's logic with limited gas to prevent griefing
        require(
            IFlashLoanReceiver(receiverAddress).executeOperation{gas: 500000}(
                assets,
                amounts,
                premiums,
                msg.sender,
                params
            ),
            "Flash loan execution failed"
        );

        // Verify repayment and update state
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 amountPlusPremium = amounts[i] + premiums[i];

            IERC20(assets[i]).safeTransferFrom(
                receiverAddress,
                address(this),
                amountPlusPremium
            );

            // Verify final balance to ensure full repayment
            uint256 finalBalance = IERC20(assets[i]).balanceOf(address(this));
            require(
                finalBalance >= initialBalances[i] + premiums[i],
                "Insufficient repayment"
            );

            // Distribute premium
            uint256 protocolPremium = (premiums[i] * FLASHLOAN_PREMIUM_PROTOCOL) / PERCENTAGE_FACTOR;
            uint256 reservePremium = premiums[i] - protocolPremium;

            if (protocolPremium > 0) {
                IERC20(assets[i]).safeTransfer(treasuryAddress, protocolPremium);
                protocolTreasury += protocolPremium;
            }

            reserves[assets[i]].availableLiquidity += reservePremium;

            // Update statistics
            flashLoanHistory[receiverAddress]++;
            totalFlashLoanVolume += amounts[i];
        }

        flashLoanData.premiums = premiums;
        flashLoanData.executed = true;

        bytes32 flashLoanId = keccak256(
            abi.encodePacked(
                receiverAddress,
                assets,
                amounts,
                block.timestamp
            )
        );
        flashLoans[flashLoanId] = flashLoanData;

        totalFlashLoans++;

        emit FlashLoan(
            receiverAddress,
            msg.sender,
            assets,
            amounts,
            premiums,
            block.timestamp
        );
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params
    ) external nonReentrant whenNotPaused {
        address[] memory assets = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        assets[0] = asset;
        amounts[0] = amount;

        this.flashLoan(receiverAddress, assets, amounts, params);
    }

    function configureReserve(
        address asset,
        uint256 flashLoanPremium,
        uint256 maxLoanAmount,
        bool isActive,
        bool isFreezed
    ) external onlyRole(CONFIGURATOR_ROLE) {
        require(reserves[asset].aTokenAddress != address(0), "Reserve not initialized");
        require(flashLoanPremium <= 10000, "Invalid premium");

        ReserveData storage reserve = reserves[asset];
        reserve.flashLoanPremium = flashLoanPremium;
        reserve.maxLoanAmount = maxLoanAmount;
        reserve.isActive = isActive;
        reserve.isFreezed = isFreezed;

        emit ReserveConfigurationChanged(asset, flashLoanPremium, maxLoanAmount);
    }

    function addAuthorizedBorrower(address borrower) external onlyRole(CONFIGURATOR_ROLE) {
        require(!authorizedFlashBorrowers[borrower], "Already authorized");
        authorizedFlashBorrowers[borrower] = true;
        emit AuthorizedBorrowerAdded(borrower);
    }

    function removeAuthorizedBorrower(address borrower) external onlyRole(CONFIGURATOR_ROLE) {
        require(authorizedFlashBorrowers[borrower], "Not authorized");
        authorizedFlashBorrowers[borrower] = false;
        emit AuthorizedBorrowerRemoved(borrower);
    }

    function updateTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        treasuryAddress = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function deposit(address asset, uint256 amount) external nonReentrant {
        require(reserves[asset].aTokenAddress != address(0), "Reserve not initialized");
        require(amount > 0, "Invalid amount");

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        reserves[asset].availableLiquidity += amount;
    }

    function withdraw(address asset, uint256 amount) external onlyRole(CONFIGURATOR_ROLE) {
        require(amount > 0, "Invalid amount");
        require(
            IERC20(asset).balanceOf(address(this)) >= amount,
            "Insufficient balance"
        );

        IERC20(asset).safeTransfer(msg.sender, amount);
        reserves[asset].availableLiquidity -= amount;
    }

    function pause() external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _unpause();
    }

    function getFlashLoanPremium(address asset) external view returns (uint256) {
        return reserves[asset].flashLoanPremium;
    }

    function getMaxFlashLoan(address asset) external view returns (uint256) {
        ReserveData memory reserve = reserves[asset];
        if (!reserve.isActive || reserve.isFreezed) {
            return 0;
        }

        uint256 balance = IERC20(asset).balanceOf(address(this));
        return balance < reserve.maxLoanAmount ? balance : reserve.maxLoanAmount;
    }

    function getReservesList() external view returns (address[] memory) {
        return reservesList;
    }

    function getReserveData(address asset) external view returns (
        uint256 availableLiquidity,
        uint256 totalBorrows,
        uint256 flashLoanPremium,
        uint256 utilizationRate,
        bool isActive,
        bool isFreezed
    ) {
        ReserveData memory reserve = reserves[asset];
        return (
            IERC20(asset).balanceOf(address(this)),
            reserve.totalBorrows,
            reserve.flashLoanPremium,
            reserve.utilizationRate,
            reserve.isActive,
            reserve.isFreezed
        );
    }

    function getFlashLoanStats() external view returns (
        uint256 _totalFlashLoans,
        uint256 _totalVolume,
        uint256 _protocolTreasury
    ) {
        return (totalFlashLoans, totalFlashLoanVolume, protocolTreasury);
    }

    receive() external payable {}
}