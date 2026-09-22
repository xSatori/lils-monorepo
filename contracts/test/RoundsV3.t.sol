// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";
import { RoundV3 } from "../src/v3/RoundV3.sol";
import { RoundPrizeVault } from "../src/v3/RoundPrizeVault.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { IRoundV3 } from "../src/interfaces/IRoundV3.sol";
import { IRoundPrizeVault } from "../src/interfaces/IRoundPrizeVault.sol";

contract MockV3PairImplementation {
    uint32 private immutable _version;
    bytes4 private immutable _selector;

    constructor(uint32 version_, bytes4 selector_) {
        _version = version_;
        _selector = selector_;
    }

    function implementationVersion() external view returns (uint32) {
        return _version;
    }

    function initializerSelector() external view returns (bytes4) {
        return _selector;
    }
}

contract RoundsV3Test is Test {
    uint256 private constant FEE = 0.0001 ether;
    address private constant ADMIN_ONE = address(0xA11CE);
    address private constant ADMIN_TWO = address(0xB0B);
    address private constant CREATOR = address(0xC0FFEE);
    address private constant TREASURY = address(0x7EA5);

    RoundV3 private roundImplementation;
    RoundPrizeVault private vaultImplementation;
    MockLilNounsVotes private token;
    LilNounsVotingPower private adapter;
    RoundFactoryV3 private factory;

    function setUp() external {
        vm.chainId(31_337);
        roundImplementation = new RoundV3();
        vaultImplementation = new RoundPrizeVault();
        token = new MockLilNounsVotes(address(this));
        adapter = new LilNounsVotingPower(address(token));
        factory = new RoundFactoryV3(
            ADMIN_ONE,
            ADMIN_TWO,
            TREASURY,
            FEE,
            address(roundImplementation),
            address(vaultImplementation),
            address(adapter),
            true
        );
        vm.deal(CREATOR, 10 ether);
    }

    function testFactoryCreatesAndBindsRoundAndVaultAtomically() external {
        RoundTypes.RoundConfig memory config = _config();
        PrizeTypes.VaultConfig memory vaultConfig = _emptyVaultConfig();
        (address predictedRound, address predictedVault) =
            factory.predictRoundAndVaultAddresses(CREATOR, config, vaultConfig, keccak256("pair"));
        uint256 treasuryBefore = TREASURY.balance;

        vm.prank(CREATOR);
        (address roundAddress, address vaultAddress) =
            factory.createRound{ value: FEE }(config, vaultConfig, keccak256("pair"));

        assertEq(roundAddress, predictedRound);
        assertEq(vaultAddress, predictedVault);
        assertEq(factory.vaultForRound(roundAddress), vaultAddress);
        assertEq(factory.roundForVault(vaultAddress), roundAddress);
        assertTrue(factory.isRound(roundAddress));
        assertTrue(factory.isPrizeVault(vaultAddress));
        assertEq(RoundV3(payable(roundAddress)).prizeVault(), vaultAddress);
        assertEq(RoundPrizeVault(payable(vaultAddress)).round(), roundAddress);
        assertTrue(RoundPrizeVault(payable(vaultAddress)).isReadyForSubmissions());
        assertEq(TREASURY.balance - treasuryBefore, FEE);
        assertEq(address(factory).balance, 0);

        vm.expectRevert();
        RoundV3(payable(roundAddress))
            .initialize(address(factory), CREATOR, vaultAddress, 3, bytes32(0), bytes32(0), config);
        vm.expectRevert();
        RoundPrizeVault(payable(vaultAddress))
            .initialize(address(factory), address(roundAddress), true, bytes32(0), vaultConfig);
    }

    function testNonEmptyUnsealedVaultBlocksSubmissions() external {
        RoundTypes.RoundConfig memory config = _config();
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] = PrizeTypes.AllocationInput({
            winnerRank: 0,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: 1 ether
        });
        PrizeTypes.VaultConfig memory vaultConfig = PrizeTypes.VaultConfig({
            recoveryRecipient: CREATOR,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        vm.prank(CREATOR);
        (address roundAddress,) =
            factory.createRound{ value: FEE }(config, vaultConfig, keccak256("unfunded"));
        vm.warp(config.submissionsOpen);
        vm.expectRevert(RoundV3.PrizeVaultNotReady.selector);
        RoundV3(payable(roundAddress))
            .submit(
                RoundTypes.SubmissionType.PROJECT,
                "Entry",
                "Description",
                "ipfs://entry",
                keccak256("entry")
            );
    }

    function testTestModeCannotDeployOnMainnet() external {
        vm.chainId(1);
        vm.expectRevert(RoundFactoryV3.InvalidTestChain.selector);
        new RoundFactoryV3(
            ADMIN_ONE,
            ADMIN_TWO,
            TREASURY,
            FEE,
            address(roundImplementation),
            address(vaultImplementation),
            address(adapter),
            true
        );
    }

    function testGlobalAdminCanOnlyRotateSelf() external {
        address replacement = address(0xD00D);
        vm.prank(ADMIN_ONE);
        vm.expectRevert(RoundFactoryV3.NotGlobalAdmin.selector);
        factory.rotateGlobalAdmin(ADMIN_TWO, replacement);

        vm.prank(ADMIN_TWO);
        factory.rotateGlobalAdmin(ADMIN_TWO, replacement);
        assertFalse(factory.isGlobalAdmin(ADMIN_TWO));
        assertTrue(factory.isGlobalAdmin(replacement));
        address[2] memory admins = factory.getGlobalAdmins();
        assertEq(admins[0], ADMIN_ONE);
        assertEq(admins[1], replacement);
    }

    function testAccessControlCannotBypassExactlyTwoGlobalAdmins() external {
        bytes32 role = factory.GLOBAL_ADMIN_ROLE();
        vm.startPrank(ADMIN_ONE);
        vm.expectRevert(RoundFactoryV3.NotGlobalAdmin.selector);
        factory.grantRole(role, address(0xBAD));
        vm.expectRevert(RoundFactoryV3.NotGlobalAdmin.selector);
        factory.revokeRole(role, ADMIN_TWO);
        vm.expectRevert(RoundFactoryV3.NotGlobalAdmin.selector);
        factory.renounceRole(role, ADMIN_ONE);
        vm.stopPrank();

        address[2] memory admins = factory.getGlobalAdmins();
        assertEq(admins[0], ADMIN_ONE);
        assertEq(admins[1], ADMIN_TWO);
        assertTrue(factory.isGlobalAdmin(ADMIN_ONE));
        assertTrue(factory.isGlobalAdmin(ADMIN_TWO));
    }

    function testRecoverySignerSetFreezesAtSubmissionsOpen() external {
        RoundTypes.RoundConfig memory config = _config();
        vm.prank(CREATOR);
        (address roundAddress,) = factory.createRound{ value: FEE }(
            config, _emptyVaultConfig(), keccak256("recovery-admin-boundary")
        );
        RoundV3 deployedRound = RoundV3(payable(roundAddress));
        address earlyAdmin = address(0xEA41);
        address lateAdmin = address(0x1A7E);
        vm.prank(CREATOR);
        deployedRound.grantRoundAdmin(earlyAdmin);
        assertTrue(deployedRound.isRecoveryAdmin(CREATOR));
        assertTrue(deployedRound.isRecoveryAdmin(earlyAdmin));

        vm.warp(config.submissionsOpen);
        vm.prank(CREATOR);
        deployedRound.grantRoundAdmin(lateAdmin);
        assertTrue(deployedRound.isRoundAdmin(lateAdmin));
        assertFalse(deployedRound.isRecoveryAdmin(lateAdmin));
    }

    function testImplementationPairsAreSchemaCheckedAppendOnlyAndDoNotMutateExistingRounds()
        external
    {
        vm.prank(CREATOR);
        (address existingRound, address existingVault) = factory.createRound{ value: FEE }(
            _config(), _emptyVaultConfig(), keccak256("immutable-existing-pair")
        );

        MockV3PairImplementation wrongRound = new MockV3PairImplementation(4, bytes4(0));
        MockV3PairImplementation validVault =
            new MockV3PairImplementation(4, IRoundPrizeVault.initialize.selector);
        vm.prank(ADMIN_ONE);
        vm.expectRevert(RoundFactoryV3.InvalidImplementationSchema.selector);
        factory.registerImplementationPair(4, address(wrongRound), address(validVault));

        MockV3PairImplementation validRound =
            new MockV3PairImplementation(4, IRoundV3.initialize.selector);
        MockV3PairImplementation wrongVersionVault =
            new MockV3PairImplementation(5, IRoundPrizeVault.initialize.selector);
        vm.prank(ADMIN_ONE);
        vm.expectRevert(RoundFactoryV3.InvalidImplementationVersion.selector);
        factory.registerImplementationPair(4, address(validRound), address(wrongVersionVault));

        vm.prank(ADMIN_ONE);
        factory.registerImplementationPair(4, address(validRound), address(validVault));
        assertEq(factory.activeImplementationVersion(), 4);
        vm.prank(ADMIN_TWO);
        vm.expectRevert(RoundFactoryV3.InvalidImplementationVersion.selector);
        factory.registerImplementationPair(4, address(validRound), address(validVault));

        RoundFactoryV3.RoundRecord memory record = factory.roundAt(0);
        assertEq(record.round, existingRound);
        assertEq(record.prizeVault, existingVault);
        assertEq(record.implementationVersion, 3);
        assertEq(factory.vaultForRound(existingRound), existingVault);
        assertEq(factory.roundForVault(existingVault), existingRound);
    }

    function _config() private view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-v3",
            metadataHash: keccak256("round-v3"),
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
            winnerCount: 2,
            minTitleLength: 3,
            maxTitleLength: 120,
            minDescriptionLength: 10,
            maxDescriptionLength: 2_000
        });
    }

    function _emptyVaultConfig() private pure returns (PrizeTypes.VaultConfig memory) {
        return PrizeTypes.VaultConfig({
            recoveryRecipient: CREATOR,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: new PrizeTypes.AllocationInput[](0)
        });
    }
}
