// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { RoundPrizeVault } from "../src/v3/RoundPrizeVault.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import {
    NoReturnERC20,
    RevertingERC20,
    RevertingBalanceERC20,
    BlacklistERC20,
    ReentrantERC20,
    SenderSurchargeERC20,
    ExternallyMutableBalanceERC20,
    NoOpOutboundERC721,
    NoOpOutboundERC1155,
    MockERC1271Signer,
    ForceEther
} from "../src/mocks/AdversarialPrizeTokens.sol";

contract PrizeToken20 is ERC20 {
    constructor() ERC20("Prize", "PRIZE") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee token", "FEE") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 10;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract FalseReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

contract RejectingEthWinner {
    receive() external payable {
        revert("reject");
    }
}

contract PrizeToken721 is ERC721 {
    uint256 private _next;
    constructor() ERC721("Prize NFT", "PNFT") { }

    function mint(address to) external returns (uint256 id) {
        id = ++_next;
        _mint(to, id);
    }
}

contract PrizeToken1155 is ERC1155 {
    constructor() ERC1155("ipfs://prize/{id}") { }

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

contract MockPrizeFactory {
    mapping(address => bool) public isGlobalAdmin;
    mapping(address => bool) public isRound;

    function setGlobalAdmin(address account, bool enabled) external {
        isGlobalAdmin[account] = enabled;
    }

    function setRound(address account, bool enabled) external {
        isRound[account] = enabled;
    }

    function initializeVault(
        RoundPrizeVault vault,
        address round,
        bytes32 planHash,
        PrizeTypes.VaultConfig calldata config
    ) external {
        vault.initialize(address(this), round, true, planHash, config);
    }
}

contract MockPrizeRound {
    address public factory;
    address public prizeVault;
    uint40 public submissionsOpen;
    uint40 public votingStart;
    uint40 public finalizedAt;
    uint8 public winnerCount = 2;
    bool public finalized;
    mapping(address => bool) public isRoundAdmin;
    mapping(address => bool) public isRecoveryAdmin;
    address[] private _winners;

    constructor(address factory_) {
        factory = factory_;
        submissionsOpen = uint40(block.timestamp + 1 days);
        votingStart = uint40(block.timestamp + 2 days);
    }

    function configureVault(address vault_) external {
        prizeVault = vault_;
    }

    function setAdmin(address account, bool enabled) external {
        isRoundAdmin[account] = enabled;
        isRecoveryAdmin[account] = enabled;
    }

    function setWinners(address first, address second) external {
        delete _winners;
        _winners.push(first);
        _winners.push(second);
        finalized = true;
        finalizedAt = uint40(block.timestamp);
    }

    function setOneWinner(address first) external {
        delete _winners;
        _winners.push(first);
        finalized = true;
        finalizedAt = uint40(block.timestamp);
    }

    function winnerAddress(uint256 rank) external view returns (address) {
        return _winners[rank];
    }
}

contract RoundPrizeVaultTest is Test {
    uint256 private constant GLOBAL_ONE_KEY = 0xA11CE;
    uint256 private constant GLOBAL_TWO_KEY = 0xB0B;
    uint256 private constant ROUND_ADMIN_KEY = 0xCAFE;
    uint256 private constant ROUND_ADMIN_TWO_KEY = 0xD00D;

    MockPrizeFactory private factory;
    MockPrizeRound private round;
    RoundPrizeVault private vault;
    PrizeToken20 private token20;
    PrizeToken721 private token721;
    PrizeToken1155 private token1155;
    address private globalOne;
    address private globalTwo;
    address private roundAdmin;
    address private roundAdminTwo;
    address private winnerOne = makeAddr("winner-one");
    address private winnerTwo = makeAddr("winner-two");
    address private recoveryRecipient = makeAddr("recovery");

    function setUp() external {
        globalOne = vm.addr(GLOBAL_ONE_KEY);
        globalTwo = vm.addr(GLOBAL_TWO_KEY);
        roundAdmin = vm.addr(ROUND_ADMIN_KEY);
        roundAdminTwo = vm.addr(ROUND_ADMIN_TWO_KEY);
        factory = new MockPrizeFactory();
        round = new MockPrizeRound(address(factory));
        RoundPrizeVault implementation = new RoundPrizeVault();
        vault = RoundPrizeVault(payable(Clones.clone(address(implementation))));
        token20 = new PrizeToken20();
        token721 = new PrizeToken721();
        token1155 = new PrizeToken1155();

        factory.setGlobalAdmin(globalOne, true);
        factory.setGlobalAdmin(globalTwo, true);
        factory.setRound(address(round), true);
        round.setAdmin(roundAdmin, true);
        round.setAdmin(roundAdminTwo, true);
        round.configureVault(address(vault));

        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](4);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        plan[1] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(token20), 0, 100 ether
        );
        plan[2] =
            PrizeTypes.AllocationInput(1, PrizeTypes.AssetType.ERC721, address(token721), 1, 1);
        plan[3] =
            PrizeTypes.AllocationInput(1, PrizeTypes.AssetType.ERC1155, address(token1155), 7, 5);
        PrizeTypes.VaultConfig memory config = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: plan
        });
        bytes32 planHash = keccak256(
            abi.encode(plan, config.recoveryRecipient, config.claimPeriod, config.recoveryDelay)
        );
        factory.initializeVault(vault, address(round), planHash, config);
    }

    function testFundsAllAssetTypesSealsAndReleasesPermissionlessly() external {
        address depositor = makeAddr("depositor");
        vm.deal(depositor, 2 ether);
        token20.mint(depositor, 100 ether);
        token721.mint(depositor);
        token1155.mint(depositor, 7, 5);

        vm.startPrank(depositor);
        vault.fundNative{ value: 1 ether }();
        token20.approve(address(vault), 100 ether);
        vault.fundERC20(address(token20), 100 ether);
        token721.approve(address(vault), 1);
        vault.fundERC721(address(token721), 1);
        token1155.setApprovalForAll(address(vault), true);
        vault.fundERC1155(address(token1155), 7, 5);
        vm.stopPrank();

        vault.seal();
        assertTrue(vault.isReadyForSubmissions());
        round.setWinners(winnerOne, winnerTwo);

        uint256 winnerBalanceBefore = winnerOne.balance;
        vault.release(0);
        vault.release(1);
        vault.release(2);
        vault.release(3);
        assertEq(winnerOne.balance - winnerBalanceBefore, 1 ether);
        assertEq(token20.balanceOf(winnerOne), 100 ether);
        assertEq(token721.ownerOf(1), winnerTwo);
        assertEq(token1155.balanceOf(winnerTwo, 7), 5);
    }

    function testRecoveryNeedsTwoDistinctAuthorizedSignersAndCannotTakeLiability() external {
        address depositor = makeAddr("depositor");
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        vault.fundNative{ value: 1 ether }();

        address recipient = recoveryRecipient;
        PrizeTypes.RecoveryAction memory reserved =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(reserved, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 queued = vault.queueRecovery(reserved, globalOne, sigOne, globalTwo, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVault.InsufficientRecoverableBalance.selector);
        vault.executeRecovery(queued);

        vm.deal(address(vault), 2 ether);
        PrizeTypes.RecoveryAction memory excess =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recipient, 1);
        (sigOne, sigTwo) = _sign(excess, GLOBAL_ONE_KEY, ROUND_ADMIN_KEY);
        queued = vault.queueRecovery(excess, globalOne, sigOne, roundAdmin, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        vault.executeRecovery(queued);
        assertEq(recipient.balance, 1 ether);
    }

    function testDuplicateSignerCannotSatisfyQuorum() external {
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1, recoveryRecipient, 0);
        bytes32 digest = vault.hashRecoveryAction(action);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(GLOBAL_ONE_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        vm.expectRevert(RoundPrizeVault.InvalidSignerPair.selector);
        vault.queueRecovery(action, globalOne, signature, globalOne, signature);
    }

    function testAllThreeRecoveryQuorumCombinationsSucceed() external {
        vm.deal(address(vault), 4 ether);
        _executeNativeExcessRecovery(0, GLOBAL_ONE_KEY, globalOne, GLOBAL_TWO_KEY, globalTwo);
        _executeNativeExcessRecovery(1, GLOBAL_ONE_KEY, globalOne, ROUND_ADMIN_KEY, roundAdmin);
        _executeNativeExcessRecovery(
            2, ROUND_ADMIN_KEY, roundAdmin, ROUND_ADMIN_TWO_KEY, roundAdminTwo
        );
        assertEq(recoveryRecipient.balance, 3 ether);
    }

    function testRoleRevocationInvalidatesQueuedRecoveryAtExecution() external {
        vm.deal(address(vault), 1 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, ROUND_ADMIN_KEY);
        bytes32 actionId = vault.queueRecovery(action, globalOne, sigOne, roundAdmin, sigTwo);
        round.setAdmin(roundAdmin, false);
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVault.InvalidSignerPair.selector);
        vault.executeRecovery(actionId);
    }

    function testRecoveryRecipientChangeUsesDelayedTwoSignerAction() external {
        address newRecipient = makeAddr("new-recovery-recipient");
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.UPDATE_RECOVERY_RECIPIENT, 0, newRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, ROUND_ADMIN_KEY);
        bytes32 actionId = vault.queueRecovery(action, globalOne, sigOne, roundAdmin, sigTwo);
        vm.expectRevert(RoundPrizeVault.RecoveryNotReady.selector);
        vault.executeRecovery(actionId);

        vm.warp(block.timestamp + 5 minutes);
        vault.executeRecovery(actionId);
        assertEq(vault.recoveryRecipient(), newRecipient);

        vm.deal(address(vault), 1 ether);
        PrizeTypes.RecoveryAction memory excess =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 1);
        (sigOne, sigTwo) = _sign(excess, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        vm.expectRevert(RoundPrizeVault.InvalidAsset.selector);
        vault.queueRecovery(excess, globalOne, sigOne, globalTwo, sigTwo);
    }

    function testRecipientRotationInvalidatesQueuedRecoveryToOldRecipient() external {
        vm.deal(address(vault), 1 ether);
        PrizeTypes.RecoveryAction memory excess =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(excess, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 excessId = vault.queueRecovery(excess, globalOne, sigOne, globalTwo, sigTwo);

        address newRecipient = makeAddr("rotated-recovery-recipient");
        PrizeTypes.RecoveryAction memory rotation =
            _action(PrizeTypes.RecoveryKind.UPDATE_RECOVERY_RECIPIENT, 0, newRecipient, 1);
        (sigOne, sigTwo) = _sign(rotation, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 rotationId = vault.queueRecovery(rotation, globalOne, sigOne, globalTwo, sigTwo);

        vm.warp(block.timestamp + 5 minutes);
        vault.executeRecovery(rotationId);
        vm.expectRevert(RoundPrizeVault.InvalidAsset.selector);
        vault.executeRecovery(excessId);
        assertEq(address(vault).balance, 1 ether);
    }

    function testRecoveryNonceDeadlineAndCrossVaultReplayProtection() external {
        vm.deal(address(vault), 2 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        vm.expectRevert(RoundPrizeVault.InvalidNonce.selector);
        vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);

        (bytes memory crossSigOne, bytes memory crossSigTwo) =
            _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        PrizeTypes.RecoveryAction memory expired =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 1);
        expired.deadline = uint48(block.timestamp + 4 minutes);
        (sigOne, sigTwo) = _sign(expired, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        vm.expectRevert(RoundPrizeVault.InvalidDeadline.selector);
        vault.queueRecovery(expired, globalOne, sigOne, globalTwo, sigTwo);

        PrizeTypes.AllocationInput[] memory empty = new PrizeTypes.AllocationInput[](0);
        (RoundPrizeVault otherVault,) = _newVault(empty);
        vm.expectRevert(RoundPrizeVault.InvalidSignature.selector);
        otherVault.queueRecovery(action, globalOne, crossSigOne, globalTwo, crossSigTwo);
    }

    function testFeeOnTransferCreditsOnlyActualReceivedAndFalseReturnReverts() external {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        FalseReturnToken falseToken = new FalseReturnToken();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(feeToken), 0, 90 ether
        );
        (RoundPrizeVault feeVault,) = _newVault(plan);
        address depositor = makeAddr("fee-depositor");
        feeToken.mint(depositor, 100 ether);
        vm.startPrank(depositor);
        feeToken.approve(address(feeVault), 100 ether);
        feeVault.fundERC20(address(feeToken), 100 ether);
        vm.stopPrank();
        bytes32 key = feeVault.assetKey(PrizeTypes.AssetType.ERC20, address(feeToken), 0);
        assertEq(feeVault.fundedByAsset(key), 90 ether);
        feeVault.seal();

        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(falseToken), 0, 100 ether
        );
        (RoundPrizeVault falseVault,) = _newVault(plan);
        falseToken.mint(depositor, 100 ether);
        vm.startPrank(depositor);
        falseToken.approve(address(falseVault), 100 ether);
        vm.expectRevert();
        falseVault.fundERC20(address(falseToken), 100 ether);
        vm.stopPrank();
    }

    function testRejectingRecipientDoesNotMarkAllocationClaimed() external {
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("isolated-depositor");
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        isolatedVault.fundNative{ value: 1 ether }();
        isolatedVault.seal();
        RejectingEthWinner rejectingWinner = new RejectingEthWinner();
        isolatedRound.setOneWinner(address(rejectingWinner));
        vm.expectRevert(RoundPrizeVault.TransferFailed.selector);
        isolatedVault.release(0);
        PrizeTypes.Allocation memory allocation = isolatedVault.getAllocation(0);
        assertFalse(allocation.claimed);
    }

    function testSenderSurchargeCannotUndercollateralizeRemainingAwards() external {
        SenderSurchargeERC20 surchargeToken = new SenderSurchargeERC20();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](2);
        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(surchargeToken), 0, 100 ether
        );
        plan[1] = PrizeTypes.AllocationInput(
            1, PrizeTypes.AssetType.ERC20, address(surchargeToken), 0, 100 ether
        );
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("surcharge-depositor");
        surchargeToken.mint(depositor, 220 ether);
        vm.startPrank(depositor);
        surchargeToken.approve(address(isolatedVault), 200 ether);
        isolatedVault.fundERC20(address(surchargeToken), 200 ether);
        vm.stopPrank();
        isolatedVault.seal();
        isolatedRound.setWinners(winnerOne, winnerTwo);

        vm.expectRevert(RoundPrizeVault.TransferFailed.selector);
        isolatedVault.release(0);
        PrizeTypes.Allocation memory allocation = isolatedVault.getAllocation(0);
        assertFalse(allocation.claimed);
        assertEq(surchargeToken.balanceOf(address(isolatedVault)), 200 ether);
    }

    function testSealChecksActualHoldingsAfterExternalBalanceMutation() external {
        ExternallyMutableBalanceERC20 mutableToken = new ExternallyMutableBalanceERC20();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(mutableToken), 0, 100 ether
        );
        (RoundPrizeVault isolatedVault,) = _newVault(plan);
        address depositor = makeAddr("mutable-depositor");
        mutableToken.mint(depositor, 100 ether);
        vm.startPrank(depositor);
        mutableToken.approve(address(isolatedVault), 100 ether);
        isolatedVault.fundERC20(address(mutableToken), 100 ether);
        vm.stopPrank();
        mutableToken.burnFromAnywhere(address(isolatedVault), 1 ether);
        vm.expectRevert(RoundPrizeVault.FundingIncomplete.selector);
        isolatedVault.seal();
    }

    function testNoOpNftTransfersFailPostconditionsAndStayUnclaimed() external {
        NoOpOutboundERC721 noOp721 = new NoOpOutboundERC721();
        NoOpOutboundERC1155 noOp1155 = new NoOpOutboundERC1155();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](2);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.ERC721, address(noOp721), 7, 1);
        plan[1] =
            PrizeTypes.AllocationInput(1, PrizeTypes.AssetType.ERC1155, address(noOp1155), 9, 5);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("noop-nft-depositor");
        noOp721.mint(depositor, 7);
        noOp1155.mint(depositor, 9, 5);
        vm.startPrank(depositor);
        noOp721.approve(address(isolatedVault), 7);
        isolatedVault.fundERC721(address(noOp721), 7);
        noOp1155.setApprovalForAll(address(isolatedVault), true);
        isolatedVault.fundERC1155(address(noOp1155), 9, 5);
        vm.stopPrank();
        isolatedVault.seal();
        isolatedRound.setWinners(winnerOne, winnerTwo);
        noOp721.setNoOp(true);
        noOp1155.setNoOp(true);

        vm.expectRevert(RoundPrizeVault.TransferFailed.selector);
        isolatedVault.release(0);
        vm.expectRevert(RoundPrizeVault.TransferFailed.selector);
        isolatedVault.release(1);
        assertFalse(isolatedVault.getAllocation(0).claimed);
        assertFalse(isolatedVault.getAllocation(1).claimed);
        assertEq(noOp721.ownerOf(7), address(isolatedVault));
        assertEq(noOp1155.balanceOf(address(isolatedVault), 9), 5);
    }

    function testCanceledPlanRecoversOnlyDirectOrForcedExcessAndPreservesRefunds() external {
        PrizeToken20 directToken = new PrizeToken20();
        PrizeToken721 directNft = new PrizeToken721();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](3);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        plan[1] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(directToken), 0, 100 ether
        );
        plan[2] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.ERC721, address(directNft), 1, 1);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("mixed-depositor");
        vm.deal(depositor, 1 ether);
        directToken.mint(depositor, 70 ether);
        uint256 nftId = directNft.mint(depositor);
        vm.startPrank(depositor);
        isolatedVault.fundNative{ value: 0.5 ether }();
        directToken.approve(address(isolatedVault), 40 ether);
        isolatedVault.fundERC20(address(directToken), 40 ether);
        directToken.transfer(address(isolatedVault), 30 ether);
        directNft.transferFrom(depositor, address(isolatedVault), nftId);
        vm.stopPrank();
        ForceEther force = new ForceEther{ value: 0.25 ether }();
        force.force(payable(address(isolatedVault)));

        vm.warp(isolatedRound.submissionsOpen());
        isolatedVault.cancelUnfunded();
        assertEq(
            isolatedVault.recoverableBalance(PrizeTypes.AssetType.NATIVE, address(0), 0), 0.25 ether
        );
        assertEq(
            isolatedVault.recoverableBalance(PrizeTypes.AssetType.ERC20, address(directToken), 0),
            30 ether
        );
        assertEq(
            isolatedVault.recoverableBalance(
                PrizeTypes.AssetType.ERC721, address(directNft), nftId
            ),
            1
        );

        _recoverOnVault(isolatedVault, PrizeTypes.AssetType.NATIVE, address(0), 0, 0.25 ether, 0);
        _recoverOnVault(
            isolatedVault, PrizeTypes.AssetType.ERC20, address(directToken), 0, 30 ether, 1
        );
        _recoverOnVault(isolatedVault, PrizeTypes.AssetType.ERC721, address(directNft), nftId, 1, 2);

        vm.startPrank(depositor);
        isolatedVault.refundContribution(PrizeTypes.AssetType.NATIVE, address(0), 0, 0.5 ether);
        isolatedVault.refundContribution(
            PrizeTypes.AssetType.ERC20, address(directToken), 0, 40 ether
        );
        vm.stopPrank();
        assertEq(address(isolatedVault).balance, 0);
        assertEq(directToken.balanceOf(address(isolatedVault)), 0);
        assertEq(directNft.ownerOf(nftId), recoveryRecipient);
    }

    function testFewerWinnersAllocationCanOnlyRecoverAfterExpiry() external {
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(1, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("rank-two-depositor");
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        isolatedVault.fundNative{ value: 1 ether }();
        isolatedVault.seal();
        isolatedRound.setOneWinner(winnerOne);
        vm.expectRevert();
        isolatedVault.release(0);

        PrizeTypes.RecoveryAction memory action = PrizeTypes.RecoveryAction({
            kind: PrizeTypes.RecoveryKind.EXPIRED_ALLOCATION,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1 ether,
            recipient: recoveryRecipient,
            allocationId: 0,
            nonce: 0,
            validAfter: uint48(block.timestamp),
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 digest = isolatedVault.hashRecoveryAction(action);
        (bytes memory sigOne, bytes memory sigTwo) =
            _signDigest(digest, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 actionId = isolatedVault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        isolatedVault.executeRecovery(actionId);
        assertEq(recoveryRecipient.balance, 1 ether);
    }

    function testCanceledRefundableAllocationCannotUseExpiredSweep() external {
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("canceled-depositor");
        vm.deal(depositor, 0.5 ether);
        vm.prank(depositor);
        isolatedVault.fundNative{ value: 0.5 ether }();
        vm.warp(isolatedRound.submissionsOpen());
        isolatedVault.cancelUnfunded();
        isolatedRound.setOneWinner(winnerOne);
        vm.warp(block.timestamp + 5 minutes);

        PrizeTypes.RecoveryAction memory action = PrizeTypes.RecoveryAction({
            kind: PrizeTypes.RecoveryKind.EXPIRED_ALLOCATION,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1 ether,
            recipient: recoveryRecipient,
            allocationId: 0,
            nonce: 0,
            validAfter: uint48(block.timestamp),
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 digest = isolatedVault.hashRecoveryAction(action);
        (bytes memory sigOne, bytes memory sigTwo) =
            _signDigest(digest, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 actionId = isolatedVault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVault.InvalidState.selector);
        isolatedVault.executeRecovery(actionId);
        assertEq(address(isolatedVault).balance, 0.5 ether);
    }

    function testNoReturnTokenWorksAndRevertingTokensFailWithoutAccounting() external {
        NoReturnERC20 noReturn = new NoReturnERC20();
        RevertingERC20 revertingToken = new RevertingERC20();
        RevertingBalanceERC20 revertingBalance = new RevertingBalanceERC20();
        address depositor = makeAddr("nonstandard-depositor");

        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(noReturn), 0, 10 ether
        );
        (RoundPrizeVault noReturnVault,) = _newVault(plan);
        noReturn.mint(depositor, 10 ether);
        vm.startPrank(depositor);
        noReturn.approve(address(noReturnVault), 10 ether);
        noReturnVault.fundERC20(address(noReturn), 10 ether);
        vm.stopPrank();
        bytes32 key = noReturnVault.assetKey(PrizeTypes.AssetType.ERC20, address(noReturn), 0);
        assertEq(noReturnVault.fundedByAsset(key), 10 ether);

        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(revertingToken), 0, 10 ether
        );
        (RoundPrizeVault revertingVault,) = _newVault(plan);
        vm.expectRevert();
        revertingVault.fundERC20(address(revertingToken), 10 ether);
        key = revertingVault.assetKey(PrizeTypes.AssetType.ERC20, address(revertingToken), 0);
        assertEq(revertingVault.fundedByAsset(key), 0);

        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(revertingBalance), 0, 10 ether
        );
        (RoundPrizeVault balanceVault,) = _newVault(plan);
        vm.expectRevert();
        balanceVault.fundERC20(address(revertingBalance), 10 ether);
    }

    function testReentrantFundingCallbackCannotEnterVault() external {
        ReentrantERC20 reentrantToken = new ReentrantERC20();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(reentrantToken), 0, 10 ether
        );
        (RoundPrizeVault isolatedVault,) = _newVault(plan);
        address depositor = makeAddr("reentrant-depositor");
        reentrantToken.mint(depositor, 10 ether);
        reentrantToken.configureCallback(
            address(isolatedVault),
            abi.encodeCall(isolatedVault.fundERC20, (address(reentrantToken), 1))
        );
        vm.startPrank(depositor);
        reentrantToken.approve(address(isolatedVault), 10 ether);
        isolatedVault.fundERC20(address(reentrantToken), 10 ether);
        vm.stopPrank();
        assertTrue(reentrantToken.callbackAttempted());
        bytes32 key = isolatedVault.assetKey(PrizeTypes.AssetType.ERC20, address(reentrantToken), 0);
        assertEq(isolatedVault.fundedByAsset(key), 10 ether);
    }

    function testBlacklistedOutboundTransferDoesNotMarkClaimed() external {
        BlacklistERC20 blocked = new BlacklistERC20();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(
            0, PrizeTypes.AssetType.ERC20, address(blocked), 0, 10 ether
        );
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("blocked-depositor");
        blocked.mint(depositor, 10 ether);
        vm.startPrank(depositor);
        blocked.approve(address(isolatedVault), 10 ether);
        isolatedVault.fundERC20(address(blocked), 10 ether);
        vm.stopPrank();
        isolatedVault.seal();
        isolatedRound.setOneWinner(winnerOne);
        blocked.setBlacklisted(winnerOne, true);
        vm.expectRevert();
        isolatedVault.release(0);
        assertFalse(isolatedVault.getAllocation(0).claimed);
    }

    function testForcedEtherBeforeSealIsRecoverableWithoutRecordedContributions() external {
        ForceEther force = new ForceEther{ value: 2 ether }();
        force.force(payable(address(vault)));
        assertEq(vault.recoverableBalance(PrizeTypes.AssetType.NATIVE, address(0), 0), 2 ether);
    }

    function testERC1271GlobalAdminCanFormGlobalRoundQuorum() external {
        MockERC1271Signer contractAdmin = new MockERC1271Signer();
        factory.setGlobalAdmin(address(contractAdmin), true);
        vm.deal(address(vault), 2 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        bytes32 digest = vault.hashRecoveryAction(action);
        contractAdmin.setApproved(digest, true);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ROUND_ADMIN_KEY, digest);
        bytes memory roundSignature = abi.encodePacked(r, s, v);
        bytes32 actionId = vault.queueRecovery(
            action, address(contractAdmin), hex"01", roundAdmin, roundSignature
        );
        vm.warp(block.timestamp + 5 minutes);
        vault.executeRecovery(actionId);
        assertEq(recoveryRecipient.balance, 1 ether);
    }

    function testMalformedAndRevertingERC1271RecoverySignaturesFailClosed() external {
        MockERC1271Signer contractAdmin = new MockERC1271Signer();
        factory.setGlobalAdmin(address(contractAdmin), true);
        vm.deal(address(vault), 1 ether);

        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        bytes32 digest = vault.hashRecoveryAction(action);
        (bytes memory roundSignature,) = _signDigest(digest, ROUND_ADMIN_KEY, ROUND_ADMIN_TWO_KEY);

        vm.expectRevert(RoundPrizeVault.InvalidSignature.selector);
        vault.queueRecovery(
            action, address(contractAdmin), hex"deadbeef", roundAdmin, roundSignature
        );

        contractAdmin.setShouldRevert(true);
        vm.expectRevert(RoundPrizeVault.InvalidSignature.selector);
        vault.queueRecovery(
            action, address(contractAdmin), hex"deadbeef", roundAdmin, roundSignature
        );

        assertEq(vault.recoveryNonce(), 0);
    }

    function testRecoverySignatureCannotReplayAcrossChainIds() external {
        vm.deal(address(vault), 1 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);

        vm.chainId(block.chainid + 1);
        vm.expectRevert(RoundPrizeVault.InvalidSignature.selector);
        vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        assertEq(vault.recoveryNonce(), 0);
    }

    function testMalformedRecoveryTupleRejectedBeforeQueueing() external {
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        action.token = address(token20);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        vm.expectRevert(RoundPrizeVault.InvalidAsset.selector);
        vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
    }

    function testQueuedRecoveryCanBeCanceledOnlyByEquivalentQuorum() external {
        vm.deal(address(vault), 2 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 actionId = vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        uint48 deadline = uint48(block.timestamp + 1 days);
        bytes32 cancelDigest = vault.hashRecoveryCancellation(actionId, 0, deadline);
        (sigOne, sigTwo) = _signDigest(cancelDigest, ROUND_ADMIN_KEY, ROUND_ADMIN_TWO_KEY);
        vault.cancelRecovery(actionId, deadline, roundAdmin, sigOne, roundAdminTwo, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVault.RecoveryAlreadyExecuted.selector);
        vault.executeRecovery(actionId);
    }

    function testCancellationRoleRevocationAndReplayFailClosed() external {
        vm.deal(address(vault), 1 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 actionId = vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);

        uint48 deadline = uint48(block.timestamp + 1 days);
        bytes32 digest = vault.hashRecoveryCancellation(actionId, 0, deadline);
        (sigOne, sigTwo) = _signDigest(digest, ROUND_ADMIN_KEY, ROUND_ADMIN_TWO_KEY);
        round.setAdmin(roundAdminTwo, false);
        vm.expectRevert(RoundPrizeVault.InvalidSignerPair.selector);
        vault.cancelRecovery(actionId, deadline, roundAdmin, sigOne, roundAdminTwo, sigTwo);
        assertEq(vault.cancellationNonce(), 0);

        round.setAdmin(roundAdminTwo, true);
        vault.cancelRecovery(actionId, deadline, roundAdmin, sigOne, roundAdminTwo, sigTwo);
        assertEq(vault.cancellationNonce(), 1);
        vm.expectRevert(RoundPrizeVault.RecoveryAlreadyExecuted.selector);
        vault.cancelRecovery(actionId, deadline, roundAdmin, sigOne, roundAdminTwo, sigTwo);
    }

    function testQueuedRecoveryExpiresPermissionlesslyAndOnlyAfterDeadline() external {
        vm.deal(address(vault), 1 ether);
        PrizeTypes.RecoveryAction memory action =
            _action(PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, 0);
        action.deadline = uint48(block.timestamp + 5 minutes);
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 actionId = vault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        vm.expectRevert(RoundPrizeVault.InvalidDeadline.selector);
        vault.expireRecovery(actionId);

        vm.warp(block.timestamp + 5 minutes + 1);
        vault.expireRecovery(actionId);
        vm.expectRevert(RoundPrizeVault.RecoveryAlreadyExecuted.selector);
        vault.expireRecovery(actionId);
        vm.expectRevert(RoundPrizeVault.RecoveryAlreadyExecuted.selector);
        vault.executeRecovery(actionId);
    }

    function testWinnerSignedClaimRedirectIsBoundAndNonReplayable() external {
        uint256 winnerKey = 0x5151;
        address winner = vm.addr(winnerKey);
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("redirect-depositor");
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        isolatedVault.fundNative{ value: 1 ether }();
        isolatedVault.seal();
        isolatedRound.setOneWinner(winner);
        address recipient = makeAddr("alternate-recipient");
        uint48 deadline = uint48(block.timestamp + 1 days);
        bytes32 digest = isolatedVault.hashClaimAuthorization(0, recipient, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(winnerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        isolatedVault.claimTo(0, recipient, deadline, signature);
        assertEq(recipient.balance, 1 ether);
        vm.expectRevert();
        isolatedVault.claimTo(0, recipient, deadline, signature);
    }

    function testERC1271WinnerClaimRedirectAcceptsOnlyValidContractAuthorization() external {
        MockERC1271Signer contractWinner = new MockERC1271Signer();
        PrizeTypes.AllocationInput[] memory plan = new PrizeTypes.AllocationInput[](1);
        plan[0] = PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        (RoundPrizeVault isolatedVault, MockPrizeRound isolatedRound) = _newVault(plan);
        address depositor = makeAddr("1271-winner-depositor");
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        isolatedVault.fundNative{ value: 1 ether }();
        isolatedVault.seal();
        isolatedRound.setOneWinner(address(contractWinner));

        address recipient = makeAddr("1271-alternate-recipient");
        uint48 deadline = uint48(block.timestamp + 1 days);
        bytes32 digest = isolatedVault.hashClaimAuthorization(0, recipient, 0, deadline);

        vm.expectRevert(RoundPrizeVault.InvalidSignature.selector);
        isolatedVault.claimTo(0, recipient, deadline, hex"deadbeef");
        contractWinner.setShouldRevert(true);
        vm.expectRevert(RoundPrizeVault.InvalidSignature.selector);
        isolatedVault.claimTo(0, recipient, deadline, hex"deadbeef");

        contractWinner.setShouldRevert(false);
        contractWinner.setApproved(digest, true);
        isolatedVault.claimTo(0, recipient, deadline, hex"deadbeef");
        assertEq(recipient.balance, 1 ether);
        assertEq(isolatedVault.claimNonces(address(contractWinner)), 1);
    }

    function _executeNativeExcessRecovery(
        uint256 nonce,
        uint256 keyOne,
        address signerOne,
        uint256 keyTwo,
        address signerTwo
    ) private {
        PrizeTypes.RecoveryAction memory action = _action(
            PrizeTypes.RecoveryKind.EXCESS, 1 ether, recoveryRecipient, nonce
        );
        (bytes memory sigOne, bytes memory sigTwo) = _sign(action, keyOne, keyTwo);
        bytes32 actionId = vault.queueRecovery(action, signerOne, sigOne, signerTwo, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        vault.executeRecovery(actionId);
    }

    function _recoverOnVault(
        RoundPrizeVault targetVault,
        PrizeTypes.AssetType assetType,
        address token,
        uint256 tokenId,
        uint256 amount,
        uint256 nonce
    ) private {
        PrizeTypes.RecoveryAction memory action = PrizeTypes.RecoveryAction({
            kind: PrizeTypes.RecoveryKind.EXCESS,
            assetType: assetType,
            token: token,
            tokenId: tokenId,
            amount: amount,
            recipient: recoveryRecipient,
            allocationId: 0,
            nonce: nonce,
            validAfter: uint48(block.timestamp),
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 digest = targetVault.hashRecoveryAction(action);
        (bytes memory sigOne, bytes memory sigTwo) =
            _signDigest(digest, GLOBAL_ONE_KEY, GLOBAL_TWO_KEY);
        bytes32 actionId = targetVault.queueRecovery(action, globalOne, sigOne, globalTwo, sigTwo);
        vm.warp(block.timestamp + 5 minutes);
        targetVault.executeRecovery(actionId);
    }

    function _newVault(PrizeTypes.AllocationInput[] memory plan)
        private
        returns (RoundPrizeVault newVault, MockPrizeRound newRound)
    {
        newRound = new MockPrizeRound(address(factory));
        RoundPrizeVault implementation = new RoundPrizeVault();
        newVault = RoundPrizeVault(payable(Clones.clone(address(implementation))));
        factory.setRound(address(newRound), true);
        newRound.setAdmin(roundAdmin, true);
        newRound.setAdmin(roundAdminTwo, true);
        newRound.configureVault(address(newVault));
        PrizeTypes.VaultConfig memory config = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: plan
        });
        bytes32 planHash = keccak256(
            abi.encode(plan, config.recoveryRecipient, config.claimPeriod, config.recoveryDelay)
        );
        factory.initializeVault(newVault, address(newRound), planHash, config);
    }

    function _action(PrizeTypes.RecoveryKind kind, uint256 amount, address recipient, uint256 nonce)
        private
        view
        returns (PrizeTypes.RecoveryAction memory)
    {
        return PrizeTypes.RecoveryAction({
            kind: kind,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: amount,
            recipient: recipient,
            allocationId: 0,
            nonce: nonce,
            validAfter: uint48(block.timestamp),
            deadline: uint48(block.timestamp + 1 days)
        });
    }

    function _sign(PrizeTypes.RecoveryAction memory action, uint256 keyOne, uint256 keyTwo)
        private
        view
        returns (bytes memory sigOne, bytes memory sigTwo)
    {
        bytes32 digest = vault.hashRecoveryAction(action);
        return _signDigest(digest, keyOne, keyTwo);
    }

    function _signDigest(bytes32 digest, uint256 keyOne, uint256 keyTwo)
        private
        view
        returns (bytes memory sigOne, bytes memory sigTwo)
    {
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(keyOne, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(keyTwo, digest);
        sigOne = abi.encodePacked(r1, s1, v1);
        sigTwo = abi.encodePacked(r2, s2, v2);
    }
}
