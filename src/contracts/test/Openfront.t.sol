// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {Openfront} from "src/Openfront.sol";
import {IOpenfront} from "src/interfaces/IOpenfront.sol";

contract OpenfrontTest is Test {
    Openfront internal openfront;
    address internal host = address(0xA11CE);
    address internal player1 = address(0xB0B);
    address internal player2 = address(0xC0DE);
    address internal attacker = address(0xDEAD);
    address internal server = address(0x5E1CE);
    uint256 internal bet = 1 ether;

    function setUp() public {
        vm.deal(host, 100 ether);
        vm.deal(player1, 100 ether);
        vm.deal(player2, 100 ether);
        vm.deal(attacker, 100 ether);
        vm.deal(server, 0);
        openfront = new Openfront(server);
    }

    function testCreateLobby_RevertOnZeroBet() public {
        bytes32 id = keccak256("lobby-0");
        vm.prank(host);
        vm.expectRevert(IOpenfront.InvalidBetAmount.selector);
        openfront.createLobby{value: 0}(id, 0, true);
    }

    function testOnlyOwnerSetGameServer_AndEvent() public {
        vm.prank(attacker);
        vm.expectRevert("Ownable: caller is not the owner");
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
        openfront.createLobby{value: bet}(id, bet, true);

        // Set cap to 2 (host + one more)
        vm.prank(host);
        openfront.setMaxPlayers(id, 2);

        // First join ok
        vm.prank(player1);
        openfront.joinLobby{value: bet}(id);

        // Second extra should revert
        vm.prank(player2);
        vm.expectRevert(IOpenfront.LobbyFull.selector);
        openfront.joinLobby{value: bet}(id);

        // Remove cap
        vm.prank(host);
        openfront.setMaxPlayers(id, 0);

        // Now join succeeds
        vm.prank(player2);
        openfront.joinLobby{value: bet}(id);
    }

    function testCancelLobbyRefundsAndBlocksFurtherActions() public {
        bytes32 id = keccak256("lobby-cancel");
        vm.prank(host);
        openfront.createLobby{value: bet}(id, bet, false);
        vm.prank(player1);
        openfront.joinLobby{value: bet}(id);

        // Capture balances
        uint256 hostBefore = host.balance;
        uint256 p1Before = player1.balance;

        // Host cancels
        vm.prank(host);
        openfront.cancelLobby(id);

        // Each participant got refund of bet
        assertEq(host.balance, hostBefore + bet);
        assertEq(player1.balance, p1Before + bet);

        // Cannot join after cancel (status != Created)
        vm.prank(player2);
        vm.expectRevert(IOpenfront.GameAlreadyStarted.selector);
        openfront.joinLobby{value: bet}(id);

        // Cannot start after cancel
        vm.prank(host);
        vm.expectRevert(IOpenfront.GameAlreadyStarted.selector);
        openfront.startGame(id);
    }

    function testCreateLobby_SuccessAndVisible() public {
        bytes32 id = keccak256("lobby-1");
        vm.prank(host);
        openfront.createLobby{value: bet}(id, bet, true);

        (address h,, address[] memory parts, uint8 status,, uint256 total) = openfront.getLobby(id);
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
        openfront.createLobby{value: bet}(id, bet, false);

        vm.prank(player1);
        openfront.joinLobby{value: bet}(id);

        assertEq(openfront.getParticipantCount(id), 2);

        vm.prank(player1);
        vm.expectRevert(Openfront.AlreadyParticipant.selector);
        openfront.joinLobby{value: bet}(id);
    }

    function testStartGame_OnlyHostAndMinPlayers() public {
        bytes32 id = keccak256("lobby-3");
        vm.prank(host);
        openfront.createLobby{value: bet}(id, bet, true);

        // Not enough players
        vm.prank(host);
        vm.expectRevert(Openfront.TooFewPlayers.selector);
        openfront.startGame(id);

        // Add second player
        vm.prank(player1);
        openfront.joinLobby{value: bet}(id);

        // Only host can start
        vm.prank(attacker);
        vm.expectRevert(IOpenfront.NotHost.selector);
        openfront.startGame(id);

        vm.prank(host);
        openfront.startGame(id);
    }

    function testDeclareWinner_FlowAndChecks() public {
        bytes32 id = keccak256("lobby-4");
        vm.prank(host);
        openfront.createLobby{value: bet}(id, bet, true);
        vm.prank(player1);
        openfront.joinLobby{value: bet}(id);
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
    }

    function testClaimPrize_EndToEnd() public {
        bytes32 id = keccak256("lobby-5");
        vm.prank(host);
        openfront.createLobby{value: bet}(id, bet, false);
        vm.prank(player1);
        openfront.joinLobby{value: bet}(id);
        vm.prank(host);
        openfront.startGame(id);
        vm.prank(server);
        openfront.declareWinner(id, player1);

        uint256 balBefore = player1.balance;
        vm.prank(player1);
        openfront.claimPrize(id);
        assertEq(player1.balance, balBefore + 2 ether);

        // Cannot claim twice
        vm.prank(player1);
        vm.expectRevert(IOpenfront.GameNotFinished.selector);
        openfront.claimPrize(id);
    }
}
