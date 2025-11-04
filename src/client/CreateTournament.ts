import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import randomMap from "../../resources/images/RandomMap.webp";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  UnitType,
  mapCategories,
} from "../core/game/Game";
import { UserSettings } from "../core/game/UserSettings";
import {
  ClientInfo,
  GameConfig,
  GameInfo,
  TeamCountConfig,
} from "../core/Schemas";
import { generateID } from "../core/Util";
import "./components/baseComponents/Modal";
import "./components/Difficulties";
import "./components/Maps";
import {
  addToAllowlist as addToAllowlistOnchain,
  cancelLobby as cancelLobbyOnchain,
  createLobby as createLobbyOnchain,
  removeFromAllowlist as removeFromAllowlistOnchain,
  setAllowlistEnabled as setAllowlistEnabledOnchain,
  startGame as startGameOnchain,
} from "./Contract";
import { JoinLobbyEvent } from "./Main";
import "./styles.css";
import { renderUnitTypeOptions } from "./utilities/RenderUnitTypeOptions";
import { translateText } from "./Utils";

@customElement("create-tournament-modal")
export class CreateTournamentModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };
  @state() private selectedMap: GameMapType = GameMapType.World;
  @state() private selectedDifficulty: Difficulty = Difficulty.Medium;
  @state() private disableNPCs = false;
  @state() private gameMode: GameMode = GameMode.FFA;
  @state() private teamCount: TeamCountConfig = 2;
  @state() private bots: number = 400;
  @state() private infiniteGold: boolean = false;
  @state() private donateGold: boolean = false;
  @state() private infiniteTroops: boolean = false;
  @state() private donateTroops: boolean = false;
  @state() private instantBuild: boolean = false;
  @state() private compactMap: boolean = false;
  @state() private lobbyId = "";
  @state() private copySuccess = false;
  @state() private clients: ClientInfo[] = [];
  @state() private useRandomMap: boolean = false;
  @state() private disabledUnits: UnitType[] = [];
  @state() private lobbyCreatorClientID: string = "";
  @state() private lobbyIdVisible: boolean = true;
  @state() private betAmount: string = "0.001";
  @state() private useWagerToken: boolean = true;
  @state() private lobbyVisibility: "private" | "public" = "public";
  @state() private ethPriceUSD: number | null = null;
  @state() private isCreating: boolean = false;
  @state() private creationSuccess: boolean = false;
  @state() private allowlistEnabled: boolean = false;
  @state() private allowlistInput: string = "";
  @state() private currentAllowlist: string[] = [];
  @state() private isUpdatingAllowlist: boolean = false;
  @state() private allowlistStatusMessage: string = "";
  @state() private isCancelling: boolean = false;

  private playersInterval: NodeJS.Timeout | null = null;
  // Add a new timer for debouncing bot changes
  private botsUpdateTimer: number | null = null;
  private userSettings: UserSettings = new UserSettings();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  render() {
    return html`
      <o-modal title="Create Tournament">
        ${
          this.lobbyId
            ? html`<div class="lobby-id-box">
                <button class="lobby-id-button">
                  <!-- Visibility toggle icon on the left -->
                  ${this.lobbyIdVisible
                    ? html`<svg
                        class="visibility-icon"
                        @click=${() => {
                          this.lobbyIdVisible = !this.lobbyIdVisible;
                          this.requestUpdate();
                        }}
                        style="margin-right: 8px; cursor: pointer;"
                        stroke="currentColor"
                        fill="currentColor"
                        stroke-width="0"
                        viewBox="0 0 512 512"
                        height="18px"
                        width="18px"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M256 105c-101.8 0-188.4 62.7-224 151 35.6 88.3 122.2 151 224 151s188.4-62.7 224-151c-35.6-88.3-122.2-151-224-151zm0 251.7c-56 0-101.7-45.7-101.7-101.7S200 153.3 256 153.3 357.7 199 357.7 255 312 356.7 256 356.7zm0-161.1c-33 0-59.4 26.4-59.4 59.4s26.4 59.4 59.4 59.4 59.4-26.4 59.4-59.4-26.4-59.4-59.4-59.4z"
                        ></path>
                      </svg>`
                    : html`<svg
                        class="visibility-icon"
                        @click=${() => {
                          this.lobbyIdVisible = !this.lobbyIdVisible;
                          this.requestUpdate();
                        }}
                        style="margin-right: 8px; cursor: pointer;"
                        stroke="currentColor"
                        fill="currentColor"
                        stroke-width="0"
                        viewBox="0 0 512 512"
                        height="18px"
                        width="18px"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M448 256s-64-128-192-128S64 256 64 256c32 64 96 128 192 128s160-64 192-128z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="32"
                        ></path>
                        <path
                          d="M144 256l224 0"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="32"
                          stroke-linecap="round"
                        ></path>
                      </svg>`}
                  <!-- Lobby ID (conditionally shown) -->
                  <span
                    class="lobby-id"
                    @click=${this.copyToClipboard}
                    style="cursor: pointer;"
                  >
                    ${this.lobbyIdVisible ? this.lobbyId : "••••••••"}
                  </span>

                  <!-- Copy icon/success indicator -->
                  <div
                    @click=${this.copyToClipboard}
                    style="margin-left: 8px; cursor: pointer;"
                  >
                    ${this.copySuccess
                      ? html`<span class="copy-success-icon">✓</span>`
                      : html`
                          <svg
                            class="clipboard-icon"
                            stroke="currentColor"
                            fill="currentColor"
                            stroke-width="0"
                            viewBox="0 0 512 512"
                            height="18px"
                            width="18px"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M296 48H176.5C154.4 48 136 65.4 136 87.5V96h-7.5C106.4 96 88 113.4 88 135.5v288c0 22.1 18.4 40.5 40.5 40.5h208c22.1 0 39.5-18.4 39.5-40.5V416h8.5c22.1 0 39.5-18.4 39.5-40.5V176L296 48zm0 44.6l83.4 83.4H296V92.6zm48 330.9c0 4.7-3.4 8.5-7.5 8.5h-208c-4.4 0-8.5-4.1-8.5-8.5v-288c0-4.1 3.8-7.5 8.5-7.5h7.5v255.5c0 22.1 10.4 32.5 32.5 32.5H344v7.5zm48-48c0 4.7-3.4 8.5-7.5 8.5h-208c-4.4 0-8.5-4.1-8.5-8.5v-288c0-4.1 3.8-7.5 8.5-7.5H264v128h128v167.5z"
                            ></path>
                          </svg>
                        `}
                  </div>
                </button>
              </div>`
            : html``
        }
        <div class="options-layout">
          <!-- Instructions -->
          ${
            !this.lobbyId
              ? html`
                  <div class="options-section">
                    <div
                      style="
                background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.05) 100%);
                border: 1px solid rgba(76, 175, 80, 0.3);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 16px;
              "
                    >
                      <div
                        style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;"
                      >
                        <div
                          style="color: #fff; font-size: 18px; font-weight: 600;"
                        >
                          Tournament Setup Guide
                        </div>
                      </div>
                      <div
                        style="color: #aaa; font-size: 14px; line-height: 1.8;"
                      >
                        <div style="margin-bottom: 8px;">
                          <span style="color: #4caf50; font-weight: 600;"
                            >1.</span
                          >
                          Set entry fee (locked on-chain via smart contract)
                        </div>
                        <div style="margin-bottom: 8px;">
                          <span style="color: #4caf50; font-weight: 600;"
                            >2.</span
                          >
                          Configure game settings below (map, difficulty,
                          options)
                        </div>
                        <div style="margin-bottom: 8px;">
                          <span style="color: #4caf50; font-weight: 600;"
                            >3.</span
                          >
                          Create and wait for players to join
                        </div>
                        <div
                          style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(76, 175, 80, 0.2);"
                        >
                          <strong style="color: #9ccc65;"
                            >Public tournaments</strong
                          >
                          appear in the Browse Tournaments list for anyone to
                          join
                        </div>
                      </div>
                    </div>
                  </div>
                `
              : ""
          }

          <!-- Success Message -->
          ${
            this.creationSuccess
              ? html`
                  <div class="options-section">
                    <div
                      style="
                background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.1) 100%);
                border: 1px solid rgba(76, 175, 80, 0.5);
                border-radius: 12px;
                padding: 16px;
                text-align: center;
                margin-bottom: 16px;
              "
                    >
                      <div
                        style="color: #9ccc65; font-size: 18px; font-weight: 600; margin-bottom: 4px;"
                      >
                        Tournament Created Successfully!
                      </div>
                      <div style="color: #aaa; font-size: 14px;">
                        ${this.lobbyVisibility === "public"
                          ? "Your tournament is now live in Browse Tournaments"
                          : "Share the lobby ID with players to join"}
                      </div>
                    </div>
                  </div>
                `
              : ""
          }

          <!-- Tournament (On-Chain) Settings -->
          <div class="options-section">
            <div class="option-title">Tournament Entry Fee</div>
            <div class="option-cards" style="flex-direction: column; align-items: center; gap: 16px;">
              <!-- Entry Fee Input -->
              <div class="option-card" style="width:100%; max-width:480px; padding:20px;">
                <div style="text-align:center; margin-bottom:16px;">
                  <div style="display:flex; gap:12px; align-items:center; justify-content:center; width:100%; margin-bottom:8px;">
                    <input
                      id="bet-amount"
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      placeholder=${this.useWagerToken ? "100" : "0.001"}
                      .value=${this.betAmount}
                      ?disabled=${!!this.lobbyId}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value.trim();
                        this.betAmount = v;
                      }}
                      style="
                        width: 200px;
                        padding: 12px 16px;
                        background: rgba(255,255,255,0.08);
                        border: 1px solid rgba(255,255,255,0.25);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 20px;
                        font-weight: 600;
                        outline: none;
                        text-align: right;
                      "
                    />
                    <span style="color:#fff; opacity:0.9; font-size:18px; font-weight:600;">
                      ${this.useWagerToken ? "fUSD" : "ETH"}
                    </span>
                  </div>
                  ${
                    this.useWagerToken
                      ? html`<div style="color:#888; font-size:14px;">
                          Fake USD (1:1)
                        </div>`
                      : this.getUSDValue()
                        ? html`<div style="color:#888; font-size:14px;">
                            ≈ $${this.getUSDValue()} USD
                          </div>`
                        : ""
                  }
                </div>

                <!-- Preset Buttons -->
                ${
                  !this.lobbyId
                    ? html`
                        <div
                          style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;"
                        >
                          ${this.useWagerToken
                            ? html`
                                <button
                                  class="option-card"
                                  style="padding:8px 16px; cursor:pointer; transition: all 0.2s;"
                                  @click=${() => (this.betAmount = "0")}
                                >
                                  Free (0 fUSD)
                                </button>
                                <button
                                  class="option-card"
                                  style="padding:8px 16px; cursor:pointer; transition: all 0.2s;"
                                  @click=${() => (this.betAmount = "1")}
                                >
                                  Low (1 fUSD)
                                </button>
                                <button
                                  class="option-card"
                                  style="padding:8px 16px; cursor:pointer; transition: all 0.2s;"
                                  @click=${() => (this.betAmount = "10")}
                                >
                                  High (10 fUSD)
                                </button>
                              `
                            : html`
                                <button
                                  class="option-card"
                                  style="padding:8px 16px; cursor:pointer; transition: all 0.2s;"
                                  @click=${() => this.setPresetAmount(0)}
                                >
                                  Free ($0)
                                </button>
                                <button
                                  class="option-card"
                                  style="padding:8px 16px; cursor:pointer; transition: all 0.2s;"
                                  @click=${() => this.setPresetAmount(1)}
                                >
                                  Low ($1)
                                </button>
                                <button
                                  class="option-card"
                                  style="padding:8px 16px; cursor:pointer; transition: all 0.2s;"
                                  @click=${() => this.setPresetAmount(10)}
                                >
                                  High ($10)
                                </button>
                              `}
                        </div>
                      `
                    : ""
                }
              </div>

              <!-- Visibility -->
              <div class="option-card" style="width:100%; max-width:480px; padding:16px;">
                <div class="option-card-title" style="width: 100%; text-align: center; margin-bottom: 12px;">
                  Visibility
                </div>
                <div style="display: flex; gap: 16px; justify-content: center; width: 100%;">
                  <label style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    cursor:pointer;
                    padding: 8px 12px;
                    border-radius: 8px;
                    background: ${this.lobbyVisibility === "private" ? "rgba(255,255,255,0.1)" : "transparent"};
                  ">
                    <input
                      type="radio"
                      name="lobby-visibility"
                      .checked=${this.lobbyVisibility === "private"}
                      ?disabled=${!!this.lobbyId}
                      @change=${() => {
                        this.lobbyVisibility = "private";
                      }}
                    />
                    Private
                  </label>
                  <label style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    cursor:pointer;
                    padding: 8px 12px;
                    border-radius: 8px;
                    background: ${this.lobbyVisibility === "public" ? "rgba(76, 175, 80, 0.2)" : "transparent"};
                  ">
                    <input
                      type="radio"
                      name="lobby-visibility"
                      .checked=${this.lobbyVisibility === "public"}
                      ?disabled=${!!this.lobbyId}
                      @change=${() => {
                        this.lobbyVisibility = "public";
                      }}
                    />
                    Public
                  </label>
                </div>
              </div>

              <!-- Create Button -->
              ${
                !this.lobbyId
                  ? html`
                      <div
                        class="option-card"
                        style="width:100%; max-width:480px; padding:16px; justify-content:center;"
                      >
                        <button
                          class="start-game-button"
                          style="width:100%; font-size:16px; padding:14px;"
                          @click=${this.createTournament.bind(this)}
                          ?disabled=${this.isCreating ||
                          !this.isValidStakeAmount()}
                        >
                          ${this.isCreating
                            ? "Creating Tournament..."
                            : this.useWagerToken
                              ? "Create Tournament (fUSD)"
                              : "Create Tournament"}
                        </button>
                      </div>
                    `
                  : ""
              }
            </div>
          </div>

          <!-- Map Selection -->
          <div class="options-section">
            <div class="option-title">${translateText("map.map")}</div>
            <div class="option-cards flex-col">
              <!-- Use the imported mapCategories -->
              ${Object.entries(mapCategories).map(
                ([categoryKey, maps]) => html`
                  <div class="w-full mb-4">
                    <h3
                      class="text-lg font-semibold mb-2 text-center text-gray-300"
                    >
                      ${translateText(`map_categories.${categoryKey}`)}
                    </h3>
                    <div class="flex flex-row flex-wrap justify-center gap-4">
                      ${maps.map((mapValue) => {
                        const mapKey = Object.keys(GameMapType).find(
                          (key) =>
                            GameMapType[key as keyof typeof GameMapType] ===
                            mapValue,
                        );
                        return html`
                          <div
                            @click=${() => this.handleMapSelection(mapValue)}
                          >
                            <map-display
                              .mapKey=${mapKey}
                              .selected=${!this.useRandomMap &&
                              this.selectedMap === mapValue}
                              .translation=${translateText(
                                `map.${mapKey?.toLowerCase()}`,
                              )}
                            ></map-display>
                          </div>
                        `;
                      })}
                    </div>
                  </div>
                `,
              )}
              <div
                class="option-card random-map ${
                  this.useRandomMap ? "selected" : ""
                }"
                @click=${this.handleRandomMapToggle}
              >
                <div class="option-image">
                  <img
                    src=${randomMap}
                    alt="Random Map"
                    style="width:100%; aspect-ratio: 4/2; object-fit:cover; border-radius:8px;"
                  />
                </div>
                <div class="option-card-title">
                  ${translateText("map.random")}
                </div>
              </div>
            </div>
          </div>

          <!-- Difficulty Selection -->
          <div class="options-section">
            <div class="option-title">${translateText("difficulty.difficulty")}</div>
            <div class="option-cards">
              ${Object.entries(Difficulty)
                .filter(([key]) => isNaN(Number(key)))
                .map(
                  ([key, value]) => html`
                    <div
                      class="option-card ${this.selectedDifficulty === value
                        ? "selected"
                        : ""}"
                      @click=${() => this.handleDifficultySelection(value)}
                    >
                      <difficulty-display
                        .difficultyKey=${key}
                      ></difficulty-display>
                      <p class="option-card-title">
                        ${translateText(`difficulty.${key}`)}
                      </p>
                    </div>
                  `,
                )}
            </div>
          </div>

          <!-- Game Mode Selection -->
          <div class="options-section">
            <div class="option-title">${translateText("host_modal.mode")}</div>
            <div class="option-cards">
              <div
                class="option-card ${this.gameMode === GameMode.FFA ? "selected" : ""}"
                @click=${() => this.handleGameModeSelection(GameMode.FFA)}
              >
                <div class="option-card-title">
                  ${translateText("game_mode.ffa")}
                </div>
              </div>
            </div>
          </div>

          <!-- Game Options -->
          <div class="options-section">
            <div class="option-title">
              ${translateText("host_modal.options_title")}
            </div>
            <div class="option-cards">
              <label for="tournament-bots-count" class="option-card">
                <input
                  type="range"
                  id="tournament-bots-count"
                  min="0"
                  max="400"
                  step="1"
                  @input=${this.handleBotsChange}
                  @change=${this.handleBotsChange}
                  .value="${String(this.bots)}"
                />
                <div class="option-card-title">
                  <span>${translateText("host_modal.bots")}</span>${
                    this.bots === 0
                      ? translateText("host_modal.bots_disabled")
                      : this.bots
                  }
                </div>
              </label>

              <label
                for="tournament-disable-npcs"
                  class="option-card ${this.disableNPCs ? "selected" : ""}"
                >
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                  id="tournament-disable-npcs"
                    @input=${this.handleDisableNPCsChange}
                    .checked=${this.disableNPCs}
                  />
                  <div class="option-card-title">
                    ${translateText("host_modal.disable_nations")}
                  </div>
                </label>

                <label
                  for="tournament-instant-build"
                  class="option-card ${this.instantBuild ? "selected" : ""}"
                >
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                    id="tournament-instant-build"
                    @input=${this.handleInstantBuildChange}
                    .checked=${this.instantBuild}
                  />
                  <div class="option-card-title">
                    ${translateText("host_modal.instant_build")}
                  </div>
                </label>

                <label
                  for="tournament-donate-gold"
                  class="option-card ${this.donateGold ? "selected" : ""}"
                >
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                    id="tournament-donate-gold"
                    @input=${this.handleDonateGoldChange}
                    .checked=${this.donateGold}
                  />
                  <div class="option-card-title">
                    ${translateText("host_modal.donate_gold")}
                  </div>
                </label>

                <label
                  for="tournament-donate-troops"
                  class="option-card ${this.donateTroops ? "selected" : ""}"
                >
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                    id="tournament-donate-troops"
                    @input=${this.handleDonateTroopsChange}
                    .checked=${this.donateTroops}
                  />
                  <div class="option-card-title">
                    ${translateText("host_modal.donate_troops")}
                  </div>
                </label>

                <label
                  for="tournament-infinite-gold"
                  class="option-card ${this.infiniteGold ? "selected" : ""}"
                >
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                    id="tournament-infinite-gold"
                    @input=${this.handleInfiniteGoldChange}
                    .checked=${this.infiniteGold}
                  />
                  <div class="option-card-title">
                    ${translateText("host_modal.infinite_gold")}
                  </div>
                </label>

              <label
                for="tournament-infinite-troops"
                  class="option-card ${this.infiniteTroops ? "selected" : ""}"
                >
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                  id="tournament-infinite-troops"
                    @input=${this.handleInfiniteTroopsChange}
                    .checked=${this.infiniteTroops}
                  />
                  <div class="option-card-title">
                    ${translateText("host_modal.infinite_troops")}
                  </div>
                </label>
                <label
                for="tournament-compact-map"
                class="option-card ${this.compactMap ? "selected" : ""}"
              >
                <div class="checkbox-icon"></div>
                <input
                  type="checkbox"
                  id="tournament-compact-map"
                  @input=${this.handleCompactMapChange}
                  .checked=${this.compactMap}
                />
                <div class="option-card-title">
                  ${translateText("host_modal.compact_map")}
                </div>
              </label>

                <hr style="width: 100%; border-top: 1px solid #444; margin: 16px 0;" />

                <!-- Individual disables for structures/weapons -->
                <div
                  style="margin: 8px 0 12px 0; font-weight: bold; color: #ccc; text-align: center;"
                >
                  ${translateText("host_modal.enables_title")}
                </div>
                <div
                  style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px;"
                >
                   ${renderUnitTypeOptions({
                     disabledUnits: this.disabledUnits,
                     toggleUnit: this.toggleUnit.bind(this),
                   })}
                  </div>
                </div>
              </div>
            </div>
          </div>

        <!-- Lobby Selection -->
        <div class="options-section">
          <div class="option-title">
            ${this.clients.length}
            ${
              this.clients.length === 1
                ? translateText("host_modal.player")
                : translateText("host_modal.players")
            }
          </div>

          <div class="players-list">
            ${this.clients.map(
              (client) => html`
                <span class="player-tag">
                  ${client.username}
                  ${client.clientID === this.lobbyCreatorClientID
                    ? html`<span class="host-badge"
                        >(${translateText("host_modal.host_badge")})</span
                      >`
                    : html`
                        <button
                          class="remove-player-btn"
                          @click=${() => this.kickPlayer(client.clientID)}
                          title="Remove ${client.username}"
                        >
                          ×
                        </button>
                      `}
                </span>
              `,
            )}
        </div>

        <div class="allowlist-section">
          <div class="option-title" style="margin-top: 24px;">
            Allowlist Controls
          </div>

          <div class="allowlist-toggle">
            <label class="option-card" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px;">
              <input
                type="checkbox"
                .checked=${this.allowlistEnabled}
                ?disabled=${!this.lobbyId || this.isUpdatingAllowlist}
                @change=${this.handleAllowlistToggle}
              />
              <span>Enable allowlist (only listed addresses can join)</span>
            </label>
          </div>

          <div class="allowlist-input" style="margin-top: 12px;">
            <textarea
              placeholder="Enter Ethereum addresses separated by commas or new lines"
              .value=${this.allowlistInput}
              ?disabled=${!this.lobbyId || !this.allowlistEnabled || this.isUpdatingAllowlist}
              @input=${(event: Event) => {
                this.allowlistInput = (
                  event.target as HTMLTextAreaElement
                ).value;
              }}
              style="width: 100%; min-height: 100px; background: rgba(255,255,255,0.05); color: #fff; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"
            ></textarea>
          </div>

          <div style="display: flex; gap: 12px; margin-top: 12px;">
            <button
              class="start-game-button"
              style="flex: 1; background: rgba(76, 175, 80, 0.85);"
              @click=${this.addAllowlistAddresses}
              ?disabled=${!this.lobbyId || !this.allowlistEnabled || this.isUpdatingAllowlist}
            >
              Add to allowlist
            </button>
            <button
              class="start-game-button"
              style="flex: 1; background: rgba(255, 87, 34, 0.85);"
              @click=${this.removeAllowlistAddresses}
              ?disabled=${!this.lobbyId || !this.allowlistEnabled || this.isUpdatingAllowlist}
            >
              Remove from allowlist
            </button>
          </div>

          ${
            this.allowlistStatusMessage
              ? html`
                  <div
                    style="margin-top: 8px; color: #ffcc80; font-size: 13px; text-align: center;"
                  >
                    ${this.allowlistStatusMessage}
                  </div>
                `
              : html``
          }

          ${
            this.currentAllowlist.length
              ? html`
                  <div
                    style="margin-top: 16px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; max-height: 160px; overflow-y: auto;"
                  >
                    <div
                      style="font-weight: bold; margin-bottom: 8px; color: #9ccc65;"
                    >
                      Current Allowlisted Addresses
                      (${this.currentAllowlist.length})
                    </div>
                    <ul
                      style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px;"
                    >
                      ${this.currentAllowlist.map(
                        (address) => html`
                          <li
                            style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 10px; border-radius: 6px;"
                          >
                            <span
                              style="font-family: monospace; font-size: 13px;"
                              >${address}</span
                            >
                            <button
                              class="remove-player-btn"
                              style="font-size: 14px; padding: 4px 8px;"
                              @click=${() =>
                                this.removeAllowlistAddresses([address])}
                            >
                              Remove
                            </button>
                          </li>
                        `,
                      )}
                    </ul>
                  </div>
                `
              : html``
          }
        </div>

        <div class="start-game-button-container">
          <button
            @click=${this.startGame}
            ?disabled=${!this.lobbyId || this.clients.length < 2}
            class="start-game-button"
          >
            ${
              this.clients.length === 1
                ? translateText("host_modal.waiting")
                : translateText("host_modal.start")
            }
          </button>
          <button
            @click=${this.cancelLobby}
            ?disabled=${!this.lobbyId || this.isCancelling}
            class="start-game-button"
            style="margin-top: 12px; background: rgba(244, 67, 54, 0.85);"
          >
            ${
              this.isCancelling
                ? "Cancelling..."
                : translateText("host_modal.cancel_lobby")
            }
          </button>
        </div>

      </div>
    </o-modal>
    `;
  }

  createRenderRoot() {
    return this;
  }

  public open() {
    this.lobbyCreatorClientID = generateID();
    this.lobbyIdVisible = this.userSettings.get(
      "settings.lobbyIdVisibility",
      true,
    );
    this.isCreating = false;
    this.creationSuccess = false;
    this.fetchETHPrice();
    this.modalEl?.open();
    // Start polling only after lobby is created
  }

  private async fetchETHPrice() {
    try {
      // Use CoinGecko free API to get ETH price
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      );
      const data = await response.json();
      this.ethPriceUSD = data.ethereum?.usd ?? null;
      console.log("ETH Price:", this.ethPriceUSD);
    } catch (error) {
      console.error("Failed to fetch ETH price:", error);
      this.ethPriceUSD = null;
    }
  }

  private getUSDValue(): string {
    if (!this.ethPriceUSD || !this.betAmount) return "";
    const eth = parseFloat(this.betAmount);
    if (isNaN(eth)) return "";
    const usd = eth * this.ethPriceUSD;
    return usd.toFixed(2);
  }

  private setPresetAmount(usdTarget: number) {
    if (!this.ethPriceUSD) {
      // Fallback if price not loaded
      const fallbacks: Record<number, string> = {
        0: "0",
        1: "0.0004",
        10: "0.004",
      };
      this.betAmount = fallbacks[usdTarget] ?? "0.001";
    } else {
      const eth = usdTarget / this.ethPriceUSD;
      this.betAmount = eth.toFixed(6);
    }
  }

  public close() {
    this.modalEl?.close();
    this.copySuccess = false;
    if (this.playersInterval) {
      clearInterval(this.playersInterval);
      this.playersInterval = null;
    }
    // Clear any pending bot updates
    if (this.botsUpdateTimer !== null) {
      clearTimeout(this.botsUpdateTimer);
      this.botsUpdateTimer = null;
    }
  }

  private async handleRandomMapToggle() {
    this.useRandomMap = true;
    this.putGameConfig();
  }

  private async handleMapSelection(value: GameMapType) {
    this.selectedMap = value;
    this.useRandomMap = false;
    this.putGameConfig();
  }

  private async handleDifficultySelection(value: Difficulty) {
    this.selectedDifficulty = value;
    this.putGameConfig();
  }

  // Modified to include debouncing
  private handleBotsChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    if (isNaN(value) || value < 0 || value > 400) {
      return;
    }

    // Update the display value immediately
    this.bots = value;

    // Clear any existing timer
    if (this.botsUpdateTimer !== null) {
      clearTimeout(this.botsUpdateTimer);
    }

    // Set a new timer to call putGameConfig after 300ms of inactivity
    this.botsUpdateTimer = window.setTimeout(() => {
      this.putGameConfig();
      this.botsUpdateTimer = null;
    }, 300);
  }

  private handleInstantBuildChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Boolean(target.checked);
    console.log(
      `[CreateTournament] instantBuild handler fired! checked=${target.checked}, newValue=${newValue}`,
    );
    this.instantBuild = newValue;
    this.requestUpdate();
    if (this.lobbyId) {
      this.putGameConfig();
    }
  }

  private handleInfiniteGoldChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Boolean(target.checked);
    console.log(
      `[CreateTournament] infiniteGold handler fired! checked=${target.checked}, newValue=${newValue}`,
    );
    this.infiniteGold = newValue;
    this.requestUpdate();
    if (this.lobbyId) {
      this.putGameConfig();
    }
  }

  private handleDonateGoldChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Boolean(target.checked);
    console.log(
      `[CreateTournament] donateGold handler fired! checked=${target.checked}, newValue=${newValue}`,
    );
    this.donateGold = newValue;
    this.requestUpdate();
    if (this.lobbyId) {
      this.putGameConfig();
    }
  }

  private handleInfiniteTroopsChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Boolean(target.checked);
    console.log(
      `[CreateTournament] infiniteTroops handler fired! checked=${target.checked}, newValue=${newValue}`,
    );
    this.infiniteTroops = newValue;
    this.requestUpdate();
    if (this.lobbyId) {
      this.putGameConfig();
    }
  }

  private handleCompactMapChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Boolean(target.checked);
    console.log(
      `[CreateTournament] compactMap handler fired! checked=${target.checked}, newValue=${newValue}`,
    );
    this.compactMap = newValue;
    this.requestUpdate();
    if (this.lobbyId) {
      this.putGameConfig();
    }
  }

  private handleDonateTroopsChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Boolean(target.checked);
    console.log(
      `[CreateTournament] donateTroops handler fired! checked=${target.checked}, newValue=${newValue}`,
    );
    this.donateTroops = newValue;
    this.requestUpdate();
    if (this.lobbyId) {
      this.putGameConfig();
    }
  }

  private async handleDisableNPCsChange(e: Event) {
    this.disableNPCs = Boolean((e.target as HTMLInputElement).checked);
    console.log(`updating disable npcs to ${this.disableNPCs}`);
    this.putGameConfig();
  }

  private async handleGameModeSelection(value: GameMode) {
    this.gameMode = value;
    this.putGameConfig();
  }

  private async handleTeamCountSelection(value: TeamCountConfig) {
    this.teamCount = value;
    this.putGameConfig();
  }

  private async putGameConfig() {
    if (!this.lobbyId) return;
    const config = await getServerConfigFromClient();
    const gameConfig = {
      gameMap: this.selectedMap,
      gameMapSize: this.compactMap ? GameMapSize.Compact : GameMapSize.Normal,
      difficulty: this.selectedDifficulty,
      disableNPCs: this.disableNPCs,
      bots: this.bots,
      infiniteGold: this.infiniteGold,
      donateGold: this.donateGold,
      infiniteTroops: this.infiniteTroops,
      donateTroops: this.donateTroops,
      instantBuild: this.instantBuild,
      gameMode: this.gameMode,
      disabledUnits: this.disabledUnits,
      playerTeams: this.teamCount,
    } satisfies Partial<GameConfig>;

    console.log(
      `[CreateTournament] Sending game config to server:`,
      gameConfig,
    );

    const response = await fetch(
      `${window.location.origin}/${config.workerPath(this.lobbyId)}/api/game/${this.lobbyId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(gameConfig),
      },
    );

    if (!response.ok) {
      console.error(
        `[CreateTournament] Failed to update game config: ${response.status} ${response.statusText}`,
      );
      throw new Error(`Failed to update game config: ${response.statusText}`);
    }

    console.log(`[CreateTournament] Game config updated successfully`);
    return response;
  }

  private toggleUnit(unit: UnitType, checked: boolean): void {
    console.log(`Toggling unit type: ${unit} to ${checked}`);
    this.disabledUnits = checked
      ? [...this.disabledUnits, unit]
      : this.disabledUnits.filter((u) => u !== unit);

    this.putGameConfig();
  }

  private getRandomMap(): GameMapType {
    const maps = Object.values(GameMapType);
    const randIdx = Math.floor(Math.random() * maps.length);
    return maps[randIdx] as GameMapType;
  }

  private async startGame() {
    if (this.useRandomMap) {
      this.selectedMap = this.getRandomMap();
    }

    await this.putGameConfig();
    console.log(
      `Starting private game with map: ${GameMapType[this.selectedMap as keyof typeof GameMapType]} ${this.useRandomMap ? " (Randomly selected)" : ""}`,
    );
    // Start on-chain as the host first. If that fails, stop.
    try {
      await startGameOnchain({ lobbyId: this.lobbyId });
    } catch (e: any) {
      console.error("On-chain start failed:", e);
      alert(e?.message ?? "On-chain start failed");
      return;
    }
    this.close();
    const config = await getServerConfigFromClient();
    const response = await fetch(
      `${window.location.origin}/${config.workerPath(this.lobbyId)}/api/start_game/${this.lobbyId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    return response;
  }

  private async copyToClipboard() {
    try {
      //TODO: Convert id to url and copy
      await navigator.clipboard.writeText(
        `${location.origin}/#join=${this.lobbyId}`,
      );
      this.copySuccess = true;
      setTimeout(() => {
        this.copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error(`Failed to copy text: ${err}`);
    }
  }

  private async pollPlayers() {
    const config = await getServerConfigFromClient();
    fetch(`/${config.workerPath(this.lobbyId)}/api/game/${this.lobbyId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data: GameInfo) => {
        console.log(`got game info response: ${JSON.stringify(data)}`);

        this.clients = data.clients ?? [];
      });
  }

  private kickPlayer(clientID: string) {
    // Dispatch event to be handled by WebSocket instead of HTTP
    this.dispatchEvent(
      new CustomEvent("kick-player", {
        detail: { target: clientID },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async createOnchainAndServerLobby(): Promise<void> {
    const amt = (this.betAmount ?? "").trim();
    if (!amt || isNaN(Number(amt)) || Number(amt) < 0) {
      throw new Error(
        `Please enter a valid entry amount in ${this.useWagerToken ? "fUSD" : "ETH"}`,
      );
    }

    // Generate lobby id at creation time
    this.lobbyId = generateID();

    // 1) Create lobby on-chain (host stakes and becomes participant)
    await createLobbyOnchain({
      lobbyId: this.lobbyId,
      betAmount: amt,
      lobbyVisibility: this.lobbyVisibility,
    });

    // 2) Create corresponding lobby on the game server with same ID
    const config = await getServerConfigFromClient();
    const response = await fetch(
      `/${config.workerPath(this.lobbyId)}/api/create_game/${this.lobbyId}?creatorClientID=${encodeURIComponent(this.lobbyCreatorClientID)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server error response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 3) Apply user's game configuration settings
    await this.putGameConfig();

    // Start polling players once created
    this.playersInterval ??= setInterval(() => this.pollPlayers(), 1000) as any;

    // Join own lobby
    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameID: this.lobbyId,
          clientID: this.lobbyCreatorClientID,
        } as JoinLobbyEvent,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private isValidStakeAmount(): boolean {
    const amt = (this.betAmount ?? "").trim();
    if (!amt) return false;
    const num = Number(amt);
    return !isNaN(num) && num >= 0;
  }

  private async createTournament(): Promise<void> {
    try {
      this.isCreating = true;
      this.creationSuccess = false;
      await this.createOnchainAndServerLobby();
      this.creationSuccess = true;
      this.allowlistStatusMessage = "";
    } catch (e: any) {
      console.error("Failed to create tournament:", e);
      alert(e?.message ?? "Failed to create tournament");
    } finally {
      this.isCreating = false;
    }
  }

  private async cancelLobby() {
    if (!this.lobbyId || this.isCancelling) return;

    const confirmed = window.confirm(
      "Cancel tournament? All players will be refunded.",
    );
    if (!confirmed) {
      return;
    }

    this.isCancelling = true;

    try {
      await cancelLobbyOnchain({ lobbyId: this.lobbyId });

      const config = await getServerConfigFromClient();
      await fetch(
        `${window.location.origin}/${config.workerPath(this.lobbyId)}/api/cancel_game/${this.lobbyId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      this.close();
    } catch (error: any) {
      console.error("Failed to cancel lobby:", error);
      alert(error?.message ?? "Failed to cancel lobby");
    } finally {
      this.isCancelling = false;
      this.allowlistStatusMessage = "";
    }
  }

  private parseAllowlistInput(): string[] {
    const raw = this.allowlistInput
      .split(/\s|,|;|\n|\r/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return Array.from(new Set(raw));
  }

  private async handleAllowlistToggle(event: Event) {
    if (!this.lobbyId || this.isUpdatingAllowlist) {
      return;
    }

    const enabled = (event.target as HTMLInputElement).checked;
    this.isUpdatingAllowlist = true;
    this.allowlistStatusMessage = "";

    try {
      await setAllowlistEnabledOnchain({
        lobbyId: this.lobbyId,
        enabled,
      });

      this.allowlistEnabled = enabled;
      if (!enabled) {
        this.allowlistInput = "";
        this.currentAllowlist = [];
      }

      this.allowlistStatusMessage = enabled
        ? "Allowlist has been enabled. Add addresses below."
        : "Allowlist disabled; anyone can join.";
    } catch (error: any) {
      console.error("Failed to toggle allowlist:", error);
      alert(error?.message ?? "Failed to update allowlist state");
      (event.target as HTMLInputElement).checked = this.allowlistEnabled;
    } finally {
      this.isUpdatingAllowlist = false;
    }
  }

  private async addAllowlistAddresses() {
    if (!this.lobbyId || !this.allowlistEnabled || this.isUpdatingAllowlist) {
      return;
    }

    const entries = this.parseAllowlistInput();
    if (!entries.length) {
      this.allowlistStatusMessage = "Enter at least one address to add.";
      return;
    }

    this.isUpdatingAllowlist = true;
    this.allowlistStatusMessage = "";

    try {
      await addToAllowlistOnchain({
        lobbyId: this.lobbyId,
        addresses: entries,
      });

      const updated = new Set([...this.currentAllowlist, ...entries]);
      this.currentAllowlist = Array.from(updated);
      this.allowlistInput = "";
      this.allowlistStatusMessage = "Allowlist updated.";
    } catch (error: any) {
      console.error("Failed to add allowlist addresses:", error);
      alert(error?.message ?? "Failed to add addresses");
    } finally {
      this.isUpdatingAllowlist = false;
    }
  }

  private async removeAllowlistAddresses(addresses?: string[]) {
    if (!this.lobbyId || !this.allowlistEnabled || this.isUpdatingAllowlist) {
      return;
    }

    const entries = addresses ?? this.parseAllowlistInput();
    if (!entries.length) {
      this.allowlistStatusMessage = "Enter at least one address to remove.";
      return;
    }

    this.isUpdatingAllowlist = true;
    this.allowlistStatusMessage = "";

    try {
      await removeFromAllowlistOnchain({
        lobbyId: this.lobbyId,
        addresses: entries,
      });

      const updated = this.currentAllowlist.filter(
        (address) => !entries.includes(address),
      );
      this.currentAllowlist = updated;
      this.allowlistInput = "";
      this.allowlistStatusMessage = "Allowlist updated.";
    } catch (error: any) {
      console.error("Failed to remove allowlist addresses:", error);
      alert(error?.message ?? "Failed to remove addresses");
    } finally {
      this.isUpdatingAllowlist = false;
    }
  }
}
