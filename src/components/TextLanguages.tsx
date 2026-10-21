import { useI18n } from '../i18n';
import type { Episode } from '../model';
import { supportedTextLanguages } from '../text-languages';

const languageLabels = { en: 'EN', 'zh-CN': 'CN', ja: 'JP' };

export function TextLanguages({ stories }: { stories: Episode[] }) {
  const { t } = useI18n();
  const languages = supportedTextLanguages(stories);
  return (
    <span
      className="text-languages"
      role="group"
      aria-label={t('Supported text languages')}
    >
      <span>{t('Text:')}</span>
      {languages.length ? (
        languages.map(({ locale, name, count, total }) => (
          <span
            className="text-language"
            role="group"
            key={locale}
            title={t('{language} dialogue in {count} of {total} stories', {
              language: t(name),
              count,
              total,
            })}
            aria-label={t('{language} dialogue in {count} of {total} stories', {
              language: t(name),
              count,
              total,
            })}
          >
            {languageLabels[locale]}
            {count < total
              ? t(' · {count}/{total} stories', { count, total })
              : ''}
          </span>
        ))
      ) : (
        <span>{t('Unavailable')}</span>
      )}
    </span>
  );
}
