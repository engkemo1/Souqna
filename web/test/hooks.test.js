import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { useApi, primeCache, invalidate } from '../src/lib/hooks.js';

test('useApi: returns cached data immediately on initial render when primed', () => {
  invalidate();
  primeCache('/stores/ghost', { store: { slug: 'ghost', name: 'Ghost Store' } });

  let result;
  function Component() {
    result = useApi('/stores/ghost', { keepPrevious: false });
    return React.createElement('div', null, result.data?.store?.slug);
  }

  const html = ReactDOMServer.renderToString(React.createElement(Component));
  assert.equal(result.data?.store?.slug, 'ghost');
  assert.equal(result.loading, false);
  assert.equal(html.includes('ghost'), true);
});

test('useApi: returns undefined and loading=true when unprimed path is rendered with keepPrevious=false', () => {
  invalidate();
  let result;
  function Component() {
    result = useApi('/stores/special-mandy', { keepPrevious: false });
    return React.createElement('div', null, result.data ? 'has-data' : 'loading');
  }

  const html = ReactDOMServer.renderToString(React.createElement(Component));
  assert.equal(result.data, undefined);
  assert.equal(result.loading, true);
  assert.equal(html.includes('loading'), true);
});

test('useApi: never leaks stale data across path transitions when keepPrevious is false', () => {
  invalidate();
  primeCache('/stores/ghost', { store: { slug: 'ghost' } });

  let capturedGhost;
  function GhostComp() {
    capturedGhost = useApi('/stores/ghost', { keepPrevious: false });
    return null;
  }
  ReactDOMServer.renderToString(React.createElement(GhostComp));
  assert.equal(capturedGhost.data?.store?.slug, 'ghost');

  // Now render target store (not in cache)
  let capturedMandy;
  function MandyComp() {
    capturedMandy = useApi('/stores/special-mandy', { keepPrevious: false });
    return null;
  }
  ReactDOMServer.renderToString(React.createElement(MandyComp));
  assert.equal(capturedMandy.data, undefined, 'data must be undefined for new path, never ghost data');
  assert.equal(capturedMandy.loading, true);
});

test('useApi: retains cache when primeCache is called for multiple distinct paths', () => {
  invalidate();
  primeCache('/stores/ghost', { store: { slug: 'ghost' } });
  primeCache('/stores/special-mandy', { store: { slug: 'special-mandy' } });

  let r1, r2;
  function Comp1() { r1 = useApi('/stores/ghost'); return null; }
  function Comp2() { r2 = useApi('/stores/special-mandy'); return null; }

  ReactDOMServer.renderToString(React.createElement(Comp1));
  ReactDOMServer.renderToString(React.createElement(Comp2));

  assert.equal(r1.data?.store?.slug, 'ghost');
  assert.equal(r2.data?.store?.slug, 'special-mandy');

  // Invalidate prefix
  invalidate('/stores/ghost');
  let r3;
  function Comp3() { r3 = useApi('/stores/ghost'); return null; }
  ReactDOMServer.renderToString(React.createElement(Comp3));
  assert.equal(r3.data, undefined);
});
