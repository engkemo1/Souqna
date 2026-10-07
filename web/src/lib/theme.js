import { useLayoutEffect } from 'react';

/** Apply a Theme Engine token set to a DOM element (default: <html>). */
export function applyTheme(cssVars, el = document.documentElement) {
  if (!cssVars) return () => {};
  const prev = {};
  for (const [k, v] of Object.entries(cssVars)) {
    prev[k] = el.style.getPropertyValue(k);
    el.style.setProperty(k, v);
  }
  return () => { for (const [k, v] of Object.entries(prev)) v ? el.style.setProperty(k, v) : el.style.removeProperty(k); };
}

export function useTheme(cssVars) {
  useLayoutEffect(() => {
    const undo = applyTheme(cssVars);
    const meta = document.querySelector('meta[name="theme-color"]');
    const old = meta?.content;
    if (meta && cssVars?.['--c-header']) meta.content = `rgb(${cssVars['--c-header'].split(' ').join(',')})`;
    return () => { undo(); if (meta && old) meta.content = old; };
  }, [cssVars]);
}

/** Fixed dashboard palette — a calm, neutral SaaS look independent of store colours. */
export const DASHBOARD_THEME = {
  '--c-background': '246 245 242',
  '--c-surface': '240 238 234',
  '--c-elevated': '255 255 255',
  '--c-text': '20 21 23',
  '--c-muted': '98 100 106',
  '--c-border': '230 228 223',
  '--c-border-strong': '208 205 198',
  '--c-primary': '23 72 59',
  '--c-on-primary': '255 255 255',
  '--c-primary-ink': '23 72 59',
  '--c-secondary': '232 241 236',
  '--c-on-secondary': '20 21 23',
  '--c-accent': '180 83 42',
  '--c-on-accent': '255 255 255',
  '--c-button': '20 21 23',
  '--c-on-button': '255 255 255',
  '--c-button-outline': '20 21 23',
  '--c-header': '255 255 255',
  '--c-on-header': '20 21 23',
  '--c-footer': '20 21 23',
  '--c-on-footer': '255 255 255',
  '--c-footer-muted': '170 170 170',
  '--c-sale': '190 38 38',
  '--c-success': '21 128 61',
  '--c-ring': '23 72 59',
};
