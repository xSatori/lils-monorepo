// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RoundFactoryV6 } from "../src/v6/RoundFactoryV6.sol";
import { RoundV6 } from "../src/v6/RoundV6.sol";
import { RoundPrizeVaultV6 } from "../src/v6/RoundPrizeVaultV6.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { RoundValidation } from "../src/RoundValidation.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract RoundsV6ScheduleTest is Test {
    uint256 private constant FEE = 0.0001 ether;

    address private creator;
    address private delegatedAdmin;
    address private stranger;
    RoundFactoryV6 private factory;
    RoundV6 private round;
    RoundPrizeVaultV6 private vault;
    LilNounsVotingPower private adapter;

    function setUp() external {
        vm.chainId(31_337);
        creator = makeAddr("creator");
        delegatedAdmin = makeAddr("delegated-admin");
        stranger = makeAddr("stranger");
        vm.deal(creator, 2 ether);
        vm.deal(address(this), 2 ether);

        MockLilNounsVotes token = new MockLilNounsVotes(address(this));
        adapter = new LilNounsVotingPower(address(token));
        factory = new RoundFactoryV6(
            makeAddr("global-one"),
            makeAddr("global-two"),
            makeAddr("treasury"),
            FEE,
            address(new RoundV6()),
            address(new RoundPrizeVaultV6()),
            address(adapter),
            true
        );
        vm.prank(creator);
        (address roundAddress, address vaultAddress) =
            factory.createRound{ value: FEE }(_config(), _vaultConfig(), keccak256("round-v6"));
        round = RoundV6(payable(roundAddress));
        vault = RoundPrizeVaultV6(payable(vaultAddress));
    }

    function testCreationIsUnscheduledAndCannotStartOrFinalize() external {
        assertEq(factory.activeImplementationVersion(), 6);
        assertFalse(round.scheduleConfigured());
        assertEq(round.submissionsOpen(), 0);
        assertEq(round.votingEnd(), 0);
        assertEq(uint8(round.lifecycleState()), uint8(RoundTypes.LifecycleState.UPCOMING));

        vm.expectRevert(RoundV6.NotFinalizable.selector);
        round.finalize();
        vm.prank(stranger);
        vm.expectRevert(RoundV6.InvalidPhase.selector);
        round.submit(_submission());
    }

    function testCannotScheduleUntilEveryPrizeIsFundedAndVaultSealed() external {
        vm.prank(creator);
        vm.expectRevert(RoundV6.PrizeVaultNotReady.selector);
        _setSchedule(uint40(block.timestamp + 1 hours));

        vault.fundNative{ value: 0.5 ether }();
        vm.expectRevert(RoundPrizeVaultV6.FundingIncomplete.selector);
        vault.seal();
        vault.fundNative{ value: 0.5 ether }();
        vault.seal();
        assertEq(uint8(vault.state()), uint8(PrizeTypes.VaultState.SEALED));

        vm.prank(creator);
        _setSchedule(uint40(block.timestamp + 1 hours));
        assertTrue(round.scheduleConfigured());
    }

    function testOnlyLiveRoundAdminsCanSchedule() external {
        _fundAndSeal();
        vm.prank(stranger);
        vm.expectRevert(RoundV6.NotRoundAdmin.selector);
        _setSchedule(uint40(block.timestamp + 1 hours));

        vm.prank(creator);
        round.grantRoundAdmin(delegatedAdmin);
        vm.prank(delegatedAdmin);
        _setSchedule(uint40(block.timestamp + 1 hours));
        assertTrue(round.scheduleConfigured());

        vm.prank(creator);
        round.revokeRoundAdmin(delegatedAdmin);
        vm.prank(delegatedAdmin);
        vm.expectRevert(RoundV6.NotRoundAdmin.selector);
        _setSchedule(uint40(block.timestamp + 2 hours));
    }

    function testScheduleCanChangeUntilButNotAtOpening() external {
        _fundAndSeal();
        uint40 firstOpen = uint40(block.timestamp + 1 hours);
        vm.prank(creator);
        _setSchedule(firstOpen);
        uint40 revisedOpen = firstOpen + 1 hours;
        vm.warp(firstOpen - 1);
        vm.prank(creator);
        _setSchedule(revisedOpen);
        assertEq(round.submissionsOpen(), revisedOpen);

        vm.warp(revisedOpen);
        vm.prank(creator);
        vm.expectRevert(RoundV6.InvalidPhase.selector);
        _setSchedule(revisedOpen + 1 hours);
    }

    function testRejectsPastMalformedAndNonTestPhaseSchedules() external {
        _fundAndSeal();
        vm.startPrank(creator);
        uint40 open = uint40(block.timestamp + 1 hours);
        vm.expectRevert(RoundV6.InvalidSchedule.selector);
        _setSchedule(uint40(block.timestamp));
        vm.expectRevert(RoundV6.InvalidSchedule.selector);
        round.setSchedule(open, open, open + 5 minutes, open + 10 minutes);
        vm.expectRevert(RoundV6.InvalidSchedule.selector);
        round.setSchedule(open, open + 6 minutes, open + 11 minutes, open + 16 minutes);
        vm.stopPrank();
    }

    function testFactoryRejectsAnyScheduleAtCreation() external {
        RoundTypes.RoundConfig memory config = _config();
        config.submissionsOpen = uint40(block.timestamp + 1 hours);
        vm.prank(creator);
        vm.expectRevert(RoundValidation.InvalidSchedule.selector);
        factory.createRound{ value: FEE }(config, _vaultConfig(), keccak256("scheduled-v6"));
    }

    function testFactoryRejectsAnEmptyPrizePlan() external {
        PrizeTypes.VaultConfig memory empty = _vaultConfig();
        empty.allocations = new PrizeTypes.AllocationInput[](0);
        vm.prank(creator);
        vm.expectRevert(RoundFactoryV6.EmptyPrizePlan.selector);
        factory.createRound{ value: FEE }(_config(), empty, keccak256("empty-v6"));
    }

    function testUnscheduledFundingCanBeRefundedButNotCanceled() external {
        vault.fundNative{ value: 1 ether }();
        vm.expectRevert(RoundPrizeVaultV6.InvalidState.selector);
        vault.cancelUnfunded();
        vault.refundContribution(PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        assertEq(vault.fundedByAsset(vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0)), 0);
    }

    function testProductionModeAllowsOrderedCustomPhaseLengths() external {
        RoundFactoryV6 productionFactory = new RoundFactoryV6(
            makeAddr("production-admin-one"),
            makeAddr("production-admin-two"),
            makeAddr("production-treasury"),
            FEE,
            address(new RoundV6()),
            address(new RoundPrizeVaultV6()),
            address(adapter),
            false
        );
        PrizeTypes.VaultConfig memory productionVault = _vaultConfig();
        productionVault.claimPeriod = 180 days;
        productionVault.recoveryDelay = 48 hours;
        vm.prank(creator);
        (address roundAddress, address vaultAddress) = productionFactory.createRound{ value: FEE }(
            _config(), productionVault, keccak256("production-v6")
        );
        RoundPrizeVaultV6 deployedVault = RoundPrizeVaultV6(payable(vaultAddress));
        deployedVault.fundNative{ value: 1 ether }();
        deployedVault.seal();
        uint40 open = uint40(block.timestamp + 1 days);
        vm.prank(creator);
        RoundV6(payable(roundAddress))
            .setSchedule(open, open + 2 days, open + 3 days, open + 10 days);
        assertEq(RoundV6(payable(roundAddress)).votingEnd(), open + 10 days);
    }

    function testAfterSealingAndSchedulingSubmissionsUseTheConfiguredWindow() external {
        _fundAndSeal();
        uint40 open = uint40(block.timestamp + 1 hours);
        vm.prank(creator);
        _setSchedule(open);
        vm.warp(open - 1);
        vm.prank(stranger);
        vm.expectRevert(RoundV6.InvalidPhase.selector);
        round.submit(_submission());

        vm.warp(open);
        vm.prank(stranger);
        uint256 submissionId = round.submit(_submission());
        assertEq(submissionId, 0);
        vm.warp(round.votingEnd());
        round.finalize();
        assertTrue(round.finalized());
    }

    function _fundAndSeal() private {
        vault.fundNative{ value: 1 ether }();
        vault.seal();
    }

    function _setSchedule(uint40 open) private {
        round.setSchedule(open, open + 5 minutes, open + 10 minutes, open + 15 minutes);
    }

    function _submission() private pure returns (RoundV6.SubmissionInput memory) {
        return RoundV6.SubmissionInput({
            submissionType: RoundTypes.SubmissionType.PROJECT,
            title: "Entry",
            description: "A valid description",
            metadataURI: "ipfs://entry",
            metadataHash: keccak256("entry"),
            originalImageCount: 0
        });
    }

    function _config() private view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-v6",
            metadataHash: keccak256("round-v6"),
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

    function _vaultConfig() private pure returns (PrizeTypes.VaultConfig memory) {
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 1 ether);
        return PrizeTypes.VaultConfig({
            recoveryRecipient: address(0x1234),
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
    }

    receive() external payable { }
}
