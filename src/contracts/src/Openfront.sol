// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IOpenfront} from "./interfaces/IOpenfront.sol";

/**
 * @title Openfront Game Contract
 * @notice On-chain lobby, staking, and prize distribution for Openfront games.
 * @dev Implements IOpenfront; function-level docs use `@inheritdoc` to stay in sync.
 */
contract Openfront is ReentrancyGuard, Ownable, IOpenfront {
    // Additional custom errors for clearer failure reasons
    error LobbyAlreadyExists();
    error AlreadyParticipant();
    error InvalidStatus();
    error TooFewPlayers();
    error ZeroAddress();
    error TransferFailed();
    error RefundFailed();

    struct Lobby {
        address host;               // Address that created and owns the lobby
        uint256 betAmount;          // The ETH amount each player must pay/bet to join
        address[] participants;     // Array of participant addresses
        GameStatus status;          // Current game state
        address winner;             // Winner address (set by game server)
        uint256 totalPrize;         // Total prize pool for this lobby
    }
    
    enum GameStatus { 
        Created,     // Lobby exists, players can join
        InProgress,  // Game has started, no new joins allowed
        Finished,    // Winner declared by game server
        Claimed      // Prize has been withdrawn
    }
    
    // State variables
    mapping(bytes32 => Lobby) public lobbies;
    bytes32[] public publicLobbyIds;    // Array to track public lobby IDs
    bytes32[] public privateLobbyIds;   // Array to track private lobby IDs
    mapping(bytes32 => bool) public isPublicLobby; // Visibility of each lobby
    mapping(bytes32 => mapping(address => bool)) private hasJoined; // O(1) membership checks
    mapping(bytes32 => uint256) private lobbyMaxPlayers; // 0 = unlimited
    address public gameServer;          // Authorized address to declare winners
    
    modifier onlyHost(bytes32 lobbyId) {
        require(lobbies[lobbyId].host == msg.sender, NotHost());
        _;
    }
    
    modifier onlyGameServer() {
        require(msg.sender == gameServer, NotGameServer());
        _;
    }
    
    // onlyOwner is provided by Ownable
    
    modifier lobbyExists(bytes32 lobbyId) {
        require(lobbies[lobbyId].host != address(0), LobbyNotFound());
        _;
    }

    constructor(address _gameServer) Ownable(msg.sender) {
        gameServer = _gameServer;
    }
    
    /// @inheritdoc IOpenfront
    function createLobby(bytes32 lobbyId, uint256 betAmount, bool isPublic) external payable nonReentrant override {
        require(betAmount != 0, InvalidBetAmount());
        require(msg.value == betAmount, InsufficientFunds());
        require(lobbies[lobbyId].host == address(0), LobbyAlreadyExists());
        
        // Create a new lobby
        lobbies[lobbyId] = Lobby({
            host: msg.sender,
            betAmount: betAmount,
            participants: new address[](0),
            status: GameStatus.Created,
            winner: address(0),
            totalPrize: betAmount
        });
        isPublicLobby[lobbyId] = isPublic;
        if (isPublic) publicLobbyIds.push(lobbyId); else privateLobbyIds.push(lobbyId);
        
        // Host automatically joins as first participant
        lobbies[lobbyId].participants.push(msg.sender);
        hasJoined[lobbyId][msg.sender] = true;
        
        emit LobbyCreated(lobbyId, msg.sender, betAmount);
        emit ParticipantJoined(lobbyId, msg.sender);
    }
    
    /// @inheritdoc IOpenfront
    function joinLobby(bytes32 lobbyId) external payable nonReentrant lobbyExists(lobbyId) override {
        Lobby storage lobby = lobbies[lobbyId];

        require(lobby.status == GameStatus.Created, GameAlreadyStarted());
        require(msg.value == lobby.betAmount, InsufficientFunds());
        uint256 maxP = lobbyMaxPlayers[lobbyId];
        require(maxP == 0 || lobby.participants.length < maxP, LobbyFull());

        // Check if already a participant
        require(!hasJoined[lobbyId][msg.sender], AlreadyParticipant());

        // Add participant
        lobby.participants.push(msg.sender);
        hasJoined[lobbyId][msg.sender] = true;
        lobby.totalPrize += msg.value;

        emit ParticipantJoined(lobbyId, msg.sender);
    }
    
    /// @inheritdoc IOpenfront
    function startGame(bytes32 lobbyId) external lobbyExists(lobbyId) onlyHost(lobbyId) override {
        Lobby storage lobby = lobbies[lobbyId];
        
        require(lobby.status == GameStatus.Created, GameAlreadyStarted());
        require(lobby.participants.length >= 2, TooFewPlayers()); // Need at least 2 players
        
        lobby.status = GameStatus.InProgress;
        
        emit GameStarted(lobbyId);
    }
    
    /// @inheritdoc IOpenfront
    function declareWinner(bytes32 lobbyId, address winner) external onlyGameServer lobbyExists(lobbyId) override {
        Lobby storage lobby = lobbies[lobbyId];
        
        require(lobby.status == GameStatus.InProgress, InvalidStatus());
        require(winner != address(0), ZeroAddress());
        
        // Verify winner is a participant
        bool validParticipant = false;
        for (uint256 i = 0; i < lobby.participants.length; i++) {
            if (lobby.participants[i] == winner) {
                validParticipant = true;
                break;
            }
        }
        require(validParticipant, NotParticipant());
        
        lobby.winner = winner;
        lobby.status = GameStatus.Finished;
        
        emit GameFinished(lobbyId, winner);
    }
    
    /// @inheritdoc IOpenfront
    function claimPrize(bytes32 lobbyId) external nonReentrant lobbyExists(lobbyId) override {
        Lobby storage lobby = lobbies[lobbyId];
        
        require(lobby.status == GameStatus.Finished, GameNotFinished());
        require(lobby.winner == msg.sender, NotWinner());
        
        uint256 totalPrize = lobby.totalPrize;
        uint256 winnerPrize = totalPrize;
        
        lobby.status = GameStatus.Claimed;
        
        // Transfer prize to winner
        (bool success, ) = payable(msg.sender).call{value: winnerPrize}("");
        require(success, TransferFailed());
        
        emit PrizeClaimed(lobbyId, msg.sender, winnerPrize);
    }
    
    /// @inheritdoc IOpenfront
    function getLobby(bytes32 lobbyId) external view override returns (
        address host,
        uint256 betAmount,
        address[] memory participants,
        uint8 status,
        address winner,
        uint256 totalPrize
    ) {
        Lobby memory lobby = lobbies[lobbyId];
        return (
            lobby.host,
            lobby.betAmount,
            lobby.participants,
            uint8(lobby.status),
            lobby.winner,
            lobby.totalPrize
        );
    }
    
    /// @inheritdoc IOpenfront
    function getParticipantCount(bytes32 lobbyId) external view override returns (uint256) {
        return lobbies[lobbyId].participants.length;
    }
    
    /// @inheritdoc IOpenfront
    function isParticipant(bytes32 lobbyId, address participant) external view override returns (bool) {
        address[] memory participants = lobbies[lobbyId].participants;
        for (uint256 i = 0; i < participants.length; i++) {
            if (participants[i] == participant) {
                return true;
            }
        }
        return false;
    }
    
    /// @inheritdoc IOpenfront
    function setGameServer(address _gameServer) external onlyOwner override {
        require(_gameServer != address(0), ZeroAddress());
        address prev = gameServer;
        gameServer = _gameServer;
        emit GameServerUpdated(prev, _gameServer);
    }

    /// @inheritdoc IOpenfront
    function setMaxPlayers(bytes32 lobbyId, uint256 maxPlayers) external override lobbyExists(lobbyId) onlyHost(lobbyId) {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        require(maxPlayers == 0 || maxPlayers >= lobby.participants.length, InvalidStatus());
        lobbyMaxPlayers[lobbyId] = maxPlayers;
    }

    /// @inheritdoc IOpenfront
    function getMaxPlayers(bytes32 lobbyId) external view override returns (uint256 maxPlayers) {
        return lobbyMaxPlayers[lobbyId];
    }

    /// @inheritdoc IOpenfront
    function cancelLobby(bytes32 lobbyId) external override nonReentrant lobbyExists(lobbyId) onlyHost(lobbyId) {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        lobby.status = GameStatus.Claimed; // terminal state to block joins

        uint256 refund = lobby.betAmount;
        address[] memory parts = lobby.participants;
        uint256 len = parts.length;
        for (uint256 i = 0; i < len; i++) {
            (bool ok, ) = payable(parts[i]).call{value: refund}("");
            require(ok, RefundFailed());
        }
        lobby.totalPrize = 0;
        emit LobbyCanceled(lobbyId);
    }
    
    /// @inheritdoc IOpenfront
    function getAllPublicLobbies() external view override returns (bytes32[] memory) {
        return publicLobbyIds;
    }
    
    /// @inheritdoc IOpenfront
    function getAllPrivateLobbies() external view override returns (bytes32[] memory) {
        return privateLobbyIds;
    }
    
    /// @inheritdoc IOpenfront
    function getPublicLobbies(uint256 offset, uint256 limit) external view override returns (bytes32[] memory) {
        if (offset >= publicLobbyIds.length) {
            return new bytes32[](0);
        }
        
        uint256 end = offset + limit;
        if (end > publicLobbyIds.length) {
            end = publicLobbyIds.length;
        }
        
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = publicLobbyIds[i];
        }
        
        return result;
    }
    
    /// @inheritdoc IOpenfront
    function getPrivateLobbies(uint256 offset, uint256 limit) external view override returns (bytes32[] memory) {
        if (offset >= privateLobbyIds.length) {
            return new bytes32[](0);
        }
        
        uint256 end = offset + limit;
        if (end > privateLobbyIds.length) {
            end = privateLobbyIds.length;
        }
        
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = privateLobbyIds[i];
        }
        
        return result;
    }
    
    /// @inheritdoc IOpenfront
    function getPublicLobbyCount() external view override returns (uint256) {
        return publicLobbyIds.length;
    }
    
    /// @inheritdoc IOpenfront
    function getPrivateLobbyCount() external view override returns (uint256) {
        return privateLobbyIds.length;
    }
}
