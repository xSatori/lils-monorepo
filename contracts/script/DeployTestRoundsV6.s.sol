// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV6 } from "../src/v6/RoundV6.sol";
import { RoundPrizeVaultV6 } from "../src/v6/RoundPrizeVaultV6.sol";
import { RoundFactoryV6 } from "../src/v6/RoundFactoryV6.sol";

/// @notice Prepares a separate V6 factory; never upgrades an existing V5 round.
contract DeployTestRoundsV6 is Script {
    uint256 internal constant CREATION_FEE = 100_000_000_000_000;

    error UnsupportedChain(uint256 chainId);
    error InvalidDeployer();

    function run() external {
        if (block.chainid != 31_337 && block.chainid != 1_337 && block.chainid != 11_155_111) {
            revert UnsupportedChain(block.chainid);
        }
        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address globalAdmin1 = vm.envAddress("GLOBAL_ADMIN_1");
        address globalAdmin2 = vm.envAddress("GLOBAL_ADMIN_2");
        address treasury = vm.envAddress("SEPOLIA_TEST_TREASURY");
        address votingPowerAdapter = vm.envAddress("V6_VOTING_POWER_ADAPTER");
        if (deployer == address(0)) revert InvalidDeployer();

        vm.startBroadcast(deployer);
        address roundImplementation = address(new RoundV6());
        address vaultImplementation = address(new RoundPrizeVaultV6());
        address factory = address(
            new RoundFactoryV6(
                globalAdmin1,
                globalAdmin2,
                treasury,
                CREATION_FEE,
                roundImplementation,
                vaultImplementation,
                votingPowerAdapter,
                true
            )
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("round v6 implementation", roundImplementation);
        console2.log("prize vault v6 implementation", vaultImplementation);
        console2.log("round factory v6", factory);
        console2.log("voting power adapter", votingPowerAdapter);
        console2.log("creation fee", CREATION_FEE);
    }
}
