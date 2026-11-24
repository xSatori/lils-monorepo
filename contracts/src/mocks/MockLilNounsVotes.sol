// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ILilNounsVotes } from "../interfaces/ILilNounsVotes.sol";

contract MockLilNounsVotes is Ownable, ILilNounsVotes {
    struct Checkpoint {
        uint32 fromBlock;
        uint96 votes;
    }

    mapping(address => uint96) public balanceOf;
    mapping(address => address) public delegates;
    mapping(address => Checkpoint[]) private _checkpoints;

    event Minted(address indexed account, uint96 amount);
    event DelegateChanged(address indexed delegator, address indexed from, address indexed to);

    constructor(address owner_) Ownable(owner_) { }

    function mint(address account, uint96 amount) external onlyOwner {
        require(account != address(0) && amount != 0, "invalid mint");
        balanceOf[account] += amount;
        address delegatee = delegates[account];
        if (delegatee != address(0)) _moveVotes(address(0), delegatee, amount);
        emit Minted(account, amount);
    }

    function delegate(address delegatee) external {
        require(delegatee != address(0), "invalid delegate");
        address previous = delegates[msg.sender];
        delegates[msg.sender] = delegatee;
        _moveVotes(previous, delegatee, balanceOf[msg.sender]);
        emit DelegateChanged(msg.sender, previous, delegatee);
    }

    function getCurrentVotes(address account) external view returns (uint96) {
        uint256 length = _checkpoints[account].length;
        return length == 0 ? 0 : _checkpoints[account][length - 1].votes;
    }

    function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96) {
        require(blockNumber < block.number, "block not final");
        Checkpoint[] storage checkpoints = _checkpoints[account];
        uint256 length = checkpoints.length;
        if (length == 0 || checkpoints[0].fromBlock > blockNumber) return 0;
        if (checkpoints[length - 1].fromBlock <= blockNumber) return checkpoints[length - 1].votes;

        uint256 low;
        uint256 high = length - 1;
        while (high > low) {
            uint256 mid = high - (high - low) / 2;
            if (checkpoints[mid].fromBlock == blockNumber) return checkpoints[mid].votes;
            if (checkpoints[mid].fromBlock < blockNumber) low = mid;
            else high = mid - 1;
        }
        return checkpoints[low].votes;
    }

    function _moveVotes(address from, address to, uint96 amount) private {
        if (amount == 0 || from == to) return;
        if (from != address(0)) _writeCheckpoint(from, _latestVotes(from) - amount);
        if (to != address(0)) _writeCheckpoint(to, _latestVotes(to) + amount);
    }

    function _latestVotes(address account) private view returns (uint96) {
        uint256 length = _checkpoints[account].length;
        return length == 0 ? 0 : _checkpoints[account][length - 1].votes;
    }

    function _writeCheckpoint(address account, uint96 votes) private {
        Checkpoint[] storage checkpoints = _checkpoints[account];
        uint32 currentBlock = uint32(block.number);
        uint256 length = checkpoints.length;
        if (length != 0 && checkpoints[length - 1].fromBlock == currentBlock) {
            checkpoints[length - 1].votes = votes;
        } else {
            checkpoints.push(Checkpoint({ fromBlock: currentBlock, votes: votes }));
        }
    }
}
