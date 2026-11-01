export function parseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

export function serialize(row: any) {
  return {
    ...row,
    articles: parseJson<string[]>(row.articles, []),
    jurisprudence: parseJson<string[]>(row.jurisprudence, []),
    conseils: parseJson<string[]>(row.conseils, []),
  };
}
