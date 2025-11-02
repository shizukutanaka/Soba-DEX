// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract StakingRewards is ReentrancyGuard, AccessControl, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant REWARDS_DISTRIBUTOR_ROLE = keccak256("REWARDS_DISTRIBUTOR_ROLE");

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public rewardsDuration = 30 days;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public constant MIN_STAKING_AMOUNT = 1e15;
    uint256 public earlyWithdrawPenalty = 1000; // 10%
    uint256 public constant PENALTY_DENOMINATOR = 10000;
    uint256 public minStakingPeriod = 7 days;

    mapping(address => uint256) public stakingTimestamp;
    mapping(address => uint256) public totalRewardsClaimed;

    uint256 public totalRewardsDistributed;
    uint256 public penaltyCollected;
    address public penaltyReceiver;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event PenaltyUpdated(uint256 newPenalty);
    event MinStakingPeriodUpdated(uint256 newPeriod);
    event Recovered(address token, uint256 amount);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(
        address _stakingToken,
        address _rewardsToken,
        address _penaltyReceiver
    ) {
        require(_stakingToken != address(0), "Invalid staking token");
        require(_rewardsToken != address(0), "Invalid rewards token");
        require(_penaltyReceiver != address(0), "Invalid penalty receiver");

        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
        penaltyReceiver = _penaltyReceiver;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        _setupRole(REWARDS_DISTRIBUTOR_ROLE, msg.sender);
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(_totalSupply)
            );
    }

    function earned(address account) public view returns (uint256) {
        return _balances[account].mul(rewardPerToken().sub(userRewardPerTokenPaid[account])).div(1e18).add(rewards[account]);
    }

    function getRewardForDuration() external view returns (uint256) {
        return rewardRate.mul(rewardsDuration);
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount >= MIN_STAKING_AMOUNT, "Amount too small");

        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        stakingTimestamp[msg.sender] = block.timestamp;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(_balances[msg.sender] >= amount, "Insufficient balance");

        uint256 withdrawAmount = amount;
        uint256 penalty = 0;

        if (block.timestamp < stakingTimestamp[msg.sender].add(minStakingPeriod)) {
            penalty = amount.mul(earlyWithdrawPenalty).div(PENALTY_DENOMINATOR);
            withdrawAmount = amount.sub(penalty);
            penaltyCollected = penaltyCollected.add(penalty);
            stakingToken.safeTransfer(penaltyReceiver, penalty);
        }

        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);

        stakingToken.safeTransfer(msg.sender, withdrawAmount);
        emit Withdrawn(msg.sender, withdrawAmount);
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            totalRewardsClaimed[msg.sender] = totalRewardsClaimed[msg.sender].add(reward);
            totalRewardsDistributed = totalRewardsDistributed.add(reward);
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    function notifyRewardAmount(uint256 reward) external onlyRole(REWARDS_DISTRIBUTOR_ROLE) updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(rewardsDuration);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(rewardsDuration);
        }

        uint256 balance = rewardsToken.balanceOf(address(this));
        require(rewardRate <= balance.div(rewardsDuration), "Provided reward too high");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(rewardsDuration);
        emit RewardAdded(reward);
    }

    function setRewardsDuration(uint256 _rewardsDuration) external onlyRole(OPERATOR_ROLE) {
        require(
            block.timestamp > periodFinish,
            "Previous rewards period must be complete before changing the duration"
        );
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(rewardsDuration);
    }

    function setPenalty(uint256 _penalty) external onlyRole(OPERATOR_ROLE) {
        require(_penalty <= 2500, "Penalty too high"); // Max 25%
        earlyWithdrawPenalty = _penalty;
        emit PenaltyUpdated(_penalty);
    }

    function setMinStakingPeriod(uint256 _period) external onlyRole(OPERATOR_ROLE) {
        require(_period <= 30 days, "Period too long");
        minStakingPeriod = _period;
        emit MinStakingPeriodUpdated(_period);
    }

    function setPenaltyReceiver(address _receiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_receiver != address(0), "Invalid receiver");
        penaltyReceiver = _receiver;
    }

    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenAddress != address(stakingToken), "Cannot withdraw staking token");
        require(tokenAddress != address(rewardsToken), "Cannot withdraw rewards token");
        IERC20(tokenAddress).safeTransfer(msg.sender, tokenAmount);
        emit Recovered(tokenAddress, tokenAmount);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function getStakingInfo(address account) external view returns (
        uint256 stakedBalance,
        uint256 earnedRewards,
        uint256 claimedRewards,
        uint256 stakingTime,
        bool canWithdrawWithoutPenalty
    ) {
        stakedBalance = _balances[account];
        earnedRewards = earned(account);
        claimedRewards = totalRewardsClaimed[account];
        stakingTime = stakingTimestamp[account];
        canWithdrawWithoutPenalty = block.timestamp >= stakingTimestamp[account].add(minStakingPeriod);
    }

    function getPoolInfo() external view returns (
        uint256 totalStaked,
        uint256 rewardRatePerSecond,
        uint256 periodEnd,
        uint256 totalDistributed,
        uint256 penaltiesCollected
    ) {
        totalStaked = _totalSupply;
        rewardRatePerSecond = rewardRate;
        periodEnd = periodFinish;
        totalDistributed = totalRewardsDistributed;
        penaltiesCollected = penaltyCollected;
    }
}

contract YieldFarmingRouter {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct Farm {
        address stakingContract;
        address lpToken;
        address rewardToken;
        uint256 allocPoint;
        uint256 lastRewardBlock;
        uint256 accRewardPerShare;
        uint256 totalStaked;
        bool isActive;
    }

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    address public owner;
    address public rewardToken;
    uint256 public rewardPerBlock;
    uint256 public totalAllocPoint;
    uint256 public startBlock;
    uint256 public bonusEndBlock;
    uint256 public constant BONUS_MULTIPLIER = 2;

    Farm[] public farms;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    mapping(address => bool) public farmExists;

    event FarmAdded(uint256 indexed pid, address lpToken, uint256 allocPoint);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event RewardPaid(address indexed user, uint256 indexed pid, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _rewardToken,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock
    ) {
        owner = msg.sender;
        rewardToken = _rewardToken;
        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;
    }

    function farmLength() external view returns (uint256) {
        return farms.length;
    }

    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= bonusEndBlock) {
            return _to.sub(_from).mul(BONUS_MULTIPLIER);
        } else if (_from >= bonusEndBlock) {
            return _to.sub(_from);
        } else {
            return bonusEndBlock.sub(_from).mul(BONUS_MULTIPLIER).add(_to.sub(bonusEndBlock));
        }
    }

    function pendingReward(uint256 _pid, address _user) external view returns (uint256) {
        Farm storage farm = farms[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accRewardPerShare = farm.accRewardPerShare;
        uint256 lpSupply = farm.totalStaked;

        if (block.number > farm.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(farm.lastRewardBlock, block.number);
            uint256 reward = multiplier.mul(rewardPerBlock).mul(farm.allocPoint).div(totalAllocPoint);
            accRewardPerShare = accRewardPerShare.add(reward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accRewardPerShare).div(1e12).sub(user.rewardDebt).add(user.pendingRewards);
    }

    function updatePool(uint256 _pid) public {
        Farm storage farm = farms[_pid];
        if (block.number <= farm.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = farm.totalStaked;
        if (lpSupply == 0 || farm.allocPoint == 0) {
            farm.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(farm.lastRewardBlock, block.number);
        uint256 reward = multiplier.mul(rewardPerBlock).mul(farm.allocPoint).div(totalAllocPoint);
        farm.accRewardPerShare = farm.accRewardPerShare.add(reward.mul(1e12).div(lpSupply));
        farm.lastRewardBlock = block.number;
    }

    function massUpdatePools() public {
        uint256 length = farms.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate) external onlyOwner {
        require(!farmExists[address(_lpToken)], "Farm exists");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        farms.push(
            Farm({
                stakingContract: address(0),
                lpToken: address(_lpToken),
                rewardToken: rewardToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accRewardPerShare: 0,
                totalStaked: 0,
                isActive: true
            })
        );
        farmExists[address(_lpToken)] = true;
        emit FarmAdded(farms.length - 1, address(_lpToken), _allocPoint);
    }

    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) external onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(farms[_pid].allocPoint).add(_allocPoint);
        farms[_pid].allocPoint = _allocPoint;
    }

    function deposit(uint256 _pid, uint256 _amount) external {
        Farm storage farm = farms[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(farm.isActive, "Farm not active");

        updatePool(_pid);

        if (user.amount > 0) {
            uint256 pending = user.amount.mul(farm.accRewardPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                user.pendingRewards = user.pendingRewards.add(pending);
            }
        }

        if (_amount > 0) {
            IERC20(farm.lpToken).safeTransferFrom(msg.sender, address(this), _amount);
            user.amount = user.amount.add(_amount);
            farm.totalStaked = farm.totalStaked.add(_amount);
        }

        user.rewardDebt = user.amount.mul(farm.accRewardPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, uint256 _amount) external {
        Farm storage farm = farms[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "Insufficient balance");

        updatePool(_pid);

        uint256 pending = user.amount.mul(farm.accRewardPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            user.pendingRewards = user.pendingRewards.add(pending);
        }

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            farm.totalStaked = farm.totalStaked.sub(_amount);
            IERC20(farm.lpToken).safeTransfer(msg.sender, _amount);
        }

        user.rewardDebt = user.amount.mul(farm.accRewardPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    function harvest(uint256 _pid) external {
        Farm storage farm = farms[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        uint256 pending = user.amount.mul(farm.accRewardPerShare).div(1e12).sub(user.rewardDebt).add(user.pendingRewards);

        if (pending > 0) {
            user.pendingRewards = 0;
            safeRewardTransfer(msg.sender, pending);
            emit RewardPaid(msg.sender, _pid, pending);
        }

        user.rewardDebt = user.amount.mul(farm.accRewardPerShare).div(1e12);
    }

    function emergencyWithdraw(uint256 _pid) external {
        Farm storage farm = farms[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        user.pendingRewards = 0;

        farm.totalStaked = farm.totalStaked.sub(amount);
        IERC20(farm.lpToken).safeTransfer(msg.sender, amount);

        emit EmergencyWithdraw(msg.sender, _pid, amount);
    }

    function safeRewardTransfer(address _to, uint256 _amount) internal {
        uint256 rewardBalance = IERC20(rewardToken).balanceOf(address(this));
        if (_amount > rewardBalance) {
            IERC20(rewardToken).safeTransfer(_to, rewardBalance);
        } else {
            IERC20(rewardToken).safeTransfer(_to, _amount);
        }
    }

    function setRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
        massUpdatePools();
        rewardPerBlock = _rewardPerBlock;
    }

    function setFarmActive(uint256 _pid, bool _isActive) external onlyOwner {
        farms[_pid].isActive = _isActive;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}