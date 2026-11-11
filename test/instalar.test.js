/**
 * Nexo · teste do botão de baixar (regra de exibição).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deveMostrarBotao, emModoApp } from '../js/instalar.js';

test('mostra só quando há prompt e o app não está instalado', () => {
  assert.equal(deveMostrarBotao({ emModoApp: false, marcadoInstalado: false, temPrompt: true }), true);
});

test('esconde quando já roda como app', () => {
  assert.equal(deveMostrarBotao({ emModoApp: true, marcadoInstalado: false, temPrompt: true }), false);
});

test('esconde quando já foi instalado antes', () => {
  assert.equal(deveMostrarBotao({ emModoApp: false, marcadoInstalado: true, temPrompt: true }), false);
});

test('esconde quando o navegador não oferece instalação', () => {
  assert.equal(deveMostrarBotao({ emModoApp: false, marcadoInstalado: false, temPrompt: false }), false);
  assert.equal(deveMostrarBotao({ emModoApp: false, marcadoInstalado: false, temPrompt: undefined }), false);
});

test('emModoApp detecta standalone do iOS e do display-mode', () => {
  assert.equal(emModoApp(null), false);
  assert.equal(emModoApp({ navigator: { standalone: true } }), true);

  const simula = (modo) => ({
    navigator: {},
    matchMedia: (q) => ({ matches: q.includes(modo) })
  });
  assert.equal(emModoApp(simula('standalone')), true);
  assert.equal(emModoApp(simula('fullscreen')), true);
  assert.equal(emModoApp({ navigator: {}, matchMedia: () => ({ matches: false }) }), false);
});

test('navegador sem matchMedia não quebra', () => {
  assert.equal(emModoApp({ navigator: {} }), false);
});
