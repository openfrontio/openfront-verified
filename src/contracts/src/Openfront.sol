// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IOpenfront} from "./interfaces/IOpenfront.sol";

/**
 * @title Openfront Game Contract
 * @notice On-chain lobby, staking, and prize distribution for Openfront games.
 * @dev Implements IOpenfront; function-level docs use `@inheritdoc` to stay in sync.
 */
contract Openfront is ReentrancyGuard, Ownable, IOpenfront {
    using SafeERC20 for IERC20;

    uint256 internal constant MAX_PLAYER_LIMIT = 100;

    struct Lobby {
        address host; // Address that created and owns the lobby
        uint256 betAmount; // The ETH amount each player must pay/bet to join
        address[] participants; // Array of participant addresses
        GameStatus status; // Current game state
        uint256 totalPrize; // Total prize pool for this lobby
        address stakeToken; // Token used for wagering
        address[] winners; // Array of winner addresses (set by game server)
        uint256[] winnerPayouts; // Amount (in stake token) credited to each winner
    }

    enum GameStatus {
        Created, // Lobby exists, players can join
        InProgress, // Game has started, no new joins allowed
        Finished, // Winner(s) declared by game server
        Claimed // Legacy terminal state (used for cancellations)
    }

    // State variables
    mapping(bytes32 => Lobby) public lobbies;
    bytes32[] public publicLobbyIds; // Array to track public lobby IDs
    bytes32[] public privateLobbyIds; // Array to track private lobby IDs
    mapping(bytes32 => bool) public isPublicLobby; // Visibility of each lobby
    mapping(bytes32 => mapping(address => bool)) private hasJoined; // O(1) membership checks
    mapping(bytes32 => uint256) private lobbyMaxPlayers; // defaults to MAX_PLAYER_LIMIT
    mapping(bytes32 => uint256) private lobbyMinPlayers; // 0 uses default (2)
    mapping(bytes32 => bool) private allowlistEnabled; // If true, only allowlisted can join
    mapping(bytes32 => mapping(address => bool)) private lobbyAllowlist; // allowlist per lobby
    mapping(bytes32 => mapping(address => uint256)) private sponsorBalances; // sponsor contributions per lobby
    mapping(bytes32 => address[]) private sponsorList;
    mapping(bytes32 => mapping(address => bool)) private sponsorTracked;
    address public gameServer; // Authorized address to declare winners
    mapping(address => mapping(address => uint256)) public claimableTokenBalances; // Accrued ERC20 prizes per user
    uint256 public protocolFeeBps; // Protocol fee in basis points (0-10000, where 10000 = 100%)
    address public feeRecipient; // Address that receives protocol fees

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
        protocolFeeBps = 0; // No fee by default
        feeRecipient = msg.sender; // Owner receives fees by default
    }

    /// @inheritdoc IOpenfront
    function createLobby(bytes32 lobbyId, uint256 betAmount, bool isPublic, address stakeToken)
        external
        override
        nonReentrant
    {
        require(lobbies[lobbyId].host == address(0), LobbyAlreadyExists());

        require(stakeToken != address(0), InvalidPaymentAsset());
        if (betAmount > 0) {
            IERC20(stakeToken).safeTransferFrom(msg.sender, address(this), betAmount);
        }
        uint256 initialPrize = betAmount;

        lobbies[lobbyId] = Lobby({
            host: msg.sender,
            betAmount: betAmount,
            participants: new address[](0),
            status: GameStatus.Created,
            totalPrize: initialPrize,
            stakeToken: stakeToken,
            winners: new address[](0),
            winnerPayouts: new uint256[](0)
        });
        isPublicLobby[lobbyId] = isPublic;
        if (isPublic) publicLobbyIds.push(lobbyId);
        else privateLobbyIds.push(lobbyId);

        // Host automatically joins as first participant
        lobbies[lobbyId].participants.push(msg.sender);
        hasJoined[lobbyId][msg.sender] = true;
        lobbyMinPlayers[lobbyId] = 2;
        lobbyMaxPlayers[lobbyId] = MAX_PLAYER_LIMIT;

        emit LobbyCreated(lobbyId, msg.sender, betAmount);
        emit ParticipantJoined(lobbyId, msg.sender);
    }

    /// @inheritdoc IOpenfront
    function joinLobby(bytes32 lobbyId) external override nonReentrant lobbyExists(lobbyId) {
        Lobby storage lobby = lobbies[lobbyId];

        require(lobby.status == GameStatus.Created, GameAlreadyStarted());
        uint256 maxP = lobbyMaxPlayers[lobbyId];
        if (maxP == 0 || maxP > MAX_PLAYER_LIMIT) {
            maxP = MAX_PLAYER_LIMIT;
            lobbyMaxPlayers[lobbyId] = maxP;
        }
        require(lobby.participants.length < maxP, LobbyFull());
        if (allowlistEnabled[lobbyId]) {
            require(lobbyAllowlist[lobbyId][msg.sender], NotAllowlisted());
        }

        if (lobby.betAmount > 0) {
            IERC20(lobby.stakeToken).safeTransferFrom(msg.sender, address(this), lobby.betAmount);
        }

        require(!hasJoined[lobbyId][msg.sender], AlreadyParticipant());

        // Add participant
        lobby.participants.push(msg.sender);
        hasJoined[lobbyId][msg.sender] = true;
        lobby.totalPrize += lobby.betAmount;

        emit ParticipantJoined(lobbyId, msg.sender);
    }

    /// @inheritdoc IOpenfront
    function startGame(bytes32 lobbyId) external override lobbyExists(lobbyId) onlyHost(lobbyId) {
        Lobby storage lobby = lobbies[lobbyId];

        require(lobby.status == GameStatus.Created, GameAlreadyStarted());

        uint256 minPlayers = lobbyMinPlayers[lobbyId];
        if (minPlayers == 0) {
            minPlayers = 2;
        }
        require(lobby.participants.length >= minPlayers, TooFewPlayers());

        uint256 maxPlayers = lobbyMaxPlayers[lobbyId];
        if (maxPlayers == 0 || maxPlayers > MAX_PLAYER_LIMIT) {
            maxPlayers = MAX_PLAYER_LIMIT;
            lobbyMaxPlayers[lobbyId] = maxPlayers;
        }
        require(lobby.participants.length <= maxPlayers, LobbyFull());

        lobby.status = GameStatus.InProgress;

        emit GameStarted(lobbyId);
    }

    /// @inheritdoc IOpenfront
    function declareWinner(bytes32 lobbyId, address winner) external override onlyGameServer lobbyExists(lobbyId) {
        address[] memory winners = new address[](1);
        winners[0] = winner;
        uint256[] memory weights = new uint256[](0);
        _declareWinners(lobbyId, winners, weights);
    }

    /// @inheritdoc IOpenfront
    function declareWinners(bytes32 lobbyId, address[] calldata winners, uint256[] calldata payoutWeights)
        public
        override
        onlyGameServer
        lobbyExists(lobbyId)
    {
        address[] memory winnersCopy = new address[](winners.length);
        for (uint256 i = 0; i < winners.length; i++) {
            winnersCopy[i] = winners[i];
        }

        uint256[] memory weightsCopy = new uint256[](payoutWeights.length);
        for (uint256 i = 0; i < payoutWeights.length; i++) {
            weightsCopy[i] = payoutWeights[i];
        }

        _declareWinners(lobbyId, winnersCopy, weightsCopy);
    }

    function _declareWinners(bytes32 lobbyId, address[] memory winners, uint256[] memory payoutWeights) internal {
        Lobby storage lobby = lobbies[lobbyId];

        require(lobby.status == GameStatus.InProgress, InvalidStatus());
        uint256 winnerCount = winners.length;
        require(winnerCount > 0, InvalidAmount());

        bool hasCustomWeights = payoutWeights.length > 0;
        if (hasCustomWeights) {
            require(payoutWeights.length == winnerCount, InvalidAmount());
        }

        uint256 totalWeight = hasCustomWeights ? 0 : winnerCount;
        for (uint256 i = 0; i < winnerCount; i++) {
            address winner = winners[i];
            require(winner != address(0), ZeroAddress());

            bool validParticipant = false;
            address[] storage participants = lobby.participants;
            uint256 participantCount = participants.length;
            for (uint256 j = 0; j < participantCount; j++) {
                if (participants[j] == winner) {
                    validParticipant = true;
                    break;
                }
            }
            require(validParticipant, NotParticipant());

            for (uint256 k = 0; k < i; k++) {
                require(winner != winners[k], AlreadyParticipant());
            }

            if (hasCustomWeights) {
                uint256 weight = payoutWeights[i];
                require(weight > 0, InvalidAmount());
                totalWeight += weight;
            }
        }

        if (hasCustomWeights) {
            require(totalWeight > 0, InvalidAmount());
        }

        delete lobby.winners;
        delete lobby.winnerPayouts;

        uint256 pool = lobby.totalPrize;
        address stakeToken = lobby.stakeToken;

        // Deduct protocol fee from prize pool
        uint256 feeAmount = _collectProtocolFee(lobbyId, pool, stakeToken);

        uint256 remainingPool = pool - feeAmount;
        uint256 remainingWeight = totalWeight;
        for (uint256 i = 0; i < winnerCount; i++) {
            address winner = winners[i];
            uint256 weight = hasCustomWeights ? payoutWeights[i] : 1;

            uint256 amount = 0;
            if (remainingPool > 0) {
                if (i == winnerCount - 1 || remainingWeight == weight) {
                    amount = remainingPool;
                } else {
                    amount = (remainingPool * weight) / remainingWeight;
                }
            }

            remainingPool -= amount;
            remainingWeight = hasCustomWeights ? remainingWeight - weight : remainingWeight - 1;

            uint256 newBalance = _creditClaimable(winner, stakeToken, amount);

            lobby.winners.push(winner);
            lobby.winnerPayouts.push(amount);

            emit PrizeBalanceIncreased(lobbyId, winner, stakeToken, amount, newBalance);
        }

        lobby.totalPrize = 0;
        lobby.status = GameStatus.Finished;

        _clearSponsorState(lobbyId);

        emit GameFinished(lobbyId, winners[0]);
        emit GameFinishedMulti(lobbyId, winners, lobby.winnerPayouts, stakeToken, pool, feeAmount);
    }

    /// @inheritdoc IOpenfront
    function withdraw(address token, uint256 amount) external override nonReentrant returns (uint256 withdrawn) {
        if (amount == 0) revert InvalidAmount();
        return _processWithdraw(msg.sender, token, amount);
    }

    /// @inheritdoc IOpenfront
    function withdrawAll(address token) external override nonReentrant returns (uint256 withdrawn) {
        uint256 balance = _claimableBalance(msg.sender, token);
        if (balance == 0) revert InsufficientClaimableBalance();
        return _processWithdraw(msg.sender, token, balance);
    }

    /// @inheritdoc IOpenfront
    function getLobby(bytes32 lobbyId)
        external
        view
        override
        returns (
            address host,
            uint256 betAmount,
            address[] memory participants,
            uint8 status,
            address winner,
            uint256 totalPrize,
            address stakeToken
        )
    {
        Lobby storage lobby = lobbies[lobbyId];
        address primaryWinner = lobby.winners.length > 0 ? lobby.winners[0] : address(0);
        return (
            lobby.host,
            lobby.betAmount,
            lobby.participants,
            uint8(lobby.status),
            primaryWinner,
            lobby.totalPrize,
            lobby.stakeToken
        );
    }

    /// @inheritdoc IOpenfront
    function getWinners(bytes32 lobbyId)
        external
        view
        override
        returns (address[] memory winners, uint256[] memory payouts)
    {
        Lobby storage lobby = lobbies[lobbyId];
        uint256 len = lobby.winners.length;
        winners = new address[](len);
        payouts = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            winners[i] = lobby.winners[i];
            payouts[i] = lobby.winnerPayouts[i];
        }
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
    function setGameServer(address _gameServer) external override onlyOwner {
        require(_gameServer != address(0), ZeroAddress());
        address prev = gameServer;
        gameServer = _gameServer;
        emit GameServerUpdated(prev, _gameServer);
    }

    /// @inheritdoc IOpenfront
    function setProtocolFee(uint256 feeBps) external override onlyOwner {
        require(feeBps <= 5000, InvalidAmount()); // Max 50%
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = feeBps;
        emit ProtocolFeeUpdated(oldFee, feeBps);
    }

    /// @inheritdoc IOpenfront
    function setFeeRecipient(address recipient) external override onlyOwner {
        require(recipient != address(0), ZeroAddress());
        address oldRecipient = feeRecipient;
        feeRecipient = recipient;
        emit FeeRecipientUpdated(oldRecipient, recipient);
    }

    /// @inheritdoc IOpenfront
    function setMaxPlayers(bytes32 lobbyId, uint256 maxPlayers)
        external
        override
        lobbyExists(lobbyId)
        onlyHost(lobbyId)
    {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        if (maxPlayers == 0 || maxPlayers > MAX_PLAYER_LIMIT) {
            revert InvalidParticipantBounds();
        }
        if (maxPlayers < lobby.participants.length) {
            revert InvalidParticipantBounds();
        }
        uint256 currentMin = lobbyMinPlayers[lobbyId];
        if (currentMin == 0) {
            currentMin = 2;
        }
        if (maxPlayers < currentMin) {
            revert InvalidParticipantBounds();
        }
        lobbyMaxPlayers[lobbyId] = maxPlayers;
    }

    /// @inheritdoc IOpenfront
    function getMaxPlayers(bytes32 lobbyId) external view override returns (uint256 maxPlayers) {
        uint256 configured = lobbyMaxPlayers[lobbyId];
        return configured == 0 ? MAX_PLAYER_LIMIT : configured;
    }

    /// @inheritdoc IOpenfront
    function setMinPlayers(bytes32 lobbyId, uint256 minPlayers)
        external
        override
        lobbyExists(lobbyId)
        onlyHost(lobbyId)
    {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        if (minPlayers == 0) {
            revert InvalidParticipantBounds();
        }
        uint256 maxPlayers = lobbyMaxPlayers[lobbyId];
        if (maxPlayers == 0 || maxPlayers > MAX_PLAYER_LIMIT) {
            maxPlayers = MAX_PLAYER_LIMIT;
        }
        if (minPlayers > maxPlayers) {
            revert InvalidParticipantBounds();
        }
        lobbyMinPlayers[lobbyId] = minPlayers;
    }

    /// @inheritdoc IOpenfront
    function getMinPlayers(bytes32 lobbyId) external view override returns (uint256 minPlayers) {
        uint256 configured = lobbyMinPlayers[lobbyId];
        return configured == 0 ? 2 : configured;
    }

    /// @inheritdoc IOpenfront
    function ejectParticipant(bytes32 lobbyId, address participant)
        external
        override
        nonReentrant
        lobbyExists(lobbyId)
        onlyGameServer
    {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        if (participant == lobby.host) {
            revert CannotEjectHost();
        }
        if (!hasJoined[lobbyId][participant]) {
            revert NotParticipant();
        }

        address[] storage parts = lobby.participants;
        uint256 len = parts.length;
        uint256 idx = type(uint256).max;
        for (uint256 i = 0; i < len; i++) {
            if (parts[i] == participant) {
                idx = i;
                break;
            }
        }
        if (idx == type(uint256).max) {
            revert NotParticipant();
        }

        parts[idx] = parts[len - 1];
        parts.pop();
        hasJoined[lobbyId][participant] = false;

        uint256 refund = lobby.betAmount;
        if (refund > 0) {
            if (lobby.totalPrize < refund) {
                revert InvalidParticipantBounds();
            }
            lobby.totalPrize -= refund;
            IERC20(lobby.stakeToken).safeTransfer(participant, refund);
        }

        emit ParticipantEjected(lobbyId, participant);
    }

    /// @inheritdoc IOpenfront
    function setAllowlistEnabled(bytes32 lobbyId, bool enabled)
        external
        override
        lobbyExists(lobbyId)
        onlyHost(lobbyId)
    {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        allowlistEnabled[lobbyId] = enabled;
        emit AllowlistEnabled(lobbyId, enabled);
    }

    /// @inheritdoc IOpenfront
    function addToAllowlist(bytes32 lobbyId, address[] calldata accounts)
        external
        override
        lobbyExists(lobbyId)
        onlyHost(lobbyId)
    {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        uint256 len = accounts.length;
        for (uint256 i = 0; i < len; i++) {
            address account = accounts[i];
            require(account != address(0), ZeroAddress());
            lobbyAllowlist[lobbyId][account] = true;
            emit AllowlistUpdated(lobbyId, account, true);
        }
    }

    /// @inheritdoc IOpenfront
    function removeFromAllowlist(bytes32 lobbyId, address[] calldata accounts)
        external
        override
        lobbyExists(lobbyId)
        onlyHost(lobbyId)
    {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        uint256 len = accounts.length;
        for (uint256 i = 0; i < len; i++) {
            address account = accounts[i];
            require(account != address(0), ZeroAddress());
            lobbyAllowlist[lobbyId][account] = false;
            emit AllowlistUpdated(lobbyId, account, false);
        }
    }

    function _claimableBalance(address account, address token) internal view returns (uint256) {
        require(token != address(0), InvalidPaymentAsset());
        return claimableTokenBalances[account][token];
    }

    function _creditClaimable(address account, address token, uint256 amount) internal returns (uint256) {
        require(token != address(0), InvalidPaymentAsset());
        if (amount == 0) {
            return _claimableBalance(account, token);
        }

        claimableTokenBalances[account][token] += amount;
        return claimableTokenBalances[account][token];
    }

    function _processWithdraw(address account, address token, uint256 amount) internal returns (uint256) {
        require(token != address(0), InvalidPaymentAsset());
        uint256 available = _claimableBalance(account, token);
        if (available < amount) revert InsufficientClaimableBalance();

        claimableTokenBalances[account][token] = available - amount;
        IERC20(token).safeTransfer(account, amount);
        emit PrizeWithdrawn(account, token, amount, claimableTokenBalances[account][token]);

        return amount;
    }

    function _collectProtocolFee(bytes32 lobbyId, uint256 pool, address token) internal returns (uint256) {
        if (protocolFeeBps == 0 || pool == 0) {
            return 0;
        }
        uint256 feeAmount = (pool * protocolFeeBps) / 10000;
        if (feeAmount == 0) {
            return 0;
        }
        uint256 recipientBalance = _creditClaimable(feeRecipient, token, feeAmount);
        emit ProtocolFeeCollected(lobbyId, token, feeAmount, feeRecipient, recipientBalance);
        return feeAmount;
    }

    function _clearSponsorState(bytes32 lobbyId) internal {
        address[] memory sponsors = sponsorList[lobbyId];
        uint256 len = sponsors.length;
        if (len == 0) {
            return;
        }
        for (uint256 i = 0; i < len; i++) {
            address sponsor = sponsors[i];
            sponsorBalances[lobbyId][sponsor] = 0;
            sponsorTracked[lobbyId][sponsor] = false;
        }
        delete sponsorList[lobbyId];
    }

    /// @inheritdoc IOpenfront
    function isAllowlistEnabled(bytes32 lobbyId) external view override returns (bool enabled) {
        return allowlistEnabled[lobbyId];
    }

    /// @inheritdoc IOpenfront
    function isAllowlisted(bytes32 lobbyId, address account) external view override returns (bool allowed) {
        return lobbyAllowlist[lobbyId][account];
    }

    /// @inheritdoc IOpenfront
    function cancelLobby(bytes32 lobbyId) external override nonReentrant lobbyExists(lobbyId) onlyHost(lobbyId) {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created, InvalidStatus());
        lobby.status = GameStatus.Claimed;

        uint256 refund = lobby.betAmount;
        address[] memory parts = lobby.participants;
        uint256 len = parts.length;
        IERC20 token = IERC20(lobby.stakeToken);
        for (uint256 i = 0; i < len; i++) {
            if (refund > 0) {
                token.safeTransfer(parts[i], refund);
            }
        }

        address[] memory sponsors = sponsorList[lobbyId];
        uint256 sponsorLen = sponsors.length;
        if (sponsorLen > 0) {
            for (uint256 i = 0; i < sponsorLen; i++) {
                address sponsor = sponsors[i];
                uint256 contribution = sponsorBalances[lobbyId][sponsor];
                if (contribution == 0) continue;
                sponsorBalances[lobbyId][sponsor] = 0;
                sponsorTracked[lobbyId][sponsor] = false;
                token.safeTransfer(sponsor, contribution);
            }
            delete sponsorList[lobbyId];
        }

        lobby.totalPrize = 0;
        emit LobbyCanceled(lobbyId);
    }

    function addToPrizePool(bytes32 lobbyId, uint256 amount) external override nonReentrant lobbyExists(lobbyId) {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.status == GameStatus.Created || lobby.status == GameStatus.InProgress, InvalidStatus());

        require(amount > 0, InvalidAmount());
        IERC20(lobby.stakeToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 contribution = amount;

        lobby.totalPrize += contribution;
        sponsorBalances[lobbyId][msg.sender] += contribution;
        if (!sponsorTracked[lobbyId][msg.sender]) {
            sponsorTracked[lobbyId][msg.sender] = true;
            sponsorList[lobbyId].push(msg.sender);
        }

        emit PrizePoolSponsored(lobbyId, msg.sender, contribution);
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
