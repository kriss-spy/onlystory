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
import { LabPage } from './pages/Lab';
const DownloadPage = lazy(() => import('./pages/Download'));

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
    return this.state.failed ? (
      <main className="page">
        <EmptyState title="This view could not be opened">
          Your saved progress is still on this device.
        </EmptyState>
        <button onClick={() => location.assign('/library')}>
          Return to library
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
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
          <Route
            path="/downloads/:episode"
            element={
              <Suspense
                fallback={
                  <main className="page" role="status">
                    Loading download…
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
                  title="Page not found"
                  action={<Link to="/library">Return to library</Link>}
                />
              </main>
            }
          />
        </Routes>
      </Shell>
    </ErrorBoundary>
  );
}
