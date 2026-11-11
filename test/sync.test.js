/**
 * Nexo · sync.js — partes puras (URL, mescla, comparação).
 * A camada de rede (JSONP/POST) não é testada aqui.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizarUrl, urlValida, mesclarRegras, mesmasRegras, validarRemoto
} from '../js/sync.js';

const URL_OK = 'https://script.google.com/macros/s/AKfycbzXFXbZQ8TfHYwntMXg5k1lI_1pzBx7rTwVYycNESff8KC3DV95CRq15OrcP6dsC2_F/exec';

test('normalizarUrl tira espaços e barra final', () => {
  assert.equal(normalizarUrl('  https://x/exec/  '), 'https://x/exec');
  assert.equal(normalizarUrl(null), '');
});

test('urlValida só aceita implantação /exec do Apps Script', () => {
  assert.ok(urlValida(URL_OK));
  assert.ok(!urlValida(URL_OK.replace('https://', 'http://')));
  assert.ok(!urlValida('https://script.google.com/macros/s/curto/exec'));
  assert.ok(!urlValida('https://exemplo.com/exec'));
  assert.ok(!urlValida(''));
  assert.ok(!urlValida(null));
});

test('mescla é união por tipo+chave', () => {
  const locais = [{ tipo: 'nome', chave: 'Luz', dono: 'casa' }];
  const remotas = [{ tipo: 'nome', chave: 'Caronas', dono: 'scarlet' }];
  const r = mesclarRegras(locais, remotas);
  assert.equal(r.length, 2);
  assert.ok(r.some((x) => x.chave === 'Luz' && x.dono === 'casa'));
  assert.ok(r.some((x) => x.chave === 'Caronas' && x.dono === 'scarlet'));
});

test('em conflito, vence a regra mais recente pelo campo em', () => {
  const locais = [{ tipo: 'nome', chave: 'Luz', dono: 'casa', em: '2026-11-10T10:00:00Z' }];
  const remotas = [{ tipo: 'nome', chave: 'luz', dono: 'matheus', em: '2026-11-11T10:00:00Z' }];
  assert.equal(mesclarRegras(locais, remotas)[0].dono, 'matheus');

  const locaisNovos = [{ tipo: 'nome', chave: 'Luz', dono: 'scarlet', em: '2026-11-12T10:00:00Z' }];
  assert.equal(mesclarRegras(locaisNovos, remotas)[0].dono, 'scarlet');
});

test('sem timestamp nos dois lados, a nuvem vence', () => {
  const locais = [{ tipo: 'nome', chave: 'Luz', dono: 'casa' }];
  const remotas = [{ tipo: 'nome', chave: 'Luz', dono: 'scarlet' }];
  assert.equal(mesclarRegras(locais, remotas)[0].dono, 'scarlet');
});

test('regra inválida de qualquer lado é descartada', () => {
  const r = mesclarRegras(
    [{ tipo: 'nome', chave: 'Ok', dono: 'casa' }, { tipo: 'nome', chave: 'Ruim', dono: 'ninguem' }],
    [{ tipo: 'inventado', chave: 'X', dono: 'casa' }, null]
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].chave, 'Ok');
});

test('mesmasRegras compara chave e dono, não ordem', () => {
  const a = [{ tipo: 'nome', chave: 'Luz', dono: 'casa' }, { tipo: 'conta', chave: 'BB', dono: 'matheus' }];
  const b = [{ tipo: 'conta', chave: 'BB', dono: 'matheus' }, { tipo: 'nome', chave: 'luz', dono: 'casa' }];
  assert.ok(mesmasRegras(a, b));
  assert.ok(!mesmasRegras(a, [...b, { tipo: 'nome', chave: 'Água', dono: 'casa' }]));
  assert.ok(!mesmasRegras(a, [{ tipo: 'nome', chave: 'Luz', dono: 'scarlet' }]));
});

test('validarRemoto rejeita lixo e normaliza o resto', () => {
  assert.equal(validarRemoto(null), null);
  assert.equal(validarRemoto('texto'), null);

  const v = validarRemoto({
    regras: [{ tipo: 'nome', chave: 'Luz', dono: 'casa' }, { tipo: 'x', chave: 'Y', dono: 'casa' }],
    revisao: '7',
    salvoEm: '2026-11-11T10:00:00Z'
  });
  assert.equal(v.regras.length, 1);
  assert.equal(v.revisao, 7);
  assert.equal(v.salvoEm, '2026-11-11T10:00:00Z');
});

test('validarRemoto sem revisão devolve 0', () => {
  assert.equal(validarRemoto({ regras: [] }).revisao, 0);
});
