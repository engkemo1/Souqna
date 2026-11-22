import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import { initPerf } from './lib/perf.js';

// the home page code downloads in parallel with the app shell instead of after it
if (window.location.pathname === '/') import('./pages/market/MarketHome.jsx').catch(() => {});

initPerf();

// Remove the instant-first-paint outline once the real page has content (or after 8 s at the latest, or right away on any page but the home page).
(function dropBoot() {
  const boot = document.getElementById('boot'); const root = document.getElementById('root');
  if (!boot) return;
  if (window.location.pathname !== '/' || !root) { boot.remove(); return; }
  const done = () => { boot.remove(); mo.disconnect(); };
  const mo = new MutationObserver(() => { if (root.querySelector('section')) done(); });
  mo.observe(root, { childList: true, subtree: true });
  setTimeout(done, 8000);
})(); // device speed tier → <html data-perf>: weak devices get fewer effects

// After a new deploy, an open tab can still point at old hashed chunks — reload once instead of leaving a tap doing nothing.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try {
    if (sessionStorage.getItem('bo.reloaded')) return;
    sessionStorage.setItem('bo.reloaded', '1');
  } catch { /* ignore */ }
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Installable app + push notifications. Registered after load so it never slows the first paint.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
