// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice Chain-gated 2-of-2 test authority. Never deployed on mainnet.
/// @dev Owners sign typed executions; vault signatures are two concatenated 65-byte ECDSA signatures.
contract SepoliaRoundTestAdmin is EIP712, IERC1271 {
    bytes32 private constant EXECUTE_TYPEHASH = keccak256(
        "Execute(address target,uint256 value,bytes32 dataHash,uint256 nonce,uint256 deadline)"
    );

    address public immutable ownerOne;
    address public immutable ownerTwo;
    uint256 public nonce;

    error TestChainOnly();
    error InvalidOwners();
    error InvalidSignatures();
    error Expired();
    error CallFailed(bytes returnData);

    event Executed(address indexed target, uint256 indexed nonce, uint256 value, bytes32 dataHash);

    constructor(address ownerOne_, address ownerTwo_) EIP712("LilNounsSepoliaRoundAdmin", "1") {
        if (block.chainid != 11_155_111 && block.chainid != 31_337 && block.chainid != 1_337) {
            revert TestChainOnly();
        }
        if (ownerOne_ == address(0) || ownerTwo_ == address(0) || ownerOne_ == ownerTwo_) {
            revert InvalidOwners();
        }
        ownerOne = ownerOne_;
        ownerTwo = ownerTwo_;
    }

    function hashExecution(address target, uint256 value, bytes calldata data, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(abi.encode(EXECUTE_TYPEHASH, target, value, keccak256(data), nonce, deadline))
        );
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 deadline,
        bytes calldata signatureOne,
        bytes calldata signatureTwo
    ) external returns (bytes memory result) {
        if (block.timestamp > deadline) revert Expired();
        uint256 currentNonce = nonce;
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(EXECUTE_TYPEHASH, target, value, keccak256(data), currentNonce, deadline)
            )
        );
        if (
            ECDSA.recover(digest, signatureOne) != ownerOne
                || ECDSA.recover(digest, signatureTwo) != ownerTwo
        ) revert InvalidSignatures();
        nonce = currentNonce + 1;
        (bool success, bytes memory returned) = target.call{ value: value }(data);
        if (!success) revert CallFailed(returned);
        emit Executed(target, currentNonce, value, keccak256(data));
        return returned;
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        if (signature.length != 130) return bytes4(0xffffffff);
        bytes memory first = new bytes(65);
        bytes memory second = new bytes(65);
        for (uint256 i; i < 65; ++i) {
            first[i] = signature[i];
            second[i] = signature[i + 65];
        }
        (address recoveredOne, ECDSA.RecoverError errorOne,) = ECDSA.tryRecover(hash, first);
        (address recoveredTwo, ECDSA.RecoverError errorTwo,) = ECDSA.tryRecover(hash, second);
        if (
            errorOne != ECDSA.RecoverError.NoError || errorTwo != ECDSA.RecoverError.NoError
                || recoveredOne != ownerOne || recoveredTwo != ownerTwo
        ) return bytes4(0xffffffff);
        return IERC1271.isValidSignature.selector;
    }

    receive() external payable { }
}
