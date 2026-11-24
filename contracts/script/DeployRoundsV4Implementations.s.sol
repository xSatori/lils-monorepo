// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { RoundV4 } from "../src/v4/RoundV4.sol";
import { RoundPrizeVaultV4 } from "../src/v4/RoundPrizeVaultV4.sol";

/// @notice Deploys only the immutable v4 implementation pair.
/// @dev Registration is intentionally a separate global-admin transaction against the existing
/// append-only RoundFactoryV3. The CLI signer must match DISPOSABLE_DEPLOYER_ADDRESS.
contract DeployRoundsV4Implementations is Script {
    error UnsupportedChain(uint256 chainId);
    error InvalidDeployer();

    function run() external {
        if (block.chainid != 31_337 && block.chainid != 1_337 && block.chainid != 11_155_111) {
            revert UnsupportedChain(block.chainid);
        }
        address deployer = vm.envAddress("DISPOSABLE_DEPLOYER_ADDRESS");
        if (deployer == address(0)) revert InvalidDeployer();

        vm.startBroadcast(deployer);
        address roundImplementation = address(new RoundV4());
        address vaultImplementation = address(new RoundPrizeVaultV4());
        vm.stopBroadcast();

        console2.log("chain id", block.chainid);
        console2.log("round v4 implementation", roundImplementation);
        console2.log("prize vault v4 implementation", vaultImplementation);
        console2.log("implementation version", uint256(4));
    }
}
