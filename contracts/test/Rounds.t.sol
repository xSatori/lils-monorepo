// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RoundsFactory} from "../src/RoundsFactory.sol";
import {RoundsRound} from "../src/RoundsRound.sol";

contract MockVotesToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public votes;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }

    function setVotes(address account, uint256 amount) external {
        votes[account] = amount;
    }

    function getVotes(address account) external view returns (uint256) {
        return votes[account];
    }

    function getPastVotes(address account, uint256) external view returns (uint256) {
        return votes[account];
    }
}

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract RoundsTest is Test {
    address creator = address(0xC0FFEE);
    address admin = address(0xA11CE);
    address globalAdmin = address(0xB055);
    address feeRecipient = address(0xFEE);
    address winnerOne = address(0x111);
    address winnerTwo = address(0x222);
    address voter = address(0x333);

    RoundsFactory factory;
    RoundsRound implementation;
    MockVotesToken eligibilityToken;

    function setUp() external {
        vm.chainId(1);
        implementation = new RoundsRound();
        factory = new RoundsFactory(globalAdmin, feeRecipient, address(implementation), block.chainid);
        eligibilityToken = new MockVotesToken();
        vm.deal(creator, 10 ether);
    }

    function testFactoryRejectsWrongChain() external {
        vm.expectRevert(RoundsFactory.InvalidChain.selector);
        new RoundsFactory(globalAdmin, feeRecipient, address(implementation), block.chainid + 1);
    }

    function testCreateEthRoundCollectsFeeAndLocksPrize() external {
        address[] memory winners = new address[](1);
        winners[0] = winnerOne;
        uint256[] memory payouts = new uint256[](1);
        payouts[0] = 1 ether;

        vm.prank(creator);
        address roundAddress = factory.createEthRound{value: 1.01 ether}(
            _config(winners, payouts)
        );

        assertEq(feeRecipient.balance, 0.01 ether);
        assertEq(roundAddress.balance, 1 ether);
        assertEq(factory.getRounds()[0], roundAddress);

        RoundsRound round = RoundsRound(payable(roundAddress));
        assertEq(round.creator(), creator);
        assertEq(round.admin(), admin);
        assertEq(round.globalAdmin(), globalAdmin);
    }

    function testOnlyEligibleWalletCanVoteOnce() external {
        address roundAddress = _createRound();
        RoundsRound round = RoundsRound(payable(roundAddress));

        eligibilityToken.setVotes(voter, 1);
        vm.warp(block.timestamp + 2 days);

        vm.prank(voter);
        round.submitVote(keccak256(bytes("ipfs://vote")), "ipfs://vote");

        assertTrue(round.hasVoted(voter));

        vm.prank(voter);
        vm.expectRevert(RoundsRound.AlreadyVoted.selector);
        round.submitVote(keccak256(bytes("ipfs://vote-2")), "ipfs://vote-2");
    }

    function testAdminCanAdjustWinnersBeforeFinalization() external {
        address roundAddress = _createRound();
        RoundsRound round = RoundsRound(payable(roundAddress));

        address[] memory winners = new address[](2);
        winners[0] = winnerOne;
        winners[1] = winnerTwo;
        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 0.4 ether;
        payouts[1] = 0.5 ether;

        vm.prank(admin);
        round.setWinners(winners, payouts);

        (address[] memory storedWinners, uint256[] memory storedPayouts) = round.getWinners();
        assertEq(storedWinners.length, 2);
        assertEq(storedPayouts[1], 0.5 ether);
    }

    function testFinalizePaysWinnersAndReturnsUnallocated() external {
        address roundAddress = _createRound();
        RoundsRound round = RoundsRound(payable(roundAddress));

        vm.prank(globalAdmin);
        round.setUnallocatedRefundApproved(true);
        vm.warp(block.timestamp + 4 days);

        vm.prank(admin);
        round.finalizeWinnersAndPay();

        vm.prank(winnerOne);
        round.claimPrize(winnerOne);
        vm.prank(creator);
        round.claimPrize(creator);

        assertEq(winnerOne.balance, 0.8 ether);
        assertEq(creator.balance, 8.99 ether + 0.2 ether);
    }

    function testCannotFinalizeBeforeVotingEnds() external {
        address roundAddress = _createRound();
        RoundsRound round = RoundsRound(payable(roundAddress));

        vm.prank(admin);
        vm.expectRevert(RoundsRound.VotingStillActive.selector);
        round.finalizeWinnersAndPay();
    }

    function testGlobalAdminCanRefundCreator() external {
        address roundAddress = _createRound();
        RoundsRound round = RoundsRound(payable(roundAddress));

        vm.prank(globalAdmin);
        round.globalRefundToCreator();

        vm.prank(creator);
        round.claimPrize(creator);

        assertEq(creator.balance, 9.99 ether);
        assertTrue(round.winnersFinalized());
    }

    function testErc20RoundTransfersPrizeIntoRound() external {
        MockERC20 token = new MockERC20();
        token.mint(creator, 100 ether);

        address[] memory winners = new address[](1);
        winners[0] = winnerOne;
        uint256[] memory payouts = new uint256[](1);
        payouts[0] = 50 ether;

        vm.startPrank(creator);
        token.approve(address(factory), 50 ether);
        vm.stopPrank();

        vm.prank(globalAdmin);
        factory.setPrizeTokenAllowed(address(token), true);

        vm.startPrank(creator);
        address roundAddress = factory.createErc20Round{value: 0.01 ether}(
            _config(winners, payouts),
            address(token),
            50 ether
        );
        vm.stopPrank();

        assertEq(token.balanceOf(roundAddress), 50 ether);
        assertEq(feeRecipient.balance, 0.01 ether);
    }

    function testRejectsSecondVoteFromSameWallet() external {
        address roundAddress = _createRound();
        RoundsRound round = RoundsRound(payable(roundAddress));

        eligibilityToken.setVotes(voter, 1);
        vm.warp(block.timestamp + 2 days);

        bytes32 voteHash = keccak256(bytes("ipfs://vote"));

        vm.prank(voter);
        round.submitVote(voteHash, "ipfs://vote");

        vm.prank(voter);
        vm.expectRevert(RoundsRound.AlreadyVoted.selector);
        round.submitVote(keccak256(bytes("ipfs://vote-2")), "ipfs://vote-2");
    }

    function _createRound() internal returns (address roundAddress) {
        address[] memory winners = new address[](1);
        winners[0] = winnerOne;
        uint256[] memory payouts = new uint256[](1);
        payouts[0] = 0.8 ether;

        vm.prank(creator);
        roundAddress = factory.createEthRound{value: 1.01 ether}(_config(winners, payouts));
    }

    function _config(address[] memory winners, uint256[] memory payouts)
        internal
        view
        returns (RoundsRound.RoundConfig memory)
    {
        return RoundsRound.RoundConfig({
            admin: admin,
            eligibilityToken: address(eligibilityToken),
            useVotePower: true,
            startsAt: uint64(block.timestamp),
            proposalsEndAt: uint64(block.timestamp + 1 days),
            votingEndAt: uint64(block.timestamp + 3 days),
            endsAt: uint64(block.timestamp + 4 days),
            metadataURI: "ipfs://round",
            initialWinners: winners,
            initialPayouts: payouts
        });
    }
}
