import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { useSettings, applyTheme } from './state/settings';

async function boot() {
  await useSettings.getState().load();
  applyTheme(useSettings.getState().theme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useSettings.getState().theme === 'system') applyTheme('system');
  });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();
