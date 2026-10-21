import { Component, lazy, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { EmptyState } from './components/Primitives';
import { LibraryPage } from './pages/Library';
import { CatalogPage } from './pages/Catalog';
import { EventPage } from './pages/Event';
import { ReaderRoute } from './pages/Reader';
import { BookmarksPage } from './pages/Bookmarks';
import { ManagePage } from './pages/Manage';
import { DownloadHistoryPage } from './components/DownloadSelection';
import { LabPage } from './pages/Lab';
import { useI18n } from './i18n';
const DownloadPage = lazy(() => import('./pages/Download'));

function AppError() {
  const { t } = useI18n();
  return (
    <main className="page">
      <EmptyState title={t('This view could not be opened')}>
        {t('Your saved progress is still on this device.')}
      </EmptyState>
      <button onClick={() => location.assign('/library')}>
        {t('Return to library')}
      </button>
    </main>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Onlystory could not render this view.', error, info);
  }
  render() {
    return this.state.failed ? <AppError /> : this.props.children;
  }
}
export default function App() {
  const { t } = useI18n();
  return (
    <ErrorBoundary>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/games/:game" element={<CatalogPage />} />
          <Route path="/games/:game/events/:event" element={<EventPage />} />
          <Route path="/read/:game/:episode" element={<ReaderRoute />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="/downloads" element={<DownloadHistoryPage />} />
          <Route
            path="/downloads/:episode"
            element={
              <Suspense
                fallback={
                  <main className="page" role="status">
                    {t('Loading download…')}
                  </main>
                }
              >
                <DownloadPage />
              </Suspense>
            }
          />
          <Route path="/lab" element={<LabPage />} />
          <Route
            path="*"
            element={
              <main className="page">
                <EmptyState
                  title={t('Page not found')}
                  action={<Link to="/library">{t('Return to library')}</Link>}
                />
              </main>
            }
          />
        </Routes>
      </Shell>
    </ErrorBoundary>
  );
}
