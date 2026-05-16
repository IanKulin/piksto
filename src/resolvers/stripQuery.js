const stripQuery = {
  canHandle(url) {
    try {
      return Boolean(new URL(url).search);
    } catch {
      return false;
    }
  },

  async resolve(url) {
    const parsed = new URL(url);
    parsed.search = "";
    return [parsed.toString()];
  },
};

export default stripQuery;
