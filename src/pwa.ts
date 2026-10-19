interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface AppStatus {
  offline: 'preparing' | 'ready' | 'unavailable';
  installed: boolean;
  canInstall: boolean;
  updateReady: boolean;
  checking: boolean;
  message: string;
}
let state: AppStatus = {
  offline: 'preparing',
  installed: false,
  canInstall: false,
  updateReady: false,
  checking: false,
  message: '',
};
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let prompt: InstallPrompt | undefined;
let restarting = false;
let started = false;
let lastCheck = 0;
function publish(patch: Partial<AppStatus>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export const appSnapshot = () => state;
export function subscribeApp(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function prepareOfflineApp() {
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  ) {
    publish({
      offline: 'unavailable',
      message: import.meta.env.DEV
        ? 'Installation and offline launch are available in the production build.'
        : 'Offline launch needs HTTPS or localhost and a browser with service worker support.',
    });
    return;
  }
  publish({ offline: 'preparing', message: '' });
  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    });
    const refresh = () =>
      publish({
        offline: registration?.active ? 'ready' : 'preparing',
        updateReady: !!registration?.waiting,
      });
    const observe = (worker: ServiceWorker | null) => {
      let previousState = worker?.state;
      worker?.addEventListener('statechange', () => {
        refresh();
        if (worker.state === 'redundant' && previousState === 'installing') {
          publish({
            offline: registration?.active ? 'ready' : 'unavailable',
            message: registration?.active
              ? 'The update could not be saved. Your current app is still available offline. Check your connection and storage, then check for updates again.'
              : 'The offline app could not be saved. Check your connection and available storage, then retry.',
          });
        }
        previousState = worker.state;
      });
    };
    observe(registration.installing);
    registration.addEventListener('updatefound', () =>
      observe(registration!.installing),
    );
    refresh();
  } catch {
    publish({
      offline: 'unavailable',
      message:
        'The offline app could not be saved. Check your connection and available storage, then retry.',
    });
  }
}
export function startAppInstallation() {
  if (started) return;
  started = true;
  const display = matchMedia('(display-mode: standalone)');
  const installed = () =>
    publish({
      installed:
        display.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    });
  installed();
  display.addEventListener('change', installed);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    publish({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    prompt = undefined;
    publish({ installed: true, canInstall: false });
  });
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      publish({ offline: 'ready', updateReady: false });
      if (restarting) location.reload();
    });
  const checkWhenVisible = () => {
    if (
      document.visibilityState === 'visible' &&
      navigator.onLine &&
      Date.now() - lastCheck > 60 * 60 * 1000
    )
      void checkAppUpdate();
  };
  window.addEventListener('online', checkWhenVisible);
  document.addEventListener('visibilitychange', checkWhenVisible);
  void prepareOfflineApp();
}
export async function installApp() {
  const pending = prompt;
  if (!pending) return;
  prompt = undefined;
  publish({ canInstall: false, message: '' });
  try {
    await pending.prompt();
    const choice = await pending.userChoice;
    publish({
      message:
        choice.outcome === 'accepted'
          ? 'Installation requested. Your browser will finish installing Onlystory.'
          : 'Installation dismissed. You can still install from your browser menu.',
    });
  } catch {
    publish({
      message: 'Installation could not start. Try your browser’s install menu.',
    });
  }
}
export async function checkAppUpdate() {
  if (!registration || state.checking) return;
  lastCheck = Date.now();
  publish({ checking: true, message: '' });
  try {
    await registration.update();
    publish({
      updateReady: !!registration.waiting,
      message:
        registration.waiting || registration.installing
          ? ''
          : 'The app is up to date.',
    });
  } catch {
    publish({
      message:
        'Could not check for updates. Your saved app is still available offline.',
    });
  } finally {
    publish({ checking: false });
  }
}
export function restartForUpdate() {
  if (!registration?.waiting) return;
  restarting = true;
  registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
}
