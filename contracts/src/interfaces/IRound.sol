// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { RoundTypes } from "../RoundTypes.sol";

interface IRound {
    function initialize(
        address factory,
        address creator,
        uint32 deployedVersion,
        bytes32 configurationHash,
        RoundTypes.RoundConfig calldata config
    ) external;

    function implementationVersion() external pure returns (uint32);

    function initializerSelector() external pure returns (bytes4);
}
