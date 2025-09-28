import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { generateID } from "../core/Util";
import "./components/baseComponents/Modal";
import {
  getAllPublicLobbiesWithDetails,
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

  private refreshTimer: number | null = null;

  createRenderRoot() {
    return this;
  }

  public open() {
    this.loading = true;
    this.error = "";
    this.fetchLobbies();
    this.refreshTimer ??= window.setInterval(() => this.fetchLobbies(), 5000);
    this.modalEl?.open();
  }

  public close() {
    this.modalEl?.close();
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async fetchLobbies() {
    try {
      this.loading = true;
      const all = await getAllPublicLobbiesWithDetails();
      // Only show not-started games (status Created = 0)
      this.lobbies = (all ?? []).filter((l) => l.status === 0);
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
    }
  }

  private async handleJoin(lobby: PublicLobbyInfo) {
    try {
      this.error = "";
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
      this.close();
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    }
  }

  render() {
    const t = translateText("public_lobby.browse");
    const title = t === "public_lobby.browse" ? "Browse Tournaments" : t;
    return html`
      <o-modal title="${title}">
        <div class="options-section" style="max-height:70vh; overflow:auto;">
          ${this.loading
            ? html`<div style="text-align:center; color:#ccc; padding:12px;">
                Loading…
              </div>`
            : ""}
          ${this.error
            ? html`<div class="message-area error show">${this.error}</div>`
            : ""}
          ${this.lobbies.length === 0 && !this.loading
            ? html`<div style="text-align:center; color:#ccc; padding:12px;">
                No open games
              </div>`
            : html`
                <div style="display:flex; flex-direction:column; gap:12px;">
                  ${this.lobbies.map((l) => {
                    return html` <div
                      class="option-card"
                      style="width:100%; max-width:720px; margin:0 auto; padding:12px 16px;"
                    >
                      <div
                        style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;"
                      >
                        <div
                          style="display:flex; flex-direction:column; gap:4px;"
                        >
                          <div
                            class="option-card-title"
                            style="color:#fff; font-weight:600; text-align:left;"
                          >
                            ${l.lobbyId}
                          </div>
                          <div style="color:#aaa; font-size:12px;">
                            Players: ${l.participantCount}
                          </div>
                          <div style="color:#aaa; font-size:12px;">
                            Bet: ${l.formattedBetAmount} ETH
                          </div>
                        </div>
                        <button
                          class="start-game-button"
                          style="max-width:160px;"
                          @click=${() => this.handleJoin(l)}
                        >
                          Join
                        </button>
                      </div>
                    </div>`;
                  })}
                </div>
              `}
        </div>
      </o-modal>
    `;
  }
}
