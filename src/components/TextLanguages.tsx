import type { Episode } from '../model';
import { supportedTextLanguages } from '../text-languages';

const languageLabels = { en: 'EN', 'zh-CN': 'CN', ja: 'JP' };

export function TextLanguages({ stories }: { stories: Episode[] }) {
  const languages = supportedTextLanguages(stories);
  return (
    <span
      className="text-languages"
      role="group"
      aria-label="Supported text languages"
    >
      <span>Text:</span>
      {languages.length ? (
        languages.map(({ locale, name, count, total }) => (
          <span
            className="text-language"
            role="group"
            key={locale}
            title={`${name} dialogue in ${count} of ${total} stories`}
            aria-label={`${name} dialogue in ${count} of ${total} stories`}
          >
            {languageLabels[locale]}
            {count < total ? ` · ${count}/${total} stories` : ''}
          </span>
        ))
      ) : (
        <span>Unavailable</span>
      )}
    </span>
  );
}
