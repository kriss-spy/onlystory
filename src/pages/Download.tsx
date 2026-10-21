import { useI18n } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, FolderOpen, X } from 'lucide-react';
import { episodeById } from '../content';
import { isInstalled, useStore } from '../store';
import { PageTitle } from '../components/Shell';
import { EmptyState, formatBytes } from '../components/Primitives';
import { selectedOriginals } from '../downloads/ba';
import { loadBaRecipe, type BaRecipe } from '../downloads/ba-catalog';
import { requiredBaInputs } from '../downloads/ba/output-cache.mjs';
import { hasOnlineSource, isBaImport } from '../downloads/providers';
import { pjskDownloadById } from '../downloads/pjsk-catalog';

export default function DownloadPage() {
  const { t } = useI18n();
  const { episode: id } = useParams();
  const episode = episodeById(id);
  const store = useStore();
  const [files, setFiles] = useState<File[]>([]);
  const [missingOnly, setMissingOnly] = useState(true);
  const [baRecipe, setBaRecipe] = useState<BaRecipe>();
  const [recipeError, setRecipeError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFiles([]);
    setBaRecipe(undefined);
    setRecipeError('');
    if (!episode || !isBaImport(episode)) return;
    const controller = new AbortController();
    void loadBaRecipe(episode, controller.signal)
      .then(async (recipe) => ({
        ...recipe,
        inputs: await requiredBaInputs(recipe),
      }))
      .then(
        (recipe) => {
          if (!controller.signal.aborted) setBaRecipe(recipe);
        },
        (error) => {
          if (!controller.signal.aborted)
            setRecipeError(
              error instanceof Error ? error.message : String(error),
            );
        },
      );
    return () => controller.abort();
  }, [episode, attempt]);
  const matched = useMemo(
    () =>
      new Set(
        baRecipe ? selectedOriginals(files, baRecipe).map((a) => a.id) : [],
      ),
    [files, baRecipe],
  );
  if (!episode || !hasOnlineSource(episode))
    return (
      <main className="page">
        <EmptyState title={t('Source not available')}>
          <Link to="/manage">{t('Back to downloads')}</Link>
        </EmptyState>
      </main>
    );
  const ba = isBaImport(episode),
    desktop = !!window.onlystoryDesktop;
  if (ba && !baRecipe)
    return (
      <main className="page acquisition-page">
        <PageTitle title={episode.title} back={`/games/${episode.game}`} />
        {recipeError ? (
          <>
            <p role="alert">{recipeError}</p>
            <button onClick={() => setAttempt((value) => value + 1)}>
              {t('Retry')}
            </button>
          </>
        ) : (
          <p role="status">{t('Preparing download instructions…')}</p>
        )}
      </main>
    );
  const job = store.transfers[episode.id];
  const busy = job?.status === 'downloading',
    installed = isInstalled(store.data, episode);
  const total = ba
    ? baRecipe!.inputs.reduce((n, a) => n + a.bytes, 0)
    : (pjskDownloadById.get(episode.id)?.downloadBytes ?? 0);
  const choose = (selected: FileList | null) => {
    if (selected)
      setFiles((old) => [
        ...old.filter(
          (file) => ![...selected].some((f) => f.name === file.name),
        ),
        ...selected,
      ]);
  };
  return (
    <main className="page acquisition-page">
      <Link className="back-link" to="/manage?source=online">
        <ArrowLeft size={16} />
        {t('Episode downloads')}
      </Link>
      <PageTitle
        eyebrow={ba ? 'BLUE ARCHIVE · JP' : 'PROJECT SEKAI'}
        title={episode.title}
      >
        <p>
          {ba
            ? t('Japanese text, animated characters, backgrounds and audio.')
            : t('Chinese text, Live2D scenes and Japanese voices.')}{' '}
          {t('About {size} of original files.', { size: formatBytes(total) })}
        </p>
      </PageTitle>
      <section className="acquisition-card" aria-label={t('Get story')}>
        {installed ? (
          <>
            <p className="success-text">
              <Check size={16} />
              {t('Available offline on this device')}
            </p>
            <Link
              className="button primary-button"
              to={`/read/${episode.game}/${episode.id}`}
            >
              {t('Read story')}
            </Link>
          </>
        ) : (
          <>
            {busy ? (
              <div role="status" aria-live="polite">
                <p>
                  {t('{status} · {done} / {total} files', {
                    status: t(job.message || 'Downloading story'),
                    done: job.filesDone ?? 0,
                    total: job.filesTotal ?? '…',
                  })}
                </p>
                <progress
                  aria-label={t('Story download progress')}
                  max={job.fraction != null ? 1 : job.filesTotal || 1}
                  value={
                    job.fraction ??
                    (job.filesDone ?? 0) + (job.fileProgress ?? 0)
                  }
                />
                <button onClick={() => store.cancel(episode.id)}>
                  <X size={16} />
                  {t('Cancel')}
                </button>
                <p className="field-note">
                  {t(
                    'You can leave this page. Keep the app open until the import finishes.',
                  )}
                </p>
              </div>
            ) : (
              <>
                {job?.status === 'failed' ? (
                  <p className="error-text" role="alert">
                    {job.error}
                  </p>
                ) : null}
                {job?.status === 'canceled' ? (
                  <p role="status">
                    {t(
                      'Canceled. Verified source downloads are kept for retry.',
                    )}
                  </p>
                ) : null}
                {!ba || desktop ? (
                  <>
                    <button
                      className="primary-button"
                      onClick={() => store.download(episode)}
                    >
                      <Download size={17} />
                      {job?.status === 'failed'
                        ? t('Retry download and import')
                        : t('Download and import')}
                    </button>
                    <p className="field-note">
                      {t(
                        'Files come directly from the original sources. Downloads are verified before the story is installed.',
                      )}
                    </p>
                  </>
                ) : (
                  <p>
                    {t(
                      'Download the source files below, then choose the files or their folder to import them.',
                    )}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
      {baRecipe ? (
        <section className="acquisition-card" aria-labelledby="originals-title">
          <h2 id="originals-title">{t('Import original files')}</h2>
          <p>
            {t(
              'Choose files you have already downloaded. Onlystory processes them on this device.',
            )}
          </p>
          <div className="button-row">
            <label className="button">
              <FolderOpen size={16} />
              {t('Choose files')}
              <input
                className="sr-only"
                aria-label={t('Choose original files')}
                type="file"
                multiple
                disabled={busy}
                onChange={(event) => choose(event.target.files)}
              />
            </label>
            <label className="button">
              <FolderOpen size={16} />
              {t('Choose folder')}
              <input
                className="sr-only"
                aria-label={t('Choose original folder')}
                type="file"
                multiple
                ref={(input) => {
                  input?.setAttribute('webkitdirectory', '');
                }}
                disabled={busy}
                onChange={(event) => choose(event.target.files)}
              />
            </label>
            <button
              disabled={busy || matched.size !== baRecipe.inputs.length}
              onClick={() => store.download(episode, files)}
            >
              {t('Import story')}
            </button>
          </div>
          <p role="status">
            {t('{selected} / {total} original files selected.', {
              selected: matched.size,
              total: baRecipe.inputs.length,
            })}
            {files.length ? (
              <> {t('File contents will be verified during import.')}</>
            ) : null}
          </p>
          <details open={!desktop && !installed}>
            <summary>
              {t('Source files · {count} remaining', {
                count: baRecipe.inputs.length - matched.size,
              })}
            </summary>
            <label className="check">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(event) => setMissingOnly(event.target.checked)}
              />{' '}
              {t('Show missing files only')}
            </label>
            <ol className="source-files">
              {baRecipe.inputs
                .filter((a) => !missingOnly || !matched.has(a.id))
                .map((input) => (
                  <li key={input.id}>
                    <a
                      href={input.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {decodeURIComponent(
                        new URL(input.url).pathname.split('/').at(-1)!,
                      )}
                    </a>
                    <span>
                      {formatBytes(input.bytes)}
                      {matched.has(input.id) ? t(' · Selected') : ''}
                    </span>
                  </li>
                ))}
            </ol>
          </details>
        </section>
      ) : null}
    </main>
  );
}
