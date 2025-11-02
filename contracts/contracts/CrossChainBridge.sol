// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

contract CrossChainBridge is ReentrancyGuard, AccessControl, Pausable, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    struct BridgeRequest {
        uint256 nonce;
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 targetChain;
        uint256 fee;
        uint256 timestamp;
        bytes32 txHash;
    }

    struct ChainConfig {
        bool isActive;
        uint256 minConfirmations;
        uint256 maxTransferAmount;
        uint256 dailyLimit;
        uint256 dailyTransferred;
        uint256 lastResetTime;
        uint256 baseFee;
        uint256 percentageFee; // basis points
    }

    struct TokenConfig {
        bool isSupported;
        uint256 minAmount;
        uint256 maxAmount;
        address wrappedToken;
        uint8 decimals;
    }

    uint256 public currentNonce;
    uint256 public requiredValidations;
    uint256 public totalValidators;

    mapping(uint256 => ChainConfig) public chains;
    mapping(address => TokenConfig) public tokens;
    mapping(bytes32 => BridgeRequest) public bridgeRequests;
    mapping(bytes32 => mapping(address => bool)) public validations;
    mapping(bytes32 => uint256) public validationCounts;
    mapping(bytes32 => bool) public processedRequests;
    mapping(address => uint256) public userNonces;

    mapping(address => uint256) public liquidityPool;
    mapping(address => uint256) public collectedFees;

    uint256[] public supportedChains;
    address[] public supportedTokens;

    address public feeRecipient;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MAX_PERCENTAGE_FEE = 500; // 5%

    bytes32 private constant BRIDGE_REQUEST_TYPEHASH = keccak256(
        "BridgeRequest(uint256 nonce,address sender,address recipient,address token,uint256 amount,uint256 targetChain,uint256 fee)"
    );

    event BridgeInitiated(
        bytes32 indexed requestId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint256 targetChain,
        address recipient
    );

    event BridgeCompleted(
        bytes32 indexed requestId,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );

    event ValidationAdded(
        bytes32 indexed requestId,
        address indexed validator,
        uint256 validationCount
    );

    event ChainAdded(uint256 indexed chainId, uint256 minConfirmations, uint256 maxTransfer);
    event ChainUpdated(uint256 indexed chainId, bool isActive);
    event TokenAdded(address indexed token, uint256 minAmount, uint256 maxAmount);
    event TokenUpdated(address indexed token, bool isSupported);

    event LiquidityAdded(address indexed provider, address indexed token, uint256 amount);
    event LiquidityRemoved(address indexed provider, address indexed token, uint256 amount);
    event FeesCollected(address indexed token, uint256 amount);

    modifier onlyValidator() {
        require(hasRole(VALIDATOR_ROLE, msg.sender), "Not a validator");
        _;
    }

    constructor(
        address _feeRecipient,
        uint256 _requiredValidations
    ) EIP712("CrossChainBridge", "1") {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        require(_requiredValidations > 0, "Invalid validations");

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        _setupRole(VALIDATOR_ROLE, msg.sender);
        _setupRole(FEE_MANAGER_ROLE, msg.sender);

        feeRecipient = _feeRecipient;
        requiredValidations = _requiredValidations;
        totalValidators = 1;
    }

    function initiateBridge(
        address token,
        uint256 amount,
        uint256 targetChain,
        address recipient
    ) external payable nonReentrant whenNotPaused returns (bytes32 requestId) {
        require(tokens[token].isSupported, "Token not supported");
        require(chains[targetChain].isActive, "Chain not active");
        require(amount >= tokens[token].minAmount, "Amount too small");
        require(amount <= tokens[token].maxAmount, "Amount too large");
        require(recipient != address(0), "Invalid recipient");

        ChainConfig storage chain = chains[targetChain];
        require(amount <= chain.maxTransferAmount, "Exceeds max transfer");

        _updateDailyLimit(targetChain);
        require(chain.dailyTransferred + amount <= chain.dailyLimit, "Exceeds daily limit");

        uint256 fee = calculateFee(amount, targetChain);
        require(msg.value >= fee, "Insufficient fee");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        uint256 nonce = userNonces[msg.sender]++;
        requestId = keccak256(
            abi.encodePacked(
                block.timestamp,
                msg.sender,
                token,
                amount,
                targetChain,
                recipient,
                nonce
            )
        );

        bridgeRequests[requestId] = BridgeRequest({
            nonce: nonce,
            sender: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            targetChain: targetChain,
            fee: fee,
            timestamp: block.timestamp,
            txHash: requestId
        });

        chain.dailyTransferred += amount;
        collectedFees[address(0)] += fee;

        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }

        emit BridgeInitiated(requestId, msg.sender, token, amount, targetChain, recipient);
    }

    function completeBridge(
        bytes32 requestId,
        address recipient,
        address token,
        uint256 amount,
        uint256 sourceChain,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        require(!processedRequests[requestId], "Already processed");
        require(tokens[token].isSupported, "Token not supported");
        require(chains[sourceChain].isActive, "Chain not active");
        require(signatures.length >= requiredValidations, "Insufficient signatures");

        bytes32 messageHash = _hashBridgeCompletion(requestId, recipient, token, amount, sourceChain);

        uint256 validSignatures = 0;
        address[] memory signers = new address[](signatures.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = messageHash.toEthSignedMessageHash().recover(signatures[i]);
            require(hasRole(VALIDATOR_ROLE, signer), "Invalid validator");

            bool duplicate = false;
            for (uint256 j = 0; j < i; j++) {
                if (signers[j] == signer) {
                    duplicate = true;
                    break;
                }
            }

            if (!duplicate) {
                signers[i] = signer;
                validSignatures++;
            }
        }

        require(validSignatures >= requiredValidations, "Insufficient valid signatures");

        processedRequests[requestId] = true;

        uint256 availableLiquidity = liquidityPool[token];
        require(availableLiquidity >= amount, "Insufficient liquidity");

        liquidityPool[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit BridgeCompleted(requestId, recipient, token, amount);
    }

    function validateBridgeRequest(bytes32 requestId) external onlyValidator {
        require(!processedRequests[requestId], "Already processed");
        require(!validations[requestId][msg.sender], "Already validated");

        validations[requestId][msg.sender] = true;
        validationCounts[requestId]++;

        emit ValidationAdded(requestId, msg.sender, validationCounts[requestId]);

        if (validationCounts[requestId] >= requiredValidations) {
            _processBridgeRequest(requestId);
        }
    }

    function addLiquidity(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(tokens[token].isSupported, "Token not supported");
        require(amount > 0, "Amount must be positive");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        liquidityPool[token] += amount;

        emit LiquidityAdded(msg.sender, token, amount);
    }

    function removeLiquidity(address token, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(liquidityPool[token] >= amount, "Insufficient liquidity");

        liquidityPool[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit LiquidityRemoved(msg.sender, token, amount);
    }

    function addChain(
        uint256 chainId,
        uint256 minConfirmations,
        uint256 maxTransferAmount,
        uint256 dailyLimit,
        uint256 baseFee,
        uint256 percentageFee
    ) external onlyRole(OPERATOR_ROLE) {
        require(!chains[chainId].isActive, "Chain already exists");
        require(percentageFee <= MAX_PERCENTAGE_FEE, "Fee too high");

        chains[chainId] = ChainConfig({
            isActive: true,
            minConfirmations: minConfirmations,
            maxTransferAmount: maxTransferAmount,
            dailyLimit: dailyLimit,
            dailyTransferred: 0,
            lastResetTime: block.timestamp,
            baseFee: baseFee,
            percentageFee: percentageFee
        });

        supportedChains.push(chainId);
        emit ChainAdded(chainId, minConfirmations, maxTransferAmount);
    }

    function updateChain(
        uint256 chainId,
        bool isActive,
        uint256 maxTransferAmount,
        uint256 dailyLimit
    ) external onlyRole(OPERATOR_ROLE) {
        require(chains[chainId].minConfirmations > 0, "Chain not found");

        chains[chainId].isActive = isActive;
        chains[chainId].maxTransferAmount = maxTransferAmount;
        chains[chainId].dailyLimit = dailyLimit;

        emit ChainUpdated(chainId, isActive);
    }

    function addToken(
        address token,
        uint256 minAmount,
        uint256 maxAmount,
        address wrappedToken,
        uint8 decimals
    ) external onlyRole(OPERATOR_ROLE) {
        require(!tokens[token].isSupported, "Token already exists");
        require(token != address(0), "Invalid token");

        tokens[token] = TokenConfig({
            isSupported: true,
            minAmount: minAmount,
            maxAmount: maxAmount,
            wrappedToken: wrappedToken,
            decimals: decimals
        });

        supportedTokens.push(token);
        emit TokenAdded(token, minAmount, maxAmount);
    }

    function updateToken(
        address token,
        bool isSupported,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyRole(OPERATOR_ROLE) {
        require(tokens[token].decimals > 0, "Token not found");

        tokens[token].isSupported = isSupported;
        tokens[token].minAmount = minAmount;
        tokens[token].maxAmount = maxAmount;

        emit TokenUpdated(token, isSupported);
    }

    function addValidator(address validator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(VALIDATOR_ROLE, validator);
        totalValidators++;
    }

    function removeValidator(address validator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(VALIDATOR_ROLE, validator);
        totalValidators--;
        require(totalValidators >= requiredValidations, "Too few validators");
    }

    function setRequiredValidations(uint256 _required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_required > 0 && _required <= totalValidators, "Invalid requirement");
        requiredValidations = _required;
    }

    function setFeeRecipient(address _feeRecipient) external onlyRole(FEE_MANAGER_ROLE) {
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRecipient = _feeRecipient;
    }

    function withdrawFees(address token) external onlyRole(FEE_MANAGER_ROLE) {
        uint256 amount = collectedFees[token];
        require(amount > 0, "No fees to withdraw");

        collectedFees[token] = 0;

        if (token == address(0)) {
            payable(feeRecipient).transfer(amount);
        } else {
            IERC20(token).safeTransfer(feeRecipient, amount);
        }

        emit FeesCollected(token, amount);
    }

    function calculateFee(uint256 amount, uint256 targetChain) public view returns (uint256) {
        ChainConfig memory chain = chains[targetChain];
        uint256 percentageFee = (amount * chain.percentageFee) / FEE_DENOMINATOR;
        return chain.baseFee + percentageFee;
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function getSupportedChains() external view returns (uint256[] memory) {
        return supportedChains;
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function _processBridgeRequest(bytes32 requestId) internal {
        BridgeRequest storage request = bridgeRequests[requestId];
        require(request.timestamp > 0, "Request not found");

        processedRequests[requestId] = true;
        // Additional processing logic here
    }

    function _updateDailyLimit(uint256 chainId) internal {
        ChainConfig storage chain = chains[chainId];
        if (block.timestamp >= chain.lastResetTime + 1 days) {
            chain.dailyTransferred = 0;
            chain.lastResetTime = block.timestamp;
        }
    }

    function _hashBridgeCompletion(
        bytes32 requestId,
        address recipient,
        address token,
        uint256 amount,
        uint256 sourceChain
    ) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    BRIDGE_REQUEST_TYPEHASH,
                    requestId,
                    recipient,
                    token,
                    amount,
                    sourceChain,
                    block.chainid  // SECURITY FIX: Add chain ID for replay protection
                )
            )
        );
    }

    receive() external payable {
        collectedFees[address(0)] += msg.value;
    }
}