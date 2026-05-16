import mastodon from "./mastodon.js";
import stripQuery from "./stripQuery.js";

const resolvers = [mastodon, stripQuery];

export async function resolveUrl(url) {
  for (const resolver of resolvers) {
    if (resolver.canHandle(url)) {
      return resolver.resolve(url);
    }
  }
  return [url];
}
