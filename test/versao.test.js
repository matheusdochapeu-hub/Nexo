/**
 * Nexo · guarda de versão.
 * Mesma regra dos outros quatro apps: versão única em package.json, config.js,
 * sw.js (CACHE_NAME) e no `?v=` dos assets do index.html.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { VERSION } from '../js/config.js';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const pkg = JSON.parse(ler('../package.json'));
const sw = ler('../sw.js');
const html = ler('../index.html');
const manifest = JSON.parse(ler('../manifest.json'));

test('package.json e config.js têm a mesma versão', () => {
  assert.equal(pkg.version, VERSION);
});

test('CACHE_NAME do sw.js acompanha a versão', () => {
  assert.match(sw, new RegExp(`const CACHE_NAME = 'nexo-v${VERSION.replace(/\./g, '\\.')}'`));
});

test('todo ?v= do index.html é a versão atual', () => {
  const versoes = [...html.matchAll(/\?v=([^"'&\s]+)/g)].map((m) => m[1]);
  assert.ok(versoes.length > 0, 'index.html deveria versionar os assets');
  for (const v of versoes) assert.equal(v, VERSION);
});

test('sw.js pré-cacheia os módulos do app', () => {
  for (const arquivo of [
    './js/core.js', './js/store.js', './js/app.js', './js/search.js',
    './js/faturas.js', './shared/faturas-base.js', './css/nexo.css'
  ]) {
    assert.ok(sw.includes(arquivo), `sw.js deveria pré-cachear ${arquivo}`);
  }
});

test('manifest escopado em ./ (não invade os outros apps)', () => {
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './index.html');
});
