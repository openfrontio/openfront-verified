import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import {
  Difficulty,
  GameMapName,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../core/game/Game";
import { GameConfig } from "../core/Schemas";

const config = getServerConfigFromServer();

// How many times each map should appear in the playlist.
// Note: The Partial should eventually be removed for better type safety.
const frequency: Partial<Record<GameMapName, number>> = {
  Africa: 7,
  Asia: 6,
  Australia: 4,
  Achiran: 5,
  Baikal: 5,
  BetweenTwoSeas: 5,
  BlackSea: 6,
  Britannia: 5,
  DeglaciatedAntarctica: 4,
  EastAsia: 5,
  Europe: 3,
  EuropeClassic: 3,
  FalklandIslands: 4,
  FaroeIslands: 4,
  GatewayToTheAtlantic: 5,
  Halkidiki: 4,
  Iceland: 4,
  Italia: 6,
  Japan: 6,
  Mars: 3,
  Mena: 6,
  Montreal: 6,
  NorthAmerica: 5,
  Pangaea: 5,
  Pluto: 6,
  SouthAmerica: 5,
  StraitOfGibraltar: 5,
  World: 8,
  Yenisei: 0,
};

export class MapPlaylist {
  public gameConfig(): GameConfig {
    const map = this.pickRandomMap();
    const mode = GameMode.FFA;
    const playerTeams = undefined;

    // Create the default public game config (from your GameManager)
    return {
      donateGold: false,
      donateTroops: false,
      gameMap: map,
      maxPlayers: config.lobbyMaxPlayers(map, mode, playerTeams),
      gameType: GameType.Public,
      gameMapSize: GameMapSize.Normal,
      difficulty: Difficulty.Medium,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      disableNPCs: false,
      gameMode: mode,
      playerTeams,
      bots: 400,
      disabledUnits: [],
    } satisfies GameConfig;
  }

  private pickRandomMap(): GameMapType {
    const maps: GameMapType[] = [];
    (Object.keys(GameMapType) as GameMapName[]).forEach((key) => {
      for (let i = 0; i < (frequency[key] ?? 0); i++) {
        maps.push(GameMapType[key]);
      }
    });

    if (maps.length === 0) {
      throw new Error("No maps configured for public lobby generation");
    }

    const index = Math.floor(Math.random() * maps.length);
    return maps[index];
  }
}
