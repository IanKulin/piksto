function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export { slugify };
