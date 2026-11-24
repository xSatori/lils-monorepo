// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { RoundFactory } from "../src/RoundFactory.sol";
import { Round } from "../src/Round.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract RoundHandler is Test {
    RoundFactory public immutable factory;
    Round public immutable round;
    address public immutable voterOne;
    address public immutable voterTwo;
    address public immutable selfVoter;
    address public immutable invalidVoter;
    address public immutable creator;
    address public immutable factoryAdmin;
    bytes32 public finalizedWinnersHash;
    address public additionalRound;
    bool public snapshotRecaptureRejected;
    bool public selfVoteRejected;
    bool public duplicateVoteRejected;
    bool public overCapVoteRejected;
    bool public invalidSubmissionVoteRejected;
    bool public postBoundaryModerationRejected;
    bool public roleMutationRejected;
    bool public reinitializationRejected;
    bool public retainedCreationFee;

    constructor(
        RoundFactory factory_,
        Round round_,
        address voterOne_,
        address voterTwo_,
        address selfVoter_,
        address invalidVoter_,
        address creator_,
        address factoryAdmin_
    ) {
        factory = factory_;
        round = round_;
        voterOne = voterOne_;
        voterTwo = voterTwo_;
        selfVoter = selfVoter_;
        invalidVoter = invalidVoter_;
        creator = creator_;
        factoryAdmin = factoryAdmin_;
    }

    function cast(uint8 voterSeed, uint8 submissionSeed, uint96 requested) external {
        if (round.finalized() || block.timestamp >= round.votingEnd()) return;
        address voter = voterSeed % 2 == 0 ? voterOne : voterTwo;
        uint256 submissionId = submissionSeed % 2;
        uint256 remaining = round.remainingVotes(voter);
        uint256 entryRemaining =
            round.maxVotesPerSubmission() - round.voterSubmissionVotes(voter, submissionId);
        uint256 maximum = remaining < entryRemaining ? remaining : entryRemaining;
        if (maximum == 0) return;
        uint256 amount = bound(requested, 1, maximum);
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = submissionId;
        amounts[0] = amount;
        vm.prank(voter);
        round.castVotes(ids, amounts);
    }

    function finalize() external {
        if (!_attacksComplete()) return;
        if (block.timestamp < round.votingEnd()) vm.warp(round.votingEnd());
        uint256[] memory winners = round.finalize();
        bytes32 winnerHash = keccak256(abi.encode(winners));
        if (finalizedWinnersHash == bytes32(0)) finalizedWinnersHash = winnerHash;
        else assertEq(winnerHash, finalizedWinnersHash);
    }

    function attackSnapshotRecapture() external {
        _expectRevert(address(this), address(round), abi.encodeCall(round.captureSnapshot, ()));
        snapshotRecaptureRejected = true;
    }

    function attackSelfVote() external {
        if (round.finalized()) return;
        _expectRevert(
            selfVoter, address(round), abi.encodeCall(round.castVotes, (_one(0), _one(1)))
        );
        selfVoteRejected = true;
    }

    function attackDuplicateVote() external {
        if (round.finalized()) return;
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = 0;
        ids[1] = 0;
        amounts[0] = 1;
        amounts[1] = 1;
        _expectRevert(invalidVoter, address(round), abi.encodeCall(round.castVotes, (ids, amounts)));
        duplicateVoteRejected = true;
    }

    function attackOverCapVote() external {
        if (round.finalized()) return;
        _expectRevert(
            invalidVoter,
            address(round),
            abi.encodeCall(round.castVotes, (_one(0), _one(round.maxVotesPerSubmission() + 1)))
        );
        overCapVoteRejected = true;
    }

    function attackInvalidSubmissionVote() external {
        if (round.finalized()) return;
        _expectRevert(
            invalidVoter,
            address(round),
            abi.encodeCall(round.castVotes, (_one(type(uint256).max), _one(1)))
        );
        invalidSubmissionVoteRejected = true;
    }

    function attackPostBoundaryModeration() external {
        _expectRevert(
            creator,
            address(round),
            abi.encodeCall(round.moderateSubmission, (0, RoundTypes.SubmissionStatus.HIDDEN))
        );
        postBoundaryModerationRejected = true;
    }

    function attackGenericRoleMutation() external {
        bytes4 grantRoleSelector = bytes4(keccak256("grantRole(bytes32,address)"));
        _expectRevert(
            creator,
            address(round),
            abi.encodeWithSelector(grantRoleSelector, round.ROUND_ADMIN_ROLE(), invalidVoter)
        );
        _expectRevert(
            factoryAdmin,
            address(factory),
            abi.encodeWithSelector(grantRoleSelector, factory.GLOBAL_ADMIN_ROLE(), invalidVoter)
        );
        roleMutationRejected = true;
    }

    function attackReinitialize() external {
        RoundTypes.RoundConfig memory config = _additionalRoundConfig();
        _expectRevert(
            address(this),
            address(round),
            abi.encodeCall(
                round.initialize,
                (address(factory), address(this), 1, keccak256("reinitialize"), config)
            )
        );
        reinitializationRejected = true;
    }

    function createAdditionalRound() external {
        if (additionalRound != address(0)) return;
        RoundTypes.RoundConfig memory config = _additionalRoundConfig();
        additionalRound = factory.createRound{ value: factory.creationFee() }(
            config, keccak256("stateful-additional-round")
        );
        retainedCreationFee = address(factory).balance != 0;
    }

    function _additionalRoundConfig() private view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://stateful-additional-round",
            metadataHash: keccak256("stateful-additional-round"),
            roundStart: uint40(block.timestamp),
            submissionsOpen: uint40(block.timestamp),
            submissionsClose: uint40(block.timestamp + 5 minutes),
            votingStart: uint40(block.timestamp + 10 minutes),
            votingEnd: uint40(block.timestamp + 15 minutes),
            votingPowerAdapter: factory.votingPowerAdapter(),
            votingStrategy: RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE,
            snapshotMode: RoundTypes.SnapshotMode.VOTING_START,
            customSnapshotBlock: 0,
            baseOrFixedVotes: 0,
            maxVotesPerSubmission: 6,
            maxSubmissionsPerWallet: 1,
            maxSubmissions: 2,
            winnerCount: 1,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 10,
            maxDescriptionLength: 2_000
        });
    }

    function _attacksComplete() private view returns (bool) {
        return snapshotRecaptureRejected && selfVoteRejected && duplicateVoteRejected
            && overCapVoteRejected && invalidSubmissionVoteRejected
            && postBoundaryModerationRejected && roleMutationRejected && reinitializationRejected
            && additionalRound != address(0);
    }

    function _expectRevert(address caller, address target, bytes memory data) private {
        vm.prank(caller);
        (bool success,) = target.call(data);
        assertFalse(success);
    }

    function _one(uint256 value) private pure returns (uint256[] memory values) {
        values = new uint256[](1);
        values[0] = value;
    }
}

contract RoundsInvariantTest is StdInvariant, Test {
    uint256 internal constant FEE = 0.0001 ether;
    address internal constant ADMIN_1 = address(0xA11CE);
    address internal constant ADMIN_2 = address(0xB0B);
    address internal constant CREATOR = address(0xC0FFEE);
    address internal constant TREASURY = address(0x7EA5);
    address internal constant SUBMITTER_1 = address(0x51);
    address internal constant SUBMITTER_2 = address(0x52);
    address internal constant VOTER_1 = address(0x60);
    address internal constant VOTER_2 = address(0x61);
    address internal constant INVALID_VOTER = address(0x62);

    RoundFactory internal factory;
    Round internal round;
    RoundHandler internal handler;
    uint64 internal initialSnapshot;
    RoundTypes.SubmissionStatus internal initialStatus0;
    RoundTypes.SubmissionStatus internal initialStatus1;
    uint256 internal balanceAfterPaidCreation;

    function setUp() external {
        vm.chainId(31_337);
        Round implementation = new Round();
        MockLilNounsVotes token = new MockLilNounsVotes(address(this));
        LilNounsVotingPower adapter = new LilNounsVotingPower(address(token));
        factory = new RoundFactory(
            ADMIN_1, ADMIN_2, TREASURY, FEE, address(implementation), address(adapter), true
        );
        vm.deal(CREATOR, FEE);

        RoundTypes.RoundConfig memory config = RoundTypes.RoundConfig({
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
            maxSubmissionsPerWallet: 1,
            maxSubmissions: 2,
            winnerCount: 2,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 10,
            maxDescriptionLength: 2_000
        });
        vm.prank(CREATOR);
        round = Round(payable(factory.createRound{ value: FEE }(config, bytes32("invariant"))));
        balanceAfterPaidCreation = address(factory).balance;
        _submitAndApprove(SUBMITTER_1, "ipfs://one");
        _submitAndApprove(SUBMITTER_2, "ipfs://two");

        _giveVotes(token, VOTER_1, 10);
        _giveVotes(token, VOTER_2, 10);
        _giveVotes(token, SUBMITTER_1, 10);
        _giveVotes(token, INVALID_VOTER, 10);
        vm.warp(round.votingStart());
        vm.roll(block.number + 1);
        round.captureSnapshot();
        initialSnapshot = round.snapshotBlock();
        initialStatus0 = round.getSubmission(0).status;
        initialStatus1 = round.getSubmission(1).status;

        handler = new RoundHandler(
            factory, round, VOTER_1, VOTER_2, SUBMITTER_1, INVALID_VOTER, CREATOR, ADMIN_1
        );
        vm.deal(address(handler), FEE);
        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = handler.cast.selector;
        selectors[1] = handler.finalize.selector;
        selectors[2] = handler.attackSnapshotRecapture.selector;
        selectors[3] = handler.attackSelfVote.selector;
        selectors[4] = handler.attackDuplicateVote.selector;
        selectors[5] = handler.attackOverCapVote.selector;
        selectors[6] = handler.attackInvalidSubmissionVote.selector;
        selectors[7] = handler.attackPostBoundaryModeration.selector;
        selectors[8] = handler.attackGenericRoleMutation.selector;
        selectors[9] = handler.attackReinitialize.selector;
        selectors[10] = handler.createAdditionalRound.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariant_factoryHasExactlyTwoAdminsAndRetainedNoCreationFee() external {
        address[2] memory admins = factory.getGlobalAdmins();
        assertTrue(admins[0] != address(0) && admins[1] != address(0));
        assertTrue(admins[0] != admins[1]);
        assertTrue(factory.isGlobalAdmin(admins[0]));
        assertTrue(factory.isGlobalAdmin(admins[1]));
        // This records the paid creation path. Forced ETH can make an arbitrary contract balance nonzero.
        assertEq(balanceAfterPaidCreation, 0);
        assertFalse(handler.retainedCreationFee());
    }

    function invariant_registeredRoundHasFactoryProvenanceAndCannotReinitialize() external {
        uint256 count = factory.roundCount();
        assertTrue(count == 1 || count == 2);
        for (uint256 i; i < count; ++i) {
            RoundFactory.RoundRecord memory record = factory.roundAt(i);
            assertTrue(factory.isRound(record.round));
            assertEq(Round(payable(record.round)).factory(), address(factory));
        }
        assertEq(factory.roundAt(0).round, address(round));
        address additionalRound = handler.additionalRound();
        if (additionalRound != address(0)) {
            assertEq(count, 2);
            assertEq(factory.roundAt(1).round, additionalRound);
            assertEq(Round(payable(additionalRound)).creator(), address(handler));
        }
    }

    function invariant_voteUsageCapsAndAggregatesRemainConsistent() external {
        address[2] memory voters = [VOTER_1, VOTER_2];
        for (uint256 i; i < voters.length; ++i) {
            assertLe(round.usedVotes(voters[i]), round.votingLimit(voters[i]));
            uint256 allocation0 = round.voterSubmissionVotes(voters[i], 0);
            uint256 allocation1 = round.voterSubmissionVotes(voters[i], 1);
            assertLe(allocation0, round.maxVotesPerSubmission());
            assertLe(allocation1, round.maxVotesPerSubmission());
            assertEq(round.usedVotes(voters[i]), allocation0 + allocation1);
        }
        assertEq(
            round.submissionVoteTotals(0),
            round.voterSubmissionVotes(VOTER_1, 0) + round.voterSubmissionVotes(VOTER_2, 0)
        );
        assertEq(
            round.submissionVoteTotals(1),
            round.voterSubmissionVotes(VOTER_1, 1) + round.voterSubmissionVotes(VOTER_2, 1)
        );
    }

    function invariant_snapshotAndEligibleSetNeverChange() external {
        assertEq(round.snapshotBlock(), initialSnapshot);
        assertEq(uint256(round.getSubmission(0).status), uint256(initialStatus0));
        assertEq(uint256(round.getSubmission(1).status), uint256(initialStatus1));
        assertTrue(round.isRoundAdmin(CREATOR));
        assertEq(round.roundAdminCount(), 1);
    }

    function invariant_finalizedWinnersAreEligibleAndImmutable() external {
        if (!round.finalized()) return;
        uint256[] memory winners = round.getWinners();
        assertEq(keccak256(abi.encode(winners)), handler.finalizedWinnersHash());
        for (uint256 i; i < winners.length; ++i) {
            assertEq(
                uint256(round.getSubmission(winners[i]).status),
                uint256(RoundTypes.SubmissionStatus.APPROVED)
            );
        }
    }

    function _submitAndApprove(address submitter, string memory uri) private {
        vm.prank(submitter);
        uint256 id = round.submit(
            RoundTypes.SubmissionType.PROJECT, "Entry", "Description", uri, keccak256(bytes(uri))
        );
        vm.prank(CREATOR);
        round.moderateSubmission(id, RoundTypes.SubmissionStatus.APPROVED);
    }

    function _giveVotes(MockLilNounsVotes token, address voter, uint96 amount) private {
        vm.prank(voter);
        token.delegate(voter);
        token.mint(voter, amount);
    }
}
