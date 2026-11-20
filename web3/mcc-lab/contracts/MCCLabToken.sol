// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

/// @notice Local-chain prototype only: NOT the production MCC token.
contract MCCLabToken is ERC20Capped {
    uint256 public constant MAX_SUPPLY = 100_000_000_000 ether;
    MCCLabMinter public immutable minter;

    error LocalChainOnly();
    error OnlyLabMinter();

    constructor(address[6] memory issuers, uint256[6] memory periodLimits)
        ERC20("Millionaires Club LAB (no value)", "tMCC")
        ERC20Capped(MAX_SUPPLY)
    {
        if (block.chainid != 31337) revert LocalChainOnly();
        minter = new MCCLabMinter(this, issuers, periodLimits);
    }

    function mintLab(address recipient, uint256 amount) external {
        if (msg.sender != address(minter)) revert OnlyLabMinter();
        _mint(recipient, amount);
    }
}

/// @notice Immutable laboratory minter; fictional receipts and operators only.
/// @dev A 30-day fixed window is a test parameter, not an approved release schedule.
contract MCCLabMinter {
    uint256 public constant PERIOD = 30 days;
    enum Allocation { Membership, Liquidity, Community, Ecosystem, Earn, Treasury }

    MCCLabToken public immutable token;
    uint256[6] public allocationCaps = [uint256(75_000_000_000 ether), 10_000_000_000 ether,
        5_000_000_000 ether, 3_000_000_000 ether, 2_000_000_000 ether, 5_000_000_000 ether];
    address[6] public issuers;
    uint256[6] public periodLimits;
    uint256[6] public issued;
    mapping(uint256 => mapping(uint256 => uint256)) public periodIssued;
    mapping(bytes32 => bool) public usedReceipt;

    error InvalidConfiguration();
    error UnauthorizedIssuer();
    error InvalidIssue();
    error ReceiptAlreadyUsed();
    error AllocationExceeded();
    error PeriodExceeded();

    event LabIssued(Allocation indexed allocation, address indexed recipient, bytes32 indexed syntheticReceipt, uint256 amount, uint256 period);

    constructor(MCCLabToken token_, address[6] memory issuers_, uint256[6] memory limits_) {
        token = token_;
        for (uint256 i; i < 6; ++i) {
            if (issuers_[i] == address(0) || limits_[i] == 0 || limits_[i] > allocationCaps[i]) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) {
                if (issuers_[j] == issuers_[i]) revert InvalidConfiguration();
            }
        }
        issuers = issuers_;
        periodLimits = limits_;
    }

    function currentPeriod() public view returns (uint256) {
        return block.timestamp / PERIOD;
    }

    function issue(Allocation allocation, address recipient, uint256 amount, bytes32 syntheticReceipt) external {
        uint256 index = uint256(allocation);
        if (msg.sender != issuers[index]) revert UnauthorizedIssuer();
        if (recipient == address(0) || amount == 0 || syntheticReceipt == bytes32(0)) revert InvalidIssue();
        if (usedReceipt[syntheticReceipt]) revert ReceiptAlreadyUsed();
        if (amount > allocationCaps[index] - issued[index]) revert AllocationExceeded();
        uint256 period = currentPeriod();
        if (amount > periodLimits[index] - periodIssued[index][period]) revert PeriodExceeded();

        usedReceipt[syntheticReceipt] = true;
        issued[index] += amount;
        periodIssued[index][period] += amount;
        token.mintLab(recipient, amount);
        emit LabIssued(allocation, recipient, syntheticReceipt, amount, period);
    }
}
