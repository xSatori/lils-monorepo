// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV5 } from "../src/v5/RoundV5.sol";
import { RoundPrizeVaultV5 } from "../src/v5/RoundPrizeVaultV5.sol";
import { RoundFactoryV3 } from "../src/v3/RoundFactoryV3.sol";
import { MockLilNounsVotes } from "../src/mocks/MockLilNounsVotes.sol";
import {
    MockPrizeERC20,
    MockPrizeERC721,
    MockPrizeERC1155
} from "../src/mocks/MockPrizeAssets.sol";
import { LilNounsVotingPower } from "../src/LilNounsVotingPower.sol";

/// @notice Deploys an isolated local/Sepolia test stack with immutable v5 media support.
contract DeployTestRoundsV5 is Script {
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
        if (deployer == address(0)) revert InvalidDeployer();

        vm.startBroadcast(deployer);
        address votingToken = address(new MockLilNounsVotes(deployer));
        address adapter = address(new LilNounsVotingPower(votingToken));
        address prizeERC20 = address(new MockPrizeERC20());
        address prizeERC721 = address(new MockPrizeERC721());
        address prizeERC1155 = address(new MockPrizeERC1155());
        address roundImplementation = address(new RoundV5());
        address vaultImplementation = address(new RoundPrizeVaultV5());
        address factory = address(
            new RoundFactoryV3(
                globalAdmin1,
                globalAdmin2,
                treasury,
                CREATION_FEE,
                roundImplementation,
                vaultImplementation,
                adapter,
                true
            )
        );
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("mock voting token", votingToken);
        console2.log("voting power adapter", adapter);
        console2.log("mock prize ERC20", prizeERC20);
        console2.log("mock prize ERC721", prizeERC721);
        console2.log("mock prize ERC1155", prizeERC1155);
        console2.log("round v5 implementation", roundImplementation);
        console2.log("prize vault v5 implementation", vaultImplementation);
        console2.log("round factory v3 (active v5)", factory);
        console2.log("creation fee", CREATION_FEE);
    }
}
