// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IRoundV3 } from "../interfaces/IRoundV3.sol";
import { IRoundPrizeVault } from "../interfaces/IRoundPrizeVault.sol";
import { IVotingPower } from "../interfaces/IVotingPower.sol";
import { RoundTypes } from "../RoundTypes.sol";
import { RoundValidation } from "../RoundValidation.sol";

/// @notice Version-four round. V1-v3 remain untouched for deployment reproducibility.
contract RoundV4 is IRoundV3, Initializable, ReentrancyGuard, AccessControl {
    using SafeCast for uint256;

    uint256 public constant MAX_METADATA_URI_BYTES = 512;
    uint256 public constant MAX_VOTE_BATCH = 50;
    bytes32 public constant ROUND_ADMIN_ROLE = keccak256("ROUND_ADMIN_ROLE");

    struct Submission {
        address owner;
        RoundTypes.SubmissionType submissionType;
        RoundTypes.SubmissionStatus status;
        uint40 createdAt;
        uint32 titleLength;
        uint32 descriptionLength;
        bytes32 titleHash;
        bytes32 descriptionHash;
        string metadataURI;
        bytes32 metadataHash;
    }

    error InvalidAddress();
    error InvalidMetadata();
    error NotCreator();
    error NotRoundAdmin();
    error InvalidPhase();
    error InvalidSubmission();
    error SubmissionLimitReached();
    error SnapshotPending();
    error SnapshotAlreadyCaptured();
    error NoVotingPower();
    error InvalidAllocation();
    error DuplicateSubmission();
    error SelfVote();
    error VoteLimitExceeded();
    error PerSubmissionCapExceeded();
    error NotFinalizable();
    error PrizeVaultNotReady();

    address public factory;
    address public creator;
    address public prizeVault;
    uint32 public deployedImplementationVersion;
    bytes32 public configurationHash;
    bytes32 public prizePlanHash;
    uint40 public creationTimestamp;
    uint40 public finalizedAt;

    string public metadataURI;
    bytes32 public metadataHash;
    uint40 public roundStart;
    uint40 public submissionsOpen;
    uint40 public submissionsClose;
    uint40 public votingStart;
    uint40 public votingEnd;
    IVotingPower public votingPowerAdapter;
    RoundTypes.VotingStrategy public votingStrategy;
    RoundTypes.SnapshotMode public snapshotMode;
    uint64 public configuredSnapshotBlock;
    uint64 public snapshotBlock;
    uint96 public baseOrFixedVotes;
    uint96 public maxVotesPerSubmission;
    uint16 public maxSubmissionsPerWallet;
    uint16 public maxSubmissions;
    uint8 public winnerCount;
    uint32 public minTitleLength;
    uint32 public maxTitleLength;
    uint32 public minDescriptionLength;
    uint32 public maxDescriptionLength;

    bool public snapshotCaptured;
    bool public finalized;
    bool public archived;
    uint256 public submissionCount;
    uint256 public roundAdminCount;

    mapping(address => uint256) public submissionsByWallet;
    mapping(address => uint40) public roundAdminGrantedAt;
    mapping(uint256 => Submission) private _submissions;
    mapping(address => uint256) public usedVotes;
    mapping(address => mapping(uint256 => uint256)) public voterSubmissionVotes;
    mapping(uint256 => uint256) public submissionVoteTotals;
    uint256[] private _winners;

    event Initialized(
        address indexed factory,
        address indexed creator,
        address indexed prizeVault,
        uint32 implementationVersion,
        bytes32 configurationHash,
        bytes32 prizePlanHash
    );
    event RoundMetadataUpdated(string metadataURI, bytes32 indexed metadataHash);
    event RoundAdminGranted(address indexed account, address indexed creator);
    event RoundAdminRevoked(address indexed account, address indexed creator);
    event SubmissionCreated(
        uint256 indexed submissionId,
        address indexed owner,
        RoundTypes.SubmissionType indexed submissionType,
        bytes32 titleHash,
        bytes32 descriptionHash,
        uint32 titleLength,
        uint32 descriptionLength,
        string metadataURI,
        bytes32 metadataHash
    );
    event SubmissionModerated(
        uint256 indexed submissionId,
        RoundTypes.SubmissionStatus indexed previousStatus,
        RoundTypes.SubmissionStatus indexed newStatus,
        address moderator
    );
    event SnapshotCaptured(uint64 indexed snapshotBlock, address indexed caller);
    event VotesCast(
        address indexed voter,
        uint256 indexed submissionId,
        uint256 amount,
        uint256 voterSubmissionTotal,
        uint256 submissionTotal
    );
    event Finalized(address indexed caller, uint256[] winnerIds);
    event Archived(address indexed caller);

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    modifier onlyRoundAdmin() {
        if (!hasRole(ROUND_ADMIN_ROLE, msg.sender)) revert NotRoundAdmin();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function implementationVersion() external pure override returns (uint32) {
        return 4;
    }

    function initializerSelector() external pure override returns (bytes4) {
        return IRoundV3.initialize.selector;
    }

    function initialize(
        address factory_,
        address creator_,
        address prizeVault_,
        uint32 implementationVersion_,
        bytes32 configurationHash_,
        bytes32 prizePlanHash_,
        RoundTypes.RoundConfig calldata config
    ) external override initializer {
        if (
            factory_ == address(0) || creator_ == address(0) || prizeVault_ == address(0)
                || prizeVault_.code.length == 0 || msg.sender != factory_
        ) revert InvalidAddress();
        RoundValidation.validate(config);

        factory = factory_;
        creator = creator_;
        prizeVault = prizeVault_;
        deployedImplementationVersion = implementationVersion_;
        configurationHash = configurationHash_;
        prizePlanHash = prizePlanHash_;
        creationTimestamp = uint40(block.timestamp);
        metadataURI = config.metadataURI;
        metadataHash = config.metadataHash;
        roundStart = config.roundStart;
        submissionsOpen = config.submissionsOpen;
        submissionsClose = config.submissionsClose;
        votingStart = config.votingStart;
        votingEnd = config.votingEnd;
        votingPowerAdapter = IVotingPower(config.votingPowerAdapter);
        votingStrategy = config.votingStrategy;
        snapshotMode = config.snapshotMode;
        configuredSnapshotBlock = config.customSnapshotBlock;
        baseOrFixedVotes = config.baseOrFixedVotes;
        maxVotesPerSubmission = config.maxVotesPerSubmission;
        maxSubmissionsPerWallet = config.maxSubmissionsPerWallet;
        maxSubmissions = config.maxSubmissions;
        winnerCount = config.winnerCount;
        minTitleLength = config.minTitleLength;
        maxTitleLength = config.maxTitleLength;
        minDescriptionLength = config.minDescriptionLength;
        maxDescriptionLength = config.maxDescriptionLength;

        _grantRole(ROUND_ADMIN_ROLE, creator_);
        roundAdminGrantedAt[creator_] = uint40(block.timestamp);
        roundAdminCount = 1;
        if (config.snapshotMode == RoundTypes.SnapshotMode.CUSTOM_BLOCK) {
            snapshotBlock = config.customSnapshotBlock;
            snapshotCaptured = true;
            emit SnapshotCaptured(snapshotBlock, msg.sender);
        }

        emit RoundAdminGranted(creator_, creator_);
        emit Initialized(
            factory_,
            creator_,
            prizeVault_,
            implementationVersion_,
            configurationHash_,
            prizePlanHash_
        );
    }

    function lifecycleState() external view returns (RoundTypes.LifecycleState) {
        if (archived) return RoundTypes.LifecycleState.ARCHIVED;
        if (finalized) return RoundTypes.LifecycleState.FINALIZED;
        if (block.timestamp < submissionsOpen) return RoundTypes.LifecycleState.UPCOMING;
        if (block.timestamp < submissionsClose) return RoundTypes.LifecycleState.SUBMISSIONS_OPEN;
        if (block.timestamp < votingStart) return RoundTypes.LifecycleState.MODERATION_PENDING;
        if (block.timestamp < votingEnd) return RoundTypes.LifecycleState.VOTING_OPEN;
        return RoundTypes.LifecycleState.ENDED;
    }

    function updateRoundMetadata(string calldata uri, bytes32 contentHash) external onlyRoundAdmin {
        if (block.timestamp >= submissionsOpen) revert InvalidPhase();
        if (
            bytes(uri).length == 0 || bytes(uri).length > MAX_METADATA_URI_BYTES
                || !RoundValidation.isContentAddressedURI(uri) || contentHash == bytes32(0)
        ) revert InvalidMetadata();
        metadataURI = uri;
        metadataHash = contentHash;
        emit RoundMetadataUpdated(uri, contentHash);
    }

    function grantRoundAdmin(address account) external onlyCreator {
        if (account == address(0)) revert InvalidAddress();
        if (!hasRole(ROUND_ADMIN_ROLE, account)) {
            _grantRole(ROUND_ADMIN_ROLE, account);
            roundAdminGrantedAt[account] = uint40(block.timestamp);
            roundAdminCount += 1;
            emit RoundAdminGranted(account, msg.sender);
        }
    }

    function revokeRoundAdmin(address account) external onlyCreator {
        if (account == creator || !hasRole(ROUND_ADMIN_ROLE, account)) revert InvalidAddress();
        _revokeRole(ROUND_ADMIN_ROLE, account);
        roundAdminCount -= 1;
        emit RoundAdminRevoked(account, msg.sender);
    }

    function submit(
        RoundTypes.SubmissionType submissionType,
        string calldata title,
        string calldata description,
        string calldata uri,
        bytes32 contentHash
    ) external returns (uint256 submissionId) {
        if (block.timestamp < submissionsOpen || block.timestamp >= submissionsClose) {
            revert InvalidPhase();
        }
        if (!IRoundPrizeVault(prizeVault).isReadyForSubmissions()) revert PrizeVaultNotReady();
        if (submissionCount >= maxSubmissions) revert SubmissionLimitReached();
        if (submissionsByWallet[msg.sender] >= maxSubmissionsPerWallet) {
            revert SubmissionLimitReached();
        }
        if (
            bytes(uri).length == 0 || bytes(uri).length > MAX_METADATA_URI_BYTES
                || !RoundValidation.isContentAddressedURI(uri) || contentHash == bytes32(0)
        ) revert InvalidMetadata();
        uint256 titleLength = bytes(title).length;
        uint256 descriptionLength = bytes(description).length;
        if (
            titleLength < minTitleLength || titleLength > maxTitleLength
                || descriptionLength < minDescriptionLength
                || descriptionLength > maxDescriptionLength
        ) revert InvalidMetadata();
        uint32 titleLength32 = titleLength.toUint32();
        uint32 descriptionLength32 = descriptionLength.toUint32();
        bytes32 titleHash = keccak256(bytes(title));
        bytes32 descriptionHash = keccak256(bytes(description));

        submissionId = submissionCount++;
        submissionsByWallet[msg.sender] += 1;
        Submission storage submission = _submissions[submissionId];
        submission.owner = msg.sender;
        submission.submissionType = submissionType;
        submission.status = RoundTypes.SubmissionStatus.APPROVED;
        submission.createdAt = uint40(block.timestamp);
        submission.titleLength = titleLength32;
        submission.descriptionLength = descriptionLength32;
        submission.titleHash = titleHash;
        submission.descriptionHash = descriptionHash;
        submission.metadataURI = uri;
        submission.metadataHash = contentHash;
        _emitSubmissionCreated(submissionId, submission);
    }

    function moderateSubmission(uint256 submissionId, RoundTypes.SubmissionStatus status)
        external
        onlyRoundAdmin
    {
        if (block.timestamp >= votingStart) revert InvalidPhase();
        if (submissionId >= submissionCount || status == RoundTypes.SubmissionStatus.PENDING) {
            revert InvalidSubmission();
        }
        Submission storage submission = _submissions[submissionId];
        RoundTypes.SubmissionStatus previous = submission.status;
        submission.status = status;
        emit SubmissionModerated(submissionId, previous, status, msg.sender);
    }

    function getSubmission(uint256 submissionId) external view returns (Submission memory) {
        if (submissionId >= submissionCount) revert InvalidSubmission();
        return _submissions[submissionId];
    }

    function winnerAddress(uint256 rank) external view returns (address) {
        if (!finalized || rank >= _winners.length) return address(0);
        return _submissions[_winners[rank]].owner;
    }

    function _emitSubmissionCreated(uint256 submissionId, Submission storage submission) private {
        emit SubmissionCreated(
            submissionId,
            submission.owner,
            submission.submissionType,
            submission.titleHash,
            submission.descriptionHash,
            submission.titleLength,
            submission.descriptionLength,
            submission.metadataURI,
            submission.metadataHash
        );
    }

    function captureSnapshot() external returns (uint64 capturedBlock) {
        if (snapshotCaptured) revert SnapshotAlreadyCaptured();
        if (block.timestamp < votingStart || block.timestamp >= votingEnd || block.number == 0) {
            revert InvalidPhase();
        }
        capturedBlock = uint64(block.number - 1);
        snapshotBlock = capturedBlock;
        snapshotCaptured = true;
        emit SnapshotCaptured(capturedBlock, msg.sender);
    }

    function votingLimit(address voter) public view returns (uint256) {
        if (!snapshotCaptured) revert SnapshotPending();
        uint256 historicalPower = votingPowerAdapter.getPastVotes(voter, snapshotBlock);
        if (historicalPower == 0) return 0;
        if (votingStrategy == RoundTypes.VotingStrategy.ONE_PER_ELIGIBLE_WALLET) return 1;
        if (votingStrategy == RoundTypes.VotingStrategy.ONE_PER_NFT_VOTE) return historicalPower;
        if (votingStrategy == RoundTypes.VotingStrategy.FIXED_PER_ELIGIBLE_WALLET) {
            return baseOrFixedVotes;
        }
        return historicalPower + baseOrFixedVotes;
    }

    function remainingVotes(address voter) external view returns (uint256) {
        uint256 limit = votingLimit(voter);
        return usedVotes[voter] >= limit ? 0 : limit - usedVotes[voter];
    }

    function castVotes(uint256[] calldata submissionIds, uint256[] calldata amounts)
        external
        nonReentrant
    {
        if (block.timestamp < votingStart || block.timestamp >= votingEnd) {
            revert InvalidPhase();
        }
        if (!snapshotCaptured) revert SnapshotPending();
        uint256 length = submissionIds.length;
        if (length == 0 || length != amounts.length || length > MAX_VOTE_BATCH) {
            revert InvalidAllocation();
        }

        uint256 limit = votingLimit(msg.sender);
        if (limit == 0) revert NoVotingPower();
        uint256 addedVotes;
        for (uint256 i; i < length; ++i) {
            uint256 submissionId = submissionIds[i];
            uint256 amount = amounts[i];
            if (submissionId >= submissionCount || amount == 0) revert InvalidAllocation();
            for (uint256 j; j < i; ++j) {
                if (submissionIds[j] == submissionId) revert DuplicateSubmission();
            }
            Submission storage submission = _submissions[submissionId];
            if (submission.status != RoundTypes.SubmissionStatus.APPROVED) {
                revert InvalidSubmission();
            }
            if (submission.owner == msg.sender) revert SelfVote();
            if (voterSubmissionVotes[msg.sender][submissionId] + amount > maxVotesPerSubmission) {
                revert PerSubmissionCapExceeded();
            }
            addedVotes += amount;
        }
        if (usedVotes[msg.sender] + addedVotes > limit) revert VoteLimitExceeded();

        usedVotes[msg.sender] += addedVotes;
        for (uint256 i; i < length; ++i) {
            uint256 submissionId = submissionIds[i];
            uint256 amount = amounts[i];
            voterSubmissionVotes[msg.sender][submissionId] += amount;
            submissionVoteTotals[submissionId] += amount;
            emit VotesCast(
                msg.sender,
                submissionId,
                amount,
                voterSubmissionVotes[msg.sender][submissionId],
                submissionVoteTotals[submissionId]
            );
        }
    }

    function finalize() external returns (uint256[] memory winnerIds) {
        if (block.timestamp < votingEnd) revert NotFinalizable();
        if (finalized) return _winners;

        uint256[] memory topIds = new uint256[](winnerCount);
        uint256[] memory topTotals = new uint256[](winnerCount);
        uint256 selected;
        for (uint256 id; id < submissionCount; ++id) {
            if (_submissions[id].status != RoundTypes.SubmissionStatus.APPROVED) continue;
            uint256 total = submissionVoteTotals[id];
            uint256 position = selected;
            for (uint256 j; j < selected; ++j) {
                if (total > topTotals[j] || (total == topTotals[j] && id < topIds[j])) {
                    position = j;
                    break;
                }
            }
            if (position >= winnerCount) continue;
            if (selected < winnerCount) selected += 1;
            for (uint256 j = selected - 1; j > position; --j) {
                topIds[j] = topIds[j - 1];
                topTotals[j] = topTotals[j - 1];
            }
            topIds[position] = id;
            topTotals[position] = total;
        }

        for (uint256 i; i < selected; ++i) {
            _winners.push(topIds[i]);
        }
        finalized = true;
        finalizedAt = uint40(block.timestamp);
        winnerIds = _winners;
        emit Finalized(msg.sender, winnerIds);
    }

    function getWinners() external view returns (uint256[] memory) {
        return _winners;
    }

    function archive() external onlyRoundAdmin {
        if (!finalized) revert NotFinalizable();
        if (!archived) {
            archived = true;
            emit Archived(msg.sender);
        }
    }

    function isRoundAdmin(address account) external view returns (bool) {
        return hasRole(ROUND_ADMIN_ROLE, account);
    }

    function isRecoveryAdmin(address account) external view returns (bool) {
        return hasRole(ROUND_ADMIN_ROLE, account)
            && (account == creator || roundAdminGrantedAt[account] < submissionsOpen);
    }

    function renounceRole(bytes32, address) public pure override {
        revert NotCreator();
    }

    receive() external payable {
        revert InvalidAllocation();
    }

    fallback() external payable {
        revert InvalidAllocation();
    }
}
