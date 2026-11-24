// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RoundFactory } from "../src/RoundFactory.sol";
import { Round } from "../src/Round.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { RoundValidation } from "../src/RoundValidation.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { IRound } from "../src/interfaces/IRound.sol";

contract RejectingTreasury {
    receive() external payable {
        revert("reject");
    }
}

contract MockRoundImplementation {
    uint32 private immutable _version;

    constructor(uint32 version_) {
        _version = version_;
    }

    function implementationVersion() external view returns (uint32) {
        return _version;
    }

    function initializerSelector() external pure returns (bytes4) {
        return IRound.initialize.selector;
    }
}

contract IncompatibleRoundImplementation {
    function implementationVersion() external pure returns (uint32) {
        return 3;
    }
}

contract RoundsTest is Test {
    uint256 internal constant FEE = 0.0001 ether;
    address internal constant ADMIN_1 = address(0xA11CE);
    address internal constant ADMIN_2 = address(0xB0B);
    address internal constant CREATOR = address(0xC0FFEE);
    address internal constant TREASURY = address(0x7EA5);
    address internal constant SUBMITTER_1 = address(0x51);
    address internal constant SUBMITTER_2 = address(0x52);
    address internal constant VOTER = address(0x60);
    address internal constant OTHER_VOTER = address(0x61);

    Round internal implementation;
    MockLilNounsVotes internal token;
    LilNounsVotingPower internal adapter;
    RoundFactory internal factory;

    function setUp() external {
        vm.chainId(31_337);
        implementation = new Round();
        token = new MockLilNounsVotes(address(this));
        adapter = new LilNounsVotingPower(address(token));
        factory = new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), true
        );
        vm.deal(CREATOR, 10 ether);
    }

    function testFactoryHasExactlyTwoIndependentGlobalAdmins() external {
        address[2] memory admins = factory.getGlobalAdmins();
        assertEq(admins[0], ADMIN_1);
        assertEq(admins[1], ADMIN_2);
        assertTrue(factory.isGlobalAdmin(ADMIN_1));
        assertTrue(factory.isGlobalAdmin(ADMIN_2));

        vm.prank(ADMIN_2);
        factory.setCreationFee(FEE * 2);
        assertEq(factory.creationFee(), FEE * 2);
    }

    function testGlobalAdminRotationPreservesExactlyTwoDistinctAdmins() external {
        address replacement = address(0xCAFE);
        vm.prank(ADMIN_1);
        factory.rotateGlobalAdmin(ADMIN_1, replacement);

        address[2] memory admins = factory.getGlobalAdmins();
        assertEq(admins[0], replacement);
        assertEq(admins[1], ADMIN_2);
        assertFalse(factory.isGlobalAdmin(ADMIN_1));
        assertTrue(factory.isGlobalAdmin(replacement));

        vm.prank(ADMIN_2);
        vm.expectRevert(RoundFactory.DuplicateAdmin.selector);
        factory.rotateGlobalAdmin(ADMIN_2, replacement);
    }

    function testGenericAccessControlCannotBypassFactoryAdminInvariant() external {
        bytes32 role = factory.GLOBAL_ADMIN_ROLE();
        vm.prank(ADMIN_1);
        vm.expectRevert();
        factory.grantRole(role, address(0xBAD));

        vm.prank(ADMIN_1);
        vm.expectRevert();
        factory.revokeRole(role, ADMIN_2);

        vm.prank(ADMIN_1);
        vm.expectRevert(RoundFactory.NotGlobalAdmin.selector);
        factory.renounceRole(role, ADMIN_1);
        assertTrue(factory.isGlobalAdmin(ADMIN_1));
        assertTrue(factory.isGlobalAdmin(ADMIN_2));
    }

    function testImplementationVersionsAreAppendOnlyAndMonotonic() external {
        assertEq(factory.activeImplementationVersion(), 2);
        MockRoundImplementation v3 = new MockRoundImplementation(3);
        vm.prank(ADMIN_1);
        factory.registerImplementation(3, address(v3));
        assertEq(factory.activeImplementationVersion(), 3);

        MockRoundImplementation v2 = new MockRoundImplementation(2);
        vm.prank(ADMIN_2);
        vm.expectRevert(RoundFactory.InvalidImplementationVersion.selector);
        factory.registerImplementation(2, address(v2));
        assertEq(factory.activeImplementationVersion(), 3);
    }

    function testImplementationRegistrationRejectsIncompatibleInitializerSchema() external {
        IncompatibleRoundImplementation incompatible = new IncompatibleRoundImplementation();
        vm.prank(ADMIN_1);
        vm.expectRevert(RoundFactory.InvalidImplementationSchema.selector);
        factory.registerImplementation(3, address(incompatible));
        assertEq(factory.activeImplementationVersion(), 2);
    }

    function testTestModeIsAllowlistedToLocalAndSepolia() external {
        vm.chainId(1);
        vm.expectRevert(RoundFactory.InvalidTestChain.selector);
        new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), true
        );

        vm.chainId(10);
        vm.expectRevert(RoundFactory.InvalidTestChain.selector);
        new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), true
        );

        vm.chainId(1_337);
        new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), true
        );
        vm.chainId(11_155_111);
        new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), true
        );
    }

    function testProductionModeDoesNotInheritTestChainRestriction() external {
        vm.chainId(1);
        RoundFactory production = new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), false
        );
        assertFalse(production.testMode());
    }

    function testPaidCreationForwardsExactFeeAndRegistersInitializedClone() external {
        RoundTypes.RoundConfig memory config = _config();
        address predicted = factory.predictRoundAddress(CREATOR, config, bytes32("one"));
        uint256 beforeBalance = TREASURY.balance;

        vm.prank(CREATOR);
        address roundAddress = factory.createRound{ value: FEE }(config, bytes32("one"));

        assertEq(roundAddress, predicted);
        assertEq(TREASURY.balance - beforeBalance, FEE);
        assertEq(address(factory).balance, 0);
        assertTrue(factory.isRound(roundAddress));
        assertEq(factory.roundCount(), 1);
        assertEq(Round(payable(roundAddress)).creator(), CREATOR);
        assertEq(Round(payable(roundAddress)).deployedImplementationVersion(), 2);
        assertTrue(Round(payable(roundAddress)).isRoundAdmin(CREATOR));
        assertEq(Round(payable(roundAddress)).roundAdminCount(), 1);

        vm.expectRevert();
        Round(payable(roundAddress))
            .initialize(address(factory), CREATOR, 1, bytes32("again"), config);
    }

    function testCreationRejectsWrongFeeAndTreasuryFailureAtomically() external {
        RoundTypes.RoundConfig memory config = _config();
        vm.prank(CREATOR);
        vm.expectRevert(RoundFactory.InvalidFee.selector);
        factory.createRound{ value: FEE + 1 }(config, bytes32("overpay"));

        RejectingTreasury rejecting = new RejectingTreasury();
        vm.prank(ADMIN_1);
        factory.setTreasury(address(rejecting));
        uint256 nonceBefore = factory.creatorNonces(CREATOR);
        vm.prank(CREATOR);
        vm.expectRevert(RoundFactory.FeeDeliveryFailed.selector);
        factory.createRound{ value: FEE }(config, bytes32("reject"));
        assertEq(factory.creatorNonces(CREATOR), nonceBefore);
        assertEq(factory.roundCount(), 0);
        assertEq(address(factory).balance, 0);
    }

    function testDirectEthAndPausedCreationAreRejected() external {
        vm.prank(CREATOR);
        (bool success,) = address(factory).call{ value: 1 }("");
        assertFalse(success);

        vm.prank(ADMIN_1);
        factory.setPaused(true);
        vm.prank(CREATOR);
        vm.expectRevert(RoundFactory.FactoryPaused.selector);
        factory.createRound{ value: FEE }(_config(), bytes32("paused"));
    }

    function testTestModeRequiresFiveMinuteSubmissionReviewAndVotingPhases() external {
        RoundTypes.RoundConfig memory config = _config();
        config.votingStart += 1;
        vm.prank(CREATOR);
        vm.expectRevert(RoundFactory.InvalidTestSchedule.selector);
        factory.createRound{ value: FEE }(config, bytes32("bad-duration"));
    }

    function testModerationReviewPeriodStopsSubmissionsButAllowsModeration() external {
        Round round = _createRound(bytes32("review-period"));
        uint256 submissionId = _submit(round, SUBMITTER_1, "ipfs://submission-1");

        vm.warp(round.submissionsClose());
        assertEq(
            uint256(round.lifecycleState()), uint256(RoundTypes.LifecycleState.MODERATION_PENDING)
        );

        vm.prank(SUBMITTER_2);
        vm.expectRevert(Round.InvalidPhase.selector);
        round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Entry two",
            "Description two",
            "ipfs://submission-2",
            keccak256("submission-2")
        );

        vm.prank(CREATOR);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.APPROVED);
        assertEq(
            uint256(round.getSubmission(submissionId).status),
            uint256(RoundTypes.SubmissionStatus.APPROVED)
        );
    }

    function testFactoryRejectsExpiredScheduleAndRogueVotingAdapter() external {
        vm.warp(1 days);
        RoundTypes.RoundConfig memory config = _config();
        config.roundStart = uint40(block.timestamp - 10 minutes);
        config.submissionsOpen = uint40(block.timestamp - 10 minutes);
        config.submissionsClose = uint40(block.timestamp - 7 minutes);
        config.votingStart = uint40(block.timestamp - 5 minutes);
        config.votingEnd = uint40(block.timestamp);
        vm.prank(CREATOR);
        vm.expectRevert(RoundValidation.InvalidSchedule.selector);
        factory.createRound{ value: FEE }(config, bytes32("expired"));

        MockLilNounsVotes rogueToken = new MockLilNounsVotes(address(this));
        LilNounsVotingPower rogueAdapter = new LilNounsVotingPower(address(rogueToken));
        config = _config();
        config.votingPowerAdapter = address(rogueAdapter);
        vm.prank(CREATOR);
        vm.expectRevert(RoundFactory.UnexpectedVotingPowerAdapter.selector);
        factory.createRound{ value: FEE }(config, bytes32("rogue-adapter"));
    }

    function testMutableMetadataUrisAreRejectedAtEveryWriteBoundary() external {
        RoundTypes.RoundConfig memory config = _config();
        config.metadataURI = "https://mutable.example/round.json";
        vm.prank(CREATOR);
        vm.expectRevert(RoundValidation.InvalidMetadata.selector);
        factory.createRound{ value: FEE }(config, bytes32("mutable-round-uri"));

        config = _config();
        config.metadataURI = "ar://round";
        config.submissionsOpen += 1 minutes;
        config.submissionsClose += 1 minutes;
        config.votingStart += 1 minutes;
        config.votingEnd += 1 minutes;
        Round round = _createRound(config, bytes32("future-round"));
        vm.prank(CREATOR);
        round.updateRoundMetadata("ar://updated-round", keccak256("ar-update"));
        vm.prank(CREATOR);
        vm.expectRevert(Round.InvalidMetadata.selector);
        round.updateRoundMetadata(
            "https://mutable.example/updated.json", keccak256("mutable-update")
        );

        vm.warp(round.submissionsOpen());
        vm.prank(SUBMITTER_1);
        vm.expectRevert(Round.InvalidMetadata.selector);
        round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Entry",
            "Description",
            "https://mutable.example/submission.json",
            keccak256("mutable-submission")
        );
        vm.prank(SUBMITTER_1);
        uint256 arSubmission = round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Entry",
            "Description",
            "ar://submission",
            keccak256("ar-submission")
        );
        assertEq(round.getSubmission(arSubmission).metadataURI, "ar://submission");
    }

    function testCreatorControlsAdditionalRoundAdmins() external {
        Round round = _createRound(bytes32("admins"));
        address addedAdmin = address(0xAD);
        vm.prank(CREATOR);
        round.grantRoundAdmin(addedAdmin);
        assertTrue(round.isRoundAdmin(addedAdmin));
        assertEq(round.roundAdminCount(), 2);

        vm.prank(CREATOR);
        round.revokeRoundAdmin(addedAdmin);
        assertFalse(round.isRoundAdmin(addedAdmin));
        assertEq(round.roundAdminCount(), 1);

        vm.prank(CREATOR);
        vm.expectRevert(Round.InvalidAddress.selector);
        round.revokeRoundAdmin(CREATOR);
    }

    function testGenericAccessControlCannotRemoveCreatorOrDesyncAdminCount() external {
        Round round = _createRound(bytes32("role-guard"));
        bytes32 role = round.ROUND_ADMIN_ROLE();

        vm.prank(CREATOR);
        vm.expectRevert();
        round.grantRole(role, address(0xBAD));

        vm.prank(CREATOR);
        vm.expectRevert();
        round.revokeRole(role, CREATOR);

        vm.prank(CREATOR);
        vm.expectRevert(Round.NotCreator.selector);
        round.renounceRole(role, CREATOR);
        assertTrue(round.isRoundAdmin(CREATOR));
        assertEq(round.roundAdminCount(), 1);
    }

    function testSubmissionsStartPendingAndModerationFreezesAtVoting() external {
        Round round = _createRound(bytes32("moderation"));
        uint256 submissionId = _submit(round, SUBMITTER_1, "ipfs://submission-1");
        Round.Submission memory submission = round.getSubmission(submissionId);
        assertEq(uint256(submission.status), uint256(RoundTypes.SubmissionStatus.PENDING));

        vm.prank(CREATOR);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.APPROVED);
        vm.warp(round.votingStart());
        vm.prank(CREATOR);
        vm.expectRevert(Round.InvalidPhase.selector);
        round.moderateSubmission(submissionId, RoundTypes.SubmissionStatus.HIDDEN);
    }

    function testSubmissionLimitsAreEnforced() external {
        RoundTypes.RoundConfig memory config = _config();
        config.maxSubmissionsPerWallet = 1;
        Round round = _createRound(config, bytes32("submission-limit"));
        _submit(round, SUBMITTER_1, "ipfs://one");
        vm.prank(SUBMITTER_1);
        vm.expectRevert(Round.SubmissionLimitReached.selector);
        round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Entry",
            "Description",
            "ipfs://two",
            keccak256("two")
        );
    }

    function testSnapshotIsPermissionlessHistoricalAndImmutable() external {
        Round round = _createApprovedRound();
        _giveVotes(VOTER, 10);
        vm.warp(round.votingStart());
        vm.roll(block.number + 1);
        uint256 expected = block.number - 1;
        vm.prank(address(0xBEEF));
        round.captureSnapshot();
        assertEq(round.snapshotBlock(), expected);
        assertTrue(round.snapshotCaptured());

        vm.expectRevert(Round.SnapshotAlreadyCaptured.selector);
        round.captureSnapshot();
    }

    function testSnapshotCannotBeCapturedAfterVotingEnds() external {
        Round round = _createApprovedRound();
        vm.warp(round.votingEnd());
        vm.roll(block.number + 1);
        vm.expectRevert(Round.InvalidPhase.selector);
        round.captureSnapshot();
    }

    function testAdditiveVotingEnforcesRemainingPowerAndPerEntryCap() external {
        Round round = _createTwoApprovedSubmissions();
        _giveVotes(VOTER, 10);
        _openVotingAndCapture(round);

        _cast(round, VOTER, 0, 2);
        _cast(round, VOTER, 0, 3);
        assertEq(round.usedVotes(VOTER), 5);
        assertEq(round.voterSubmissionVotes(VOTER, 0), 5);
        assertEq(round.submissionVoteTotals(0), 5);

        vm.prank(VOTER);
        vm.expectRevert(Round.PerSubmissionCapExceeded.selector);
        round.castVotes(_one(0), _one(2));

        _cast(round, VOTER, 1, 5);
        vm.prank(VOTER);
        vm.expectRevert(Round.VoteLimitExceeded.selector);
        round.castVotes(_one(1), _one(1));
    }

    function testDuplicateAllocationAndSelfVoteAreRejected() external {
        Round round = _createTwoApprovedSubmissions();
        _giveVotes(VOTER, 10);
        _giveVotes(SUBMITTER_1, 10);
        _openVotingAndCapture(round);

        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = 0;
        ids[1] = 0;
        amounts[0] = 1;
        amounts[1] = 1;
        vm.prank(VOTER);
        vm.expectRevert(Round.DuplicateSubmission.selector);
        round.castVotes(ids, amounts);

        vm.prank(SUBMITTER_1);
        vm.expectRevert(Round.SelfVote.selector);
        round.castVotes(_one(0), _one(1));
    }

    function testOnlyApprovedSubmissionCanReceiveVotes() external {
        Round round = _createRound(bytes32("pending"));
        _submit(round, SUBMITTER_1, "ipfs://pending");
        _giveVotes(VOTER, 1);
        _openVotingAndCapture(round);
        vm.prank(VOTER);
        vm.expectRevert(Round.InvalidSubmission.selector);
        round.castVotes(_one(0), _one(1));
    }

    function testAllVotingStrategiesRequirePositiveHistoricalPower() external {
        RoundTypes.VotingStrategy[4] memory strategies = [
            RoundTypes.VotingStrategy.ONE_PER_ELIGIBLE_WALLET,
            RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE,
            RoundTypes.VotingStrategy.FIXED_PER_ELIGIBLE_WALLET,
            RoundTypes.VotingStrategy.BASE_PLUS_VOTING_POWER
        ];
        uint256[4] memory expected = [uint256(1), uint256(7), uint256(4), uint256(11)];

        _giveVotes(VOTER, 7);
        for (uint256 i; i < strategies.length; ++i) {
            RoundTypes.RoundConfig memory config = _config();
            config.votingStrategy = strategies[i];
            config.baseOrFixedVotes = 4;
            Round round = _createRound(config, bytes32(i + 100));
            vm.warp(round.votingStart());
            vm.roll(block.number + 1);
            round.captureSnapshot();
            assertEq(round.votingLimit(VOTER), expected[i]);
            assertEq(round.votingLimit(address(0xDEAD)), 0);
        }
    }

    function testCustomSnapshotIsCapturedAtInitializationAndNeverChanges() external {
        _giveVotes(VOTER, 3);
        vm.roll(block.number + 1);
        uint64 customBlock = uint64(block.number - 1);
        RoundTypes.RoundConfig memory config = _config();
        config.snapshotMode = RoundTypes.SnapshotMode.CUSTOM_BLOCK;
        config.customSnapshotBlock = customBlock;
        Round round = _createRound(config, bytes32("custom-snapshot"));
        assertTrue(round.snapshotCaptured());
        assertEq(round.snapshotBlock(), customBlock);
        assertEq(round.votingLimit(VOTER), 3);
        vm.expectRevert(Round.SnapshotAlreadyCaptured.selector);
        round.captureSnapshot();
    }

    function testUnauthorizedModerationAndAdminChangesRevert() external {
        Round round = _createRound(bytes32("unauthorized"));
        uint256 id = _submit(round, SUBMITTER_1, "ipfs://entry");

        vm.prank(SUBMITTER_2);
        vm.expectRevert(Round.NotRoundAdmin.selector);
        round.moderateSubmission(id, RoundTypes.SubmissionStatus.APPROVED);

        vm.prank(ADMIN_1);
        vm.expectRevert(Round.NotCreator.selector);
        round.grantRoundAdmin(ADMIN_1);
    }

    function testTotalRoundSubmissionCapIsEnforced() external {
        RoundTypes.RoundConfig memory config = _config();
        config.maxSubmissions = 2;
        config.maxSubmissionsPerWallet = 1;
        Round round = _createRound(config, bytes32("total-cap"));
        _submit(round, SUBMITTER_1, "ipfs://one");
        _submit(round, SUBMITTER_2, "ipfs://two");
        vm.prank(address(0x53));
        vm.expectRevert(Round.SubmissionLimitReached.selector);
        round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "Entry",
            "Description",
            "ipfs://three",
            keccak256("three")
        );
    }

    function testDeterministicFinalizationUsesEarlierSubmissionIdOnTieAndIsIdempotent() external {
        RoundTypes.RoundConfig memory config = _config();
        config.winnerCount = 2;
        Round round = _createRound(config, bytes32("winners"));
        _submitAndApprove(round, SUBMITTER_1, "ipfs://one");
        _submitAndApprove(round, SUBMITTER_2, "ipfs://two");
        _giveVotes(VOTER, 2);
        _giveVotes(OTHER_VOTER, 2);
        _openVotingAndCapture(round);
        _cast(round, VOTER, 1, 1);
        _cast(round, OTHER_VOTER, 0, 1);

        vm.warp(round.votingEnd());
        uint256[] memory winners = round.finalize();
        assertEq(winners.length, 2);
        assertEq(winners[0], 0);
        assertEq(winners[1], 1);
        assertEq(keccak256(abi.encode(round.finalize())), keccak256(abi.encode(winners)));
    }

    function testFactoryPauseCannotCensorExistingRoundVoting() external {
        Round round = _createApprovedRound();
        _giveVotes(VOTER, 1);
        _openVotingAndCapture(round);
        vm.prank(ADMIN_1);
        factory.setPaused(true);
        _cast(round, VOTER, 0, 1);
        assertEq(round.usedVotes(VOTER), 1);
    }

    function testSubmissionTextBoundsAndCommitmentsAreEnforced() external {
        Round round = _createRound(bytes32("text-commitments"));

        vm.prank(SUBMITTER_1);
        vm.expectRevert(Round.InvalidMetadata.selector);
        round.submit(
            RoundTypes.SubmissionType.PROJECT,
            "No",
            "Description",
            "ipfs://short-title",
            keccak256("short-title")
        );

        uint256 id = _submit(round, SUBMITTER_1, "ipfs://valid");
        Round.Submission memory submission = round.getSubmission(id);
        assertEq(submission.titleHash, keccak256("Entry"));
        assertEq(submission.descriptionHash, keccak256("Description"));
        assertEq(submission.titleLength, 5);
        assertEq(submission.descriptionLength, 11);
    }

    function testArchiveIsPostFinalizationPresentationState() external {
        Round round = _createApprovedRound();
        vm.warp(round.votingEnd());
        round.finalize();
        vm.prank(CREATOR);
        round.archive();
        assertTrue(round.archived());
        assertEq(uint256(round.lifecycleState()), uint256(RoundTypes.LifecycleState.ARCHIVED));
        uint256[] memory winners = round.getWinners();
        assertEq(winners.length, 1);
        assertEq(winners[0], 0);
    }

    function testMaximumBoundFinalizationGas() external {
        RoundTypes.RoundConfig memory config = _config();
        config.maxSubmissions = 100;
        config.maxSubmissionsPerWallet = 1;
        config.winnerCount = 20;
        Round round = _createRound(config, bytes32("max-finalization"));
        for (uint256 i; i < 100; ++i) {
            address submitter = address(uint160(10_000 + i));
            uint256 id = _submit(round, submitter, string.concat("ipfs://entry-", vm.toString(i)));
            vm.prank(CREATOR);
            round.moderateSubmission(id, RoundTypes.SubmissionStatus.APPROVED);
        }
        vm.warp(round.votingEnd());
        uint256 gasBefore = gasleft();
        uint256[] memory winners = round.finalize();
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("max-bound finalization gas", gasUsed);
        assertEq(winners.length, 20);
        assertLt(gasUsed, 12_000_000);
    }

    function testFuzzUsedVotesNeverExceedSnapshotPower(uint8 first, uint8 second) external {
        first = uint8(bound(first, 1, 5));
        second = uint8(bound(second, 1, 5));
        RoundTypes.RoundConfig memory config = _config();
        config.maxVotesPerSubmission = 10;
        Round round = _createRound(config, bytes32("fuzz"));
        _submitAndApprove(round, SUBMITTER_1, "ipfs://one");
        _submitAndApprove(round, SUBMITTER_2, "ipfs://two");
        _giveVotes(VOTER, 10);
        _openVotingAndCapture(round);

        _cast(round, VOTER, 0, first);
        if (uint256(first) + second <= 10) {
            _cast(round, VOTER, 1, second);
        } else {
            vm.prank(VOTER);
            vm.expectRevert(Round.VoteLimitExceeded.selector);
            round.castVotes(_one(1), _one(second));
        }
        assertLe(round.usedVotes(VOTER), 10);
    }

    function _config() internal view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round",
            metadataHash: keccak256("round"),
            roundStart: uint40(block.timestamp),
            submissionsOpen: uint40(block.timestamp),
            submissionsClose: uint40(block.timestamp + 5 minutes),
            votingStart: uint40(block.timestamp + 10 minutes),
            votingEnd: uint40(block.timestamp + 15 minutes),
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

    function _createRound(bytes32 salt) internal returns (Round) {
        return _createRound(_config(), salt);
    }

    function _createRound(RoundTypes.RoundConfig memory config, bytes32 salt)
        internal
        returns (Round)
    {
        vm.prank(CREATOR);
        return Round(payable(factory.createRound{ value: FEE }(config, salt)));
    }

    function _createApprovedRound() internal returns (Round round) {
        round = _createRound(bytes32("approved"));
        _submitAndApprove(round, SUBMITTER_1, "ipfs://submission");
    }

    function _createTwoApprovedSubmissions() internal returns (Round round) {
        round = _createRound(bytes32("two-approved"));
        _submitAndApprove(round, SUBMITTER_1, "ipfs://one");
        _submitAndApprove(round, SUBMITTER_2, "ipfs://two");
    }

    function _submit(Round round, address submitter, string memory uri) internal returns (uint256) {
        vm.prank(submitter);
        return round.submit(
            RoundTypes.SubmissionType.PROJECT, "Entry", "Description", uri, keccak256(bytes(uri))
        );
    }

    function _submitAndApprove(Round round, address submitter, string memory uri)
        internal
        returns (uint256 id)
    {
        id = _submit(round, submitter, uri);
        vm.prank(CREATOR);
        round.moderateSubmission(id, RoundTypes.SubmissionStatus.APPROVED);
    }

    function _giveVotes(address account, uint96 amount) internal {
        vm.prank(account);
        token.delegate(account);
        token.mint(account, amount);
    }

    function _openVotingAndCapture(Round round) internal {
        vm.warp(round.votingStart());
        vm.roll(block.number + 1);
        round.captureSnapshot();
    }

    function _cast(Round round, address voter, uint256 id, uint256 amount) internal {
        vm.prank(voter);
        round.castVotes(_one(id), _one(amount));
    }

    function _one(uint256 value) internal pure returns (uint256[] memory values) {
        values = new uint256[](1);
        values[0] = value;
    }
}
