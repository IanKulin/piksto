import dns from "node:dns/promises";
import net from "node:net";
import logger from "./logger.js";

export class SsrfBlockedError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "SsrfBlockedError";
  }
}

const BLOCKED_V4 = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/;
const BLOCKED_V6 = /^(::1$|fc|fd|fe80)/i;

export function isBlockedIp(ip) {
  return net.isIPv4(ip) ? BLOCKED_V4.test(ip) : BLOCKED_V6.test(ip);
}

export async function assertSafeUrl(rawUrl, resolver = dns) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new SsrfBlockedError("Invalid URL");

  const { hostname } = parsed;
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare) && isBlockedIp(bare)) throw new SsrfBlockedError("Blocked IP");

  const v4 = await resolver.resolve4(hostname).catch((err) => {
    logger.warn("SSRF guard: DNS resolve4 failed for %s: %s", hostname, err.message);
    return [];
  });
  const v6 = await resolver.resolve6(hostname).catch((err) => {
    logger.warn("SSRF guard: DNS resolve6 failed for %s: %s", hostname, err.message);
    return [];
  });
  const all = [...v4, ...v6];
  if (all.length === 0) throw new SsrfBlockedError("Could not resolve hostname");
  if (all.some(isBlockedIp)) throw new SsrfBlockedError("Blocked IP");
}
