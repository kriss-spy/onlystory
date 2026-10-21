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
        <EmptyState title="Source not available">
          <Link to="/manage">Back to downloads</Link>
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
              Retry
            </button>
          </>
        ) : (
          <p role="status">Preparing download instructions…</p>
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
        <ArrowLeft size={16} /> Episode downloads
      </Link>
      <PageTitle
        eyebrow={ba ? 'BLUE ARCHIVE · JP' : 'PROJECT SEKAI'}
        title={episode.title}
      >
        <p>
          {ba
            ? 'Japanese text, animated characters, backgrounds and audio.'
            : 'Chinese text, Live2D scenes and Japanese voices.'}{' '}
          About {formatBytes(total)} of original files.
        </p>
      </PageTitle>
      <section className="acquisition-card" aria-label="Get story">
        {installed ? (
          <>
            <p className="success-text">
              <Check size={16} /> Available offline on this device
            </p>
            <Link
              className="button primary-button"
              to={`/read/${episode.game}/${episode.id}`}
            >
              Read story
            </Link>
          </>
        ) : (
          <>
            {busy ? (
              <div role="status" aria-live="polite">
                <p>
                  {job.message || 'Downloading story'} · {job.filesDone ?? 0} /{' '}
                  {job.filesTotal ?? '…'} files
                </p>
                <progress
                  aria-label="Story download progress"
                  max={job.fraction != null ? 1 : job.filesTotal || 1}
                  value={
                    job.fraction ??
                    (job.filesDone ?? 0) + (job.fileProgress ?? 0)
                  }
                />
                <button onClick={() => store.cancel(episode.id)}>
                  <X size={16} /> Cancel
                </button>
                <p className="field-note">
                  You can leave this page. Keep the app open until the import
                  finishes.
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
                    Canceled. Verified source downloads are kept for retry.
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
                        ? 'Retry download and import'
                        : 'Download and import'}
                    </button>
                    <p className="field-note">
                      Files come directly from the original sources. Downloads
                      are verified before the story is installed.
                    </p>
                  </>
                ) : (
                  <p>
                    Download the source files below, then choose the files or
                    their folder to import them.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
      {baRecipe ? (
        <section className="acquisition-card" aria-labelledby="originals-title">
          <h2 id="originals-title">Import original files</h2>
          <p>
            Choose files you have already downloaded. Onlystory processes them
            on this device.
          </p>
          <div className="button-row">
            <label className="button">
              <FolderOpen size={16} /> Choose files
              <input
                className="sr-only"
                aria-label="Choose original files"
                type="file"
                multiple
                disabled={busy}
                onChange={(event) => choose(event.target.files)}
              />
            </label>
            <label className="button">
              <FolderOpen size={16} /> Choose folder
              <input
                className="sr-only"
                aria-label="Choose original folder"
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
              Import story
            </button>
          </div>
          <p role="status">
            {matched.size} / {baRecipe.inputs.length} original files selected
            {files.length
              ? '. File contents will be verified during import.'
              : '.'}
          </p>
          <details open={!desktop && !installed}>
            <summary>
              Source files · {baRecipe.inputs.length - matched.size} remaining
            </summary>
            <label className="check">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(event) => setMissingOnly(event.target.checked)}
              />{' '}
              Show missing files only
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
                      {matched.has(input.id) ? ' · Selected' : ''}
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
