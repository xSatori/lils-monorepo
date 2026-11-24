// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { RoundRelease010 } from "../src/0.1.0/RoundRelease010.sol";
import { RoundPrizeVaultRelease010 } from "../src/0.1.0/RoundPrizeVaultRelease010.sol";
import { SepoliaRoundTestAdmin } from "../src/0.1.0/SepoliaRoundTestAdmin.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";

contract RoundsRelease010VaultQuorumTest is Test {
    uint256 private constant OWNER_ONE_KEY = 11;
    uint256 private constant OWNER_TWO_KEY = 12;
    uint256 private constant ROUND_ADMIN_ONE_KEY = 13;
    uint256 private constant ROUND_ADMIN_TWO_KEY = 14;
    SepoliaRoundTestAdmin private globalAdmin;
    RoundRelease010 private round;
    RoundPrizeVaultRelease010 private vault;

    function setUp() external {
        vm.chainId(31_337);
        vm.roll(100);
        vm.deal(address(this), 2 ether);
        globalAdmin = new SepoliaRoundTestAdmin(vm.addr(OWNER_ONE_KEY), vm.addr(OWNER_TWO_KEY));
        address adapter =
            address(new LilNounsVotingPower(address(new MockLilNounsVotes(address(this)))));
        round = RoundRelease010(payable(Clones.clone(address(new RoundRelease010()))));
        vault = RoundPrizeVaultRelease010(payable(Clones.clone(address(new RoundPrizeVaultRelease010()))));
        RoundTypes.RoundConfig memory config = RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-0.1.0",
            metadataHash: keccak256("round-0.1.0"),
            roundStart: 0,
            submissionsOpen: 0,
            submissionsClose: 0,
            votingStart: 0,
            votingEnd: 0,
            votingPowerAdapter: adapter,
            votingStrategy: RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE,
            snapshotMode: RoundTypes.SnapshotMode.VOTING_START,
            customSnapshotBlock: 0,
            baseOrFixedVotes: 0,
            maxVotesPerSubmission: 1,
            maxSubmissionsPerWallet: 1,
            maxSubmissions: 2,
            winnerCount: 1,
            minTitleLength: 3,
            maxTitleLength: 100,
            minDescriptionLength: 3,
            maxDescriptionLength: 2000
        });
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: makeAddr("recovery"),
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        bytes32 planHash = keccak256(
            abi.encode(
                vaultConfig.allocations,
                vaultConfig.recoveryRecipient,
                vaultConfig.claimPeriod,
                vaultConfig.recoveryDelay
            )
        );
        round.initialize(
            address(this), address(this), address(vault), 8, keccak256("config"), planHash, config
        );
        vault.initialize(address(this), address(round), true, planHash, vaultConfig);
        round.grantRoundAdmin(vm.addr(ROUND_ADMIN_ONE_KEY));
        round.grantRoundAdmin(vm.addr(ROUND_ADMIN_TWO_KEY));
        vault.fundNative{ value: 1 ether }();
        vault.seal();
        uint40 open = uint40(block.timestamp + 1);
        round.setSchedule(open, open + 5 minutes, open + 10 minutes, open + 15 minutes);
        vm.warp(open);
        vm.prank(makeAddr("submitter"));
        round.submit(
            RoundRelease010.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "abc",
                description: "hello",
                metadataURI: "ipfs://entry",
                metadataHash: keccak256("entry"),
                originalImageCount: 0
            })
        );
        vm.prank(makeAddr("other-submitter"));
        round.submit(
            RoundRelease010.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "def",
                description: "hello",
                metadataURI: "ipfs://entry2",
                metadataHash: keccak256("entry2"),
                originalImageCount: 0
            })
        );
        vm.warp(round.votingEnd());
        round.finalizeBatch(1);
    }

    function isRound(address candidate) external view returns (bool) {
        return candidate == address(round);
    }

    function isGlobalAdmin(address candidate) external view returns (bool) {
        return candidate == address(globalAdmin);
    }

    function testMode() external pure returns (bool) {
        return true;
    }

    function testGlobalPlusRoundInEitherOrderCanHoldButRoundPairAndGlobalAloneCannot() external {
        _complete();
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes32 digest =
            vault.hashAllocationAction(RoundPrizeVaultRelease010.AllocationAction.HOLD, 0, 0, deadline);
        bytes memory globalSignature = _globalSignature(digest);
        bytes memory adminOneSignature = _sign(ROUND_ADMIN_ONE_KEY, digest);
        bytes memory adminTwoSignature = _sign(ROUND_ADMIN_TWO_KEY, digest);

        vm.expectRevert(RoundPrizeVaultRelease010.InvalidSignerPair.selector);
        vault.hold(
            0,
            deadline,
            vm.addr(ROUND_ADMIN_ONE_KEY),
            adminOneSignature,
            vm.addr(ROUND_ADMIN_TWO_KEY),
            adminTwoSignature
        );
        vm.expectRevert(RoundPrizeVaultRelease010.InvalidSignerPair.selector);
        vault.hold(
            0,
            deadline,
            address(globalAdmin),
            globalSignature,
            address(globalAdmin),
            globalSignature
        );
        vault.hold(
            0,
            deadline,
            vm.addr(ROUND_ADMIN_ONE_KEY),
            adminOneSignature,
            address(globalAdmin),
            globalSignature
        );
        assertTrue(vault.isHeld(0));

        digest =
            vault.hashAllocationAction(RoundPrizeVaultRelease010.AllocationAction.UNHOLD, 0, 1, deadline);
        vault.unhold(
            0,
            deadline,
            address(globalAdmin),
            _globalSignature(digest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, digest)
        );
        assertFalse(vault.isHeld(0));
    }

    function testRevokedRoundAdminCannotAuthorizeOrExecuteQueuedAction() external {
        _complete();
        RoundPrizeVaultRelease010.SafetyAction memory action = RoundPrizeVaultRelease010.SafetyAction({
            kind: RoundPrizeVaultRelease010.SafetyActionKind.ROTATE_RECOVERY_RECIPIENT,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 0,
            recipient: makeAddr("new-recovery"),
            expectedRecoveryRecipient: vault.recoveryRecipient(),
            nonce: 0,
            deadline: uint48(block.timestamp + 20 minutes)
        });
        bytes32 digest = vault.hashSafetyAction(action);
        bytes32 actionId = vault.queueSafetyAction(
            action,
            address(globalAdmin),
            _globalSignature(digest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, digest)
        );
        round.revokeRoundAdmin(vm.addr(ROUND_ADMIN_ONE_KEY));
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVaultRelease010.InvalidSignerPair.selector);
        vault.executeSafetyAction(actionId);
    }

    function testSafetyCancellationRequiresGlobalAndEligibleRoundAdmin() external {
        _complete();
        RoundPrizeVaultRelease010.SafetyAction memory action = RoundPrizeVaultRelease010.SafetyAction({
            kind: RoundPrizeVaultRelease010.SafetyActionKind.ROTATE_RECOVERY_RECIPIENT,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 0,
            recipient: makeAddr("new-recovery"),
            expectedRecoveryRecipient: vault.recoveryRecipient(),
            nonce: 0,
            deadline: uint48(block.timestamp + 20 minutes)
        });
        bytes32 digest = vault.hashSafetyAction(action);
        bytes32 actionId = vault.queueSafetyAction(
            action,
            address(globalAdmin),
            _globalSignature(digest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, digest)
        );
        uint48 deadline = uint48(block.timestamp + 10 minutes);
        digest = vault.hashSafetyCancellation(actionId, deadline);
        vm.expectRevert(RoundPrizeVaultRelease010.InvalidSignerPair.selector);
        vault.cancelSafetyAction(
            actionId,
            deadline,
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, digest),
            vm.addr(ROUND_ADMIN_TWO_KEY),
            _sign(ROUND_ADMIN_TWO_KEY, digest)
        );
        vault.cancelSafetyAction(
            actionId,
            deadline,
            address(globalAdmin),
            _globalSignature(digest),
            vm.addr(ROUND_ADMIN_TWO_KEY),
            _sign(ROUND_ADMIN_TWO_KEY, digest)
        );
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVaultRelease010.SafetyActionAlreadyExecuted.selector);
        vault.executeSafetyAction(actionId);
        vm.expectRevert(RoundPrizeVaultRelease010.SafetyActionAlreadyExecuted.selector);
        vault.cancelSafetyAction(
            actionId,
            deadline,
            address(globalAdmin),
            _globalSignature(digest),
            vm.addr(ROUND_ADMIN_TWO_KEY),
            _sign(ROUND_ADMIN_TWO_KEY, digest)
        );
    }

    function testHeldAllocationReclaimNeedsFreshQuorumAndClearsLiability() external {
        _complete();
        uint48 deadline = uint48(block.timestamp + 20 minutes);
        bytes32 holdDigest =
            vault.hashAllocationAction(RoundPrizeVaultRelease010.AllocationAction.HOLD, 0, 0, deadline);
        vault.hold(
            0,
            deadline,
            address(globalAdmin),
            _globalSignature(holdDigest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, holdDigest)
        );
        vm.warp(block.timestamp + 5 minutes);
        bytes32 reclaimDigest = vault.hashAllocationAction(
            RoundPrizeVaultRelease010.AllocationAction.RECLAIM, 0, 1, deadline
        );
        vm.expectRevert(RoundPrizeVaultRelease010.InvalidSignature.selector);
        vault.reclaim(
            0,
            deadline,
            address(globalAdmin),
            _globalSignature(holdDigest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, holdDigest)
        );
        address recipient = vault.recoveryRecipient();
        uint256 beforeBalance = recipient.balance;
        vault.reclaim(
            0,
            deadline,
            address(globalAdmin),
            _globalSignature(reclaimDigest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, reclaimDigest)
        );
        assertEq(recipient.balance, beforeBalance + 1 ether);
        assertEq(
            vault.liabilityByAsset(vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0)), 0
        );
        assertTrue(vault.isReclaimed(0));
        assertEq(vault.allocationNonces(0), 2);
        vm.expectRevert(RoundPrizeVaultRelease010.AlreadyClaimed.selector);
        vault.reclaim(
            0,
            deadline,
            address(globalAdmin),
            _globalSignature(reclaimDigest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, reclaimDigest)
        );
    }

    function testDelayedSafetyRotationExecutesOnceWithUnrevokedQuorum() external {
        _complete();
        address nextRecipient = makeAddr("rotation-recipient");
        RoundPrizeVaultRelease010.SafetyAction memory action = RoundPrizeVaultRelease010.SafetyAction({
            kind: RoundPrizeVaultRelease010.SafetyActionKind.ROTATE_RECOVERY_RECIPIENT,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 0,
            recipient: nextRecipient,
            expectedRecoveryRecipient: vault.recoveryRecipient(),
            nonce: 0,
            deadline: uint48(block.timestamp + 20 minutes)
        });
        bytes32 digest = vault.hashSafetyAction(action);
        bytes32 actionId = vault.queueSafetyAction(
            action,
            address(globalAdmin),
            _globalSignature(digest),
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, digest)
        );
        vm.expectRevert(RoundPrizeVaultRelease010.SafetyActionNotReady.selector);
        vault.executeSafetyAction(actionId);
        vm.warp(block.timestamp + 5 minutes);
        vault.executeSafetyAction(actionId);
        assertEq(vault.recoveryRecipient(), nextRecipient);
        vm.expectRevert(RoundPrizeVaultRelease010.SafetyActionAlreadyExecuted.selector);
        vault.executeSafetyAction(actionId);
    }

    function testWrongERC1271SignatureCannotAct() external {
        _complete();
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes32 digest =
            vault.hashAllocationAction(RoundPrizeVaultRelease010.AllocationAction.HOLD, 0, 0, deadline);
        bytes memory badGlobal =
            bytes.concat(_sign(OWNER_ONE_KEY, digest), _sign(OWNER_ONE_KEY, digest));
        vm.expectRevert(RoundPrizeVaultRelease010.InvalidSignature.selector);
        vault.hold(
            0,
            deadline,
            address(globalAdmin),
            badGlobal,
            vm.addr(ROUND_ADMIN_ONE_KEY),
            _sign(ROUND_ADMIN_ONE_KEY, digest)
        );
    }

    function testCannotDistributeBeforeEntireCursorCompleted() external {
        assertEq(round.finalizationCursor(), 1);
        assertFalse(round.finalized());
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(RoundPrizeVaultRelease010.InvalidState.selector);
        vault.release(0);
        round.finalizeBatch(1);
        assertTrue(round.finalized());
        assertEq(round.finalizationCursor(), 2);
    }

    function testCompletedWinnerClaimConsumesOnlyItsRecordedLiability() external {
        _complete();
        bytes32 key = vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0);
        assertEq(vault.liabilityByAsset(key), 1 ether);
        vm.warp(vault.distributionAvailableAt());
        address winner = makeAddr("submitter");
        uint256 beforeBalance = winner.balance;
        vault.release(0);
        assertEq(winner.balance, beforeBalance + 1 ether);
        assertEq(vault.liabilityByAsset(key), 0);
        vm.expectRevert(RoundPrizeVaultRelease010.AlreadyClaimed.selector);
        vault.release(0);
    }

    function _complete() private {
        round.finalizeBatch(1);
    }

    function _globalSignature(bytes32 digest) private pure returns (bytes memory) {
        return bytes.concat(_sign(OWNER_ONE_KEY, digest), _sign(OWNER_TWO_KEY, digest));
    }

    function _sign(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
