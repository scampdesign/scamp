import React from 'react';
import { createRoot } from 'react-dom/client';

import { applyAppTheme, readInitialAppTheme } from '../src/lib/applyAppTheme';
// `theme.css` first: it declares the variables global.css and the panel use.
import '../src/styles/theme.css';
import '../src/styles/global.css';

import { EmbeddedApp } from './EmbeddedApp';

applyAppTheme(readInitialAppTheme());

window.addEventListener('error', (e) => {
  console.error('[embedded] uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[embedded] unhandled rejection:', e.reason);
});

const container = document.getElementById('root');
if (container === null) throw new Error('Embedded window root element missing.');
createRoot(container).render(
  <React.StrictMode>
    <EmbeddedApp />
  </React.StrictMode>
);
