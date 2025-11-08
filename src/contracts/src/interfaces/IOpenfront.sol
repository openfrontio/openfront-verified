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
    /// @notice Thrown when attempting to withdraw more than the caller has accrued
    error InsufficientClaimableBalance();
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
     * @notice Emitted when the game server declares winner(s) for a lobby.
     * @param lobbyId Unique lobby identifier.
     * @param primaryWinner The first winner in the declared winners list (for backwards compatibility).
     */
    event GameFinished(bytes32 indexed lobbyId, address indexed primaryWinner);

    /**
     * @notice Emitted when the game server declares winner(s) for a lobby with their payout amounts.
     * @param lobbyId Unique lobby identifier.
     * @param winners Array of winner addresses.
     * @param payouts Array of payout amounts (in the lobby's stake token) credited to each winner.
     * @param stakeToken Address of the stake token.
     * @param totalPrize Total amount distributed for the lobby.
     * @param feeAmount Amount deducted as protocol fee.
     */
    event GameFinishedMulti(
        bytes32 indexed lobbyId,
        address[] winners,
        uint256[] payouts,
        address stakeToken,
        uint256 totalPrize,
        uint256 feeAmount
    );

    /**
     * @notice Emitted whenever a winner's accrued prize balance increases.
     * @param lobbyId Unique lobby identifier.
     * @param winner Address of the winner whose balance was increased.
     * @param token Address of the prize token (zero for native).
     * @param amount Amount credited for this lobby distribution.
     * @param newBalance New total claimable balance for the winner/token pair.
     */
    event PrizeBalanceIncreased(
        bytes32 indexed lobbyId,
        address indexed winner,
        address indexed token,
        uint256 amount,
        uint256 newBalance
    );

    /**
     * @notice Emitted when a user withdraws accrued prize funds.
     * @param account Address performing the withdrawal.
     * @param token Address of the token withdrawn (zero for native).
     * @param amount Amount withdrawn.
     * @param remainingBalance Remaining claimable balance for the user after withdrawal.
     */
    event PrizeWithdrawn(
        address indexed account,
        address indexed token,
        uint256 amount,
        uint256 remainingBalance
    );

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

    /**
     * @notice Emitted when a protocol fee is collected from a lobby's prize pool.
     * @param lobbyId Unique lobby identifier.
     * @param token Address of the ERC20 token.
     * @param feeAmount Amount deducted as protocol fee.
     * @param recipient Address receiving the fee.
     * @param recipientNewBalance New total claimable balance for the recipient.
     */
    event ProtocolFeeCollected(
        bytes32 indexed lobbyId,
        address indexed token,
        uint256 feeAmount,
        address indexed recipient,
        uint256 recipientNewBalance
    );

    /**
     * @notice Emitted when the protocol fee percentage is updated.
     * @param oldFeeBps Previous fee in basis points.
     * @param newFeeBps New fee in basis points.
     */
    event ProtocolFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    /**
     * @notice Emitted when the fee recipient address is updated.
     * @param oldRecipient Previous fee recipient.
     * @param newRecipient New fee recipient.
     */
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    // ============ External Functions ============
    /**
     * @notice Create a new lobby and stake the host's bet.
     * @dev The stake token must be a non-zero ERC20. Transfers `betAmount` tokens
     *      from the host into the contract. No ETH should be sent.
     * @param lobbyId Unique identifier for the lobby (frontend-generated).
     * @param betAmount Exact token amount each participant must provide to join.
     * @param isPublic If true, the lobby is discoverable via public listings.
     */
    function createLobby(bytes32 lobbyId, uint256 betAmount, bool isPublic, address stakeToken) external;

    /**
     * @notice Join an existing lobby by paying the exact bet amount.
     * @dev Reverts if the lobby does not exist, has started, or the caller already joined.
     *      Transfers `betAmount` of the configured ERC20 from the caller. No ETH should be sent.
     * @param lobbyId Unique identifier of the lobby to join.
     */
    function joinLobby(bytes32 lobbyId) external;

    /**
     * @notice Start a lobby so that no new participants can join.
     * @dev Only the host can start the lobby. Requires at least 2 participants.
     * @param lobbyId Unique identifier of the lobby to start.
     */
    function startGame(bytes32 lobbyId) external;

    /**
     * @notice Declare winner(s) of an in-progress lobby using optional payout weights.
     * @dev Only callable by the authorized game server. All winners must be participants.
     *      If `payoutWeights` is empty, the prize pool is split evenly. Otherwise, the
     *      prize pool is distributed in proportion to each weight. Rounding dust is
     *      assigned to the final winner in the list.
     * @param lobbyId Unique identifier of the lobby.
     * @param winners Array of winner addresses.
     * @param payoutWeights Optional array of relative payout weights corresponding to `winners`.
     */
    function declareWinners(bytes32 lobbyId, address[] calldata winners, uint256[] calldata payoutWeights) external;

    /**
     * @notice Convenience helper to declare a single winner (maintained for backwards compatibility).
     * @dev Delegates to `declareWinners`.
     * @param lobbyId Unique identifier of the lobby.
     * @param winner Address of the participant who won the game.
     */
    function declareWinner(bytes32 lobbyId, address winner) external;

    /**
     * @notice Withdraw accrued prize funds for the specified token.
     * @dev Reverts if amount is zero or exceeds the caller's claimable balance.
     * @param token Address of the ERC20 token to withdraw.
     * @param amount Amount to withdraw.
     * @return withdrawn The actual amount withdrawn.
     */
    function withdraw(address token, uint256 amount) external returns (uint256 withdrawn);

    /**
     * @notice Withdraw the caller's entire accrued prize balance for the specified token.
     * @param token Address of the ERC20 token to withdraw.
     * @return withdrawn The total amount withdrawn.
     */
    function withdrawAll(address token) external returns (uint256 withdrawn);

    /**
     * @notice Get the winners and their payout amounts for a lobby.
     * @param lobbyId Unique lobby identifier.
     * @return winners Array of winner addresses.
     * @return payouts Array of payout amounts credited to each winner.
     */
    function getWinners(bytes32 lobbyId) external view returns (address[] memory winners, uint256[] memory payouts);

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
     * @dev Transfers the configured ERC20 stake token from the sponsor. No ETH should be sent.
     * @param lobbyId Unique identifier of the lobby to sponsor.
     * @param amount Amount of tokens being contributed.
     */
    function addToPrizePool(bytes32 lobbyId, uint256 amount) external;

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
     * @notice Set the protocol fee percentage.
     * @dev Only callable by contract owner. Fee is in basis points (0-5000, max 50%).
     * @param feeBps Fee percentage in basis points (e.g., 500 = 5%).
     */
    function setProtocolFee(uint256 feeBps) external;

    /**
     * @notice Set the address that receives protocol fees.
     * @dev Only callable by contract owner.
     * @param recipient Address to receive fees.
     */
    function setFeeRecipient(address recipient) external;

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
