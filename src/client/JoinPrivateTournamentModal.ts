import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { formatEther } from "viem";
import type { ServerConfig } from "../core/configuration/Config";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import type { ClientInfo, GameConfig, GameInfo } from "../core/Schemas";
import { generateID } from "../core/Util";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import {
  GameStatus,
  getLobbyInfo,
  joinLobby as joinLobbyOnchain,
  type LobbyInfo,
} from "./Contract";
import { JoinLobbyEvent } from "./Main";
import { translateText } from "./Utils";

interface TournamentSummary {
  lobbyInfo: LobbyInfo;
  gameInfo: GameInfo | null;
}

@customElement("join-private-tournament-modal")
export class JoinPrivateTournamentModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  @query("#tournamentIdInput") private tournamentIdInput!: HTMLInputElement;

  @state() private tournamentId = "";
  @state() private loading = false;
  @state() private error = "";
  @state() private details: TournamentSummary | null = null;
  @state() private joining = false;
  @state() private joined = false;
  @state() private waitingRoomClients: ClientInfo[] = [];

  private pollInterval: number | null = null;
  private serverConfig: ServerConfig | null = null;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.stopWaitingRoomPolling();
    super.disconnectedCallback();
  }

  createRenderRoot() {
    return this;
  }

  public open(id: string = "") {
    this.resetState();
    if (id) {
      this.tournamentId = id;
    }
    this.modalEl?.open();
    if (id) {
      this.loadDetails();
    }
  }

  public close() {
    this.stopWaitingRoomPolling();
    this.modalEl?.close();
  }

  private resetState() {
    this.tournamentId = "";
    this.loading = false;
    this.error = "";
    this.details = null;
    this.joining = false;
    this.joined = false;
    this.waitingRoomClients = [];
    this.stopWaitingRoomPolling();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    this.tournamentId = target.value;
    if (this.error) {
      this.error = "";
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.loadDetails();
    }
  };

  private async ensureServerConfig(): Promise<ServerConfig> {
    if (this.serverConfig) return this.serverConfig;
    this.serverConfig = await getServerConfigFromClient();
    return this.serverConfig;
  }

  private async loadDetails() {
    const lobbyId = this.tournamentId.trim();
    if (!lobbyId) {
      this.error = "Enter a tournament code first.";
      return;
    }

    this.loading = true;
    this.error = "";
    this.details = null;
    this.joined = false;
    this.waitingRoomClients = [];
    this.stopWaitingRoomPolling();

    try {
      const [lobbyInfo, gameInfo] = await Promise.all([
        getLobbyInfo(lobbyId),
        this.fetchGameInfo(lobbyId),
      ]);

      if (!lobbyInfo || !lobbyInfo.exists) {
        this.error = translateText("private_lobby.not_found");
        return;
      }

      if (lobbyInfo.status !== GameStatus.Created) {
        this.error = "This tournament has already started or finished.";
        return;
      }

      if (!gameInfo) {
        this.error = translateText("private_lobby.not_found");
        return;
      }

      this.details = { lobbyInfo, gameInfo };
      this.waitingRoomClients = gameInfo.clients ?? [];
    } catch (err: any) {
      console.error("Failed to load tournament details:", err);
      this.error = err?.message ?? "Unable to load tournament details.";
    } finally {
      this.loading = false;
    }
  }

  private async fetchGameInfo(lobbyId: string): Promise<GameInfo | null> {
    try {
      const config = await this.ensureServerConfig();
      const response = await fetch(
        `/${config.workerPath(lobbyId)}/api/game/${lobbyId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      return (await response.json()) as GameInfo;
    } catch (err) {
      console.error("Failed to fetch game info:", err);
      throw err;
    }
  }

  private async joinTournament() {
    const lobbyId = this.tournamentId.trim();
    if (!lobbyId || !this.details) {
      this.error = "Load the tournament details before joining.";
      return;
    }

    this.joining = true;
    this.error = "";
    try {
      await joinLobbyOnchain({ lobbyId });

      this.joined = true;
      this.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID: lobbyId,
            clientID: generateID(),
          } as JoinLobbyEvent,
          bubbles: true,
          composed: true,
        }),
      );

      await this.pollWaitingRoomParticipants();
      this.pollInterval = window.setInterval(
        () => this.pollWaitingRoomParticipants(),
        2000,
      );
    } catch (err: any) {
      console.error("Failed to join tournament:", err);
      this.error = err?.message ?? "Unable to join tournament.";
      this.joined = false;
    } finally {
      this.joining = false;
    }
  }

  private async pollWaitingRoomParticipants() {
    const lobbyId = this.tournamentId.trim();
    if (!lobbyId) return;

    try {
      const config = await this.ensureServerConfig();
      const response = await fetch(
        `/${config.workerPath(lobbyId)}/api/game/${lobbyId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) return;

      const gameInfo = (await response.json()) as GameInfo;
      this.waitingRoomClients = gameInfo.clients ?? [];
    } catch (err) {
      console.error("Failed to poll waiting room participants:", err);
    }
  }

  private stopWaitingRoomPolling() {
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private shortenAddress(address: string) {
    if (!address) return "-";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private formatStatus(status: GameStatus) {
    switch (status) {
      case GameStatus.Created:
        return "Open";
      case GameStatus.InProgress:
        return "In Progress";
      case GameStatus.Finished:
        return "Finished";
      case GameStatus.Claimed:
        return "Claimed";
      default:
        return "Unknown";
    }
  }

  private renderDetailItem(label: string, value: string | number | null) {
    if (value === null || value === undefined || value === "") return null;
    return html`
      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:8px 0;
          border-bottom:1px solid rgba(255,255,255,0.06);
          font-size:14px;
        "
      >
        <span style="color:#9ca3af;">${label}</span>
        <span style="color:#f9fafb; font-weight:600;">${value}</span>
      </div>
    `;
  }

  private renderWaitingRoom() {
    if (this.waitingRoomClients.length === 0) {
      return null;
    }

    const label =
      this.waitingRoomClients.length === 1
        ? translateText("private_lobby.player")
        : translateText("private_lobby.players");

    return html`
      <div class="options-section">
        <div class="option-title">
          ${this.waitingRoomClients.length} ${label}
        </div>
        <div class="players-list">
          ${this.waitingRoomClients.map(
            (client) =>
              html`<span class="player-tag">${client.username}</span>`,
          )}
        </div>
      </div>
    `;
  }

  private renderDetails() {
    if (this.loading) {
      return html`
        <div class="join-private-tournament__details">
          <div class="join-private-tournament__state">Loading…</div>
        </div>
      `;
    }

    if (!this.details) {
      return html`
        <div class="join-private-tournament__details">
          <div class="join-private-tournament__state">
            Enter a tournament code above and press “Load Tournament” to view
            its details.
          </div>
        </div>
      `;
    }

    const { lobbyInfo, gameInfo } = this.details;
    const mapSettings: Array<{ label: string; value: string | number | null }> =
      [];

    const config: GameConfig | undefined = gameInfo?.gameConfig ?? undefined;
    if (config) {
      mapSettings.push(
        { label: "Map", value: config.gameMap },
        { label: "Size", value: config.gameMapSize },
        { label: "Mode", value: config.gameMode },
        { label: "Difficulty", value: config.difficulty },
        { label: "Bots", value: config.bots },
      );
    }

    const summaryItems = [
      {
        label: "Host",
        value: this.shortenAddress(lobbyInfo.host),
      },
      {
        label: "Entry Cost",
        value: `${formatEther(lobbyInfo.betAmount)} ETH`,
      },
      {
        label: "Status",
        value: this.formatStatus(lobbyInfo.status),
      },
      {
        label: "Players",
        value: `${lobbyInfo.participants.length}${
          config?.maxPlayers ? ` / ${config.maxPlayers}` : ""
        }`,
      },
      {
        label: "Prize Pool",
        value: `${formatEther(lobbyInfo.totalPrize)} ETH`,
      },
    ];

    if (gameInfo?.msUntilStart !== undefined) {
      const seconds = Math.max(0, Math.round(gameInfo.msUntilStart / 1000));
      summaryItems.push({
        label: "Starts In",
        value: `${seconds}s`,
      });
    }

    return html`
      <div class="join-private-tournament__details">
        <div class="options-layout">
          <div class="options-section">
            <div class="option-title">Tournament Details</div>
            ${summaryItems.map((item) =>
              this.renderDetailItem(item.label, item.value),
            )}
          </div>
          ${mapSettings.length
            ? html`<div class="options-section">
                <div class="option-title">Game Settings</div>
                ${mapSettings.map((item) =>
                  this.renderDetailItem(item.label, item.value),
                )}
              </div>`
            : ""}
          ${this.renderWaitingRoom()}
        </div>
      </div>
    `;
  }

  private get joinStatus(): {
    type: "info" | "success";
    message: string;
  } | null {
    const lobbyId = this.tournamentId.trim();
    if (this.joining) {
      return {
        type: "info",
        message: `Joining ${lobbyId}… Confirm the transaction in your wallet.`,
      };
    }
    if (this.joined) {
      return {
        type: "success",
        message: `You joined ${lobbyId}. Keep this window open while waiting for the match to begin.`,
      };
    }
    return null;
  }

  render() {
    const rawTitle = translateText("private_lobby.title");
    const title =
      rawTitle === "private_lobby.title" ? "Join Private Tournament" : rawTitle;
    const joinStatus = this.joinStatus;

    return html`
      <o-modal title="${title}">
        <div class="join-private-tournament">
          <div class="join-private-tournament__input-group">
            <label
              class="join-private-tournament__label"
              for="tournamentIdInput"
            >
              ${translateText("private_lobby.enter_id")}
            </label>
            <div class="join-private-tournament__input-row">
              <input
                class="join-private-tournament__input"
                type="text"
                id="tournamentIdInput"
                placeholder=${translateText("private_lobby.enter_id")}
                .value=${this.tournamentId}
                @input=${this.handleInput}
                @keyup=${this.handleKeyUp}
              />
              <button
                @click=${this.pasteFromClipboard}
                class="join-private-tournament__paste"
                title="Paste from clipboard"
                aria-label="Paste from clipboard"
                type="button"
              >
                <svg
                  stroke="currentColor"
                  fill="currentColor"
                  stroke-width="0"
                  viewBox="0 0 32 32"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M 15 3 C 13.742188 3 12.847656 3.890625 12.40625 5 L 5 5 L 5 28 L 13 28 L 13 30 L 27 30 L 27 14 L 25 14 L 25 5 L 17.59375 5 C 17.152344 3.890625 16.257813 3 15 3 Z M 15 5 C 15.554688 5 16 5.445313 16 6 L 16 7 L 19 7 L 19 9 L 11 9 L 11 7 L 14 7 L 14 6 C 14 5.445313 14.445313 5 15 5 Z M 7 7 L 9 7 L 9 11 L 21 11 L 21 7 L 23 7 L 23 14 L 13 14 L 13 26 L 7 26 Z M 15 16 L 25 16 L 25 28 L 15 28 Z"
                  ></path>
                </svg>
              </button>
            </div>
          </div>

          <div class="join-private-tournament__button-row">
            <o-button
              title="Load Tournament"
              block
              secondary
              ?disabled=${this.loading || !this.tournamentId.trim()}
              @click=${this.loadDetails}
              style="width: 100%; max-width: 320px;"
            ></o-button>
          </div>

          ${this.error
            ? html`<div class="join-private-tournament__message">
                <div class="message-area error show">${this.error}</div>
              </div>`
            : ""}
          ${joinStatus
            ? html`<div class="join-private-tournament__message">
                <div class="message-area ${joinStatus.type} show">
                  ${joinStatus.message}
                </div>
              </div>`
            : ""}
          ${this.renderDetails()}
          ${this.details && !this.joined
            ? html`<div class="join-private-tournament__button-row">
                <o-button
                  title=${this.joining
                    ? "Joining…"
                    : translateText("private_lobby.join_lobby")}
                  block
                  ?disabled=${this.joining}
                  @click=${this.joinTournament}
                  style="width: 100%; max-width: 320px;"
                ></o-button>
              </div>`
            : ""}
        </div>
      </o-modal>
    `;
  }

  private async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      this.tournamentId = text.trim();
      if (this.tournamentIdInput) {
        this.tournamentIdInput.value = this.tournamentId;
      }
      await this.loadDetails();
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      this.error = "Unable to paste from clipboard.";
    }
  }
}
