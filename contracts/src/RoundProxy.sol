// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

interface IRoundProxyImplementation {
    function proxiableUUID() external view returns (bytes32);
    function contractVersion() external view returns (uint256);
}

contract RoundProxy {
    error NotProxyAdmin();
    error InvalidImplementation();
    error InvalidAdmin();
    error InitializationFailed();

    bytes32 private constant IMPLEMENTATION_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    bytes32 private constant ADMIN_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    event Upgraded(address indexed implementation);
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);

    constructor(address implementation_, address admin_, bytes memory initData) payable {
        _validateImplementation(implementation_);
        _setAdmin(admin_);
        _setImplementation(implementation_);

        if (initData.length != 0) {
            (bool success,) = implementation_.delegatecall(initData);
            if (!success) revert InitializationFailed();
        }
    }

    modifier onlyAdmin() {
        if (msg.sender != admin()) revert NotProxyAdmin();
        _;
    }

    function admin() public view returns (address proxyAdmin) {
        bytes32 slot = ADMIN_SLOT;
        assembly {
            proxyAdmin := sload(slot)
        }
    }

    function implementation() public view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }

    function upgradeTo(address newImplementation) external onlyAdmin {
        _validateImplementation(newImplementation);
        _setImplementation(newImplementation);
        emit Upgraded(newImplementation);
    }

    function _setAdmin(address newAdmin) private {
        if (newAdmin == address(0)) revert InvalidAdmin();
        bytes32 slot = ADMIN_SLOT;
        assembly {
            sstore(slot, newAdmin)
        }
    }

    function _setImplementation(address newImplementation) private {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, newImplementation)
        }
    }

    function _validateImplementation(address newImplementation) private view {
        if (newImplementation.code.length == 0) revert InvalidImplementation();
        try IRoundProxyImplementation(newImplementation).proxiableUUID() returns (bytes32 uuid) {
            if (uuid != IMPLEMENTATION_SLOT) revert InvalidImplementation();
        } catch {
            revert InvalidImplementation();
        }
        try IRoundProxyImplementation(newImplementation).contractVersion() returns (uint256 version) {
            if (version == 0) revert InvalidImplementation();
        } catch {
            revert InvalidImplementation();
        }
    }

    fallback() external payable {
        _delegate();
    }

    receive() external payable {
        _delegate();
    }

    function _delegate() private {
        address impl = implementation();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
