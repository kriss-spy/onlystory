import { describe, expect, it } from 'vitest';
import type { Episode } from '../../model';
import { decodePjskText } from './text';
import reviewedRecipe from '../../downloads/pjsk-mmj-01-01.json';

const episode = {
  id: 'sample',
  nodes: [],
  assets: ['/private/pjsk/assets/text.json'],
  entryNodeId: 'first',
  content: { format: 'pjsk-text-v1', count: 2 },
} as unknown as Episode;
const payload = () => ({
  format: 'pjsk-text-v1',
  id: 'sample',
  assets: ['/private/pjsk/assets/movie.mp4'],
  nodes: [
    {
      id: 'first',
      kind: 'video',
      text: { 'zh-CN': '原文' },
      scene: {},
      video: '/private/pjsk/assets/movie.mp4',
      performance: { title: 'Song', notice: 'Original audio' },
      next: 'last',
    },
    { id: 'last', kind: 'end', text: { 'zh-CN': '' }, scene: {} },
  ],
});

describe('lazy PJSK chapters', () => {
  it('normalizes discovery metadata from both catalog and prepared text without mutating either', () => {
    const discovery = reviewedRecipe.media.files.find((file) =>
      file.sourceUrl?.endsWith('/live2d/model_list.json'),
    )!.url;
    const catalog = { ...episode, assets: [...episode.assets, discovery] };
    const prepared = payload();
    prepared.assets.push(discovery);
    const loaded = decodePjskText(prepared, catalog);
    expect(loaded.assets).toEqual([...episode.assets, ...payload().assets]);
    expect(catalog.assets).toContain(discovery);
    expect(prepared.assets).toContain(discovery);
  });
  it('hydrates text, saved passage IDs, movies and offline assets', () => {
    const loaded = decodePjskText(payload(), episode);
    expect(loaded.nodes[0].id).toBe(episode.entryNodeId);
    expect(loaded.nodes[0].performance?.title).toBe('Song');
    expect(loaded.nodes[0].video).toBe('/private/pjsk/assets/movie.mp4');
    expect(loaded.assets).toHaveLength(2);
    expect(episode.nodes).toEqual([]);
  });
  it('rejects another episode, truncation, duplicate IDs and broken passage links', () => {
    for (const bad of [
      { ...payload(), id: 'other' },
      { ...payload(), nodes: payload().nodes.slice(0, 1) },
      { ...payload(), nodes: [payload().nodes[0], payload().nodes[0]] },
      {
        ...payload(),
        nodes: [{ ...payload().nodes[0], next: 'missing' }, payload().nodes[1]],
      },
    ])
      expect(() => decodePjskText(bad, episode)).toThrow('does not match');
  });
});
