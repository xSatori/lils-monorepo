// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { RoundV5 } from "../src/v5/RoundV5.sol";
import { RoundPrizeVaultV5 } from "../src/v5/RoundPrizeVaultV5.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract V5MediaHandler is Test {
    RoundV5 public immutable round;
    uint256 private immutable adminOneKey;
    uint256 private immutable adminTwoKey;
    address private immutable adminOne;
    address private immutable adminTwo;
    uint40 private immutable votingStart;

    constructor(RoundV5 round_, uint256 adminOneKey_, uint256 adminTwoKey_, uint40 votingStart_) {
        round = round_;
        adminOneKey = adminOneKey_;
        adminTwoKey = adminTwoKey_;
        adminOne = vm.addr(adminOneKey_);
        adminTwo = vm.addr(adminTwoKey_);
        votingStart = votingStart_;
    }

    function append(uint256 entropy) external {
        if (block.timestamp >= votingStart || round.submissionImageCount(0) >= 7) return;
        uint256 nonce = round.imageRevisionNonce(0);
        string memory uri =
            string.concat("ipfs://invariant-", vm.toString(entropy), "-", vm.toString(nonce));
        uint256 deadline = block.timestamp + 1 days;
        bytes32 imageHash = keccak256(bytes(uri));
        bytes32 digest = round.hashSubmissionImage(0, uri, imageHash, nonce, deadline);
        round.appendSubmissionImage(
            0,
            uri,
            imageHash,
            nonce,
            deadline,
            RoundV5.ImageApproval(adminOne, _signature(adminOneKey, digest)),
            RoundV5.ImageApproval(adminTwo, _signature(adminTwoKey, digest))
        );
    }

    function attemptReplay() external {
        if (round.imageRevisionNonce(0) == 0 || block.timestamp >= votingStart) return;
        uint256 staleNonce = round.imageRevisionNonce(0) - 1;
        uint256 deadline = block.timestamp + 1 days;
        string memory uri = "ipfs://replay-attempt";
        bytes32 digest =
            round.hashSubmissionImage(0, uri, keccak256(bytes(uri)), staleNonce, deadline);
        try round.appendSubmissionImage(
            0,
            uri,
            keccak256(bytes(uri)),
            staleNonce,
            deadline,
            RoundV5.ImageApproval(adminOne, _signature(adminOneKey, digest)),
            RoundV5.ImageApproval(adminTwo, _signature(adminTwoKey, digest))
        ) {
            revert("replay accepted");
        } catch { }
    }

    function crossVotingBoundary() external {
        if (block.timestamp < votingStart) vm.warp(votingStart);
        uint256 nonce = round.imageRevisionNonce(0);
        uint256 deadline = block.timestamp + 1 days;
        string memory uri = "ipfs://late-attempt";
        bytes32 digest = round.hashSubmissionImage(0, uri, keccak256(bytes(uri)), nonce, deadline);
        try round.appendSubmissionImage(
            0,
            uri,
            keccak256(bytes(uri)),
            nonce,
            deadline,
            RoundV5.ImageApproval(adminOne, _signature(adminOneKey, digest)),
            RoundV5.ImageApproval(adminTwo, _signature(adminTwoKey, digest))
        ) {
            revert("late append accepted");
        } catch { }
    }

    function _signature(uint256 key, bytes32 digest) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}

contract RoundsV5MediaInvariantTest is StdInvariant, Test {
    uint256 private constant FEE = 0.0001 ether;
    uint256 private constant ADMIN_ONE_KEY = 0xA11CE;
    uint256 private constant ADMIN_TWO_KEY = 0xB0B;

    RoundV5 private round;
    V5MediaHandler private handler;
    bytes32 private metadataHash;
    address private submitter;

    function setUp() external {
        vm.chainId(31_337);
        address adminOne = vm.addr(ADMIN_ONE_KEY);
        address adminTwo = vm.addr(ADMIN_TWO_KEY);
        address creator = makeAddr("v5-invariant-creator");
        submitter = makeAddr("v5-invariant-submitter");
        MockLilNounsVotes token = new MockLilNounsVotes(address(this));
        LilNounsVotingPower adapter = new LilNounsVotingPower(address(token));
        RoundFactoryV3 factory = new RoundFactoryV3(
            adminOne,
            adminTwo,
            makeAddr("v5-invariant-treasury"),
            FEE,
            address(new RoundV5()),
            address(new RoundPrizeVaultV5()),
            address(adapter),
            true
        );
        uint40 open = uint40(block.timestamp + 1);
        uint40 voteStart = open + 10 minutes;
        RoundTypes.RoundConfig memory config = RoundTypes.RoundConfig({
            metadataURI: "ipfs://v5-invariant-round",
            metadataHash: keccak256("v5-invariant-round"),
            roundStart: uint40(block.timestamp),
            submissionsOpen: open,
            submissionsClose: open + 5 minutes,
            votingStart: voteStart,
            votingEnd: voteStart + 5 minutes,
            votingPowerAdapter: address(adapter),
            votingStrategy: RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE,
            snapshotMode: RoundTypes.SnapshotMode.VOTING_START,
            customSnapshotBlock: 0,
            baseOrFixedVotes: 0,
            maxVotesPerSubmission: 6,
            maxSubmissionsPerWallet: 2,
            maxSubmissions: 8,
            winnerCount: 1,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 10,
            maxDescriptionLength: 2_000
        });
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: makeAddr("v5-invariant-recovery"),
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: new PrizeTypes.AllocationInput[](0)
        });
        vm.deal(creator, FEE);
        vm.prank(creator);
        (address roundAddress,) = factory.createRound{ value: FEE }(
            config, vaultConfig, keccak256("v5-media-invariant")
        );
        round = RoundV5(payable(roundAddress));
        vm.warp(open);
        metadataHash = keccak256("v5-invariant-metadata");
        vm.prank(submitter);
        round.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Invariant entry",
                description: "Invariant description",
                metadataURI: "ipfs://v5-invariant-metadata",
                metadataHash: metadataHash,
                originalImageCount: 1
            })
        );
        handler = new V5MediaHandler(round, ADMIN_ONE_KEY, ADMIN_TWO_KEY, voteStart);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = handler.append.selector;
        selectors[1] = handler.attemptReplay.selector;
        selectors[2] = handler.crossVotingBoundary.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariant_NonceMatchesOrderedAppendCountAndTotalIsBounded() external {
        uint256 count = round.submissionImageCount(0);
        assertEq(round.imageRevisionNonce(0), count);
        assertLe(count + round.getSubmission(0).originalImageCount, 8);
    }

    function invariant_OriginalSubmissionAuthorityIsImmutable() external {
        RoundV5.Submission memory submission = round.getSubmission(0);
        assertEq(submission.owner, submitter);
        assertEq(submission.metadataURI, "ipfs://v5-invariant-metadata");
        assertEq(submission.metadataHash, metadataHash);
        assertEq(uint8(submission.status), uint8(RoundTypes.SubmissionStatus.APPROVED));
        assertEq(round.submissionVoteTotals(0), 0);
    }
}
