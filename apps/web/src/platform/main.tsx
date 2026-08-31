import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PlatformApp } from './PlatformApp';
import { ThemeProvider } from '../app/ThemeContext';
import { applyStoredTheme } from '../app/theme';
import '../design-system/tokens.css';
import '../design-system/components.css';
import '../design-system/global.css';
import '../design-system/screens.css';

// A separate entry, not a route inside the customer app.
//
// The console is built from the same components and the same design tokens, but it is a different
// page with a different root, so the customer bundle — the one that becomes the Android app — never
// contains it. Keeping developer tooling out of a product a school installs is not a matter of
// hiding a menu item; it is a matter of not shipping the code.
applyStoredTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename="/platform"><PlatformApp /></BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
