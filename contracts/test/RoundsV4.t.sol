// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { RoundV4 } from "../src/v4/RoundV4.sol";
import { RoundPrizeVaultV4 } from "../src/v4/RoundPrizeVaultV4.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract V4RejectingReceiver {
    receive() external payable {
        revert("reject");
    }
}

contract RoundsV4Test is Test {
    uint256 private constant FEE = 0.0001 ether;
    uint256 private constant ADMIN_ONE_KEY = 0xA11CE;
    uint256 private constant ADMIN_TWO_KEY = 0xB0B;
    uint256 private constant CREATOR_KEY = 0xC0FFEE;
    uint256 private constant WINNER_KEY = 0xBEEF;
    uint256 private constant ROUND_ADMIN_KEY = 0xD00D;
    address private constant TREASURY = address(0x7EA5);

    address private adminOne;
    address private adminTwo;
    address private creator;
    address private submitter;
    address private winner;
    address private recoveryRecipient;
    address private stranger;

    RoundFactoryV3 private factory;
    RoundV4 private roundImplementation;
    RoundPrizeVaultV4 private vaultImplementation;
    LilNounsVotingPower private adapter;

    function setUp() external {
        vm.chainId(31_337);
        adminOne = vm.addr(ADMIN_ONE_KEY);
        adminTwo = vm.addr(ADMIN_TWO_KEY);
        creator = vm.addr(CREATOR_KEY);
        submitter = makeAddr("submitter");
        winner = vm.addr(WINNER_KEY);
        recoveryRecipient = makeAddr("recovery-recipient");
        stranger = makeAddr("public-executor");

        MockLilNounsVotes token = new MockLilNounsVotes(address(this));
        adapter = new LilNounsVotingPower(address(token));
        roundImplementation = new RoundV4();
        vaultImplementation = new RoundPrizeVaultV4();
        factory = new RoundFactoryV3(
            adminOne,
            adminTwo,
            TREASURY,
            FEE,
            address(roundImplementation),
            address(vaultImplementation),
            address(adapter),
            true
        );
        vm.deal(creator, 20 ether);
    }

    function testV4PairCreatesAndSubmissionsStartApproved() external {
        (RoundV4 round,) = _createRound(_emptyVaultConfig(), keccak256("approved"));
        RoundTypes.RoundConfig memory config = _config();
        vm.warp(config.submissionsOpen);

        vm.prank(submitter);
        uint256 submissionId = round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Entry",
            "A valid description",
            "ipfs://entry",
            keccak256("entry")
        );
        assertEq(
            uint8(round.getSubmission(submissionId).status),
            uint8(RoundTypes.SubmissionStatus.APPROVED)
        );

        vm.prank(creator);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.REJECTED);
        assertEq(
            uint8(round.getSubmission(submissionId).status),
            uint8(RoundTypes.SubmissionStatus.REJECTED)
        );

        vm.prank(creator);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.APPROVED);
        vm.prank(creator);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.HIDDEN);
        assertEq(
            uint8(round.getSubmission(submissionId).status),
            uint8(RoundTypes.SubmissionStatus.HIDDEN)
        );

        vm.prank(creator);
        vm.expectRevert(RoundV4.InvalidSubmission.selector);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.PENDING);

        vm.warp(config.votingStart);
        vm.prank(creator);
        vm.expectRevert(RoundV4.InvalidPhase.selector);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.APPROVED);
    }

    function testPublicReleaseWaitsForDelayAndAlwaysPaysWinner() external {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        uint256 availableAt = vault.distributionAvailableAt();

        vm.prank(stranger);
        vm.expectRevert(RoundPrizeVaultV4.DistributionNotReady.selector);
        vault.release(allocationId);

        vm.warp(availableAt);
        uint256 strangerBefore = stranger.balance;
        vm.prank(stranger);
        vault.release(allocationId);

        assertEq(winner.balance, 1 ether);
        assertEq(stranger.balance, strangerBefore);
        assertTrue(vault.getAllocation(allocationId).claimed);
        assertFalse(vault.isReclaimed(allocationId));
    }

    function testTwoSignaturesHoldAndUnholdOnlyOneAllocation() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVaultWithTwoAllocations();
        uint48 deadline = uint48(block.timestamp + 1 days);
        _hold(vault, 0, deadline, ADMIN_ONE_KEY, ADMIN_TWO_KEY);

        assertTrue(vault.isHeld(0));
        assertFalse(vault.isHeld(1));
        assertEq(vault.allocationNonces(0), 1);
        assertEq(vault.allocationNonces(1), 0);

        vm.warp(vault.distributionAvailableAt());
        vm.expectRevert(RoundPrizeVaultV4.AllocationHeld.selector);
        vault.release(0);
        vault.release(1);
        assertEq(winner.balance, 2 ether);

        deadline = uint48(block.timestamp + 1 days);
        _unhold(vault, 0, deadline, ADMIN_ONE_KEY, CREATOR_KEY);
        assertFalse(vault.isHeld(0));
        assertEq(vault.allocationNonces(0), 2);
        vault.release(0);
        assertEq(winner.balance, 3 ether);
    }

    function testHeldAllocationReclaimRequiresDelayFreshQuorumAndFixedRecipient() external {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(3 ether);
        uint48 deadline = uint48(block.timestamp + 2 days);
        _hold(vault, allocationId, deadline, ADMIN_ONE_KEY, ADMIN_TWO_KEY);

        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.RECLAIM,
            allocationId,
            ADMIN_ONE_KEY,
            CREATOR_KEY,
            deadline
        );
        vm.expectRevert(RoundPrizeVaultV4.ReclaimNotReady.selector);
        vault.reclaim(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);

        vm.warp(vault.heldAt(allocationId) + vault.recoveryDelay());
        uint256 recoveryBefore = recoveryRecipient.balance;
        vault.reclaim(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
        assertEq(recoveryRecipient.balance - recoveryBefore, 3 ether);
        assertTrue(vault.isReclaimed(allocationId));
        assertFalse(vault.isHeld(allocationId));
        assertEq(vault.allocationNonces(allocationId), 2);

        vm.expectRevert(RoundPrizeVaultV4.AlreadyClaimed.selector);
        vault.release(allocationId);
        vm.expectRevert(RoundPrizeVaultV4.AlreadyClaimed.selector);
        vault.reclaim(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
    }

    function testControlSignaturesRejectDuplicateUnauthorizedExpiredReplayAndWrongAction()
        external
    {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        uint48 deadline = uint48(block.timestamp + 1 days);
        (address signerOne, bytes memory signatureOne,,) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.HOLD,
            allocationId,
            ADMIN_ONE_KEY,
            ADMIN_TWO_KEY,
            deadline
        );

        vm.expectRevert(RoundPrizeVaultV4.InvalidSignerPair.selector);
        vault.hold(allocationId, deadline, signerOne, signatureOne, signerOne, signatureOne);

        uint256 strangerKey = 0xBAD;
        (
            address badOne,
            bytes memory badSignature,
            address validTwo,
            bytes memory validSignature
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.HOLD,
            allocationId,
            strangerKey,
            ADMIN_TWO_KEY,
            deadline
        );
        vm.expectRevert(RoundPrizeVaultV4.InvalidSignerPair.selector);
        vault.hold(allocationId, deadline, badOne, badSignature, validTwo, validSignature);

        vm.warp(deadline + 1);
        vm.expectRevert(RoundPrizeVaultV4.InvalidDeadline.selector);
        vault.hold(allocationId, deadline, signerOne, signatureOne, adminTwo, validSignature);
    }

    function testHoldWindowClosesBeforePublicDistributionOpens() external {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        uint48 deadline = uint48(block.timestamp + 1 days);
        vm.warp(vault.distributionAvailableAt());
        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.HOLD,
            allocationId,
            ADMIN_ONE_KEY,
            ADMIN_TWO_KEY,
            deadline
        );
        vm.expectRevert(RoundPrizeVaultV4.HoldWindowClosed.selector);
        vault.hold(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);

        vm.prank(stranger);
        vault.release(allocationId);
        assertEq(winner.balance, 1 ether);
    }

    function testAllocationAuthorizationRejectsWrongActionChainAndAllocation() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVaultWithTwoAllocations();
        uint48 deadline = uint48(block.timestamp + 1 days);
        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.UNHOLD,
            0,
            ADMIN_ONE_KEY,
            ADMIN_TWO_KEY,
            deadline
        );
        vm.expectRevert(RoundPrizeVaultV4.InvalidSignature.selector);
        vault.hold(0, deadline, signerOne, signatureOne, signerTwo, signatureTwo);

        (signerOne, signatureOne, signerTwo, signatureTwo) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.HOLD,
            0,
            ADMIN_ONE_KEY,
            ADMIN_TWO_KEY,
            deadline
        );
        vm.expectRevert(RoundPrizeVaultV4.InvalidSignature.selector);
        vault.hold(1, deadline, signerOne, signatureOne, signerTwo, signatureTwo);

        vm.chainId(31_338);
        vm.expectRevert(RoundPrizeVaultV4.InvalidSignature.selector);
        vault.hold(0, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
    }

    function testWinnerSignedClaimToRedirectRemainsAvailable() external {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        vm.warp(vault.distributionAvailableAt());
        address recipient = makeAddr("winner-recipient");
        uint48 deadline = uint48(block.timestamp + 1 days);
        bytes32 digest = vault.hashClaimAuthorization(allocationId, recipient, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(WINNER_KEY, digest);

        vm.prank(stranger);
        vault.claimTo(allocationId, recipient, deadline, abi.encodePacked(r, s, v));
        assertEq(recipient.balance, 1 ether);
        assertEq(winner.balance, 0);
    }

    function testRejectingWinnerDoesNotConsumeAllocationOrLiability() external {
        V4RejectingReceiver rejectingWinner = new V4RejectingReceiver();
        winner = address(rejectingWinner);
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        bytes32 key = vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0);
        vm.warp(vault.distributionAvailableAt());

        vm.expectRevert(RoundPrizeVaultV4.TransferFailed.selector);
        vault.release(allocationId);
        assertFalse(vault.getAllocation(allocationId).claimed);
        assertEq(vault.liabilityByAsset(key), 1 ether);
        assertEq(address(vault).balance, 1 ether);
    }

    function testAllocationDigestMatchesDeclaredEip712Schema() external {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        uint48 deadline = uint48(block.timestamp + 1 days);
        PrizeTypes.Allocation memory allocation = vault.getAllocation(allocationId);
        bytes32 allocationHash = keccak256(
            abi.encode(
                allocation.assetType, allocation.token, allocation.tokenId, allocation.amount
            )
        );
        bytes32 typeHash = keccak256(
            "AllocationAction(address vault,address round,bytes32 prizePlanHash,uint8 action,uint256 allocationId,bytes32 allocationHash,address recoveryRecipient,uint48 recoveryDelay,uint256 nonce,uint48 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                address(vault),
                vault.round(),
                vault.prizePlanHash(),
                RoundPrizeVaultV4.AllocationAction.HOLD,
                allocationId,
                allocationHash,
                vault.recoveryRecipient(),
                vault.recoveryDelay(),
                0,
                deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("LilNounsRoundPrizeVault")),
                keccak256(bytes("2")),
                block.chainid,
                address(vault)
            )
        );
        bytes32 explicitDigest =
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertEq(
            vault.hashAllocationAction(
                RoundPrizeVaultV4.AllocationAction.HOLD, allocationId, 0, deadline
            ),
            explicitDigest
        );
    }

    function testDelayedSafetyActionsRecoverOnlyExcessAndRotateRecipient() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVault(1 ether);
        vm.deal(address(vault), address(vault).balance + 2 ether);
        uint256 liabilityBefore =
            vault.liabilityByAsset(vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0));

        RoundPrizeVaultV4.SafetyAction memory recoverAction = RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.RECOVER_EXCESS,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 2 ether,
            recipient: recoveryRecipient,
            expectedRecoveryRecipient: recoveryRecipient,
            nonce: 0,
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 actionId = _queueSafety(vault, recoverAction, ADMIN_ONE_KEY, CREATOR_KEY);
        vm.expectRevert(RoundPrizeVaultV4.SafetyActionNotReady.selector);
        vault.executeSafetyAction(actionId);
        vm.warp(block.timestamp + vault.recoveryDelay());
        vault.executeSafetyAction(actionId);
        assertEq(recoveryRecipient.balance, 2 ether);
        assertEq(
            vault.liabilityByAsset(vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0)),
            liabilityBefore
        );

        address newRecipient = makeAddr("new-recovery-recipient");
        RoundPrizeVaultV4.SafetyAction memory rotateAction = RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.ROTATE_RECOVERY_RECIPIENT,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 0,
            recipient: newRecipient,
            expectedRecoveryRecipient: recoveryRecipient,
            nonce: 1,
            deadline: uint48(block.timestamp + 1 days)
        });
        actionId = _queueSafety(vault, rotateAction, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        vm.warp(block.timestamp + vault.recoveryDelay());
        vault.executeSafetyAction(actionId);
        assertEq(vault.recoveryRecipient(), newRecipient);
        assertEq(vault.safetyNonce(), 2);
    }

    function testSafetyDigestMatchesDeclaredEip712Schema() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVault(1 ether);
        RoundPrizeVaultV4.SafetyAction memory action = RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.RECOVER_EXCESS,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1,
            recipient: recoveryRecipient,
            expectedRecoveryRecipient: recoveryRecipient,
            nonce: 0,
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SafetyAction(address vault,address round,bytes32 prizePlanHash,uint8 kind,uint8 assetType,address token,uint256 tokenId,uint256 amount,address recipient,address expectedRecoveryRecipient,uint256 nonce,uint48 deadline)"
                ),
                address(vault),
                vault.round(),
                vault.prizePlanHash(),
                action.kind,
                action.assetType,
                action.token,
                action.tokenId,
                action.amount,
                action.recipient,
                action.expectedRecoveryRecipient,
                action.nonce,
                action.deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("LilNounsRoundPrizeVault")),
                keccak256(bytes("2")),
                block.chainid,
                address(vault)
            )
        );
        assertEq(
            vault.hashSafetyAction(action),
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))
        );
    }

    function testSafetyRecoveryCannotConsumeCommittedLiability() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVault(1 ether);
        RoundPrizeVaultV4.SafetyAction memory action = RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.RECOVER_EXCESS,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1,
            recipient: recoveryRecipient,
            expectedRecoveryRecipient: recoveryRecipient,
            nonce: 0,
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 actionId = _queueSafety(vault, action, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        vm.warp(block.timestamp + vault.recoveryDelay());
        vm.expectRevert(RoundPrizeVaultV4.InsufficientRecoverableBalance.selector);
        vault.executeSafetyAction(actionId);
        assertEq(address(vault).balance, 1 ether);
    }

    function testSafetyActionRevalidatesSignerRolesAtExecution() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVault(1 ether);
        vm.deal(address(vault), address(vault).balance + 1 ether);
        RoundPrizeVaultV4.SafetyAction memory action = RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.RECOVER_EXCESS,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1 ether,
            recipient: recoveryRecipient,
            expectedRecoveryRecipient: recoveryRecipient,
            nonce: 0,
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 actionId = _queueSafety(vault, action, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        vm.prank(adminTwo);
        factory.rotateGlobalAdmin(adminTwo, makeAddr("replacement"));
        vm.warp(block.timestamp + vault.recoveryDelay());

        vm.expectRevert(RoundPrizeVaultV4.InvalidSignerPair.selector);
        vault.executeSafetyAction(actionId);
        assertEq(recoveryRecipient.balance, 0);
    }

    function testSafetyActionsBindRecipientStateAndCannotExecuteOutOfOrder() external {
        (RoundPrizeVaultV4 vault,) = _fundedFinalizedVault(1 ether);
        vm.deal(address(vault), address(vault).balance + 1 ether);
        address firstRecipient = makeAddr("first-recipient");
        address secondRecipient = makeAddr("second-recipient");
        uint48 deadline = uint48(block.timestamp + 1 days);

        RoundPrizeVaultV4.SafetyAction memory firstRotation =
            _rotationAction(recoveryRecipient, firstRecipient, 0, deadline);
        bytes32 firstId = _queueSafety(vault, firstRotation, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        RoundPrizeVaultV4.SafetyAction memory queuedExcess = RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.RECOVER_EXCESS,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1 ether,
            recipient: recoveryRecipient,
            expectedRecoveryRecipient: recoveryRecipient,
            nonce: 1,
            deadline: deadline
        });
        bytes32 excessId = _queueSafety(vault, queuedExcess, ADMIN_ONE_KEY, CREATOR_KEY);
        RoundPrizeVaultV4.SafetyAction memory secondRotation =
            _rotationAction(recoveryRecipient, secondRecipient, 2, deadline);
        bytes32 secondId = _queueSafety(vault, secondRotation, ADMIN_ONE_KEY, ADMIN_TWO_KEY);

        vm.warp(block.timestamp + vault.recoveryDelay());
        vault.executeSafetyAction(secondId);
        assertEq(vault.recoveryRecipient(), secondRecipient);
        vm.expectRevert(RoundPrizeVaultV4.InvalidAddress.selector);
        vault.executeSafetyAction(firstId);
        vm.expectRevert(RoundPrizeVaultV4.InvalidAddress.selector);
        vault.executeSafetyAction(excessId);
        assertEq(address(vault).balance, 2 ether);
    }

    function testNoWinnerCanBeHeldAndReclaimedAfterClaimPeriod() external {
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        (RoundV4 round, RoundPrizeVaultV4 vault) =
            _createRound(vaultConfig, keccak256("no-winner-rescue"));
        vault.fundNative{ value: 1 ether }();
        vault.seal();
        vm.warp(_config().votingEnd);
        round.finalize();
        vm.warp(vault.distributionAvailableAt());
        vm.expectRevert(RoundPrizeVaultV4.UnauthorizedClaim.selector);
        vault.release(0);

        vm.warp(vault.distributionAvailableAt() + vault.claimPeriod());
        uint48 deadline = uint48(block.timestamp + 1 days);
        _hold(vault, 0, deadline, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        vm.warp(block.timestamp + vault.recoveryDelay());
        _reclaim(vault, 0, deadline, ADMIN_ONE_KEY, CREATOR_KEY);
        assertEq(recoveryRecipient.balance, 1 ether);
        assertTrue(vault.isReclaimed(0));
    }

    function testRejectingWinnerCanBeHeldAndReclaimedAfterClaimPeriod() external {
        winner = address(new V4RejectingReceiver());
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        vm.warp(vault.distributionAvailableAt());
        vm.expectRevert(RoundPrizeVaultV4.TransferFailed.selector);
        vault.release(allocationId);

        vm.warp(vault.distributionAvailableAt() + vault.claimPeriod());
        uint48 deadline = uint48(block.timestamp + 1 days);
        _hold(vault, allocationId, deadline, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        vm.warp(block.timestamp + vault.recoveryDelay());
        _reclaim(vault, allocationId, deadline, ADMIN_ONE_KEY, CREATOR_KEY);
        assertEq(recoveryRecipient.balance, 1 ether);
        assertTrue(vault.isReclaimed(allocationId));
    }

    function testStaleSignerRoleInvalidatesAllocationAuthorization() external {
        (RoundPrizeVaultV4 vault, uint256 allocationId) = _fundedFinalizedVault(1 ether);
        uint48 deadline = uint48(block.timestamp + 1 days);
        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.HOLD,
            allocationId,
            ADMIN_ONE_KEY,
            ADMIN_TWO_KEY,
            deadline
        );
        address replacement = makeAddr("replacement-admin");
        vm.prank(adminTwo);
        factory.rotateGlobalAdmin(adminTwo, replacement);

        vm.expectRevert(RoundPrizeVaultV4.InvalidSignerPair.selector);
        vault.hold(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
    }

    function testAllAuthorizedSignerPairCombinations() external {
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        (RoundV4 round, RoundPrizeVaultV4 vault) =
            _createRound(vaultConfig, keccak256("signer-pairs"));
        vm.prank(creator);
        round.grantRoundAdmin(vm.addr(ROUND_ADMIN_KEY));
        vault.fundNative{ value: 1 ether }();
        vault.seal();
        _finalizeWithWinner(round);

        uint48 deadline = uint48(block.timestamp + 1 days);
        _hold(vault, 0, deadline, ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        _unhold(vault, 0, deadline, ADMIN_ONE_KEY, CREATOR_KEY);
        _hold(vault, 0, deadline, ADMIN_ONE_KEY, ROUND_ADMIN_KEY);
        _unhold(vault, 0, deadline, CREATOR_KEY, ROUND_ADMIN_KEY);
        assertEq(vault.allocationNonces(0), 4);
        assertFalse(vault.isHeld(0));
    }

    function _createRound(PrizeTypes.VaultConfig memory vaultConfig, bytes32 salt)
        private
        returns (RoundV4 round, RoundPrizeVaultV4 vault)
    {
        vm.prank(creator);
        (address roundAddress, address vaultAddress) =
            factory.createRound{ value: FEE }(_config(), vaultConfig, salt);
        round = RoundV4(payable(roundAddress));
        vault = RoundPrizeVaultV4(payable(vaultAddress));
    }

    function _fundedFinalizedVault(uint256 amount)
        private
        returns (RoundPrizeVaultV4 vault, uint256 allocationId)
    {
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, amount);
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        (RoundV4 round, RoundPrizeVaultV4 deployedVault) =
            _createRound(vaultConfig, keccak256(abi.encode(amount, "single")));
        vault = deployedVault;
        vault.fundNative{ value: amount }();
        vault.seal();
        _finalizeWithWinner(round);
        allocationId = 0;
    }

    function _fundedFinalizedVaultWithTwoAllocations()
        private
        returns (RoundPrizeVaultV4 vault, uint256 allocationId)
    {
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](2);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        allocations[1] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 2 ether);
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        (RoundV4 round, RoundPrizeVaultV4 deployedVault) =
            _createRound(vaultConfig, keccak256("two-allocations"));
        vault = deployedVault;
        vault.fundNative{ value: 3 ether }();
        vault.seal();
        _finalizeWithWinner(round);
        allocationId = 0;
    }

    function _finalizeWithWinner(RoundV4 round) private {
        RoundTypes.RoundConfig memory config = _config();
        vm.warp(config.submissionsOpen);
        vm.prank(winner);
        round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Winner",
            "A winning description",
            "ipfs://winner",
            keccak256("winner")
        );
        vm.warp(config.votingEnd);
        round.finalize();
        assertEq(round.winnerAddress(0), winner);
    }

    function _hold(
        RoundPrizeVaultV4 vault,
        uint256 allocationId,
        uint48 deadline,
        uint256 signerOneKey,
        uint256 signerTwoKey
    ) private {
        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.HOLD,
            allocationId,
            signerOneKey,
            signerTwoKey,
            deadline
        );
        vault.hold(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
    }

    function _unhold(
        RoundPrizeVaultV4 vault,
        uint256 allocationId,
        uint48 deadline,
        uint256 signerOneKey,
        uint256 signerTwoKey
    ) private {
        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.UNHOLD,
            allocationId,
            signerOneKey,
            signerTwoKey,
            deadline
        );
        vault.unhold(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
    }

    function _reclaim(
        RoundPrizeVaultV4 vault,
        uint256 allocationId,
        uint48 deadline,
        uint256 signerOneKey,
        uint256 signerTwoKey
    ) private {
        (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        ) = _authorization(
            vault,
            RoundPrizeVaultV4.AllocationAction.RECLAIM,
            allocationId,
            signerOneKey,
            signerTwoKey,
            deadline
        );
        vault.reclaim(allocationId, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
    }

    function _authorization(
        RoundPrizeVaultV4 vault,
        RoundPrizeVaultV4.AllocationAction action,
        uint256 allocationId,
        uint256 signerOneKey,
        uint256 signerTwoKey,
        uint48 deadline
    )
        private
        view
        returns (
            address signerOne,
            bytes memory signatureOne,
            address signerTwo,
            bytes memory signatureTwo
        )
    {
        uint256 nonce = vault.allocationNonces(allocationId);
        bytes32 digest = vault.hashAllocationAction(action, allocationId, nonce, deadline);
        signerOne = vm.addr(signerOneKey);
        signerTwo = vm.addr(signerTwoKey);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(signerOneKey, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(signerTwoKey, digest);
        signatureOne = abi.encodePacked(r1, s1, v1);
        signatureTwo = abi.encodePacked(r2, s2, v2);
    }

    function _queueSafety(
        RoundPrizeVaultV4 vault,
        RoundPrizeVaultV4.SafetyAction memory action,
        uint256 signerOneKey,
        uint256 signerTwoKey
    ) private returns (bytes32 actionId) {
        bytes32 digest = vault.hashSafetyAction(action);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(signerOneKey, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(signerTwoKey, digest);
        actionId = vault.queueSafetyAction(
            action,
            vm.addr(signerOneKey),
            abi.encodePacked(r1, s1, v1),
            vm.addr(signerTwoKey),
            abi.encodePacked(r2, s2, v2)
        );
    }

    function _rotationAction(
        address expectedRecipient,
        address newRecipient,
        uint256 nonce,
        uint48 deadline
    ) private pure returns (RoundPrizeVaultV4.SafetyAction memory) {
        return RoundPrizeVaultV4.SafetyAction({
            kind: RoundPrizeVaultV4.SafetyActionKind.ROTATE_RECOVERY_RECIPIENT,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 0,
            recipient: newRecipient,
            expectedRecoveryRecipient: expectedRecipient,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _config() private view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-v4",
            metadataHash: keccak256("round-v4"),
            roundStart: uint40(block.timestamp),
            submissionsOpen: uint40(block.timestamp + 1 days),
            submissionsClose: uint40(block.timestamp + 1 days + 5 minutes),
            votingStart: uint40(block.timestamp + 1 days + 10 minutes),
            votingEnd: uint40(block.timestamp + 1 days + 15 minutes),
            votingPowerAdapter: address(adapter),
            votingStrategy: RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE,
            snapshotMode: RoundTypes.SnapshotMode.VOTING_START,
            customSnapshotBlock: 0,
            baseOrFixedVotes: 0,
            maxVotesPerSubmission: 6,
            maxSubmissionsPerWallet: 2,
            maxSubmissions: 10,
            winnerCount: 1,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 10,
            maxDescriptionLength: 2_000
        });
    }

    function _emptyVaultConfig() private view returns (PrizeTypes.VaultConfig memory) {
        return PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: new PrizeTypes.AllocationInput[](0)
        });
    }

    receive() external payable { }
}
