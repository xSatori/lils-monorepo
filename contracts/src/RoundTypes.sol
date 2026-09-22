// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

library RoundTypes {
    enum VotingStrategy {
        ONE_PER_ELIGIBLE_WALLET,
        ONE_PER_NFT_VOTE,
        FIXED_PER_ELIGIBLE_WALLET,
        BASE_PLUS_VOTING_POWER
    }

    enum SnapshotMode {
        VOTING_START,
        CUSTOM_BLOCK
    }

    enum SubmissionType {
        PROJECT,
        TRAIT,
        OTHER
    }

    enum SubmissionStatus {
        PENDING,
        APPROVED,
        REJECTED,
        HIDDEN
    }

    enum LifecycleState {
        UPCOMING,
        SUBMISSIONS_OPEN,
        MODERATION_PENDING,
        VOTING_OPEN,
        ENDED,
        FINALIZED,
        ARCHIVED
    }

    struct RoundConfig {
        string metadataURI;
        bytes32 metadataHash;
        uint40 roundStart;
        uint40 submissionsOpen;
        uint40 submissionsClose;
        uint40 votingStart;
        uint40 votingEnd;
        address votingPowerAdapter;
        VotingStrategy votingStrategy;
        SnapshotMode snapshotMode;
        uint64 customSnapshotBlock;
        uint96 baseOrFixedVotes;
        uint96 maxVotesPerSubmission;
        uint16 maxSubmissionsPerWallet;
        uint16 maxSubmissions;
        uint8 winnerCount;
        uint32 minTitleLength;
        uint32 maxTitleLength;
        uint32 minDescriptionLength;
        uint32 maxDescriptionLength;
    }
}
