import type { BaState } from './types';

type Caption = BaState['captions'][number];

/** Fit authored screen text to the visible scene, keeping stacked prose readable. */
export function layoutBaCaptions(
  host: HTMLElement,
  entries: { element: HTMLParagraphElement; line: Caption }[],
) {
  if (!entries.length) return;
  const bounds = host.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const dialogue = host
    .closest('.scene-reader')
    ?.querySelector('.dialogue-window');
  const dialogueBounds = dialogue?.getBoundingClientRect();
  // System passages hide the dialogue box. Its zero rectangle must not
  // collapse the screen-text page to a single pixel.
  const dialogueTop =
    dialogueBounds && dialogueBounds.width > 0 && dialogueBounds.height > 0
      ? dialogueBounds.top
      : undefined;
  const height = Math.max(
    1,
    Math.min(
      bounds.height,
      dialogueTop === undefined ? bounds.height : dialogueTop - bounds.top - 16,
    ),
  );
  const scale = Math.min(bounds.width / 3000, height / 1600);
  for (const { element, line } of entries) {
    const x = Math.max(
      bounds.width * 0.05,
      Math.min(bounds.width * 0.95, bounds.width / 2 + line.x * scale),
    );
    element.style.left = `${x}px`;
    element.style.top = `${height / 2 - line.y * scale}px`;
    element.style.fontSize = `${Math.max(14, line.size * scale)}px`;
    const width =
      line.alignment === 'right'
        ? x - bounds.width * 0.05
        : line.alignment === 'left'
          ? bounds.width * 0.95 - x
          : Math.min(x, bounds.width - x) * 1.8;
    element.style.maxWidth = `${width}px`;
  }
  // A column of screen text is a page of prose. Keep its authored order and
  // spacing when possible, but reflow wrapped blocks inside the available page.
  if (
    entries.some(
      ({ line }) => line.x !== entries[0].line.x || line.alignment !== 'center',
    )
  )
    return;
  const ordered = [...entries].sort((a, b) => b.line.y - a.line.y);
  const available = Math.max(1, height - 32);
  for (let attempt = 0; attempt < 3; attempt++) {
    const total = ordered.reduce(
      (sum, { element }) => sum + element.getBoundingClientRect().height,
      0,
    );
    if (total + 8 * (ordered.length - 1) <= available) break;
    const ratio = Math.min(
      0.95,
      available / (total + 8 * (ordered.length - 1)),
    );
    for (const { element } of ordered)
      element.style.fontSize = `${parseFloat(element.style.fontSize) * ratio}px`;
  }
  const heights = ordered.map(
    ({ element }) => element.getBoundingClientRect().height,
  );
  const free = Math.max(0, available - heights.reduce((sum, h) => sum + h, 0));
  const gapLimit = ordered.length > 1 ? free / (ordered.length - 1) : 0;
  const gaps = ordered
    .slice(1)
    .map(({ line }, i) =>
      Math.min(
        gapLimit,
        Math.max(
          8,
          (ordered[i].line.y - line.y) * scale -
            (heights[i] + heights[i + 1]) / 2,
        ),
      ),
    );
  const total =
    heights.reduce((sum, h) => sum + h, 0) +
    gaps.reduce((sum, gap) => sum + gap, 0);
  let top = Math.max(
    16,
    Math.min(
      height - total - 16,
      height / 2 - ordered[0].line.y * scale - heights[0] / 2,
    ),
  );
  for (const [i, { element }] of ordered.entries()) {
    element.style.top = `${top + heights[i] / 2}px`;
    top += heights[i] + (gaps[i] ?? 0);
  }
}
