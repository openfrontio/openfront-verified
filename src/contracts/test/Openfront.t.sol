// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {Openfront} from "src/Openfront.sol";
import {IOpenfront} from "src/interfaces/IOpenfront.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";

contract OpenfrontTest is Test {
    Openfront internal openfront;
    address internal host = address(0xA11CE);
    address internal player1 = address(0xB0B);
    address internal player2 = address(0xC0DE);
    address internal attacker = address(0xDEAD);
    address internal server = address(0x5E1CE);
    address internal feeRecipient = address(0xFEE);
    uint256 internal bet = 1 ether;
    MockERC20 internal token;

    function setUp() public {
        vm.deal(host, 100 ether);
        vm.deal(player1, 100 ether);
        vm.deal(player2, 100 ether);
        vm.deal(attacker, 100 ether);
        vm.deal(server, 0);
        openfront = new Openfront(server);
        token = new MockERC20("Mock", "MCK", 18);
        token.mint(host, 1_000 ether);
        token.mint(player1, 1_000 ether);
        token.mint(player2, 1_000 ether);
        token.mint(attacker, 1_000 ether);
        vm.startPrank(host);
        token.approve(address(openfront), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(player1);
        token.approve(address(openfront), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(player2);
        token.approve(address(openfront), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(attacker);
        token.approve(address(openfront), type(uint256).max);
        vm.stopPrank();
    }

    function testCreateLobby_AllowsZeroBet() public {
        bytes32 id = keccak256("lobby-0");
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidPaymentAsset.selector);
        openfront.createLobby(id, 0, true, address(0));

        vm.prank(host);
        openfront.createLobby(id, 0, true, address(token));

        (
            address hostAddress,
            uint256 betAmount,
            address[] memory participants,
            uint8 status,
            address winner,
            uint256 totalPrize,
            address stakeToken
        ) = openfront.getLobby(id);
        assertEq(hostAddress, host);
        assertEq(betAmount, 0);
        assertEq(participants.length, 1);
        assertEq(participants[0], host);
        assertEq(status, uint8(Openfront.GameStatus.Created));
        assertEq(winner, address(0));
        assertEq(totalPrize, 0);
        assertEq(stakeToken, address(token));
    }

    function testOnlyOwnerSetGameServer_AndEvent() public {
        vm.prank(attacker);
        vm.expectRevert();
        openfront.setGameServer(attacker);

        // Owner is address(this) (the test contract)
        address newServer = address(0xABCD);
        vm.expectEmit(true, true, false, true);
        emit IOpenfront.GameServerUpdated(server, newServer);
        openfront.setGameServer(newServer);
    }

    function testMaxPlayersEnforced() public {
        bytes32 id = keccak256("lobby-max");
        // owner is address(this), host will be 'host'
        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        assertEq(openfront.getMaxPlayers(id), 100);

        // Set cap to 2 (host + one more)
        vm.prank(host);
        openfront.setMaxPlayers(id, 2);

        // First join ok
        vm.prank(player1);
        openfront.joinLobby(id);

        // Second extra should revert
        vm.prank(player2);
        vm.expectRevert(IOpenfront.LobbyFull.selector);
        openfront.joinLobby(id);

        // Increase cap to allow another participant
        vm.prank(host);
        openfront.setMaxPlayers(id, 3);

        // Now join succeeds
        vm.prank(player2);
        openfront.joinLobby(id);
    }

    function testCancelLobbyRefundsAndBlocksFurtherActions() public {
        bytes32 id = keccak256("lobby-cancel");
        vm.prank(host);
        openfront.createLobby(id, bet, false, address(token));
        vm.prank(player1);
        openfront.joinLobby(id);

        // Capture balances
        uint256 hostBefore = token.balanceOf(host);
        uint256 p1Before = token.balanceOf(player1);

        // Host cancels
        vm.prank(host);
        openfront.cancelLobby(id);

        // Each participant got refund of bet
        assertEq(token.balanceOf(host), hostBefore + bet);
        assertEq(token.balanceOf(player1), p1Before + bet);

        // Cannot join after cancel (status != Created)
        vm.prank(player2);
        vm.expectRevert(IOpenfront.GameAlreadyStarted.selector);
        openfront.joinLobby(id);

        // Cannot start after cancel
        vm.prank(host);
        vm.expectRevert(IOpenfront.GameAlreadyStarted.selector);
        openfront.startGame(id);
    }

    function testCreateLobby_SuccessAndVisible() public {
        bytes32 id = keccak256("lobby-1");
        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        (address h,, address[] memory parts, uint8 status,, uint256 total, address stakeToken) = openfront.getLobby(id);
        assertEq(stakeToken, address(token));
        assertEq(h, host);
        assertEq(parts.length, 1);
        assertEq(parts[0], host);
        assertEq(status, uint8(0)); // Created
        assertEq(total, bet);

        // Listing
        bytes32[] memory pubs = openfront.getAllPublicLobbies();
        assertEq(pubs.length, 1);
        assertEq(pubs[0], id);
    }

    function testJoinLobby_SuccessAndDuplicateRevert() public {
        bytes32 id = keccak256("lobby-2");
        vm.prank(host);
        openfront.createLobby(id, bet, false, address(token));

        vm.prank(player1);
        openfront.joinLobby(id);

        assertEq(openfront.getParticipantCount(id), 2);

        vm.prank(player1);
        vm.expectRevert(IOpenfront.AlreadyParticipant.selector);
        openfront.joinLobby(id);
    }

    function testStartGame_OnlyHostAndMinPlayers() public {
        bytes32 id = keccak256("lobby-3");
        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        // Not enough players
        vm.prank(host);
        vm.expectRevert(IOpenfront.TooFewPlayers.selector);
        openfront.startGame(id);

        // Add second player
        vm.prank(player1);
        openfront.joinLobby(id);

        // Only host can start
        vm.prank(attacker);
        vm.expectRevert(IOpenfront.NotHost.selector);
        openfront.startGame(id);

        vm.prank(host);
        openfront.startGame(id);
    }

    function testParticipantBoundsConfiguration() public {
        bytes32 id = keccak256("lobby-bounds");
        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        assertEq(openfront.getMaxPlayers(id), 100);

        // Default min should be 2
        assertEq(openfront.getMinPlayers(id), 2);

        // Host can raise min, but not set to zero
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidParticipantBounds.selector);
        openfront.setMinPlayers(id, 0);

        vm.prank(host);
        openfront.setMinPlayers(id, 3);
        assertEq(openfront.getMinPlayers(id), 3);

        // Max cannot be set to zero or exceed limit
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidParticipantBounds.selector);
        openfront.setMaxPlayers(id, 0);

        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidParticipantBounds.selector);
        openfront.setMaxPlayers(id, 101);

        // Cap must remain >= min
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidParticipantBounds.selector);
        openfront.setMaxPlayers(id, 2);

        // Increasing cap then lowering min is allowed
        vm.prank(host);
        openfront.setMaxPlayers(id, 5);
        vm.prank(host);
        openfront.setMinPlayers(id, 2);
        assertEq(openfront.getMinPlayers(id), 2);

        // Max cannot be reduced below min
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidParticipantBounds.selector);
        openfront.setMaxPlayers(id, 1);

        // Min cannot exceed limit
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidParticipantBounds.selector);
        openfront.setMinPlayers(id, 101);
    }

    function testStartGameRespectsConfiguredMin() public {
        bytes32 id = keccak256("lobby-bounds-start");
        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        vm.prank(host);
        openfront.setMinPlayers(id, 3);

        vm.prank(player1);
        openfront.joinLobby(id);

        // Only two participants (host + player1)
        vm.prank(host);
        vm.expectRevert(IOpenfront.TooFewPlayers.selector);
        openfront.startGame(id);

        vm.prank(player2);
        openfront.joinLobby(id);

        vm.prank(host);
        openfront.startGame(id);
    }

    function testEjectParticipantRefundsToken() public {
        bytes32 id = keccak256("lobby-eject-token");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        uint256 balanceAfterJoin = token.balanceOf(player1);

        vm.prank(server);
        openfront.ejectParticipant(id, player1);

        assertEq(token.balanceOf(player1), balanceAfterJoin + bet);
        assertEq(openfront.getParticipantCount(id), 1);
    }

    function testEjectParticipantRefundsERC20() public {
        bytes32 id = keccak256("lobby-eject-erc20");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        uint256 balanceAfterJoin = token.balanceOf(player1);

        vm.prank(server);
        openfront.ejectParticipant(id, player1);

        assertEq(token.balanceOf(player1), balanceAfterJoin + bet);
        assertEq(openfront.getParticipantCount(id), 1);
    }

    function testEjectParticipantOnlyServerAndHostProtected() public {
        bytes32 id = keccak256("lobby-eject-auth");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        // Only game server can call
        vm.prank(attacker);
        vm.expectRevert(IOpenfront.NotGameServer.selector);
        openfront.ejectParticipant(id, player1);

        // Cannot eject host
        vm.prank(server);
        vm.expectRevert(IOpenfront.CannotEjectHost.selector);
        openfront.ejectParticipant(id, host);

        // Cannot eject after start
        vm.prank(host);
        openfront.startGame(id);
        vm.prank(server);
        vm.expectRevert(IOpenfront.InvalidStatus.selector);
        openfront.ejectParticipant(id, player1);
    }

    function testDeclareWinner_FlowAndChecks() public {
        bytes32 id = keccak256("lobby-4");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        // Only server can call
        vm.prank(attacker);
        vm.expectRevert(IOpenfront.NotGameServer.selector);
        openfront.declareWinner(id, player1);

        // Winner must be participant
        vm.prank(server);
        vm.expectRevert(IOpenfront.NotParticipant.selector);
        openfront.declareWinner(id, attacker);

        // Declare ok
        vm.prank(server);
        openfront.declareWinner(id, player1);

        // Prize pool credited to winner
        assertEq(openfront.claimableTokenBalances(player1, address(token)), 2 ether);
        assertEq(openfront.claimableTokenBalances(host, address(token)), 0);

        // Winners metadata stored
        (address[] memory winners, uint256[] memory payouts) = openfront.getWinners(id);
        assertEq(winners.length, 1);
        assertEq(winners[0], player1);
        assertEq(payouts[0], 2 ether);

        // Cannot declare again once finished
        vm.prank(server);
        vm.expectRevert(IOpenfront.InvalidStatus.selector);
        openfront.declareWinner(id, player1);
    }

    function testWithdrawFlowSingleWinner() public {
        bytes32 id = keccak256("lobby-5");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, false, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);
        vm.prank(server);
        openfront.declareWinner(id, player1);

        uint256 balBefore = token.balanceOf(player1);
        uint256 claimable = openfront.claimableTokenBalances(player1, address(token));
        assertEq(claimable, 2 ether);

        vm.prank(player1);
        vm.expectRevert(IOpenfront.InvalidAmount.selector);
        openfront.withdraw(address(token), 0);

        vm.prank(player1);
        vm.expectRevert(IOpenfront.InsufficientClaimableBalance.selector);
        openfront.withdraw(address(token), claimable + 1);

        vm.prank(player1);
        uint256 half = claimable / 2;
        openfront.withdraw(address(token), half);
        assertEq(openfront.claimableTokenBalances(player1, address(token)), claimable - half);
        assertEq(token.balanceOf(player1), balBefore + half);

        uint256 remaining = openfront.claimableTokenBalances(player1, address(token));
        vm.prank(player1);
        uint256 withdrawnAll = openfront.withdrawAll(address(token));
        assertEq(withdrawnAll, remaining);
        assertEq(openfront.claimableTokenBalances(player1, address(token)), 0);
        assertEq(token.balanceOf(player1), balBefore + claimable);

        // Cannot claim twice
        vm.prank(player1);
        vm.expectRevert(IOpenfront.InsufficientClaimableBalance.selector);
        openfront.withdrawAll(address(token));
    }

    function testDeclareWinners_CustomWeightsSplitErc20() public {
        bytes32 id = keccak256("lobby-erc20");

        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        vm.startPrank(player1);
        uint256 player1Start = token.balanceOf(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.startPrank(player2);
        uint256 player2Start = token.balanceOf(player2);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        address[] memory winnersArr = new address[](2);
        winnersArr[0] = player1;
        winnersArr[1] = player2;
        uint256[] memory weights = new uint256[](2);
        weights[0] = 3;
        weights[1] = 1;

        vm.prank(server);
        openfront.declareWinners(id, winnersArr, weights);

        uint256 pool = bet * 3;
        uint256 expectedP1 = (pool * 3) / 4;
        uint256 expectedP2 = pool - expectedP1;
        assertEq(openfront.claimableTokenBalances(player1, address(token)), expectedP1);
        assertEq(openfront.claimableTokenBalances(player2, address(token)), expectedP2);

        (address[] memory storedWinners, uint256[] memory payouts) = openfront.getWinners(id);
        assertEq(storedWinners.length, 2);
        assertEq(storedWinners[0], player1);
        assertEq(storedWinners[1], player2);
        assertEq(payouts[0], expectedP1);
        assertEq(payouts[1], expectedP2);

        vm.prank(player1);
        openfront.withdrawAll(address(token));
        assertEq(openfront.claimableTokenBalances(player1, address(token)), 0);
        assertEq(token.balanceOf(player1), player1Start - bet + expectedP1);

        vm.prank(player2);
        openfront.withdraw(address(token), expectedP2 / 2);
        assertEq(
            openfront.claimableTokenBalances(player2, address(token)),
            expectedP2 - (expectedP2 / 2)
        );
        vm.prank(player2);
        openfront.withdrawAll(address(token));
        assertEq(openfront.claimableTokenBalances(player2, address(token)), 0);
        assertEq(token.balanceOf(player2), player2Start - bet + expectedP2);
    }

    function testDeclareWinners_RevertOnInvalidWeights() public {
        bytes32 id = keccak256("lobby-invalid-weights");

        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.startPrank(player2);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        address[] memory winnersArr = new address[](2);
        winnersArr[0] = player1;
        winnersArr[1] = player2;

        uint256[] memory zeroWeight = new uint256[](2);
        zeroWeight[0] = 0;
        zeroWeight[1] = 1;
        vm.prank(server);
        vm.expectRevert(IOpenfront.InvalidAmount.selector);
        openfront.declareWinners(id, winnersArr, zeroWeight);

        address[] memory duplicateWinners = new address[](2);
        duplicateWinners[0] = player1;
        duplicateWinners[1] = player1;
        uint256[] memory weights = new uint256[](2);
        weights[0] = 1;
        weights[1] = 1;

        vm.prank(server);
        vm.expectRevert(IOpenfront.AlreadyParticipant.selector);
        openfront.declareWinners(id, duplicateWinners, weights);
    }

    // ================= Allowlist Tests =================

    function testAllowlist_DefaultDisabled_AllCanJoin() public {
        bytes32 id = keccak256("lobby-allow-0");
        vm.prank(host);
        openfront.createLobby(id, bet, true, address(token));

        // Allowlist disabled by default
        assertEq(openfront.isAllowlistEnabled(id), false);

        // Any player can join if pays bet
        vm.prank(player1);
        openfront.joinLobby(id);

        vm.prank(player2);
        openfront.joinLobby(id);
    }

    function testAllowlist_EnableBlocksNonAllowlisted() public {
        bytes32 id = keccak256("lobby-allow-1");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, false, address(token));
        vm.stopPrank();

        // Enable allowlist
        vm.prank(host);
        openfront.setAllowlistEnabled(id, true);
        assertEq(openfront.isAllowlistEnabled(id), true);

        // Non-allowlisted cannot join
        vm.prank(player1);
        vm.expectRevert(IOpenfront.NotAllowlisted.selector);
        openfront.joinLobby(id);

        // Add player1 and join ok
        address[] memory addrs = new address[](1);
        addrs[0] = player1;
        vm.prank(host);
        openfront.addToAllowlist(id, addrs);
        assertTrue(openfront.isAllowlisted(id, player1));

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();
    }

    function testAllowlist_AddRemove() public {
        bytes32 id = keccak256("lobby-allow-2");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.prank(host);
        openfront.setAllowlistEnabled(id, true);

        address[] memory addrs = new address[](2);
        addrs[0] = player1;
        addrs[1] = player2;
        vm.prank(host);
        openfront.addToAllowlist(id, addrs);
        assertTrue(openfront.isAllowlisted(id, player1));
        assertTrue(openfront.isAllowlisted(id, player2));

        // Remove player2
        address[] memory rem = new address[](1);
        rem[0] = player2;
        vm.prank(host);
        openfront.removeFromAllowlist(id, rem);
        assertTrue(openfront.isAllowlisted(id, player1));
        assertFalse(openfront.isAllowlisted(id, player2));

        // player2 blocked
        vm.prank(player2);
        vm.expectRevert(IOpenfront.NotAllowlisted.selector);
        openfront.joinLobby(id);

        // player1 ok
        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();
    }

    function testAllowlist_DisableAfterEnable_AllCanJoin() public {
        bytes32 id = keccak256("lobby-allow-3");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, false, address(token));
        vm.stopPrank();

        vm.prank(host);
        openfront.setAllowlistEnabled(id, true);

        // Not allowlisted yet -> blocked
        vm.prank(player1);
        vm.expectRevert(IOpenfront.NotAllowlisted.selector);
        openfront.joinLobby(id);

        // Disable allowlist -> join ok
        vm.prank(host);
        openfront.setAllowlistEnabled(id, false);
        assertEq(openfront.isAllowlistEnabled(id), false);

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();
    }

    function testAllowlist_PermissionsAndStatusChecks() public {
        bytes32 id = keccak256("lobby-allow-4");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        // Only host can toggle enable
        vm.prank(attacker);
        vm.expectRevert(IOpenfront.NotHost.selector);
        openfront.setAllowlistEnabled(id, true);

        vm.prank(host);
        openfront.setAllowlistEnabled(id, true);

        // Only host can modify list
        address[] memory addrs = new address[](1);
        addrs[0] = player1;
        vm.prank(attacker);
        vm.expectRevert(IOpenfront.NotHost.selector);
        openfront.addToAllowlist(id, addrs);

        vm.prank(host);
        openfront.addToAllowlist(id, addrs);

        // After game starts, modifications should revert
        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidStatus.selector);
        openfront.setAllowlistEnabled(id, false);

        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidStatus.selector);
        openfront.addToAllowlist(id, addrs);

        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidStatus.selector);
        openfront.removeFromAllowlist(id, addrs);
    }

    function testERC20LobbyFlow() public {
        bytes32 id = keccak256("erc20-lobby");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);
        vm.prank(server);
        openfront.declareWinner(id, player1);

        uint256 before = token.balanceOf(player1);
        uint256 claimable = openfront.claimableTokenBalances(player1, address(token));
        assertEq(claimable, bet * 2);

        vm.prank(player1);
        openfront.withdrawAll(address(token));
        assertEq(token.balanceOf(player1), before + claimable);
        assertEq(openfront.claimableTokenBalances(player1, address(token)), 0);
    }

    function testAddToPrizePoolERC20Basic() public {
        bytes32 id = keccak256("sponsor-basic");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        uint256 before = token.balanceOf(player1);
        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.addToPrizePool(id, bet);
        vm.stopPrank();

        (,,,,, uint256 totalPrize,) = openfront.getLobby(id);
        assertEq(totalPrize, bet * 2);
        assertEq(token.balanceOf(player1), before - bet);
    }

    function testAddToPrizePoolERC20() public {
        bytes32 id = keccak256("sponsor-erc20");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.addToPrizePool(id, bet);
        vm.stopPrank();

        (,,,,, uint256 totalPrize,) = openfront.getLobby(id);
        assertEq(totalPrize, bet * 2);
    }

    function testCancelLobbyRefundsERC20ParticipantsAndSponsors() public {
        bytes32 id = keccak256("erc20-cancel");
        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, false, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        token.approve(address(openfront), bet);
        openfront.addToPrizePool(id, bet);
        vm.stopPrank();

        (,, address[] memory participants,,,,) = openfront.getLobby(id);
        assertEq(participants.length, 2);
        assertEq(participants[0], host);
        assertEq(participants[1], player1);

        uint256 hostBefore = token.balanceOf(host);
        uint256 playerBefore = token.balanceOf(player1);

        vm.prank(host);
        openfront.cancelLobby(id);

        assertEq(token.balanceOf(host), hostBefore + bet);
        assertEq(token.balanceOf(player1), playerBefore + bet * 2);
    }

    function testProtocolFee_SettersAndEvents() public {
        // Initial state: 0% fee, owner is recipient
        assertEq(openfront.protocolFeeBps(), 0);
        assertEq(openfront.feeRecipient(), address(this));

        // Set fee percentage
        vm.expectEmit(true, true, true, true);
        emit IOpenfront.ProtocolFeeUpdated(0, 500);
        openfront.setProtocolFee(500); // 5%

        assertEq(openfront.protocolFeeBps(), 500);

        // Cannot set fee > 50%
        vm.expectRevert(IOpenfront.InvalidAmount.selector);
        openfront.setProtocolFee(5001);

        // Non-owner cannot set fee
        vm.prank(attacker);
        vm.expectRevert();
        openfront.setProtocolFee(1000);

        // Set fee recipient
        vm.expectEmit(true, true, true, true);
        emit IOpenfront.FeeRecipientUpdated(address(this), feeRecipient);
        openfront.setFeeRecipient(feeRecipient);

        assertEq(openfront.feeRecipient(), feeRecipient);

        // Cannot set zero address
        vm.expectRevert(IOpenfront.ZeroAddress.selector);
        openfront.setFeeRecipient(address(0));

        // Non-owner cannot set recipient
        vm.prank(attacker);
        vm.expectRevert();
        openfront.setFeeRecipient(attacker);
    }

    function testProtocolFee_DeductedFromTokenPrize() public {
        bytes32 id = keccak256("fee-token");

        // Set 10% fee
        openfront.setProtocolFee(1000);
        openfront.setFeeRecipient(feeRecipient);

        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        uint256 totalPrize = 2 ether;
        uint256 expectedFee = (totalPrize * 1000) / 10000; // 0.2 ether
        uint256 expectedWinnerPayout = totalPrize - expectedFee; // 1.8 ether

        vm.prank(server);
        openfront.declareWinner(id, player1);

        // Fee recipient should have claimable balance
        assertEq(openfront.claimableTokenBalances(feeRecipient, address(token)), expectedFee);

        // Winner should have net payout
        assertEq(openfront.claimableTokenBalances(player1, address(token)), expectedWinnerPayout);

        // Check stored payout metadata
        (address[] memory winners, uint256[] memory payouts) = openfront.getWinners(id);
        assertEq(winners.length, 1);
        assertEq(winners[0], player1);
        assertEq(payouts[0], expectedWinnerPayout);

        // Both can withdraw
        uint256 recipientBalBefore = token.balanceOf(feeRecipient);
        vm.prank(feeRecipient);
        openfront.withdrawAll(address(token));
        assertEq(token.balanceOf(feeRecipient), recipientBalBefore + expectedFee);

        uint256 winnerBalBefore = token.balanceOf(player1);
        vm.prank(player1);
        openfront.withdrawAll(address(token));
        assertEq(token.balanceOf(player1), winnerBalBefore + expectedWinnerPayout);
    }

    function testProtocolFee_DeductedFromERC20Prize() public {
        bytes32 id = keccak256("fee-erc20");

        // Set 5% fee
        openfront.setProtocolFee(500);
        openfront.setFeeRecipient(feeRecipient);

        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        uint256 totalPrize = bet * 2;
        uint256 expectedFee = (totalPrize * 500) / 10000; // 0.05 ether
        uint256 expectedWinnerPayout = totalPrize - expectedFee;

        vm.prank(server);
        openfront.declareWinner(id, player1);

        assertEq(openfront.claimableTokenBalances(feeRecipient, address(token)), expectedFee);
        assertEq(openfront.claimableTokenBalances(player1, address(token)), expectedWinnerPayout);

        uint256 recipientBalBefore = token.balanceOf(feeRecipient);
        vm.prank(feeRecipient);
        openfront.withdrawAll(address(token));
        assertEq(token.balanceOf(feeRecipient), recipientBalBefore + expectedFee);

        uint256 winnerBalBefore = token.balanceOf(player1);
        vm.prank(player1);
        openfront.withdrawAll(address(token));
        assertEq(token.balanceOf(player1), winnerBalBefore + expectedWinnerPayout);
    }

    function testProtocolFee_MultipleWinnersCustomWeights() public {
        bytes32 id = keccak256("fee-multi");

        // Set 10% fee
        openfront.setProtocolFee(1000);
        openfront.setFeeRecipient(feeRecipient);

        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.startPrank(player2);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        uint256 totalPrize = bet * 3;
        uint256 expectedFee = (totalPrize * 1000) / 10000; // 0.3 ether
        uint256 netPrize = totalPrize - expectedFee; // 2.7 ether

        address[] memory winnersArr = new address[](2);
        winnersArr[0] = player1;
        winnersArr[1] = player2;
        uint256[] memory weights = new uint256[](2);
        weights[0] = 3;
        weights[1] = 1;

        vm.prank(server);
        openfront.declareWinners(id, winnersArr, weights);

        // Fee collected
        assertEq(openfront.claimableTokenBalances(feeRecipient, address(token)), expectedFee);

        // Winners split the net prize (after fee) by weight
        uint256 expectedP1 = (netPrize * 3) / 4;
        uint256 expectedP2 = netPrize - expectedP1;
        assertEq(openfront.claimableTokenBalances(player1, address(token)), expectedP1);
        assertEq(openfront.claimableTokenBalances(player2, address(token)), expectedP2);
    }

    function testProtocolFee_ZeroFeeNoop() public {
        bytes32 id = keccak256("fee-zero");

        // Fee is 0%, recipient should get nothing
        assertEq(openfront.protocolFeeBps(), 0);
        openfront.setFeeRecipient(feeRecipient);

        vm.startPrank(host);
        token.approve(address(openfront), bet);
        openfront.createLobby(id, bet, true, address(token));
        vm.stopPrank();

        vm.startPrank(player1);
        token.approve(address(openfront), bet);
        openfront.joinLobby(id);
        vm.stopPrank();

        vm.prank(host);
        openfront.startGame(id);

        uint256 totalPrize = 2 ether;

        vm.prank(server);
        openfront.declareWinner(id, player1);

        // No fee collected
        assertEq(openfront.claimableTokenBalances(feeRecipient, address(token)), 0);

        // Winner gets full prize
        assertEq(openfront.claimableTokenBalances(player1, address(token)), totalPrize);
    }
}
