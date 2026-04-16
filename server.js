const app = require("./app");
const logger = require("./src/logger");
const { closeDb } = require("./src/db");

const port = process.env.PORT || 3000;

logger.ready.then(() => {
  const server = app.listen(port, () => {
    logger.info("photo-sink listening on port %d", port);
  });

  function shutdown(signal) {
    logger.info("received %s, shutting down", signal);
    server.close(() => {
      closeDb();
      logger.info("shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
