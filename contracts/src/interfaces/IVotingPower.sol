// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

interface IVotingPower {
    function getPastVotes(address account, uint256 blockNumber) external view returns (uint256);
}
