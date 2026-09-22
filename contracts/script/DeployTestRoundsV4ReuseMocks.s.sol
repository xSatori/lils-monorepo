// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV4 } from "../src/v4/RoundV4.sol";
import { RoundPrizeVaultV4 } from "../src/v4/RoundPrizeVaultV4.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";

/// @notice Sepolia extension deployment that reuses the already deployed v3 test-only voting mock
/// and adapter. It deploys a fresh immutable v4 pair and factory; it cannot target mainnet.
contract DeployTestRoundsV4ReuseMocks is Script {
    uint256 internal constant CREATION_FEE = 100_000_000_000_000;

    error UnsupportedChain(uint256 chainId);
    error InvalidAddress();

    function run() external {
        if (block.chainid != 31_337 && block.chainid != 1_337 && block.chainid != 11_155_111) {
            revert UnsupportedChain(block.chainid);
        }

        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address globalAdmin1 = vm.envAddress("GLOBAL_ADMIN_1");
        address globalAdmin2 = vm.envAddress("GLOBAL_ADMIN_2");
        address treasury = vm.envAddress("SEPOLIA_TEST_TREASURY");
        address votingPowerAdapter = vm.envAddress("SEPOLIA_VOTING_POWER_ADAPTER");
        if (
            deployer == address(0) || globalAdmin1 == address(0) || globalAdmin2 == address(0)
                || treasury == address(0) || votingPowerAdapter.code.length == 0
        ) revert InvalidAddress();

        vm.startBroadcast(deployer);
        address roundImplementation = address(new RoundV4());
        address vaultImplementation = address(new RoundPrizeVaultV4());
        address factory = address(
            new RoundFactoryV3(
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
        console2.log("reused voting power adapter", votingPowerAdapter);
        console2.log("round v4 implementation", roundImplementation);
        console2.log("prize vault v4 implementation", vaultImplementation);
        console2.log("round factory v3 (active v4)", factory);
        console2.log("creation fee", CREATION_FEE);
    }
}
