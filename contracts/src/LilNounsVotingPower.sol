// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { ILilNounsVotes } from "./interfaces/ILilNounsVotes.sol";
import { IVotingPower } from "./interfaces/IVotingPower.sol";

contract LilNounsVotingPower is IVotingPower {
    error InvalidToken();
    error InvalidSnapshotBlock();

    ILilNounsVotes public immutable TOKEN;

    constructor(address token_) {
        if (token_ == address(0) || token_.code.length == 0) revert InvalidToken();
        TOKEN = ILilNounsVotes(token_);
    }

    function getPastVotes(address account, uint256 blockNumber) external view returns (uint256) {
        if (blockNumber >= block.number) revert InvalidSnapshotBlock();
        return TOKEN.getPriorVotes(account, blockNumber);
    }
}
