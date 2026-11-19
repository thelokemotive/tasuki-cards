import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { captureInstallPrompt, registerServiceWorker } from './ui/pupil/pwa';

// The installed app (website only): Chrome's install prompt arrives early, and the service worker makes the
// site installable and quick to open with no signal. Both do nothing in the offline single file.
captureInstallPrompt();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
