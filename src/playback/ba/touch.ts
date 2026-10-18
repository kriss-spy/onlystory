import { canonicalBaScriptLine } from './script';

/** Scenario UI uses 3000 horizontal units; match the displayed CG's cover crop. */
export function baTouchRegion(
  script: string,
  viewport = { width: 1920, height: 1080 },
  image = { width: 1920, height: 1080 },
) {
  const line = script
    .split('\n')
    .map(canonicalBaScriptLine)
    .find((s) => s.startsWith('#touch;'));
  if (!line) return null;
  const [x, y, width, height] = line.split(';').slice(1).map(Number);
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error('Invalid story touch region.');
  const designHeight = (3000 * image.height) / image.width;
  const scale = Math.max(viewport.width / 3000, viewport.height / designHeight);
  return {
    left: 50 + ((x * scale) / viewport.width) * 100,
    top: 50 - ((y * scale) / viewport.height) * 100,
    width: ((width * scale) / viewport.width) * 100,
    height: ((height * scale) / viewport.height) * 100,
  };
}
