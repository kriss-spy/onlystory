import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import App from './App';
import { AppProvider } from './store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AppProvider>
      <Tooltip.Provider delayDuration={350}>
        <App />
      </Tooltip.Provider>
    </AppProvider>
  </BrowserRouter>,
);
