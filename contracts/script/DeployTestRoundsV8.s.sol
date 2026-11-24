// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV8 } from "../src/v8/RoundV8.sol";
import { RoundPrizeVaultV8 } from "../src/v8/RoundPrizeVaultV8.sol";
import { RoundFactoryV8 } from "../src/v8/RoundFactoryV8.sol";
import { SepoliaRoundTestAdmin } from "../src/v8/SepoliaRoundTestAdmin.sol";

/// @notice A new V8 factory and 2-of-2 test authority; no existing clone is upgraded.
contract DeployTestRoundsV8 is Script {
    uint256 internal constant INITIAL_CREATION_FEE = 0.01 ether;
    error UnsupportedChain(uint256 chainId);
    error InvalidDeployer();

    function run() external {
        if (block.chainid != 11_155_111) revert UnsupportedChain(block.chainid);
        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address ownerOne = vm.envAddress("GLOBAL_ADMIN_1");
        address ownerTwo = vm.envAddress("GLOBAL_ADMIN_2");
        address votingPowerAdapter = vm.envAddress("V8_VOTING_POWER_ADAPTER");
        if (deployer == address(0) || ownerOne == address(0) || ownerTwo == address(0)) {
            revert InvalidDeployer();
        }

        vm.startBroadcast(deployer);
        SepoliaRoundTestAdmin testAdmin = new SepoliaRoundTestAdmin(ownerOne, ownerTwo);
        address roundImplementation = address(new RoundV8());
        address vaultImplementation = address(new RoundPrizeVaultV8());
        RoundFactoryV8 factory = new RoundFactoryV8(
            address(testAdmin),
            INITIAL_CREATION_FEE,
            roundImplementation,
            vaultImplementation,
            votingPowerAdapter,
            true
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("test admin", address(testAdmin));
        console2.log("round v8 implementation", roundImplementation);
        console2.log("prize vault v8 implementation", vaultImplementation);
        console2.log("round factory v8", address(factory));
        console2.log("voting power adapter", votingPowerAdapter);
        console2.log("treasury", factory.treasury());
        console2.log("creation fee", factory.creationFee());
    }
}
