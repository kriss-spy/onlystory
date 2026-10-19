// Match supplied source aliases without changing the displayed original title.
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
export function matchesSearch(query: string, values: (string | undefined)[]) {
  const text = normalizeSearch(values.filter(Boolean).join(' '));
  return normalizeSearch(query)
    .split(' ')
    .every((term) => text.includes(term));
}
