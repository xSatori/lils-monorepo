// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

interface IRoundPrizeView {
    function factory() external view returns (address);
    function prizeVault() external view returns (address);
    function submissionsOpen() external view returns (uint40);
    function votingStart() external view returns (uint40);
    function finalized() external view returns (bool);
    function finalizedAt() external view returns (uint40);
    function winnerCount() external view returns (uint8);
    function winnerAddress(uint256 rank) external view returns (address);
    function isRoundAdmin(address account) external view returns (bool);
    function isRecoveryAdmin(address account) external view returns (bool);
}
