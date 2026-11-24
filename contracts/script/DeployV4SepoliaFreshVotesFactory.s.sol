// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";

/// @notice Deploys fresh Sepolia voting-test dependencies and a factory bound to existing v4
/// implementations. This avoids reusing the owner of an earlier test voting token.
contract DeployV4SepoliaFreshVotesFactory is Script {
    uint256 internal constant CREATION_FEE = 100_000_000_000_000;

    error UnsupportedChain(uint256 chainId);
    error InvalidAddress();

    function run() external {
        if (block.chainid != 11_155_111) revert UnsupportedChain(block.chainid);

        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address globalAdmin1 = vm.envAddress("GLOBAL_ADMIN_1");
        address globalAdmin2 = vm.envAddress("GLOBAL_ADMIN_2");
        address treasury = vm.envAddress("SEPOLIA_TEST_TREASURY");
        address roundImplementation = vm.envAddress("ROUND_V4_IMPLEMENTATION");
        address vaultImplementation = vm.envAddress("VAULT_V4_IMPLEMENTATION");
        if (
            deployer == address(0) || globalAdmin1 == address(0) || globalAdmin2 == address(0)
                || treasury == address(0) || roundImplementation.code.length == 0
                || vaultImplementation.code.length == 0
        ) revert InvalidAddress();

        vm.startBroadcast(deployer);
        MockLilNounsVotes votes = new MockLilNounsVotes(deployer);
        LilNounsVotingPower adapter = new LilNounsVotingPower(address(votes));
        RoundFactoryV3 factory = new RoundFactoryV3(
            globalAdmin1,
            globalAdmin2,
            treasury,
            CREATION_FEE,
            roundImplementation,
            vaultImplementation,
            address(adapter),
            true
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("fresh mock voting token", address(votes));
        console2.log("fresh voting power adapter", address(adapter));
        console2.log("round v4 implementation", roundImplementation);
        console2.log("prize vault v4 implementation", vaultImplementation);
        console2.log("active v4 factory", address(factory));
    }
}
