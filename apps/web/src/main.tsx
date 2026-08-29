import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { UpdatePrompt } from './app/UpdatePrompt';
import './design-system/tokens.css';
import './design-system/components.css';
import './design-system/global.css';
import './design-system/screens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><App /><UpdatePrompt /></BrowserRouter>
  </StrictMode>
);
