import { LitElement, TemplateResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../../../client/Utils";
import { ColorPalette, Pattern } from "../../../core/CosmeticSchemas";
import { EventBus } from "../../../core/EventBus";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import "../../components/PatternButton";
import { GameStatus, claimPrize, getLobbyInfo } from "../../Contract";
import {
  fetchCosmetics,
  handlePurchase,
  patternRelationship,
} from "../../Cosmetics";
import { getUserMe } from "../../jwt";
import { SendWinnerEvent } from "../../Transport";
import { WalletManager } from "../../Wallet";
import { Layer } from "./Layer";

@customElement("win-modal")
export class WinModal extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;

  private hasShownDeathModal = false;

  @state()
  isVisible = false;

  @state()
  showButtons = false;

  @state()
  private patternContent: TemplateResult | null = null;

  @state()
  private showClaimButton: boolean = false;

  @state()
  private isClaiming: boolean = false;

  @state()
  private claimMsg: string = "";

  @state()
  private checkingClaim: boolean = false;

  @state()
  private isTournament: boolean = false;

  private _title: string;

  private claimCheckInterval: number | null = null;

  // Override to prevent shadow DOM creation
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
  }

  render() {
    return html`
      <div
        class="${this.isVisible
          ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800/70 p-6 rounded-lg z-[9999] shadow-2xl backdrop-blur-sm text-white w-[350px] max-w-[90%] md:w-[700px] md:max-w-[700px] animate-fadeIn"
          : "hidden"}"
      >
        ${this.isTournament
          ? html`<div class="mb-2 text-center">
              <span
                class="inline-block px-3 py-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold text-sm rounded-full"
              >
                🏆 TOURNAMENT
              </span>
            </div>`
          : html``}
        <h2 class="m-0 mb-4 text-[26px] text-center text-white">
          ${this._title ?? ""}
        </h2>
        ${this.innerHtml()}
        ${this.checkingClaim && !this.showButtons
          ? html`<div
              class="mt-3 text-center text-base text-blue-400 animate-pulse"
            >
              🔍 ${translateText("win_modal.checking_claim")}
            </div>`
          : html``}
        <div
          class="${this.showButtons
            ? "flex justify-between gap-2.5"
            : "hidden"}"
        >
          ${this.showClaimButton
            ? html`<button
                @click=${this._handleClaimPrize}
                class="flex-1 px-3 py-3 text-base cursor-pointer bg-green-600/70 text-white border-0 rounded transition-all duration-200 hover:bg-green-600/80 hover:-translate-y-px active:translate-y-px disabled:opacity-60"
                ?disabled=${this.isClaiming}
              >
                ${this.isClaiming
                  ? translateText("win_modal.claiming")
                  : translateText("win_modal.claim_prize")}
              </button>`
            : this.checkingClaim
              ? html`<div
                  class="flex-1 px-3 py-3 text-base text-center bg-blue-500/40 text-white border-0 rounded"
                >
                  <span class="animate-pulse"
                    >🔍 ${translateText("win_modal.checking_claim")}</span
                  >
                </div>`
              : html``}
          <button
            @click=${this._handleExit}
            class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
          >
            ${translateText("win_modal.exit")}
          </button>
          <button
            @click=${this.hide}
            class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
          >
            ${translateText("win_modal.keep")}
          </button>
        </div>
        ${this.claimMsg
          ? html`<div
              class="mt-3 text-center text-sm ${this.showClaimButton
                ? "text-green-400"
                : "text-yellow-400"}"
            >
              ${this.claimMsg}
            </div>`
          : html``}
      </div>

      <style>
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      </style>
    `;
  }

  innerHtml() {
    return this.renderPatternButton();
  }

  renderPatternButton() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.support_openfront")}
        </h3>
        <p class="text-white mb-3">
          ${translateText("win_modal.territory_pattern")}
        </p>
        <div class="flex justify-center">${this.patternContent}</div>
      </div>
    `;
  }

  async loadPatternContent() {
    const me = await getUserMe();
    const patterns = await fetchCosmetics();

    const purchasablePatterns: {
      pattern: Pattern;
      colorPalette: ColorPalette;
    }[] = [];

    for (const pattern of Object.values(patterns?.patterns ?? {})) {
      for (const colorPalette of pattern.colorPalettes ?? []) {
        if (
          patternRelationship(
            pattern,
            colorPalette,
            me !== false ? me : null,
            null,
          ) === "purchasable"
        ) {
          const palette = patterns?.colorPalettes?.[colorPalette.name];
          if (palette) {
            purchasablePatterns.push({
              pattern,
              colorPalette: palette,
            });
          }
        }
      }
    }

    if (purchasablePatterns.length === 0) {
      this.patternContent = html``;
      return;
    }

    // Shuffle the array and take patterns based on screen size
    const shuffled = [...purchasablePatterns].sort(() => Math.random() - 0.5);
    const isMobile = window.innerWidth < 768; // md breakpoint
    const maxPatterns = isMobile ? 1 : 3;
    const selectedPatterns = shuffled.slice(
      0,
      Math.min(maxPatterns, shuffled.length),
    );

    this.patternContent = html`
      <div class="flex gap-4 flex-wrap justify-start">
        ${selectedPatterns.map(
          ({ pattern, colorPalette }) => html`
            <pattern-button
              .pattern=${pattern}
              .colorPalette=${colorPalette}
              .requiresPurchase=${true}
              .onSelect=${(p: Pattern | null) => {}}
              .onPurchase=${(p: Pattern, colorPalette: ColorPalette | null) =>
                handlePurchase(p, colorPalette)}
            ></pattern-button>
          `,
        )}
      </div>
    `;
  }

  steamWishlist(): TemplateResult {
    return html`<p class="m-0 mb-5 text-center bg-black/30 p-2.5 rounded">
      <a
        href="https://store.steampowered.com/app/3560670"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[#4a9eff] underline font-medium transition-colors duration-200 text-2xl hover:text-[#6db3ff]"
      >
        ${translateText("win_modal.wishlist")}
      </a>
    </p>`;
  }

  async show() {
    await this.loadPatternContent();
    this.isVisible = true;
    this.requestUpdate();

    // Start checking for claim eligibility
    this.startClaimCheck();

    setTimeout(() => {
      this.showButtons = true;
      this.requestUpdate();
    }, 3000);
  }

  private async startClaimCheck() {
    this.checkingClaim = true;
    this.requestUpdate();

    // Check immediately
    await this.checkClaimEligibility();

    // If claim button showed up immediately, stop checking
    if (this.showClaimButton) {
      this.checkingClaim = false;
      this.claimMsg = "";
      this.requestUpdate();
      return;
    }

    // Otherwise, poll every 2 seconds for up to 30 seconds
    let attempts = 0;
    const maxAttempts = 15;

    this.claimCheckInterval = window.setInterval(async () => {
      attempts++;
      console.log(
        `[WinModal] Polling for on-chain winner declaration (attempt ${attempts}/${maxAttempts})...`,
      );
      await this.checkClaimEligibility();

      if (this.showClaimButton) {
        // Winner declared! Stop polling
        this.stopClaimCheck();
        this.claimMsg = "";
        this.requestUpdate();
      } else if (attempts >= maxAttempts) {
        // Timeout
        this.stopClaimCheck();
        this.claimMsg = translateText("win_modal.claim_timeout");
        this.requestUpdate();
      }
    }, 2000);
  }

  private stopClaimCheck() {
    if (this.claimCheckInterval !== null) {
      clearInterval(this.claimCheckInterval);
      this.claimCheckInterval = null;
      this.checkingClaim = false;
      this.requestUpdate();
    }
  }

  private async checkClaimEligibility() {
    try {
      const lobbyId = this.game.gameID();
      const info = await getLobbyInfo(lobbyId);
      const myAddr = WalletManager.getInstance().address?.toLowerCase();

      console.log(`[WinModal] Checking claim eligibility:`, {
        lobbyId,
        exists: info?.exists,
        status: info?.status,
        statusName: info ? GameStatus[info.status] : "N/A",
        winner: info?.winner,
        myAddress: myAddr,
        isMatch: info?.winner?.toLowerCase() === myAddr,
      });

      // If no lobby on-chain, this is not a tournament
      if (!info || !info.exists) {
        console.log(`[WinModal] ℹ️ No on-chain lobby found (not a tournament)`);
        this.isTournament = false;
        this.showClaimButton = false;
        this.checkingClaim = false;
        this.claimMsg =
          "This was a regular game, not a tournament. No prize to claim.";
        this.requestUpdate();
        return;
      }

      // Mark as tournament
      this.isTournament = true;

      // Check if you have a wallet connected
      if (!myAddr) {
        console.log(`[WinModal] ⚠️ No wallet connected`);
        this.claimMsg = "Connect your wallet to claim prizes";
        this.showClaimButton = false;
        this.checkingClaim = false;
        this.requestUpdate();
        return;
      }

      const isEligible = Boolean(
        info.status === GameStatus.Finished &&
          info.winner &&
          info.winner.toLowerCase() !==
            "0x0000000000000000000000000000000000000000" &&
          info.winner.toLowerCase() === myAddr,
      );

      if (isEligible && !this.showClaimButton) {
        console.log(
          `[WinModal] ✅ Claim button now available! Winner: ${info.winner}`,
        );
      } else if (!isEligible) {
        const reasons = {
          hasInfo: !!info,
          exists: info.exists,
          isFinished: info.status === GameStatus.Finished,
          statusName: GameStatus[info.status],
          hasWinner: !!info.winner,
          isNotZero:
            info.winner?.toLowerCase() !==
            "0x0000000000000000000000000000000000000000",
          hasWallet: !!myAddr,
          addressMatch: info.winner?.toLowerCase() === myAddr,
        };
        console.log(`[WinModal] ❌ Not eligible yet. Reason:`, reasons);

        // Provide specific feedback
        if (info.status === GameStatus.InProgress) {
          this.claimMsg = "⏳ Waiting for server to declare winner on-chain...";
        } else if (info.status === GameStatus.Created) {
          this.claimMsg = "Game hasn't started on-chain yet";
        } else if (info.status === GameStatus.Claimed) {
          this.claimMsg = "Prize already claimed";
        } else if (info.winner?.toLowerCase() !== myAddr) {
          this.claimMsg = "You are not the winner of this tournament";
        }
        this.requestUpdate();
      }

      this.showClaimButton = isEligible;
      this.requestUpdate();
    } catch (e) {
      console.error(`[WinModal] Error checking claim eligibility:`, e);
      this.showClaimButton = false;
      this.claimMsg = `Error checking prize: ${e instanceof Error ? e.message : String(e)}`;
      this.requestUpdate();
    }
  }

  hide() {
    this.stopClaimCheck();
    this.isVisible = false;
    this.showButtons = false;
    this.requestUpdate();
  }

  private _handleExit() {
    this.hide();
    window.location.href = "/";
  }

  private async _handleClaimPrize() {
    if (this.isClaiming) return;
    try {
      this.isClaiming = true;
      this.claimMsg = translateText("win_modal.claiming");
      const lobbyId = this.game.gameID();
      await claimPrize({ lobbyId });
      this.claimMsg = translateText("win_modal.claim_success");
      this.showClaimButton = false;
    } catch (e: any) {
      this.claimMsg = e?.message ?? "Failed to claim prize.";
    } finally {
      this.isClaiming = false;
      this.requestUpdate();
    }
  }

  init() {}

  tick() {
    const myPlayer = this.game.myPlayer();
    if (
      !this.hasShownDeathModal &&
      myPlayer &&
      !myPlayer.isAlive() &&
      !this.game.inSpawnPhase() &&
      myPlayer.hasSpawned()
    ) {
      this.hasShownDeathModal = true;
      this._title = translateText("win_modal.died");
      this.show();
    }
    const updates = this.game.updatesSinceLastTick();
    const winUpdates = updates !== null ? updates[GameUpdateType.Win] : [];
    winUpdates.forEach((wu) => {
      if (wu.winner === undefined) {
        // ...
      } else if (wu.winner[0] === "team") {
        this.eventBus.emit(new SendWinnerEvent(wu.winner, wu.allPlayersStats));
        if (wu.winner[1] === this.game.myPlayer()?.team()) {
          this._title = translateText("win_modal.your_team");
        } else {
          this._title = translateText("win_modal.other_team", {
            team: wu.winner[1],
          });
        }
        this.show();
      } else {
        const winner = this.game.playerByClientID(wu.winner[1]);
        if (!winner?.isPlayer()) return;
        const winnerClient = winner.clientID();
        if (winnerClient !== null) {
          this.eventBus.emit(
            new SendWinnerEvent(["player", winnerClient], wu.allPlayersStats),
          );
        }
        if (
          winnerClient !== null &&
          winnerClient === this.game.myPlayer()?.clientID()
        ) {
          this._title = translateText("win_modal.you_won");
        } else {
          this._title = translateText("win_modal.other_won", {
            player: winner.name(),
          });
        }
        this.show();
      }
    });
  }

  renderLayer(/* context: CanvasRenderingContext2D */) {}

  shouldTransform(): boolean {
    return false;
  }
}
