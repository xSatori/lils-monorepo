// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { RoundFactoryRelease010 } from "../src/0.1.0/RoundFactoryRelease010.sol";
import { RoundPrizeVaultRelease010 } from "../src/0.1.0/RoundPrizeVaultRelease010.sol";
import { RoundRelease010 } from "../src/0.1.0/RoundRelease010.sol";
import { SepoliaRoundTestAdmin } from "../src/0.1.0/SepoliaRoundTestAdmin.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";

contract RoundsRelease010AdminTest is Test {
    uint256 private constant OWNER_ONE_KEY = 0xA11CE;
    uint256 private constant OWNER_TWO_KEY = 0xB0B;
    address private constant MAINNET_ADMIN = 0xeE09d7138B34EAC649ff0CEBE43f258464537701;

    SepoliaRoundTestAdmin private admin;
    RoundFactoryRelease010 private factory;

    function setUp() external {
        vm.chainId(31_337);
        admin = new SepoliaRoundTestAdmin(vm.addr(OWNER_ONE_KEY), vm.addr(OWNER_TWO_KEY));
        factory = new RoundFactoryRelease010(
            address(admin),
            0.01 ether,
            address(new RoundRelease010()),
            address(new RoundPrizeVaultRelease010()),
            address(new LilNounsVotingPower(address(new MockLilNounsVotes(address(this))))),
            true
        );
    }

    function testOnlyTwoOfTwoContractCanChangeFeeAndPause() external {
        assertEq(factory.globalAdmin(), address(admin));
        assertTrue(factory.isGlobalAdmin(address(admin)));
        assertFalse(factory.isGlobalAdmin(vm.addr(OWNER_ONE_KEY)));
        vm.prank(vm.addr(OWNER_ONE_KEY));
        vm.expectRevert(RoundFactoryRelease010.NotGlobalAdmin.selector);
        factory.setCreationFee(0.02 ether);

        bytes memory callData = abi.encodeCall(factory.setCreationFee, (0.02 ether));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = admin.hashExecution(address(factory), 0, callData, deadline);
        (bytes memory first, bytes memory second) = _signBoth(digest);
        admin.execute(address(factory), 0, callData, deadline, first, second);
        assertEq(factory.creationFee(), 0.02 ether);

        vm.expectRevert();
        admin.execute(address(factory), 0, callData, deadline, first, second);

        callData = abi.encodeCall(factory.setPaused, (true));
        digest = admin.hashExecution(address(factory), 0, callData, deadline);
        (first, second) = _signBoth(digest);
        admin.execute(address(factory), 0, callData, deadline, first, second);
        assertTrue(factory.paused());
    }

    function testERC1271RequiresBothDistinctOwners() external {
        bytes32 digest = keccak256("vault action");
        (bytes memory first, bytes memory second) = _signBoth(digest);
        assertEq(
            admin.isValidSignature(digest, bytes.concat(first, second)),
            IERC1271.isValidSignature.selector
        );
        assertEq(admin.isValidSignature(digest, bytes.concat(first, first)), bytes4(0xffffffff));
        assertEq(admin.isValidSignature(digest, bytes.concat(second, first)), bytes4(0xffffffff));
        assertEq(admin.isValidSignature(digest, hex"deadbeef"), bytes4(0xffffffff));
    }

    function testMainnetAdminCannotBeOverriddenByConstructor() external {
        vm.chainId(1);
        vm.etch(MAINNET_ADMIN, hex"60006000f3");
        address roundImplementation = address(new RoundRelease010());
        address vaultImplementation = address(new RoundPrizeVaultRelease010());
        address adapter = factory.votingPowerAdapter();
        vm.expectRevert(RoundFactoryRelease010.InvalidAddress.selector);
        new RoundFactoryRelease010(
            address(admin), 0.01 ether, roundImplementation, vaultImplementation, adapter, false
        );
        RoundFactoryRelease010 mainnet = new RoundFactoryRelease010(
            address(0), 0.01 ether, roundImplementation, vaultImplementation, adapter, false
        );
        assertEq(mainnet.globalAdmin(), MAINNET_ADMIN);
        assertTrue(mainnet.isGlobalAdmin(MAINNET_ADMIN));
    }

    function _signBoth(bytes32 digest)
        private
        pure
        returns (bytes memory first, bytes memory second)
    {
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(OWNER_ONE_KEY, digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(OWNER_TWO_KEY, digest);
        first = abi.encodePacked(r1, s1, v1);
        second = abi.encodePacked(r2, s2, v2);
    }
}
