export function normalizeTagName(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

export function getUniqueTagNames(tags: string[]) {
  return Array.from(
    new Set(tags.map((tag) => normalizeTagName(tag)).filter(Boolean))
  );
}
