const env = require("./config/env");
const createApp = require("./app");
const { connectDB, disconnectDB } = require("./config/db");

async function start() {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    const displayHost = env.HOST === "0.0.0.0" ? "127.0.0.1" : env.HOST;
    console.log(
      `[server] Campus Lost & Found running at http://${displayHost}:${env.PORT}`
    );
    console.log(`[server] environment: ${env.NODE_ENV}`);
    console.log("[server] First run: npm run seed to create the test accounts");
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`\n[server] ${signal} received, shutting down...`);

    const forceExit = setTimeout(() => {
      console.error("[server] shutdown timeout, forcing exit");
      process.exit(1);
    }, 10000);
    forceExit.unref();

    server.close(async () => {
      try {
        await disconnectDB();
      } catch (error) {
        console.error("[server] MongoDB disconnect failed:", error.message);
      }

      clearTimeout(forceExit);
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error("[server] failed to start:", error.message);
    process.exit(1);
  });
}

module.exports = { start };
