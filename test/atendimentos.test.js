/**
 * Nexo · testes da fonte remota de atendimentos.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizar, precisaBuscar, numero, dia } from '../js/atendimentos.js';

test('numero entende real, ponto e texto solto', () => {
  assert.equal(numero('R$ 1.234,50'), 1234.5);
  assert.equal(numero('1234.5'), 1234.5);
  assert.equal(numero('350'), 350);
  assert.equal(numero(0), 0);
  assert.equal(numero(null), 0);
  assert.equal(numero('abc'), 0);
});

test('dia aceita ISO, brasileiro e Date', () => {
  assert.equal(dia('2026-11-11T10:00:00.000Z'), '2026-11-11');
  assert.equal(dia('11/11/2026'), '2026-11-11');
  assert.equal(dia(new Date(2026, 10, 11)), '2026-11-11');
  assert.equal(dia(''), '');
  assert.equal(dia(null), '');
});

test('normalizar monta lançamentos no formato do core', () => {
  const r = normalizar(
    {
      atendimentos: [
        {
          ID: 'e1',
          Paciente: 'Ana',
          Data: '2026-11-11T00:00:00.000Z',
          Hora: '09:00',
          Valor: '350',
          Status: 'Pago'
        },
        { ID: 'e2', Paciente: 'Bia', Data: '05/11/2026', Valor: 'R$ 1.200,50', Status: 'Pendente' },
        { ID: 'e3', Paciente: 'Sem data', Valor: '100', Status: 'Pago' }
      ]
    },
    new Date('2026-11-11T12:00:00Z')
  );

  assert.equal(r.entradas.length, 2, 'lançamento sem data não entra');
  assert.equal(r.entradas[0].valor, 350);
  assert.equal(r.entradas[0].pago, true);
  assert.equal(r.entradas[1].valor, 1200.5);
  assert.equal(r.entradas[1].data, '2026-11-05');
  assert.equal(r.entradas[1].pago, false);
  assert.equal(r.atualizadoEm, '2026-11-11T12:00:00.000Z');
});

test('normalizar entende a agenda e ignora o que não tem data', () => {
  const r = normalizar({
    agendamentos: [
      { ID: 'a1', PacienteNome: 'Ana', Data: '2026-11-12', Hora: '08:00', DuracaoMin: 60, Status: 'Agendado' },
      { ID: 'a2', Data: '', Status: 'Agendado' }
    ]
  });
  assert.equal(r.agenda.length, 1);
  assert.equal(r.agenda[0].paciente, 'Ana');
  assert.equal(r.agenda[0].duracao, 60);
});

test('normalizar sobrevive a resposta vazia ou estranha', () => {
  for (const entrada of [null, undefined, {}, { atendimentos: null }, { atendimentos: 'x' }]) {
    const r = normalizar(entrada);
    assert.deepEqual(r.entradas, []);
    assert.deepEqual(r.agenda, []);
  }
});

test('precisaBuscar: sem cache busca; dentro da validade não', () => {
  const agora = new Date('2026-11-11T12:00:00Z');
  assert.equal(precisaBuscar({ cacheEm: null, agora }), true);

  const novo = new Date('2026-11-11T11:00:00Z').toISOString();
  assert.equal(precisaBuscar({ cacheEm: novo, agora }), false);

  const velho = new Date('2026-11-11T05:00:00Z').toISOString();
  assert.equal(precisaBuscar({ cacheEm: velho, agora }), true);

  assert.equal(precisaBuscar({ cacheEm: 'não é data', agora }), true);
});
