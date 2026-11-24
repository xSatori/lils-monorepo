// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { RoundPrizeVaultV4 } from "../src/v4/RoundPrizeVaultV4.sol";
import { PrizeTypes } from "../src/v3/PrizeTypes.sol";

contract V4InvariantFactory {
    mapping(address => bool) public isRound;
    mapping(address => bool) public isGlobalAdmin;

    function setGlobalAdmin(address account, bool enabled) external {
        isGlobalAdmin[account] = enabled;
    }

    function initialize(
        RoundPrizeVaultV4 vault,
        address round,
        bytes32 planHash,
        PrizeTypes.VaultConfig calldata config
    ) external {
        isRound[round] = true;
        vault.initialize(address(this), round, true, planHash, config);
    }
}

contract V4InvariantRound {
    address public immutable factory;
    address public prizeVault;
    uint40 public submissionsOpen;
    uint40 public votingStart;
    uint40 public finalizedAt;
    uint8 public winnerCount = 1;
    bool public finalized;
    address private _winner;
    mapping(address => bool) public isRoundAdmin;
    mapping(address => bool) public isRecoveryAdmin;

    constructor(address factory_) {
        factory = factory_;
        submissionsOpen = uint40(block.timestamp + 365 days);
        votingStart = uint40(block.timestamp + 366 days);
    }

    function setVault(address vault) external {
        prizeVault = vault;
    }

    function setRecoveryAdmin(address account, bool enabled) external {
        isRoundAdmin[account] = enabled;
        isRecoveryAdmin[account] = enabled;
    }

    function finalize(address winner) external {
        finalized = true;
        finalizedAt = uint40(block.timestamp);
        _winner = winner;
    }

    function winnerAddress(uint256 rank) external view returns (address) {
        return rank == 0 ? _winner : address(0);
    }
}

contract V4VaultHandler is Test {
    uint256 private constant GLOBAL_ONE_KEY = 0xA11CE;
    uint256 private constant GLOBAL_TWO_KEY = 0xB0B;

    RoundPrizeVaultV4 public immutable vault;
    address public immutable winner;
    address public immutable recoveryRecipient;
    bool public invalidTransitionSucceeded;
    uint256 public successfulTerminalTransitions;
    uint256 public successfulControls;

    constructor(RoundPrizeVaultV4 vault_, address winner_) {
        vault = vault_;
        winner = winner_;
        recoveryRecipient = vault_.recoveryRecipient();
    }

    function hold() external {
        PrizeTypes.Allocation memory allocation = vault.getAllocation(0);
        if (
            allocation.claimed || vault.isHeld(0)
                || block.timestamp >= vault.distributionAvailableAt()
        ) return;
        _control(RoundPrizeVaultV4.AllocationAction.HOLD);
        successfulControls += 1;
    }

    function unhold() external {
        if (!vault.isHeld(0) || vault.getAllocation(0).claimed) return;
        _control(RoundPrizeVaultV4.AllocationAction.UNHOLD);
        successfulControls += 1;
    }

    function release() external {
        if (vault.isHeld(0) || vault.getAllocation(0).claimed) return;
        if (block.timestamp < vault.distributionAvailableAt()) {
            vm.warp(vault.distributionAvailableAt());
        }
        try vault.release(0) {
            successfulTerminalTransitions += 1;
        } catch { }
    }

    function reclaim() external {
        if (!vault.isHeld(0) || vault.getAllocation(0).claimed) return;
        uint256 readyAt = uint256(vault.heldAt(0)) + vault.recoveryDelay();
        if (block.timestamp < readyAt) vm.warp(readyAt);
        _control(RoundPrizeVaultV4.AllocationAction.RECLAIM);
        successfulControls += 1;
        successfulTerminalTransitions += 1;
    }

    function attemptReleaseWhileHeld() external {
        if (!vault.isHeld(0) || vault.getAllocation(0).claimed) return;
        if (block.timestamp < vault.distributionAvailableAt()) {
            vm.warp(vault.distributionAvailableAt());
        }
        try vault.release(0) {
            invalidTransitionSucceeded = true;
        } catch { }
    }

    function attemptDuplicateSignerControl() external {
        PrizeTypes.Allocation memory allocation = vault.getAllocation(0);
        if (allocation.claimed || vault.isHeld(0)) return;
        uint48 deadline = uint48(block.timestamp + 1 days);
        uint256 nonce = vault.allocationNonces(0);
        bytes32 digest = vault.hashAllocationAction(
            RoundPrizeVaultV4.AllocationAction.HOLD, 0, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(GLOBAL_ONE_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        address signer = vm.addr(GLOBAL_ONE_KEY);
        try vault.hold(0, deadline, signer, signature, signer, signature) {
            invalidTransitionSucceeded = true;
        } catch { }
    }

    function _control(RoundPrizeVaultV4.AllocationAction action) private {
        uint48 deadline = uint48(block.timestamp + 1 days);
        uint256 nonce = vault.allocationNonces(0);
        bytes32 digest = vault.hashAllocationAction(action, 0, nonce, deadline);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(GLOBAL_ONE_KEY, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(GLOBAL_TWO_KEY, digest);
        bytes memory signatureOne = abi.encodePacked(r1, s1, v1);
        bytes memory signatureTwo = abi.encodePacked(r2, s2, v2);
        address signerOne = vm.addr(GLOBAL_ONE_KEY);
        address signerTwo = vm.addr(GLOBAL_TWO_KEY);
        if (action == RoundPrizeVaultV4.AllocationAction.HOLD) {
            vault.hold(0, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
        } else if (action == RoundPrizeVaultV4.AllocationAction.UNHOLD) {
            vault.unhold(0, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
        } else {
            vault.reclaim(0, deadline, signerOne, signatureOne, signerTwo, signatureTwo);
        }
    }
}

contract RoundPrizeVaultV4InvariantTest is StdInvariant, Test {
    uint256 private constant LIABILITY = 10 ether;
    RoundPrizeVaultV4 private vault;
    V4VaultHandler private handler;
    V4InvariantFactory private factory;
    V4InvariantRound private round;
    bytes32 private nativeKey;
    address private winner;
    address private recoveryRecipient;

    function setUp() external {
        vm.chainId(31_337);
        factory = new V4InvariantFactory();
        round = new V4InvariantRound(address(factory));
        RoundPrizeVaultV4 implementation = new RoundPrizeVaultV4();
        vault = RoundPrizeVaultV4(payable(Clones.clone(address(implementation))));
        round.setVault(address(vault));

        winner = makeAddr("winner");
        recoveryRecipient = makeAddr("recovery");
        PrizeTypes.AllocationInput[] memory allocations = new PrizeTypes.AllocationInput[](1);
        allocations[0] =
            PrizeTypes.AllocationInput(0, PrizeTypes.AssetType.NATIVE, address(0), 0, LIABILITY);
        PrizeTypes.VaultConfig memory config = PrizeTypes.VaultConfig({
            recoveryRecipient: recoveryRecipient,
            claimPeriod: 5 minutes,
            recoveryDelay: 5 minutes,
            allocations: allocations
        });
        bytes32 planHash = keccak256(
            abi.encode(allocations, recoveryRecipient, config.claimPeriod, config.recoveryDelay)
        );
        factory.initialize(vault, address(round), planHash, config);
        factory.setGlobalAdmin(vm.addr(0xA11CE), true);
        factory.setGlobalAdmin(vm.addr(0xB0B), true);

        vm.deal(address(this), LIABILITY);
        vault.fundNative{ value: LIABILITY }();
        vault.seal();
        round.finalize(winner);
        nativeKey = vault.assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0);

        handler = new V4VaultHandler(vault, winner);
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = V4VaultHandler.hold.selector;
        selectors[1] = V4VaultHandler.unhold.selector;
        selectors[2] = V4VaultHandler.release.selector;
        selectors[3] = V4VaultHandler.reclaim.selector;
        selectors[4] = V4VaultHandler.attemptReleaseWhileHeld.selector;
        selectors[5] = V4VaultHandler.attemptDuplicateSignerControl.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariantHeldAllocationIsNeverTerminal() external {
        if (vault.isHeld(0)) {
            assertFalse(vault.getAllocation(0).claimed);
            assertFalse(vault.isReclaimed(0));
        }
    }

    function invariantTerminalStateOccursAtMostOnce() external {
        assertLe(handler.successfulTerminalTransitions(), 1);
        assertFalse(handler.invalidTransitionSucceeded());
    }

    function invariantPublicExecutionCannotRedirectRecipient() external {
        assertEq(address(handler).balance, 0);
        assertTrue(winner.balance == 0 || winner.balance == LIABILITY);
        assertTrue(recoveryRecipient.balance == 0 || recoveryRecipient.balance == LIABILITY);
        assertLe(winner.balance + recoveryRecipient.balance, LIABILITY);
    }

    function invariantLiabilityMatchesTerminalState() external {
        bool terminal = vault.getAllocation(0).claimed;
        assertEq(vault.liabilityByAsset(nativeKey), terminal ? 0 : LIABILITY);
        assertEq(address(vault).balance + winner.balance + recoveryRecipient.balance, LIABILITY);
    }

    function invariantControlNonceMatchesSuccessfulActions() external {
        assertEq(vault.allocationNonces(0), handler.successfulControls());
    }
}
