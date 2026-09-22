// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockPrizeERC20 is ERC20 {
    constructor() ERC20("Sepolia Round Prize", "SRP") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockPrizeERC721 is ERC721 {
    uint256 private _nextId;
    constructor() ERC721("Sepolia Round Prize NFT", "SRPNFT") { }

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = ++_nextId;
        _mint(to, tokenId);
    }
}

contract MockPrizeERC1155 is ERC1155 {
    constructor() ERC1155("ipfs://sepolia-round-prizes/{id}.json") { }

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}
