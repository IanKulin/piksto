const app = require("./app");
const logger = require("./src/logger");

const port = process.env.PORT || 3000;

logger.ready.then(() => {
  app.listen(port, () => {
    logger.info("photo-sink listening on port %d", port);
  });
});
