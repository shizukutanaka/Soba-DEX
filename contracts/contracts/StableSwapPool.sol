// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title StableSwapPool
 * @notice Curve Finance-style stable swap pool for low-slippage stablecoin trading
 * @dev Implements StableSwap invariant: A * n^n * sum(x_i) + D = A * D * n^n + D^(n+1) / (n^n * prod(x_i))
 *
 * Key Features:
 * - Ultra-low slippage for similar-priced assets (stablecoins, wrapped tokens)
 * - Dynamic amplification coefficient (A parameter)
 * - Multiple tokens per pool (2-8 tokens)
 * - Concentrated liquidity around 1:1 price
 * - LP token representing proportional ownership
 *
 * Use Cases:
 * - USDC/USDT/DAI pools
 * - ETH/stETH/rETH pools
 * - BTC/WBTC/renBTC pools
 */
contract StableSwapPool is
    Initializable,
    ERC20Upgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // ============ Constants ============

    uint256 private constant PRECISION = 1e18;
    uint256 private constant MAX_TOKENS = 8;
    uint256 private constant MIN_TOKENS = 2;
    uint256 private constant MAX_A = 1000000; // Maximum amplification coefficient
    uint256 private constant MIN_A = 1;
    uint256 private constant MAX_FEE = 100; // 1% = 100 basis points
    uint256 private constant FEE_DENOMINATOR = 10000;
    uint256 private constant MAX_ADMIN_FEE = 5000; // 50% of swap fee
    uint256 private constant A_PRECISION = 100;

    // ============ State Variables ============

    // Pool tokens
    address[] public tokens;
    uint256 public numTokens;

    // Token balances (internal accounting)
    mapping(address => uint256) public balances;

    // Amplification coefficient (determines curve shape)
    // Higher A = flatter curve = lower slippage near 1:1
    // Lower A = closer to constant product
    uint256 public A; // Actual A value is A / A_PRECISION

    // Future A value for ramping
    uint256 public futureA;
    uint256 public futureATime;
    uint256 public initialATime;
    uint256 private constant MIN_RAMP_TIME = 1 days;

    // Fee structure
    uint256 public swapFee; // Basis points (e.g., 4 = 0.04%)
    uint256 public adminFee; // Percentage of swap fee
    mapping(address => uint256) public adminBalances;

    // Token precision multipliers (to normalize to 18 decimals)
    mapping(address => uint256) public precisionMultipliers;

    // Virtual price tracking (for analytics)
    uint256 public virtualPrice;

    // ============ Events ============

    event TokenSwap(
        address indexed buyer,
        address indexed tokenSold,
        uint256 amountSold,
        address indexed tokenBought,
        uint256 amountBought
    );

    event AddLiquidity(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256[] fees,
        uint256 invariant,
        uint256 lpTokenSupply
    );

    event RemoveLiquidity(
        address indexed provider,
        uint256[] tokenAmounts,
        uint256 lpTokenSupply
    );

    event RemoveLiquidityOne(
        address indexed provider,
        uint256 lpTokenAmount,
        uint256 tokenAmount,
        address token
    );

    event RampA(
        uint256 oldA,
        uint256 newA,
        uint256 initialTime,
        uint256 futureTime
    );

    event StopRampA(uint256 A, uint256 timestamp);

    event NewFee(uint256 fee, uint256 adminFee);

    // ============ Initialization ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the stable swap pool
     * @param _tokens Array of token addresses (2-8 tokens)
     * @param _A Amplification coefficient (* A_PRECISION)
     * @param _fee Swap fee in basis points
     * @param _adminFee Admin fee as percentage of swap fee
     * @param _name LP token name
     * @param _symbol LP token symbol
     */
    function initialize(
        address[] memory _tokens,
        uint256 _A,
        uint256 _fee,
        uint256 _adminFee,
        string memory _name,
        string memory _symbol
    ) public initializer {
        require(_tokens.length >= MIN_TOKENS && _tokens.length <= MAX_TOKENS, "Invalid number of tokens");
        require(_A >= MIN_A && _A <= MAX_A, "Invalid A");
        require(_fee <= MAX_FEE, "Fee too high");
        require(_adminFee <= MAX_ADMIN_FEE, "Admin fee too high");

        __ERC20_init(_name, _symbol);
        __ReentrancyGuard_init();
        __Pausable_init();
        __Ownable_init();
        __UUPSUpgradeable_init();

        // Verify tokens and set precision multipliers
        for (uint256 i = 0; i < _tokens.length; i++) {
            require(_tokens[i] != address(0), "Zero address");

            // Check for duplicates
            for (uint256 j = 0; j < i; j++) {
                require(_tokens[i] != _tokens[j], "Duplicate token");
            }

            // Get token decimals and calculate precision multiplier
            uint8 decimals = IERC20Upgradeable(_tokens[i]).decimals();
            require(decimals <= 18, "Token decimals too high");

            precisionMultipliers[_tokens[i]] = 10 ** (18 - decimals);
            tokens.push(_tokens[i]);
        }

        numTokens = _tokens.length;
        A = _A;
        futureA = _A;
        swapFee = _fee;
        adminFee = _adminFee;
        virtualPrice = PRECISION;
    }

    // ============ Core Swap Functions ============

    /**
     * @notice Swap one token for another
     * @param i Index of token to sell
     * @param j Index of token to buy
     * @param dx Amount of token i to sell
     * @param minDy Minimum amount of token j to receive
     * @return dy Amount of token j received
     */
    function swap(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 minDy
    ) external nonReentrant whenNotPaused returns (uint256 dy) {
        require(i != j, "Same token");
        require(i < numTokens && j < numTokens, "Invalid token index");
        require(dx > 0, "Zero amount");

        address tokenIn = tokens[i];
        address tokenOut = tokens[j];

        // Get normalized balances
        uint256[] memory xp = _xp();

        // Calculate output amount
        uint256 x = xp[i] + (dx * precisionMultipliers[tokenIn]);
        uint256 y = _getY(i, j, x, xp);
        uint256 dyWithoutFee = xp[j] - y - 1; // Subtract 1 for rounding

        // Apply fee
        uint256 dyFee = (dyWithoutFee * swapFee) / FEE_DENOMINATOR;
        dy = (dyWithoutFee - dyFee) / precisionMultipliers[tokenOut];

        require(dy >= minDy, "Slippage exceeded");

        // Update balances
        balances[tokenIn] += dx;
        balances[tokenOut] -= dy;

        // Admin fee
        uint256 dyAdminFee = (dyFee * adminFee) / FEE_DENOMINATOR;
        if (dyAdminFee > 0) {
            adminBalances[tokenOut] += dyAdminFee / precisionMultipliers[tokenOut];
        }

        // Transfer tokens
        IERC20Upgradeable(tokenIn).transferFrom(msg.sender, address(this), dx);
        IERC20Upgradeable(tokenOut).transfer(msg.sender, dy);

        emit TokenSwap(msg.sender, tokenIn, dx, tokenOut, dy);
    }

    /**
     * @notice Add liquidity to the pool
     * @param amounts Array of token amounts to add
     * @param minMintAmount Minimum LP tokens to mint
     * @return lpTokens Amount of LP tokens minted
     */
    function addLiquidity(
        uint256[] memory amounts,
        uint256 minMintAmount
    ) external nonReentrant whenNotPaused returns (uint256 lpTokens) {
        require(amounts.length == numTokens, "Invalid amounts length");

        uint256[] memory fees = new uint256[](numTokens);
        uint256 _totalSupply = totalSupply();

        // Get current D (invariant)
        uint256 D0 = 0;
        uint256[] memory oldBalances = new uint256[](numTokens);
        if (_totalSupply > 0) {
            D0 = _getD(_xp());
        }

        // Transfer tokens and update balances
        uint256[] memory newBalances = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            oldBalances[i] = balances[tokens[i]];

            if (_totalSupply == 0) {
                require(amounts[i] > 0, "Initial deposit requires all tokens");
            }

            if (amounts[i] > 0) {
                IERC20Upgradeable(tokens[i]).transferFrom(
                    msg.sender,
                    address(this),
                    amounts[i]
                );
                newBalances[i] = oldBalances[i] + amounts[i];
            } else {
                newBalances[i] = oldBalances[i];
            }

            balances[tokens[i]] = newBalances[i];
        }

        // Get new D
        uint256[] memory xp = _xp();
        uint256 D1 = _getD(xp);
        require(D1 > D0, "D decreased");

        // Calculate LP tokens to mint
        if (_totalSupply == 0) {
            // Initial deposit
            lpTokens = D1;
        } else {
            // Subsequent deposits with fee consideration
            uint256 D2 = D1;

            // Calculate fees on imbalanced deposits
            if (swapFee > 0) {
                for (uint256 i = 0; i < numTokens; i++) {
                    uint256 idealBalance = (D1 * oldBalances[i]) / D0;
                    uint256 difference;

                    if (idealBalance > newBalances[i]) {
                        difference = idealBalance - newBalances[i];
                    } else {
                        difference = newBalances[i] - idealBalance;
                    }

                    fees[i] = (swapFee * difference) / FEE_DENOMINATOR;
                    balances[tokens[i]] -= fees[i];

                    uint256 adminFeeAmount = (fees[i] * adminFee) / FEE_DENOMINATOR;
                    adminBalances[tokens[i]] += adminFeeAmount;
                }

                D2 = _getD(_xp());
            }

            lpTokens = (_totalSupply * (D2 - D0)) / D0;
        }

        require(lpTokens >= minMintAmount, "Slippage exceeded");

        // Mint LP tokens
        _mint(msg.sender, lpTokens);

        emit AddLiquidity(msg.sender, amounts, fees, D1, totalSupply());
    }

    /**
     * @notice Remove liquidity from pool
     * @param lpAmount Amount of LP tokens to burn
     * @param minAmounts Minimum amounts of each token to receive
     * @return amounts Array of token amounts received
     */
    function removeLiquidity(
        uint256 lpAmount,
        uint256[] memory minAmounts
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(minAmounts.length == numTokens, "Invalid minAmounts length");
        require(lpAmount > 0, "Zero amount");

        uint256 _totalSupply = totalSupply();
        amounts = new uint256[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            uint256 balance = balances[tokens[i]];
            uint256 amount = (balance * lpAmount) / _totalSupply;
            require(amount >= minAmounts[i], "Slippage exceeded");

            balances[tokens[i]] -= amount;
            amounts[i] = amount;

            IERC20Upgradeable(tokens[i]).transfer(msg.sender, amount);
        }

        _burn(msg.sender, lpAmount);

        emit RemoveLiquidity(msg.sender, amounts, totalSupply());
    }

    /**
     * @notice Remove liquidity in a single token
     * @param lpAmount Amount of LP tokens to burn
     * @param tokenIndex Index of token to receive
     * @param minAmount Minimum amount of token to receive
     * @return amount Amount of token received
     */
    function removeLiquidityOneCoin(
        uint256 lpAmount,
        uint256 tokenIndex,
        uint256 minAmount
    ) external nonReentrant returns (uint256 amount) {
        require(tokenIndex < numTokens, "Invalid token index");
        require(lpAmount > 0, "Zero amount");

        uint256 _totalSupply = totalSupply();
        uint256[] memory xp = _xp();

        // Calculate D before and after
        uint256 D0 = _getD(xp);
        uint256 D1 = D0 - (lpAmount * D0) / _totalSupply;

        // Calculate new y (balance of token to receive)
        uint256 newY = _getYD(tokenIndex, xp, D1);

        // Calculate amount with fee
        uint256[] memory xpReduced = new uint256[](numTokens);
        uint256 dyExpected = xp[tokenIndex] - newY;

        for (uint256 i = 0; i < numTokens; i++) {
            uint256 dxExpected = 0;
            if (i == tokenIndex) {
                dxExpected = (xp[i] * D1) / D0 - newY;
            } else {
                dxExpected = xp[i] - (xp[i] * D1) / D0;
            }
            xpReduced[i] = xp[i] - (swapFee * dxExpected) / FEE_DENOMINATOR;
        }

        uint256 dy = xpReduced[tokenIndex] - _getYD(tokenIndex, xpReduced, D1);
        dy = (dy - 1) / precisionMultipliers[tokens[tokenIndex]]; // -1 for rounding

        require(dy >= minAmount, "Slippage exceeded");

        // Update balances
        balances[tokens[tokenIndex]] -= dy;

        // Admin fee
        uint256 dyFee = ((xp[tokenIndex] - newY) / precisionMultipliers[tokens[tokenIndex]]) - dy;
        if (dyFee > 0) {
            uint256 adminFeeAmount = (dyFee * adminFee) / FEE_DENOMINATOR;
            adminBalances[tokens[tokenIndex]] += adminFeeAmount;
        }

        // Burn LP tokens and transfer
        _burn(msg.sender, lpAmount);
        IERC20Upgradeable(tokens[tokenIndex]).transfer(msg.sender, dy);

        emit RemoveLiquidityOne(msg.sender, lpAmount, dy, tokens[tokenIndex]);

        return dy;
    }

    // ============ StableSwap Invariant Math ============

    /**
     * @notice Calculate D (invariant)
     * @dev D invariant = A * n^n * sum(x_i) + D = A * D * n^n + D^(n+1) / (n^n * prod(x_i))
     */
    function _getD(uint256[] memory xp) internal view returns (uint256) {
        uint256 N = numTokens;
        uint256 sum = 0;
        for (uint256 i = 0; i < N; i++) {
            sum += xp[i];
        }

        if (sum == 0) return 0;

        uint256 Dprev = 0;
        uint256 D = sum;
        uint256 Ann = _A() * N;

        for (uint256 i = 0; i < 255; i++) {
            uint256 D_P = D;
            for (uint256 j = 0; j < N; j++) {
                D_P = (D_P * D) / (xp[j] * N);
            }
            Dprev = D;
            D = ((Ann * sum + D_P * N) * D) / ((Ann - 1) * D + (N + 1) * D_P);

            if (D > Dprev) {
                if (D - Dprev <= 1) break;
            } else {
                if (Dprev - D <= 1) break;
            }
        }

        return D;
    }

    /**
     * @notice Calculate y (new balance) given x (new input balance)
     */
    function _getY(
        uint256 i,
        uint256 j,
        uint256 x,
        uint256[] memory xp
    ) internal view returns (uint256) {
        require(i != j && i < numTokens && j < numTokens, "Invalid indices");

        uint256 N = numTokens;
        uint256 D = _getD(xp);
        uint256 Ann = _A() * N;
        uint256 c = D;
        uint256 S_ = 0;

        for (uint256 k = 0; k < N; k++) {
            uint256 _x = 0;
            if (k == i) {
                _x = x;
            } else if (k != j) {
                _x = xp[k];
            } else {
                continue;
            }
            S_ += _x;
            c = (c * D) / (_x * N);
        }

        c = (c * D) / (Ann * N);
        uint256 b = S_ + D / Ann;

        uint256 yPrev = 0;
        uint256 y = D;

        for (uint256 k = 0; k < 255; k++) {
            yPrev = y;
            y = (y * y + c) / (2 * y + b - D);

            if (y > yPrev) {
                if (y - yPrev <= 1) break;
            } else {
                if (yPrev - y <= 1) break;
            }
        }

        return y;
    }

    /**
     * @notice Calculate y given target D
     */
    function _getYD(
        uint256 i,
        uint256[] memory xp,
        uint256 D
    ) internal view returns (uint256) {
        uint256 N = numTokens;
        uint256 Ann = _A() * N;
        uint256 c = D;
        uint256 S_ = 0;

        for (uint256 k = 0; k < N; k++) {
            if (k != i) {
                S_ += xp[k];
                c = (c * D) / (xp[k] * N);
            }
        }

        c = (c * D) / (Ann * N);
        uint256 b = S_ + D / Ann;

        uint256 yPrev = 0;
        uint256 y = D;

        for (uint256 k = 0; k < 255; k++) {
            yPrev = y;
            y = (y * y + c) / (2 * y + b - D);

            if (y > yPrev) {
                if (y - yPrev <= 1) break;
            } else {
                if (yPrev - y <= 1) break;
            }
        }

        return y;
    }

    /**
     * @notice Get normalized balances (precision-adjusted)
     */
    function _xp() internal view returns (uint256[] memory) {
        uint256[] memory xp = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            xp[i] = balances[tokens[i]] * precisionMultipliers[tokens[i]];
        }
        return xp;
    }

    /**
     * @notice Get current A value (with ramping)
     */
    function _A() internal view returns (uint256) {
        uint256 t1 = futureATime;
        uint256 A1 = futureA;

        if (block.timestamp < t1) {
            uint256 A0 = A;
            uint256 t0 = initialATime;

            if (A1 > A0) {
                return A0 + ((A1 - A0) * (block.timestamp - t0)) / (t1 - t0);
            } else {
                return A0 - ((A0 - A1) * (block.timestamp - t0)) / (t1 - t0);
            }
        } else {
            return A1;
        }
    }

    // ============ View Functions ============

    /**
     * @notice Calculate swap output amount (view function)
     */
    function calculateSwap(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external view returns (uint256) {
        require(i != j && i < numTokens && j < numTokens, "Invalid indices");

        uint256[] memory xp = _xp();
        uint256 x = xp[i] + (dx * precisionMultipliers[tokens[i]]);
        uint256 y = _getY(i, j, x, xp);
        uint256 dy = xp[j] - y - 1;
        uint256 fee = (dy * swapFee) / FEE_DENOMINATOR;

        return (dy - fee) / precisionMultipliers[tokens[j]];
    }

    /**
     * @notice Get current virtual price (D / total LP supply)
     */
    function getVirtualPrice() external view returns (uint256) {
        uint256 D = _getD(_xp());
        uint256 supply = totalSupply();

        if (supply == 0) return 0;
        return (D * PRECISION) / supply;
    }

    /**
     * @notice Get current A value
     */
    function getA() external view returns (uint256) {
        return _A() / A_PRECISION;
    }

    /**
     * @notice Get precise A value
     */
    function getAPrecise() external view returns (uint256) {
        return _A();
    }

    /**
     * @notice Get pool tokens
     */
    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    /**
     * @notice Get pool balances
     */
    function getBalances() external view returns (uint256[] memory) {
        uint256[] memory poolBalances = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            poolBalances[i] = balances[tokens[i]];
        }
        return poolBalances;
    }

    // ============ Admin Functions ============

    /**
     * @notice Ramp A parameter to new value over time
     */
    function rampA(uint256 _futureA, uint256 _futureTime) external onlyOwner {
        require(block.timestamp >= initialATime + MIN_RAMP_TIME, "Ramp in progress");
        require(_futureTime >= block.timestamp + MIN_RAMP_TIME, "Future time too soon");
        require(_futureA >= MIN_A && _futureA <= MAX_A, "Invalid A");

        uint256 initialA = _A();

        // Prevent more than 10x change in either direction
        if (_futureA > initialA) {
            require(_futureA <= initialA * 10, "A increase too large");
        } else {
            require(_futureA * 10 >= initialA, "A decrease too large");
        }

        A = initialA;
        futureA = _futureA;
        initialATime = block.timestamp;
        futureATime = _futureTime;

        emit RampA(initialA, _futureA, block.timestamp, _futureTime);
    }

    /**
     * @notice Stop ramping A
     */
    function stopRampA() external onlyOwner {
        uint256 currentA = _A();
        A = currentA;
        futureA = currentA;
        initialATime = block.timestamp;
        futureATime = block.timestamp;

        emit StopRampA(currentA, block.timestamp);
    }

    /**
     * @notice Update fees
     */
    function setFee(uint256 newFee, uint256 newAdminFee) external onlyOwner {
        require(newFee <= MAX_FEE, "Fee too high");
        require(newAdminFee <= MAX_ADMIN_FEE, "Admin fee too high");

        swapFee = newFee;
        adminFee = newAdminFee;

        emit NewFee(newFee, newAdminFee);
    }

    /**
     * @notice Withdraw admin fees
     */
    function withdrawAdminFees() external onlyOwner {
        for (uint256 i = 0; i < numTokens; i++) {
            uint256 amount = adminBalances[tokens[i]];
            if (amount > 0) {
                adminBalances[tokens[i]] = 0;
                IERC20Upgradeable(tokens[i]).transfer(owner(), amount);
            }
        }
    }

    /**
     * @notice Pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
