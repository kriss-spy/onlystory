import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = 'private-review/cg-audit';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = read(`${directory}/source-audit.json`);
const cases = source.findings.filter((entry) => entry.cg);
const rows = cases.map((entry, index) => {
  const name = `${String(index + 1).padStart(3, '0')}-${entry.event}-${entry.script}-${entry.row}`;
  const result = read(`${directory}/${name}.json`);
  if (result.result !== 'pass' || result.auditVersion !== source.auditVersion)
    throw Error(`Missing current passing browser evidence for ${name}`);
  if (
    result.script !== entry.script ||
    result.row !== entry.row ||
    result.graphic?.url !== entry.url ||
    result.graphic?.id !== entry.label ||
    !result.graphic.visible ||
    !(result.graphic.alpha > 0) ||
    !(result.graphic.width > 0) ||
    !(result.graphic.height > 0)
  )
    throw Error(
      `Browser evidence does not match the current CG reference: ${name}`,
    );
  if (
    !entry.sourceHashValid ||
    !entry.compiledExact ||
    !entry.sceneExact ||
    !entry.retainedAtPassage ||
    !entry.assetAvailable
  )
    throw Error(`Source coverage failed for ${name}`);
  const bytes = readFileSync(`public${entry.url}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!entry.url.endsWith(`/${sha256}.webp`))
    throw Error(`CG payload digest mismatch: ${entry.label}`);
  return {
    ...entry,
    result: 'pass',
    payloadSha256: sha256,
    screenshot: `${name}.png`,
    reader: `http://127.0.0.1:4173/read/gfl2/${entry.section}?line=${encodeURIComponent(entry.revealStep ?? entry.step)}&choices=${encodeURIComponent(JSON.stringify(entry.answers ?? {}))}`,
  };
});
const graphicsGaps = source.findings.filter((entry) => !entry.assetAvailable);
const report = {
  checkedAt: new Date().toISOString(),
  auditVersion: source.auditVersion,
  events: source.events,
  books: source.books,
  graphicCommands: source.graphicCommands,
  cgReferences: rows.length,
  uniqueCGs: source.uniqueCGs,
  browserPassed: rows.length,
  sourceGraphicCommandsExact: source.findings.every(
    (entry) => entry.sourceHashValid && entry.compiledExact && entry.sceneExact,
  ),
  graphicsGaps,
  rows,
  limits:
    'Installed imported scripts only. CGs identified from labels and source texture paths containing CG; every Bg/Sprite command is also checked for source preservation. Browser evidence checks loaded original URL, nonzero dimensions, visible container and nonzero opacity at the source reveal, with a screenshot. This does not prove pixel-perfect parity with the running game, Unity shader/animation fidelity, or unimported editions/events.',
};
writeFileSync(
  `${directory}/report.json`,
  JSON.stringify(report, null, 2) + '\n',
);
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
writeFileSync(
  `${directory}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>GFL2 CG audit</title><style>body{font:16px/1.6 system-ui;max-width:1400px;margin:40px auto;padding:20px;background:#f7f7f5;color:#222}h1{font-size:28px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #ccc;vertical-align:top}img{width:280px;height:auto}small{word-break:break-all}a{color:#28533c}code{word-break:break-all}</style><h1>GFL2 CG audit</h1><p>${report.events} events · ${report.books} source scripts · ${report.graphicCommands} graphic commands · ${report.cgReferences} CG references · ${report.uniqueCGs} unique images · ${report.browserPassed} browser passes.</p><p>Checked ${escape(report.checkedAt)}. Original source rows, compiled scenes and published payload hashes are checked. <a href="report.json">Full report</a> · <a href="source-audit.json">Every graphic source command</a>.</p><p>${escape(report.limits)}</p><h2>Known non-CG gaps</h2><ul>${graphicsGaps.map((g) => `<li>${escape(g.event)} · ${escape(g.script)}:${g.row} · ${escape(g.label)}</li>`).join('')}</ul><p>The listed 地图 references are unresolved original map prefabs. 延后句子结束用物品 is a verified nonvisual timing prefab. They are retained as gaps and are not counted as passing CGs.</p><h2>Every CG reference</h2><table><thead><tr><th>Source</th><th>Playback evidence</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escape(row.label)}</strong><br>${escape(row.event)}<br>${escape(row.script)}:${row.row}<br>${escape(row.title)}<br><a href="${escape(row.reader)}">Open original passage</a>${row.explicitlyHidden ? '<p>Source starts this image hidden; its later reveal is tested.</p>' : ''}<small>SHA-256 ${row.payloadSha256}</small></td><td><a href="${row.screenshot}"><img loading="lazy" src="${row.screenshot}" alt="${escape(row.label)} reader screenshot"></a><br>Source / scene / payload / browser: PASS</td></tr>`).join('')}</tbody></table></html>`,
);
console.log(
  `${rows.length}/${cases.length} CG references passed; ${source.uniqueCGs} payload digests verified. Report: ${directory}/index.html`,
);
