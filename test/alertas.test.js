/**
 * Nexo · alertas do dia ("Hoje").
 * Só datas reais: tarefas (history), agenda (ft_local_schedules), recarga VA/VR
 * (creditDate) e contas paradas (pago: false).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSnapshot, alertas, isoLocal, somarDias } from '../js/core.js';

const AGORA = new Date('2026-11-11T12:00:00-03:00'); // quarta-feira

function matrix() {
  return {
    anos: {
      2026: {
        Novembro: {
          fixos: [
            { nome: 'Energia', valor: 243.17, pago: false },
            { nome: 'Água', valor: 118.4, pago: true }
          ],
          outros: [],
          diarios: [],
          receitas: [{ nome: 'Salário', valor: 5000, categoria: 'Salário / Proventos', pago: true }]
        }
      }
    },
    satellites: {
      maracaju: {
        atualizadoEm: '2026-11-11T10:00:00-03:00',
        cicloVigente: '2026-11',
        creditDate: '2026-11-14',
        vaTotal: 2050,
        saldoVaRestante: 1500,
        vrTotal: 1100,
        saldoVrRestante: 800,
        totalDisponivel: 2300,
        gastoMercadoMesAtual: 550
      }
    }
  };
}

function cenario(over = {}) {
  const maracaju = {
    tasks: [
      { id: 't1', title: 'Lavar a louça', frequency: 'diaria' },
      { id: 't2', title: 'Arrumar a cama', frequency: 'diaria' },
      { id: 't3', title: 'Lavar roupa de cama', frequency: 'semanal' },
      { id: 't4', title: 'Passar pano na casa', frequency: 'semanal' }
    ],
    history: {
      '2026-11-11': { t2: { done: true } },
      '2026-11-09': { t4: { done: true, by: 'scarlet' } }
    },
    ...over.maracaju
  };

  const agenda = over.agenda || [
    { data: '2026-11-11', hora: '09:00', pacienteNome: 'Ana', status: 'Agendado' },
    { data: '2026-11-11', hora: '14:00', pacienteNome: 'Bia', status: 'Agendado' },
    { data: '2026-11-11', hora: '16:00', pacienteNome: 'Cancelada', status: 'Cancelado' },
    { data: '2026-11-12', hora: '10:00', pacienteNome: 'Caio', status: 'Agendado' }
  ];

  const snapshot = buildSnapshot({ matrix: matrix(), now: AGORA });
  return { snapshot, extras: { maracaju, agenda, now: AGORA } };
}

test('isoLocal e somarDias usam o calendário local', () => {
  assert.equal(isoLocal(AGORA), '2026-11-11');
  assert.equal(isoLocal(somarDias(AGORA, 1)), '2026-11-12');
  assert.equal(isoLocal(somarDias(AGORA, -7)), '2026-11-04');
  assert.equal(isoLocal(somarDias(new Date(2026, 11, 31), 1)), '2027-01-01');
});

test('sem nada, não inventa alerta', () => {
  const vazio = buildSnapshot({ now: AGORA });
  assert.deepEqual(alertas(vazio, { now: AGORA }), []);

  // Com o snapshot completo mas sem tarefas/agenda, sobram só os alertas que
  // vêm do próprio snapshot (recarga e contas).
  const { snapshot } = cenario();
  const soSnapshot = alertas(snapshot, { maracaju: { tasks: [], history: {} }, agenda: [], now: AGORA });
  assert.deepEqual(soSnapshot.map((x) => x.id), ['recarga-beneficio', 'contas-pendentes']);
});

test('tarefas: só as diárias não feitas hoje entram', () => {
  const { snapshot, extras } = cenario();
  const a = alertas(snapshot, extras).find((x) => x.id === 'tarefas-hoje');
  assert.equal(a.titulo, '1 tarefa do lar hoje');
  assert.equal(a.valores.nomes, 'Lavar a louça');
});

test('tarefas: semanal sem fazer há 7 dias vira atraso', () => {
  const { snapshot, extras } = cenario();
  const a = alertas(snapshot, extras).find((x) => x.id === 'tarefas-semana');
  assert.equal(a.quando, 'atrasado');
  assert.equal(a.valores.nomes, 'Lavar roupa de cama');
});

test('tarefas: feita dentro da semana não aparece', () => {
  const { snapshot, extras } = cenario();
  const a = alertas(snapshot, extras).find((x) => x.id === 'tarefas-semana');
  assert.ok(!a.valores.nomes.includes('Passar pano'));
});

test('agenda: conta hoje e amanhã e ignora cancelado', () => {
  const { snapshot, extras } = cenario();
  const hoje = alertas(snapshot, extras).find((x) => x.id === 'atendimentos-hoje');
  const amanha = alertas(snapshot, extras).find((x) => x.id === 'atendimentos-amanha');
  assert.equal(hoje.titulo, '2 atendimentos hoje');
  assert.ok(hoje.valores.lista.includes('09:00 Ana'));
  assert.equal(amanha.titulo, '1 atendimento amanhã');
  assert.equal(amanha.valores.lista, '10:00 Caio');
});

test('recarga de VA/VR a até 7 dias vira alerta com o valor', () => {
  const { snapshot, extras } = cenario();
  const a = alertas(snapshot, extras).find((x) => x.id === 'recarga-beneficio');
  assert.equal(a.quando, 'proximo');
  assert.equal(a.valores.valor, 3150);
  assert.equal(a.valores.data, '14/11');
});

test('recarga distante não vira alerta', () => {
  const st = matrix();
  st.satellites.maracaju.creditDate = '2026-12-04';
  const snapshot = buildSnapshot({ matrix: st, now: AGORA });
  const a = alertas(snapshot, { maracaju: { tasks: [], history: {} }, agenda: [], now: AGORA });
  assert.ok(!a.some((x) => x.id === 'recarga-beneficio'));
});

test('contas pendentes entram como item do mês', () => {
  const { snapshot, extras } = cenario();
  const a = alertas(snapshot, extras).find((x) => x.id === 'contas-pendentes');
  assert.equal(a.quando, 'mes');
  assert.equal(a.valores.valor, 243.17);
  assert.equal(a.valores.nomes, 'Energia');
});

test('ordem: atrasado, hoje, amanhã, próximo, mês', () => {
  const { snapshot, extras } = cenario();
  assert.deepEqual(
    alertas(snapshot, extras).map((x) => x.id),
    ['tarefas-semana', 'tarefas-hoje', 'atendimentos-hoje', 'atendimentos-amanha', 'recarga-beneficio', 'contas-pendentes']
  );
});

test('todo placeholder dos alertas existe em valores', () => {
  const { snapshot, extras } = cenario();
  alertas(snapshot, extras).forEach((a) => {
    const chaves = [...a.texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    chaves.forEach((k) => assert.ok(k in a.valores, `alerta ${a.id} usa {${k}} sem valor`));
  });
});
