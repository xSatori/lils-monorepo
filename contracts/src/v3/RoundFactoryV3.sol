// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IRoundV3 } from "../interfaces/IRoundV3.sol";
import { IRoundPrizeVault } from "../interfaces/IRoundPrizeVault.sol";
import { RoundTypes } from "../RoundTypes.sol";
import { RoundValidation } from "../RoundValidation.sol";
import { PrizeTypes } from "./PrizeTypes.sol";

contract RoundFactoryV3 is ReentrancyGuard, AccessControl {
    uint256 public constant TEST_PHASE_DURATION = 5 minutes;
    bytes32 public constant GLOBAL_ADMIN_ROLE = keccak256("GLOBAL_ADMIN_ROLE");

    struct ProtocolImplementation {
        address roundImplementation;
        address vaultImplementation;
    }

    struct RoundRecord {
        address round;
        address prizeVault;
        address creator;
        uint32 implementationVersion;
        bytes32 configurationHash;
        bytes32 prizePlanHash;
    }

    struct CreationData {
        uint32 version;
        uint256 creatorNonce;
        bytes32 prizePlanHash;
        bytes32 configurationHash;
        bytes32 roundSalt;
        bytes32 vaultSalt;
    }

    error InvalidAddress();
    error DuplicateAdmin();
    error NotGlobalAdmin();
    error InvalidFee();
    error InvalidImplementation();
    error InvalidImplementationVersion();
    error InvalidImplementationSchema();
    error FactoryPaused();
    error FeeDeliveryFailed();
    error DirectEthRejected();
    error InvalidTestChain();
    error InvalidTestSchedule();
    error UnexpectedVotingPowerAdapter();

    address[2] private _globalAdmins;
    mapping(uint32 => ProtocolImplementation) public implementations;
    mapping(address => bool) public isRound;
    mapping(address => bool) public isPrizeVault;
    mapping(address => address) public vaultForRound;
    mapping(address => address) public roundForVault;
    mapping(address => uint256) public creatorNonces;
    RoundRecord[] private _rounds;

    address public treasury;
    uint256 public creationFee;
    uint32 public activeImplementationVersion;
    bool public paused;
    bool public immutable testMode;
    address public immutable votingPowerAdapter;

    event RoundCreated(
        address indexed round,
        address indexed prizeVault,
        address indexed creator,
        uint32 implementationVersion,
        uint256 creatorNonce,
        bytes32 configurationHash,
        bytes32 prizePlanHash,
        bytes32 roundSalt,
        bytes32 vaultSalt
    );
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee, address indexed admin);
    event TreasuryUpdated(
        address indexed previousTreasury, address indexed newTreasury, address admin
    );
    event ImplementationPairRegistered(
        uint32 indexed version,
        address indexed roundImplementation,
        address indexed vaultImplementation,
        address admin
    );
    event FactoryPauseSet(bool paused, address indexed admin);
    event GlobalAdminRotated(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyGlobalAdmin() {
        if (!hasRole(GLOBAL_ADMIN_ROLE, msg.sender)) revert NotGlobalAdmin();
        _;
    }

    modifier whenCreationOpen() {
        if (paused) revert FactoryPaused();
        _;
    }

    constructor(
        address globalAdmin1,
        address globalAdmin2,
        address treasury_,
        uint256 creationFee_,
        address initialRoundImplementation,
        address initialVaultImplementation,
        address votingPowerAdapter_,
        bool testMode_
    ) {
        if (
            globalAdmin1 == address(0) || globalAdmin2 == address(0) || treasury_ == address(0)
                || votingPowerAdapter_ == address(0) || votingPowerAdapter_.code.length == 0
        ) revert InvalidAddress();
        if (globalAdmin1 == globalAdmin2) revert DuplicateAdmin();
        if (creationFee_ == 0) revert InvalidFee();
        if (testMode_ && !_isAllowedTestChain(block.chainid)) revert InvalidTestChain();

        _globalAdmins = [globalAdmin1, globalAdmin2];
        _grantRole(GLOBAL_ADMIN_ROLE, globalAdmin1);
        _grantRole(GLOBAL_ADMIN_ROLE, globalAdmin2);
        treasury = treasury_;
        creationFee = creationFee_;
        testMode = testMode_;
        votingPowerAdapter = votingPowerAdapter_;
        uint32 version = _declaredRoundVersion(initialRoundImplementation);
        _registerImplementationPair(
            version, initialRoundImplementation, initialVaultImplementation, msg.sender
        );
    }

    function createRound(
        RoundTypes.RoundConfig calldata config,
        PrizeTypes.VaultConfig calldata vaultConfig,
        bytes32 callerSalt
    ) external payable nonReentrant whenCreationOpen returns (address round, address prizeVault) {
        if (msg.value != creationFee) revert InvalidFee();
        RoundValidation.validate(config);
        if (config.votingPowerAdapter != votingPowerAdapter) {
            revert UnexpectedVotingPowerAdapter();
        }
        if (testMode) _validateTestSchedule(config);

        CreationData memory data;
        data.version = activeImplementationVersion;
        ProtocolImplementation memory implementation = implementations[data.version];
        if (
            implementation.roundImplementation.code.length == 0
                || implementation.vaultImplementation.code.length == 0
        ) revert InvalidImplementation();

        data.creatorNonce = creatorNonces[msg.sender];
        data.prizePlanHash = _prizePlanHash(vaultConfig);
        data.configurationHash = keccak256(abi.encode(config, data.prizePlanHash));
        data.roundSalt = _deploymentSalt(
            bytes32("ROUND"),
            msg.sender,
            data.creatorNonce,
            data.version,
            data.configurationHash,
            data.prizePlanHash,
            callerSalt
        );
        data.vaultSalt = _deploymentSalt(
            bytes32("VAULT"),
            msg.sender,
            data.creatorNonce,
            data.version,
            data.configurationHash,
            data.prizePlanHash,
            callerSalt
        );

        creatorNonces[msg.sender] = data.creatorNonce + 1;
        round = Clones.cloneDeterministic(implementation.roundImplementation, data.roundSalt);
        prizeVault = Clones.cloneDeterministic(implementation.vaultImplementation, data.vaultSalt);
        isRound[round] = true;
        isPrizeVault[prizeVault] = true;
        vaultForRound[round] = prizeVault;
        roundForVault[prizeVault] = round;

        IRoundV3(round)
            .initialize(
                address(this),
                msg.sender,
                prizeVault,
                data.version,
                data.configurationHash,
                data.prizePlanHash,
                config
            );
        IRoundPrizeVault(prizeVault)
            .initialize(address(this), round, testMode, data.prizePlanHash, vaultConfig);

        _rounds.push(
            RoundRecord({
                round: round,
                prizeVault: prizeVault,
                creator: msg.sender,
                implementationVersion: data.version,
                configurationHash: data.configurationHash,
                prizePlanHash: data.prizePlanHash
            })
        );

        (bool delivered,) = payable(treasury).call{ value: msg.value }("");
        if (!delivered) revert FeeDeliveryFailed();
        emit RoundCreated(
            round,
            prizeVault,
            msg.sender,
            data.version,
            data.creatorNonce,
            data.configurationHash,
            data.prizePlanHash,
            data.roundSalt,
            data.vaultSalt
        );
    }

    function predictRoundAndVaultAddresses(
        address creator,
        RoundTypes.RoundConfig calldata config,
        PrizeTypes.VaultConfig calldata vaultConfig,
        bytes32 callerSalt
    ) external view returns (address predictedRound, address predictedVault) {
        uint32 version = activeImplementationVersion;
        bytes32 prizePlanHash = _prizePlanHash(vaultConfig);
        bytes32 configurationHash = keccak256(abi.encode(config, prizePlanHash));
        bytes32 roundSalt = _deploymentSalt(
            bytes32("ROUND"),
            creator,
            creatorNonces[creator],
            version,
            configurationHash,
            prizePlanHash,
            callerSalt
        );
        bytes32 vaultSalt = _deploymentSalt(
            bytes32("VAULT"),
            creator,
            creatorNonces[creator],
            version,
            configurationHash,
            prizePlanHash,
            callerSalt
        );
        ProtocolImplementation memory implementation = implementations[version];
        predictedRound = Clones.predictDeterministicAddress(
            implementation.roundImplementation, roundSalt, address(this)
        );
        predictedVault = Clones.predictDeterministicAddress(
            implementation.vaultImplementation, vaultSalt, address(this)
        );
    }

    function registerImplementationPair(
        uint32 version,
        address roundImplementation,
        address vaultImplementation
    ) external onlyGlobalAdmin {
        _registerImplementationPair(version, roundImplementation, vaultImplementation, msg.sender);
    }

    function setCreationFee(uint256 newFee) external onlyGlobalAdmin {
        if (newFee == 0) revert InvalidFee();
        uint256 previous = creationFee;
        creationFee = newFee;
        emit CreationFeeUpdated(previous, newFee, msg.sender);
    }

    function setTreasury(address newTreasury) external onlyGlobalAdmin {
        if (newTreasury == address(0)) revert InvalidAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury, msg.sender);
    }

    function setPaused(bool paused_) external onlyGlobalAdmin {
        paused = paused_;
        emit FactoryPauseSet(paused_, msg.sender);
    }

    function rotateGlobalAdmin(address previousAdmin, address newAdmin) external onlyGlobalAdmin {
        if (msg.sender != previousAdmin) revert NotGlobalAdmin();
        if (!hasRole(GLOBAL_ADMIN_ROLE, previousAdmin)) revert NotGlobalAdmin();
        if (newAdmin == address(0)) revert InvalidAddress();
        if (hasRole(GLOBAL_ADMIN_ROLE, newAdmin)) revert DuplicateAdmin();
        uint256 index = _globalAdmins[0] == previousAdmin ? 0 : 1;
        _globalAdmins[index] = newAdmin;
        _revokeRole(GLOBAL_ADMIN_ROLE, previousAdmin);
        _grantRole(GLOBAL_ADMIN_ROLE, newAdmin);
        emit GlobalAdminRotated(previousAdmin, newAdmin);
    }

    function getGlobalAdmins() external view returns (address[2] memory) {
        return _globalAdmins;
    }

    function isGlobalAdmin(address account) external view returns (bool) {
        return hasRole(GLOBAL_ADMIN_ROLE, account);
    }

    function grantRole(bytes32, address) public pure override {
        revert NotGlobalAdmin();
    }

    function revokeRole(bytes32, address) public pure override {
        revert NotGlobalAdmin();
    }

    function renounceRole(bytes32, address) public pure override {
        revert NotGlobalAdmin();
    }

    function roundCount() external view returns (uint256) {
        return _rounds.length;
    }

    function roundAt(uint256 index) external view returns (RoundRecord memory) {
        return _rounds[index];
    }

    function getRounds(uint256 offset, uint256 limit)
        external
        view
        returns (RoundRecord[] memory records)
    {
        uint256 length = _rounds.length;
        if (offset >= length || limit == 0) return new RoundRecord[](0);
        uint256 end = offset + limit;
        if (end > length) end = length;
        records = new RoundRecord[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            records[i - offset] = _rounds[i];
        }
    }

    function _registerImplementationPair(
        uint32 version,
        address roundImplementation,
        address vaultImplementation,
        address admin
    ) private {
        if (
            version == 0 || version <= activeImplementationVersion
                || implementations[version].roundImplementation != address(0)
        ) revert InvalidImplementationVersion();
        if (
            roundImplementation == address(0) || vaultImplementation == address(0)
                || roundImplementation.code.length == 0 || vaultImplementation.code.length == 0
        ) revert InvalidImplementation();
        if (_declaredRoundVersion(roundImplementation) != version) {
            revert InvalidImplementationVersion();
        }
        try IRoundV3(roundImplementation).initializerSelector() returns (bytes4 selector) {
            if (selector != IRoundV3.initialize.selector) revert InvalidImplementationSchema();
        } catch {
            revert InvalidImplementationSchema();
        }
        try IRoundPrizeVault(vaultImplementation).implementationVersion() returns (
            uint32 vaultVersion
        ) {
            if (vaultVersion != version) revert InvalidImplementationVersion();
        } catch {
            revert InvalidImplementation();
        }
        try IRoundPrizeVault(vaultImplementation).initializerSelector() returns (bytes4 selector) {
            if (selector != IRoundPrizeVault.initialize.selector) {
                revert InvalidImplementationSchema();
            }
        } catch {
            revert InvalidImplementationSchema();
        }
        implementations[version] = ProtocolImplementation(roundImplementation, vaultImplementation);
        activeImplementationVersion = version;
        emit ImplementationPairRegistered(version, roundImplementation, vaultImplementation, admin);
    }

    function _declaredRoundVersion(address implementation) private view returns (uint32) {
        if (implementation == address(0) || implementation.code.length == 0) {
            revert InvalidImplementation();
        }
        try IRoundV3(implementation).implementationVersion() returns (uint32 version) {
            return version;
        } catch {
            revert InvalidImplementation();
        }
    }

    function _prizePlanHash(PrizeTypes.VaultConfig calldata vaultConfig)
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                vaultConfig.allocations,
                vaultConfig.recoveryRecipient,
                vaultConfig.claimPeriod,
                vaultConfig.recoveryDelay
            )
        );
    }

    function _validateTestSchedule(RoundTypes.RoundConfig calldata config) private pure {
        if (
            config.submissionsClose - config.submissionsOpen != TEST_PHASE_DURATION
                || config.votingStart - config.submissionsClose != TEST_PHASE_DURATION
                || config.votingEnd - config.votingStart != TEST_PHASE_DURATION
        ) revert InvalidTestSchedule();
    }

    function _deploymentSalt(
        bytes32 kind,
        address creator,
        uint256 creatorNonce,
        uint32 version,
        bytes32 configurationHash,
        bytes32 prizePlanHash,
        bytes32 callerSalt
    ) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                kind,
                creator,
                creatorNonce,
                version,
                configurationHash,
                prizePlanHash,
                block.chainid,
                callerSalt
            )
        );
    }

    function _isAllowedTestChain(uint256 chainId) private pure returns (bool) {
        return chainId == 31_337 || chainId == 1_337 || chainId == 11_155_111;
    }

    receive() external payable {
        revert DirectEthRejected();
    }

    fallback() external payable {
        revert DirectEthRejected();
    }
}
