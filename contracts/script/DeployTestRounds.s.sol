// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { Round } from "../src/Round.sol";
import { RoundFactory } from "../src/RoundFactory.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract DeployTestRounds is Script {
    uint256 internal constant CREATION_FEE = 100_000_000_000_000;

    error UnsupportedChain(uint256 chainId);
    error InvalidDeployer();

    function run()
        external
        returns (
            MockLilNounsVotes votingToken,
            LilNounsVotingPower votingPowerAdapter,
            Round implementation,
            RoundFactory factory
        )
    {
        if (block.chainid != 31_337 && block.chainid != 1_337 && block.chainid != 11_155_111) {
            revert UnsupportedChain(block.chainid);
        }

        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address globalAdmin1 = vm.envAddress("GLOBAL_ADMIN_1");
        address globalAdmin2 = vm.envAddress("GLOBAL_ADMIN_2");
        address treasury = vm.envAddress("SEPOLIA_TEST_TREASURY");
        if (deployer == address(0)) revert InvalidDeployer();

        // The signing account is supplied by the CLI's encrypted account/keystore option.
        // No private key is read, printed, serialized, or embedded by this script.
        vm.startBroadcast(deployer);
        votingToken = new MockLilNounsVotes(deployer);
        votingPowerAdapter = new LilNounsVotingPower(address(votingToken));
        implementation = new Round();
        factory = new RoundFactory(
            globalAdmin1,
            globalAdmin2,
            treasury,
            CREATION_FEE,
            address(implementation),
            address(votingPowerAdapter),
            true
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("mock voting token", address(votingToken));
        console2.log("voting power adapter", address(votingPowerAdapter));
        console2.log("round implementation", address(implementation));
        console2.log("round factory", address(factory));
        console2.log("creation fee", CREATION_FEE);
    }
}
