import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { PlatformApp } from './PlatformApp';
import { ThemeProvider } from '../app/ThemeContext';
import { applyStoredTheme } from '../app/theme';
import { BootSplash } from '../app/BootSplash';
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
//
// Routing is by hash rather than by path, and that is the price of being a second page. A static
// host asked for /platform/schools has no such file and answers with the single-page fallback,
// which is the customer application: the console would silently hand an operator the wrong app on
// every refresh and every deep link. A rewrite rule could fix it per host, and would be forgotten
// on the host where it mattered. A hash never leaves the browser, so /platform/#/schools resolves
// the same way everywhere with nothing to configure.
applyStoredTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BootSplash><HashRouter><PlatformApp /></HashRouter></BootSplash>
    </ThemeProvider>
  </StrictMode>
);
