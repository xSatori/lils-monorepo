// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { PrizeTypes } from "../v3/PrizeTypes.sol";

interface IRoundPrizeVault {
    function initialize(
        address factory,
        address round,
        bool testMode,
        bytes32 prizePlanHash,
        PrizeTypes.VaultConfig calldata config
    ) external;

    function implementationVersion() external pure returns (uint32);
    function initializerSelector() external pure returns (bytes4);
    function isReadyForSubmissions() external view returns (bool);
}
