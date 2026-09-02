import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { UpdatePrompt } from './app/UpdatePrompt';
import { BootSplash } from './app/BootSplash';
import { ThemeProvider } from './app/ThemeContext';
import { applyStoredTheme } from './app/theme';
import './design-system/tokens.css';
import './design-system/components.css';
import './design-system/global.css';
import './design-system/screens.css';

// Before the first render, so nobody sees a light frame on the way to a dark one.
applyStoredTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BootSplash><BrowserRouter><App /><UpdatePrompt /></BrowserRouter></BootSplash>
    </ThemeProvider>
  </StrictMode>
);
