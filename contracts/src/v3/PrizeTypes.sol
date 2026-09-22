// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

library PrizeTypes {
    uint256 internal constant MAX_ALLOCATIONS = 64;

    enum AssetType {
        NATIVE,
        ERC20,
        ERC721,
        ERC1155
    }

    enum VaultState {
        FUNDING,
        SEALED,
        CANCELED
    }

    enum RecoveryKind {
        EXCESS,
        EXPIRED_ALLOCATION,
        UPDATE_RECOVERY_RECIPIENT
    }

    struct AllocationInput {
        uint8 winnerRank;
        AssetType assetType;
        address token;
        uint256 tokenId;
        uint256 amount;
    }

    struct Allocation {
        uint8 winnerRank;
        AssetType assetType;
        address token;
        uint256 tokenId;
        uint256 amount;
        bool claimed;
    }

    struct VaultConfig {
        address recoveryRecipient;
        uint48 claimPeriod;
        uint48 recoveryDelay;
        AllocationInput[] allocations;
    }

    struct RecoveryAction {
        RecoveryKind kind;
        AssetType assetType;
        address token;
        uint256 tokenId;
        uint256 amount;
        address recipient;
        uint256 allocationId;
        uint256 nonce;
        uint48 validAfter;
        uint48 deadline;
    }
}
