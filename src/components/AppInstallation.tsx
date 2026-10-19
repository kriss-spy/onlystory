import { useSyncExternalStore } from 'react';
import {
  appSnapshot,
  subscribeApp,
  installApp,
  checkAppUpdate,
  prepareOfflineApp,
  restartForUpdate,
} from '../pwa';
import { useStore } from '../store';

export function AppInstallation() {
  const app = useSyncExternalStore(subscribeApp, appSnapshot);
  const { transfers } = useStore();
  const downloading = Object.values(transfers).some(
    (job) => job.status === 'downloading',
  );
  return (
    <section aria-labelledby="app-installation-title">
      <h3 id="app-installation-title">App installation</h3>
      <p className="field-note" role="status">
        {app.offline === 'ready'
          ? 'Ready to open offline. Download stories before disconnecting.'
          : app.offline === 'preparing'
            ? 'Preparing the app for offline use…'
            : 'Offline launch is not ready.'}
      </p>
      {app.installed ? (
        <p className="field-note">
          Onlystory is running or installed as an app.
        </p>
      ) : app.canInstall ? (
        <button onClick={() => void installApp()}>Install Onlystory</button>
      ) : (
        <p className="field-note">
          To install, use your browser’s Install app or Add to Home Screen
          command. On iPhone or iPad, use Safari’s Share menu.
        </p>
      )}
      {app.offline === 'ready' ? (
        <div className="button-row">
          {app.updateReady ? (
            <button disabled={downloading} onClick={restartForUpdate}>
              Restart to update
            </button>
          ) : (
            <button
              disabled={app.checking}
              onClick={() => void checkAppUpdate()}
            >
              {app.checking ? 'Checking for updates…' : 'Check for updates'}
            </button>
          )}
        </div>
      ) : app.offline === 'unavailable' &&
        import.meta.env.PROD &&
        window.isSecureContext &&
        'serviceWorker' in navigator ? (
        <button onClick={() => void prepareOfflineApp()}>
          Retry offline setup
        </button>
      ) : null}
      {app.updateReady ? (
        <p className="field-note">
          An update is ready.{' '}
          {downloading
            ? 'Finish or cancel downloads before restarting.'
            : 'Restart when you are ready. Progress and downloads are kept.'}
        </p>
      ) : null}
      {app.message ? (
        <p className="field-note" role="status">
          {app.message}
        </p>
      ) : null}
    </section>
  );
}
