/**
 * Nexo · testes do núcleo.
 * Rodar: node --test test/*.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  num, round2, ymKey, monthLabel, pickMonth, safeParse, soma,
  isBeneficio, isContaBeneficio, stale, resumoPagamento, buildSnapshot,
  DONOS, donoPadrao, indexarRegras, resolverDono, proximoDono,
  conciliar, contarAlertas
} from '../js/core.js';

const AGORA = new Date('2026-11-11T12:00:00-03:00');

function estadoMatrix(over = {}) {
  return {
    anos: {
      2026: {
        Novembro: {
          fixos: [
            { id: 'fix_1', nome: 'Financiamento Caixa', valor: 1395.88, pago: true },
            { id: 'fix_2', nome: 'Caronas', valor: 921.85, pago: false },
            { id: 'fix_3', nome: 'Unimed', valor: 867.72, pago: true }
          ],
          outros: [
            { id: 'out_1', nome: 'Renda+ 2055', valor: 103, pago: true },
            { id: 'out_2', nome: 'BB', valor: 327.38, pago: false }
          ],
          diarios: [
            { id: 'd1', nome: 'Padaria', valor: 22.5, conta: 'debito_inter', pago: true },
            { id: 'd2', nome: 'Mercado', valor: 300, conta: 'cartao_va', pago: true },
            { id: 'd3', nome: 'Almoço', valor: 40, conta: 'cartao_vr', pago: true },
            { id: 'd4', nome: 'Fatura Nubank', valor: 500, conta: 'credito_nubank', jaAlocadoVariavel: true }
          ],
          receitas: [
            { id: 'r1', nome: 'Salário Líquido USP', valor: 5786.24, categoria: 'Salário / Proventos', conta: 'bb', pago: true },
            { id: 'r2', nome: 'Renda Extra', valor: 600, categoria: 'Renda Extra', conta: 'debito_inter', pago: true },
            { id: 'r3', nome: 'Vale Refeição (VR)', valor: 1300, categoria: 'Benefício (Não Pecúnia)', naoPecunia: true, pago: true }
          ],
          scarlet: { gastos: [], ganhos: 3700, faturaNubank: 4835.22 }
        }
      }
    },
    satellites: {
      maracaju: {
        atualizadoEm: '2026-11-11T10:00:00-03:00',
        cicloVigente: '2026-11',
        vaTotal: 2059.84,
        saldoVaRestante: 1200.5,
        vrTotal: 1105.16,
        saldoVrRestante: 800,
        totalDisponivel: 2000.5,
        gastoMercadoMesAtual: 859.34
      },
      faturas: {
        atualizadoEm: '2026-11-11T09:00:00-03:00',
        faturaAtualReal: 4883.05,
        limiteMetaMensal: 3000,
        faturasFuturasCompromissadas: 1568.05
      },
      fisioflow: {
        atualizadoEm: '2026-11-11T08:00:00-03:00',
        mesAtualTotal: 2100,
        mesAtualPrevisto: 900,
        pacientesAtivos: 7,
        ganhosPorMes: {
          '2026-11': { realizado: 2100, aReceber: 900, sessoes: 21, total: 3000, previsto: 0 }
        }
      }
    },
    ...over
  };
}

/* ------------------------------------------------------------------ base */
test('num aceita number, pt-BR e lixo', () => {
  assert.equal(num(12.5), 12.5);
  assert.equal(num('12,50'), 12.5);
  assert.equal(num('1.234,56'), 1234.56);
  assert.equal(num('R$ 90,00'), 90);
  assert.equal(num(null), 0);
  assert.equal(num('abc'), 0);
});

test('round2 não deixa resíduo de float', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1395.885), 1395.89);
});

test('ymKey e monthLabel usam o calendário real', () => {
  assert.equal(ymKey(AGORA), '2026-11');
  assert.equal(monthLabel(AGORA), 'Novembro');
});

test('safeParse devolve null para lixo e objeto para JSON válido', () => {
  assert.equal(safeParse('{quebrado'), null);
  assert.deepEqual(safeParse('{"a":1}'), { a: 1 });
  assert.equal(safeParse(null), null);
});

test('isContaBeneficio reconhece VA e VR', () => {
  assert.equal(isContaBeneficio('cartao_va'), true);
  assert.equal(isContaBeneficio('VR'), true);
  assert.equal(isContaBeneficio('debito_inter'), false);
});

test('isBeneficio pega naoPecunia e a categoria', () => {
  assert.equal(isBeneficio({ naoPecunia: true }), true);
  assert.equal(isBeneficio({ categoria: 'Benefício (Não Pecúnia)' }), true);
  assert.equal(isBeneficio({ categoria: 'Salário / Proventos' }), false);
});

/* ------------------------------------------------------------ pickMonth */
test('pickMonth acha o mês do ano pedido', () => {
  const st = estadoMatrix();
  const { month, ano, fallback } = pickMonth(st, 2026, 'Novembro');
  assert.ok(month);
  assert.equal(ano, '2026');
  assert.equal(fallback, false);
});

test('pickMonth cai para o ano mais recente e sinaliza fallback', () => {
  const { month, ano, fallback } = pickMonth(estadoMatrix(), 2030, 'Novembro');
  assert.ok(month);
  assert.equal(ano, '2026');
  assert.equal(fallback, true);
});

test('pickMonth sem ano nenhum devolve null', () => {
  assert.deepEqual(pickMonth({}, 2026, 'Novembro'), { month: null, ano: null, fallback: false });
  assert.deepEqual(pickMonth(null, 2026, 'Novembro'), { month: null, ano: null, fallback: false });
});

/* ----------------------------------------------------------- pagamentos */
test('resumoPagamento separa pago e pendente sem arredondar errado', () => {
  const r = resumoPagamento([
    { nome: 'A', valor: 100, pago: true },
    { nome: 'B', valor: 50.5, pago: false },
    { nome: 'C', valor: 0.25, pago: false }
  ]);
  assert.equal(r.total, 150.75);
  assert.equal(r.pago, 100);
  assert.equal(r.pendente, 50.75);
  assert.equal(r.qtdPendentes, 2);
  assert.equal(r.pendentes[0].nome, 'B');
});

/* ---------------------------------------------------------------- stale */
test('stale marca dado com mais de 6 h', () => {
  assert.equal(stale('2026-11-11T10:00:00-03:00', AGORA), false);
  assert.equal(stale('2026-11-11T02:00:00-03:00', AGORA), true);
  assert.equal(stale(null, AGORA), true);
  assert.equal(stale('data-invalida', AGORA), true);
});

/* -------------------------------------------------------------- snapshot */
test('snapshot: caixa soma fixos, outros e diários (sem VA/VR nem já alocados)', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  const c = s.casa.caixa;

  assert.equal(c.gastosFixos, 3185.45);
  assert.equal(c.gastosOutros, 430.38);
  // 22,50 (débito) — os 300 (VA), 40 (VR) e 500 (já alocado) ficam de fora
  assert.equal(c.gastosDiarios, 22.5);
  assert.equal(c.gastosTotal, 3638.33);
  assert.equal(c.receitas, 6386.24);
  assert.equal(c.receitasBeneficio, 1300);
  assert.equal(c.saldo, 2747.91);
  assert.equal(c.pendente, 1249.23);
});

test('snapshot: o Black é um só cartão e é pago pela Scarlet', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  assert.equal(s.casa.cartoes.black, 4883.05);
  assert.equal(s.casa.cartoes.matheus, null, 'o cartão não é do Matheus');
  assert.equal(s.casa.cartoes.scarlet, 4883.05);
  assert.equal(s.casa.cartoes.total, 4883.05, 'não pode somar satélite + nó scarlet (é a mesma fatura)');
  assert.equal(s.casa.cartoes.pctMeta, 163);
});

test('snapshot: benefícios vêm do Matrix e calculam gasto por diferença', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  const b = s.casa.beneficios;
  assert.equal(b.fonte, 'matrix');
  assert.equal(b.disponivel, 2000.5);
  assert.equal(b.vaGasto, 859.34);
  assert.equal(b.vrGasto, 305.16);
  assert.equal(b.pctVa, 58);
});

test('snapshot: benefícios caem para o benefitsSummary do Casa Maracaju', () => {
  const maracaju = {
    settings: {
      benefitsSummary: {
        cycleKey: '2026-11', vaTotal: 2000, vaBalance: 500, vrTotal: 1000, vrBalance: 250,
        updatedAt: '2026-11-11T11:00:00-03:00'
      }
    }
  };
  const s = buildSnapshot({ maracaju, now: AGORA });
  assert.equal(s.casa.beneficios.fonte, 'maracaju');
  assert.equal(s.casa.beneficios.disponivel, 750);
  assert.equal(s.fontes.maracaju, true);
});

test('snapshot: trabalho usa o satélite do Matrix quando existe', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  assert.equal(s.casa.trabalho.recebido, 2100);
  assert.equal(s.casa.trabalho.aReceber, 900);
  assert.equal(s.casa.trabalho.sessoes, 21);
  assert.equal(s.scarlet.ganhos, 3000);
  assert.equal(s.scarlet.cartao, 4883.05, 'o cartão dela é o Black');
});

test('snapshot: trabalho cai para os lançamentos locais do Atendimentos', () => {
  const atendimentos = [
    { nome: 'Ana', data: '2026-11-03', valor: 120, status: 'Pago' },
    { nome: 'Bia', data: '2026-11-05', valor: 150, status: 'Pendente' },
    { nome: 'Caio', data: '2026-10-30', valor: 999, status: 'Pago' }
  ];
  const s = buildSnapshot({ atendimentos, now: AGORA });
  assert.equal(s.casa.trabalho.fonte, 'atendimentos');
  assert.equal(s.casa.trabalho.recebido, 120);
  assert.equal(s.casa.trabalho.aReceber, 150);
  assert.equal(s.casa.trabalho.sessoes, 2);
});

test('snapshot: sem nenhuma fonte não inventa número', () => {
  const s = buildSnapshot({ now: AGORA });
  assert.equal(s.fontes.matrix, false);
  assert.equal(s.casa.caixa.saldo, 0);
  assert.equal(s.casa.cartoes.total, null);
  assert.equal(s.casa.beneficios, null);
  assert.equal(s.casa.trabalho, null);
  assert.equal(s.scarlet.ganhos, null);
  assert.ok(s.avisos.some((a) => /Matrix/.test(a)));
});

test('snapshot: mês sem lançamento gera aviso e não quebra', () => {
  const s = buildSnapshot({
    matrix: { anos: { 2026: { Outubro: { fixos: [], outros: [], receitas: [], diarios: [] } } } },
    now: AGORA
  });
  assert.equal(s.fontes.matrix, true);
  assert.equal(s.casa.caixa.receitas, 0);
  assert.ok(s.avisos.some((a) => /Novembro\/2026|2026/.test(a)));
});

test('snapshot: dado velho de benefício aparece nos avisos', () => {
  const st = estadoMatrix();
  st.satellites.maracaju.atualizadoEm = '2026-11-09T08:00:00-03:00';
  const s = buildSnapshot({ matrix: st, now: AGORA });
  assert.equal(s.casa.beneficios.velho, true);
  assert.ok(s.avisos.some((a) => /VA\/VR/.test(a)));
});

test('snapshot: person split mantém benefício fora das receitas do Matheus', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  assert.equal(s.matheus.receitas.length, 2);
  assert.equal(s.matheus.totalReceitas, 6386.24);
  assert.equal(s.matheus.cartao, null, 'o Black não é do Matheus');
});

/* ------------------------------------------------- atribuição por pessoa */
test('donoPadrao: conta fixa é da casa, diário no débito é do Matheus', () => {
  assert.equal(donoPadrao({ nome: 'Unimed' }, 'conta'), 'casa');
  assert.equal(donoPadrao({ nome: 'Padaria', conta: 'debito_inter' }, 'diario'), 'matheus');
  assert.equal(donoPadrao({ nome: 'Mercado', conta: 'cartao_va' }, 'diario'), 'casa');
  assert.equal(donoPadrao({ nome: 'Salário', valor: 10 }, 'receita'), 'matheus');
  assert.equal(donoPadrao({ nome: 'VR', naoPecunia: true }, 'receita'), 'casa');
});

test('indexarRegras ignora dono ou tipo inválido', () => {
  const mapa = indexarRegras([
    { tipo: 'nome', chave: 'Caronas', dono: 'scarlet' },
    { tipo: 'nome', chave: 'X', dono: 'ninguem' },
    { tipo: 'inventado', chave: 'Y', dono: 'casa' },
    { tipo: 'conta', chave: '', dono: 'casa' },
    null
  ]);
  assert.deepEqual(Object.keys(mapa.nome), ['caronas']);
  assert.deepEqual(Object.keys(mapa.categoria), []);
  assert.deepEqual(Object.keys(mapa.conta), []);
});

test('resolverDono prioriza nome > categoria > conta', () => {
  const mapa = indexarRegras([
    { tipo: 'conta', chave: 'bb', dono: 'scarlet' },
    { tipo: 'categoria', chave: 'Casa & Utilidades', dono: 'matheus' }
  ]);
  const item = { nome: 'Luz', categoria: 'Casa & Utilidades', conta: 'BB' };
  // categoria vence conta
  assert.equal(resolverDono(item, 'conta', mapa), 'matheus');
  // nome vence categoria
  const mapa2 = indexarRegras([{ tipo: 'nome', chave: 'Luz', dono: 'casa' }]);
  assert.equal(resolverDono(item, 'conta', mapa2), 'casa');
  // sem regra, cai no padrão
  assert.equal(resolverDono({ nome: 'Unimed' }, 'conta', null), 'casa');
});

test('regra de nome ignora caixa e acento', () => {
  const mapa = indexarRegras([{ tipo: 'nome', chave: '  saúde  ', dono: 'scarlet' }]);
  assert.equal(resolverDono({ nome: 'SAUDE' }, 'conta', mapa), 'scarlet');
});

test('proximoDono cicla Casa → Matheus → Scarlet → Casa', () => {
  assert.equal(proximoDono('casa'), 'matheus');
  assert.equal(proximoDono('matheus'), 'scarlet');
  assert.equal(proximoDono('scarlet'), 'casa');
  assert.equal(proximoDono('desconhecido'), 'casa');
  assert.equal(DONOS.length, 3);
});

test('snapshot: divisão padrão põe as contas na casa e o diário com o Matheus', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  assert.equal(s.casa.caixa.gastosPorDono.casa, 3615.83);
  assert.equal(s.casa.caixa.gastosPorDono.matheus, 22.5);
  assert.equal(s.casa.caixa.gastosPorDono.scarlet, 0);
  assert.equal(s.matheus.totalGastos, 22.5);
  assert.equal(s.scarlet.totalGastos, 0);
});

test('snapshot: a soma por dono fecha com o gasto total', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  const somaDonos = Object.values(s.casa.caixa.gastosPorDono).reduce((a, b) => a + b, 0);
  assert.equal(round2(somaDonos), s.casa.caixa.gastosTotal);
});

test('snapshot: regra por nome move o gasto de dono', () => {
  const s = buildSnapshot({
    matrix: estadoMatrix(),
    regras: [{ tipo: 'nome', chave: 'Caronas', dono: 'scarlet' }],
    now: AGORA
  });
  assert.equal(s.scarlet.totalGastos, 921.85);
  assert.equal(s.casa.caixa.gastosPorDono.casa, 2693.98);
  assert.ok(s.scarlet.gastos.some((g) => g.nome === 'Caronas'));
  assert.ok(!s.casa.gastos.some((g) => g.nome === 'Caronas'));
});

test('snapshot: lista da pessoa vem ordenada do maior para o menor', () => {
  const s = buildSnapshot({
    matrix: estadoMatrix(),
    regras: [
      { tipo: 'nome', chave: 'Caronas', dono: 'matheus' },
      { tipo: 'nome', chave: 'Padaria', dono: 'matheus' }
    ],
    now: AGORA
  });
  assert.deepEqual(s.matheus.gastos.map((g) => g.nome), ['Caronas', 'Padaria']);
  assert.equal(s.matheus.totalGastos, 944.35);
});

/* ------------------------------------------------- faturas: precedência */
test('cartões: ajustes locais do Faturas recalculam com a lista canônica', () => {
  const base = [{ d: 'Item', v: 100, de: 0, ate: 6 }];
  const s = buildSnapshot({
    matrix: estadoMatrix(),
    faturas: {
      overrides: { Item__2: 300 },
      extras: [{ desc: 'Extra', val: 50, de: 2, ate: 2 }],
      sim: [],
      profile: { meta: 1000 }
    },
    base,
    now: AGORA
  });
  assert.equal(s.casa.cartoes.fonte, 'faturas');
  assert.equal(s.casa.cartoes.black, 350);
  assert.equal(s.casa.cartoes.futuras, 100, 'mês seguinte sem override nem extra');
  assert.equal(s.casa.cartoes.meta, 1000);
  assert.equal(s.casa.cartoes.velho, false);
});

test('cartões: sem ajustes locais, cai no satélite do Matrix', () => {
  const s = buildSnapshot({
    matrix: estadoMatrix(),
    faturas: { overrides: {}, extras: [], sim: [], profile: {} },
    now: AGORA
  });
  assert.equal(s.casa.cartoes.fonte, 'matrix');
  assert.equal(s.casa.cartoes.black, 4883.05);
});

test('cartões: sem fonte nenhuma não inventa valor', () => {
  const s = buildSnapshot({ now: AGORA });
  assert.equal(s.casa.cartoes.black, null);
  assert.equal(s.casa.cartoes.fonte, null);
});

test('cartões: satélite e nó scarlet NÃO são somados (é a mesma fatura)', () => {
  const s = buildSnapshot({ matrix: estadoMatrix(), now: AGORA });
  // o fixture tem 4883,05 no satélite e 4835,22 no nó scarlet do mês
  assert.equal(s.casa.cartoes.total, 4883.05);
  assert.notEqual(s.casa.cartoes.total, 9718.27, 'somar as duas fontes dobrava a fatura');
});

test('cartões: sem satélite, usa o nó scarlet do mês como fallback', () => {
  const st = estadoMatrix();
  delete st.satellites.faturas;
  const s = buildSnapshot({ matrix: st, now: AGORA });
  assert.equal(s.casa.cartoes.black, 4835.22);
  assert.equal(s.casa.cartoes.fonte, 'scarlet');
  assert.equal(s.casa.cartoes.matheus, null);
});

/* ------------------------------------------------------- conciliação */
test('conciliar(null) não explode', () => {
  assert.deepEqual(conciliar(null), []);
  assert.deepEqual(conciliar({}), []);
  assert.equal(contarAlertas(null), 0);
});

test('conciliação: ordem põe risco antes de atenção, ok e info', () => {
  const a = conciliar(buildSnapshot({ matrix: estadoMatrix(), now: AGORA }));
  assert.deepEqual(a.map((x) => x.id), ['cartoes', 'sobra', 'scarlet', 'beneficios', 'divisao']);
  assert.deepEqual(a.map((x) => x.tom), ['risco', 'risco', 'atencao', 'ok', 'info']);
});

test('conciliação: fatura acima da meta é risco com o excedente', () => {
  const a = conciliar(buildSnapshot({ matrix: estadoMatrix(), now: AGORA }));
  const cartoes = a.find((x) => x.id === 'cartoes');
  assert.equal(cartoes.tom, 'risco');
  assert.equal(cartoes.valores.acima, 1883.05);
  assert.equal(cartoes.valores.metaPct, 163);
});

test('conciliação: fatura que come a sobra é risco', () => {
  const a = conciliar(buildSnapshot({ matrix: estadoMatrix(), now: AGORA }));
  const sobra = a.find((x) => x.id === 'sobra');
  assert.equal(sobra.tom, 'risco');
  assert.equal(sobra.valores.dif, 2135.14);
});

test('conciliação: pagamento de cartão no fluxo vira aviso e não soma de novo', () => {
  const st = estadoMatrix();
  st.anos[2026].Novembro.fixos.push({ id: 'fix_cartao', nome: 'Fatura Nubank', valor: 4883.05, pago: false });
  const a = conciliar(buildSnapshot({ matrix: st, now: AGORA }));
  const dup = a.find((x) => x.id === 'duplicidade');
  assert.ok(dup, 'deveria avisar sobre pagamento já lançado');
  assert.equal(dup.tom, 'info');
  assert.equal(dup.valores.soma, 4883.05);
  assert.ok(!a.some((x) => x.id === 'sobra'), 'não deve comparar sobra quando a fatura já está no fluxo');
});

test('conciliação: benefício estourado vira risco com o excedente', () => {
  const st = estadoMatrix();
  st.satellites.maracaju.vaTotal = 500;
  st.satellites.maracaju.saldoVaRestante = -50;
  const a = conciliar(buildSnapshot({ matrix: st, now: AGORA }));
  const b = a.find((x) => x.id === 'beneficios');
  assert.equal(b.tom, 'risco');
  assert.equal(b.valores.estouro, 50);
});

test('conciliação: benefício no limite vira atenção', () => {
  const st = estadoMatrix();
  st.satellites.maracaju.saldoVaRestante = 120; // 94% usado
  const a = conciliar(buildSnapshot({ matrix: st, now: AGORA }));
  const b = a.find((x) => x.id === 'beneficios');
  assert.equal(b.tom, 'atencao');
  assert.ok(b.valores.vaPct >= 90);
});

test('conciliação: divisão por dono fecha 100%', () => {
  const a = conciliar(buildSnapshot({ matrix: estadoMatrix(), now: AGORA }));
  const d = a.find((x) => x.id === 'divisao');
  const somaPct = d.valores.casaPct + d.valores.matheusPct + d.valores.scarletPct;
  assert.ok(Math.abs(somaPct - 100) <= 1, `soma ${somaPct} deveria dar ~100`);
});

test('conciliação: percentuais usam chave terminada em Pct', () => {
  const a = conciliar(buildSnapshot({ matrix: estadoMatrix(), now: AGORA }));
  const sc = a.find((x) => x.id === 'scarlet');
  assert.equal(Math.round(sc.valores.razaoPct), 163);
  assert.ok(!('pct' in sc.valores), 'chave sem sufixo Pct viraria R$ na tela');
  // todo placeholder do texto existe em valores
  a.forEach((x) => {
    const chaves = [...x.texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    chaves.forEach((k) => assert.ok(k in x.valores, `achado ${x.id} usa {${k}} sem valor`));
  });
});

test('conciliação: sem mês lançado não inventa achado de caixa', () => {
  const s = buildSnapshot({ now: AGORA });
  const a = conciliar(s);
  assert.ok(!a.some((x) => x.id === 'cartoes' || x.id === 'sobra'));
  assert.equal(contarAlertas(a), 0);
});
