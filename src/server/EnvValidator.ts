import { GameEnv } from "../core/configuration/Config";
import { logger } from "./Logger";

const log = logger.child({ comp: "env-validator" });

interface EnvConfig {
  required: string[];
  optional: string[];
  conditionallyRequired?: {
    condition: () => boolean;
    vars: string[];
    reason: string;
  }[];
}

const ENV_REQUIREMENTS: Record<GameEnv, EnvConfig> = {
  [GameEnv.Dev]: {
    required: [],
    optional: [
      "CONTRACT_ADDRESS",
      "RPC_URL",
      "mnemonic",
      "WALLET_LINK_FILE",
      "ADMIN_TOKEN",
      "API_KEY",
      "CF_ACCOUNT_ID",
      "CF_API_TOKEN",
      "R2_ACCESS_KEY",
      "R2_SECRET_KEY",
      "R2_BUCKET",
      "COINBASE_CDP_API_KEY_JSON",
      "COINBASE_CDP_API_KEY_PATH",
      "COINBASE_CDP_API_KEY_NAME",
      "COINBASE_CDP_PRIVATE_KEY",
    ],
  },
  [GameEnv.Preprod]: {
    required: [
      "CONTRACT_ADDRESS",
      "RPC_URL",
      "mnemonic",
      "DOMAIN",
      "SUBDOMAIN",
    ],
    optional: [
      "CF_ACCOUNT_ID",
      "CF_API_TOKEN",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_AUTH_HEADER",
      "ADMIN_TOKEN",
      "API_KEY",
      "WALLET_LINK_FILE",
      "R2_ACCESS_KEY",
      "R2_SECRET_KEY",
      "R2_BUCKET",
      "COINBASE_CDP_API_KEY_JSON",
      "COINBASE_CDP_API_KEY_PATH",
      "COINBASE_CDP_API_KEY_NAME",
      "COINBASE_CDP_PRIVATE_KEY",
    ],
    conditionallyRequired: [
      {
        condition: () => true, // Always warn about these in preprod
        vars: ["ADMIN_TOKEN"],
        reason: "needed for public lobbies and player kicks",
      },
    ],
  },
  [GameEnv.Prod]: {
    required: [
      "CONTRACT_ADDRESS",
      "RPC_URL",
      "mnemonic",
      "ADMIN_TOKEN",
      "DOMAIN",
      "SUBDOMAIN",
    ],
    optional: [
      "CF_ACCOUNT_ID",
      "CF_API_TOKEN",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "OTEL_AUTH_HEADER",
      "API_KEY",
      "WALLET_LINK_FILE",
      "R2_ACCESS_KEY",
      "R2_SECRET_KEY",
      "R2_BUCKET",
      "COINBASE_CDP_API_KEY_JSON",
      "COINBASE_CDP_API_KEY_PATH",
      "COINBASE_CDP_API_KEY_NAME",
      "COINBASE_CDP_PRIVATE_KEY",
    ],
    conditionallyRequired: [
      {
        condition: () => true,
        vars: ["API_KEY"],
        reason: "needed for game replay archival",
      },
    ],
  },
};

export function validateEnvironment(env: GameEnv): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = ENV_REQUIREMENTS[env];

  log.info(`Validating environment variables for ${GameEnv[env]} mode`);

  // Check required variables
  for (const varName of config.required) {
    const value = process.env[varName];
    if (!value || value.trim() === "") {
      errors.push(`❌ MISSING REQUIRED: ${varName}`);
    } else {
      log.info(`✅ ${varName}: present`);
    }
  }

  // Check conditionally required
  if (config.conditionallyRequired) {
    for (const conditional of config.conditionallyRequired) {
      if (conditional.condition()) {
        for (const varName of conditional.vars) {
          const value = process.env[varName];
          if (!value || value.trim() === "") {
            errors.push(
              `❌ MISSING REQUIRED (${conditional.reason}): ${varName}`,
            );
          } else {
            log.info(`✅ ${varName}: present (${conditional.reason})`);
          }
        }
      }
    }
  }

  // Check optional but warn if missing
  for (const varName of config.optional) {
    const value = process.env[varName];
    if (!value || value.trim() === "") {
      warnings.push(`⚠️  OPTIONAL (not set): ${varName}`);
    } else {
      log.info(`✅ ${varName}: present (optional)`);
    }
  }

  // Specific validations
  validateContractAddress(errors, warnings);
  validateMnemonic(errors, warnings, env);
  validateRpcUrl(warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateContractAddress(errors: string[], warnings: string[]) {
  const addr = process.env.CONTRACT_ADDRESS;
  if (addr) {
    if (!addr.startsWith("0x")) {
      errors.push(`❌ CONTRACT_ADDRESS must start with 0x: ${addr}`);
    } else if (addr.length !== 42) {
      errors.push(
        `❌ CONTRACT_ADDRESS must be 42 characters (0x + 40 hex): ${addr}`,
      );
    } else if (addr === "0x0000000000000000000000000000000000000000") {
      warnings.push(
        `⚠️  CONTRACT_ADDRESS is zero address (tournaments disabled)`,
      );
    }
  }
}

function validateMnemonic(errors: string[], warnings: string[], env: GameEnv) {
  const mnemonic = process.env.MNEMONIC ?? process.env.mnemonic;
  if (mnemonic) {
    const words = mnemonic.trim().split(/\s+/);
    if (![12, 15, 18, 21, 24].includes(words.length)) {
      errors.push(
        `❌ mnemonic has ${words.length} words, expected 12/15/18/21/24`,
      );
    } else {
      log.info(`✅ mnemonic: ${words.length} words`);
    }
  } else if (env !== GameEnv.Dev) {
    warnings.push(
      `⚠️  mnemonic not set - server cannot declare winners on-chain`,
    );
  }
}

function validateRpcUrl(warnings: string[]) {
  const rpcUrl = process.env.RPC_URL;
  if (rpcUrl) {
    if (!rpcUrl.startsWith("http://") && !rpcUrl.startsWith("https://")) {
      warnings.push(
        `⚠️  RPC_URL should start with http:// or https://: ${rpcUrl}`,
      );
    }
  }
}

export function validateEnvironmentOrExit(env: GameEnv): void {
  const result = validateEnvironment(env);

  // Log warnings
  if (result.warnings.length > 0) {
    log.warn(`Environment warnings:`);
    result.warnings.forEach((w) => log.warn(w));
  }

  // Log errors and exit if any
  if (!result.valid) {
    log.error(`❌ Environment validation FAILED`);
    result.errors.forEach((e) => log.error(e));
    log.error(`\nPlease set the required environment variables.`);
    log.error(`See example.env for reference.`);
    process.exit(1);
  }

  log.info(`✅ Environment validation PASSED`);
}
