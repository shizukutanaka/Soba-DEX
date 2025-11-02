// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract LimitOrderBook is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    enum OrderType { LIMIT, STOP_LOSS, TAKE_PROFIT, TRAILING_STOP }
    enum OrderStatus { PENDING, FILLED, PARTIALLY_FILLED, CANCELLED, EXPIRED }

    struct Order {
        uint256 id;
        address maker;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 filledAmountIn;
        uint256 filledAmountOut;
        OrderType orderType;
        OrderStatus status;
        uint256 price; // Price in 18 decimals
        uint256 stopPrice; // For stop orders
        uint256 trailingDistance; // For trailing stop orders
        uint256 highestPrice; // For trailing stop tracking
        uint256 expirationTime;
        uint256 createdAt;
        uint256 nonce;
    }

    struct OrderBook {
        EnumerableSet.UintSet buyOrderIds;
        EnumerableSet.UintSet sellOrderIds;
        mapping(uint256 => uint256[]) priceToOrderIds;
        uint256[] sortedBuyPrices;
        uint256[] sortedSellPrices;
    }

    uint256 private _nextOrderId = 1;
    uint256 public minOrderSize = 1e15; // Minimum order size
    uint256 public makerFee = 10; // 0.1%
    uint256 public takerFee = 20; // 0.2%
    uint256 public constant FEE_DENOMINATOR = 10000;

    mapping(uint256 => Order) public orders;
    mapping(address => EnumerableSet.UintSet) private _userOrders;
    mapping(bytes32 => OrderBook) private _orderBooks;
    mapping(address => mapping(address => uint256)) public userBalances;
    mapping(bytes32 => uint256) public currentPrices;

    uint256 public collectedFees;
    address public feeRecipient;

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        OrderType orderType,
        uint256 price
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    event OrderPartiallyFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256 amountIn,
        uint256 amountOut,
        uint256 remainingAmountIn
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);
    event OrderExpired(uint256 indexed orderId);
    event StopOrderTriggered(uint256 indexed orderId, uint256 triggerPrice);
    event TrailingStopUpdated(uint256 indexed orderId, uint256 newStopPrice, uint256 currentPrice);

    modifier validPair(address tokenA, address tokenB) {
        require(tokenA != address(0) && tokenB != address(0), "Invalid tokens");
        require(tokenA != tokenB, "Same token");
        _;
    }

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        _setupRole(EXECUTOR_ROLE, msg.sender);
        feeRecipient = _feeRecipient;
    }

    function placeLimitOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 expirationTime
    ) external nonReentrant whenNotPaused validPair(tokenIn, tokenOut) returns (uint256 orderId) {
        require(amountIn >= minOrderSize, "Order too small");
        require(amountOut > 0, "Invalid amount out");
        require(expirationTime == 0 || expirationTime > block.timestamp, "Invalid expiration");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        orderId = _createOrder(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            OrderType.LIMIT,
            0,
            0,
            expirationTime
        );

        _addToOrderBook(orderId, tokenIn, tokenOut);
        emit OrderPlaced(orderId, msg.sender, tokenIn, tokenOut, amountIn, amountOut, OrderType.LIMIT, _calculatePrice(amountOut, amountIn));
    }

    function placeStopLossOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 stopPrice,
        uint256 limitPrice,
        uint256 expirationTime
    ) external nonReentrant whenNotPaused validPair(tokenIn, tokenOut) returns (uint256 orderId) {
        require(amountIn >= minOrderSize, "Order too small");
        require(stopPrice > 0, "Invalid stop price");
        require(limitPrice > 0, "Invalid limit price");
        require(expirationTime == 0 || expirationTime > block.timestamp, "Invalid expiration");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = (amountIn * limitPrice) / 1e18;

        orderId = _createOrder(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            OrderType.STOP_LOSS,
            stopPrice,
            0,
            expirationTime
        );

        _userOrders[msg.sender].add(orderId);
        emit OrderPlaced(orderId, msg.sender, tokenIn, tokenOut, amountIn, amountOut, OrderType.STOP_LOSS, limitPrice);
    }

    function placeTrailingStopOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 trailingDistance,
        uint256 expirationTime
    ) external nonReentrant whenNotPaused validPair(tokenIn, tokenOut) returns (uint256 orderId) {
        require(amountIn >= minOrderSize, "Order too small");
        require(trailingDistance > 0 && trailingDistance < 1e18, "Invalid trailing distance");
        require(expirationTime == 0 || expirationTime > block.timestamp, "Invalid expiration");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        bytes32 pairId = _getPairId(tokenIn, tokenOut);
        uint256 currentPrice = currentPrices[pairId];
        require(currentPrice > 0, "No price feed");

        uint256 stopPrice = (currentPrice * (1e18 - trailingDistance)) / 1e18;
        uint256 amountOut = (amountIn * stopPrice) / 1e18;

        orderId = _createOrder(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            OrderType.TRAILING_STOP,
            stopPrice,
            trailingDistance,
            expirationTime
        );

        orders[orderId].highestPrice = currentPrice;
        _userOrders[msg.sender].add(orderId);
        emit OrderPlaced(orderId, msg.sender, tokenIn, tokenOut, amountIn, amountOut, OrderType.TRAILING_STOP, stopPrice);
    }

    function fillOrder(
        uint256 orderId,
        uint256 fillAmount
    ) external nonReentrant whenNotPaused {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.PENDING || order.status == OrderStatus.PARTIALLY_FILLED, "Order not fillable");
        require(fillAmount > 0 && fillAmount <= order.amountIn - order.filledAmountIn, "Invalid fill amount");

        address taker = msg.sender;
        require(taker != order.maker, "Cannot fill own order");

        uint256 outputAmount = (fillAmount * order.amountOut) / order.amountIn;
        uint256 fee = (outputAmount * takerFee) / FEE_DENOMINATOR;
        uint256 outputAfterFee = outputAmount - fee;

        IERC20(order.tokenOut).safeTransferFrom(taker, address(this), outputAmount);
        IERC20(order.tokenOut).safeTransfer(order.maker, outputAfterFee);
        IERC20(order.tokenIn).safeTransfer(taker, fillAmount);

        order.filledAmountIn += fillAmount;
        order.filledAmountOut += outputAmount;

        if (order.filledAmountIn == order.amountIn) {
            order.status = OrderStatus.FILLED;
            _removeFromOrderBook(orderId, order.tokenIn, order.tokenOut);
            emit OrderFilled(orderId, taker, fillAmount, outputAmount, fee);
        } else {
            order.status = OrderStatus.PARTIALLY_FILLED;
            emit OrderPartiallyFilled(orderId, taker, fillAmount, outputAmount, order.amountIn - order.filledAmountIn);
        }

        collectedFees += fee;
    }

    function matchOrders(
        uint256[] calldata buyOrderIds,
        uint256[] calldata sellOrderIds
    ) external onlyRole(EXECUTOR_ROLE) whenNotPaused {
        for (uint256 i = 0; i < buyOrderIds.length && i < sellOrderIds.length; i++) {
            Order storage buyOrder = orders[buyOrderIds[i]];
            Order storage sellOrder = orders[sellOrderIds[i]];

            if (buyOrder.status != OrderStatus.PENDING || sellOrder.status != OrderStatus.PENDING) continue;
            if (buyOrder.tokenIn != sellOrder.tokenOut || buyOrder.tokenOut != sellOrder.tokenIn) continue;

            uint256 buyPrice = _calculatePrice(buyOrder.amountOut, buyOrder.amountIn);
            uint256 sellPrice = _calculatePrice(sellOrder.amountIn, sellOrder.amountOut);

            if (buyPrice >= sellPrice) {
                uint256 matchAmount = _min(
                    buyOrder.amountIn - buyOrder.filledAmountIn,
                    sellOrder.amountOut - sellOrder.filledAmountOut
                );

                _executeTrade(buyOrderIds[i], sellOrderIds[i], matchAmount);
            }
        }
    }

    function checkAndExecuteStopOrders() external onlyRole(EXECUTOR_ROLE) whenNotPaused {
        uint256[] memory userOrderIds = _userOrders[msg.sender].values();

        for (uint256 i = 0; i < userOrderIds.length; i++) {
            Order storage order = orders[userOrderIds[i]];

            if (order.status != OrderStatus.PENDING) continue;

            bytes32 pairId = _getPairId(order.tokenIn, order.tokenOut);
            uint256 currentPrice = currentPrices[pairId];

            if (order.orderType == OrderType.STOP_LOSS && currentPrice <= order.stopPrice) {
                _convertToMarketOrder(userOrderIds[i]);
                emit StopOrderTriggered(userOrderIds[i], currentPrice);
            } else if (order.orderType == OrderType.TRAILING_STOP) {
                if (currentPrice > order.highestPrice) {
                    order.highestPrice = currentPrice;
                    order.stopPrice = (currentPrice * (1e18 - order.trailingDistance)) / 1e18;
                    emit TrailingStopUpdated(userOrderIds[i], order.stopPrice, currentPrice);
                } else if (currentPrice <= order.stopPrice) {
                    _convertToMarketOrder(userOrderIds[i]);
                    emit StopOrderTriggered(userOrderIds[i], currentPrice);
                }
            }
        }
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.maker == msg.sender, "Not order maker");
        require(order.status == OrderStatus.PENDING || order.status == OrderStatus.PARTIALLY_FILLED, "Cannot cancel");

        uint256 remainingAmount = order.amountIn - order.filledAmountIn;
        if (remainingAmount > 0) {
            IERC20(order.tokenIn).safeTransfer(order.maker, remainingAmount);
        }

        order.status = OrderStatus.CANCELLED;
        _removeFromOrderBook(orderId, order.tokenIn, order.tokenOut);
        emit OrderCancelled(orderId, order.maker);
    }

    function cancelExpiredOrders(uint256[] calldata orderIds) external onlyRole(EXECUTOR_ROLE) {
        for (uint256 i = 0; i < orderIds.length; i++) {
            Order storage order = orders[orderIds[i]];

            if (order.expirationTime > 0 &&
                order.expirationTime <= block.timestamp &&
                (order.status == OrderStatus.PENDING || order.status == OrderStatus.PARTIALLY_FILLED)) {

                uint256 remainingAmount = order.amountIn - order.filledAmountIn;
                if (remainingAmount > 0) {
                    IERC20(order.tokenIn).safeTransfer(order.maker, remainingAmount);
                }

                order.status = OrderStatus.EXPIRED;
                _removeFromOrderBook(orderIds[i], order.tokenIn, order.tokenOut);
                emit OrderExpired(orderIds[i]);
            }
        }
    }

    function updatePrice(address tokenA, address tokenB, uint256 price) external onlyRole(EXECUTOR_ROLE) {
        bytes32 pairId = _getPairId(tokenA, tokenB);
        currentPrices[pairId] = price;
    }

    function withdrawFees() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 amount = collectedFees;
        collectedFees = 0;
        // Transfer fees to feeRecipient
    }

    function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRecipient = _feeRecipient;
    }

    function setFees(uint256 _makerFee, uint256 _takerFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_makerFee <= 100 && _takerFee <= 100, "Fees too high");
        makerFee = _makerFee;
        takerFee = _takerFee;
    }

    function setMinOrderSize(uint256 _minOrderSize) external onlyRole(OPERATOR_ROLE) {
        minOrderSize = _minOrderSize;
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return _userOrders[user].values();
    }

    function getOrderBookDepth(
        address tokenA,
        address tokenB,
        uint256 maxDepth
    ) external view returns (
        uint256[] memory buyPrices,
        uint256[] memory buyAmounts,
        uint256[] memory sellPrices,
        uint256[] memory sellAmounts
    ) {
        bytes32 pairId = _getPairId(tokenA, tokenB);
        OrderBook storage book = _orderBooks[pairId];

        uint256 buyDepth = _min(book.sortedBuyPrices.length, maxDepth);
        uint256 sellDepth = _min(book.sortedSellPrices.length, maxDepth);

        buyPrices = new uint256[](buyDepth);
        buyAmounts = new uint256[](buyDepth);
        sellPrices = new uint256[](sellDepth);
        sellAmounts = new uint256[](sellDepth);

        for (uint256 i = 0; i < buyDepth; i++) {
            buyPrices[i] = book.sortedBuyPrices[i];
            uint256[] memory orderIds = book.priceToOrderIds[buyPrices[i]];
            for (uint256 j = 0; j < orderIds.length; j++) {
                Order memory order = orders[orderIds[j]];
                buyAmounts[i] += order.amountIn - order.filledAmountIn;
            }
        }

        for (uint256 i = 0; i < sellDepth; i++) {
            sellPrices[i] = book.sortedSellPrices[i];
            uint256[] memory orderIds = book.priceToOrderIds[sellPrices[i]];
            for (uint256 j = 0; j < orderIds.length; j++) {
                Order memory order = orders[orderIds[j]];
                sellAmounts[i] += order.amountIn - order.filledAmountIn;
            }
        }
    }

    function _createOrder(
        address maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        OrderType orderType,
        uint256 stopPrice,
        uint256 trailingDistance,
        uint256 expirationTime
    ) internal returns (uint256 orderId) {
        orderId = _nextOrderId++;

        orders[orderId] = Order({
            id: orderId,
            maker: maker,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: amountOut,
            filledAmountIn: 0,
            filledAmountOut: 0,
            orderType: orderType,
            status: OrderStatus.PENDING,
            price: _calculatePrice(amountOut, amountIn),
            stopPrice: stopPrice,
            trailingDistance: trailingDistance,
            highestPrice: 0,
            expirationTime: expirationTime,
            createdAt: block.timestamp,
            nonce: block.number
        });

        _userOrders[maker].add(orderId);
    }

    function _addToOrderBook(uint256 orderId, address tokenIn, address tokenOut) internal {
        bytes32 pairId = _getPairId(tokenIn, tokenOut);
        OrderBook storage book = _orderBooks[pairId];
        Order memory order = orders[orderId];

        bool isBuyOrder = tokenIn < tokenOut;
        if (isBuyOrder) {
            book.buyOrderIds.add(orderId);
            _insertSortedPrice(book.sortedBuyPrices, order.price, false);
        } else {
            book.sellOrderIds.add(orderId);
            _insertSortedPrice(book.sortedSellPrices, order.price, true);
        }

        book.priceToOrderIds[order.price].push(orderId);
    }

    function _removeFromOrderBook(uint256 orderId, address tokenIn, address tokenOut) internal {
        bytes32 pairId = _getPairId(tokenIn, tokenOut);
        OrderBook storage book = _orderBooks[pairId];

        bool isBuyOrder = tokenIn < tokenOut;
        if (isBuyOrder) {
            book.buyOrderIds.remove(orderId);
        } else {
            book.sellOrderIds.remove(orderId);
        }

        _userOrders[orders[orderId].maker].remove(orderId);
    }

    function _executeTrade(uint256 buyOrderId, uint256 sellOrderId, uint256 amount) internal {
        Order storage buyOrder = orders[buyOrderId];
        Order storage sellOrder = orders[sellOrderId];

        uint256 buyerReceives = (amount * buyOrder.amountOut) / buyOrder.amountIn;
        uint256 sellerReceives = amount;

        uint256 buyerFee = (buyerReceives * makerFee) / FEE_DENOMINATOR;
        uint256 sellerFee = (sellerReceives * makerFee) / FEE_DENOMINATOR;

        IERC20(buyOrder.tokenOut).safeTransfer(buyOrder.maker, buyerReceives - buyerFee);
        IERC20(sellOrder.tokenOut).safeTransfer(sellOrder.maker, sellerReceives - sellerFee);

        buyOrder.filledAmountIn += amount;
        buyOrder.filledAmountOut += buyerReceives;
        sellOrder.filledAmountIn += sellerReceives;
        sellOrder.filledAmountOut += amount;

        if (buyOrder.filledAmountIn == buyOrder.amountIn) {
            buyOrder.status = OrderStatus.FILLED;
            _removeFromOrderBook(buyOrderId, buyOrder.tokenIn, buyOrder.tokenOut);
        } else {
            buyOrder.status = OrderStatus.PARTIALLY_FILLED;
        }

        if (sellOrder.filledAmountIn == sellOrder.amountIn) {
            sellOrder.status = OrderStatus.FILLED;
            _removeFromOrderBook(sellOrderId, sellOrder.tokenIn, sellOrder.tokenOut);
        } else {
            sellOrder.status = OrderStatus.PARTIALLY_FILLED;
        }

        collectedFees += buyerFee + sellerFee;
    }

    function _convertToMarketOrder(uint256 orderId) internal {
        Order storage order = orders[orderId];
        order.orderType = OrderType.LIMIT;
        order.price = 0;
        _addToOrderBook(orderId, order.tokenIn, order.tokenOut);
    }

    function _insertSortedPrice(uint256[] storage prices, uint256 price, bool ascending) internal {
        uint256 index = _findInsertIndex(prices, price, ascending);
        prices.push();
        for (uint256 i = prices.length - 1; i > index; i--) {
            prices[i] = prices[i - 1];
        }
        prices[index] = price;
    }

    function _findInsertIndex(uint256[] memory prices, uint256 price, bool ascending) internal pure returns (uint256) {
        if (prices.length == 0) return 0;

        uint256 left = 0;
        uint256 right = prices.length - 1;

        while (left <= right) {
            uint256 mid = (left + right) / 2;

            if (ascending) {
                if (prices[mid] < price) {
                    left = mid + 1;
                } else {
                    if (mid == 0) return 0;
                    right = mid - 1;
                }
            } else {
                if (prices[mid] > price) {
                    left = mid + 1;
                } else {
                    if (mid == 0) return 0;
                    right = mid - 1;
                }
            }
        }

        return left;
    }

    function _getPairId(address tokenA, address tokenB) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenA < tokenB ? tokenA : tokenB, tokenA < tokenB ? tokenB : tokenA));
    }

    function _calculatePrice(uint256 amountOut, uint256 amountIn) internal pure returns (uint256) {
        return (amountOut * 1e18) / amountIn;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}