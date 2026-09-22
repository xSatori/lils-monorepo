// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV4 } from "../src/v4/RoundV4.sol";
import { RoundPrizeVaultV4 } from "../src/v4/RoundPrizeVaultV4.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import {
    MockPrizeERC20,
    MockPrizeERC721,
    MockPrizeERC1155
} from "../src/mocks/MockPrizeAssets.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

contract DeployTestRoundsV4 is Script {
    uint256 internal constant CREATION_FEE = 100_000_000_000_000;

    error UnsupportedChain(uint256 chainId);
    error InvalidDeployer();

    struct DeploymentAddresses {
        address votingToken;
        address votingPowerAdapter;
        address prizeERC20;
        address prizeERC721;
        address prizeERC1155;
        address roundImplementation;
        address vaultImplementation;
        address factory;
    }

    function run() external {
        if (block.chainid != 31_337 && block.chainid != 1_337 && block.chainid != 11_155_111) {
            revert UnsupportedChain(block.chainid);
        }

        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        address globalAdmin1 = vm.envAddress("GLOBAL_ADMIN_1");
        address globalAdmin2 = vm.envAddress("GLOBAL_ADMIN_2");
        address treasury = vm.envAddress("SEPOLIA_TEST_TREASURY");
        if (deployer == address(0)) revert InvalidDeployer();

        // The CLI supplies the encrypted keystore account. No secret is read or logged here.
        DeploymentAddresses memory deployed;
        vm.startBroadcast(deployer);
        deployed.votingToken = address(new MockLilNounsVotes(deployer));
        deployed.votingPowerAdapter = address(new LilNounsVotingPower(deployed.votingToken));
        deployed.prizeERC20 = address(new MockPrizeERC20());
        deployed.prizeERC721 = address(new MockPrizeERC721());
        deployed.prizeERC1155 = address(new MockPrizeERC1155());
        deployed.roundImplementation = address(new RoundV4());
        deployed.vaultImplementation = address(new RoundPrizeVaultV4());
        deployed.factory = address(
            new RoundFactoryV3(
                globalAdmin1,
                globalAdmin2,
                treasury,
                CREATION_FEE,
                deployed.roundImplementation,
                deployed.vaultImplementation,
                deployed.votingPowerAdapter,
                true
            )
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("mock voting token", deployed.votingToken);
        console2.log("voting power adapter", deployed.votingPowerAdapter);
        console2.log("mock prize ERC20", deployed.prizeERC20);
        console2.log("mock prize ERC721", deployed.prizeERC721);
        console2.log("mock prize ERC1155", deployed.prizeERC1155);
        console2.log("round v4 implementation", deployed.roundImplementation);
        console2.log("prize vault v4 implementation", deployed.vaultImplementation);
        console2.log("round factory v3 (active v4)", deployed.factory);
        console2.log("creation fee", CREATION_FEE);
    }
}
