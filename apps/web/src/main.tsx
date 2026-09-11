import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { UpdatePrompt } from './app/UpdatePrompt';
import { WhatsNewNotice } from './app/WhatsNewNotice';
import { BootSplash } from './app/BootSplash';
import { ThemeProvider } from './app/ThemeContext';
import { applyStoredTheme } from './app/theme';
import { reloadOnWorkerHandover } from './app/swHandover';
import './design-system/tokens.css';
import './design-system/components.css';
import './design-system/global.css';
import './design-system/screens.css';

// Before the first render, so nobody sees a light frame on the way to a dark one.
applyStoredTheme();

// Watches for the one failure a mid-session handover can cause. It no longer reloads on the
// handover itself — the update card asks, and nothing restarts the app without being pressed.
reloadOnWorkerHandover();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BootSplash><BrowserRouter><App /><UpdatePrompt /><WhatsNewNotice /></BrowserRouter></BootSplash>
    </ThemeProvider>
  </StrictMode>
);
