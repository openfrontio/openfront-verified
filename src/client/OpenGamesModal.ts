import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { formatUnits } from "viem";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import type { ClientInfo, GameInfo } from "../core/Schemas";
import { generateID } from "../core/Util";
import "./components/baseComponents/Modal";
import {
  getAllPublicLobbiesWithDetails,
  getLobbyInfo,
  joinLobby,
  type PublicLobbyInfo,
} from "./Contract";
import { JoinLobbyEvent } from "./Main";
import { translateText } from "./Utils";

@customElement("open-games-modal")
export class OpenGamesModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  @state() private lobbies: PublicLobbyInfo[] = [];
  @state() private loading: boolean = false;
  @state() private error: string = "";
  @state() private joiningLobbyId: string | null = null;
  @state() private joinedLobbyId: string | null = null;
  @state() private waitingRoomClients: ClientInfo[] = [];
  @state() private isInWaitingRoom: boolean = false;
  @state() private expandedLobbyId: string | null = null;
  @state() private gameInfoCache: Map<string, GameInfo> = new Map();

  private refreshTimer: number | null = null;
  private waitingRoomPollTimer: number | null = null;
  private isInitialLoad: boolean = true;

  createRenderRoot() {
    return this;
  }

  public open() {
    this.isInitialLoad = true;
    this.loading = true;
    this.error = "";
    this.joiningLobbyId = null;
    this.joinedLobbyId = null;
    this.isInWaitingRoom = false;
    this.waitingRoomClients = [];
    this.fetchLobbies();
    this.refreshTimer ??= window.setInterval(() => this.fetchLobbies(), 5000);
    this.modalEl?.open();
  }

  public close() {
    // Prevent closing if in waiting room
    if (this.isInWaitingRoom) {
      return;
    }
    this.forceClose();
  }

  public forceClose() {
    this.modalEl?.close();
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.waitingRoomPollTimer !== null) {
      clearInterval(this.waitingRoomPollTimer);
      this.waitingRoomPollTimer = null;
    }
    this.joiningLobbyId = null;
    this.joinedLobbyId = null;
    this.isInWaitingRoom = false;
  }

  private async fetchLobbies() {
    try {
      // Only show loading indicator on initial load, not during background refreshes
      if (this.isInitialLoad) {
        this.loading = true;
      }
      const all = await getAllPublicLobbiesWithDetails();
      // Only show not-started games (status Created = 0)
      this.lobbies = (all ?? []).filter((l) => l.status === 0);
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      if (this.isInitialLoad) {
        this.loading = false;
        this.isInitialLoad = false;
      }
    }
  }

  private async handleJoin(lobby: PublicLobbyInfo) {
    if (this.joiningLobbyId === lobby.lobbyId) return;
    try {
      this.error = "";
      this.joinedLobbyId = null;
      this.joiningLobbyId = lobby.lobbyId;
      const latestInfo = await getLobbyInfo(lobby.lobbyId);
      if (!latestInfo || !latestInfo.exists) {
        this.error = "This tournament is no longer available.";
        this.joiningLobbyId = null;
        return;
      }

      this.lobbies = this.lobbies.map((existing) =>
        existing.lobbyId === lobby.lobbyId
          ? {
              ...existing,
              participantCount: latestInfo.participants.length,
              minPlayers: latestInfo.minPlayers,
              maxPlayers: latestInfo.maxPlayers,
            }
          : existing,
      );

      const lobbyFull =
        latestInfo.maxPlayers > 0 &&
        latestInfo.participants.length >= latestInfo.maxPlayers;
      if (lobbyFull) {
        this.error = "This tournament is full.";
        this.joiningLobbyId = null;
        return;
      }

      await joinLobby({ lobbyId: lobby.lobbyId });
      // After successful stake on-chain, join the game server lobby
      this.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID: lobby.lobbyId,
            clientID: generateID(),
          } as JoinLobbyEvent,
          bubbles: true,
          composed: true,
        }),
      );
      this.joiningLobbyId = null;
      this.joinedLobbyId = lobby.lobbyId;

      // Enter waiting room mode
      this.isInWaitingRoom = true;

      // Stop refreshing lobby list
      if (this.refreshTimer !== null) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }

      // Force re-render to show waiting room
      this.requestUpdate();

      // Start polling for waiting room participants
      this.pollWaitingRoomParticipants();
      this.waitingRoomPollTimer = window.setInterval(
        () => this.pollWaitingRoomParticipants(),
        2000,
      );
    } catch (e: any) {
      if ((e as any)?.code === "INSUFFICIENT_BALANCE") {
        const errorData = e as any;
        const shortfallUSD = Number(
          formatUnits(errorData.shortfall, errorData.decimals),
        ).toFixed(2);
        this.error = `${e.message}\n\nWould you like to add funds to your wallet?`;
        this.joiningLobbyId = null;
        this.joinedLobbyId = null;

        const confirmed = confirm(
          `${e.message}\n\nMinimum deposit: $${Math.max(5, Math.ceil(Number(shortfallUSD)))}.\n\nClick OK to open the funding modal.`,
        );

        if (confirmed) {
          window.dispatchEvent(
            new CustomEvent("open-fund-modal", {
              detail: {
                suggestedAmount: Math.max(5, Math.ceil(Number(shortfallUSD))),
              },
            }),
          );
        }
        return;
      }

      this.error = e?.message ?? String(e);
      this.joiningLobbyId = null;
      this.joinedLobbyId = null;
    }
  }

  private formatAmountDisplay(amount: string, symbol: string): string {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
      return `${amount} ${symbol}`;
    }

    const absValue = Math.abs(numeric);
    let formatted: string;

    if (absValue === 0) {
      formatted = "0";
    } else if (absValue >= 1) {
      formatted = numeric.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    } else {
      formatted = numeric.toPrecision(4);
    }

    formatted = formatted.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return `${formatted} ${symbol}`;
  }

  private async pollWaitingRoomParticipants() {
    if (!this.joinedLobbyId) return;

    try {
      const config = await getServerConfigFromClient();
      const response = await fetch(
        `/${config.workerPath(this.joinedLobbyId)}/api/game/${this.joinedLobbyId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const gameInfo: GameInfo = await response.json();
        this.waitingRoomClients = gameInfo.clients ?? [];
      }
    } catch (e: any) {
      console.error("Failed to poll waiting room participants:", e);
    }
  }

  private async fetchGameInfo(lobbyId: string): Promise<GameInfo | null> {
    try {
      const config = await getServerConfigFromClient();
      const response = await fetch(
        `/${config.workerPath(lobbyId)}/api/game/${lobbyId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (e: any) {
      console.error("Failed to fetch game info:", e);
      return null;
    }
  }

  private async toggleDetails(lobbyId: string) {
    if (this.expandedLobbyId === lobbyId) {
      this.expandedLobbyId = null;
      return;
    }

    this.expandedLobbyId = lobbyId;

    // Fetch game info if not cached
    if (!this.gameInfoCache.has(lobbyId)) {
      const gameInfo = await this.fetchGameInfo(lobbyId);
      if (gameInfo) {
        this.gameInfoCache = new Map(this.gameInfoCache).set(lobbyId, gameInfo);
      }
    }
  }

  private renderTournamentDetails(lobbyId: string) {
    const gameInfo = this.gameInfoCache.get(lobbyId);

    if (!gameInfo) {
      return html`<div style="text-align:center; color:#9ca3af; padding:12px;">
        Loading game details...
      </div>`;
    }

    const config = gameInfo.gameConfig;
    if (!config) {
      return html`<div style="text-align:center; color:#9ca3af; padding:12px;">
        Game settings not available
      </div>`;
    }

    const lobby = this.lobbies.find((item) => item.lobbyId === lobbyId);
    const currentPlayers = lobby?.participantCount ?? null;
    const minPlayers = lobby?.minPlayers ?? null;
    const maxPlayersValue =
      lobby?.maxPlayers === undefined
        ? null
        : lobby.maxPlayers === 0
          ? "Unlimited"
          : lobby.maxPlayers;

    const renderDetailItem = (label: string, value: string | number | null) => {
      if (value === null || value === undefined || value === "") return null;
      return html`
        <div
          style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:12px 0;
          border-bottom:1px solid rgba(255,255,255,0.06);
          font-size:14px;
        "
        >
          <span style="color:#9ca3af;">${label}</span>
          <span style="color:#f9fafb; font-weight:600;">${value}</span>
        </div>
      `;
    };

    const gameSettings = [
      { label: "Map", value: config.gameMap ?? null },
      { label: "Size", value: config.gameMapSize ?? null },
      { label: "Mode", value: config.gameMode ?? null },
      { label: "Difficulty", value: config.difficulty ?? null },
      { label: "Bots", value: config.bots ?? null },
      { label: "Players (current)", value: currentPlayers },
      { label: "Minimum Players", value: minPlayers },
      { label: "Maximum Players", value: maxPlayersValue },
    ];

    return html`
      <div
        style="
        background: rgba(0,0,0,0.2);
        padding: 20px;
        border-radius: 8px;
      "
      >
        <div
          style="color:#fff; font-size:15px; font-weight:600; margin-bottom:16px;"
        >
          Game Settings
        </div>
        ${gameSettings.map((item) => renderDetailItem(item.label, item.value))}
      </div>
    `;
  }

  private get joinStatus(): {
    message: string;
    type: "info" | "success";
  } | null {
    if (this.joiningLobbyId) {
      return {
        type: "info",
        message: `Joining ${this.joiningLobbyId}… Confirm the transaction in your wallet and wait for the match to start.`,
      };
    }
    if (this.joinedLobbyId) {
      return {
        type: "success",
        message: `You joined ${this.joinedLobbyId}. Keep this window open while waiting for the tournament to begin.`,
      };
    }
    return null;
  }

  render() {
    const joinStatus = this.joinStatus;
    const isWaiting = this.isInWaitingRoom && this.joinedLobbyId;
    const title = isWaiting
      ? "Tournament Waiting Room"
      : (() => {
          const t = translateText("public_lobby.browse");
          return t === "public_lobby.browse" ? "Browse Tournaments" : t;
        })();

    return html`
      <o-modal title="${title}">
        ${isWaiting
          ? this.renderWaitingRoomContent()
          : this.renderLobbyBrowser(joinStatus)}
      </o-modal>
    `;
  }

  private renderLobbyBrowser(
    joinStatus: { message: string; type: "info" | "success" } | null,
  ) {
    return html`
      <div
        class="options-section"
        style="max-height:80vh; overflow:auto; padding:24px;"
      >
        ${this.loading
          ? html`<div style="text-align:center; color:#ccc; padding:12px;">
              Loading…
            </div>`
          : ""}
        ${this.error
          ? html`<div class="message-area error show">${this.error}</div>`
          : ""}
        ${joinStatus
          ? html`<div class="message-area ${joinStatus.type} show">
              ${joinStatus.message}
            </div>`
          : ""}
        ${this.lobbies.length === 0 && !this.loading
          ? html`<div
              style="
              text-align:center;
              padding:48px 24px;
              display:flex;
              flex-direction:column;
              align-items:center;
              gap:16px;
            "
            >
              <div style="color:#fff; font-size:20px; font-weight:600;">
                No Open Tournaments
              </div>
              <div
                style="color:#aaa; font-size:14px; max-width:400px; line-height:1.6;"
              >
                There are no tournaments available right now. Be the first to
                create one and challenge other players!
              </div>
              <button
                class="start-game-button"
                style="margin-top:8px; padding:12px 32px;"
                @click=${() => {
                  this.close();
                  const createBtn = document.getElementById(
                    "create-tournament-button",
                  );
                  createBtn?.click();
                }}
              >
                Create Tournament
              </button>
            </div>`
          : html`
              <div style="display:flex; flex-direction:column; gap:20px;">
                ${this.lobbies.map((l) => {
                  const isJoining = this.joiningLobbyId === l.lobbyId;
                  const isJoined = this.joinedLobbyId === l.lobbyId;
                  const hostShort = `${l.host.slice(0, 6)}...${l.host.slice(-4)}`;
                  const entryDisplay = this.formatAmountDisplay(
                    l.formattedBetAmount,
                    l.wagerSymbol,
                  );
                  const prizePoolDisplay = this.formatAmountDisplay(
                    l.formattedTotalPrize,
                    l.wagerSymbol,
                  );
                  const normalizedMax = l.maxPlayers === 0 ? 100 : l.maxPlayers;
                  const maxDisplay = String(normalizedMax);
                  const lobbyFull =
                    normalizedMax > 0 && l.participantCount >= normalizedMax;

                  return html` <div
                    class="option-card"
                    style="
                      width:100%;
                      max-width:800px;
                      margin:0 auto;
                      padding:20px;
                      border-radius:12px;
                      background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
                      border: 1px solid ${isJoined
                      ? "#9ccc65"
                      : "rgba(255,255,255,0.1)"};
                      transition: all 0.2s ease;
                    "
                    @mouseenter=${(e: MouseEvent) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.transform = "translateY(-2px)";
                      target.style.boxShadow = "0 8px 16px rgba(0,0,0,0.2)";
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.transform = "translateY(0)";
                      target.style.boxShadow = "none";
                    }}
                  >
                    <!-- Header with Tournament ID and Status -->
                    <div
                      style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"
                    >
                      <div style="display:flex; align-items:center; gap:8px;">
                        <div
                          class="option-card-title"
                          style="color:#fff; font-weight:600; font-size:16px;"
                        >
                          ${l.lobbyId}
                        </div>
                        ${isJoined
                          ? html`<span
                              style="
                              background:#9ccc65;
                              color:#000;
                              padding:2px 8px;
                              border-radius:12px;
                              font-size:11px;
                              font-weight:600;
                            "
                              >JOINED</span
                            >`
                          : lobbyFull
                            ? html`<span
                                style="
                                background:rgba(244, 67, 54, 0.2);
                                color:#f44336;
                                padding:2px 8px;
                                border-radius:12px;
                                font-size:11px;
                                font-weight:600;
                              "
                                >FULL</span
                              >`
                            : html`<span
                                style="
                                background:rgba(76, 175, 80, 0.2);
                                color:#4caf50;
                                padding:2px 8px;
                                border-radius:12px;
                                font-size:11px;
                                font-weight:600;
                              "
                                >OPEN</span
                              >`}
                      </div>
                    </div>

                    <!-- Tournament Details Grid -->
                    <div
                      style="
                      display:grid;
                      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                      gap:16px;
                      margin-bottom:20px;
                    "
                    >
                      <!-- Host -->
                      <div
                        style="display:flex; flex-direction:column; gap:4px;"
                      >
                        <div
                          style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;"
                        >
                          Host
                        </div>
                        <div
                          style="color:#fff; font-size:13px; font-family:monospace;"
                        >
                          ${hostShort}
                        </div>
                      </div>

                      <!-- Players -->
                      <div
                        style="display:flex; flex-direction:column; gap:4px;"
                      >
                        <div
                          style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;"
                        >
                          Players
                        </div>
                        <div
                          style="color:#fff; font-size:14px; font-weight:600;"
                        >
                          ${l.participantCount} / ${maxDisplay}
                        </div>
                        <div style="color:#aaa; font-size:12px;">
                          Min ${l.minPlayers}
                        </div>
                      </div>

                      <!-- Entry Fee -->
                      <div
                        style="display:flex; flex-direction:column; gap:4px;"
                      >
                        <div
                          style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;"
                        >
                          Entry Fee
                        </div>
                        <div
                          style="color:#fff; font-size:14px; font-weight:600;"
                        >
                          ${entryDisplay}
                        </div>
                      </div>

                      <!-- Prize Pool -->
                      <div
                        style="display:flex; flex-direction:column; gap:4px;"
                      >
                        <div
                          style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;"
                        >
                          Prize Pool
                        </div>
                        <div
                          style="color:#ffd700; font-size:14px; font-weight:600;"
                        >
                          ${prizePoolDisplay}
                        </div>
                      </div>
                    </div>

                    <!-- Expandable Details Section -->
                    ${this.expandedLobbyId === l.lobbyId
                      ? html`
                          <div
                            style="
                            margin-top: 20px;
                            padding-top: 20px;
                            border-top: 1px solid rgba(255,255,255,0.1);
                          "
                          >
                            ${this.renderTournamentDetails(l.lobbyId)}
                          </div>
                        `
                      : ""}

                    <!-- Action Buttons -->
                    <div style="display:flex; gap:12px; margin-top:16px;">
                      <button
                        class="start-game-button"
                        style="flex:1;"
                        @click=${() => this.toggleDetails(l.lobbyId)}
                      >
                        ${this.expandedLobbyId === l.lobbyId
                          ? "Hide Details"
                          : "View Details"}
                      </button>
                      <button
                        class="start-game-button"
                        style="flex:1;"
                        ?disabled=${isJoining || isJoined || lobbyFull}
                        @click=${() => this.handleJoin(l)}
                      >
                        ${isJoined
                          ? "Joined - Waiting"
                          : lobbyFull
                            ? "Lobby Full"
                            : isJoining
                              ? "Confirming..."
                              : "Join Tournament"}
                      </button>
                    </div>
                  </div>`;
                })}
              </div>
            `}
      </div>
    `;
  }

  private renderWaitingRoomContent() {
    const lobby = this.lobbies.find((l) => l.lobbyId === this.joinedLobbyId);
    return html`
      <div class="options-section" style="max-height:70vh; overflow:auto;">
        <!-- Tournament Info -->
        <div
          class="option-card"
          style="width:100%; max-width:720px; margin:0 auto 16px; padding:16px;"
        >
          <div style="text-align:center; margin-bottom:16px;">
            <div
              style="color:#9ccc65; font-size:18px; font-weight:600; margin-bottom:8px;"
            >
              ✓ Successfully Joined!
            </div>
            <div style="color:#aaa; font-size:14px; margin-bottom:4px;">
              Tournament ID:
              <span style="color:#fff;">${this.joinedLobbyId}</span>
            </div>
            ${lobby
              ? html`
                  <div style="color:#aaa; font-size:14px;">
                    Bet Amount:
                    <span style="color:#fff;"
                      >${this.formatAmountDisplay(
                        lobby.formattedBetAmount,
                        lobby.wagerSymbol,
                      )}</span
                    >
                  </div>
                `
              : ""}
          </div>

          <div
            style="background-color:rgba(156, 204, 101, 0.1); border-left:3px solid #9ccc65; padding:12px; border-radius:4px; margin-top:12px;"
          >
            <div style="color:#9ccc65; font-size:13px; line-height:1.5;">
              Keep this window open! The tournament will start automatically
              when the host begins the game.
            </div>
          </div>
        </div>

        <!-- Players List -->
        <div class="options-section">
          <div
            class="option-title"
            style="text-align:center; margin-bottom:12px;"
          >
            ${this.waitingRoomClients.length}
            ${this.waitingRoomClients.length === 1 ? "Player" : "Players"} in
            Waiting Room
          </div>

          <div class="players-list" style="max-width:720px; margin:0 auto;">
            ${this.waitingRoomClients.length === 0
              ? html`<div style="text-align:center; color:#888; padding:20px;">
                  Loading participants...
                </div>`
              : this.waitingRoomClients.map(
                  (client) => html`
                    <span class="player-tag" style="margin:4px;">
                      ${client.username}
                    </span>
                  `,
                )}
          </div>
        </div>
      </div>
    `;
  }
}
