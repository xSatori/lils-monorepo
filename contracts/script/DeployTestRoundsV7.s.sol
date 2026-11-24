// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV7 } from "../src/v7/RoundV7.sol";
import { RoundPrizeVaultV7 } from "../src/v7/RoundPrizeVaultV7.sol";
import { RoundFactoryV7 } from "../src/v7/RoundFactoryV7.sol";

/// @notice Prepares a separate V7 factory; never upgrades an existing round.
contract DeployTestRoundsV7 is Script {
    uint256 internal constant INITIAL_CREATION_FEE = 0.01 ether;
    error UnsupportedChain(uint256 chainId);
    error InvalidDeployer();

    function run() external {
        if (block.chainid != 31_337 && block.chainid != 1_337 && block.chainid != 11_155_111) {
            revert UnsupportedChain(block.chainid);
        }
        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address globalAdmin1 = vm.envAddress("GLOBAL_ADMIN_1");
        address globalAdmin2 = vm.envAddress("GLOBAL_ADMIN_2");
        address votingPowerAdapter = vm.envAddress("V7_VOTING_POWER_ADAPTER");
        if (deployer == address(0)) revert InvalidDeployer();

        vm.startBroadcast(deployer);
        address roundImplementation = address(new RoundV7());
        address vaultImplementation = address(new RoundPrizeVaultV7());
        RoundFactoryV7 factory = new RoundFactoryV7(
            globalAdmin1,
            globalAdmin2,
            INITIAL_CREATION_FEE,
            roundImplementation,
            vaultImplementation,
            votingPowerAdapter,
            true
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("round v7 implementation", roundImplementation);
        console2.log("prize vault v7 implementation", vaultImplementation);
        console2.log("round factory v7", address(factory));
        console2.log("voting power adapter", votingPowerAdapter);
        console2.log("treasury", factory.treasury());
        console2.log("creation fee", factory.creationFee());
    }
}
