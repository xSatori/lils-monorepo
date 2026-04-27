// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

interface IRoundsFactory {
    function globalAdmin() external view returns (address);
    function feeRecipient() external view returns (address);
}

interface IERC20Round {
    function transfer(address to, uint256 value) external returns (bool);
}

interface IERC721VotesLike {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getVotes(address account) external view returns (uint256);
    function getPastVotes(address account, uint256 blockNumber) external view returns (uint256);
}

contract RoundsRound {
    error AlreadyInitialized();
    error InvalidAddress();
    error InvalidTimeline();
    error InvalidWinnerCount();
    error InvalidPayouts();
    error InvalidEligibilityToken();
    error NotAdmin();
    error NotGlobalAdmin();
    error Paused();
    error NotProposing();
    error NotVoting();
    error TooManyProposals();
    error NoVotingPower();
    error AlreadyVoted();
    error WinnersFinalized();
    error RoundNotFunded();
    error RoundAlreadyFunded();
    error RoundPaused();
    error RoundAlreadyStarted();
    error VotingStillActive();
    error VotingSnapshotUnavailable();
    error VoteHashUsed();
    error TokenAlreadyVoted();
    error InvalidMetadata();
    error ProposalLimitReached();
    error UnallocatedRefundNotApproved();
    error NoClaimablePrize();
    error NoSurplus();
    error NotFactory();
    error TransferFailed();
    error ReentrantCall();

    uint256 public constant MAX_WINNERS = 20;
    uint256 public constant MAX_PROPOSALS = 500;
    uint256 public constant MAX_PROPOSALS_PER_WALLET = 3;
    uint256 public constant MAX_VOTE_TOKEN_IDS = 20;
    uint256 public constant MAX_METADATA_URI_BYTES = 512;
    uint256 public constant MAX_VOTE_URI_BYTES = 512;
    address public constant ETH_TOKEN = address(0);
    bytes32 public constant ROUND_IMPLEMENTATION_UUID =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);

    struct RoundConfig {
        address admin;
        address eligibilityToken;
        bool useVotePower;
        uint64 startsAt;
        uint64 proposalsEndAt;
        uint64 votingEndAt;
        uint64 endsAt;
        string metadataURI;
        address[] initialWinners;
        uint256[] initialPayouts;
    }

    struct Proposal {
        address proposer;
        string metadataURI;
        bool hidden;
    }

    address public factory;
    address public creator;
    address public admin;
    address public prizeToken;
    address public eligibilityToken;
    bool public useVotePower;
    bool public initialized;
    bool public paused;
    bool public funded;
    bool public winnersFinalized;
    bool public unallocatedRefundApproved;
    bool private locked;

    uint64 public startsAt;
    uint64 public proposalsEndAt;
    uint64 public votingEndAt;
    uint64 public endsAt;
    uint256 public prizeAmount;
    uint256 public votingSnapshotBlock;
    uint256 public allocatedPayoutTotal;
    uint256 public outstandingPrizeClaims;
    string public metadataURI;

    address[] private winners;
    uint256[] private payouts;
    Proposal[] private proposals;
    mapping(address voter => bool voted) public hasVoted;
    mapping(bytes32 voteHash => bool used) public usedVoteHashes;
    mapping(address account => uint256 amount) public claimablePrize;
    mapping(address proposer => uint256 count) public proposalCountByWallet;
    mapping(uint256 tokenId => bool used) public usedEligibilityTokenIds;

    event Initialized(
        address indexed factory,
        address indexed creator,
        address indexed admin,
        address prizeToken,
        uint256 prizeAmount,
        string metadataURI
    );
    event AdminSet(address indexed oldAdmin, address indexed newAdmin);
    event MetadataURISet(string metadataURI);
    event EligibilitySet(address indexed eligibilityToken, bool useVotePower);
    event ProposalSubmitted(uint256 indexed proposalId, address indexed proposer, string metadataURI);
    event ProposalHidden(uint256 indexed proposalId, bool hidden);
    event VoteSubmitted(address indexed voter, bytes32 indexed voteHash, string voteURI);
    event VotingSnapshotActivated(uint256 indexed snapshotBlock);
    event WinnersSet(address[] winners, uint256[] payouts);
    event Funded(uint256 prizeAmount);
    event UnallocatedRefundApprovalSet(bool approved);
    event WinnersFinalized(address indexed admin);
    event PrizeClaimCreated(address indexed account, uint256 amount);
    event PrizeClaimed(address indexed account, address indexed recipient, uint256 amount);
    event UnallocatedReturned(address indexed creator, uint256 amount);
    event CreatorRefunded(address indexed creator, uint256 amount);
    event SurplusRecovered(address indexed token, address indexed recipient, uint256 amount);
    event PausedSet(bool paused);

    constructor() {
        initialized = true;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    modifier onlyAdminOrGlobal() {
        if (msg.sender != admin && msg.sender != globalAdmin()) revert NotAdmin();
        _;
    }

    modifier onlyGlobalAdmin() {
        if (msg.sender != globalAdmin()) revert NotGlobalAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier whenFunded() {
        if (!funded) revert RoundNotFunded();
        _;
    }

    receive() external payable {}

    function proxiableUUID() external pure returns (bytes32) {
        return ROUND_IMPLEMENTATION_UUID;
    }

    function contractVersion() external pure returns (uint256) {
        return 1;
    }

    function initialize(
        address _factory,
        address _creator,
        RoundConfig calldata config,
        address _prizeToken,
        uint256 _prizeAmount
    ) external {
        if (initialized) revert AlreadyInitialized();
        if (_factory == address(0) || _creator == address(0) || config.admin == address(0)) {
            revert InvalidAddress();
        }
        if (_prizeAmount == 0) revert InvalidPayouts();
        if (_factory.code.length == 0 || (_prizeToken != ETH_TOKEN && _prizeToken.code.length == 0)) {
            revert InvalidAddress();
        }
        if (
            config.startsAt >= config.proposalsEndAt ||
            config.proposalsEndAt >= config.votingEndAt ||
            config.votingEndAt >= config.endsAt
        ) {
            revert InvalidTimeline();
        }
        if (config.eligibilityToken == address(0) || config.eligibilityToken.code.length == 0) {
            revert InvalidEligibilityToken();
        }
        if (bytes(config.metadataURI).length == 0 || bytes(config.metadataURI).length > MAX_METADATA_URI_BYTES) {
            revert InvalidMetadata();
        }

        factory = _factory;
        creator = _creator;
        admin = config.admin;
        prizeToken = _prizeToken;
        prizeAmount = _prizeAmount;
        eligibilityToken = config.eligibilityToken;
        useVotePower = config.useVotePower;
        startsAt = config.startsAt;
        proposalsEndAt = config.proposalsEndAt;
        votingEndAt = config.votingEndAt;
        endsAt = config.endsAt;
        metadataURI = config.metadataURI;
        initialized = true;

        _setWinners(config.initialWinners, config.initialPayouts);

        emit Initialized(_factory, _creator, config.admin, _prizeToken, _prizeAmount, config.metadataURI);
    }

    function markFunded() external {
        if (msg.sender != factory) revert NotFactory();
        if (funded) revert RoundAlreadyFunded();
        funded = true;
        emit Funded(prizeAmount);
    }

    function submitProposal(string calldata proposalMetadataURI)
        external
        whenNotPaused
        whenFunded
        returns (uint256 proposalId)
    {
        if (block.timestamp < startsAt || block.timestamp > proposalsEndAt) revert NotProposing();
        if (proposals.length >= MAX_PROPOSALS) revert TooManyProposals();
        if (proposalCountByWallet[msg.sender] >= MAX_PROPOSALS_PER_WALLET) revert ProposalLimitReached();
        if (bytes(proposalMetadataURI).length == 0 || bytes(proposalMetadataURI).length > MAX_METADATA_URI_BYTES) {
            revert InvalidMetadata();
        }

        proposalId = proposals.length;
        proposalCountByWallet[msg.sender] += 1;
        proposals.push(Proposal({
            proposer: msg.sender,
            metadataURI: proposalMetadataURI,
            hidden: false
        }));

        emit ProposalSubmitted(proposalId, msg.sender, proposalMetadataURI);
    }

    function submitVote(bytes32 voteHash, string calldata voteURI) external whenNotPaused whenFunded {
        if (!useVotePower) revert InvalidEligibilityToken();
        _validateBallotHash(voteHash, voteURI);
        _activateVotingSnapshot();
        _submitVote(msg.sender, _boundVoteHash(msg.sender, voteHash), voteURI);
    }

    function submitVoteWithTokenIds(bytes32 voteHash, string calldata voteURI, uint256[] calldata tokenIds)
        external
        whenNotPaused
        whenFunded
    {
        if (useVotePower) revert InvalidEligibilityToken();
        if (tokenIds.length == 0 || tokenIds.length > MAX_VOTE_TOKEN_IDS) revert NoVotingPower();
        _validateBallotHash(voteHash, voteURI);
        IERC721VotesLike token = IERC721VotesLike(eligibilityToken);

        for (uint256 i; i < tokenIds.length; i++) {
            if (usedEligibilityTokenIds[tokenIds[i]]) revert TokenAlreadyVoted();
            if (token.ownerOf(tokenIds[i]) != msg.sender) revert NoVotingPower();
            usedEligibilityTokenIds[tokenIds[i]] = true;
        }

        _submitVote(msg.sender, _boundVoteHash(msg.sender, voteHash), voteURI);
    }

    function activateVotingSnapshot() external whenFunded returns (uint256 snapshotBlock) {
        snapshotBlock = _activateVotingSnapshot();
    }

    function getVoteReceiptHash(address voter, bytes32 ballotHash) external view returns (bytes32) {
        return _boundVoteHash(voter, ballotHash);
    }

    function _submitVote(address voter, bytes32 receiptHash, string calldata voteURI) internal {
        if (block.timestamp <= proposalsEndAt || block.timestamp > votingEndAt) revert NotVoting();
        if (hasVoted[voter]) revert AlreadyVoted();
        if (receiptHash == bytes32(0) || usedVoteHashes[receiptHash]) revert VoteHashUsed();
        if (bytes(voteURI).length == 0 || bytes(voteURI).length > MAX_VOTE_URI_BYTES) revert InvalidMetadata();
        if (useVotePower && !_hasVotingPower(voter)) revert NoVotingPower();

        hasVoted[voter] = true;
        usedVoteHashes[receiptHash] = true;
        emit VoteSubmitted(voter, receiptHash, voteURI);
    }

    function setAdmin(address newAdmin) external onlyAdminOrGlobal whenNotPaused {
        if (newAdmin == address(0)) revert InvalidAddress();
        emit AdminSet(admin, newAdmin);
        admin = newAdmin;
    }

    function setMetadataURI(string calldata newMetadataURI) external onlyAdminOrGlobal whenNotPaused {
        if (winnersFinalized) revert WinnersFinalized();
        if (bytes(newMetadataURI).length == 0 || bytes(newMetadataURI).length > MAX_METADATA_URI_BYTES) {
            revert InvalidMetadata();
        }
        metadataURI = newMetadataURI;
        emit MetadataURISet(newMetadataURI);
    }

    function setEligibility(address newEligibilityToken, bool newUseVotePower) external onlyAdminOrGlobal whenNotPaused {
        if (winnersFinalized) revert WinnersFinalized();
        if (block.timestamp >= startsAt) revert RoundAlreadyStarted();
        if (newEligibilityToken == address(0) || newEligibilityToken.code.length == 0) revert InvalidEligibilityToken();
        eligibilityToken = newEligibilityToken;
        useVotePower = newUseVotePower;
        emit EligibilitySet(newEligibilityToken, newUseVotePower);
    }

    function setWinners(address[] calldata newWinners, uint256[] calldata newPayouts)
        external
        onlyAdminOrGlobal
        whenNotPaused
    {
        if (winnersFinalized) revert WinnersFinalized();
        _setWinners(newWinners, newPayouts);
    }

    function setProposalHidden(uint256 proposalId, bool hidden) external onlyAdminOrGlobal whenNotPaused {
        proposals[proposalId].hidden = hidden;
        emit ProposalHidden(proposalId, hidden);
    }

    function setPaused(bool newPaused) external onlyGlobalAdmin {
        paused = newPaused;
        emit PausedSet(newPaused);
    }

    function setUnallocatedRefundApproved(bool approved) external onlyGlobalAdmin {
        if (winnersFinalized) revert WinnersFinalized();
        unallocatedRefundApproved = approved;
        emit UnallocatedRefundApprovalSet(approved);
    }

    function finalizeWinnersAndPay() external nonReentrant onlyAdminOrGlobal whenNotPaused whenFunded {
        if (winnersFinalized) revert WinnersFinalized();
        if (block.timestamp <= votingEndAt) revert VotingStillActive();
        if (allocatedPayoutTotal < prizeAmount && !unallocatedRefundApproved) {
            revert UnallocatedRefundNotApproved();
        }
        winnersFinalized = true;
        emit WinnersFinalized(msg.sender);

        for (uint256 i; i < winners.length; i++) {
            _createPrizeClaim(winners[i], payouts[i]);
        }

        uint256 remaining = prizeAmount - allocatedPayoutTotal;
        if (remaining > 0) {
            _createPrizeClaim(creator, remaining);
            emit UnallocatedReturned(creator, remaining);
        }
    }

    function globalRefundToCreator() external nonReentrant onlyGlobalAdmin whenFunded {
        if (winnersFinalized) revert WinnersFinalized();
        winnersFinalized = true;
        _createPrizeClaim(creator, prizeAmount);
        emit CreatorRefunded(creator, prizeAmount);
    }

    function claimPrize(address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = claimablePrize[msg.sender];
        if (amount == 0) revert NoClaimablePrize();

        claimablePrize[msg.sender] = 0;
        outstandingPrizeClaims -= amount;
        _transferPrize(recipient, amount);
        emit PrizeClaimed(msg.sender, recipient, amount);
    }

    function recoverSurplus(address token, address recipient) external nonReentrant onlyGlobalAdmin {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient != creator && recipient != IRoundsFactory(factory).feeRecipient()) revert InvalidAddress();
        uint256 recoverable;

        if (token == ETH_TOKEN) {
            uint256 reserved = prizeToken == ETH_TOKEN ? _reservedPrizeBalance() : 0;
            uint256 balance = address(this).balance;
            if (balance <= reserved) revert NoSurplus();
            recoverable = balance - reserved;
            (bool success,) = payable(recipient).call{value: recoverable}("");
            if (!success) revert TransferFailed();
        } else {
            if (token.code.length == 0) revert InvalidAddress();
            uint256 reserved = token == prizeToken ? _reservedPrizeBalance() : 0;
            uint256 balance = _erc20BalanceOf(token, address(this));
            if (balance <= reserved) revert NoSurplus();
            recoverable = balance - reserved;
            _transferToken(token, recipient, recoverable);
        }

        emit SurplusRecovered(token, recipient, recoverable);
    }

    function _reservedPrizeBalance() internal view returns (uint256) {
        return winnersFinalized ? outstandingPrizeClaims : prizeAmount;
    }

    function _activateVotingSnapshot() internal returns (uint256 snapshotBlock) {
        if (votingSnapshotBlock != 0) return votingSnapshotBlock;
        if (block.timestamp <= proposalsEndAt || block.timestamp > votingEndAt) revert VotingSnapshotUnavailable();

        snapshotBlock = block.number == 0 ? 0 : block.number - 1;
        votingSnapshotBlock = snapshotBlock;
        emit VotingSnapshotActivated(snapshotBlock);
    }

    function _boundVoteHash(address voter, bytes32 ballotHash) internal view returns (bytes32) {
        if (ballotHash == bytes32(0)) revert VoteHashUsed();
        return keccak256(abi.encode(block.chainid, address(this), voter, ballotHash));
    }

    function _validateBallotHash(bytes32 ballotHash, string calldata voteURI) internal pure {
        if (ballotHash != keccak256(bytes(voteURI))) revert VoteHashUsed();
    }

    function getWinners() external view returns (address[] memory, uint256[] memory) {
        return (winners, payouts);
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function globalAdmin() public view returns (address) {
        return IRoundsFactory(factory).globalAdmin();
    }

    function _setWinners(address[] calldata newWinners, uint256[] calldata newPayouts) internal {
        if (newWinners.length == 0 || newWinners.length > MAX_WINNERS) revert InvalidWinnerCount();
        if (newWinners.length != newPayouts.length) revert InvalidPayouts();

        uint256 totalPayout;
        for (uint256 i; i < newWinners.length; i++) {
            if (newWinners[i] == address(0)) revert InvalidAddress();
            if (newPayouts[i] == 0) revert InvalidPayouts();
            totalPayout += newPayouts[i];
        }
        if (totalPayout > prizeAmount) revert InvalidPayouts();
        allocatedPayoutTotal = totalPayout;

        delete winners;
        delete payouts;

        for (uint256 i; i < newWinners.length; i++) {
            winners.push(newWinners[i]);
            payouts.push(newPayouts[i]);
        }

        emit WinnersSet(newWinners, newPayouts);
    }

    function _hasVotingPower(address voter) internal view returns (bool) {
        if (eligibilityToken == address(0)) revert InvalidEligibilityToken();
        IERC721VotesLike token = IERC721VotesLike(eligibilityToken);

        if (useVotePower) {
            if (votingSnapshotBlock == 0) revert VotingSnapshotUnavailable();
            try token.getPastVotes(voter, votingSnapshotBlock) returns (uint256 votes) {
                return votes > 0;
            } catch {}

            return false;
        }

        return false;
    }

    function _transferPrize(address to, uint256 amount) internal {
        if (amount == 0) return;

        if (prizeToken == ETH_TOKEN) {
            (bool success,) = payable(to).call{value: amount}("");
            if (!success) revert TransferFailed();
            return;
        }

        _transferToken(prizeToken, to, amount);
    }

    function _createPrizeClaim(address account, uint256 amount) internal {
        claimablePrize[account] += amount;
        outstandingPrizeClaims += amount;
        emit PrizeClaimCreated(account, amount);
    }

    function _transferToken(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20Round.transfer, (to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _erc20BalanceOf(address token, address account) internal view returns (uint256 balance) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        if (!success || data.length < 32) revert TransferFailed();
        balance = abi.decode(data, (uint256));
    }

    uint256[40] private __gap;
}
