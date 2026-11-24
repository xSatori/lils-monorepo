// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IRound } from "./interfaces/IRound.sol";
import { RoundTypes } from "./RoundTypes.sol";
import { RoundValidation } from "./RoundValidation.sol";

contract RoundFactory is ReentrancyGuard, AccessControl {
    uint256 public constant TEST_PHASE_DURATION = 5 minutes;
    bytes32 public constant GLOBAL_ADMIN_ROLE = keccak256("GLOBAL_ADMIN_ROLE");

    struct RoundRecord {
        address round;
        address creator;
        uint32 implementationVersion;
        bytes32 configurationHash;
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
    mapping(uint32 => address) public implementations;
    mapping(address => bool) public isRound;
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
        address indexed creator,
        uint32 indexed implementationVersion,
        uint256 creatorNonce,
        bytes32 configurationHash,
        bytes32 deploymentSalt
    );
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee, address indexed admin);
    event TreasuryUpdated(
        address indexed previousTreasury, address indexed newTreasury, address admin
    );
    event ImplementationRegistered(
        uint32 indexed version, address indexed implementation, address indexed admin
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
        address initialImplementation,
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
        _registerImplementation(
            _declaredImplementationVersion(initialImplementation), initialImplementation, msg.sender
        );
    }

    function createRound(RoundTypes.RoundConfig calldata config, bytes32 callerSalt)
        external
        payable
        nonReentrant
        whenCreationOpen
        returns (address round)
    {
        if (msg.value != creationFee) revert InvalidFee();
        RoundValidation.validate(config);
        if (config.votingPowerAdapter != votingPowerAdapter) {
            revert UnexpectedVotingPowerAdapter();
        }
        if (testMode) _validateTestSchedule(config);

        uint32 version = activeImplementationVersion;
        address implementation = implementations[version];
        if (implementation.code.length == 0) revert InvalidImplementation();
        uint256 creatorNonce = creatorNonces[msg.sender];
        bytes32 configurationHash = keccak256(abi.encode(config));
        bytes32 deploymentSalt =
            _deploymentSalt(msg.sender, creatorNonce, version, configurationHash, callerSalt);

        creatorNonces[msg.sender] = creatorNonce + 1;
        round = Clones.cloneDeterministic(implementation, deploymentSalt);
        isRound[round] = true;
        _rounds.push(
            RoundRecord({
                round: round,
                creator: msg.sender,
                implementationVersion: version,
                configurationHash: configurationHash
            })
        );
        IRound(round).initialize(address(this), msg.sender, version, configurationHash, config);

        (bool delivered,) = payable(treasury).call{ value: msg.value }("");
        if (!delivered) revert FeeDeliveryFailed();
        emit RoundCreated(
            round, msg.sender, version, creatorNonce, configurationHash, deploymentSalt
        );
    }

    function predictRoundAddress(
        address creator,
        RoundTypes.RoundConfig calldata config,
        bytes32 callerSalt
    ) external view returns (address) {
        uint32 version = activeImplementationVersion;
        bytes32 configurationHash = keccak256(abi.encode(config));
        bytes32 deploymentSalt = _deploymentSalt(
            creator, creatorNonces[creator], version, configurationHash, callerSalt
        );
        return Clones.predictDeterministicAddress(
            implementations[version], deploymentSalt, address(this)
        );
    }

    function registerImplementation(uint32 version, address implementation)
        external
        onlyGlobalAdmin
    {
        _registerImplementation(version, implementation, msg.sender);
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

    function _registerImplementation(uint32 version, address implementation, address admin)
        private
    {
        if (
            version == 0 || version <= activeImplementationVersion
                || implementations[version] != address(0)
        ) {
            revert InvalidImplementationVersion();
        }
        if (implementation == address(0) || implementation.code.length == 0) {
            revert InvalidImplementation();
        }
        try IRound(implementation).implementationVersion() returns (uint32 declaredVersion) {
            if (declaredVersion != version) revert InvalidImplementationVersion();
        } catch {
            revert InvalidImplementation();
        }
        try IRound(implementation).initializerSelector() returns (bytes4 declaredSelector) {
            if (declaredSelector != IRound.initialize.selector) {
                revert InvalidImplementationSchema();
            }
        } catch {
            revert InvalidImplementationSchema();
        }
        implementations[version] = implementation;
        activeImplementationVersion = version;
        emit ImplementationRegistered(version, implementation, admin);
    }

    function _declaredImplementationVersion(address implementation) private pure returns (uint32) {
        try IRound(implementation).implementationVersion() returns (uint32 declaredVersion) {
            return declaredVersion;
        } catch {
            revert InvalidImplementation();
        }
    }

    function _validateTestSchedule(RoundTypes.RoundConfig calldata config) private pure {
        if (
            config.submissionsClose - config.submissionsOpen != TEST_PHASE_DURATION
                || config.votingStart - config.submissionsClose != TEST_PHASE_DURATION
                || config.votingEnd - config.votingStart != TEST_PHASE_DURATION
        ) revert InvalidTestSchedule();
    }

    function _deploymentSalt(
        address creator,
        uint256 creatorNonce,
        uint32 version,
        bytes32 configurationHash,
        bytes32 callerSalt
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(creator, creatorNonce, version, configurationHash, callerSalt));
    }

    function _isAllowedTestChain(uint256 chainId) private pure returns (bool) {
        return chainId == 31_337 || chainId == 1_337 || chainId == 11_155_111;
    }

    function renounceRole(bytes32, address) public pure override {
        revert NotGlobalAdmin();
    }

    receive() external payable {
        revert DirectEthRejected();
    }

    fallback() external payable {
        revert DirectEthRejected();
    }
}
