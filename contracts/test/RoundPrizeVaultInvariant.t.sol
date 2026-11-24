// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { RoundPrizeVault } from "../src/v3/RoundPrizeVault.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";

contract InvariantPrizeFactory {
    mapping(address => bool) public isRound;
    mapping(address => bool) public isGlobalAdmin;

    function setGlobalAdmin(address account, bool enabled) external {
        isGlobalAdmin[account] = enabled;
    }

    function initialize(
        RoundPrizeVault vault,
        address round,
        bytes32 planHash,
        PrizeTypes.VaultConfig calldata config
    ) external {
        isRound[round] = true;
        vault.initialize(address(this), round, true, planHash, config);
    }
}

contract InvariantPrizeRound {
    address public factory;
    address public prizeVault;
    uint40 public submissionsOpen;
    uint40 public votingStart;
    uint40 public finalizedAt;
    uint8 public winnerCount = 1;
    bool public finalized;
    mapping(address => bool) public isRoundAdmin;
    mapping(address => bool) public isRecoveryAdmin;
    address private _winner;

    constructor(address factory_) {
        factory = factory_;
        submissionsOpen = uint40(block.timestamp + 365 days);
        votingStart = uint40(block.timestamp + 366 days);
    }

    function setVault(address vault) external {
        prizeVault = vault;
    }

    function setAdmin(address account, bool enabled) external {
        isRoundAdmin[account] = enabled;
        isRecoveryAdmin[account] = enabled;
    }

    function finalize(address winner) external {
        if (finalized) return;
        finalized = true;
        finalizedAt = uint40(block.timestamp);
        _winner = winner;
    }

    function winnerAddress(uint256 rank) external view returns (address) {
        return rank == 0 ? _winner : address(0);
    }
}

contract PrizeVaultHandler is Test {
    uint256 private constant GLOBAL_ONE_KEY = 0xA11CE;
    uint256 private constant GLOBAL_TWO_KEY = 0xB0B;

    RoundPrizeVault public immutable vault;
    InvariantPrizeRound public immutable round;
    bytes32 public immutable nativeKey;
    address public immutable winner;
    address public immutable recoveryRecipient;
    uint256 public successfulReleaseCount;
    uint256 public lastRecoveryNonce;
    bool public recoveryNonceMonotonic = true;

    constructor(RoundPrizeVault vault_, InvariantPrizeRound round_, address winner_) {
        vault = vault_;
        round = round_;
        winner = winner_;
        recoveryRecipient = vault_.recoveryRecipient();
        nativeKey = vault_.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0);
        vm.deal(address(this), 100 ether);
    }

    function fund(uint96 rawAmount) external {
        uint256 funded = vault.fundedByAsset(nativeKey);
        uint256 liability = vault.liabilityByAsset(nativeKey);
        if (funded >= liability) return;
        uint256 amount = bound(uint256(rawAmount), 1, liability - funded);
        vault.fundNative{ value: amount }();
    }

    function refund(uint96 rawAmount) external {
        uint256 credit = vault.contributionOf(address(this), nativeKey);
        if (credit == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, credit);
        vault.refundContribution(PrizeTypes.AssetType.NATIVE, address(0), 0, amount);
    }

    function sealAndFinalize() external {
        if (uint8(vault.state()) != uint8(PrizeTypes.VaultState.FUNDING)) return;
        if (vault.fundedByAsset(nativeKey) != vault.liabilityByAsset(nativeKey)) return;
        vault.seal();
        round.finalize(winner);
    }

    function release() external {
        if (!round.finalized()) return;
        PrizeTypes.Allocation memory allocation = vault.getAllocation(0);
        if (allocation.claimed) return;
        try vault.release(0) {
            successfulReleaseCount += 1;
        } catch { }
    }

    function recoverForcedExcess(uint96 rawAmount) external {
        if (lastRecoveryNonce != vault.recoveryNonce()) return;
        uint256 amount = bound(uint256(rawAmount), 1, 1 ether);
        uint256 liability = vault.liabilityByAsset(nativeKey);
        uint256 balance = address(vault).balance;
        vm.deal(address(vault), balance + (liability > balance ? liability - balance : 0) + amount);
        uint256 nonceBefore = vault.recoveryNonce();
        PrizeTypes.RecoveryAction memory action = PrizeTypes.RecoveryAction({
            kind: PrizeTypes.RecoveryKind.EXCESS,
            assetType: PrizeTypes.AssetType.NATIVE,
            token: address(0),
            tokenId: 0,
            amount: amount,
            recipient: recoveryRecipient,
            allocationId: 0,
            nonce: nonceBefore,
            validAfter: uint48(block.timestamp),
            deadline: uint48(block.timestamp + 1 days)
        });
        bytes32 digest = vault.hashRecoveryAction(action);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(GLOBAL_ONE_KEY, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(GLOBAL_TWO_KEY, digest);
        bytes32 actionId = vault.queueRecovery(
            action,
            vm.addr(GLOBAL_ONE_KEY),
            abi.encodePacked(r1, s1, v1),
            vm.addr(GLOBAL_TWO_KEY),
            abi.encodePacked(r2, s2, v2)
        );
        uint256 nonceAfter = vault.recoveryNonce();
        if (nonceAfter != nonceBefore + 1 || nonceAfter <= lastRecoveryNonce) {
            recoveryNonceMonotonic = false;
        }
        lastRecoveryNonce = nonceAfter;
        vm.warp(block.timestamp + 5 minutes);
        vault.executeRecovery(actionId);
    }
    receive() external payable { }
}

contract RoundPrizeVaultInvariantTest is StdInvariant, Test {
    RoundPrizeVault private vault;
    PrizeVaultHandler private handler;
    InvariantPrizeFactory private factory;
    InvariantPrizeRound private round;
    bytes32 private nativeKey;
    bytes32 private expectedPlanHash;
    address private winner;
    uint256 private initialLiability;

    function setUp() external {
        vm.chainId(31_337);
        factory = new InvariantPrizeFactory();
        round = new InvariantPrizeRound(address(factory));
        RoundPrizeVault implementation = new RoundPrizeVault();
        vault = RoundPrizeVault(payable(Clones.clone(address(implementation))));
        round.setVault(address(vault));
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, 10 ether);
        PrizeTypes.VaultConfig memory config = PrizeTypes.VaultConfig({
            recoveryRecipient: address(0xBEEF),
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        expectedPlanHash = keccak256(
            abi.encode(
                allocations, config.recoveryRecipient, config.claimPeriod, config.recoveryDelay
            )
        );
        factory.initialize(vault, address(round), expectedPlanHash, config);
        winner = makeAddr("invariant-winner");
        handler = new PrizeVaultHandler(vault, round, winner);
        factory.setGlobalAdmin(vm.addr(0xA11CE), true);
        factory.setGlobalAdmin(vm.addr(0xB0B), true);
        nativeKey = vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0);
        initialLiability = vault.liabilityByAsset(nativeKey);
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = PrizeVaultHandler.fund.selector;
        selectors[1] = PrizeVaultHandler.refund.selector;
        selectors[2] = PrizeVaultHandler.sealAndFinalize.selector;
        selectors[3] = PrizeVaultHandler.release.selector;
        selectors[4] = PrizeVaultHandler.recoverForcedExcess.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariantFundingNeverExceedsCommittedPlan() external {
        assertLe(vault.fundedByAsset(nativeKey), initialLiability);
        if (vault.state() == PrizeTypes.VaultState.SEALED) {
            assertEq(vault.fundedByAsset(nativeKey), initialLiability);
        }
    }

    function invariantOutstandingValueIsBackedByBalance() external {
        uint256 reserved = vault.state() == PrizeTypes.VaultState.SEALED
            ? vault.liabilityByAsset(nativeKey)
            : vault.fundedByAsset(nativeKey);
        assertGe(address(vault).balance, reserved);
    }

    function invariantReleasedValuePlusRemainingLiabilityReconciles() external {
        assertEq(winner.balance + vault.liabilityByAsset(nativeKey), initialLiability);
    }

    function invariantPrizePlanHashNeverChanges() external {
        assertEq(vault.prizePlanHash(), expectedPlanHash);
    }

    function invariantReleaseAtMostOnceAndRecipientDerivedFromRound() external {
        assertLe(handler.successfulReleaseCount(), 1);
        PrizeTypes.Allocation memory allocation = vault.getAllocation(0);
        if (allocation.claimed) {
            assertEq(winner.balance, initialLiability);
            assertEq(vault.liabilityByAsset(nativeKey), 0);
        }
    }

    function invariantRecoveryNeverConsumesOutstandingLiability() external {
        if (vault.state() == PrizeTypes.VaultState.SEALED) {
            assertGe(address(vault).balance, vault.liabilityByAsset(nativeKey));
        }
    }

    function invariantRecoveryNonceIsMonotonic() external {
        assertTrue(handler.recoveryNonceMonotonic());
        assertEq(handler.lastRecoveryNonce(), vault.recoveryNonce());
    }

    function invariantFactoryProvenanceAndInitializationStayBound() external {
        assertTrue(factory.isRound(address(round)));
        assertEq(vault.factory(), address(factory));
        assertEq(vault.round(), address(round));
        assertEq(round.prizeVault(), address(vault));
        (bool initializedAgain,) = address(vault)
            .call(
                abi.encodeCall(
                    RoundPrizeVault.initialize,
                    (
                        address(factory),
                        address(round),
                        true,
                        expectedPlanHash,
                        PrizeTypes.VaultConfig({
                            recoveryRecipient: address(0xBEEF),
                            claimPeriod: 5 minutes,
                            recoveryDelay: 5 minutes,
                            allocations: new PrizeTypes.AllocationInput[](0)
                        })
                    )
                )
            );
        assertFalse(initializedAgain);
    }
}
