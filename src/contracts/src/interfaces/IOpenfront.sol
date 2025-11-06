// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IOpenfront
 * @notice Interface for the Openfront on-chain game lobby and prize contract.
 * @dev Defines events, custom errors, and external functions used by frontends
 *      and off-chain game servers to manage game lobbies, joiners, outcomes,
 *      and prize claims in a consistent, production-friendly way.
 */
interface IOpenfront {
    // ============ Errors ============
    /// @notice Thrown when a referenced lobby does not exist
    error LobbyNotFound();
    /// @notice Thrown when trying to create a lobby that already exists
    error LobbyAlreadyExists();
    /// @notice Thrown when the caller is not the lobby host
    error NotHost();
    /// @notice Thrown when the caller is not the recorded winner
    error NotWinner();
    /// @notice Thrown when the caller is not the authorized game server
    error NotGameServer();
    /// @notice Thrown when a provided bet amount is zero or invalid
    error InvalidBetAmount();
    /// @notice Reserved error for capacity limits (not used in base impl)
    error LobbyFull();
    /// @notice Thrown when attempting to start a lobby that already started
    error GameAlreadyStarted();
    /// @notice Thrown when attempting to claim before a game is finished
    error GameNotFinished();
    /// @notice Thrown when attempting to claim a prize more than once
    error PrizeAlreadyClaimed();
    /// @notice Thrown when an address is not a participant in the lobby
    error NotParticipant();
    /// @notice Thrown when ETH sent with tx does not match required amount
    error InsufficientFunds();
    /// @notice Thrown when allowlist is enabled and caller is not allowlisted
    error NotAllowlisted();
    /// @notice Thrown when an address has already joined the lobby
    error AlreadyParticipant();
    /// @notice Thrown when an operation is invalid for the current status
    error InvalidStatus();
    /// @notice Thrown when not enough players are present to start the game
    error TooFewPlayers();
    /// @notice Thrown when a zero address is provided where not allowed
    error ZeroAddress();
    /// @notice Thrown when ETH transfer to winner fails
    error TransferFailed();
    /// @notice Thrown when refund to a participant fails
    error RefundFailed();
    /// @notice Thrown when ERC20 transfer fails
    error TokenTransferFailed();
    /// @notice Thrown when provided amount is zero
    error InvalidAmount();
    /// @notice Thrown when native/erc20 payment mismatches lobby configuration
    error InvalidPaymentAsset();
    /// @notice Thrown when participant min/max bounds are invalid
    error InvalidParticipantBounds();
    /// @notice Thrown when attempting to eject the lobby host
    error CannotEjectHost();

    // ============ Events ============
    /**
     * @notice Emitted when a lobby is created.
     * @param lobbyId Unique lobby identifier provided by the frontend.
     * @param host Address of the lobby host (creator).
     * @param betAmount Amount of ETH each participant must stake to join.
     */
    event LobbyCreated(bytes32 indexed lobbyId, address indexed host, uint256 betAmount);

    /**
     * @notice Emitted when a participant joins a lobby.
     * @param lobbyId Unique lobby identifier.
     * @param participant Address of the participant that joined.
     */
    event ParticipantJoined(bytes32 indexed lobbyId, address indexed participant);

    /**
     * @notice Emitted when a lobby is started by the host.
     * @param lobbyId Unique lobby identifier.
     */
    event GameStarted(bytes32 indexed lobbyId);

    /**
     * @notice Emitted when the game server declares a winner.
     * @param lobbyId Unique lobby identifier.
     * @param winner Address of the winning participant.
     */
    event GameFinished(bytes32 indexed lobbyId, address indexed winner);

    /**
     * @notice Emitted when the winner claims the prize.
     * @param lobbyId Unique lobby identifier.
     * @param winner Address of the winner who received the prize.
     * @param amount Amount of ETH transferred to the winner.
     */
    event PrizeClaimed(bytes32 indexed lobbyId, address indexed winner, uint256 amount);

    /**
     * @notice Emitted when the owner updates the game server address.
     * @param previousServer The previous game server address.
     * @param newServer The new game server address.
     */
    event GameServerUpdated(address indexed previousServer, address indexed newServer);

    /**
     * @notice Emitted when the host cancels a lobby before it starts.
     * @param lobbyId Unique lobby identifier.
     */
    event LobbyCanceled(bytes32 indexed lobbyId);

    /**
     * @notice Emitted when someone sponsors additional prize funds for a lobby.
     * @param lobbyId Unique lobby identifier.
     * @param sponsor Address of the sponsor contributing funds.
     * @param amount Amount of funds contributed to the prize pool.
     */
    event PrizePoolSponsored(bytes32 indexed lobbyId, address indexed sponsor, uint256 amount);

    /**
     * @notice Emitted when the game server ejects a participant and refunds them.
     * @param lobbyId Unique lobby identifier.
     * @param participant Address that was removed from the lobby.
     */
    event ParticipantEjected(bytes32 indexed lobbyId, address indexed participant);

    /**
     * @notice Emitted when the host toggles allowlist mode for a lobby.
     * @param lobbyId Unique lobby identifier.
     * @param enabled Whether allowlist enforcement is enabled.
     */
    event AllowlistEnabled(bytes32 indexed lobbyId, bool enabled);

    /**
     * @notice Emitted when an address\'s allowlist status changes for a lobby.
     * @param lobbyId Unique lobby identifier.
     * @param account Address whose allowlist status changed.
     * @param allowed Whether the address is now allowed.
     */
    event AllowlistUpdated(bytes32 indexed lobbyId, address indexed account, bool allowed);

    // ============ External Functions ============
    /**
     * @notice Create a new lobby and stake the host's bet.
     * @dev `msg.value` must equal `betAmount`. The host is added as the first
     *      participant and the lobby status is set to Created.
     * @param lobbyId Unique identifier for the lobby (frontend-generated).
     * @param betAmount Exact ETH amount each participant must provide to join.
     * @param isPublic If true, the lobby is discoverable via public listings.
     */
    function createLobby(bytes32 lobbyId, uint256 betAmount, bool isPublic, address stakeToken) external payable;

    /**
     * @notice Join an existing lobby by paying the exact bet amount.
     * @dev Reverts if the lobby does not exist, has started, or the caller
     *      already joined. `msg.value` must equal the lobby's bet amount.
     * @param lobbyId Unique identifier of the lobby to join.
     */
    function joinLobby(bytes32 lobbyId) external payable;

    /**
     * @notice Start a lobby so that no new participants can join.
     * @dev Only the host can start the lobby. Requires at least 2 participants.
     * @param lobbyId Unique identifier of the lobby to start.
     */
    function startGame(bytes32 lobbyId) external;

    /**
     * @notice Declare the winner of an in-progress lobby.
     * @dev Only callable by the authorized game server. The `winner` must be a
     *      participant in the lobby. Sets status to Finished on success.
     * @param lobbyId Unique identifier of the lobby.
     * @param winner Address of the participant who won the game.
     */
    function declareWinner(bytes32 lobbyId, address winner) external;

    /**
     * @notice Claim the prize for a finished lobby.
     * @dev Only the recorded winner can claim. Transfers the entire prize pool
     *      to the winner and finalizes the lobby.
     * @param lobbyId Unique identifier of the lobby.
     */
    function claimPrize(bytes32 lobbyId) external;

    /**
     * @notice Cancel a lobby before it starts and refund all participants.
     * @dev Only the host can cancel, only when the lobby is in Created status.
     *      Transfers each participant's stake back and finalizes the lobby.
     * @param lobbyId Unique identifier of the lobby.
     */
    function cancelLobby(bytes32 lobbyId) external;

    /**
     * @notice Eject a participant from a lobby and refund their stake.
     * @dev Only callable by the authorized game server while the lobby is in Created status.
     * @param lobbyId Unique identifier of the lobby.
     * @param participant Address being removed from the lobby.
     */
    function ejectParticipant(bytes32 lobbyId, address participant) external;

    /**
     * @notice Sponsor a lobby by contributing additional funds to the prize pool.
     * @dev Accepts either native currency or the configured ERC20 stake token.
     * @param lobbyId Unique identifier of the lobby to sponsor.
     * @param amount Amount being contributed (ignored for native; msg.value is used).
     */
    function addToPrizePool(bytes32 lobbyId, uint256 amount) external payable;

    /**
     * @notice Read a lobby's details.
     * @param lobbyId Unique identifier of the lobby.
     * @return host The lobby host address.
     * @return betAmount The per-participant bet amount in wei.
     * @return participants The array of participant addresses.
     * @return status The current game status.
     * @return winner The recorded winner address if finished, otherwise zero.
     * @return totalPrize The current prize pool for the lobby.
     */
    function getLobby(bytes32 lobbyId)
        external
        view
        returns (
            address host,
            uint256 betAmount,
            address[] memory participants,
            uint8 status,
            address winner,
            uint256 totalPrize,
            address stakeToken
        );

    /**
     * @notice Return current number of participants for a lobby.
     * @param lobbyId Unique identifier of the lobby.
     * @return count Number of participants.
     */
    function getParticipantCount(bytes32 lobbyId) external view returns (uint256 count);

    /**
     * @notice Check whether an address is a participant of a lobby.
     * @param lobbyId Unique identifier of the lobby.
     * @param participant Address to check.
     * @return isMember True if `participant` has joined the lobby.
     */
    function isParticipant(bytes32 lobbyId, address participant) external view returns (bool isMember);

    /**
     * @notice Get all public lobby identifiers.
     * @return ids Array of public lobby IDs.
     */
    function getAllPublicLobbies() external view returns (bytes32[] memory ids);

    /**
     * @notice Get all private lobby identifiers.
     * @return ids Array of private lobby IDs.
     */
    function getAllPrivateLobbies() external view returns (bytes32[] memory ids);

    /**
     * @notice Get a paginated slice of public lobby identifiers.
     * @param offset Starting index in the public lobby list.
     * @param limit Maximum number of items to return.
     * @return ids Slice of public lobby IDs in the requested range.
     */
    function getPublicLobbies(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids);

    /**
     * @notice Get a paginated slice of private lobby identifiers.
     * @param offset Starting index in the private lobby list.
     * @param limit Maximum number of items to return.
     * @return ids Slice of private lobby IDs in the requested range.
     */
    function getPrivateLobbies(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids);

    /**
     * @notice Get the total number of public lobbies.
     * @return count Number of public lobbies recorded.
     */
    function getPublicLobbyCount() external view returns (uint256 count);

    /**
     * @notice Get the total number of private lobbies.
     * @return count Number of private lobbies recorded.
     */
    function getPrivateLobbyCount() external view returns (uint256 count);

    /**
     * @notice Set or update the authorized game server address.
     * @dev Intended to be restricted to the contract owner in implementations.
     * @param _gameServer Address of the new game server.
     */
    function setGameServer(address _gameServer) external;

    /**
     * @notice Set a maximum participant limit for a lobby.
     * @dev Only the host can set the limit and only while in Created status.
     *      The value must be between 1 and 100 (inclusive) and not below the
     *      current participant count or the configured minimum.
     * @param lobbyId Unique identifier of the lobby.
     * @param maxPlayers Maximum allowed participants (1-100).
     */
    function setMaxPlayers(bytes32 lobbyId, uint256 maxPlayers) external;

    /**
     * @notice Get the current maximum participant limit for a lobby.
     * @param lobbyId Unique identifier of the lobby.
     * @return maxPlayers Maximum allowed participants (defaults to 100).
     */
    function getMaxPlayers(bytes32 lobbyId) external view returns (uint256 maxPlayers);

    /**
     * @notice Set a minimum participant requirement for a lobby to start.
     * @dev Only the host, only while in Created status. Must be between 1 and
     *      the configured maximum (inclusive).
     * @param lobbyId Unique identifier of the lobby.
     * @param minPlayers Minimum required participants to start the game.
     */
    function setMinPlayers(bytes32 lobbyId, uint256 minPlayers) external;

    /**
     * @notice Get the configured minimum participant requirement for a lobby.
     * @param lobbyId Unique identifier of the lobby.
     * @return minPlayers Minimum required participants to start the game.
     */
    function getMinPlayers(bytes32 lobbyId) external view returns (uint256 minPlayers);

    // ========= Allowlist Controls =========

    /**
     * @notice Enable or disable allowlist enforcement for a lobby.
     * @dev Only the host, only while in Created status.
     */
    function setAllowlistEnabled(bytes32 lobbyId, bool enabled) external;

    /**
     * @notice Add multiple addresses to the lobby\'s allowlist.
     * @dev Only the host, only while in Created status.
     */
    function addToAllowlist(bytes32 lobbyId, address[] calldata accounts) external;

    /**
     * @notice Remove multiple addresses from the lobby\'s allowlist.
     * @dev Only the host, only while in Created status.
     */
    function removeFromAllowlist(bytes32 lobbyId, address[] calldata accounts) external;

    /**
     * @notice Check whether allowlist enforcement is enabled for a lobby.
     */
    function isAllowlistEnabled(bytes32 lobbyId) external view returns (bool enabled);

    /**
     * @notice Check whether an address is allowlisted for a lobby.
     */
    function isAllowlisted(bytes32 lobbyId, address account) external view returns (bool allowed);
}
