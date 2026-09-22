// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { RoundV5 } from "../src/v5/RoundV5.sol";
import { RoundPrizeVaultV5 } from "../src/v5/RoundPrizeVaultV5.sol";
import { RoundV4 } from "../src/v4/RoundV4.sol";
import { RoundPrizeVaultV4 } from "../src/v4/RoundPrizeVaultV4.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract V5ERC1271Admin is IERC1271 {
    address private immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 digest, bytes memory signature)
        external
        view
        returns (bytes4)
    {
        return ECDSA.recover(digest, signature) == owner
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }
}

contract V5RejectingERC1271Admin is IERC1271 {
    function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) {
        return bytes4(0xffffffff);
    }
}

contract RoundsV5MediaTest is Test {
    event SubmissionImageAppended(
        uint256 indexed submissionId,
        uint256 revision,
        address indexed signerA,
        address indexed signerB,
        address executor,
        string imageURI,
        bytes32 imageHash
    );
    uint256 private constant FEE = 0.0001 ether;
    uint256 private constant ADMIN_ONE_KEY = 0xA11CE;
    uint256 private constant ADMIN_TWO_KEY = 0xB0B;
    uint256 private constant CREATOR_KEY = 0xC0FFEE;
    uint256 private constant ROUND_ADMIN_KEY = 0xD00D;

    address private adminOne;
    address private adminTwo;
    address private creator;
    address private roundAdmin;
    address private submitter;
    RoundFactoryV3 private factory;
    RoundV5 private round;
    LilNounsVotingPower private adapter;
    RoundTypes.RoundConfig private config;

    function setUp() external {
        vm.chainId(31_337);
        adminOne = vm.addr(ADMIN_ONE_KEY);
        adminTwo = vm.addr(ADMIN_TWO_KEY);
        creator = vm.addr(CREATOR_KEY);
        roundAdmin = vm.addr(ROUND_ADMIN_KEY);
        submitter = makeAddr("submitter");

        MockLilNounsVotes token = new MockLilNounsVotes(address(this));
        adapter = new LilNounsVotingPower(address(token));
        RoundV5 roundImplementation = new RoundV5();
        RoundPrizeVaultV5 vaultImplementation = new RoundPrizeVaultV5();
        factory = new RoundFactoryV3(
            adminOne,
            adminTwo,
            makeAddr("treasury"),
            FEE,
            address(roundImplementation),
            address(vaultImplementation),
            address(adapter),
            true
        );
        config = _config();
        vm.deal(creator, FEE);
        vm.prank(creator);
        (address roundAddress,) =
            factory.createRound{ value: FEE }(config, _emptyVaultConfig(), keccak256("v5-media"));
        round = RoundV5(payable(roundAddress));
        vm.prank(creator);
        round.grantRoundAdmin(roundAdmin);
        vm.warp(config.submissionsOpen);
        vm.prank(submitter);
        round.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Entry",
                description: "A valid description",
                metadataURI: "ipfs://metadata",
                metadataHash: keccak256("metadata"),
                originalImageCount: 1
            })
        );
    }

    function testAllThreeDistinctLiveAdminCombinationsAppendInOrder() external {
        _append(0, "ipfs://global-global", ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        _append(0, "ipfs://global-round", ADMIN_ONE_KEY, CREATOR_KEY);
        _append(0, "ipfs://round-round", CREATOR_KEY, ROUND_ADMIN_KEY);

        assertEq(round.submissionImageCount(0), 3);
        assertEq(round.imageRevisionNonce(0), 3);
        RoundV5.SubmissionImage memory image = round.getSubmissionImage(0, 2);
        assertEq(image.imageURI, "ipfs://round-round");
        assertEq(image.signerA, creator);
        assertEq(image.signerB, roundAdmin);
        assertEq(image.executor, address(this));
    }

    function testAppendEventIndexesSubmissionAndBothSigners() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://event", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        vm.expectEmit(true, true, true, true, address(round));
        emit SubmissionImageAppended(
            0, 1, adminOne, adminTwo, address(this), "ipfs://event", keccak256("ipfs://event")
        );
        round.appendSubmissionImage(
            0,
            "ipfs://event",
            keccak256("ipfs://event"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testImageDigestMatchesDeclaredEip712Schema() external {
        uint256 deadline = block.timestamp + 20 minutes;
        string memory uri = "ipfs://client-compatible";
        bytes32 imageHash = keccak256("client-compatible-bytes");
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("LilNounsRound"),
                keccak256("5"),
                block.chainid,
                address(round)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SubmissionImage(address round,uint256 submissionId,uint256 nonce,string imageURI,bytes32 imageHash,uint256 deadline)"
                ),
                address(round),
                uint256(0),
                uint256(0),
                keccak256(bytes(uri)),
                imageHash,
                deadline
            )
        );
        bytes32 clientDigest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertEq(round.hashSubmissionImage(0, uri, imageHash, 0, deadline), clientDigest);
    }

    function testDuplicateSignerReverts() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory adminOneSignature,) =
            _signatures(0, "ipfs://duplicate", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        vm.expectRevert(RoundV5.InvalidSignerPair.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://duplicate",
            keccak256("ipfs://duplicate"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, adminOneSignature),
            RoundV5.ImageApproval(adminOne, adminOneSignature)
        );
    }

    function testRotatedGlobalAdminSignatureReverts() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory oldSignature, bytes memory validSignature) =
            _signatures(0, "ipfs://rotated", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        address replacement = makeAddr("replacement-global-admin");
        vm.prank(adminOne);
        factory.rotateGlobalAdmin(adminOne, replacement);
        vm.expectRevert(RoundV5.InvalidSignerPair.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://rotated",
            keccak256("ipfs://rotated"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, oldSignature),
            RoundV5.ImageApproval(adminTwo, validSignature)
        );
    }

    function testRevokedRoundAdminSignatureReverts() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory creatorSignature, bytes memory roundAdminSignature) =
            _signatures(0, "ipfs://revoked", CREATOR_KEY, ROUND_ADMIN_KEY, 0, deadline);
        vm.prank(creator);
        round.revokeRoundAdmin(roundAdmin);

        vm.expectRevert(RoundV5.InvalidSignerPair.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://revoked",
            keccak256("ipfs://revoked"),
            0,
            deadline,
            RoundV5.ImageApproval(creator, creatorSignature),
            RoundV5.ImageApproval(roundAdmin, roundAdminSignature)
        );
    }

    function testUnauthorizedSignerReverts() external {
        uint256 deadline = block.timestamp + 1 days;
        uint256 strangerKey = 0xBAD;
        address stranger = vm.addr(strangerKey);
        (bytes memory strangerSignature, bytes memory adminSignature) =
            _signatures(0, "ipfs://unauthorized", strangerKey, ADMIN_TWO_KEY, 0, deadline);
        vm.expectRevert(RoundV5.InvalidSignerPair.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://unauthorized",
            keccak256("ipfs://unauthorized"),
            0,
            deadline,
            RoundV5.ImageApproval(stranger, strangerSignature),
            RoundV5.ImageApproval(adminTwo, adminSignature)
        );
    }

    function testReplayRevertsForConsumedNonce() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory replayA, bytes memory replayB) =
            _signatures(0, "ipfs://replay", ADMIN_TWO_KEY, CREATOR_KEY, 0, deadline);
        round.appendSubmissionImage(
            0,
            "ipfs://replay",
            keccak256("ipfs://replay"),
            0,
            deadline,
            RoundV5.ImageApproval(adminTwo, replayA),
            RoundV5.ImageApproval(creator, replayB)
        );
        vm.expectRevert(RoundV5.InvalidImageNonce.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://replay",
            keccak256("ipfs://replay"),
            0,
            deadline,
            RoundV5.ImageApproval(creator, replayB),
            RoundV5.ImageApproval(adminTwo, replayA)
        );
    }

    function testExpiredApprovalReverts() external {
        uint256 expired = block.timestamp;
        vm.warp(expired + 1);
        (bytes memory expiredA, bytes memory expiredB) =
            _signatures(0, "ipfs://expired", ADMIN_TWO_KEY, CREATOR_KEY, 0, expired);
        vm.expectRevert(RoundV5.InvalidImageDeadline.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://expired",
            keccak256("ipfs://expired"),
            0,
            expired,
            RoundV5.ImageApproval(adminTwo, expiredA),
            RoundV5.ImageApproval(creator, expiredB)
        );
    }

    function testApprovalIsBoundToExactImageAndRoundDomain() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://expected", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        vm.expectRevert(RoundV5.InvalidImageSignature.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://different",
            keccak256("ipfs://different"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testApprovalCannotReplayAcrossRoundDomain() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://domain", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);

        RoundTypes.RoundConfig memory otherConfig = _config();
        vm.deal(creator, FEE);
        vm.prank(creator);
        (address otherAddress,) = factory.createRound{ value: FEE }(
            otherConfig, _emptyVaultConfig(), keccak256("other-v5-round")
        );
        RoundV5 otherRound = RoundV5(payable(otherAddress));
        vm.warp(otherConfig.submissionsOpen);
        vm.prank(submitter);
        otherRound.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Other entry",
                description: "Another valid description",
                metadataURI: "ipfs://other-metadata",
                metadataHash: keccak256("other-metadata"),
                originalImageCount: 0
            })
        );
        vm.expectRevert(RoundV5.InvalidImageSignature.selector);
        otherRound.appendSubmissionImage(
            0,
            "ipfs://domain",
            keccak256("ipfs://domain"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testApprovalCannotReplayAcrossChainDomain() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://chain-domain", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        vm.chainId(11_155_111);
        vm.expectRevert(RoundV5.InvalidImageSignature.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://chain-domain",
            keccak256("ipfs://chain-domain"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testInvalidImageCommitmentsAndNonceRevert() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://valid", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);

        vm.expectRevert(RoundV5.InvalidMetadata.selector);
        round.appendSubmissionImage(
            0,
            "https://mutable.example/image.png",
            keccak256("mutable"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
        vm.expectRevert(RoundV5.InvalidMetadata.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://valid",
            bytes32(0),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
        vm.expectRevert(RoundV5.InvalidImageNonce.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://valid",
            keccak256("ipfs://valid"),
            1,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
        vm.expectRevert(RoundV5.InvalidSubmission.selector);
        round.appendSubmissionImage(
            99,
            "ipfs://valid",
            keccak256("ipfs://valid"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testFuzzOriginalImageCountIsBounded(uint8 originalImageCount) external {
        vm.prank(submitter);
        if (originalImageCount > 8) vm.expectRevert(RoundV5.ImageLimitReached.selector);
        round.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Fuzz entry",
                description: "Another valid description",
                metadataURI: "ipfs://fuzz-metadata",
                metadataHash: keccak256("fuzz-metadata"),
                originalImageCount: originalImageCount
            })
        );
        if (originalImageCount <= 8) {
            assertEq(round.getSubmission(1).originalImageCount, originalImageCount);
        }
    }

    function testERC1271RoundAdminCanApproveWithLiveGlobalAdmin() external {
        uint256 contractOwnerKey = 0x1271;
        V5ERC1271Admin contractAdmin = new V5ERC1271Admin(vm.addr(contractOwnerKey));
        vm.prank(creator);
        round.grantRoundAdmin(address(contractAdmin));

        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = round.hashSubmissionImage(
            0, "ipfs://contract-admin", keccak256("ipfs://contract-admin"), 0, deadline
        );
        round.appendSubmissionImage(
            0,
            "ipfs://contract-admin",
            keccak256("ipfs://contract-admin"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, _signature(ADMIN_ONE_KEY, digest)),
            RoundV5.ImageApproval(address(contractAdmin), _signature(contractOwnerKey, digest))
        );
        assertEq(round.getSubmissionImage(0, 0).signerB, address(contractAdmin));
    }

    function testRejectingERC1271AdminCannotApprove() external {
        V5RejectingERC1271Admin rejecting = new V5RejectingERC1271Admin();
        vm.prank(creator);
        round.grantRoundAdmin(address(rejecting));
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = round.hashSubmissionImage(
            0, "ipfs://rejecting-1271", keccak256("ipfs://rejecting-1271"), 0, deadline
        );
        vm.expectRevert(RoundV5.InvalidImageSignature.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://rejecting-1271",
            keccak256("ipfs://rejecting-1271"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, _signature(ADMIN_ONE_KEY, digest)),
            RoundV5.ImageApproval(address(rejecting), hex"1234")
        );
    }

    function testApprovalIsBoundToImageHashAndSubmission() external {
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://bound", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        vm.expectRevert(RoundV5.InvalidImageSignature.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://bound",
            keccak256("different-hash"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );

        vm.prank(submitter);
        round.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Second entry",
                description: "Another valid description",
                metadataURI: "ipfs://second",
                metadataHash: keccak256("second"),
                originalImageCount: 0
            })
        );
        vm.expectRevert(RoundV5.InvalidImageSignature.selector);
        round.appendSubmissionImage(
            1,
            "ipfs://bound",
            keccak256("ipfs://bound"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testOriginalPlusSevenAppendsThenNinthRejects() external {
        for (uint256 i; i < 7; ++i) {
            _append(
                0, string.concat("ipfs://bounded-", vm.toString(i)), ADMIN_ONE_KEY, ADMIN_TWO_KEY
            );
        }
        assertEq(round.submissionImageCount(0), 7);
        uint256 nonce = round.imageRevisionNonce(0);
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(0, "ipfs://ninth", ADMIN_ONE_KEY, ADMIN_TWO_KEY, nonce, deadline);
        vm.expectRevert(RoundV5.ImageLimitReached.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://ninth",
            keccak256("ipfs://ninth"),
            nonce,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testFactoryUpgradeFromV4PreservesOldCloneAndCreatesV5() external {
        RoundFactoryV3 upgradeFactory = new RoundFactoryV3(
            adminOne,
            adminTwo,
            makeAddr("upgrade-treasury"),
            FEE,
            address(new RoundV4()),
            address(new RoundPrizeVaultV4()),
            address(adapter),
            true
        );
        vm.deal(creator, FEE * 2);
        vm.prank(creator);
        (address oldRound,) = upgradeFactory.createRound{ value: FEE }(
            config, _emptyVaultConfig(), keccak256("old-v4")
        );
        address v5RoundImplementation = address(new RoundV5());
        address v5VaultImplementation = address(new RoundPrizeVaultV5());
        vm.prank(adminOne);
        upgradeFactory.registerImplementationPair(5, v5RoundImplementation, v5VaultImplementation);
        vm.prank(creator);
        (address newRound,) = upgradeFactory.createRound{ value: FEE }(
            config, _emptyVaultConfig(), keccak256("new-v5")
        );
        assertEq(RoundV4(payable(oldRound)).deployedImplementationVersion(), 4);
        assertEq(RoundV5(payable(newRound)).deployedImplementationVersion(), 5);
        assertEq(RoundV4(payable(oldRound)).implementationVersion(), 4);
    }

    function testV5ImplementationAndCloneCannotReinitialize() external {
        RoundV5 implementation = new RoundV5();
        (bool implementationInitialized,) = address(implementation)
            .call(
                abi.encodeCall(
                    implementation.initialize,
                    (address(factory), creator, address(1), 5, bytes32(0), bytes32(0), config)
                )
            );
        assertFalse(implementationInitialized);
        (bool cloneReinitialized,) = address(round)
            .call(
                abi.encodeCall(
                    round.initialize,
                    (
                        address(factory),
                        creator,
                        round.prizeVault(),
                        5,
                        bytes32(0),
                        bytes32(0),
                        config
                    )
                )
            );
        assertFalse(cloneReinitialized);
    }

    function testTotalEightImageCapAndVotingStartFreeze() external {
        vm.prank(submitter);
        round.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Entry two",
                description: "Another valid description",
                metadataURI: "ipfs://metadata-two",
                metadataHash: keccak256("metadata-two"),
                originalImageCount: 8
            })
        );
        uint256 deadline = block.timestamp + 1 days;
        (bytes memory signatureA, bytes memory signatureB) =
            _signatures(1, "ipfs://ninth", ADMIN_ONE_KEY, ADMIN_TWO_KEY, 0, deadline);
        vm.expectRevert(RoundV5.ImageLimitReached.selector);
        round.appendSubmissionImage(
            1,
            "ipfs://ninth",
            keccak256("ipfs://ninth"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );

        vm.warp(config.votingStart);
        vm.expectRevert(RoundV5.InvalidPhase.selector);
        round.appendSubmissionImage(
            0,
            "ipfs://late",
            keccak256("ipfs://late"),
            0,
            deadline,
            RoundV5.ImageApproval(adminOne, signatureA),
            RoundV5.ImageApproval(adminTwo, signatureB)
        );
    }

    function testOriginalImageDeclarationOverEightReverts() external {
        vm.prank(submitter);
        vm.expectRevert(RoundV5.ImageLimitReached.selector);
        round.submit(
            RoundV5.SubmissionInput({
                submissionType: RoundTypes.SubmissionType.PROJECT,
                title: "Too many",
                description: "Another valid description",
                metadataURI: "ipfs://too-many",
                metadataHash: keccak256("too-many"),
                originalImageCount: 9
            })
        );
    }

    function testAppendDoesNotChangeOriginalSubmissionAuthority() external {
        RoundV5.Submission memory beforeSubmission = round.getSubmission(0);
        _append(0, "ipfs://extra", ADMIN_ONE_KEY, ADMIN_TWO_KEY);
        RoundV5.Submission memory afterSubmission = round.getSubmission(0);

        assertEq(afterSubmission.owner, beforeSubmission.owner);
        assertEq(uint8(afterSubmission.status), uint8(beforeSubmission.status));
        assertEq(afterSubmission.metadataURI, beforeSubmission.metadataURI);
        assertEq(afterSubmission.metadataHash, beforeSubmission.metadataHash);
        assertEq(afterSubmission.titleHash, beforeSubmission.titleHash);
        assertEq(afterSubmission.descriptionHash, beforeSubmission.descriptionHash);
        assertEq(round.submissionVoteTotals(0), 0);
    }

    function _append(uint256 submissionId, string memory uri, uint256 keyA, uint256 keyB) private {
        uint256 nonce = round.imageRevisionNonce(submissionId);
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest =
            round.hashSubmissionImage(submissionId, uri, keccak256(bytes(uri)), nonce, deadline);
        round.appendSubmissionImage(
            submissionId,
            uri,
            keccak256(bytes(uri)),
            nonce,
            deadline,
            RoundV5.ImageApproval(vm.addr(keyA), _signature(keyA, digest)),
            RoundV5.ImageApproval(vm.addr(keyB), _signature(keyB, digest))
        );
    }

    function _signature(uint256 key, bytes32 digest) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signatures(
        uint256 submissionId,
        string memory uri,
        uint256 keyA,
        uint256 keyB,
        uint256 nonce,
        uint256 deadline
    ) private view returns (bytes memory signatureA, bytes memory signatureB) {
        bytes32 digest = round.hashSubmissionImage(
                submissionId, uri, keccak256(bytes(uri)), nonce, deadline
            );
        (uint8 vA, bytes32 rA, bytes32 sA) = vm.sign(keyA, digest);
        (uint8 vB, bytes32 rB, bytes32 sB) = vm.sign(keyB, digest);
        signatureA = abi.encodePacked(rA, sA, vA);
        signatureB = abi.encodePacked(rB, sB, vB);
    }

    function _config() private view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-v5",
            metadataHash: keccak256("round-v5"),
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
            maxSubmissionsPerWallet: 3,
            maxSubmissions: 10,
            winnerCount: 1,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 10,
            maxDescriptionLength: 2_000
        });
    }

    function _emptyVaultConfig() private returns (PrizeTypes.VaultConfig memory) {
        return PrizeTypes.VaultConfig({
            recoveryRecipient: makeAddr("recovery"),
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: new PrizeTypes.AllocationInput[](0)
        });
    }
}
