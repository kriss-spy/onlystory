import { useI18n } from '../i18n';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { storySections, type StoryEvent } from '../catalog';
import { useStore } from '../store';
import { StoryList } from './StoryList';
import { gamePreferences } from '../model';
import { localizedTitle } from '../localized-titles';

export function StorySections({
  event,
  query,
  from,
  catalogFrom,
}: {
  event: StoryEvent;
  query: string;
  from: string;
  catalogFrom?: string;
}) {
  const { t } = useI18n();
  const { data } = useStore();
  const storageKey = `onlystory.chapters.${event.game}.${event.id}`;
  const [folds, setFolds] = useState<Record<string, boolean>>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? '{}',
      );
      return saved && typeof saved === 'object' && !Array.isArray(saved)
        ? Object.fromEntries(
            Object.entries(saved).filter(
              (entry) => typeof entry[1] === 'boolean',
            ),
          )
        : {};
    } catch {
      return {};
    }
  });
  const sections = storySections(event, query);
  const latest = event.stories
    .filter((story) => data.saves[story.id])
    .sort((a, b) =>
      data.saves[b.id].updatedAt.localeCompare(data.saves[a.id].updatedAt),
    )[0];
  const defaultChapter = latest?.chapter?.id ?? event.stories[0]?.chapter?.id;
  return (
    <>
      {sections.map((section) => {
        const contents = (
          <>
            {!!section.main.length && (
              <StoryList
                rows={section.main}
                from={from}
                catalogFrom={catalogFrom}
              />
            )}
            {!!section.independent.length && (
              <section className="independent-section">
                <h2>{t('Outside the main timeline')}</h2>
                <StoryList
                  rows={section.independent}
                  from={from}
                  catalogFrom={catalogFrom}
                  independent
                />
              </section>
            )}
          </>
        );
        if (!section.chapter) return <div key={section.id}>{contents}</div>;
        const completed = section.stories.filter(
          (story) => data.saves[story.id]?.completed,
        ).length;
        const open =
          !!query || (folds[section.id] ?? section.id === defaultChapter);
        return (
          <section
            className="story-chapter"
            key={section.id}
            data-chapter-id={section.id}
          >
            <h2>
              <button
                type="button"
                className="chapter-toggle"
                aria-expanded={open}
                aria-controls={`chapter-${section.id}`}
                onClick={() => {
                  const next = { ...folds, [section.id]: !open };
                  setFolds(next);
                  try {
                    localStorage.setItem(storageKey, JSON.stringify(next));
                  } catch {
                    /* Reading works without storage. */
                  }
                }}
              >
                <ChevronRight size={18} aria-hidden="true" />
                <span>
                  {localizedTitle(
                    section.chapter.title,
                    section.chapter.titleLocales,
                    gamePreferences(data.preferences, event.game).catalogLocale,
                  )}
                </span>
                <small>
                  {completed
                    ? t('{read} of {total} read', {
                        read: completed,
                        total: section.stories.length,
                      })
                    : t('{count} stories', { count: section.stories.length })}
                </small>
              </button>
            </h2>
            <div id={`chapter-${section.id}`} hidden={!open}>
              {open ? contents : null}
            </div>
          </section>
        );
      })}
    </>
  );
}
