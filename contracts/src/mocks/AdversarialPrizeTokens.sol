// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract NoReturnERC20 {
    string public constant name = "No return";
    string public constant symbol = "NONE";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract RevertingERC20 {
    function balanceOf(address) external pure returns (uint256) {
        return 100 ether;
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert("transfer blocked");
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("transfer blocked");
    }
}

contract RevertingBalanceERC20 {
    function balanceOf(address) external pure returns (uint256) {
        revert("balance blocked");
    }

    function transfer(address, uint256) external pure returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }
}

contract BlacklistERC20 is ERC20 {
    mapping(address => bool) public blacklisted;
    constructor() ERC20("Blacklist", "BLOCK") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlacklisted(address account, bool blocked) external {
        blacklisted[account] = blocked;
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(!blacklisted[from] && !blacklisted[to], "blacklisted");
        super._update(from, to, amount);
    }
}

contract SenderSurchargeERC20 is ERC20 {
    constructor() ERC20("Sender surcharge", "SURCHARGE") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0), amount / 10);
        }
        super._update(from, to, amount);
    }
}

contract ExternallyMutableBalanceERC20 is ERC20 {
    constructor() ERC20("Externally mutable", "MUTATE") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burnFromAnywhere(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

contract NoOpOutboundERC721 is ERC721 {
    bool public noOp;
    constructor() ERC721("No-op NFT", "NONFT") { }

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function setNoOp(bool enabled) external {
        noOp = enabled;
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (noOp) return;
        super.transferFrom(from, to, tokenId);
    }
}

contract NoOpOutboundERC1155 is ERC1155 {
    bool public noOp;
    constructor() ERC1155("ipfs://noop/{id}") { }

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }

    function setNoOp(bool enabled) external {
        noOp = enabled;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        if (noOp) return;
        super.safeTransferFrom(from, to, id, amount, data);
    }
}

contract ReentrantERC20 is ERC20 {
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackAttempted;
    constructor() ERC20("Reentrant", "REENTER") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (callbackTarget != address(0)) {
            callbackAttempted = true;
            callbackTarget.call(callbackData);
        }
        return super.transferFrom(from, to, amount);
    }
}

contract MockERC1271Signer is IERC1271 {
    mapping(bytes32 => bool) public approved;
    bool public shouldRevert;

    function setApproved(bytes32 digest, bool value) external {
        approved[digest] = value;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function isValidSignature(bytes32 digest, bytes memory) external view returns (bytes4) {
        if (shouldRevert) revert("1271 revert");
        return approved[digest] ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract ForceEther {
    constructor() payable { }

    function force(address payable target) external {
        selfdestruct(target);
    }
}
