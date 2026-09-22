// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

interface IRoundFactoryAdminView {
    function isRound(address round) external view returns (bool);
    function isGlobalAdmin(address account) external view returns (bool);
}
