import type { useI18n } from '../i18n';

// Translate reader diagnostics while retaining source filenames and identifiers.
export function playbackMessage(
  t: ReturnType<typeof useI18n>['t'],
  message: string,
) {
  const resource =
    /^(Audio|Audio cue|Background) unavailable: (.*)\. You can keep reading\.$/s.exec(
      message,
    );
  if (resource)
    return t(`${resource[1]} unavailable: {name}. You can keep reading.`, {
      name: resource[2],
    });
  const original = /^Original (\w+) unavailable: (.*)$/s.exec(message);
  if (original)
    return t('Original {kind} unavailable: {label}', {
      kind: t(original[1]),
      label: original[2],
    });
  if (message.startsWith('Hologram unavailable: '))
    return t('Hologram unavailable: {error}', {
      error: message.slice('Hologram unavailable: '.length),
    });
  const alias =
    /^The authored (.+) alias has no ScenarioCharacterName row in the pinned JP build\. Preserve the row and omit only this actor cue\.$/s.exec(
      message,
    );
  if (alias)
    return t(
      'The authored {alias} alias has no ScenarioCharacterName row in the pinned JP build. Preserve the row and omit only this actor cue.',
      { alias: alias[1] },
    );
  return t(message);
}
