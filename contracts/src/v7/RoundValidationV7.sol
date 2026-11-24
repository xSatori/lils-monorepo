// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { RoundTypes } from "../RoundTypes.sol";

library RoundValidationV7 {
    uint256 internal constant MAX_METADATA_URI_BYTES = 512;
    uint16 internal constant MAX_SUBMISSIONS = 1000;
    uint16 internal constant MAX_SUBMISSIONS_PER_WALLET = 10;
    uint8 internal constant MAX_WINNERS = 20;
    uint32 internal constant MAX_TEXT_LENGTH = 20_000;

    error InvalidAddress();
    error InvalidMetadata();
    error InvalidSchedule();
    error InvalidVotingConfiguration();
    error InvalidSubmissionConfiguration();
    error InvalidWinnerCount();
    error InvalidSnapshot();

    function validate(RoundTypes.RoundConfig calldata config) internal view {
        if (
            config.roundStart > config.submissionsOpen
                || config.submissionsOpen >= config.submissionsClose
                || config.submissionsClose >= config.votingStart
                || config.votingStart >= config.votingEnd || config.votingEnd <= block.timestamp
        ) revert InvalidSchedule();
        _validateCommon(config);
    }

    /// @notice V7 rounds are created without a schedule and may only schedule after vault sealing.
    function validateUnscheduled(RoundTypes.RoundConfig calldata config) internal view {
        if (
            config.roundStart != 0 || config.submissionsOpen != 0 || config.submissionsClose != 0
                || config.votingStart != 0 || config.votingEnd != 0
        ) revert InvalidSchedule();
        _validateCommon(config);
    }

    function _validateCommon(RoundTypes.RoundConfig calldata config) private view {
        uint256 uriLength = bytes(config.metadataURI).length;
        if (
            uriLength == 0 || uriLength > MAX_METADATA_URI_BYTES
                || !isContentAddressedURI(config.metadataURI) || config.metadataHash == bytes32(0)
        ) revert InvalidMetadata();
        if (config.votingPowerAdapter == address(0) || config.votingPowerAdapter.code.length == 0) {
            revert InvalidAddress();
        }
        if (config.maxVotesPerSubmission == 0) revert InvalidVotingConfiguration();
        if (
            config.votingStrategy == RoundTypes.VotingStrategy.FIXED_PER_ELIGIBLE_WALLET
                && config.baseOrFixedVotes == 0
        ) revert InvalidVotingConfiguration();
        if (
            config.snapshotMode == RoundTypes.SnapshotMode.CUSTOM_BLOCK
                && (config.customSnapshotBlock == 0 || config.customSnapshotBlock >= block.number)
        ) revert InvalidSnapshot();
        if (
            config.maxSubmissions == 0 || config.maxSubmissions > MAX_SUBMISSIONS
                || config.maxSubmissionsPerWallet == 0
                || config.maxSubmissionsPerWallet > MAX_SUBMISSIONS_PER_WALLET
                || config.maxSubmissionsPerWallet > config.maxSubmissions
        ) revert InvalidSubmissionConfiguration();
        if (
            config.winnerCount == 0 || config.winnerCount > MAX_WINNERS
                || config.winnerCount > config.maxSubmissions
        ) revert InvalidWinnerCount();
        if (
            config.minTitleLength == 0 || config.minTitleLength > config.maxTitleLength
                || config.maxTitleLength > MAX_TEXT_LENGTH || config.minDescriptionLength == 0
                || config.minDescriptionLength > config.maxDescriptionLength
                || config.maxDescriptionLength > MAX_TEXT_LENGTH
        ) revert InvalidSubmissionConfiguration();
    }

    function isContentAddressedURI(string calldata uri) internal pure returns (bool) {
        bytes calldata value = bytes(uri);
        if (value.length > 7) {
            bool isIpfs = value[0] == 0x69 && value[1] == 0x70 && value[2] == 0x66
                && value[3] == 0x73 && value[4] == 0x3a && value[5] == 0x2f && value[6] == 0x2f;
            if (isIpfs) return true;
        }
        return value.length > 5 && value[0] == 0x61 && value[1] == 0x72 && value[2] == 0x3a
            && value[3] == 0x2f && value[4] == 0x2f;
    }
}
