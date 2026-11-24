// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RoundFactoryV7 } from "../src/v7/RoundFactoryV7.sol";
import { RoundV7 } from "../src/v7/RoundV7.sol";
import { RoundPrizeVaultV7 } from "../src/v7/RoundPrizeVaultV7.sol";
import { RoundFactoryV6 } from "../src/v6/RoundFactoryV6.sol";
import { RoundV6 } from "../src/v6/RoundV6.sol";
import { RoundPrizeVaultV6 } from "../src/v6/RoundPrizeVaultV6.sol";
import { RoundValidation } from "../src/RoundValidation.sol";
import { RoundValidationV7 } from "../src/v7/RoundValidationV7.sol";
import { RoundTypes } from "../src/RoundTypes.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract RoundsV7SubmissionLimitTest is Test {
    uint256 private constant FEE = 0.01 ether;
    uint256 private constant V6_FEE = 0.0001 ether;
    address private constant TREASURY = 0xd5f279ff9EB21c6D40C8f345a66f2751C4eeA1fB;
    RoundFactoryV7 private factoryV7;
    RoundFactoryV6 private factoryV6;
    address private adapter;

    function setUp() external {
        vm.chainId(31_337);
        vm.deal(address(this), 1 ether);
        adapter = address(new LilNounsVotingPower(address(new MockLilNounsVotes(address(this)))));
        factoryV7 = new RoundFactoryV7(
            makeAddr("admin-one"),
            makeAddr("admin-two"),
            FEE,
            address(new RoundV7()),
            address(new RoundPrizeVaultV7()),
            adapter,
            true
        );
        factoryV6 = new RoundFactoryV6(
            makeAddr("admin-one"),
            makeAddr("admin-two"),
            makeAddr("treasury"),
            V6_FEE,
            address(new RoundV6()),
            address(new RoundPrizeVaultV6()),
            adapter,
            true
        );
    }

    function testV7AcceptsOneThousandSubmissionsAndPreservesUnscheduledFlow() external {
        assertEq(factoryV7.creationFee(), FEE);
        assertEq(factoryV7.treasury(), TREASURY);
        uint256 treasuryBefore = TREASURY.balance;
        RoundTypes.RoundConfig memory config = _config();
        config.maxSubmissions = 1_000;
        (address roundAddress, address vaultAddress) =
            factoryV7.createRound{ value: FEE }(config, _vaultConfig(), keccak256("v7-limit"));

        assertEq(factoryV7.activeImplementationVersion(), 7);
        assertEq(RoundV7(payable(roundAddress)).maxSubmissions(), 1_000);
        assertFalse(RoundV7(payable(roundAddress)).scheduleConfigured());
        assertEq(RoundPrizeVaultV7(payable(vaultAddress)).implementationVersion(), 7);
        assertEq(TREASURY.balance, treasuryBefore + FEE);
    }

    function testV7RejectsPreviousCreationFee() external {
        vm.expectRevert(RoundFactoryV7.InvalidFee.selector);
        factoryV7.createRound{ value: V6_FEE }(_config(), _vaultConfig(), keccak256("old-fee"));
    }

    function testGlobalAdminCanUpdateFeeButNotTreasury() external {
        address admin = makeAddr("admin-one");
        vm.prank(admin);
        factoryV7.setCreationFee(0.02 ether);
        assertEq(factoryV7.creationFee(), 0.02 ether);
        assertEq(factoryV7.treasury(), TREASURY);

        uint256 treasuryBefore = TREASURY.balance;
        factoryV7.createRound{ value: 0.02 ether }(
            _config(), _vaultConfig(), keccak256("updated-fee")
        );
        assertEq(TREASURY.balance, treasuryBefore + 0.02 ether);
    }

    function testOnlyGlobalAdminCanSetNonzeroFee() external {
        vm.expectRevert(RoundFactoryV7.NotGlobalAdmin.selector);
        factoryV7.setCreationFee(0.02 ether);

        vm.prank(makeAddr("admin-one"));
        vm.expectRevert(RoundFactoryV7.InvalidFee.selector);
        factoryV7.setCreationFee(0);
    }

    function testV7RejectsMoreThanOneThousandSubmissions() external {
        RoundTypes.RoundConfig memory config = _config();
        config.maxSubmissions = 1_001;
        vm.expectRevert(RoundValidationV7.InvalidSubmissionConfiguration.selector);
        factoryV7.createRound{ value: FEE }(config, _vaultConfig(), keccak256("too-many"));
    }

    function testExistingV6StillRejectsMoreThanOneHundred() external {
        RoundTypes.RoundConfig memory config = _config();
        config.maxSubmissions = 101;
        vm.expectRevert(RoundValidation.InvalidSubmissionConfiguration.selector);
        factoryV6.createRound{ value: V6_FEE }(config, _vaultConfig(), keccak256("v6-limit"));
    }

    function _config() private view returns (RoundTypes.RoundConfig memory) {
        return RoundTypes.RoundConfig({
            metadataURI: "ipfs://round-v7",
            metadataHash: keccak256("round-v7"),
            roundStart: 0,
            submissionsOpen: 0,
            submissionsClose: 0,
            votingStart: 0,
            votingEnd: 0,
            votingPowerAdapter: adapter,
            votingStrategy: RoundTypes.VotingStrategy.FIXED_PER_ELIGIBLE_WALLET,
            snapshotMode: RoundTypes.SnapshotMode.VOTING_START,
            customSnapshotBlock: 0,
            baseOrFixedVotes: 1,
            maxVotesPerSubmission: 1,
            maxSubmissionsPerWallet: 2,
            maxSubmissions: 1_000,
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
