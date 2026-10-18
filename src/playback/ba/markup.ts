export function parseBaText(source: string) {
  const formatted = source
    .replace(/#n/g, '\n')
    .replace(
      /\[(?:ruby=[^\]]*|\/ruby|log(?:=[^\]]*)?|\/log|[0-9a-f]{6,8}|-|b|\/b|i|\/i)\]/gi,
      '',
    );
  const pauses: { offset: number; delay: number }[] = [];
  let text = '',
    cursor = 0;
  for (const match of formatted.matchAll(/\[wa:(\d+)\]/g)) {
    text += formatted.slice(cursor, match.index);
    pauses.push({ offset: Array.from(text).length, delay: Number(match[1]) });
    cursor = match.index + match[0].length;
  }
  text += formatted.slice(cursor);
  return { text, pauses };
}
