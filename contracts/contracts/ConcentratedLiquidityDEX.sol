// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract ConcentratedLiquidityDEX is ReentrancyGuard, AccessControl, Pausable, ERC721Enumerable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    uint24 public constant MIN_TICK_SPACING = 1;
    uint24 public constant MAX_TICK_SPACING = 200;
    int24 public constant MIN_TICK = -887272;
    int24 public constant MAX_TICK = 887272;

    struct Pool {
        address token0;
        address token1;
        uint24 fee;
        uint24 tickSpacing;
        uint128 liquidity;
        uint160 sqrtPriceX96;
        int24 tick;
        uint256 feeGrowthGlobal0X128;
        uint256 feeGrowthGlobal1X128;
        uint128 protocolFees0;
        uint128 protocolFees1;
        bool unlocked;
    }

    struct Position {
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    struct Tick {
        uint128 liquidityGross;
        int128 liquidityNet;
        uint256 feeGrowthOutside0X128;
        uint256 feeGrowthOutside1X128;
        bool initialized;
    }

    struct PositionInfo {
        bytes32 poolId;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    struct SwapState {
        int256 amountSpecifiedRemaining;
        int256 amountCalculated;
        uint160 sqrtPriceX96;
        int24 tick;
        uint256 feeGrowthGlobalX128;
        uint128 protocolFee;
        uint128 liquidity;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(int24 => Tick)) public ticks;
    mapping(uint256 => PositionInfo) public positions;
    mapping(bytes32 => mapping(bytes32 => Position)) private _positions;

    uint256 private _nextPositionId = 1;
    uint24[] public availableFees = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    mapping(uint24 => uint24) public feeToTickSpacing;

    uint256 public protocolFeeRate = 2000; // 20% of swap fees
    uint256 public constant FEE_DENOMINATOR = 10000;

    event PoolCreated(
        address indexed token0,
        address indexed token1,
        uint24 indexed fee,
        uint24 tickSpacing,
        bytes32 poolId
    );

    event Mint(
        address sender,
        bytes32 indexed poolId,
        address indexed owner,
        int24 indexed tickLower,
        int24 tickUpper,
        uint128 amount,
        uint256 amount0,
        uint256 amount1
    );

    event Burn(
        address indexed owner,
        bytes32 indexed poolId,
        int24 indexed tickLower,
        int24 tickUpper,
        uint128 amount,
        uint256 amount0,
        uint256 amount1
    );

    event Swap(
        address indexed sender,
        bytes32 indexed poolId,
        address indexed recipient,
        int256 amount0,
        int256 amount1,
        uint160 sqrtPriceX96,
        uint128 liquidity,
        int24 tick
    );

    event Collect(
        address indexed owner,
        bytes32 poolId,
        address recipient,
        int24 indexed tickLower,
        int24 indexed tickUpper,
        uint128 amount0,
        uint128 amount1
    );

    event Flash(
        address indexed sender,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint256 paid0,
        uint256 paid1
    );

    event ProtocolFeeCollected(
        bytes32 indexed poolId,
        address indexed collector,
        uint128 amount0,
        uint128 amount1
    );

    modifier lock(bytes32 poolId) {
        require(pools[poolId].unlocked, "LOK");
        pools[poolId].unlocked = false;
        _;
        pools[poolId].unlocked = true;
    }

    constructor() ERC721("Concentrated Liquidity Position", "CLP") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        _setupRole(FEE_MANAGER_ROLE, msg.sender);

        feeToTickSpacing[500] = 10;
        feeToTickSpacing[3000] = 60;
        feeToTickSpacing[10000] = 200;
    }

    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external whenNotPaused returns (bytes32 poolId) {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
        require(tokenA != address(0) && tokenB != address(0), "ZERO_ADDRESS");
        require(feeToTickSpacing[fee] > 0, "INVALID_FEE");
        require(sqrtPriceX96 > 0, "INVALID_PRICE");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        poolId = keccak256(abi.encodePacked(token0, token1, fee));
        require(pools[poolId].token0 == address(0), "POOL_EXISTS");

        int24 tick = _getTickAtSqrtRatio(sqrtPriceX96);

        pools[poolId] = Pool({
            token0: token0,
            token1: token1,
            fee: fee,
            tickSpacing: feeToTickSpacing[fee],
            liquidity: 0,
            sqrtPriceX96: sqrtPriceX96,
            tick: tick,
            feeGrowthGlobal0X128: 0,
            feeGrowthGlobal1X128: 0,
            protocolFees0: 0,
            protocolFees1: 0,
            unlocked: true
        });

        emit PoolCreated(token0, token1, fee, feeToTickSpacing[fee], poolId);
    }

    function mint(
        bytes32 poolId,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        address recipient
    ) external nonReentrant whenNotPaused lock(poolId) returns (
        uint256 tokenId,
        uint256 amount0,
        uint256 amount1
    ) {
        Pool storage pool = pools[poolId];
        require(pool.token0 != address(0), "POOL_NOT_EXISTS");
        require(tickLower < tickUpper, "INVALID_RANGE");
        require(tickLower >= MIN_TICK && tickUpper <= MAX_TICK, "INVALID_TICK");
        require(tickLower % pool.tickSpacing == 0 && tickUpper % pool.tickSpacing == 0, "INVALID_SPACING");
        require(amount > 0, "ZERO_LIQUIDITY");

        _updatePosition(poolId, tickLower, tickUpper, int128(amount));

        (amount0, amount1) = _getAmountsForLiquidity(
            pool.sqrtPriceX96,
            _getSqrtRatioAtTick(tickLower),
            _getSqrtRatioAtTick(tickUpper),
            amount
        );

        if (amount0 > 0) IERC20(pool.token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(pool.token1).safeTransferFrom(msg.sender, address(this), amount1);

        tokenId = _nextPositionId++;
        positions[tokenId] = PositionInfo({
            poolId: poolId,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: amount,
            feeGrowthInside0LastX128: 0,
            feeGrowthInside1LastX128: 0,
            tokensOwed0: 0,
            tokensOwed1: 0
        });

        _safeMint(recipient, tokenId);

        emit Mint(msg.sender, poolId, recipient, tickLower, tickUpper, amount, amount0, amount1);
    }

    function burn(
        uint256 tokenId,
        uint128 amount
    ) external nonReentrant whenNotPaused returns (uint256 amount0, uint256 amount1) {
        require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");
        PositionInfo storage position = positions[tokenId];
        bytes32 poolId = position.poolId;
        Pool storage pool = pools[poolId];

        require(pool.unlocked, "LOK");
        pool.unlocked = false;

        require(amount <= position.liquidity, "INSUFFICIENT_LIQUIDITY");

        _updatePosition(poolId, position.tickLower, position.tickUpper, -int128(amount));

        (amount0, amount1) = _getAmountsForLiquidity(
            pool.sqrtPriceX96,
            _getSqrtRatioAtTick(position.tickLower),
            _getSqrtRatioAtTick(position.tickUpper),
            amount
        );

        position.liquidity -= amount;
        position.tokensOwed0 += uint128(amount0);
        position.tokensOwed1 += uint128(amount1);

        pool.unlocked = true;

        emit Burn(msg.sender, poolId, position.tickLower, position.tickUpper, amount, amount0, amount1);
    }

    function collect(
        uint256 tokenId,
        address recipient,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external nonReentrant returns (uint128 amount0, uint128 amount1) {
        require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");
        PositionInfo storage position = positions[tokenId];
        Pool storage pool = pools[position.poolId];

        amount0 = amount0Requested > position.tokensOwed0 ? position.tokensOwed0 : amount0Requested;
        amount1 = amount1Requested > position.tokensOwed1 ? position.tokensOwed1 : amount1Requested;

        if (amount0 > 0) {
            position.tokensOwed0 -= amount0;
            IERC20(pool.token0).safeTransfer(recipient, amount0);
        }
        if (amount1 > 0) {
            position.tokensOwed1 -= amount1;
            IERC20(pool.token1).safeTransfer(recipient, amount1);
        }

        emit Collect(msg.sender, position.poolId, recipient, position.tickLower, position.tickUpper, amount0, amount1);
    }

    function swap(
        bytes32 poolId,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        address recipient
    ) external nonReentrant whenNotPaused lock(poolId) returns (int256 amount0, int256 amount1) {
        Pool storage pool = pools[poolId];
        require(pool.token0 != address(0), "POOL_NOT_EXISTS");
        require(amountSpecified != 0, "ZERO_AMOUNT");

        SwapState memory state = SwapState({
            amountSpecifiedRemaining: amountSpecified,
            amountCalculated: 0,
            sqrtPriceX96: pool.sqrtPriceX96,
            tick: pool.tick,
            feeGrowthGlobalX128: zeroForOne ? pool.feeGrowthGlobal0X128 : pool.feeGrowthGlobal1X128,
            protocolFee: 0,
            liquidity: pool.liquidity
        });

        while (state.amountSpecifiedRemaining != 0 && state.sqrtPriceX96 != sqrtPriceLimitX96) {
            (uint160 sqrtPriceNextX96, uint256 amountIn, uint256 amountOut, uint256 feeAmount) =
                _computeSwapStep(
                    state.sqrtPriceX96,
                    sqrtPriceLimitX96,
                    state.liquidity,
                    state.amountSpecifiedRemaining,
                    pool.fee
                );

            state.sqrtPriceX96 = sqrtPriceNextX96;
            state.amountSpecifiedRemaining -= int256(amountIn);
            state.amountCalculated -= int256(amountOut);

            if (state.liquidity > 0) {
                uint256 _protocolFee = feeAmount.mul(protocolFeeRate).div(FEE_DENOMINATOR);
                state.feeGrowthGlobalX128 += ((feeAmount - _protocolFee) << 128) / state.liquidity;
                state.protocolFee += uint128(_protocolFee);
            }

            if (state.sqrtPriceX96 == sqrtPriceLimitX96) break;
        }

        pool.sqrtPriceX96 = state.sqrtPriceX96;
        pool.tick = _getTickAtSqrtRatio(state.sqrtPriceX96);
        pool.liquidity = state.liquidity;

        if (zeroForOne) {
            pool.feeGrowthGlobal0X128 = state.feeGrowthGlobalX128;
            pool.protocolFees0 += state.protocolFee;
            amount0 = amountSpecified - state.amountSpecifiedRemaining;
            amount1 = state.amountCalculated;
        } else {
            pool.feeGrowthGlobal1X128 = state.feeGrowthGlobalX128;
            pool.protocolFees1 += state.protocolFee;
            amount0 = state.amountCalculated;
            amount1 = amountSpecified - state.amountSpecifiedRemaining;
        }

        if (amount0 > 0) {
            IERC20(pool.token0).safeTransferFrom(msg.sender, address(this), uint256(amount0));
        } else {
            IERC20(pool.token0).safeTransfer(recipient, uint256(-amount0));
        }

        if (amount1 > 0) {
            IERC20(pool.token1).safeTransferFrom(msg.sender, address(this), uint256(amount1));
        } else {
            IERC20(pool.token1).safeTransfer(recipient, uint256(-amount1));
        }

        emit Swap(msg.sender, poolId, recipient, amount0, amount1, state.sqrtPriceX96, state.liquidity, pool.tick);
    }

    function flash(
        bytes32 poolId,
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external nonReentrant whenNotPaused lock(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.token0 != address(0), "POOL_NOT_EXISTS");

        uint256 balance0Before = IERC20(pool.token0).balanceOf(address(this));
        uint256 balance1Before = IERC20(pool.token1).balanceOf(address(this));

        if (amount0 > 0) IERC20(pool.token0).safeTransfer(recipient, amount0);
        if (amount1 > 0) IERC20(pool.token1).safeTransfer(recipient, amount1);

        IFlashCallback(msg.sender).flashCallback(amount0, amount1, data);

        uint256 balance0After = IERC20(pool.token0).balanceOf(address(this));
        uint256 balance1After = IERC20(pool.token1).balanceOf(address(this));

        uint256 fee0 = amount0.mul(pool.fee).div(FEE_DENOMINATOR);
        uint256 fee1 = amount1.mul(pool.fee).div(FEE_DENOMINATOR);

        require(balance0After >= balance0Before.add(fee0), "INSUFFICIENT_PAYMENT_0");
        require(balance1After >= balance1Before.add(fee1), "INSUFFICIENT_PAYMENT_1");

        uint256 paid0 = balance0After - balance0Before;
        uint256 paid1 = balance1After - balance1Before;

        if (paid0 > 0) {
            uint256 protocolFee0 = paid0.mul(protocolFeeRate).div(FEE_DENOMINATOR);
            pool.protocolFees0 += uint128(protocolFee0);
            pool.feeGrowthGlobal0X128 += ((paid0 - protocolFee0) << 128) / pool.liquidity;
        }

        if (paid1 > 0) {
            uint256 protocolFee1 = paid1.mul(protocolFeeRate).div(FEE_DENOMINATOR);
            pool.protocolFees1 += uint128(protocolFee1);
            pool.feeGrowthGlobal1X128 += ((paid1 - protocolFee1) << 128) / pool.liquidity;
        }

        emit Flash(msg.sender, recipient, amount0, amount1, paid0, paid1);
    }

    function collectProtocolFees(
        bytes32 poolId,
        address recipient
    ) external onlyRole(FEE_MANAGER_ROLE) returns (uint128 amount0, uint128 amount1) {
        Pool storage pool = pools[poolId];
        amount0 = pool.protocolFees0;
        amount1 = pool.protocolFees1;

        if (amount0 > 0) {
            pool.protocolFees0 = 0;
            IERC20(pool.token0).safeTransfer(recipient, amount0);
        }
        if (amount1 > 0) {
            pool.protocolFees1 = 0;
            IERC20(pool.token1).safeTransfer(recipient, amount1);
        }

        emit ProtocolFeeCollected(poolId, recipient, amount0, amount1);
    }

    function setProtocolFeeRate(uint256 _protocolFeeRate) external onlyRole(FEE_MANAGER_ROLE) {
        require(_protocolFeeRate <= FEE_DENOMINATOR, "INVALID_FEE_RATE");
        protocolFeeRate = _protocolFeeRate;
    }

    function addFeeOption(uint24 fee, uint24 tickSpacing) external onlyRole(OPERATOR_ROLE) {
        require(tickSpacing >= MIN_TICK_SPACING && tickSpacing <= MAX_TICK_SPACING, "INVALID_SPACING");
        require(feeToTickSpacing[fee] == 0, "FEE_EXISTS");
        availableFees.push(fee);
        feeToTickSpacing[fee] = tickSpacing;
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function _updatePosition(
        bytes32 poolId,
        int24 tickLower,
        int24 tickUpper,
        int128 liquidityDelta
    ) internal {
        Pool storage pool = pools[poolId];

        _updateTick(poolId, tickLower, liquidityDelta, false);
        _updateTick(poolId, tickUpper, liquidityDelta, true);

        if (tickLower <= pool.tick && pool.tick < tickUpper) {
            pool.liquidity = liquidityDelta > 0
                ? pool.liquidity + uint128(liquidityDelta)
                : pool.liquidity - uint128(-liquidityDelta);
        }
    }

    function _updateTick(
        bytes32 poolId,
        int24 tick,
        int128 liquidityDelta,
        bool upper
    ) internal {
        Tick storage info = ticks[poolId][tick];

        uint128 liquidityGrossBefore = info.liquidityGross;
        uint128 liquidityGrossAfter = liquidityDelta > 0
            ? liquidityGrossBefore + uint128(liquidityDelta)
            : liquidityGrossBefore - uint128(-liquidityDelta);

        if (liquidityGrossBefore == 0) {
            info.initialized = true;
            info.feeGrowthOutside0X128 = pools[poolId].feeGrowthGlobal0X128;
            info.feeGrowthOutside1X128 = pools[poolId].feeGrowthGlobal1X128;
        }

        info.liquidityGross = liquidityGrossAfter;
        info.liquidityNet = upper
            ? info.liquidityNet - liquidityDelta
            : info.liquidityNet + liquidityDelta;
    }

    function _computeSwapStep(
        uint160 sqrtRatioCurrentX96,
        uint160 sqrtRatioTargetX96,
        uint128 liquidity,
        int256 amountRemaining,
        uint24 fee
    ) internal pure returns (
        uint160 sqrtRatioNextX96,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount
    ) {
        bool zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
        bool exactIn = amountRemaining >= 0;

        if (exactIn) {
            uint256 amountRemainingLessFee = uint256(amountRemaining) * (FEE_DENOMINATOR - fee) / FEE_DENOMINATOR;
            amountIn = zeroForOne
                ? _getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
                : _getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);
            if (amountRemainingLessFee >= amountIn) sqrtRatioNextX96 = sqrtRatioTargetX96;
            else sqrtRatioNextX96 = _getNextSqrtPriceFromInput(
                sqrtRatioCurrentX96,
                liquidity,
                amountRemainingLessFee,
                zeroForOne
            );
        } else {
            amountOut = zeroForOne
                ? _getAmount1Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, false)
                : _getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, false);
            if (uint256(-amountRemaining) >= amountOut) sqrtRatioNextX96 = sqrtRatioTargetX96;
            else sqrtRatioNextX96 = _getNextSqrtPriceFromOutput(
                sqrtRatioCurrentX96,
                liquidity,
                uint256(-amountRemaining),
                zeroForOne
            );
        }

        bool max = sqrtRatioTargetX96 == sqrtRatioNextX96;

        if (zeroForOne) {
            amountIn = max && exactIn
                ? amountIn
                : _getAmount0Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
            amountOut = max && !exactIn
                ? amountOut
                : _getAmount1Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
        } else {
            amountIn = max && exactIn
                ? amountIn
                : _getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, true);
            amountOut = max && !exactIn
                ? amountOut
                : _getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, false);
        }

        if (!exactIn && amountOut > uint256(-amountRemaining)) {
            amountOut = uint256(-amountRemaining);
        }

        if (exactIn && sqrtRatioNextX96 != sqrtRatioTargetX96) {
            feeAmount = uint256(amountRemaining) - amountIn;
        } else {
            feeAmount = amountIn * fee / (FEE_DENOMINATOR - fee);
        }
    }

    function _getAmountsForLiquidity(
        uint160 sqrtRatioX96,
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (sqrtRatioAX96 > sqrtRatioBX96) (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);

        if (sqrtRatioX96 <= sqrtRatioAX96) {
            amount0 = _getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, true);
        } else if (sqrtRatioX96 < sqrtRatioBX96) {
            amount0 = _getAmount0Delta(sqrtRatioX96, sqrtRatioBX96, liquidity, true);
            amount1 = _getAmount1Delta(sqrtRatioAX96, sqrtRatioX96, liquidity, true);
        } else {
            amount1 = _getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, true);
        }
    }

    function _getAmount0Delta(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity,
        bool roundUp
    ) internal pure returns (uint256 amount0) {
        if (sqrtRatioAX96 > sqrtRatioBX96) (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);

        uint256 numerator1 = uint256(liquidity) << 96;
        uint256 numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

        amount0 = roundUp
            ? _divRoundingUp(numerator1 * numerator2, sqrtRatioBX96) / sqrtRatioAX96
            : (numerator1 * numerator2 / sqrtRatioBX96) / sqrtRatioAX96;
    }

    function _getAmount1Delta(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity,
        bool roundUp
    ) internal pure returns (uint256 amount1) {
        if (sqrtRatioAX96 > sqrtRatioBX96) (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);

        amount1 = roundUp
            ? _divRoundingUp(liquidity * (sqrtRatioBX96 - sqrtRatioAX96), 1 << 96)
            : liquidity * (sqrtRatioBX96 - sqrtRatioAX96) / (1 << 96);
    }

    function _getNextSqrtPriceFromInput(
        uint160 sqrtPX96,
        uint128 liquidity,
        uint256 amountIn,
        bool zeroForOne
    ) internal pure returns (uint160 sqrtQX96) {
        if (zeroForOne) {
            uint256 numerator = uint256(liquidity) << 96;
            uint256 product = amountIn * sqrtPX96;
            sqrtQX96 = uint160(numerator * sqrtPX96 / (numerator + product));
        } else {
            sqrtQX96 = uint160(uint256(sqrtPX96) + (amountIn << 96) / liquidity);
        }
    }

    function _getNextSqrtPriceFromOutput(
        uint160 sqrtPX96,
        uint128 liquidity,
        uint256 amountOut,
        bool zeroForOne
    ) internal pure returns (uint160 sqrtQX96) {
        if (zeroForOne) {
            sqrtQX96 = uint160(uint256(sqrtPX96) + _divRoundingUp(amountOut << 96, liquidity));
        } else {
            uint256 numerator = uint256(liquidity) << 96;
            uint256 product = amountOut * sqrtPX96;
            sqrtQX96 = uint160(_divRoundingUp(numerator * sqrtPX96, numerator - product));
        }
    }

    function _getTickAtSqrtRatio(uint160 sqrtPriceX96) internal pure returns (int24 tick) {
        uint256 ratio = uint256(sqrtPriceX96) << 32;
        uint256 r = ratio;
        uint256 msb = 0;

        assembly {
            msb := or(msb, shl(7, gt(r, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, shl(6, gt(r, 0xFFFFFFFFFFFFFFFF)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, shl(5, gt(r, 0xFFFFFFFF)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, shl(4, gt(r, 0xFFFF)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, shl(3, gt(r, 0xFF)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, shl(2, gt(r, 0xF)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, shl(1, gt(r, 0x3)))
            r := shr(msb, r)
        }
        assembly {
            msb := or(msb, gt(r, 0x1))
        }

        int256 log_2 = (int256(msb) - 128) << 64;
        assembly {
            r := shr(127, mul(r, r))
            let f := shr(128, r)
            log_2 := or(log_2, shl(63, f))
            r := shr(f, r)
        }
        assembly {
            r := shr(127, mul(r, r))
            let f := shr(128, r)
            log_2 := or(log_2, shl(62, f))
            r := shr(f, r)
        }
        assembly {
            r := shr(127, mul(r, r))
            let f := shr(128, r)
            log_2 := or(log_2, shl(61, f))
            r := shr(f, r)
        }
        assembly {
            r := shr(127, mul(r, r))
            let f := shr(128, r)
            log_2 := or(log_2, shl(60, f))
            r := shr(f, r)
        }
        assembly {
            r := shr(127, mul(r, r))
            let f := shr(128, r)
            log_2 := or(log_2, shl(59, f))
            r := shr(f, r)
        }
        assembly {
            r := shr(127, mul(r, r))
            let f := shr(128, r)
            log_2 := or(log_2, shl(58, f))
            r := shr(f, r)
        }

        int256 tick_low = int256((log_2 - 64987018007024263921919955520) >> 128);
        int256 tick_high = int256((log_2 + 4865618861154772428515456) >> 128);

        tick = tick_low == tick_high ? int24(tick_low) : _getSqrtRatioAtTick(int24(tick_high)) <= sqrtPriceX96 ? int24(tick_high) : int24(tick_low);
    }

    function _getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));

        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;

        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    function _divRoundingUp(uint256 a, uint256 b) internal pure returns (uint256 result) {
        assembly {
            result := add(div(a, b), gt(mod(a, b), 0))
        }
    }
}

interface IFlashCallback {
    function flashCallback(uint256 amount0, uint256 amount1, bytes calldata data) external;
}