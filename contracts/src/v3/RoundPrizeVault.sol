// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IRoundPrizeVault } from "../interfaces/IRoundPrizeVault.sol";
import { IRoundPrizeView } from "../interfaces/IRoundPrizeView.sol";
import { IRoundFactoryAdminView } from "../interfaces/IRoundFactoryAdminView.sol";
import { PrizeTypes } from "./PrizeTypes.sol";

contract RoundPrizeVault is
    IRoundPrizeVault,
    Initializable,
    ReentrancyGuard,
    EIP712,
    IERC721Receiver,
    IERC1155Receiver
{
    using SafeERC20 for IERC20;

    uint48 public constant TEST_DURATION = 5 minutes;
    uint48 public constant MIN_RECOVERY_DELAY = 48 hours;
    uint48 public constant MIN_CLAIM_PERIOD = 180 days;

    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "ClaimAuthorization(address vault,address round,bytes32 prizePlanHash,uint256 allocationId,uint8 assetType,address token,uint256 tokenId,uint256 amount,address recipient,uint256 nonce,uint48 deadline)"
    );
    bytes32 private constant RECOVERY_TYPEHASH = keccak256(
        "RecoveryAction(address vault,address round,bytes32 prizePlanHash,uint8 kind,uint8 assetType,address token,uint256 tokenId,uint256 amount,address recipient,uint256 allocationId,uint256 nonce,uint48 validAfter,uint48 deadline)"
    );
    bytes32 private constant RECOVERY_CANCELLATION_TYPEHASH = keccak256(
        "RecoveryCancellation(address vault,address round,bytes32 prizePlanHash,bytes32 actionId,uint256 nonce,uint48 deadline)"
    );

    struct QueuedRecovery {
        PrizeTypes.RecoveryAction action;
        address signerOne;
        address signerTwo;
        uint48 executeAfter;
        bool executed;
        bool canceled;
        bool expired;
    }

    error InvalidAddress();
    error InvalidConfiguration();
    error InvalidPrizePlan();
    error InvalidState();
    error InvalidAsset();
    error InvalidAmount();
    error FundingIncomplete();
    error FundingDeadlinePassed();
    error UnauthorizedClaim();
    error AlreadyClaimed();
    error InvalidSignature();
    error InvalidSignerPair();
    error InvalidNonce();
    error InvalidDeadline();
    error RecoveryNotReady();
    error RecoveryAlreadyExecuted();
    error InsufficientRecoverableBalance();
    error DirectEthRejected();
    error UnexpectedTokenReceipt();
    error TransferFailed();

    address public factory;
    address public round;
    address public recoveryRecipient;
    bytes32 public prizePlanHash;
    uint48 public claimPeriod;
    uint48 public recoveryDelay;
    PrizeTypes.VaultState public state;
    uint256 public recoveryNonce;
    uint256 public cancellationNonce;

    PrizeTypes.Allocation[] private _allocations;
    mapping(bytes32 => uint256) public liabilityByAsset;
    mapping(bytes32 => uint256) public fundedByAsset;
    mapping(address => mapping(bytes32 => uint256)) public contributionOf;
    mapping(bytes32 => address) public nftDepositor;
    mapping(address => uint256) public claimNonces;
    mapping(bytes32 => QueuedRecovery) private _recoveries;

    bytes32 private _expectedReceipt;

    event VaultInitialized(
        address indexed factory,
        address indexed round,
        bytes32 indexed prizePlanHash,
        address recoveryRecipient
    );
    event PrizeFunded(
        address indexed depositor,
        PrizeTypes.AssetType indexed assetType,
        address indexed token,
        uint256 tokenId,
        uint256 amount,
        uint256 assetFunded,
        uint256 assetLiability
    );
    event ContributionRefunded(
        address indexed depositor,
        PrizeTypes.AssetType indexed assetType,
        address indexed token,
        uint256 tokenId,
        uint256 amount
    );
    event PrizePlanSealed(address indexed caller);
    event PrizePlanCanceled(address indexed caller);
    event PrizeReleased(
        uint256 indexed allocationId,
        uint8 indexed winnerRank,
        address indexed recipient,
        PrizeTypes.AssetType assetType,
        address token,
        uint256 tokenId,
        uint256 amount
    );
    event RecoveryQueued(
        bytes32 indexed actionId,
        uint256 indexed nonce,
        address indexed signerOne,
        address signerTwo,
        uint48 executeAfter
    );
    event RecoveryExecuted(bytes32 indexed actionId, address indexed recipient);
    event RecoveryCanceled(bytes32 indexed actionId, uint256 indexed nonce);
    event RecoveryExpired(bytes32 indexed actionId);
    event RecoveryRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    constructor() EIP712("LilNounsRoundPrizeVault", "1") {
        _disableInitializers();
    }

    function implementationVersion() external pure override returns (uint32) {
        return 3;
    }

    function initializerSelector() external pure override returns (bytes4) {
        return IRoundPrizeVault.initialize.selector;
    }

    function initialize(
        address factory_,
        address round_,
        bool testMode_,
        bytes32 prizePlanHash_,
        PrizeTypes.VaultConfig calldata config
    ) external override initializer {
        if (
            factory_ == address(0) || round_ == address(0) || config.recoveryRecipient == address(0)
                || msg.sender != factory_ || factory_.code.length == 0 || round_.code.length == 0
        ) revert InvalidAddress();
        if (
            !IRoundFactoryAdminView(factory_).isRound(round_)
                || IRoundPrizeView(round_).factory() != factory_
                || IRoundPrizeView(round_).prizeVault() != address(this)
        ) revert InvalidConfiguration();
        if (testMode_) {
            if (!_isTestChain(block.chainid)) revert InvalidConfiguration();
            if (config.claimPeriod != TEST_DURATION || config.recoveryDelay != TEST_DURATION) {
                revert InvalidConfiguration();
            }
        } else if (
            config.claimPeriod < MIN_CLAIM_PERIOD || config.recoveryDelay < MIN_RECOVERY_DELAY
        ) {
            revert InvalidConfiguration();
        }
        if (config.allocations.length > PrizeTypes.MAX_ALLOCATIONS) revert InvalidPrizePlan();
        bytes32 computedPlanHash = keccak256(
            abi.encode(
                config.allocations,
                config.recoveryRecipient,
                config.claimPeriod,
                config.recoveryDelay
            )
        );
        if (computedPlanHash != prizePlanHash_) revert InvalidPrizePlan();

        factory = factory_;
        round = round_;
        prizePlanHash = prizePlanHash_;
        recoveryRecipient = config.recoveryRecipient;
        claimPeriod = config.claimPeriod;
        recoveryDelay = config.recoveryDelay;
        state = config.allocations.length == 0
            ? PrizeTypes.VaultState.SEALED
            : PrizeTypes.VaultState.FUNDING;

        uint8 maxRank = IRoundPrizeView(round_).winnerCount();
        for (uint256 i; i < config.allocations.length; ++i) {
            PrizeTypes.AllocationInput calldata input = config.allocations[i];
            _validateAllocation(input, maxRank);
            bytes32 key = assetKey(input.assetType, input.token, input.tokenId);
            if (input.assetType == PrizeTypes.AssetType.ERC721 && liabilityByAsset[key] != 0) {
                revert InvalidPrizePlan();
            }
            liabilityByAsset[key] += input.amount;
            _allocations.push(
                PrizeTypes.Allocation({
                    winnerRank: input.winnerRank,
                    assetType: input.assetType,
                    token: input.token,
                    tokenId: input.tokenId,
                    amount: input.amount,
                    claimed: false
                })
            );
        }
        emit VaultInitialized(factory_, round_, prizePlanHash_, config.recoveryRecipient);
        if (config.allocations.length == 0) emit PrizePlanSealed(msg.sender);
    }

    function allocationCount() external view returns (uint256) {
        return _allocations.length;
    }

    function getAllocation(uint256 allocationId)
        external
        view
        returns (PrizeTypes.Allocation memory)
    {
        return _allocations[allocationId];
    }

    function isReadyForSubmissions() external view override returns (bool) {
        return state == PrizeTypes.VaultState.SEALED;
    }

    function assetKey(PrizeTypes.AssetType assetType, address token, uint256 tokenId)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(assetType, token, tokenId));
    }

    function fundNative() external payable nonReentrant {
        _requireFundingOpen();
        bytes32 key = assetKey(PrizeTypes.AssetType.NATIVE, address(0), 0);
        _credit(msg.sender, key, msg.value);
        emit PrizeFunded(
            msg.sender,
            PrizeTypes.AssetType.NATIVE,
            address(0),
            0,
            msg.value,
            fundedByAsset[key],
            liabilityByAsset[key]
        );
    }

    function fundERC20(address token, uint256 requestedAmount) external nonReentrant {
        _requireFundingOpen();
        if (token == address(0) || requestedAmount == 0) revert InvalidAmount();
        bytes32 key = assetKey(PrizeTypes.AssetType.ERC20, token, 0);
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), requestedAmount);
        uint256 afterBalance = IERC20(token).balanceOf(address(this));
        if (afterBalance <= beforeBalance) revert InvalidAmount();
        uint256 received = afterBalance - beforeBalance;
        _credit(msg.sender, key, received);
        emit PrizeFunded(
            msg.sender,
            PrizeTypes.AssetType.ERC20,
            token,
            0,
            received,
            fundedByAsset[key],
            liabilityByAsset[key]
        );
    }

    function fundERC721(address token, uint256 tokenId) external nonReentrant {
        _requireFundingOpen();
        bytes32 key = assetKey(PrizeTypes.AssetType.ERC721, token, tokenId);
        if (liabilityByAsset[key] != 1 || fundedByAsset[key] != 0) revert InvalidAsset();
        _expectedReceipt =
            keccak256(abi.encode(PrizeTypes.AssetType.ERC721, token, msg.sender, tokenId, 1));
        IERC721(token).safeTransferFrom(msg.sender, address(this), tokenId, abi.encode(key));
        if (_expectedReceipt != bytes32(0)) revert UnexpectedTokenReceipt();
        fundedByAsset[key] = 1;
        nftDepositor[key] = msg.sender;
        emit PrizeFunded(msg.sender, PrizeTypes.AssetType.ERC721, token, tokenId, 1, 1, 1);
    }

    function fundERC1155(address token, uint256 tokenId, uint256 amount) external nonReentrant {
        _requireFundingOpen();
        bytes32 key = assetKey(PrizeTypes.AssetType.ERC1155, token, tokenId);
        _checkCredit(key, amount);
        _expectedReceipt =
            keccak256(abi.encode(PrizeTypes.AssetType.ERC1155, token, msg.sender, tokenId, amount));
        IERC1155(token)
            .safeTransferFrom(msg.sender, address(this), tokenId, amount, abi.encode(key));
        if (_expectedReceipt != bytes32(0)) revert UnexpectedTokenReceipt();
        fundedByAsset[key] += amount;
        contributionOf[msg.sender][key] += amount;
        emit PrizeFunded(
            msg.sender,
            PrizeTypes.AssetType.ERC1155,
            token,
            tokenId,
            amount,
            fundedByAsset[key],
            liabilityByAsset[key]
        );
    }

    function fundERC1155Batch(
        address token,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external nonReentrant {
        _requireFundingOpen();
        uint256 length = tokenIds.length;
        if (length == 0 || length != amounts.length || length > PrizeTypes.MAX_ALLOCATIONS) {
            revert InvalidAmount();
        }
        for (uint256 i; i < length; ++i) {
            for (uint256 j; j < i; ++j) {
                if (tokenIds[j] == tokenIds[i]) revert InvalidAsset();
            }
            _checkCredit(assetKey(PrizeTypes.AssetType.ERC1155, token, tokenIds[i]), amounts[i]);
        }
        _expectedReceipt = keccak256(abi.encode(token, msg.sender, tokenIds, amounts));
        IERC1155(token).safeBatchTransferFrom(msg.sender, address(this), tokenIds, amounts, "");
        if (_expectedReceipt != bytes32(0)) revert UnexpectedTokenReceipt();
        for (uint256 i; i < length; ++i) {
            bytes32 key = assetKey(PrizeTypes.AssetType.ERC1155, token, tokenIds[i]);
            fundedByAsset[key] += amounts[i];
            contributionOf[msg.sender][key] += amounts[i];
            emit PrizeFunded(
                msg.sender,
                PrizeTypes.AssetType.ERC1155,
                token,
                tokenIds[i],
                amounts[i],
                fundedByAsset[key],
                liabilityByAsset[key]
            );
        }
    }

    function seal() external {
        if (state != PrizeTypes.VaultState.FUNDING) revert InvalidState();
        if (block.timestamp >= IRoundPrizeView(round).submissionsOpen()) {
            revert FundingDeadlinePassed();
        }
        for (uint256 i; i < _allocations.length; ++i) {
            PrizeTypes.Allocation storage allocation = _allocations[i];
            bytes32 key = assetKey(allocation.assetType, allocation.token, allocation.tokenId);
            if (
                fundedByAsset[key] != liabilityByAsset[key]
                    || _actualBalance(allocation.assetType, allocation.token, allocation.tokenId)
                        < liabilityByAsset[key]
            ) revert FundingIncomplete();
        }
        state = PrizeTypes.VaultState.SEALED;
        emit PrizePlanSealed(msg.sender);
    }

    function cancelUnfunded() external {
        if (
            state != PrizeTypes.VaultState.FUNDING
                || block.timestamp < IRoundPrizeView(round).submissionsOpen()
        ) revert InvalidState();
        state = PrizeTypes.VaultState.CANCELED;
        emit PrizePlanCanceled(msg.sender);
    }

    function refundContribution(
        PrizeTypes.AssetType assetType,
        address token,
        uint256 tokenId,
        uint256 amount
    ) external nonReentrant {
        if (
            state != PrizeTypes.VaultState.CANCELED
                && !(state == PrizeTypes.VaultState.FUNDING
                    && block.timestamp < IRoundPrizeView(round).submissionsOpen())
        ) revert InvalidState();
        bytes32 key = assetKey(assetType, token, tokenId);
        if (assetType == PrizeTypes.AssetType.ERC721) {
            if (amount != 1 || nftDepositor[key] != msg.sender || fundedByAsset[key] != 1) {
                revert InvalidAmount();
            }
            nftDepositor[key] = address(0);
            fundedByAsset[key] = 0;
        } else {
            if (amount == 0 || contributionOf[msg.sender][key] < amount) revert InvalidAmount();
            contributionOf[msg.sender][key] -= amount;
            fundedByAsset[key] -= amount;
        }
        _transferAsset(assetType, token, tokenId, amount, msg.sender);
        emit ContributionRefunded(msg.sender, assetType, token, tokenId, amount);
    }

    function claim(uint256 allocationId) external nonReentrant {
        address winner = _winnerFor(allocationId);
        if (msg.sender != winner) revert UnauthorizedClaim();
        _release(allocationId, winner);
    }

    function release(uint256 allocationId) external nonReentrant {
        _release(allocationId, _winnerFor(allocationId));
    }

    function hashClaimAuthorization(
        uint256 allocationId,
        address recipient,
        uint256 nonce,
        uint48 deadline
    ) public view returns (bytes32) {
        PrizeTypes.Allocation storage allocation = _allocations[allocationId];
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLAIM_TYPEHASH,
                    address(this),
                    round,
                    prizePlanHash,
                    allocationId,
                    allocation.assetType,
                    allocation.token,
                    allocation.tokenId,
                    allocation.amount,
                    recipient,
                    nonce,
                    deadline
                )
            )
        );
    }

    function claimTo(
        uint256 allocationId,
        address recipient,
        uint48 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (recipient == address(0) || block.timestamp > deadline) {
            revert InvalidDeadline();
        }
        address winner = _winnerFor(allocationId);
        uint256 nonce = claimNonces[winner];
        bytes32 digest = hashClaimAuthorization(allocationId, recipient, nonce, deadline);
        if (!SignatureChecker.isValidSignatureNow(winner, digest, signature)) {
            revert InvalidSignature();
        }
        claimNonces[winner] = nonce + 1;
        _release(allocationId, recipient);
    }

    function hashRecoveryAction(PrizeTypes.RecoveryAction memory action)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RECOVERY_TYPEHASH,
                    address(this),
                    round,
                    prizePlanHash,
                    action.kind,
                    action.assetType,
                    action.token,
                    action.tokenId,
                    action.amount,
                    action.recipient,
                    action.allocationId,
                    action.nonce,
                    action.validAfter,
                    action.deadline
                )
            )
        );
    }

    function queueRecovery(
        PrizeTypes.RecoveryAction calldata action,
        address signerOne,
        bytes calldata signatureOne,
        address signerTwo,
        bytes calldata signatureTwo
    ) external nonReentrant returns (bytes32 actionId) {
        if (action.nonce != recoveryNonce) revert InvalidNonce();
        if (
            action.validAfter > block.timestamp || action.deadline < block.timestamp + recoveryDelay
        ) {
            revert InvalidDeadline();
        }
        _validateRecoveryAction(action);
        if (!_validSignerPair(signerOne, signerTwo)) revert InvalidSignerPair();
        actionId = hashRecoveryAction(action);
        if (
            !SignatureChecker.isValidSignatureNow(signerOne, actionId, signatureOne)
                || !SignatureChecker.isValidSignatureNow(signerTwo, actionId, signatureTwo)
        ) revert InvalidSignature();
        recoveryNonce += 1;
        QueuedRecovery storage queued = _recoveries[actionId];
        queued.action = action;
        queued.signerOne = signerOne;
        queued.signerTwo = signerTwo;
        queued.executeAfter = uint48(block.timestamp) + recoveryDelay;
        emit RecoveryQueued(
            actionId, action.nonce, signerOne, signerTwo, uint48(block.timestamp) + recoveryDelay
        );
    }

    function hashRecoveryCancellation(bytes32 actionId, uint256 nonce, uint48 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RECOVERY_CANCELLATION_TYPEHASH,
                    address(this),
                    round,
                    prizePlanHash,
                    actionId,
                    nonce,
                    deadline
                )
            )
        );
    }

    function cancelRecovery(
        bytes32 actionId,
        uint48 deadline,
        address signerOne,
        bytes calldata signatureOne,
        address signerTwo,
        bytes calldata signatureTwo
    ) external nonReentrant {
        QueuedRecovery storage queued = _recoveries[actionId];
        if (queued.executeAfter == 0 || queued.executed || queued.canceled || queued.expired) {
            revert RecoveryAlreadyExecuted();
        }
        if (block.timestamp > deadline || !_validSignerPair(signerOne, signerTwo)) {
            revert InvalidSignerPair();
        }
        uint256 nonce = cancellationNonce;
        bytes32 digest = hashRecoveryCancellation(actionId, nonce, deadline);
        if (
            !SignatureChecker.isValidSignatureNow(signerOne, digest, signatureOne)
                || !SignatureChecker.isValidSignatureNow(signerTwo, digest, signatureTwo)
        ) revert InvalidSignature();
        cancellationNonce = nonce + 1;
        queued.canceled = true;
        emit RecoveryCanceled(actionId, nonce);
    }

    function executeRecovery(bytes32 actionId) external nonReentrant {
        QueuedRecovery storage queued = _recoveries[actionId];
        if (queued.executeAfter == 0 || block.timestamp < queued.executeAfter) {
            revert RecoveryNotReady();
        }
        if (queued.executed || queued.canceled || queued.expired) revert RecoveryAlreadyExecuted();
        if (block.timestamp > queued.action.deadline) revert InvalidDeadline();
        if (!_validSignerPair(queued.signerOne, queued.signerTwo)) revert InvalidSignerPair();

        queued.executed = true;
        PrizeTypes.RecoveryAction memory action = queued.action;
        if (action.kind == PrizeTypes.RecoveryKind.UPDATE_RECOVERY_RECIPIENT) {
            address previousRecipient = recoveryRecipient;
            recoveryRecipient = action.recipient;
            emit RecoveryRecipientUpdated(previousRecipient, action.recipient);
        } else if (action.kind == PrizeTypes.RecoveryKind.EXPIRED_ALLOCATION) {
            if (action.recipient != recoveryRecipient) revert InvalidAsset();
            _executeExpiredAllocation(action);
        } else {
            if (action.recipient != recoveryRecipient) revert InvalidAsset();
            uint256 recoverable = recoverableBalance(action.assetType, action.token, action.tokenId);
            if (action.amount > recoverable) revert InsufficientRecoverableBalance();
            _transferAsset(
                action.assetType, action.token, action.tokenId, action.amount, action.recipient
            );
        }
        emit RecoveryExecuted(actionId, action.recipient);
    }

    function expireRecovery(bytes32 actionId) external {
        QueuedRecovery storage queued = _recoveries[actionId];
        if (queued.executeAfter == 0 || block.timestamp <= queued.action.deadline) {
            revert InvalidDeadline();
        }
        if (queued.executed || queued.canceled || queued.expired) revert RecoveryAlreadyExecuted();
        queued.expired = true;
        emit RecoveryExpired(actionId);
    }

    function recoverableBalance(PrizeTypes.AssetType assetType, address token, uint256 tokenId)
        public
        view
        returns (uint256)
    {
        bytes32 key = assetKey(assetType, token, tokenId);
        uint256 actual = _actualBalance(assetType, token, tokenId);
        uint256 reserved = _reservedBalance(key);
        return actual > reserved ? actual - reserved : 0;
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external
        override
        returns (bytes4)
    {
        bytes32 expected =
            keccak256(abi.encode(PrizeTypes.AssetType.ERC721, msg.sender, from, tokenId, 1));
        if (operator != address(this) || expected != _expectedReceipt) {
            revert UnexpectedTokenReceipt();
        }
        _expectedReceipt = bytes32(0);
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata
    ) external override returns (bytes4) {
        bytes32 expected = keccak256(
            abi.encode(PrizeTypes.AssetType.ERC1155, msg.sender, from, id, value)
        );
        if (operator != address(this) || expected != _expectedReceipt) {
            revert UnexpectedTokenReceipt();
        }
        _expectedReceipt = bytes32(0);
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata
    ) external override returns (bytes4) {
        bytes32 expected = keccak256(abi.encode(msg.sender, from, ids, values));
        if (operator != address(this) || expected != _expectedReceipt) {
            revert UnexpectedTokenReceipt();
        }
        _expectedReceipt = bytes32(0);
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    function _validateAllocation(PrizeTypes.AllocationInput calldata input, uint8 winnerCount_)
        private
        view
    {
        if (input.winnerRank >= winnerCount_ || input.amount == 0) revert InvalidPrizePlan();
        if (input.assetType == PrizeTypes.AssetType.NATIVE) {
            if (input.token != address(0) || input.tokenId != 0) revert InvalidPrizePlan();
        } else {
            if (input.token == address(0) || input.token.code.length == 0) {
                revert InvalidPrizePlan();
            }
            if (input.assetType == PrizeTypes.AssetType.ERC20 && input.tokenId != 0) {
                revert InvalidPrizePlan();
            }
            if (input.assetType == PrizeTypes.AssetType.ERC721 && input.amount != 1) {
                revert InvalidPrizePlan();
            }
        }
    }

    function _requireFundingOpen() private view {
        if (state != PrizeTypes.VaultState.FUNDING) revert InvalidState();
        if (block.timestamp >= IRoundPrizeView(round).submissionsOpen()) {
            revert FundingDeadlinePassed();
        }
    }

    function _checkCredit(bytes32 key, uint256 amount) private view {
        if (
            amount == 0 || liabilityByAsset[key] == 0
                || fundedByAsset[key] + amount > liabilityByAsset[key]
        ) revert InvalidAmount();
    }

    function _credit(address depositor, bytes32 key, uint256 amount) private {
        _checkCredit(key, amount);
        fundedByAsset[key] += amount;
        contributionOf[depositor][key] += amount;
    }

    function _winnerFor(uint256 allocationId) private view returns (address winner) {
        if (state != PrizeTypes.VaultState.SEALED || !IRoundPrizeView(round).finalized()) {
            revert InvalidState();
        }
        PrizeTypes.Allocation storage allocation = _allocations[allocationId];
        winner = IRoundPrizeView(round).winnerAddress(allocation.winnerRank);
        if (winner == address(0)) revert UnauthorizedClaim();
    }

    function _release(uint256 allocationId, address recipient) private {
        PrizeTypes.Allocation storage allocation = _allocations[allocationId];
        if (allocation.claimed) revert AlreadyClaimed();
        allocation.claimed = true;
        bytes32 key = assetKey(allocation.assetType, allocation.token, allocation.tokenId);
        liabilityByAsset[key] -= allocation.amount;
        _transferAsset(
            allocation.assetType, allocation.token, allocation.tokenId, allocation.amount, recipient
        );
        emit PrizeReleased(
            allocationId,
            allocation.winnerRank,
            recipient,
            allocation.assetType,
            allocation.token,
            allocation.tokenId,
            allocation.amount
        );
    }

    function _executeExpiredAllocation(PrizeTypes.RecoveryAction memory action) private {
        if (state != PrizeTypes.VaultState.SEALED || !IRoundPrizeView(round).finalized()) {
            revert InvalidState();
        }
        uint256 expiry = uint256(IRoundPrizeView(round).finalizedAt()) + claimPeriod;
        if (block.timestamp < expiry) revert RecoveryNotReady();
        PrizeTypes.Allocation storage allocation = _allocations[action.allocationId];
        if (
            allocation.claimed || allocation.assetType != action.assetType
                || allocation.token != action.token || allocation.tokenId != action.tokenId
                || allocation.amount != action.amount
        ) revert InvalidAsset();
        allocation.claimed = true;
        bytes32 key = assetKey(allocation.assetType, allocation.token, allocation.tokenId);
        liabilityByAsset[key] -= allocation.amount;
        _transferAsset(
            allocation.assetType,
            allocation.token,
            allocation.tokenId,
            allocation.amount,
            action.recipient
        );
    }

    function _validateRecoveryAction(PrizeTypes.RecoveryAction calldata action) private view {
        if (action.kind == PrizeTypes.RecoveryKind.UPDATE_RECOVERY_RECIPIENT) {
            if (
                action.recipient == address(0) || action.recipient == recoveryRecipient
                    || action.assetType != PrizeTypes.AssetType.NATIVE || action.token != address(0)
                    || action.tokenId != 0 || action.amount != 0 || action.allocationId != 0
            ) revert InvalidAsset();
            return;
        }
        if (action.recipient != recoveryRecipient || action.amount == 0) revert InvalidAsset();
        if (action.assetType == PrizeTypes.AssetType.NATIVE) {
            if (action.token != address(0) || action.tokenId != 0) revert InvalidAsset();
        } else {
            if (action.token == address(0) || action.token.code.length == 0) revert InvalidAsset();
            if (action.assetType == PrizeTypes.AssetType.ERC20 && action.tokenId != 0) {
                revert InvalidAsset();
            }
            if (action.assetType == PrizeTypes.AssetType.ERC721 && action.amount != 1) {
                revert InvalidAsset();
            }
        }
        if (action.kind == PrizeTypes.RecoveryKind.EXPIRED_ALLOCATION) {
            if (action.allocationId >= _allocations.length) revert InvalidAsset();
            PrizeTypes.Allocation storage allocation = _allocations[action.allocationId];
            if (
                allocation.assetType != action.assetType || allocation.token != action.token
                    || allocation.tokenId != action.tokenId || allocation.amount != action.amount
            ) revert InvalidAsset();
        }
    }

    function _validSignerPair(address signerOne, address signerTwo) private view returns (bool) {
        if (signerOne == address(0) || signerOne == signerTwo) return false;
        bool oneGlobal = IRoundFactoryAdminView(factory).isGlobalAdmin(signerOne);
        bool twoGlobal = IRoundFactoryAdminView(factory).isGlobalAdmin(signerTwo);
        bool oneRound = IRoundPrizeView(round).isRecoveryAdmin(signerOne);
        bool twoRound = IRoundPrizeView(round).isRecoveryAdmin(signerTwo);
        return (oneGlobal && twoGlobal) || (oneGlobal && twoRound) || (oneRound && twoGlobal)
            || (oneRound && twoRound);
    }

    function _actualBalance(PrizeTypes.AssetType assetType, address token, uint256 tokenId)
        private
        view
        returns (uint256)
    {
        if (assetType == PrizeTypes.AssetType.NATIVE) return address(this).balance;
        if (assetType == PrizeTypes.AssetType.ERC20) return IERC20(token).balanceOf(address(this));
        if (assetType == PrizeTypes.AssetType.ERC1155) {
            return IERC1155(token).balanceOf(address(this), tokenId);
        }
        try IERC721(token).ownerOf(tokenId) returns (address owner) {
            return owner == address(this) ? 1 : 0;
        } catch {
            return 0;
        }
    }

    function _transferAsset(
        PrizeTypes.AssetType assetType,
        address token,
        uint256 tokenId,
        uint256 amount,
        address recipient
    ) private {
        if (assetType == PrizeTypes.AssetType.NATIVE) {
            (bool delivered,) = payable(recipient).call{ value: amount }("");
            if (!delivered) revert TransferFailed();
        } else if (assetType == PrizeTypes.AssetType.ERC20) {
            uint256 balanceBefore = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransfer(recipient, amount);
            uint256 balanceAfter = IERC20(token).balanceOf(address(this));
            bytes32 key = assetKey(assetType, token, tokenId);
            if (
                balanceAfter > balanceBefore || balanceBefore - balanceAfter != amount
                    || balanceAfter < _reservedBalance(key)
            ) revert TransferFailed();
        } else if (assetType == PrizeTypes.AssetType.ERC721) {
            IERC721(token).safeTransferFrom(address(this), recipient, tokenId);
            try IERC721(token).ownerOf(tokenId) returns (address owner) {
                if (owner != recipient) revert TransferFailed();
            } catch {
                revert TransferFailed();
            }
        } else {
            uint256 balanceBefore = IERC1155(token).balanceOf(address(this), tokenId);
            IERC1155(token).safeTransferFrom(address(this), recipient, tokenId, amount, "");
            uint256 balanceAfter = IERC1155(token).balanceOf(address(this), tokenId);
            bytes32 key = assetKey(assetType, token, tokenId);
            if (
                balanceAfter > balanceBefore || balanceBefore - balanceAfter != amount
                    || balanceAfter < _reservedBalance(key)
            ) revert TransferFailed();
        }
    }

    function _reservedBalance(bytes32 key) private view returns (uint256) {
        return state == PrizeTypes.VaultState.SEALED ? liabilityByAsset[key] : fundedByAsset[key];
    }

    function _isTestChain(uint256 chainId) private pure returns (bool) {
        return chainId == 31_337 || chainId == 1_337 || chainId == 11_155_111;
    }

    receive() external payable {
        revert DirectEthRejected();
    }

    fallback() external payable {
        revert DirectEthRejected();
    }
}
