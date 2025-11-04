import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { formatUnits } from "viem";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import {
  getLobbyInfo,
  sponsorTournament as sponsorTournamentOnchain,
  type LobbyInfo,
} from "./Contract";
import { translateText } from "./Utils";

interface SponsorResult {
  hash: string;
  lobbyId: string;
  formattedAmount: string;
  tokenSymbol: string;
}

@customElement("sponsor-tournament-modal")
export class SponsorTournamentModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  @state() private tournamentId = "";
  @state() private amount = "";
  @state() private loading = false;
  @state() private error = "";
  @state() private success: SponsorResult | null = null;
  @state() private sponsoring = false;
  @state() private details: LobbyInfo | null = null;

  createRenderRoot() {
    return this;
  }

  public open(id: string = "", presetAmount: string = "") {
    this.resetState();
    if (id) this.tournamentId = id;
    if (presetAmount) this.amount = presetAmount;
    this.modalEl?.open();
    if (id) {
      this.loadDetails();
    }
  }

  public close() {
    this.modalEl?.close();
  }

  private resetState() {
    this.tournamentId = "";
    this.amount = "";
    this.loading = false;
    this.sponsoring = false;
    this.error = "";
    this.success = null;
    this.details = null;
  }

  private async loadDetails() {
    const lobbyId = this.tournamentId.trim();
    if (!lobbyId) {
      this.error = "Enter a tournament code first.";
      return;
    }

    this.loading = true;
    this.error = "";
    this.success = null;

    try {
      const lobbyInfo = await getLobbyInfo(lobbyId);
      if (!lobbyInfo || !lobbyInfo.exists) {
        this.error = translateText("private_lobby.not_found");
        return;
      }
      this.details = lobbyInfo;
      if (!this.amount) {
        this.amount = lobbyInfo.isNative ? "0.01" : "10";
      }
    } catch (err: any) {
      console.error("Failed to load lobby for sponsorship:", err);
      this.error = err?.message ?? "Unable to load tournament details.";
    } finally {
      this.loading = false;
    }
  }

  private async handleSponsor() {
    const lobbyId = this.tournamentId.trim();
    if (!lobbyId) {
      this.error = "Enter a tournament code first.";
      return;
    }

    if (!this.details) {
      await this.loadDetails();
      if (!this.details) return;
    }

    const amount = this.amount.trim();
    if (!amount) {
      this.error = "Enter an amount to sponsor.";
      return;
    }

    this.error = "";
    this.success = null;
    this.sponsoring = true;

    try {
      const result = await sponsorTournamentOnchain({
        lobbyId,
        amount,
      });

      this.success = {
        hash: result.hash,
        lobbyId: result.lobbyId,
        formattedAmount: result.formattedAmount,
        tokenSymbol: result.tokenSymbol,
      };

      await this.loadDetails();
    } catch (err: any) {
      console.error("Failed to sponsor tournament:", err);
      this.error = err?.message ?? "Failed to sponsor tournament.";
    } finally {
      this.sponsoring = false;
    }
  }

  private renderSummary() {
    if (!this.details) {
      return html`
        <div class="join-private-tournament__state">
          ${this.loading
            ? "Loading..."
            : "Enter a tournament code and load details."}
        </div>
      `;
    }

    const info = this.details;
    const entries = [
      {
        label: "Host",
        value: this.shortenAddress(info.host),
      },
      {
        label: "Current Prize",
        value: `${formatUnits(info.totalPrize, info.wagerDecimals)} ${info.wagerSymbol}`,
      },
      {
        label: "Entry Cost",
        value: `${formatUnits(info.betAmount, info.wagerDecimals)} ${info.wagerSymbol}`,
      },
      {
        label: "Allowlist",
        value: info.allowlistEnabled ? "Enabled" : "Disabled",
      },
      {
        label: "Participants",
        value: `${info.participants.length}`,
      },
    ];

    return html`
      <div class="join-private-tournament__details">
        <div class="options-section">
          <div class="option-title">Tournament Summary</div>
          ${entries.map((item) =>
            this.renderDetailItem(item.label, item.value),
          )}
        </div>
      </div>
    `;
  }

  private renderDetailItem(label: string, value: string | number | null) {
    return html`
      <div
        style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.08);"
      >
        <span
          style="color:#9ca3af; font-size:13px; text-transform:uppercase; letter-spacing:0.08em;"
        >
          ${label}
        </span>
        <span style="color:#f9fafb; font-size:14px; font-weight:600;"
          >${value ?? "—"}</span
        >
      </div>
    `;
  }

  private shortenAddress(address: string) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  render() {
    return html`
      <o-modal title="Sponsor Tournament">
        <div class="join-private-tournament">
          <div class="join-private-tournament__input-group">
            <label
              class="join-private-tournament__label"
              for="sponsor-tournament-id"
              >Tournament Code</label
            >
            <div class="join-private-tournament__input-row">
              <input
                id="sponsor-tournament-id"
                class="join-private-tournament__input"
                placeholder="Enter tournament ID"
                .value=${this.tournamentId}
                @input=${(e: Event) => {
                  this.tournamentId = (e.target as HTMLInputElement).value;
                  this.error = "";
                  this.success = null;
                }}
              />
              <button
                class="join-private-tournament__paste"
                title="Paste from clipboard"
                @click=${this.pasteFromClipboard}
              >
                <svg
                  stroke="currentColor"
                  fill="currentColor"
                  stroke-width="0"
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10 1H2.5A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h6.765A1.5 1.5 0 0 0 10.75 14H3v-1h7v-1H3V2h7v1h1V2.5A1.5 1.5 0 0 0 10 1Zm1 3H6.5A1.5 1.5 0 0 0 5 5.5v8A1.5 1.5 0 0 0 6.5 15h6A1.5 1.5 0 0 0 14 13.5v-8A1.5 1.5 0 0 0 12.5 4ZM6 5.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5V7H6Zm0 3h7v5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5Z"
                  ></path>
                </svg>
              </button>
            </div>
          </div>

          <div class="join-private-tournament__input-group">
            <label class="join-private-tournament__label" for="sponsor-amount"
              >Amount</label
            >
            <input
              id="sponsor-amount"
              class="join-private-tournament__input"
              placeholder="Enter amount"
              .value=${this.amount}
              @input=${(e: Event) => {
                this.amount = (e.target as HTMLInputElement).value;
                this.error = "";
              }}
            />
          </div>

          <div
            class="join-private-tournament__button-row"
            style="margin-bottom: 12px;"
          >
            <o-button
              title="Load Tournament"
              block
              secondary
              ?disabled=${this.loading || !this.tournamentId.trim()}
              @click=${this.loadDetails}
            ></o-button>
          </div>

          ${this.error
            ? html`<div class="join-private-tournament__message">
                <div class="message-area error show">${this.error}</div>
              </div>`
            : ""}
          ${this.success
            ? html`<div class="join-private-tournament__message">
                <div class="message-area success show">
                  Sponsored ${this.success.formattedAmount}
                  ${this.success.tokenSymbol}. Tx:
                  <span style="font-family: monospace;"
                    >${this.success.hash}</span
                  >
                </div>
              </div>`
            : ""}
          ${this.renderSummary()}

          <div class="join-private-tournament__button-row">
            <o-button
              title=${this.sponsoring ? "Sponsoring…" : "Sponsor"}
              block
              ?disabled=${this.sponsoring ||
              !this.tournamentId.trim() ||
              !this.amount.trim()}
              @click=${this.handleSponsor}
            ></o-button>
          </div>
        </div>
      </o-modal>
    `;
  }

  private async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      this.tournamentId = text.trim();
      this.error = "";
    } catch (err) {
      console.error("Failed to paste tournament ID:", err);
      this.error = "Unable to read from clipboard.";
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sponsor-tournament-modal": SponsorTournamentModal;
  }
}
