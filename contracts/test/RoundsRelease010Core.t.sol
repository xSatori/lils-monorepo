// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { RoundRelease010 } from "../src/0.1.0/RoundRelease010.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { RoundValidationRelease010 } from "../src/0.1.0/RoundValidationRelease010.sol";

contract ReadyVaultRelease010Mock {
    function isReadyForSubmissions() external pure returns (bool) {
        return true;
    }
}

contract RoundsRelease010CoreTest is Test {
    MockLilNounsVotes private token;
    LilNounsVotingPower private adapter;
    RoundRelease010 private implementation;
    RoundRelease010 private round;
    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");

    function testCreationSnapshotIsImmutableAndUsesPriorBlock() external {
        token.mint(alice, 3);
        vm.prank(alice);
        token.delegate(alice);
        vm.roll(block.number + 1);
        _createRound(3, 2);

        uint64 snapshot = round.snapshotBlock();
        assertEq(snapshot, block.number - 1);
        assertTrue(round.snapshotCaptured());
        assertEq(round.votingLimit(alice), 3);
        token.mint(bob, 4);
        vm.prank(bob);
        token.delegate(bob);
        vm.prank(alice);
        token.delegate(bob);
        vm.roll(block.number + 1);
        assertEq(round.votingLimit(bob), 0);
        assertEq(round.votingLimit(alice), 3);
        assertEq(round.snapshotBlock(), snapshot);
    }

    function testPreCreationWalletSplittingRemainsAnAcceptedLimit() external {
        token.mint(alice, 1);
        token.mint(bob, 1);
        vm.prank(alice);
        token.delegate(alice);
        vm.prank(bob);
        token.delegate(bob);
        vm.roll(block.number + 1);
        _createRound(3, 2);
        assertEq(round.votingLimit(alice), 1);
        assertEq(round.votingLimit(bob), 1);
        _scheduleAndOpen();
        _submit(makeAddr("third-party"), "aaa");
        vm.warp(round.votingStart());
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = 0;
        amounts[0] = 1;
        vm.prank(alice);
        round.castVotes(ids, amounts);
        vm.prank(bob);
        round.castVotes(ids, amounts);
        assertEq(round.submissionVoteTotals(0), 2);
    }

    function testRoundImplementationRemainsUnderEthereumRuntimeSizeLimit() external {
        assertLt(address(implementation).code.length, 24_576);
    }

    function testFinalizeBatchesRejectZeroAndOversizedWork() external {
        _createRound(3, 2);
        _scheduleAndOpen();
        _submit(alice, "aaa");
        _submit(bob, "bbb");
        vm.warp(round.votingEnd());

        vm.expectRevert(RoundRelease010.InvalidFinalizationBatch.selector);
        round.finalizeBatch(0);
        uint256 oversized = round.MAX_FINALIZATION_BATCH() + 1;
        vm.expectRevert(RoundRelease010.InvalidFinalizationBatch.selector);
        round.finalizeBatch(oversized);
        (uint256 cursor, bool complete) = round.finalizeBatch(1);
        assertEq(cursor, 1);
        assertFalse(complete);
        assertFalse(round.finalized());
        assertEq(round.getWinners().length, 0);
        (cursor, complete) = round.finalizeBatch(1);
        assertEq(cursor, 2);
        assertTrue(complete);
        assertTrue(round.finalized());
        assertEq(round.getWinners().length, 2);
        assertEq(round.getWinners()[0], 0);
        assertEq(round.getWinners()[1], 1);
        vm.expectRevert(RoundRelease010.NotFinalizable.selector);
        round.finalizeBatch(1);
    }

    function testEmptyRoundFinalizesWithoutAnEntryScan() external {
        _createRound(3, 2);
        _scheduleAndOpen();
        vm.warp(round.votingEnd());
        (uint256 cursor, bool complete) = round.finalizeBatch(1);
        assertEq(cursor, 0);
        assertTrue(complete);
        assertTrue(round.finalized());
        assertEq(round.getWinners().length, 0);
    }

    function testAllRejectedCompletesWithNoWinners() external {
        _createRound(3, 2);
        _scheduleAndOpen();
        _submit(alice, "aaa");
        _submit(bob, "bbb");
        round.moderateSubmission(0, RoundTypes.SubmissionStatus.REJECTED);
        round.moderateSubmission(1, RoundTypes.SubmissionStatus.REJECTED);
        vm.warp(round.votingEnd());
        round.finalizeBatch(1);
        assertFalse(round.finalized());
        assertEq(round.winnerAddress(0), address(0));
        round.finalizeBatch(1);
        assertTrue(round.finalized());
        assertEq(round.getWinners().length, 0);
    }

    function testRejectedEntriesAreSkippedAndTiesAcrossBatchesFavorEarlierId() external {
        _createRound(5, 2);
        _scheduleAndOpen();
        for (uint256 i; i < 5; ++i) {
            _submit(address(uint160(1_000 + i)), "aaa");
        }
        round.moderateSubmission(1, RoundTypes.SubmissionStatus.REJECTED);
        round.moderateSubmission(3, RoundTypes.SubmissionStatus.HIDDEN);
        vm.warp(round.votingEnd());
        vm.prank(alice);
        (uint256 cursor, bool complete) = round.finalizeBatch(2);
        assertEq(cursor, 2);
        assertFalse(complete);
        assertEq(round.getWinners().length, 0);
        vm.prank(bob);
        round.finalizeBatch(1);
        vm.prank(alice);
        (cursor, complete) = round.finalizeBatch(2);
        assertEq(cursor, 5);
        assertTrue(complete);
        uint256[] memory winners = round.getWinners();
        assertEq(winners.length, 2);
        assertEq(winners[0], 0);
        assertEq(winners[1], 2);
    }

    function testCustomSnapshotAndNonzeroOverrideAreRejected() external {
        RoundTypes.RoundConfig memory config = _config(3, 2);
        config.snapshotMode = RoundTypes.SnapshotMode.CUSTOM_BLOCK;
        config.customSnapshotBlock = 99;
        RoundRelease010 candidate = RoundRelease010(payable(Clones.clone(address(implementation))));
        address vault = address(new ReadyVaultRelease010Mock());
        vm.expectRevert(RoundValidationRelease010.InvalidSnapshot.selector);
        candidate.initialize(
            address(this), address(this), vault, 8, bytes32(uint256(1)), bytes32(uint256(2)), config
        );

        config.snapshotMode = RoundTypes.SnapshotMode.VOTING_START;
        vm.expectRevert(RoundValidationRelease010.InvalidSnapshot.selector);
        candidate.initialize(
            address(this), address(this), vault, 8, bytes32(uint256(1)), bytes32(uint256(2)), config
        );
    }

    function testHistoricalVotesAdditiveLimitsDuplicateIdsAndOwnerOnlySelfVote() external {
        token.mint(alice, 3);
        token.mint(bob, 2);
        vm.prank(alice);
        token.delegate(alice);
        vm.prank(bob);
        token.delegate(bob);
        vm.roll(block.number + 1);
        _createRound(4, 2);
        _scheduleAndOpen();
        _submit(alice, "aaa");
        _submit(bob, "bbb");
        _submit(makeAddr("third owner"), "ccc");
        vm.warp(round.votingStart());

        vm.startPrank(alice);
        vm.expectRevert(RoundRelease010.SelfVote.selector);
        round.castVotes(_ids(0), _amounts(1));
        round.castVotes(_ids(1), _amounts(1));
        round.castVotes(_ids(1), _amounts(1));
        assertEq(round.usedVotes(alice), 2);
        uint256[] memory duplicateIds = new uint256[](2);
        duplicateIds[0] = 1;
        duplicateIds[1] = 1;
        uint256[] memory duplicateAmounts = new uint256[](2);
        duplicateAmounts[0] = 1;
        duplicateAmounts[1] = 1;
        vm.expectRevert(RoundRelease010.DuplicateSubmission.selector);
        round.castVotes(duplicateIds, duplicateAmounts);
        vm.expectRevert(RoundRelease010.VoteLimitExceeded.selector);
        round.castVotes(_ids(1), _amounts(2));
        vm.stopPrank();

        // A different wallet is not treated as the submission owner's wallet.
        vm.prank(bob);
        round.castVotes(_ids(0), _amounts(2));
        assertEq(round.usedVotes(bob), 2);
        assertEq(round.submissionVoteTotals(0), 2);
        assertEq(round.submissionVoteTotals(1), 2);
        assertEq(round.votingLimit(alice), 3);
        assertEq(round.votingLimit(bob), 2);

        address newlyDelegated = makeAddr("newly delegated");
        token.mint(newlyDelegated, 10);
        vm.prank(newlyDelegated);
        token.delegate(newlyDelegated);
        vm.roll(block.number + 1);
        assertEq(round.votingLimit(newlyDelegated), 0);
        vm.prank(newlyDelegated);
        vm.expectRevert(RoundRelease010.NoVotingPower.selector);
        round.castVotes(_ids(2), _amounts(1));
    }

    function testPerWalletPerSubmissionCapAccumulatesAcrossCalls() external {
        token.mint(alice, 3);
        vm.prank(alice);
        token.delegate(alice);
        vm.roll(block.number + 1);
        RoundTypes.RoundConfig memory config = _config(2, 1);
        config.maxVotesPerSubmission = 2;
        _createRoundWithConfig(config);
        _scheduleAndOpen();
        _submit(bob, "bbb");
        vm.warp(round.votingStart());
        vm.startPrank(alice);
        round.castVotes(_ids(0), _amounts(2));
        vm.expectRevert(RoundRelease010.PerSubmissionCapExceeded.selector);
        round.castVotes(_ids(0), _amounts(1));
        vm.stopPrank();
        assertEq(round.usedVotes(alice), 2);
        assertEq(round.voterSubmissionVotes(alice, 0), 2);
    }

    function testVotingWindowEndsExclusively() external {
        token.mint(alice, 1);
        vm.prank(alice);
        token.delegate(alice);
        vm.roll(block.number + 1);
        _createRound(2, 1);
        _scheduleAndOpen();
        _submit(bob, "bbb");
        vm.prank(alice);
        vm.expectRevert(RoundRelease010.InvalidPhase.selector);
        round.castVotes(_ids(0), _amounts(1));
        vm.warp(round.votingStart());
        vm.prank(alice);
        round.castVotes(_ids(0), _amounts(1));
        vm.warp(round.votingEnd());
        vm.prank(alice);
        vm.expectRevert(RoundRelease010.InvalidPhase.selector);
        round.castVotes(_ids(0), _amounts(1));
    }

    function testOneThousandIncreasingScoresUsesFourBoundedBatchesUnderGasBudget() external {
        address voter = makeAddr("bulk voter");
        token.mint(voter, 500_500);
        vm.prank(voter);
        token.delegate(voter);
        vm.roll(block.number + 1);
        _createRound(1_000, 20);
        _scheduleAndOpen();
        _submitMany(1_000);
        vm.warp(round.votingStart());
        for (uint256 batch; batch < 20; ++batch) {
            uint256[] memory ids = new uint256[](50);
            uint256[] memory amounts = new uint256[](50);
            for (uint256 j; j < 50; ++j) {
                uint256 id = batch * 50 + j;
                ids[j] = id;
                amounts[j] = id + 1;
            }
            vm.prank(voter);
            round.castVotes(ids, amounts);
        }
        vm.warp(round.votingEnd());
        for (uint256 i; i < 3; ++i) {
            vm.prank(address(uint160(10 + i)));
            (uint256 cursor, bool complete) = round.finalizeBatch(250);
            assertEq(cursor, (i + 1) * 250);
            assertFalse(complete);
            assertFalse(round.finalized());
            assertEq(round.getWinners().length, 0);
        }

        vm.record();
        uint256 beforeGas = gasleft();
        (uint256 lastCursor, bool finished) = round.finalizeBatch(250);
        uint256 measured = beforeGas - gasleft();
        (bytes32[] memory readSlots, bytes32[] memory writeSlots) = vm.accesses(address(round));
        uint256 uniqueSlots = _countUniqueSlots(readSlots, writeSlots);
        uint256 uniqueWriteSlots = _countUniqueSlots(writeSlots, new bytes32[](0));
        // Prior setup in this test may warm slots. The recorded storage-access
        // set covers candidates, vote totals, leaderboard, cursor and winners;
        // charge every unique slot the full cold SLOAD cost and each written
        // slot the full new-slot SSTORE cost on top of measured. This also
        // accounts for dirty-slot discounts from earlier calls in this test.
        uint256 coldUpperBound =
            measured + uniqueSlots * 2_100 + uniqueWriteSlots * 20_000 + 100_000;
        emit log_named_uint("0.1.0 final 250 measured gas", measured);
        emit log_named_uint("0.1.0 final 250 unique storage slots", uniqueSlots);
        emit log_named_uint("0.1.0 final 250 unique write slots", uniqueWriteSlots);
        emit log_named_uint("0.1.0 final 250 conservative cold upper bound", coldUpperBound);
        assertLt(coldUpperBound, 8_000_000);
        assertEq(lastCursor, 1_000);
        assertTrue(finished);
        assertTrue(round.finalized());
        uint256[] memory winners = round.getWinners();
        assertEq(winners.length, 20);
        for (uint256 i; i < 20; ++i) {
            assertEq(winners[i], 999 - i);
        }
    }

    function testOneThousandZeroScoresSkipsRejectedAndSelectsEarliestTwenty() external {
        _createRound(1_000, 20);
        _scheduleAndOpen();
        _submitMany(1_000);
        for (uint256 i; i < 10; ++i) {
            round.moderateSubmission(i, RoundTypes.SubmissionStatus.REJECTED);
        }
        vm.warp(round.votingEnd());
        uint256[] memory sizes = new uint256[](5);
        sizes[0] = 17;
        sizes[1] = 250;
        sizes[2] = 201;
        sizes[3] = 250;
        sizes[4] = 250;
        for (uint256 i; i < sizes.length; ++i) {
            round.finalizeBatch(sizes[i]);
        }
        assertFalse(round.finalized());
        assertEq(round.finalizationCursor(), 968);
        round.finalizeBatch(32);
        uint256[] memory winners = round.getWinners();
        assertEq(winners.length, 20);
        for (uint256 i; i < 20; ++i) {
            assertEq(winners[i], i + 10);
        }
    }

    function testOneThousandDecreasingScoresRetainsEarliestTwenty() external {
        address voter = makeAddr("decreasing voter");
        token.mint(voter, 500_500);
        vm.prank(voter);
        token.delegate(voter);
        vm.roll(block.number + 1);
        _createRound(1_000, 20);
        _scheduleAndOpen();
        _submitMany(1_000);
        vm.warp(round.votingStart());
        for (uint256 batch; batch < 20; ++batch) {
            uint256[] memory ids = new uint256[](50);
            uint256[] memory amounts = new uint256[](50);
            for (uint256 j; j < 50; ++j) {
                uint256 id = batch * 50 + j;
                ids[j] = id;
                amounts[j] = 1_000 - id;
            }
            vm.prank(voter);
            round.castVotes(ids, amounts);
        }
        vm.warp(round.votingEnd());
        for (uint256 i; i < 4; ++i) {
            round.finalizeBatch(250);
        }
        uint256[] memory winners = round.getWinners();
        assertEq(winners.length, 20);
        for (uint256 i; i < 20; ++i) {
            assertEq(winners[i], i);
        }
    }

    function setUp() external {
        vm.roll(100);
        token = new MockLilNounsVotes(address(this));
        adapter = new LilNounsVotingPower(address(token));
        implementation = new RoundRelease010();
    }

    function testMode() external pure returns (bool) {
        return false;
    }

    function isGlobalAdmin(address) external pure returns (bool) {
        return false;
    }

    function _createRound(uint16 maxSubmissions, uint8 winnerCount) private {
        _createRoundWithConfig(_config(maxSubmissions, winnerCount));
    }

    function _createRoundWithConfig(RoundTypes.RoundConfig memory config) private {
        round = RoundRelease010(payable(Clones.clone(address(implementation))));
        round.initialize(
            address(this),
            address(this),
            address(new ReadyVaultRelease010Mock()),
            8,
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            config
        );
    }

    function _config(uint16 maxSubmissions, uint8 winnerCount)
        private
        view
        returns (RoundTypes.RoundConfig memory)
    {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-0.1.0",
            metadataHash: keccak256("round-0.1.0"),
            roundStart: 0,
            submissionsOpen: 0,
            submissionsClose: 0,
            votingStart: 0,
            votingEnd: 0,
            votingPowerAdapter: address(adapter),
            votingStrategy: RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE,
            snapshotMode: RoundTypes.SnapshotMode.VOTING_START,
            customSnapshotBlock: 0,
            baseOrFixedVotes: 0,
            maxVotesPerSubmission: 1_000,
            maxSubmissionsPerWallet: maxSubmissions < 10 ? maxSubmissions : 10,
            maxSubmissions: maxSubmissions,
            winnerCount: winnerCount,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 3,
            maxDescriptionLength: 2_000
        });
    }

    function _scheduleAndOpen() private {
        uint40 open = uint40(block.timestamp + 1);
        round.setSchedule(open, open + 10, open + 20, open + 30);
        vm.warp(open);
    }

    function _submit(address owner, string memory title) private {
        RoundRelease010.SubmissionInput memory input = RoundRelease010.SubmissionInput({
            submissionType: RoundTypes.SubmissionType.PROJECT,
            title: title,
            description: "description",
            metadataURI: "ipfs://submission",
            metadataHash: keccak256(bytes(title)),
            originalImageCount: 0
        });
        vm.prank(owner);
        round.submit(input);
    }

    function _submitMany(uint256 count) private {
        for (uint256 i; i < count; ++i) {
            _submit(address(uint160(1_000 + i / 10)), "aaa");
        }
    }

    function _ids(uint256 id) private pure returns (uint256[] memory result) {
        result = new uint256[](1);
        result[0] = id;
    }

    function _amounts(uint256 amount) private pure returns (uint256[] memory result) {
        result = new uint256[](1);
        result[0] = amount;
    }

    function _countUniqueSlots(bytes32[] memory reads, bytes32[] memory writes)
        private
        pure
        returns (uint256 count)
    {
        bytes32[] memory seen = new bytes32[](reads.length + writes.length);
        for (uint256 i; i < reads.length + writes.length; ++i) {
            bytes32 slot = i < reads.length ? reads[i] : writes[i - reads.length];
            bool known;
            for (uint256 j; j < count; ++j) {
                if (seen[j] == slot) {
                    known = true;
                    break;
                }
            }
            if (!known) seen[count++] = slot;
        }
    }
}
