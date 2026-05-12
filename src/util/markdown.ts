const FRONTMATTER_BLOCK = /^---\n[\s\S]*?\n---\n?/;

export function stripFrontmatter(raw: string): string {
  const m = raw.match(FRONTMATTER_BLOCK);
  return m ? raw.slice(m[0].length) : raw;
}
