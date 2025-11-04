export const ContractABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_gameServer",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addToAllowlist",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "accounts",
        type: "address[]",
        internalType: "address[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addToPrizePool",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "cancelLobby",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimPrize",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createLobby",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "betAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "isPublic",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "stakeToken",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "declareWinner",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "winner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "gameServer",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllPrivateLobbies",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllPublicLobbies",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLobby",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "host",
        type: "address",
        internalType: "address",
      },
      {
        name: "betAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "participants",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "status",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "winner",
        type: "address",
        internalType: "address",
      },
      {
        name: "totalPrize",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "stakeToken",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMaxPlayers",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "maxPlayers",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getParticipantCount",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPrivateLobbies",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPrivateLobbyCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPublicLobbies",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPublicLobbyCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isAllowlistEnabled",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "enabled",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isAllowlisted",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "allowed",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isParticipant",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "participant",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isPublicLobby",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "joinLobby",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "lobbies",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "host",
        type: "address",
        internalType: "address",
      },
      {
        name: "betAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "status",
        type: "uint8",
        internalType: "enum Openfront.GameStatus",
      },
      {
        name: "winner",
        type: "address",
        internalType: "address",
      },
      {
        name: "totalPrize",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "stakeToken",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "privateLobbyIds",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "publicLobbyIds",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "removeFromAllowlist",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "accounts",
        type: "address[]",
        internalType: "address[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAllowlistEnabled",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "enabled",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setGameServer",
    inputs: [
      {
        name: "_gameServer",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMaxPlayers",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "maxPlayers",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "startGame",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "AllowlistEnabled",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "enabled",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "AllowlistUpdated",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "allowed",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameFinished",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "winner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameServerUpdated",
    inputs: [
      {
        name: "previousServer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newServer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameStarted",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LobbyCanceled",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LobbyCreated",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "host",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "betAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ParticipantJoined",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "participant",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PrizeClaimed",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "winner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PrizePoolSponsored",
    inputs: [
      {
        name: "lobbyId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "sponsor",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AlreadyParticipant",
    inputs: [],
  },
  {
    type: "error",
    name: "GameAlreadyStarted",
    inputs: [],
  },
  {
    type: "error",
    name: "GameNotFinished",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientFunds",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAmount",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidBetAmount",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPaymentAsset",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidStatus",
    inputs: [],
  },
  {
    type: "error",
    name: "LobbyAlreadyExists",
    inputs: [],
  },
  {
    type: "error",
    name: "LobbyFull",
    inputs: [],
  },
  {
    type: "error",
    name: "LobbyNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAllowlisted",
    inputs: [],
  },
  {
    type: "error",
    name: "NotGameServer",
    inputs: [],
  },
  {
    type: "error",
    name: "NotHost",
    inputs: [],
  },
  {
    type: "error",
    name: "NotParticipant",
    inputs: [],
  },
  {
    type: "error",
    name: "NotWinner",
    inputs: [],
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "PrizeAlreadyClaimed",
    inputs: [],
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: [],
  },
  {
    type: "error",
    name: "RefundFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "TokenTransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "TooFewPlayers",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
];
