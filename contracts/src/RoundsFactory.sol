// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {RoundProxy} from "./RoundProxy.sol";
import {RoundsRound} from "./RoundsRound.sol";

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IRoundImplementation {
    function proxiableUUID() external view returns (bytes32);
    function contractVersion() external view returns (uint256);
}

interface IRoundFunding {
    function markFunded() external;
}

contract RoundsFactory {
    error InvalidAddress();
    error InvalidFee();
    error InvalidPrizeAmount();
    error InvalidImplementation();
    error InvalidChain();
    error TransferFailed();
    error NotGlobalAdmin();

    uint256 public constant FLAT_FEE = 0.01 ether;
    address public constant ETH_TOKEN = address(0);
    bytes32 public constant ROUND_IMPLEMENTATION_UUID =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);

    uint256 public immutable requiredChainId;
    address public globalAdmin;
    address public pendingGlobalAdmin;
    address public feeRecipient;
    address public roundImplementation;
    address[] private rounds;
    mapping(address round => bool registered) public isRound;
    mapping(address token => bool allowed) public allowedPrizeTokens;

    event RoundCreated(
        address indexed round,
        address indexed creator,
        address indexed admin,
        address prizeToken,
        uint256 prizeAmount,
        string metadataURI
    );
    event GlobalAdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event GlobalAdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event FeeRecipientSet(address indexed oldRecipient, address indexed newRecipient);
    event RoundImplementationSet(address indexed oldImplementation, address indexed newImplementation);
    event PrizeTokenAllowedSet(address indexed token, bool allowed);

    modifier onlyGlobalAdmin() {
        if (msg.sender != globalAdmin) revert NotGlobalAdmin();
        _;
    }

    constructor(
        address _globalAdmin,
        address _feeRecipient,
        address _roundImplementation,
        uint256 _requiredChainId
    ) {
        if (_requiredChainId == 0 || block.chainid != _requiredChainId) revert InvalidChain();
        if (_globalAdmin == address(0) || _feeRecipient == address(0) || _roundImplementation == address(0)) {
            revert InvalidAddress();
        }

        requiredChainId = _requiredChainId;
        globalAdmin = _globalAdmin;
        feeRecipient = _feeRecipient;
        _setRoundImplementation(_roundImplementation);
    }

    function createEthRound(RoundsRound.RoundConfig calldata config)
        external
        payable
        returns (address round)
    {
        if (msg.value <= FLAT_FEE) revert InvalidPrizeAmount();

        uint256 prizeAmount = msg.value - FLAT_FEE;
        round = _deployRound(config, ETH_TOKEN, prizeAmount, prizeAmount);

        IRoundFunding(round).markFunded();
        _sendEth(feeRecipient, FLAT_FEE);
        _registerRound(round, msg.sender, config, ETH_TOKEN, prizeAmount);
    }

    function createErc20Round(
        RoundsRound.RoundConfig calldata config,
        address prizeToken,
        uint256 prizeAmount
    ) external payable returns (address round) {
        if (msg.value != FLAT_FEE) revert InvalidFee();
        if (prizeToken == address(0)) revert InvalidAddress();
        if (!allowedPrizeTokens[prizeToken]) revert InvalidAddress();
        if (prizeAmount == 0) revert InvalidPrizeAmount();

        round = _deployRound(config, prizeToken, prizeAmount, 0);
        uint256 balanceBefore = IERC20(prizeToken).balanceOf(round);
        _safeTransferFrom(prizeToken, msg.sender, round, prizeAmount);
        uint256 balanceAfter = IERC20(prizeToken).balanceOf(round);
        if (balanceAfter - balanceBefore != prizeAmount) revert InvalidPrizeAmount();

        IRoundFunding(round).markFunded();
        _sendEth(feeRecipient, FLAT_FEE);
        _registerRound(round, msg.sender, config, prizeToken, prizeAmount);
    }

    function startGlobalAdminTransfer(address newGlobalAdmin) external onlyGlobalAdmin {
        if (newGlobalAdmin == address(0)) revert InvalidAddress();
        pendingGlobalAdmin = newGlobalAdmin;
        emit GlobalAdminTransferStarted(globalAdmin, newGlobalAdmin);
    }

    function acceptGlobalAdmin() external {
        if (msg.sender != pendingGlobalAdmin) revert NotGlobalAdmin();
        address previousAdmin = globalAdmin;
        globalAdmin = msg.sender;
        pendingGlobalAdmin = address(0);
        emit GlobalAdminTransferred(previousAdmin, msg.sender);
    }

    function setFeeRecipient(address newFeeRecipient) external onlyGlobalAdmin {
        if (newFeeRecipient == address(0)) revert InvalidAddress();
        emit FeeRecipientSet(feeRecipient, newFeeRecipient);
        feeRecipient = newFeeRecipient;
    }

    function setRoundImplementation(address newImplementation) external onlyGlobalAdmin {
        _setRoundImplementation(newImplementation);
    }

    function setPrizeTokenAllowed(address token, bool allowed) external onlyGlobalAdmin {
        if (token == address(0) || token.code.length == 0) revert InvalidAddress();
        allowedPrizeTokens[token] = allowed;
        emit PrizeTokenAllowedSet(token, allowed);
    }

    function upgradeRound(address round, address newImplementation) external onlyGlobalAdmin {
        if (!isRound[round]) revert InvalidAddress();
        _validateImplementation(newImplementation);
        RoundProxy(payable(round)).upgradeTo(newImplementation);
    }

    function roundsLength() external view returns (uint256) {
        return rounds.length;
    }

    function getRounds() external view returns (address[] memory) {
        return rounds;
    }

    function isGlobalAdmin(address account) external view returns (bool) {
        return account == globalAdmin;
    }

    function _deployRound(
        RoundsRound.RoundConfig calldata config,
        address prizeToken,
        uint256 prizeAmount,
        uint256 ethValue
    ) internal returns (address round) {
        bytes memory initData = abi.encodeCall(
            RoundsRound.initialize,
            (address(this), msg.sender, config, prizeToken, prizeAmount)
        );

        round = address(new RoundProxy{value: ethValue}(roundImplementation, address(this), initData));
    }

    function _registerRound(
        address round,
        address creator,
        RoundsRound.RoundConfig calldata config,
        address prizeToken,
        uint256 prizeAmount
    ) internal {
        isRound[round] = true;
        rounds.push(round);

        emit RoundCreated(round, creator, config.admin, prizeToken, prizeAmount, config.metadataURI);
    }

    function _setRoundImplementation(address newImplementation) internal {
        _validateImplementation(newImplementation);
        emit RoundImplementationSet(roundImplementation, newImplementation);
        roundImplementation = newImplementation;
    }

    function _validateImplementation(address newImplementation) internal view {
        if (newImplementation == address(0) || newImplementation.code.length == 0) revert InvalidImplementation();
        (bool proxyImplementationCallSucceeded, bytes memory proxyImplementationData) =
            newImplementation.staticcall(abi.encodeWithSignature("implementation()"));
        if (proxyImplementationCallSucceeded && proxyImplementationData.length >= 32) revert InvalidImplementation();
        try IRoundImplementation(newImplementation).proxiableUUID() returns (bytes32 uuid) {
            if (uuid != ROUND_IMPLEMENTATION_UUID) revert InvalidImplementation();
        } catch {
            revert InvalidImplementation();
        }
        try IRoundImplementation(newImplementation).contractVersion() returns (uint256 version) {
            if (version == 0) revert InvalidImplementation();
        } catch {
            revert InvalidImplementation();
        }
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool success,) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeCall(IERC20.transferFrom, (from, to, amount))
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
