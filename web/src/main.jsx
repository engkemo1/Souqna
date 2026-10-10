import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

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
