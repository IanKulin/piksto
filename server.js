import app from "./app.js";
import logger from "./src/logger.js";
import { closeDb } from "./src/db.js";
import { closeSessionDb } from "./src/sessionDb.js";

const port = process.env.PORT || 3000;

logger.ready.then(() => {
  const server = app.listen(port, () => {
    logger.info("piksto listening on port %d", port);
  });

  function shutdown(signal) {
    logger.info("received %s, shutting down", signal);
    server.close(() => {
      closeDb();
      closeSessionDb();
      logger.info("shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
