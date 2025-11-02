// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract PriceOracle is AccessControl, Pausable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct PriceFeed {
        AggregatorV3Interface chainlinkFeed;
        uint256 heartbeat;
        uint256 decimals;
        bool isActive;
        bool useChainlink;
    }

    struct PriceData {
        uint256 price;
        uint256 timestamp;
        uint256 confidence;
        address source;
    }

    struct TWAP {
        uint256 priceCumulative;
        uint256 priceAverage;
        uint256 windowSize;
        uint256 granularity;
        uint256 lastUpdateTime;
        uint256[] observations;
    }

    mapping(address => PriceFeed) public priceFeeds;
    mapping(address => PriceData) public prices;
    mapping(address => mapping(address => uint256)) public pairPrices;
    mapping(address => TWAP) public twapData;

    mapping(address => bool) public trustedOracles;
    mapping(address => uint256) public oracleReputation;

    address[] public supportedAssets;
    uint256 public maxPriceDeviation = 500; // 5%
    uint256 public constant DEVIATION_DENOMINATOR = 10000;
    uint256 public constant CONFIDENCE_THRESHOLD = 8000; // 80%

    event PriceUpdated(
        address indexed asset,
        uint256 price,
        uint256 timestamp,
        address source
    );

    event PriceFeedAdded(
        address indexed asset,
        address indexed feed,
        uint256 heartbeat
    );

    event PriceFeedRemoved(address indexed asset);
    event OracleAdded(address indexed oracle);
    event OracleRemoved(address indexed oracle);
    event TWAPUpdated(address indexed asset, uint256 price);

    modifier onlyOracle() {
        require(
            hasRole(ORACLE_ROLE, msg.sender) || trustedOracles[msg.sender],
            "Not an oracle"
        );
        _;
    }

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(ORACLE_ROLE, msg.sender);
    }

    function addPriceFeed(
        address asset,
        address feedAddress,
        uint256 heartbeat,
        uint256 decimals
    ) external onlyRole(ADMIN_ROLE) {
        require(asset != address(0), "Invalid asset");
        require(feedAddress != address(0), "Invalid feed");

        priceFeeds[asset] = PriceFeed({
            chainlinkFeed: AggregatorV3Interface(feedAddress),
            heartbeat: heartbeat,
            decimals: decimals,
            isActive: true,
            useChainlink: true
        });

        if (!_isAssetSupported(asset)) {
            supportedAssets.push(asset);
        }

        emit PriceFeedAdded(asset, feedAddress, heartbeat);
    }

    function setPrice(
        address asset,
        uint256 price,
        uint256 confidence
    ) external onlyOracle whenNotPaused {
        require(price > 0, "Invalid price");
        require(confidence <= 10000, "Invalid confidence");

        PriceData storage priceData = prices[asset];

        // Check price deviation if there's an existing price
        if (priceData.price > 0) {
            uint256 deviation = _calculateDeviation(priceData.price, price);
            require(deviation <= maxPriceDeviation, "Price deviation too high");
        }

        priceData.price = price;
        priceData.timestamp = block.timestamp;
        priceData.confidence = confidence;
        priceData.source = msg.sender;

        // Update oracle reputation
        if (trustedOracles[msg.sender]) {
            oracleReputation[msg.sender]++;
        }

        // Update TWAP
        _updateTWAP(asset, price);

        emit PriceUpdated(asset, price, block.timestamp, msg.sender);
    }

    function setPrices(
        address[] calldata assets,
        uint256[] calldata _prices,
        uint256[] calldata confidences
    ) external onlyOracle whenNotPaused {
        require(assets.length == _prices.length, "Length mismatch");
        require(assets.length == confidences.length, "Length mismatch");

        for (uint256 i = 0; i < assets.length; i++) {
            this.setPrice(assets[i], _prices[i], confidences[i]);
        }
    }

    function getPrice(address asset) external view returns (uint256) {
        PriceFeed memory feed = priceFeeds[asset];

        if (feed.useChainlink && feed.isActive) {
            return _getChainlinkPrice(asset);
        }

        PriceData memory priceData = prices[asset];
        require(priceData.price > 0, "Price not available");
        require(
            block.timestamp - priceData.timestamp <= feed.heartbeat,
            "Price stale"
        );
        require(
            priceData.confidence >= CONFIDENCE_THRESHOLD,
            "Low confidence"
        );

        return priceData.price;
    }

    function getPriceWithConfidence(address asset)
        external
        view
        returns (uint256 price, uint256 confidence, uint256 timestamp)
    {
        PriceData memory priceData = prices[asset];
        return (priceData.price, priceData.confidence, priceData.timestamp);
    }

    function getPairPrice(address tokenA, address tokenB)
        external
        view
        returns (uint256)
    {
        if (pairPrices[tokenA][tokenB] > 0) {
            return pairPrices[tokenA][tokenB];
        }

        uint256 priceA = this.getPrice(tokenA);
        uint256 priceB = this.getPrice(tokenB);

        return (priceA * 1e18) / priceB;
    }

    function getTWAP(address asset, uint256 window)
        external
        view
        returns (uint256)
    {
        TWAP memory twap = twapData[asset];
        require(twap.observations.length > 0, "No TWAP data");
        require(window <= twap.windowSize, "Window too large");

        uint256 sum = 0;
        uint256 count = 0;
        uint256 cutoffTime = block.timestamp - window;

        for (uint256 i = twap.observations.length; i > 0; i--) {
            if (twap.observations[i - 1] > cutoffTime) {
                sum += twap.observations[i - 1];
                count++;
            } else {
                break;
            }
        }

        require(count > 0, "No observations in window");
        return sum / count;
    }

    function initializeTWAP(
        address asset,
        uint256 windowSize,
        uint256 granularity
    ) external onlyRole(ADMIN_ROLE) {
        require(windowSize > 0, "Invalid window");
        require(granularity > 0, "Invalid granularity");

        twapData[asset] = TWAP({
            priceCumulative: 0,
            priceAverage: 0,
            windowSize: windowSize,
            granularity: granularity,
            lastUpdateTime: block.timestamp,
            observations: new uint256[](0)
        });
    }

    function _updateTWAP(address asset, uint256 price) internal {
        TWAP storage twap = twapData[asset];

        if (twap.windowSize == 0) {
            return; // TWAP not initialized
        }

        uint256 timeElapsed = block.timestamp - twap.lastUpdateTime;

        if (timeElapsed >= twap.granularity) {
            twap.priceCumulative += price * timeElapsed;
            twap.observations.push(price);

            // Keep only observations within window
            uint256 cutoffTime = block.timestamp - twap.windowSize;
            uint256 validObservations = 0;

            for (uint256 i = 0; i < twap.observations.length; i++) {
                if (block.timestamp - (i * twap.granularity) > cutoffTime) {
                    validObservations = i;
                    break;
                }
            }

            if (validObservations > 0) {
                // Remove old observations
                uint256[] memory newObservations = new uint256[](
                    twap.observations.length - validObservations
                );
                for (uint256 i = validObservations; i < twap.observations.length; i++) {
                    newObservations[i - validObservations] = twap.observations[i];
                }
                twap.observations = newObservations;
            }

            twap.lastUpdateTime = block.timestamp;
            twap.priceAverage = twap.priceCumulative / twap.windowSize;

            emit TWAPUpdated(asset, twap.priceAverage);
        }
    }

    function _getChainlinkPrice(address asset) internal view returns (uint256) {
        PriceFeed memory feed = priceFeeds[asset];
        require(address(feed.chainlinkFeed) != address(0), "Feed not set");

        (
            uint80 roundId,
            int256 price,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.chainlinkFeed.latestRoundData();

        require(price > 0, "Invalid price");
        require(updatedAt > 0, "Round not complete");
        require(answeredInRound >= roundId, "Stale price");
        require(
            block.timestamp - updatedAt <= feed.heartbeat,
            "Price too old"
        );

        // Normalize to 18 decimals
        if (feed.decimals < 18) {
            return uint256(price) * (10 ** (18 - feed.decimals));
        } else if (feed.decimals > 18) {
            return uint256(price) / (10 ** (feed.decimals - 18));
        }

        return uint256(price);
    }

    function _calculateDeviation(uint256 oldPrice, uint256 newPrice)
        internal
        pure
        returns (uint256)
    {
        if (oldPrice == 0) return 0;

        uint256 diff = oldPrice > newPrice
            ? oldPrice - newPrice
            : newPrice - oldPrice;

        return (diff * DEVIATION_DENOMINATOR) / oldPrice;
    }

    function _isAssetSupported(address asset) internal view returns (bool) {
        for (uint256 i = 0; i < supportedAssets.length; i++) {
            if (supportedAssets[i] == asset) {
                return true;
            }
        }
        return false;
    }

    function addTrustedOracle(address oracle) external onlyRole(ADMIN_ROLE) {
        require(!trustedOracles[oracle], "Already trusted");
        trustedOracles[oracle] = true;
        emit OracleAdded(oracle);
    }

    function removeTrustedOracle(address oracle) external onlyRole(ADMIN_ROLE) {
        require(trustedOracles[oracle], "Not trusted");
        trustedOracles[oracle] = false;
        emit OracleRemoved(oracle);
    }

    function setMaxDeviation(uint256 deviation) external onlyRole(ADMIN_ROLE) {
        require(deviation <= DEVIATION_DENOMINATOR, "Invalid deviation");
        maxPriceDeviation = deviation;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return supportedAssets;
    }

    function getOracleReputation(address oracle) external view returns (uint256) {
        return oracleReputation[oracle];
    }
}