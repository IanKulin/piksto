let _logger = null;

const ready = import("@iankulin/logger").then(({ default: Logger }) => {
  _logger = new Logger({
    format: "simple",
    callerLevel: "warn",
    level: process.env.LOG_LEVEL || "info",
  });
});

const logger = new Proxy(
  {},
  {
    get(_, method) {
      if (method === "ready") return ready;
      return (...args) => {
        if (_logger) _logger[method](...args);
      };
    },
  }
);

export default logger;
