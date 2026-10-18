const commands = new Map(
  [
    'hidemenu',
    'showmenu',
    'hidetextbox',
    'wait',
    'all',
    'stm',
    'st',
    'str',
    'clearST',
    'na',
    'place',
    'zmc',
    'zmlt',
    'bgshake',
    'fontsize',
    'title',
    'continued',
    'Ending',
    'nextepisode',
    'video',
    'videons2',
    'timelineNS',
    'touch',
    'fx',
  ].map((name) => [name.toLowerCase(), name]),
);
const actions = new Map(
  [
    'a',
    'h',
    'greeting',
    'd',
    'em',
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'dr',
    'hophop',
    'shake',
    'stiff',
    'al',
    'ar',
    'dl',
    'hide',
    'fx',
    'closeup',
    'black',
    'white',
    'jump',
    'falldownL',
    'falldownR',
    'falldownLAuto',
    'sig',
  ].map((name) => [name.toLowerCase(), name]),
);

/** Only command names are case-insensitive; character IDs and face names stay intact. */
export function canonicalBaScriptLine(raw: string) {
  const parts = raw.trim().split(';');
  if (/^#[1-5]$/.test(parts[0]))
    parts[1] =
      parts[1]?.toLowerCase() === 'falldownlauto'
        ? 'falldownL'
        : (actions.get(parts[1]?.toLowerCase()) ?? parts[1]);
  else if (parts[0].startsWith('#'))
    parts[0] =
      '#' +
      (commands.get(parts[0].slice(1).toLowerCase()) ?? parts[0].slice(1));
  return parts.join(';');
}
export function canonicalBaScript(raw: string) {
  return raw.split('\n').map(canonicalBaScriptLine).join('\n');
}
