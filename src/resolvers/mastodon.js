import logger from "../logger.js";

const mastodon = {
  canHandle(url) {
    return /^https:\/\/[^/]+\/@[^/]+\/\d+/.test(url);
  },

  async resolve(url) {
    const match = url.match(/^https:\/\/([^/]+)\/@[^/]+\/(\d+)/);
    const [, instance, statusId] = match;
    const apiUrl = `https://${instance}/api/v1/statuses/${statusId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "photo-sink/1.0" },
        redirect: "error",
      });
      if (!res.ok) throw new Error(`Mastodon API returned HTTP ${res.status}`);
      const data = await res.json();
      const urls = (data.media_attachments ?? [])
        .filter((a) => a.type === "image")
        .map((a) => a.url);
      if (!urls.length) throw new Error("No image attachments found in Mastodon post");
      logger.info("Mastodon link resolved: %d image(s)", urls.length);
      return urls;
    } finally {
      clearTimeout(timeout);
    }
  },
};

export default mastodon;
