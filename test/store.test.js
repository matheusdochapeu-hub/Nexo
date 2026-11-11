/**
 * Nexo · testes da ponte com o localStorage (com memória falsa).
 * Verificam a persistência das atribuições e que o snapshot as aplica.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();

globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
  clear: () => memoria.clear()
};

const { definirDono, limparRegras, lerRegras, lerTudo } = await import('../js/store.js');

const AGORA = new Date('2026-11-11T12:00:00-03:00');

function semearMatrix() {
  memoria.set(
    'MATRIX_FINANCE_STATE_v2',
    JSON.stringify({
      anos: {
        2026: {
          Novembro: {
            fixos: [
              { nome: 'Caronas', valor: 900, pago: true },
              { nome: 'Luz', valor: 100, pago: true }
            ],
            outros: [],
            diarios: [{ nome: 'Padaria', valor: 20, conta: 'debito_inter', pago: true }],
            receitas: [{ nome: 'Salário', valor: 5000, categoria: 'Salário / Proventos', pago: true }]
          }
        }
      }
    })
  );
}

test.beforeEach(() => {
  memoria.clear();
  semearMatrix();
});

test('definirDono grava a regra e não duplica o mesmo nome', () => {
  definirDono('Caronas', 'nome', 'scarlet');
  definirDono('caronas', 'nome', 'matheus');
  const regras = lerRegras();
  assert.equal(regras.length, 1);
  assert.equal(regras[0].dono, 'matheus');
  assert.equal(regras[0].chave, 'caronas');
});

test('definirDono ignora nome ou dono vazio', () => {
  definirDono('', 'nome', 'casa');
  definirDono('Luz', 'nome', '');
  assert.equal(lerRegras().length, 0);
});

test('limparRegras zera os ajustes', () => {
  definirDono('Caronas', 'nome', 'scarlet');
  assert.equal(lerRegras().length, 1);
  limparRegras();
  assert.equal(lerRegras().length, 0);
});

test('sem regra, o padrão separa casa e pessoa', () => {
  const s = lerTudo(AGORA);
  assert.equal(s.casa.caixa.gastosTotal, 1020);
  assert.equal(s.casa.caixa.gastosPorDono.casa, 1000);
  assert.equal(s.matheus.totalGastos, 20);
});

test('com regra, o snapshot do Nexo já vem reatribuído', () => {
  definirDono('Caronas', 'nome', 'scarlet');
  const s = lerTudo(AGORA);
  assert.equal(s.scarlet.totalGastos, 900);
  assert.equal(s.casa.caixa.gastosPorDono.casa, 100);
  assert.equal(s.casa.caixa.gastosTotal, 1020, 'o total da casa não muda ao atribuir');
  assert.deepEqual(
    s.scarlet.gastos.map((g) => g.nome),
    ['Caronas']
  );
});

test('a regra vale mesmo quando o lançamento muda de mês de valor', () => {
  definirDono('Caronas', 'nome', 'scarlet');
  memoria.set(
    'MATRIX_FINANCE_STATE_v2',
    JSON.stringify({
      anos: {
        2026: {
          Novembro: {
            fixos: [{ nome: 'Caronas', valor: 111, pago: true }],
            outros: [],
            diarios: [],
            receitas: []
          }
        }
      }
    })
  );
  assert.equal(lerTudo(AGORA).scarlet.totalGastos, 111);
});

test('preferência de privacidade não colide com as regras', () => {
  definirDono('Luz', 'nome', 'matheus');
  memoria.set('nexo_privacidade', 'true');
  assert.equal(lerRegras().length, 1);
  assert.equal(memoria.get('nexo_privacidade'), 'true');
});
