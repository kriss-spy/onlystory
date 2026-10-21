import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import App from './App';
import { AppProvider } from './store';
import { startAppInstallation } from './pwa';
import { I18nProvider } from './i18n';
import './styles.css';

startAppInstallation();

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AppProvider>
      <I18nProvider>
        <Tooltip.Provider delayDuration={350}>
          <App />
        </Tooltip.Provider>
      </I18nProvider>
    </AppProvider>
  </BrowserRouter>,
);
