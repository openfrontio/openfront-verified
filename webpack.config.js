import { execSync } from "child_process";
import CopyPlugin from "copy-webpack-plugin";
import dotenv from "dotenv";
import ESLintPlugin from "eslint-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env so DefinePlugin can inject client-side env values
dotenv.config();

// Get git commit hash - handle Vercel environment (no .git directory)
let gitCommit = process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA;
if (!gitCommit) {
  try {
    gitCommit = execSync("git rev-parse HEAD").toString().trim();
  } catch (error) {
    gitCommit = "unknown";
  }
}

export default async (env, argv) => {
  const isProduction = argv.mode === "production";

  // Allow configuring remote server for local development
  const GAME_SERVER_HOST = process.env.GAME_SERVER_HOST ?? "localhost";
  const GAME_SERVER_PROTOCOL = process.env.GAME_SERVER_PROTOCOL ?? "http";

  // Log all critical environment variables
  console.log("\n" + "=".repeat(80));
  console.log("🚀 WEBPACK BUILD CONFIGURATION");
  console.log("=".repeat(80));
  console.log(
    `Mode:                    ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`,
  );
  console.log(`Git Commit:              ${gitCommit}`);
  console.log("\n📡 SERVER CONNECTION:");
  console.log(`  Game Server Host:      ${GAME_SERVER_HOST}`);
  console.log(`  Game Server Protocol:  ${GAME_SERVER_PROTOCOL}`);
  console.log(
    `  Game Server URL:       ${GAME_SERVER_PROTOCOL}://${GAME_SERVER_HOST}:3000`,
  );
  console.log("\n⛓️  BLOCKCHAIN CONFIGURATION:");
  console.log(
    `  CONTRACT_ADDRESS:      ${process.env.CONTRACT_ADDRESS ?? "❌ NOT SET (will use default)"}`,
  );
  console.log(
    `  RPC_URL:               ${process.env.RPC_URL ?? "❌ NOT SET (will use default)"}`,
  );
  console.log("\n🔐 AUTHENTICATION:");
  console.log(
    `  PRIVY_APP_ID:          ${process.env.PRIVY_APP_ID ? "✅ SET" : "❌ NOT SET"}`,
  );
  console.log(
    `  API_DOMAIN:            ${process.env.API_DOMAIN ?? "localhost:8787 (default)"}`,
  );
  console.log("\n💳 PAYMENTS:");
  console.log(
    `  STRIPE_PUBLISHABLE_KEY: ${process.env.STRIPE_PUBLISHABLE_KEY ? "✅ SET" : "❌ NOT SET"}`,
  );
  console.log("=".repeat(80) + "\n");

  // Validate critical env vars
  const errors = [];
  if (!process.env.CONTRACT_ADDRESS) {
    errors.push(
      "⚠️  CONTRACT_ADDRESS not set - tournaments will use default address!",
    );
  }
  if (!process.env.PRIVY_APP_ID) {
    errors.push("⚠️  PRIVY_APP_ID not set - wallet features may not work!");
  }

  if (errors.length > 0) {
    console.error("\n❌ ENVIRONMENT WARNINGS:");
    errors.forEach((e) => console.error(`   ${e}`));
    console.error("\n   Set missing variables before building:");
    console.error(`   export CONTRACT_ADDRESS=0xYourAddress`);
    console.error(`   export PRIVY_APP_ID=your-app-id`);
    console.error(`   npm run start:client:remote\n`);
  }

  return {
    entry: "./src/client/Main.ts",
    output: {
      publicPath: "/",
      filename: "js/[name].[contenthash].js", // Added content hash
      path: path.resolve(__dirname, "static"),
      clean: isProduction,
    },
    module: {
      rules: [
        {
          test: /\.bin$/,
          type: "asset/resource", // Changed from raw-loader
          generator: {
            filename: "binary/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.txt$/,
          type: "asset/source",
        },
        {
          test: /\.md$/,
          type: "asset/resource", // Changed from raw-loader
          generator: {
            filename: "text/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                importLoaders: 1,
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: ["tailwindcss", "autoprefixer"],
                },
              },
            },
          ],
        },
        {
          test: /\.(webp|png|jpe?g|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "images/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.html$/,
          use: ["html-loader"],
        },
        {
          test: /\.svg$/,
          type: "asset/resource", // Changed from asset/inline for caching
          generator: {
            filename: "images/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf|xml)$/,
          type: "asset/resource", // Changed from file-loader
          generator: {
            filename: "fonts/[name].[contenthash][ext]", // Added content hash and fixed path
          },
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "protobufjs/minimal": path.resolve(
          __dirname,
          "node_modules/protobufjs/minimal.js",
        ),
        "process/browser": require.resolve("process/browser.js"),
        process: require.resolve("process/browser.js"),
      },
      fallback: {
        buffer: require.resolve("buffer/"),
        stream: require.resolve("stream-browserify"),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/client/index.html",
        filename: "index.html",
        // Add optimization for HTML
        minify: isProduction
          ? {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: true,
              removeScriptTypeAttributes: true,
              removeStyleLinkTypeAttributes: true,
              useShortDoctype: true,
            }
          : false,
      }),
      new webpack.DefinePlugin({
        "process.env.WEBSOCKET_URL": JSON.stringify(
          isProduction ? "" : "localhost:3000",
        ),
        "process.env.GAME_ENV": JSON.stringify(isProduction ? "prod" : "dev"),
        "process.env.GIT_COMMIT": JSON.stringify(gitCommit),
        "process.env.STRIPE_PUBLISHABLE_KEY": JSON.stringify(
          process.env.STRIPE_PUBLISHABLE_KEY,
        ),
        "process.env.API_DOMAIN": JSON.stringify(process.env.API_DOMAIN),
        "process.env.PRIVY_APP_ID": JSON.stringify(process.env.PRIVY_APP_ID),
        "process.env.CONTRACT_ADDRESS": JSON.stringify(
          process.env.CONTRACT_ADDRESS,
        ),
        "process.env.RPC_URL": JSON.stringify(process.env.RPC_URL),
        __PRIVY_APP_ID__: JSON.stringify(process.env.PRIVY_APP_ID ?? ""),
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      }),
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "resources"),
            to: path.resolve(__dirname, "static"),
            noErrorOnMissing: true,
          },
        ],
        options: { concurrency: 100 },
      }),
      new ESLintPlugin({
        context: __dirname,
      }),
    ],
    optimization: {
      // Add optimization configuration for better caching
      runtimeChunk: "single",
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
        },
      },
    },
    devServer: isProduction
      ? {}
      : {
          devMiddleware: { writeToDisk: true },
          static: {
            directory: path.join(__dirname, "static"),
          },
          historyApiFallback: true,
          compress: true,
          port: 9000,
          proxy: [
            // WebSocket proxies
            {
              context: ["/socket"],
              target: `ws://${GAME_SERVER_HOST}:3000`,
              ws: true,
              changeOrigin: true,
              logLevel: "debug",
            },
            // Worker WebSocket proxies - using direct paths without /socket suffix
            {
              context: ["/w0"],
              target: `ws://${GAME_SERVER_HOST}:3001`,
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w1"],
              target: `ws://${GAME_SERVER_HOST}:3002`,
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w2"],
              target: `ws://${GAME_SERVER_HOST}:3003`,
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            // Worker proxies for HTTP requests
            {
              context: ["/w0"],
              target: `${GAME_SERVER_PROTOCOL}://${GAME_SERVER_HOST}:3001`,
              pathRewrite: { "^/w0": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w1"],
              target: `${GAME_SERVER_PROTOCOL}://${GAME_SERVER_HOST}:3002`,
              pathRewrite: { "^/w1": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w2"],
              target: `${GAME_SERVER_PROTOCOL}://${GAME_SERVER_HOST}:3003`,
              pathRewrite: { "^/w2": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            // Original API endpoints
            {
              context: [
                "/api/env",
                "/api/game",
                "/api/public_lobbies",
                "/api/wallet",
                "/api/join_game",
                "/api/start_game",
                "/api/create_game",
                "/api/archive_singleplayer_game",
                "/api/auth/callback",
                "/api/auth/discord",
                "/api/kick_player",
              ],
              target: `${GAME_SERVER_PROTOCOL}://${GAME_SERVER_HOST}:3000`,
              secure: false,
              changeOrigin: true,
            },
          ],
        },
  };
};
