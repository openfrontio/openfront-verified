import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import ofmWintersLogo from "../../../../resources/images/OfmWintersLogo.png";
import { translateText } from "../../../client/Utils";
import { EventBus } from "../../../core/EventBus";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import {
  GameStatus,
  USD_TOKEN_ADDRESS,
  getClaimableBalance,
  getLobbyInfo,
  getWinners,
  withdrawWinnings,
} from "../../Contract";
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
  private isWin = false;

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

  private rand = Math.random();

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
          ${this.showClaimButton
            ? html`
                <button
                  @click=${this.hide}
                  class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
                >
                  ${this.isWin
                    ? translateText("win_modal.keep")
                    : translateText("win_modal.spectate")}
                </button>
              `
            : html``}
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
    return html``;
  }

  ofmDisplay() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.ofm_winter")}
        </h3>
        <div class="mb-3">
          <img
            src=${ofmWintersLogo}
            alt="OpenFront Masters Winter"
            class="mx-auto max-w-full h-auto max-h-[200px] rounded"
          />
        </div>
        <p class="text-white mb-3">
          ${translateText("win_modal.ofm_winter_description")}
        </p>
        <a
          href="https://discord.gg/wXXJshB8Jt"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block px-6 py-3 bg-green-600 text-white rounded font-semibold transition-all duration-200 hover:bg-green-700 hover:-translate-y-px no-underline"
        >
          ${translateText("win_modal.join_tournament")}
        </a>
      </div>
    `;
  }

  discordDisplay() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.join_discord")}
        </h3>
        <p class="text-white mb-3">
          ${translateText("win_modal.discord_description")}
        </p>
        <a
          href="https://discord.com/invite/openfront"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block px-6 py-3 bg-indigo-600 text-white rounded font-semibold transition-all duration-200 hover:bg-indigo-700 hover:-translate-y-px no-underline"
        >
          ${translateText("win_modal.join_server")}
        </a>
      </div>
    `;
  }

  async show() {
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

    if (!this.checkingClaim) {
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
      const walletManager = WalletManager.getInstance();
      const accountAddress = walletManager.address as `0x${string}` | undefined;
      const myAddr = accountAddress?.toLowerCase();

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
        this.claimMsg =
          "This was a regular game, not a tournament. No prize to claim.";
        this.stopClaimCheck();
        this.requestUpdate();
        return;
      }

      // Mark as tournament
      this.isTournament = true;

      // Check if you have a wallet connected
      if (!accountAddress) {
        console.log(`[WinModal] ⚠️ No wallet connected`);
        this.claimMsg = "Connect your wallet to claim prizes";
        this.showClaimButton = false;
        this.stopClaimCheck();
        this.requestUpdate();
        return;
      }

      const winnersInfo = await getWinners(lobbyId);
      const winnerAddressesLower =
        winnersInfo?.winners.map((addr) => addr.toLowerCase()) ?? [];
      const isListedWinner =
        myAddr !== undefined && winnerAddressesLower.includes(myAddr);

      let claimableBalance = 0n;
      if (info.status === GameStatus.Finished || isListedWinner) {
        claimableBalance = await getClaimableBalance(
          accountAddress,
          USD_TOKEN_ADDRESS,
        );
      }

      const hasClaimable = claimableBalance > 0n;
      const wasShowingClaim = this.showClaimButton;
      const isEligible =
        info.status === GameStatus.Finished && isListedWinner && hasClaimable;

      if (isEligible && !this.showClaimButton) {
        console.log(
          `[WinModal] ✅ Claim button now available! Winner: ${info.winner}`,
        );
      } else if (!isEligible) {
        console.log(`[WinModal] ❌ Not eligible yet. Reason:`, {
          hasInfo: !!info,
          exists: info.exists,
          isFinished: info.status === GameStatus.Finished,
          statusName: GameStatus[info.status],
          winners: winnersInfo?.winners?.length ?? 0,
          isListedWinner,
          hasClaimable,
          claimableBalance: claimableBalance.toString(),
        });
      }

      this.showClaimButton = isEligible;

      if (isEligible && !wasShowingClaim) {
        this.claimMsg = "";
        this.stopClaimCheck();
        this.requestUpdate();
        return;
      }

      if (info.status === GameStatus.Finished && !isListedWinner) {
        this.claimMsg = "You are not the winner of this tournament";
        this.stopClaimCheck();
        this.requestUpdate();
        return;
      }

      // Provide specific feedback while we wait
      if (info.status === GameStatus.InProgress) {
        this.claimMsg = "⏳ Waiting for server to declare winner on-chain...";
      } else if (info.status === GameStatus.Created) {
        this.claimMsg = "Game hasn't started on-chain yet";
      } else if (info.status === GameStatus.Claimed) {
        this.claimMsg = "Prize already claimed";
        this.stopClaimCheck();
      } else if (info.status === GameStatus.Finished && isListedWinner) {
        this.claimMsg =
          "⏳ Waiting for the tournament payout to settle on-chain...";
      }

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
      const result = await withdrawWinnings(USD_TOKEN_ADDRESS);
      this.claimMsg = `Withdrew ${result.tokenSymbol} successfully!`;
      this.showClaimButton = false;
    } catch (e: any) {
      this.claimMsg = e?.message ?? "Failed to withdraw winnings.";
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
          this.isWin = true;
        } else {
          this._title = translateText("win_modal.other_team", {
            team: wu.winner[1],
          });
          this.isWin = false;
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
          this.isWin = true;
        } else {
          this._title = translateText("win_modal.other_won", {
            player: winner.name(),
          });
          this.isWin = false;
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
