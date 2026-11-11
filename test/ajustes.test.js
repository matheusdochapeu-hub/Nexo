/**
 * Nexo · teste do exportar/importar de ajustes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VERSAO_AJUSTES, regraValida, normalizarRegras,
  serializarAjustes, lerAjustes, nomeArquivo
} from '../js/ajustes.js';

const AGORA = new Date('2026-11-11T12:00:00-03:00');

test('regraValida exige dono, tipo e chave', () => {
  assert.ok(regraValida({ tipo: 'nome', chave: 'Caronas', dono: 'scarlet' }));
  assert.ok(!regraValida(null));
  assert.ok(!regraValida({ tipo: 'nome', chave: 'X', dono: 'vizinho' }));
  assert.ok(!regraValida({ tipo: 'id', chave: 'X', dono: 'casa' }));
  assert.ok(!regraValida({ tipo: 'nome', chave: '   ', dono: 'casa' }));
});

test('normalizarRegras descarta inválidas e deduplica por tipo+chave', () => {
  const r = normalizarRegras([
    { tipo: 'nome', chave: 'Caronas', dono: 'scarlet' },
    { tipo: 'nome', chave: ' caronas ', dono: 'matheus' },
    { tipo: 'nome', chave: '', dono: 'casa' },
    { tipo: 'conta', chave: 'BB', dono: 'casa' },
    null
  ]);
  assert.equal(r.length, 2);
  const caronas = r.find((x) => x.chave.toLowerCase() === 'caronas');
  assert.equal(caronas.dono, 'matheus', 'a última escolha vence');
  assert.ok(r.some((x) => x.tipo === 'conta' && x.chave === 'BB'));
});

test('ida e volta preserva regras e privacidade', () => {
  const texto = serializarAjustes(
    { regras: [{ tipo: 'nome', chave: 'Luz', dono: 'casa' }], privacidade: true },
    AGORA
  );
  const lido = lerAjustes(texto);
  assert.equal(lido.ok, true);
  assert.equal(lido.privacidade, true);
  assert.deepEqual(lido.regras, [{ tipo: 'nome', chave: 'Luz', dono: 'casa' }]);
  assert.equal(lido.descartadas, 0);
  assert.equal(lido.geradoEm, AGORA.toISOString());
});

test('exportar sem regras gera lista vazia, não erro', () => {
  const texto = serializarAjustes({}, AGORA);
  const lido = lerAjustes(texto);
  assert.equal(lido.ok, true);
  assert.deepEqual(lido.regras, []);
  assert.equal(lido.privacidade, false);
});

test('arquivo de outro app é recusado', () => {
  const lido = lerAjustes(JSON.stringify({ app: 'matrix', versao: 1, regras: [] }));
  assert.equal(lido.ok, false);
  assert.match(lido.erro, /não é do Nexo/);
});

test('JSON quebrado e lixo são recusados sem lançar', () => {
  assert.equal(lerAjustes('{quebrado').ok, false);
  assert.equal(lerAjustes('').ok, false);
  assert.equal(lerAjustes(null).ok, false);
  assert.equal(lerAjustes('[]').ok, false);
  assert.equal(lerAjustes('"texto"').ok, false);
});

test('versão futura é recusada em vez de aplicada pela metade', () => {
  const lido = lerAjustes(JSON.stringify({ app: 'nexo', versao: VERSAO_AJUSTES + 1, regras: [] }));
  assert.equal(lido.ok, false);
  assert.match(lido.erro, /entende até a/);
});

test('backup sem versão é recusado', () => {
  assert.equal(lerAjustes(JSON.stringify({ app: 'nexo', regras: [] })).ok, false);
});

test('conta quantas regras foram descartadas na importação', () => {
  const lido = lerAjustes(
    JSON.stringify({
      app: 'nexo',
      versao: 1,
      regras: [
        { tipo: 'nome', chave: 'Ok', dono: 'casa' },
        { tipo: 'nome', chave: 'Ruim', dono: 'ninguem' }
      ]
    })
  );
  assert.equal(lido.ok, true);
  assert.equal(lido.regras.length, 1);
  assert.equal(lido.descartadas, 1);
});

test('nome do arquivo é ordenável', () => {
  assert.equal(nomeArquivo(AGORA), 'nexo-ajustes-2026-11-11.json');
  assert.equal(nomeArquivo(new Date(2027, 0, 5)), 'nexo-ajustes-2027-01-05.json');
});
