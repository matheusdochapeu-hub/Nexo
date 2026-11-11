/**
 * Nexo · ferramenta de drift (parser e diagnóstico).
 * Não toca nos apps: só lê os arquivos e compara.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extrairBloco, blocoArray, blocoObjeto, lerItens, comparar, relatorio } from '../scripts/drift.mjs';

test('extrairBloco respeita colchetes dentro de string', () => {
  const texto = "x = [ { d: 'a[b]' }, { d: 'c' } ]; resto";
  const achado = extrairBloco(texto, texto.indexOf('['));
  assert.equal(achado, "[ { d: 'a[b]' }, { d: 'c' } ]");
});

test('extrairBloco devolve null quando não fecha', () => {
  assert.equal(extrairBloco('x = [ { d: 1 }', 4), null);
});

test('blocoArray e blocoObjeto acham os literais', () => {
  // O baseline real é JSON (aspas duplas), então o leitor usa JSON.parse.
  const js = 'const BASE_ITEMS = [ { d: \'X\', v: 1, de: 0, ate: 0 } ];\nconst CFG = { "overrides": { "X__0": -1 } };';
  assert.match(blocoArray(js, 'BASE_ITEMS'), /X/);
  assert.deepEqual(blocoObjeto(js, 'CFG'), { overrides: { X__0: -1 } });
  assert.equal(blocoObjeto('nada aqui', 'CFG'), null);
});

test('blocoObjeto devolve null em objeto que não é JSON', () => {
  assert.equal(blocoObjeto("const CFG = { overrides: { 'X__0': -1 } };", 'CFG'), null);
});

test('lerItens entende os dois formatos e preserva tag/cat', () => {
  const literal = `[
    {d:'Tennis One 4/5', v:79.99, de:1,ate:1, tag:'parc'},
    { d: 'Casa Almeida 5/5', v: 101.88, de: 1, ate: 1, tag: 'parc', cat: 'Casa' }
  ]`;
  const itens = lerItens(literal);
  assert.equal(itens.length, 2);
  assert.deepEqual(itens[0], { nome: 'Tennis One 4/5', valor: 79.99, de: 1, ate: 1, tag: 'parc' });
  assert.deepEqual(itens[1], {
    nome: 'Casa Almeida 5/5',
    valor: 101.88,
    de: 1,
    ate: 1,
    tag: 'parc',
    cat: 'Casa'
  });
});

test('lerItens lida com literal vazio', () => {
  assert.deepEqual(lerItens('[]'), []);
  assert.deepEqual(lerItens(null), []);
});

test('comparar acha faltando, sobrando e valor diferente', () => {
  const dono = [
    { nome: 'Igual', valor: 10, de: 1, ate: 1 },
    { nome: 'Falta', valor: 20, de: 4, ate: 4 },
    { nome: 'Difere', valor: 30, de: 2, ate: 2 }
  ];
  const copia = [
    { nome: 'Igual', valor: 10, de: 1, ate: 1 },
    { nome: 'Sobra', valor: 5, de: 3, ate: 3 },
    { nome: 'Difere', valor: 29.98, de: 2, ate: 2 }
  ];
  const d = comparar(dono, copia);
  assert.deepEqual(d.faltandoNoMatrix.map((i) => i.nome), ['Falta']);
  assert.deepEqual(d.sobrandoNoMatrix.map((i) => i.nome), ['Sobra']);
  assert.equal(d.valorDiferente.length, 1);
  assert.equal(d.valorDiferente[0].faturas, 30);
  assert.equal(d.valorDiferente[0].matrix, 29.98);
});

test('relatório marca item apagado no baseline e valor vindo de override', () => {
  const faturas = "var BASE_ITEMS=[{d:'A', v:10, de:1,ate:1},{d:'B', v:20, de:4,ate:4}];";
  const matrix = `const BASE_ITEMS = [ { d: 'A', v: 9, de: 1, ate: 1 } ];
const BASELINE_FATURAS_RAW = {"overrides": {"B__4": -1, "A__1": 10}};`;

  const r = relatorio({
    ler: (caminho) => (String(caminho).includes('matrix') ? matrix : faturas)
  });

  assert.equal(r.totais.faturas, 2);
  assert.equal(r.totais.matrix, 1);
  assert.equal(r.emDia, false);
  assert.equal(r.faltandoNoMatrix[0].nome, 'B');
  assert.equal(r.faltandoNoMatrix[0].apagadoNoBaseline, true);
  assert.deepEqual(r.faltandoNoMatrix[0].mesesApagados, [4]);
  assert.equal(r.valorDiferente[0].overrideDoMatrix, 10);
  assert.equal(r.divergenciaReal, 0);
  assert.equal(r.explicadoPeloBaseline, true);
});

test('divergência sem explicação no baseline não é marcada como intencional', () => {
  const faturas = "var BASE_ITEMS=[{d:'A', v:10, de:1,ate:1}];";
  const matrix = "const BASE_ITEMS = []; const BASELINE_FATURAS_RAW = {\"overrides\": {}};";

  const r = relatorio({
    ler: (caminho) => (String(caminho).includes('matrix') ? matrix : faturas)
  });

  assert.equal(r.faltandoNoMatrix[0].apagadoNoBaseline, false);
  assert.equal(r.divergenciaReal, 1);
  assert.equal(r.explicadoPeloBaseline, false);
});

test('item sobrando na cópia conta como divergência real', () => {
  const faturas = "var BASE_ITEMS=[{d:'A', v:10, de:1,ate:1}];";
  const matrix = `const BASE_ITEMS = [ { d: 'A', v: 10, de: 1, ate: 1 }, { d: 'Fantasma', v: 5, de: 1, ate: 1 } ];
const BASELINE_FATURAS_RAW = {"overrides": {}};`;

  const r = relatorio({
    ler: (caminho) => (String(caminho).includes('matrix') ? matrix : faturas)
  });

  assert.equal(r.sobrandoNoMatrix.length, 1);
  assert.equal(r.divergenciaReal, 1);
  assert.equal(r.explicadoPeloBaseline, false);
});
