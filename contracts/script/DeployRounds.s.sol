// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {RoundsFactory} from "../src/RoundsFactory.sol";
import {RoundsRound} from "../src/RoundsRound.sol";

contract DeployRounds is Script {
    function run() external returns (RoundsRound implementation, RoundsFactory factory) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address globalAdmin = vm.envAddress("ROUNDS_GLOBAL_ADMIN");
        address feeRecipient = vm.envAddress("ROUNDS_FEE_RECIPIENT");
        uint256 requiredChainId = vm.envUint("ROUNDS_REQUIRED_CHAIN_ID");

        vm.startBroadcast(deployerPrivateKey);
        implementation = new RoundsRound();
        factory = new RoundsFactory(globalAdmin, feeRecipient, address(implementation), requiredChainId);
        vm.stopBroadcast();

        console2.log("RoundsRound implementation:", address(implementation));
        console2.log("RoundsFactory:", address(factory));
        console2.log("Required chain id:", requiredChainId);
        console2.log("Global admin:", globalAdmin);
        console2.log("Fee recipient:", feeRecipient);
    }
}
