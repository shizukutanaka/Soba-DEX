// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract MultiSigTimelock is AccessControl, ReentrancyGuard {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");

    struct Transaction {
        address target;
        uint256 value;
        bytes data;
        bytes32 predecessor;
        bytes32 salt;
        uint256 timestamp;
        uint256 confirmations;
        bool executed;
        bool cancelled;
        mapping(address => bool) isConfirmed;
    }

    uint256 public constant MIN_DELAY = 2 days;
    uint256 public constant MAX_DELAY = 30 days;
    uint256 public constant GRACE_PERIOD = 14 days;

    uint256 public delay;
    uint256 public requiredConfirmations;
    uint256 public ownersCount;

    mapping(bytes32 => Transaction) public transactions;
    mapping(address => bool) public isOwner;
    address[] public owners;

    bytes32[] public pendingTransactions;
    bytes32[] public readyTransactions;
    bytes32[] public executedTransactions;

    event TransactionScheduled(
        bytes32 indexed id,
        address indexed target,
        uint256 value,
        bytes data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    );

    event TransactionConfirmed(bytes32 indexed id, address indexed owner);
    event TransactionRevoked(bytes32 indexed id, address indexed owner);
    event TransactionReady(bytes32 indexed id, uint256 timestamp);
    event TransactionExecuted(bytes32 indexed id);
    event TransactionCancelled(bytes32 indexed id);

    event DelayChanged(uint256 oldDelay, uint256 newDelay);
    event RequiredConfirmationsChanged(uint256 oldRequired, uint256 newRequired);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event OwnerReplaced(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(isOwner[msg.sender], "Not an owner");
        _;
    }

    modifier txExists(bytes32 id) {
        require(transactions[id].timestamp > 0, "Transaction does not exist");
        _;
    }

    modifier notExecuted(bytes32 id) {
        require(!transactions[id].executed, "Transaction already executed");
        _;
    }

    modifier notCancelled(bytes32 id) {
        require(!transactions[id].cancelled, "Transaction cancelled");
        _;
    }

    modifier notConfirmed(bytes32 id) {
        require(!transactions[id].isConfirmed[msg.sender], "Transaction already confirmed");
        _;
    }

    modifier confirmed(bytes32 id) {
        require(transactions[id].isConfirmed[msg.sender], "Transaction not confirmed");
        _;
    }

    constructor(
        address[] memory _owners,
        uint256 _requiredConfirmations,
        uint256 _delay
    ) {
        require(_owners.length > 0, "Owners required");
        require(
            _requiredConfirmations > 0 && _requiredConfirmations <= _owners.length,
            "Invalid required confirmations"
        );
        require(_delay >= MIN_DELAY && _delay <= MAX_DELAY, "Invalid delay");

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "Invalid owner");
            require(!isOwner[owner], "Owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        ownersCount = _owners.length;
        requiredConfirmations = _requiredConfirmations;
        delay = _delay;

        _setupRole(DEFAULT_ADMIN_ROLE, address(this));
        _setupRole(PROPOSER_ROLE, msg.sender);
        _setupRole(EXECUTOR_ROLE, msg.sender);
        _setupRole(CANCELLER_ROLE, msg.sender);
    }

    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 _delay
    ) public onlyRole(PROPOSER_ROLE) returns (bytes32) {
        require(target != address(0), "Invalid target");
        require(_delay >= delay, "Insufficient delay");

        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        require(transactions[id].timestamp == 0, "Transaction already scheduled");

        transactions[id].target = target;
        transactions[id].value = value;
        transactions[id].data = data;
        transactions[id].predecessor = predecessor;
        transactions[id].salt = salt;
        transactions[id].timestamp = block.timestamp + _delay;
        transactions[id].confirmations = 0;
        transactions[id].executed = false;
        transactions[id].cancelled = false;

        pendingTransactions.push(id);

        emit TransactionScheduled(id, target, value, data, predecessor, salt, _delay);
        return id;
    }

    function confirmTransaction(bytes32 id)
        public
        onlyOwner
        txExists(id)
        notExecuted(id)
        notCancelled(id)
        notConfirmed(id)
    {
        Transaction storage transaction = transactions[id];
        transaction.isConfirmed[msg.sender] = true;
        transaction.confirmations++;

        emit TransactionConfirmed(id, msg.sender);

        if (transaction.confirmations >= requiredConfirmations) {
            _removePendingTransaction(id);
            readyTransactions.push(id);
            emit TransactionReady(id, transaction.timestamp);
        }
    }

    function revokeConfirmation(bytes32 id)
        public
        onlyOwner
        txExists(id)
        notExecuted(id)
        confirmed(id)
    {
        Transaction storage transaction = transactions[id];
        transaction.isConfirmed[msg.sender] = false;
        transaction.confirmations--;

        emit TransactionRevoked(id, msg.sender);

        if (transaction.confirmations < requiredConfirmations) {
            _removeReadyTransaction(id);
            pendingTransactions.push(id);
        }
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public payable nonReentrant onlyRole(EXECUTOR_ROLE) {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);

        require(isOperationReady(id), "Operation not ready");
        require(predecessor == bytes32(0) || isOperationDone(predecessor), "Predecessor not executed");

        Transaction storage transaction = transactions[id];
        transaction.executed = true;

        _removeReadyTransaction(id);
        executedTransactions.push(id);

        (bool success, bytes memory returndata) = target.call{value: value}(data);
        require(success, _getRevertMsg(returndata));

        emit TransactionExecuted(id);
    }

    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) public payable nonReentrant onlyRole(EXECUTOR_ROLE) {
        require(targets.length == values.length, "Length mismatch");
        require(targets.length == payloads.length, "Length mismatch");

        for (uint256 i = 0; i < targets.length; ++i) {
            execute(targets[i], values[i], payloads[i], predecessor, salt);
        }
    }

    function cancel(bytes32 id) public onlyRole(CANCELLER_ROLE) {
        require(transactions[id].timestamp > 0, "Transaction does not exist");
        require(!transactions[id].executed, "Transaction already executed");
        require(!transactions[id].cancelled, "Transaction already cancelled");

        transactions[id].cancelled = true;

        if (transactions[id].confirmations >= requiredConfirmations) {
            _removeReadyTransaction(id);
        } else {
            _removePendingTransaction(id);
        }

        emit TransactionCancelled(id);
    }

    function updateDelay(uint256 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newDelay >= MIN_DELAY && newDelay <= MAX_DELAY, "Invalid delay");
        uint256 oldDelay = delay;
        delay = newDelay;
        emit DelayChanged(oldDelay, newDelay);
    }

    function changeRequiredConfirmations(uint256 _required) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_required > 0 && _required <= ownersCount, "Invalid required confirmations");
        uint256 oldRequired = requiredConfirmations;
        requiredConfirmations = _required;
        emit RequiredConfirmationsChanged(oldRequired, _required);
    }

    function addOwner(address owner) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(owner != address(0), "Invalid owner");
        require(!isOwner[owner], "Owner exists");

        isOwner[owner] = true;
        owners.push(owner);
        ownersCount++;

        emit OwnerAdded(owner);
    }

    function removeOwner(address owner) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isOwner[owner], "Not owner");
        require(ownersCount > requiredConfirmations, "Cannot remove owner");

        isOwner[owner] = false;

        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }

        ownersCount--;

        emit OwnerRemoved(owner);
    }

    function replaceOwner(address oldOwner, address newOwner) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isOwner[oldOwner], "Old owner not found");
        require(!isOwner[newOwner], "New owner exists");
        require(newOwner != address(0), "Invalid new owner");

        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == oldOwner) {
                owners[i] = newOwner;
                break;
            }
        }

        isOwner[oldOwner] = false;
        isOwner[newOwner] = true;

        emit OwnerReplaced(oldOwner, newOwner);
    }

    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(target, value, data, predecessor, salt));
    }

    function hashOperationBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(targets, values, payloads, predecessor, salt));
    }

    function isOperation(bytes32 id) public view returns (bool) {
        return transactions[id].timestamp > 0;
    }

    function isOperationPending(bytes32 id) public view returns (bool) {
        Transaction storage transaction = transactions[id];
        return transaction.timestamp > 0 && !transaction.executed && !transaction.cancelled;
    }

    function isOperationReady(bytes32 id) public view returns (bool) {
        Transaction storage transaction = transactions[id];
        return
            transaction.timestamp > 0 &&
            transaction.timestamp <= block.timestamp &&
            transaction.confirmations >= requiredConfirmations &&
            !transaction.executed &&
            !transaction.cancelled &&
            block.timestamp <= transaction.timestamp + GRACE_PERIOD;
    }

    function isOperationDone(bytes32 id) public view returns (bool) {
        return transactions[id].executed;
    }

    function getTimestamp(bytes32 id) public view returns (uint256) {
        return transactions[id].timestamp;
    }

    function getConfirmationCount(bytes32 id) public view returns (uint256) {
        return transactions[id].confirmations;
    }

    function getConfirmations(bytes32 id) public view returns (address[] memory _confirmations) {
        uint256 count = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (transactions[id].isConfirmed[owners[i]]) {
                count++;
            }
        }

        _confirmations = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (transactions[id].isConfirmed[owners[i]]) {
                _confirmations[index] = owners[i];
                index++;
            }
        }
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getPendingTransactions() public view returns (bytes32[] memory) {
        return pendingTransactions;
    }

    function getReadyTransactions() public view returns (bytes32[] memory) {
        return readyTransactions;
    }

    function getExecutedTransactions() public view returns (bytes32[] memory) {
        return executedTransactions;
    }

    function _removePendingTransaction(bytes32 id) internal {
        for (uint256 i = 0; i < pendingTransactions.length; i++) {
            if (pendingTransactions[i] == id) {
                pendingTransactions[i] = pendingTransactions[pendingTransactions.length - 1];
                pendingTransactions.pop();
                break;
            }
        }
    }

    function _removeReadyTransaction(bytes32 id) internal {
        for (uint256 i = 0; i < readyTransactions.length; i++) {
            if (readyTransactions[i] == id) {
                readyTransactions[i] = readyTransactions[readyTransactions.length - 1];
                readyTransactions.pop();
                break;
            }
        }
    }

    function _getRevertMsg(bytes memory _returnData) internal pure returns (string memory) {
        if (_returnData.length < 68) return "Transaction reverted silently";

        assembly {
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string));
    }

    receive() external payable {}
}