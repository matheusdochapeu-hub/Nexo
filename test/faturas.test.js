/**
 * Nexo · faturas a partir da lista canônica + ajustes do app Faturas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANCORA, indiceDoMes, mesDoIndice, rotuloMes, chaveOverride,
  itensDoMes, totalDoMes, tamanhoBase
} from '../js/faturas.js';

const BASE = [
  { d: 'Item fixo', v: 100, de: 0, ate: 6 },
  { d: 'Parcela 1/3', v: 50, de: 1, ate: 3 },
  { d: 'Só janeiro', v: 200, de: 4, ate: 4 }
];

test('âncora: índice 0 é Set/2026 e índice 2 é Nov/2026', () => {
  assert.deepEqual(ANCORA, { ano: 2026, mes: 9 });
  assert.equal(indiceDoMes(2026, 9), 0);
  assert.equal(indiceDoMes(2026, 11), 2);
  assert.equal(indiceDoMes(2027, 1), 4);
  assert.deepEqual(mesDoIndice(2), { ano: 2026, mes: 11 });
  assert.deepEqual(mesDoIndice(4), { ano: 2027, mes: 1 });
  assert.deepEqual(mesDoIndice(0), { ano: 2026, mes: 9 });
  assert.equal(rotuloMes(2), 'Nov 2026');
});

test('janela de=1 ate=3 entra só nos meses 1, 2 e 3', () => {
  const meses = [0, 1, 2, 3, 4].map((i) => itensDoMes(i, { base: BASE }).map((it) => it.desc));
  assert.deepEqual(meses[0], ['Item fixo']);
  assert.deepEqual(meses[1], ['Item fixo', 'Parcela 1/3']);
  assert.deepEqual(meses[3], ['Item fixo', 'Parcela 1/3']);
  assert.deepEqual(meses[4], ['Item fixo', 'Só janeiro']);
});

test('override por item muda só aquele mês', () => {
  const overrides = { [chaveOverride('Item fixo', 2)]: 150 };
  // mês 2 = 150 (override) + 50 (parcela)
  assert.equal(totalDoMes(2, { base: BASE, overrides }), 200);
  // mês 3 continua 100 + 50
  assert.equal(totalDoMes(3, { base: BASE, overrides }), 150);
});

test('override -1 apaga o item do mês', () => {
  const overrides = { [chaveOverride('Item fixo', 2)]: -1 };
  const itens = itensDoMes(2, { base: BASE, overrides });
  assert.ok(!itens.some((it) => it.desc === 'Item fixo'));
  assert.equal(totalDoMes(2, { base: BASE, overrides }), 50);
});

test('extra entra na janela e soma', () => {
  const extras = [{ desc: 'Farmácia', val: 40.5, de: 2, ate: 3 }];
  assert.equal(totalDoMes(2, { base: BASE, extras }), 190.5); // 150 + 40,50
  assert.equal(totalDoMes(4, { base: BASE, extras }), 300); // fora da janela: 100 + 200
});

test('extra aceita o formato d/v também', () => {
  const extras = [{ d: 'Padaria', v: 12, de: 2, ate: 2 }];
  assert.ok(itensDoMes(2, { base: BASE, extras }).some((it) => it.desc === 'Padaria' && it.valor === 12));
  assert.equal(totalDoMes(2, { base: BASE, extras }), 162);
});

test('simulação só entra com incluirSimulados', () => {
  const sim = [{ d: 'Compra nova', v: 300, de: 2, ate: 4 }];
  assert.equal(totalDoMes(2, { base: BASE, sim }), 150);
  assert.equal(totalDoMes(2, { base: BASE, sim, incluirSimulados: true }), 450);
});

test('valores inválidos não viram NaN', () => {
  const extras = [{ desc: 'Zerado', val: 'abc', de: 2, ate: 2 }];
  assert.equal(itensDoMes(2, { base: BASE, extras }).find((i) => i.desc === 'Zerado').valor, 0);
  assert.equal(tamanhoBase(BASE), 3);
  assert.equal(tamanhoBase(null), 0);
});

test('índice inválido devolve lista vazia', () => {
  assert.deepEqual(itensDoMes('x', { base: BASE }), []);
  assert.deepEqual(itensDoMes(undefined, { base: BASE }), []);
});

test('a lista canônica gerada tem os 91 itens do Faturas', async () => {
  const { BASE_FATURAS } = await import('../shared/faturas-base.js');
  assert.equal(BASE_FATURAS.length, 91);
  assert.ok(BASE_FATURAS.some((it) => it.d === 'Cobertura 5/10'), 'deve conter o item que faltava no Matrix');
  const cotton = BASE_FATURAS.find((it) => it.d === 'Cotton On 2/3');
  assert.equal(cotton.v, 69.97, 'valor do dono, não o 69,95 da cópia');
});
