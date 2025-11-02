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
 * @title WeightedPool
 * @notice Balancer-style weighted pool with custom token ratios
 * @dev Implements weighted constant product invariant: prod(balance_i^weight_i) = constant
 *
 * Key Features:
 * - Custom token weights (e.g., 80/20, 60/40, 33/33/33)
 * - Up to 8 tokens per pool
 * - Automatic portfolio rebalancing through trades
 * - Lower impermanent loss for certain strategies
 * - Efficient multi-asset exposure
 *
 * Use Cases:
 * - 80/20 BTC/USD pools (maintain 80% BTC exposure)
 * - Multi-asset index pools (equal or custom weights)
 * - Custom portfolio management
 * - Governance token liquidity with reduced sell pressure
 *
 * Math:
 * - Spot price: P = (B_out / W_out) / (B_in / W_in)
 * - Out given in: A_out = B_out * (1 - (B_in / (B_in + A_in))^(W_in/W_out))
 * - In given out: A_in = B_in * ((B_out / (B_out - A_out))^(W_out/W_in) - 1)
 */
contract WeightedPool is
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
    uint256 private constant MAX_WEIGHT = 99 * PRECISION / 100; // 99%
    uint256 private constant MIN_WEIGHT = 1 * PRECISION / 100;  // 1%
    uint256 private constant MAX_FEE = 100; // 1%
    uint256 private constant FEE_DENOMINATOR = 10000;
    uint256 private constant MAX_POW_BASE = 2 * PRECISION;
    uint256 private constant MIN_POW_BASE = 1;

    // ============ State Variables ============

    // Pool composition
    struct TokenData {
        address token;
        uint256 weight;        // Normalized weight (sum = 1e18)
        uint256 balance;       // Current balance
        uint8 decimals;        // Token decimals
    }

    TokenData[] public tokens;
    mapping(address => uint256) public tokenIndex; // 1-indexed (0 = not found)
    uint256 public numTokens;

    // Fee structure
    uint256 public swapFee;    // Basis points
    uint256 public exitFee;    // Early exit fee (basis points)
    uint256 public adminFee;   // Admin's cut of fees
    mapping(address => uint256) public adminBalances;

    // Oracle and price tracking
    mapping(address => mapping(address => uint256)) public lastPrice;
    uint256 public lastInvariant;

    // ============ Events ============

    event Swap(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event Join(
        address indexed caller,
        address[] tokensIn,
        uint256[] amountsIn,
        uint256 lpMinted
    );

    event Exit(
        address indexed caller,
        address[] tokensOut,
        uint256[] amountsOut,
        uint256 lpBurned
    );

    event FeeUpdate(uint256 swapFee, uint256 exitFee, uint256 adminFee);

    event WeightUpdate(address indexed token, uint256 oldWeight, uint256 newWeight);

    // ============ Initialization ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize weighted pool
     * @param _tokens Array of token addresses
     * @param _weights Array of token weights (must sum to 1e18)
     * @param _swapFee Swap fee in basis points
     * @param _name LP token name
     * @param _symbol LP token symbol
     */
    function initialize(
        address[] memory _tokens,
        uint256[] memory _weights,
        uint256 _swapFee,
        string memory _name,
        string memory _symbol
    ) public initializer {
        require(_tokens.length >= MIN_TOKENS && _tokens.length <= MAX_TOKENS, "Invalid token count");
        require(_tokens.length == _weights.length, "Length mismatch");
        require(_swapFee <= MAX_FEE, "Fee too high");

        __ERC20_init(_name, _symbol);
        __ReentrancyGuard_init();
        __Pausable_init();
        __Ownable_init();
        __UUPSUpgradeable_init();

        uint256 totalWeight = 0;

        for (uint256 i = 0; i < _tokens.length; i++) {
            require(_tokens[i] != address(0), "Zero address");
            require(_weights[i] >= MIN_WEIGHT && _weights[i] <= MAX_WEIGHT, "Invalid weight");

            // Check for duplicates
            for (uint256 j = 0; j < i; j++) {
                require(_tokens[i] != _tokens[j], "Duplicate token");
            }

            uint8 decimals = IERC20Upgradeable(_tokens[i]).decimals();
            require(decimals <= 18, "Decimals too high");

            tokens.push(TokenData({
                token: _tokens[i],
                weight: _weights[i],
                balance: 0,
                decimals: decimals
            }));

            tokenIndex[_tokens[i]] = i + 1; // 1-indexed
            totalWeight += _weights[i];
        }

        require(totalWeight == PRECISION, "Weights must sum to 1e18");

        numTokens = _tokens.length;
        swapFee = _swapFee;
        exitFee = 0; // Default no exit fee
        adminFee = 5000; // 50% of fees to admin
    }

    // ============ Core Swap Functions ============

    /**
     * @notice Swap exact amount in for minimum amount out
     * @param tokenIn Address of input token
     * @param tokenOut Address of output token
     * @param amountIn Exact amount of tokenIn
     * @param minAmountOut Minimum amount of tokenOut
     * @return amountOut Actual amount of tokenOut received
     */
    function swapExactAmountIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        require(tokenIn != tokenOut, "Same token");
        require(amountIn > 0, "Zero amount");

        uint256 indexIn = tokenIndex[tokenIn];
        uint256 indexOut = tokenIndex[tokenOut];
        require(indexIn > 0 && indexOut > 0, "Token not in pool");

        indexIn -= 1; // Convert to 0-indexed
        indexOut -= 1;

        // Calculate output amount
        amountOut = _calcOutGivenIn(
            tokens[indexIn].balance,
            tokens[indexIn].weight,
            tokens[indexOut].balance,
            tokens[indexOut].weight,
            amountIn,
            swapFee
        );

        require(amountOut >= minAmountOut, "Slippage exceeded");

        // Update balances
        tokens[indexIn].balance += amountIn;
        tokens[indexOut].balance -= amountOut;

        // Transfer tokens
        IERC20Upgradeable(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20Upgradeable(tokenOut).transfer(msg.sender, amountOut);

        // Update price oracle
        lastPrice[tokenIn][tokenOut] = _getSpotPrice(indexIn, indexOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Swap for exact amount out with maximum amount in
     * @param tokenIn Address of input token
     * @param tokenOut Address of output token
     * @param amountOut Exact amount of tokenOut desired
     * @param maxAmountIn Maximum amount of tokenIn to spend
     * @return amountIn Actual amount of tokenIn spent
     */
    function swapExactAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 maxAmountIn
    ) external nonReentrant whenNotPaused returns (uint256 amountIn) {
        require(tokenIn != tokenOut, "Same token");
        require(amountOut > 0, "Zero amount");

        uint256 indexIn = tokenIndex[tokenIn];
        uint256 indexOut = tokenIndex[tokenOut];
        require(indexIn > 0 && indexOut > 0, "Token not in pool");

        indexIn -= 1;
        indexOut -= 1;

        // Calculate required input amount
        amountIn = _calcInGivenOut(
            tokens[indexIn].balance,
            tokens[indexIn].weight,
            tokens[indexOut].balance,
            tokens[indexOut].weight,
            amountOut,
            swapFee
        );

        require(amountIn <= maxAmountIn, "Slippage exceeded");

        // Update balances
        tokens[indexIn].balance += amountIn;
        tokens[indexOut].balance -= amountOut;

        // Transfer tokens
        IERC20Upgradeable(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20Upgradeable(tokenOut).transfer(msg.sender, amountOut);

        // Update price oracle
        lastPrice[tokenIn][tokenOut] = _getSpotPrice(indexIn, indexOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Join pool with exact tokens in
     * @param tokensIn Array of token addresses
     * @param amountsIn Array of token amounts
     * @param minPoolAmountOut Minimum LP tokens to receive
     * @return poolAmountOut LP tokens minted
     */
    function joinPool(
        address[] memory tokensIn,
        uint256[] memory amountsIn,
        uint256 minPoolAmountOut
    ) external nonReentrant whenNotPaused returns (uint256 poolAmountOut) {
        require(tokensIn.length == amountsIn.length, "Length mismatch");

        uint256 ratio = type(uint256).max;
        uint256 totalSupply = totalSupply();

        // Calculate ratio for proportional join
        for (uint256 i = 0; i < tokensIn.length; i++) {
            uint256 idx = tokenIndex[tokensIn[i]];
            require(idx > 0, "Token not in pool");
            idx -= 1;

            require(amountsIn[i] > 0, "Zero amount");

            if (totalSupply == 0) {
                // Initial join
                poolAmountOut = _calcPoolOutGivenSingleIn(
                    tokens[idx].balance,
                    tokens[idx].weight,
                    totalSupply,
                    PRECISION,
                    amountsIn[i],
                    0 // No fee for initial deposit
                );
            } else {
                uint256 tokenRatio = (tokens[idx].balance + amountsIn[i]) * PRECISION / tokens[idx].balance;
                if (tokenRatio < ratio) {
                    ratio = tokenRatio;
                }
            }
        }

        if (totalSupply > 0) {
            poolAmountOut = (totalSupply * (ratio - PRECISION)) / PRECISION;
        }

        require(poolAmountOut >= minPoolAmountOut, "Slippage exceeded");

        // Transfer tokens and update balances
        for (uint256 i = 0; i < tokensIn.length; i++) {
            uint256 idx = tokenIndex[tokensIn[i]] - 1;
            tokens[idx].balance += amountsIn[i];
            IERC20Upgradeable(tokensIn[i]).transferFrom(msg.sender, address(this), amountsIn[i]);
        }

        _mint(msg.sender, poolAmountOut);

        emit Join(msg.sender, tokensIn, amountsIn, poolAmountOut);
    }

    /**
     * @notice Join pool with single token
     * @param tokenIn Token to deposit
     * @param amountIn Amount to deposit
     * @param minPoolAmountOut Minimum LP tokens
     * @return poolAmountOut LP tokens minted
     */
    function joinswapExternAmountIn(
        address tokenIn,
        uint256 amountIn,
        uint256 minPoolAmountOut
    ) external nonReentrant whenNotPaused returns (uint256 poolAmountOut) {
        uint256 idx = tokenIndex[tokenIn];
        require(idx > 0, "Token not in pool");
        idx -= 1;

        poolAmountOut = _calcPoolOutGivenSingleIn(
            tokens[idx].balance,
            tokens[idx].weight,
            totalSupply(),
            PRECISION,
            amountIn,
            swapFee
        );

        require(poolAmountOut >= minPoolAmountOut, "Slippage exceeded");

        tokens[idx].balance += amountIn;
        IERC20Upgradeable(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        _mint(msg.sender, poolAmountOut);

        address[] memory tokensIn = new address[](1);
        uint256[] memory amountsIn = new uint256[](1);
        tokensIn[0] = tokenIn;
        amountsIn[0] = amountIn;

        emit Join(msg.sender, tokensIn, amountsIn, poolAmountOut);
    }

    /**
     * @notice Exit pool proportionally
     * @param poolAmountIn LP tokens to burn
     * @param minAmountsOut Minimum token amounts
     * @return amountsOut Token amounts received
     */
    function exitPool(
        uint256 poolAmountIn,
        uint256[] memory minAmountsOut
    ) external nonReentrant returns (uint256[] memory amountsOut) {
        require(minAmountsOut.length == numTokens, "Invalid minAmounts length");
        require(poolAmountIn > 0, "Zero amount");

        uint256 totalSupply = totalSupply();
        uint256 ratio = (poolAmountIn * PRECISION) / totalSupply;

        amountsOut = new uint256[](numTokens);
        address[] memory tokensOut = new address[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            uint256 amountOut = (tokens[i].balance * ratio) / PRECISION;

            // Apply exit fee
            if (exitFee > 0) {
                uint256 fee = (amountOut * exitFee) / FEE_DENOMINATOR;
                amountOut -= fee;
                adminBalances[tokens[i].token] += fee;
            }

            require(amountOut >= minAmountsOut[i], "Slippage exceeded");

            amountsOut[i] = amountOut;
            tokensOut[i] = tokens[i].token;
            tokens[i].balance -= amountOut;

            IERC20Upgradeable(tokens[i].token).transfer(msg.sender, amountOut);
        }

        _burn(msg.sender, poolAmountIn);

        emit Exit(msg.sender, tokensOut, amountsOut, poolAmountIn);
    }

    /**
     * @notice Exit pool for single token
     * @param tokenOut Token to receive
     * @param poolAmountIn LP tokens to burn
     * @param minAmountOut Minimum token amount
     * @return amountOut Token amount received
     */
    function exitswapPoolAmountIn(
        address tokenOut,
        uint256 poolAmountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256 amountOut) {
        uint256 idx = tokenIndex[tokenOut];
        require(idx > 0, "Token not in pool");
        idx -= 1;

        amountOut = _calcSingleOutGivenPoolIn(
            tokens[idx].balance,
            tokens[idx].weight,
            totalSupply(),
            PRECISION,
            poolAmountIn,
            swapFee + exitFee
        );

        require(amountOut >= minAmountOut, "Slippage exceeded");

        tokens[idx].balance -= amountOut;
        _burn(msg.sender, poolAmountIn);
        IERC20Upgradeable(tokenOut).transfer(msg.sender, amountOut);

        address[] memory tokensOutArr = new address[](1);
        uint256[] memory amountsOut = new uint256[](1);
        tokensOutArr[0] = tokenOut;
        amountsOut[0] = amountOut;

        emit Exit(msg.sender, tokensOutArr, amountsOut, poolAmountIn);
    }

    // ============ Math Functions ============

    /**
     * @notice Calculate output amount given input
     * @dev A_out = B_out * (1 - (B_in / (B_in + A_in * (1-fee)))^(W_in/W_out))
     */
    function _calcOutGivenIn(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 fee
    ) internal pure returns (uint256) {
        uint256 weightRatio = (weightIn * PRECISION) / weightOut;
        uint256 adjustedIn = amountIn * (FEE_DENOMINATOR - fee) / FEE_DENOMINATOR;
        uint256 y = (balanceIn * PRECISION) / (balanceIn + adjustedIn);
        uint256 foo = _pow(y, weightRatio);
        uint256 bar = PRECISION - foo;
        return (balanceOut * bar) / PRECISION;
    }

    /**
     * @notice Calculate input amount given output
     * @dev A_in = B_in * ((B_out / (B_out - A_out))^(W_out/W_in) - 1) / (1-fee)
     */
    function _calcInGivenOut(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountOut,
        uint256 fee
    ) internal pure returns (uint256) {
        uint256 weightRatio = (weightOut * PRECISION) / weightIn;
        uint256 diff = balanceOut - amountOut;
        uint256 y = (balanceOut * PRECISION) / diff;
        uint256 foo = _pow(y, weightRatio);
        foo = foo - PRECISION;
        uint256 amountIn = (balanceIn * foo) / PRECISION;
        return (amountIn * FEE_DENOMINATOR) / (FEE_DENOMINATOR - fee);
    }

    /**
     * @notice Calculate pool tokens out given single token in
     */
    function _calcPoolOutGivenSingleIn(
        uint256 balance,
        uint256 weight,
        uint256 poolSupply,
        uint256 totalWeight,
        uint256 amountIn,
        uint256 fee
    ) internal pure returns (uint256) {
        uint256 normalizedWeight = (weight * PRECISION) / totalWeight;
        uint256 adjustedIn = amountIn * (FEE_DENOMINATOR - fee) / FEE_DENOMINATOR;
        uint256 newBalance = balance + adjustedIn;
        uint256 ratio = (newBalance * PRECISION) / balance;

        uint256 foo = _pow(ratio, normalizedWeight);
        return (poolSupply * (foo - PRECISION)) / PRECISION;
    }

    /**
     * @notice Calculate single token out given pool tokens in
     */
    function _calcSingleOutGivenPoolIn(
        uint256 balance,
        uint256 weight,
        uint256 poolSupply,
        uint256 totalWeight,
        uint256 poolAmountIn,
        uint256 fee
    ) internal pure returns (uint256) {
        uint256 normalizedWeight = (weight * PRECISION) / totalWeight;
        uint256 poolRatio = (poolSupply - poolAmountIn) * PRECISION / poolSupply;
        uint256 exp = PRECISION * PRECISION / normalizedWeight;
        uint256 foo = _pow(poolRatio, exp);
        uint256 tokenOutBeforeFee = balance * (PRECISION - foo) / PRECISION;
        uint256 feeAmount = (tokenOutBeforeFee * fee) / FEE_DENOMINATOR;
        return tokenOutBeforeFee - feeAmount;
    }

    /**
     * @notice Get spot price between two tokens
     * @dev Spot_price = (B_in / W_in) / (B_out / W_out)
     */
    function _getSpotPrice(uint256 indexIn, uint256 indexOut) internal view returns (uint256) {
        uint256 numer = (tokens[indexIn].balance * PRECISION) / tokens[indexIn].weight;
        uint256 denom = (tokens[indexOut].balance * PRECISION) / tokens[indexOut].weight;
        return (numer * PRECISION) / denom;
    }

    /**
     * @notice Power function (base^exp)
     * @dev Simplified power calculation for small exponents
     */
    function _pow(uint256 base, uint256 exp) internal pure returns (uint256) {
        require(base >= MIN_POW_BASE && base <= MAX_POW_BASE, "Invalid base");

        uint256 whole = exp / PRECISION;
        uint256 remain = exp % PRECISION;

        uint256 wholePow = _powi(base, whole);

        if (remain == 0) {
            return wholePow;
        }

        uint256 partialResult = _powApprox(base, remain);
        return (wholePow * partialResult) / PRECISION;
    }

    function _powi(uint256 a, uint256 n) internal pure returns (uint256) {
        uint256 result = PRECISION;
        for (uint256 i = 0; i < n; i++) {
            result = (result * a) / PRECISION;
        }
        return result;
    }

    function _powApprox(uint256 base, uint256 exp) internal pure returns (uint256) {
        uint256 a = exp;
        uint256 x = base;
        uint256 result = PRECISION;

        while (a > 0) {
            if (a % 2 != 0) {
                result = (result * x) / PRECISION;
            }
            x = (x * x) / PRECISION;
            a /= 2;
        }

        return result;
    }

    // ============ View Functions ============

    /**
     * @notice Get spot price with fee
     */
    function getSpotPrice(address tokenIn, address tokenOut) external view returns (uint256) {
        uint256 indexIn = tokenIndex[tokenIn];
        uint256 indexOut = tokenIndex[tokenOut];
        require(indexIn > 0 && indexOut > 0, "Token not in pool");

        uint256 spotPrice = _getSpotPrice(indexIn - 1, indexOut - 1);
        return (spotPrice * FEE_DENOMINATOR) / (FEE_DENOMINATOR - swapFee);
    }

    /**
     * @notice Calculate swap output (view)
     */
    function calcOutGivenIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256) {
        uint256 indexIn = tokenIndex[tokenIn];
        uint256 indexOut = tokenIndex[tokenOut];
        require(indexIn > 0 && indexOut > 0, "Token not in pool");

        indexIn -= 1;
        indexOut -= 1;

        return _calcOutGivenIn(
            tokens[indexIn].balance,
            tokens[indexIn].weight,
            tokens[indexOut].balance,
            tokens[indexOut].weight,
            amountIn,
            swapFee
        );
    }

    /**
     * @notice Get pool tokens
     */
    function getTokens() external view returns (address[] memory) {
        address[] memory addrs = new address[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            addrs[i] = tokens[i].token;
        }
        return addrs;
    }

    /**
     * @notice Get pool weights
     */
    function getWeights() external view returns (uint256[] memory) {
        uint256[] memory weights = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            weights[i] = tokens[i].weight;
        }
        return weights;
    }

    /**
     * @notice Get pool balances
     */
    function getBalances() external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            balances[i] = tokens[i].balance;
        }
        return balances;
    }

    // ============ Admin Functions ============

    function setFees(uint256 _swapFee, uint256 _exitFee, uint256 _adminFee) external onlyOwner {
        require(_swapFee <= MAX_FEE, "Swap fee too high");
        require(_exitFee <= MAX_FEE, "Exit fee too high");
        require(_adminFee <= FEE_DENOMINATOR, "Admin fee too high");

        swapFee = _swapFee;
        exitFee = _exitFee;
        adminFee = _adminFee;

        emit FeeUpdate(_swapFee, _exitFee, _adminFee);
    }

    function withdrawAdminFees() external onlyOwner {
        for (uint256 i = 0; i < numTokens; i++) {
            uint256 amount = adminBalances[tokens[i].token];
            if (amount > 0) {
                adminBalances[tokens[i].token] = 0;
                IERC20Upgradeable(tokens[i].token).transfer(owner(), amount);
            }
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
