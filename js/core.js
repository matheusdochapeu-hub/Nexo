/**
 * Nexo · core.js
 * ---------------------------------------------------------------------------
 * Camada PURA: nenhum acesso a DOM, localStorage, rede ou Data implícita.
 * Recebe o estado bruto dos apps e devolve um retrato normalizado da casa.
 *
 * Fontes (todas somente leitura — o Nexo nunca escreve no estado dos outros):
 *   1. matrix        → MATRIX_FINANCE_STATE_v2 (contém `anos` + `satellites`)
 *   2. maracaju      → MARACAJU_STATE_v1 (`settings.benefitsSummary`)
 *   3. atendimentos  → ft_local_entries (lançamentos financeiros da Scarlet)
 *
 * Tudo é opcional. Fonte ausente vira `null` — nunca zero inventado.
 */

import { indiceDoMes, mesDoIndice, totalDoMes, tamanhoBase } from './faturas.js';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** Contas pagas com benefício (VA/VR) não são dinheiro em conta. */
export const CONTAS_BENEFICIO = ['cartao_va', 'cartao_vr', 'va', 'vr'];

/** Depois disso sem atualizar, o dado é tratado como velho (mesma regra do Matrix). */
export const HORAS_DADO_VELHO = 6;

export function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/** Número tolerante: aceita 12.5, "12,50", "1.234,56" e devolve 0 no lixo. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const limpo = s.replace(/[^\d.,\-]/g, '');
  const parsed = limpo.includes(',')
    ? parseFloat(limpo.replace(/\./g, '').replace(',', '.'))
    : parseFloat(limpo);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ymKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(date) {
  return MESES[date.getMonth()];
}

export function safeParse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function arr(v) {
  return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
}

export function isBeneficio(item) {
  if (!item) return false;
  if (item.naoPecunia === true) return true;
  return /benef[íi]cio|n[ãa]o\s*pec[úu]nia/i.test(String(item.categoria || ''));
}

export function isContaBeneficio(conta) {
  const c = String(conta || '').toLowerCase();
  return CONTAS_BENEFICIO.includes(c);
}

/* -------------------------------------------------------------------------
 * ATRIBUIÇÃO POR PESSOA
 * Cada gasto tem um dono: 'casa', 'matheus' ou 'scarlet'.
 * O padrão vem da natureza do lançamento; o dono pode ser trocado por regra
 * (guardada no Nexo, nunca no estado dos outros apps).
 * ---------------------------------------------------------------------- */
export const DONOS = ['casa', 'matheus', 'scarlet'];

export const DONO_LABEL = { casa: 'Casa', matheus: 'Matheus', scarlet: 'Scarlet' };

export function normChave(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Dono padrão de um lançamento, antes de qualquer regra:
 * - conta fixa/variável/início de ano → é da casa;
 * - diário no VA/VR → é da casa (comida é casa); nos cartões/débito → de quem lançou (Matheus);
 * - receita de benefício → casa; salário/extra → Matheus.
 */
export function donoPadrao(item, tipo) {
  if (tipo === 'receita') return isBeneficio(item) ? 'casa' : 'matheus';
  if (tipo === 'diario') return isContaBeneficio(item && item.conta) ? 'casa' : 'matheus';
  return 'casa';
}

/** Índice de regras por tipo de chave, para consulta em O(1). Regra inválida é ignorada. */
export function indexarRegras(regras) {
  const mapa = { nome: {}, categoria: {}, conta: {} };
  arr(regras).forEach((r) => {
    const dono = r && r.dono;
    const tipo = r && r.tipo;
    if (!dono || !DONOS.includes(dono)) return;
    if (!['nome', 'categoria', 'conta'].includes(tipo)) return;
    const chave = normChave(r.chave);
    if (!chave) return;
    mapa[tipo][chave] = dono;
  });
  return mapa;
}

/** Precedência: nome > categoria > conta > padrão. */
export function resolverDono(item, tipo, mapa) {
  const padrao = donoPadrao(item, tipo);
  if (!mapa) return padrao;
  const nome = normChave(item && item.nome);
  if (nome && mapa.nome[nome]) return mapa.nome[nome];
  const categoria = normChave(item && item.categoria);
  if (categoria && mapa.categoria[categoria]) return mapa.categoria[categoria];
  const conta = normChave(item && item.conta);
  if (conta && mapa.conta[conta]) return mapa.conta[conta];
  return padrao;
}

/** Próximo dono no ciclo de toque (Casa → Matheus → Scarlet → Casa). */
export function proximoDono(atual) {
  const i = DONOS.indexOf(atual);
  return DONOS[(i + 1 + DONOS.length) % DONOS.length];
}

export function soma(lista, filtro) {
  return round2(arr(lista).filter(filtro || (() => true)).reduce((acc, it) => acc + num(it.valor), 0));
}

export function stale(iso, now = new Date(), horas = HORAS_DADO_VELHO) {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return (now.getTime() - t) / 36e5 > horas;
}

/**
 * Acha o mês pedido. Se o ano atual não existir no estado (base histórica
 * 2025–2027), usa o ano mais recente que tenha aquele mês, e avisa.
 */
export function pickMonth(state, ano, label) {
  const anos = state && state.anos;
  if (!anos || typeof anos !== 'object') return { month: null, ano: null, fallback: false };

  if (anos[String(ano)] && anos[String(ano)][label]) {
    return { month: anos[String(ano)][label], ano: String(ano), fallback: false };
  }

  const candidatos = Object.keys(anos)
    .filter((y) => anos[y] && anos[y][label])
    .sort();
  const ultimo = candidatos[candidatos.length - 1];
  if (ultimo) return { month: anos[ultimo][label], ano: ultimo, fallback: true };

  return { month: null, ano: null, fallback: false };
}

/** Resumo pago/pendente de um bloco de contas (fixos, outros, início de ano). */
export function resumoPagamento(lista) {
  const itens = arr(lista);
  const total = round2(itens.reduce((a, it) => a + num(it.valor), 0));
  const pendentes = itens.filter((it) => it.pago === false);
  const pendenteValor = round2(pendentes.reduce((a, it) => a + num(it.valor), 0));
  return {
    total,
    pago: round2(total - pendenteValor),
    pendente: pendenteValor,
    qtdPendentes: pendentes.length,
    pctPago: total > 0 ? Math.round(((total - pendenteValor) / total) * 100) : 100,
    pendentes: pendentes
      .slice()
      .sort((a, b) => num(b.valor) - num(a.valor))
      .map((it) => ({ nome: it.nome || 'Conta', valor: num(it.valor) }))
  };
}

/* -------------------------------------------------------------------------
 * BENEFÍCIOS (VA/VR) — Matrix sincronizado manda; Casa Maracaju é o backup.
 * ---------------------------------------------------------------------- */
function beneficios(sat, maracaju, now) {
  const m = sat && sat.maracaju;
  if (m && (m.vaTotal != null || m.totalDisponivel != null)) {
    const vaTotal = num(m.vaTotal);
    const vrTotal = num(m.vrTotal);
    const vaSaldo = num(m.saldoVaRestante);
    const vrSaldo = num(m.saldoVrRestante);
    return {
      fonte: 'matrix',
      ciclo: m.cicloVigente || null,
      creditDate: m.creditDate || null,
      vaTotal, vaSaldo, vaGasto: round2(vaTotal - vaSaldo),
      vrTotal, vrSaldo, vrGasto: round2(vrTotal - vrSaldo),
      disponivel: num(m.totalDisponivel),
      mercado: num(m.gastoMercadoMesAtual),
      pctVa: vaTotal > 0 ? Math.round((vaSaldo / vaTotal) * 100) : 0,
      pctVr: vrTotal > 0 ? Math.round((vrSaldo / vrTotal) * 100) : 0,
      atualizadoEm: m.atualizadoEm || null,
      velho: stale(m.atualizadoEm, now)
    };
  }

  const b = maracaju && maracaju.settings && maracaju.settings.benefitsSummary;
  if (b) {
    const vaTotal = num(b.vaTotal);
    const vrTotal = num(b.vrTotal);
    const vaSaldo = num(b.vaBalance);
    const vrSaldo = num(b.vrBalance);
    return {
      fonte: 'maracaju',
      ciclo: b.cycleKey || null,
      creditDate: null,
      vaTotal, vaSaldo, vaGasto: round2(vaTotal - vaSaldo),
      vrTotal, vrSaldo, vrGasto: round2(vrTotal - vrSaldo),
      disponivel: round2(vaSaldo + vrSaldo),
      mercado: round2(num(b.vaSpent)),
      pctVa: vaTotal > 0 ? Math.round((vaSaldo / vaTotal) * 100) : 0,
      pctVr: vrTotal > 0 ? Math.round((vrSaldo / vrTotal) * 100) : 0,
      atualizadoEm: b.updatedAt || null,
      velho: stale(b.updatedAt, now)
    };
  }

  return null;
}

/* -------------------------------------------------------------------------
 * CARTÕES — o Nubank Black é UM cartão só, e é a Scarlet quem paga.
 *
 * Descoberta que corrigiu um erro do Nexo: o satélite do app Faturas
 * (`satellites.faturas`) e o nó `anos[ano][mes].scarlet.faturaNubank` do Matrix
 * são a MESMA fatura. O próprio Matrix confirma isso em `getFaturaNubankMes()`,
 * que usa um como fallback do outro. Somar os dois dobrava o valor.
 *
 * Precedência do valor:
 *   1. Ajustes locais do app Faturas (`pv4_*`) → recalcula com a lista canônica.
 *   2. Satélite do Matrix.
 *   3. `scarlet.faturaNubank` do mês (fallback histórico do Matrix).
 *   4. Nada → `null` (a tela mostra "—").
 * ---------------------------------------------------------------------- */
const NOMES_MES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

/**
 * Fatura do mês seguinte segundo o satélite do Matrix.
 * Prefere `faturasPorMes["2026-Dezembro"].total`; sem ele, cai no escalar
 * `faturasFuturasCompromissadas` (que é um valor de reserva, pode estar velho).
 */
function proximaFaturaDoSatelite(f, now) {
  if (!f) return null;
  const proximo = mesDoIndice(indiceDoMes(now.getFullYear(), now.getMonth() + 1) + 1);
  const chave = `${proximo.ano}-${NOMES_MES[proximo.mes - 1]}`;
  const doMes = f.faturasPorMes && f.faturasPorMes[chave];
  if (doMes) {
    const v = num(doMes.total != null ? doMes.total : doMes.valorReal);
    if (v !== null) return v;
  }
  return num(f.faturasFuturasCompromissadas);
}

function cartoes(sat, month, now, local, base) {
  const f = sat && sat.faturas;
  const doMes = month && month.scarlet ? num(month.scarlet.faturaNubank) : null;

  const temAjustes =
    !!local &&
    ((local.overrides && Object.keys(local.overrides).length > 0) ||
      (Array.isArray(local.extras) && local.extras.length > 0));

  let black = null;
  let meta = null;
  let futuras = null;
  let atualizadoEm = null;
  let fonte = null;
  let baseados = null;

  if (temAjustes) {
    const indice = indiceDoMes(now.getFullYear(), now.getMonth() + 1);
    const dados = { base, overrides: local.overrides, extras: local.extras, sim: local.sim };
    black = totalDoMes(indice, dados);
    futuras = totalDoMes(indice + 1, dados);
    meta = local.profile && local.profile.meta != null ? num(local.profile.meta) : null;
    fonte = 'faturas';
    baseados = tamanhoBase(base);
  } else if (f) {
    black = num(f.faturaAtualReal != null ? f.faturaAtualReal : f.faturaAtualValor);
    meta = f.limiteMetaMensal != null ? num(f.limiteMetaMensal) : null;
    // "Próximo mês" tem que ser a fatura seguinte de verdade. O mapa por mês do
    // satélite é a melhor fonte disponível aqui; `faturasFuturasCompromissadas`
    // é só um escalar de emergência (já veio 1.568,05 quando a fatura era 1.793,36).
    futuras = proximaFaturaDoSatelite(f, now);
    atualizadoEm = f.atualizadoEm || null;
    fonte = 'matrix';
  } else if (doMes !== null) {
    black = doMes;
    fonte = 'scarlet';
  }

  return {
    black,
    // O cartão não é do Matheus: é pago pela Scarlet (mesmo sendo gasto do casal).
    matheus: null,
    scarlet: black,
    total: black,
    meta,
    pctMeta: meta && meta > 0 && black !== null ? Math.round((black / meta) * 100) : null,
    futuras,
    atualizadoEm,
    velho: fonte === 'faturas' ? false : fonte === 'matrix' ? stale(atualizadoEm, now) : fonte === 'scarlet' ? true : true,
    fonte,
    baseados
  };
}

/* -------------------------------------------------------------------------
 * TRABALHO (Atendimentos da Scarlet) — satélite > lançamentos locais.
 * ---------------------------------------------------------------------- */
function trabalho(sat, atendimentos, ym, now) {
  const ff = sat && sat.fisioflow;
  if (ff && ff.ganhosPorMes && (ff.mesAtualTotal || ff.ganhosPorMes[ym])) {
    const mes = ff.ganhosPorMes[ym] || {};
    return {
      fonte: 'matrix',
      recebido: num(mes.realizado != null ? mes.realizado : ff.mesAtualTotal),
      aReceber: num(mes.aReceber != null ? mes.aReceber : ff.mesAtualPrevisto),
      sessoes: num(mes.sessoes),
      pacientes: num(ff.pacientesAtivos),
      atualizadoEm: ff.atualizadoEm || null,
      velho: stale(ff.atualizadoEm, now)
    };
  }

  const entradas = arr(atendimentos).filter((e) => String(e.data || '').slice(0, 7) === ym);
  if (entradas.length) {
    const pago = entradas.filter((e) => /pago|recebido|paid/i.test(String(e.status || '')));
    return {
      fonte: 'atendimentos',
      recebido: round2(pago.reduce((a, e) => a + num(e.valor), 0)),
      aReceber: round2(entradas.filter((e) => !pago.includes(e)).reduce((a, e) => a + num(e.valor), 0)),
      sessoes: entradas.length,
      pacientes: null,
      atualizadoEm: null,
      velho: false
    };
  }

  return null;
}

/* -------------------------------------------------------------------------
 * Retrato completo
 * ---------------------------------------------------------------------- */
export function buildSnapshot(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date();
  const matrix = input.matrix || null;
  const maracaju = input.maracaju || null;
  const atendimentos = arr(input.atendimentos);

  const ym = ymKey(now);
  const label = monthLabel(now);
  const ano = now.getFullYear();

  const picked = matrix ? pickMonth(matrix, ano, label) : { month: null, ano: null, fallback: false };
  const month = picked.month;
  const sat = (matrix && matrix.satellites) || null;

  const receitas = arr(month && month.receitas).map((r) => ({
    nome: r.nome || 'Receita',
    valor: num(r.valor),
    categoria: r.categoria || '',
    conta: r.conta || '',
    beneficio: isBeneficio(r),
    pago: r.pago !== false
  }));

  const fixos = arr(month && month.fixos);
  const outros = arr(month && month.outros);
  const inicioAno = arr(month && month.inicioAno);

  const diarios = arr(month && month.diarios).filter(
    (d) => !d.jaAlocadoVariavel && !isContaBeneficio(d.conta)
  );

  const pag = resumoPagamento([...fixos, ...outros, ...inicioAno]);

  // Cada gasto recebe um dono antes de qualquer soma.
  const mapaRegras = indexarRegras(input.regras);
  const gastos = [
    ...fixos.map((it) => ({ it, tipo: 'conta' })),
    ...outros.map((it) => ({ it, tipo: 'conta' })),
    ...inicioAno.map((it) => ({ it, tipo: 'conta' })),
    ...diarios.map((it) => ({ it, tipo: 'diario' }))
  ].map(({ it, tipo }) => ({
    nome: it.nome || 'Gasto',
    valor: num(it.valor),
    tipo,
    conta: it.conta || '',
    categoria: it.categoria || '',
    pago: it.pago !== false,
    dono: resolverDono(it, tipo, mapaRegras)
  }));

  const porDono = { casa: 0, matheus: 0, scarlet: 0 };
  gastos.forEach((g) => {
    porDono[g.dono] = round2((porDono[g.dono] || 0) + g.valor);
  });

  const listaPorDono = (dono) =>
    gastos.filter((g) => g.dono === dono).sort((a, b) => b.valor - a.valor);

  const receitaPecunia = round2(receitas.filter((r) => !r.beneficio).reduce((a, r) => a + r.valor, 0));
  const receitaBeneficio = round2(receitas.filter((r) => r.beneficio).reduce((a, r) => a + r.valor, 0));
  const gastoDiario = soma(diarios);
  const gastoTotal = round2(pag.total + gastoDiario);

  const cartao = cartoes(sat, month, now, input.faturas || null, input.base || null);
  const beneficio = beneficios(sat, maracaju, now);
  const trab = trabalho(sat, atendimentos, ym, now);

  const scarletGanhos = trab
    ? trab.recebido + trab.aReceber
    : (month && month.scarlet ? num(month.scarlet.ganhos) : null);

  const avisos = [];
  if (!matrix) avisos.push('Matrix ainda não abriu neste navegador.');
  if (matrix && !month && !picked.fallback) avisos.push(`Sem lançamentos de ${label}/${ano}.`);
  if (picked.fallback) avisos.push(`Usando ${picked.ano} — não há ${label}/${ano} lançado.`);
  if (beneficio && beneficio.velho) avisos.push('Saldo de VA/VR desatualizado.');
  if (cartao && cartao.velho) avisos.push('Fatura desatualizada.');
  if (!trab) avisos.push('Atendimentos sem dados neste aparelho.');

  return {
    geradoEm: now.toISOString(),
    ym,
    periodo: { ano, mes: label, mesIndice: now.getMonth(), ym, anoDados: picked.ano, fallback: picked.fallback },
    fontes: {
      matrix: !!matrix,
      matrixMes: !!month,
      maracaju: !!(maracaju && maracaju.settings),
      atendimentos: atendimentos.length > 0
    },
    casa: {
      caixa: {
        receitas: receitaPecunia,
        receitasBeneficio: receitaBeneficio,
        gastosFixos: soma(fixos),
        gastosOutros: soma(outros),
        gastosInicioAno: soma(inicioAno),
        gastosDiarios: gastoDiario,
        gastosTotal: gastoTotal,
        gastosPorDono: porDono,
        saldo: round2(receitaPecunia - gastoTotal),
        pago: pag.pago,
        pendente: pag.pendente,
        qtdPendentes: pag.qtdPendentes,
        pctPago: pag.pctPago,
        maioresPendentes: pag.pendentes.slice(0, 4),
        pendentes: pag.pendentes
      },
      receitas,
      gastos: listaPorDono('casa'),
      cartoes: cartao,
      beneficios: beneficio,
      trabalho: trab
    },
    matheus: {
      receitas: receitas.filter((r) => !r.beneficio),
      totalReceitas: receitaPecunia,
      cartao: cartao.matheus,
      gastos: listaPorDono('matheus'),
      totalGastos: porDono.matheus,
      fixos: soma(fixos),
      outros: soma(outros),
      diarios: gastoDiario,
      saldo: round2(receitaPecunia - gastoTotal)
    },
    scarlet: {
      ganhos: scarletGanhos,
      recebido: trab ? trab.recebido : null,
      aReceber: trab ? trab.aReceber : null,
      sessoes: trab ? trab.sessoes : null,
      pacientes: trab ? trab.pacientes : null,
      cartao: cartao.scarlet,
      gastos: listaPorDono('scarlet'),
      totalGastos: porDono.scarlet,
      fonte: trab ? trab.fonte : null
    },
    avisos: [...new Set(avisos)]
  };
}

/* -------------------------------------------------------------------------
 * CONCILIAÇÃO CRUZADA
 * ---------------------------------------------------------------------------
 * O que nenhum dos quatro apps vê sozinho: mercado × VA/VR, fatura × receita,
 * fatura × sobra, e quem paga o quê.
 *
 * REGRA DE OURO: aqui se COMPARA, não se SOMA. A fatura não entra no caixa de
 * novo — se o Matrix já lançou pagamento de cartão, o achado avisa em vez de
 * somar. É a mesma trava "uma compra, uma soma" dos outros apps.
 * ---------------------------------------------------------------------- */
export const PESO_TOM = { risco: 3, atencao: 2, ok: 1, info: 0 };

function achado(id, tom, titulo, texto, valores) {
  return { id, tom, titulo, texto, valores: valores || {} };
}

const parecePagamentoDeCartao = (nome) => /fatura|cart[ãa]o|nubank|black|ourocard/i.test(String(nome || ''));

export function conciliar(s) {
  if (!s || !s.casa) return [];
  const saida = [];
  const caixa = s.casa.caixa;
  const b = s.casa.beneficios;
  const c = s.casa.cartoes;

  /* 1. Benefícios: estourou, no limite ou com folga */
  if (b) {
    const vaPct = b.vaTotal > 0 ? round2((b.vaGasto / b.vaTotal) * 100) : 0;
    const vrPct = b.vrTotal > 0 ? round2((b.vrGasto / b.vrTotal) * 100) : 0;
    const estouro = round2(Math.max(0, b.vaGasto - b.vaTotal) + Math.max(0, b.vrGasto - b.vrTotal));

    if (estouro > 0) {
      saida.push(
        achado(
          'beneficios',
          'risco',
          'O benefício estourou',
          '{estouro} passaram do VA/VR no ciclo {ciclo}. Esse excedente saiu do bolso — conta ou cartão.',
          { estouro, ciclo: b.ciclo || 'atual' }
        )
      );
    } else if (vaPct >= 90 || vrPct >= 90) {
      saida.push(
        achado(
          'beneficios',
          'atencao',
          'Benefício no limite',
          'VA em {vaPct} e VR em {vrPct}. Ainda restam {disponivel} até o fim do ciclo.',
          { vaPct, vrPct, disponivel: b.disponivel }
        )
      );
    } else {
      saida.push(
        achado(
          'beneficios',
          'ok',
          'Benefícios com folga',
          'Restam {disponivel} até o fim do ciclo (VA {vaPct}, VR {vrPct}).',
          { disponivel: b.disponivel, vaPct, vrPct }
        )
      );
    }
  }

  /* 2. Fatura × meta e × receitas */
  if (c && c.total !== null) {
    const razao = caixa.receitas > 0 ? c.total / caixa.receitas : null;
    if (c.meta !== null && c.pctMeta !== null && c.pctMeta > 100) {
      saida.push(
        achado(
          'cartoes',
          'risco',
          'Fatura acima da meta',
          '{acima} acima da meta de {meta} — {metaPct} da meta usada com a fatura em {total}.',
          { acima: round2(c.total - c.meta), meta: c.meta, metaPct: c.pctMeta, total: c.total }
        )
      );
    } else if (razao !== null && razao > 1) {
      saida.push(
        achado(
          'cartoes',
          'risco',
          'A fatura passa das receitas',
          'A fatura de {total} equivale a {razaoPct} das receitas de {receitas} deste mês.',
          { total: c.total, razaoPct: round2(razao * 100), receitas: caixa.receitas }
        )
      );
    } else if (razao !== null && razao > 0.7) {
      saida.push(
        achado(
          'cartoes',
          'atencao',
          'Fatura pesada no mês',
          'A fatura de {total} come {razaoPct} das receitas de {receitas}.',
          { total: c.total, razaoPct: round2(razao * 100), receitas: caixa.receitas }
        )
      );
    } else {
      saida.push(
        achado(
          'cartoes',
          'ok',
          'Fatura sob controle',
          'A fatura de {total} é {razaoPct} das receitas do mês.',
          { total: c.total, razaoPct: round2((razao || 0) * 100) }
        )
      );
    }
  }

  /* 3. Sobra × fatura — só quando o mês tem lançamento e sem pagamento duplicado */
  const todosGastos = [...(s.casa.gastos || []), ...(s.matheus.gastos || []), ...(s.scarlet.gastos || [])];
  const pagamentos = todosGastos.filter((g) => parecePagamentoDeCartao(g.nome));
  const somaPagamentos = round2(pagamentos.reduce((a, g) => a + g.valor, 0));

  if (caixa.receitas > 0 && c && c.total !== null) {
    if (pagamentos.length) {
      saida.push(
        achado(
          'duplicidade',
          'info',
          'A fatura já está no fluxo',
          'Encontrei {qtd} lançamento de cartão no mês ({soma}). Comparo com a fatura, mas não somo de novo.',
          { qtd: pagamentos.length, soma: somaPagamentos }
        )
      );
    } else if (caixa.saldo >= 0 && c.total > caixa.saldo) {
      saida.push(
        achado(
          'sobra',
          'risco',
          'A fatura come a sobra',
          'A fatura de {fatura} passa a sobra de {sobra} em {dif}.',
          { fatura: c.total, sobra: caixa.saldo, dif: round2(c.total - caixa.saldo) }
        )
      );
    } else if (caixa.saldo >= 0) {
      saida.push(
        achado(
          'sobra',
          'ok',
          'A sobra cobre a fatura',
          'Depois dos {fatura} de fatura, ainda restariam {dif} da sobra de {sobra}.',
          { fatura: c.total, sobra: caixa.saldo, dif: round2(caixa.saldo - c.total) }
        )
      );
    }
  }

  /* 4. Quem paga o quê */
  const totalGastos = caixa.gastosTotal;
  if (totalGastos > 0) {
    const pd = caixa.gastosPorDono;
    saida.push(
      achado(
        'divisao',
        'info',
        'Quem paga o quê',
        'Casa {casaPct} · Matheus {matheusPct} · Scarlet {scarletPct} dos {total} do mês.',
        {
          casaPct: Math.round((pd.casa / totalGastos) * 100),
          matheusPct: Math.round((pd.matheus / totalGastos) * 100),
          scarletPct: Math.round((pd.scarlet / totalGastos) * 100),
          total: totalGastos
        }
      )
    );
  }

  /* 5. Cartão da Scarlet × o que ela ganhou */
  const sc = s.scarlet || {};
  if (sc.cartao !== null && sc.cartao !== undefined && sc.ganhos > 0 && sc.cartao > sc.ganhos) {
    saida.push(
      achado(
        'scarlet',
        'atencao',
        'O cartão da Scarlet passa dos ganhos',
        'A fatura de {cartao} é {razaoPct} dos {ganhos} que ela ganhou no mês.',
        { cartao: sc.cartao, razaoPct: round2((sc.cartao / sc.ganhos) * 100), ganhos: sc.ganhos }
      )
    );
  }

  return saida
    .map((a, i) => ({ ...a, ordem: i }))
    .sort((a, b1) => PESO_TOM[b1.tom] - PESO_TOM[a.tom] || a.ordem - b1.ordem)
    .map(({ ordem, ...a }) => a);
}

/** Quantos achados pedem atenção (risco ou atenção). */
export function contarAlertas(achados) {
  return arr(achados).filter((a) => a.tom === 'risco' || a.tom === 'atencao').length;
}

/* -------------------------------------------------------------------------
 * ALERTAS DO DIA ("Hoje")
 * ---------------------------------------------------------------------------
 * Só usa o que tem DATA de verdade nos apps:
 *   - tarefas do lar  → Casa Maracaju `tasks` + `history[data][taskId]`
 *   - atendimentos    → Atendimentos `ft_local_schedules` (`data`, `hora`)
 *   - recarga VA/VR   → `creditDate` do satélite (4º dia útil)
 *   - contas paradas  → `pago: false` no mês do Matrix
 * Nada de inventar vencimento: o Matrix não guarda data de vencimento.
 * ---------------------------------------------------------------------- */
export const PESO_ALERTA = { atrasado: 0, hoje: 1, amanha: 2, proximo: 3, mes: 4 };

const pad2 = (n) => String(n).padStart(2, '0');

export function isoLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function somarDias(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Chave estável de uma conta para guardar o vencimento ("Caronas " → "caronas"). */
export function normalizarNomeConta(nome) {
  return normChave(nome);
}

/** Dia do mês de referência, ajustado ao último dia quando o mês é mais curto. */
export function dataNoMes(ref, dia) {
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const d = Math.min(Math.max(1, Math.trunc(Number(dia) || 1)), ultimo);
  return isoLocal(new Date(ano, mes, d));
}

function diferencaEmDias(isoA, isoB) {
  // Ambas "YYYY-MM-DD" no fuso local
  const [a1, m1, d1] = String(isoA).split('-').map(Number);
  const [a2, m2, d2] = String(isoB).split('-').map(Number);
  const A = new Date(a1, m1 - 1, d1);
  const B = new Date(a2, m2 - 1, d2);
  return Math.round((A - B) / 86400000);
}

const mesmoDia = (dataIso, alvo) => String(dataIso || '').slice(0, 10) === alvo;

export function alertas(snapshot, extras = {}) {
  const now = extras.now instanceof Date ? extras.now : new Date();
  const hoje = isoLocal(now);
  const amanha = isoLocal(somarDias(now, 1));
  const inicioSemana = isoLocal(somarDias(now, -6));
  const saida = [];

  const maracaju = extras.maracaju || {};
  const agenda = arr(extras.agenda);

  /* 1. Tarefas do lar ------------------------------------------------ */
  const tarefas = arr(maracaju.tasks);
  const historico = maracaju.history && typeof maracaju.history === 'object' ? maracaju.history : {};

  const feitasEm = (dataIso) => {
    const dia = historico[dataIso] || {};
    return Object.keys(dia).filter((id) => dia[id] && dia[id].done);
  };

  const feitasHoje = new Set(feitasEm(hoje));
  const feitasNaSemana = new Set();
  for (let i = 0; i <= 6; i++) {
    feitasEm(isoLocal(somarDias(now, -i))).forEach((id) => feitasNaSemana.add(id));
  }

  const diarias = tarefas.filter((t) => String(t.frequency || '').toLowerCase() === 'diaria');
  const pendentesHoje = diarias.filter((t) => !feitasHoje.has(t.id));
  const semanais = tarefas.filter((t) => String(t.frequency || '').toLowerCase() === 'semanal');
  const pendentesSemana = semanais.filter((t) => !feitasNaSemana.has(t.id));

  if (pendentesHoje.length) {
    saida.push({
      id: 'tarefas-hoje',
      tipo: 'tarefa',
      quando: 'hoje',
      titulo: `${pendentesHoje.length} ${pendentesHoje.length === 1 ? 'tarefa do lar' : 'tarefas do lar'} hoje`,
      texto: '{nomes}',
      valores: { nomes: pendentesHoje.map((t) => t.title).slice(0, 3).join(' · ') }
    });
  }

  if (pendentesSemana.length) {
    saida.push({
      id: 'tarefas-semana',
      tipo: 'tarefa',
      quando: 'atrasado',
      titulo: `${pendentesSemana.length} ${pendentesSemana.length === 1 ? 'tarefa semanal' : 'tarefas semanais'} sem fazer há 7 dias`,
      texto: '{nomes}',
      valores: { nomes: pendentesSemana.map((t) => t.title).slice(0, 3).join(' · ') }
    });
  }

  /* 2. Atendimentos da Scarlet --------------------------------------- */
  const ativos = agenda.filter(
    (a) => a && a.data && !/cancelad/i.test(String(a.status || ''))
  );
  const porHora = (a, b) => String(a.hora || '').localeCompare(String(b.hora || ''));

  const deHoje = ativos.filter((a) => mesmoDia(a.data, hoje)).sort(porHora);
  const deAmanha = ativos.filter((a) => mesmoDia(a.data, amanha)).sort(porHora);

  const resumoAgenda = (lista) =>
    lista
      .slice(0, 3)
      .map((a) => `${a.hora || '--:--'} ${a.pacienteNome || 'paciente'}`)
      .join(' · ');

  if (deHoje.length) {
    saida.push({
      id: 'atendimentos-hoje',
      tipo: 'atendimento',
      quando: 'hoje',
      titulo: `${deHoje.length} ${deHoje.length === 1 ? 'atendimento' : 'atendimentos'} hoje`,
      texto: '{lista}',
      valores: { lista: resumoAgenda(deHoje) }
    });
  }

  if (deAmanha.length) {
    saida.push({
      id: 'atendimentos-amanha',
      tipo: 'atendimento',
      quando: 'amanha',
      titulo: `${deAmanha.length} ${deAmanha.length === 1 ? 'atendimento' : 'atendimentos'} amanhã`,
      texto: '{lista}',
      valores: { lista: resumoAgenda(deAmanha) }
    });
  }

  /* 3. Recarga de VA/VR ---------------------------------------------- */
  const ben = snapshot && snapshot.casa && snapshot.casa.beneficios;
  if (ben && ben.creditDate && /^\d{4}-\d{2}-\d{2}/.test(ben.creditDate)) {
    const data = String(ben.creditDate).slice(0, 10);
    const dias = diferencaEmDias(data, hoje);
    if (dias > 0 && dias <= 7) {
      saida.push({
        id: 'recarga-beneficio',
        tipo: 'beneficio',
        quando: 'proximo',
        titulo: `VA/VR cai em ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
        texto: '{valor} entram no cartão no dia {data}.',
        valores: { valor: round2((ben.vaTotal || 0) + (ben.vrTotal || 0)), data: data.slice(8, 10) + '/' + data.slice(5, 7) }
      });
    }
  }

  /* 4. Contas paradas no mês ----------------------------------------- */
  const caixa = (snapshot && snapshot.casa && snapshot.casa.caixa) || null;

  /* 4a. Vencimentos informados à mão (o Matrix não guarda data) -------- */
  const vencimentos = extras.vencimentos && typeof extras.vencimentos === 'object' ? extras.vencimentos : {};
  const diaDe = (nome) => {
    const r = vencimentos[normalizarNomeConta(nome)];
    const n = Number(r);
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
  };

  const comPrazo = arr(caixa && caixa.pendentes)
    .map((p) => {
      const dia = diaDe(p.nome);
      if (!dia) return null;
      const data = dataNoMes(now, dia);
      return {
        nome: p.nome,
        valor: num(p.valor),
        dia,
        data,
        dias: diferencaEmDias(data, hoje)
      };
    })
    .filter(Boolean);

  const vencidas = comPrazo.filter((c) => c.dias < 0);
  const vencendo = comPrazo.filter((c) => c.dias >= 0 && c.dias <= 3);

  if (vencidas.length) {
    const total = round2(vencidas.reduce((a, c) => a + c.valor, 0));
    const maisAntiga = vencidas.reduce((a, c) => (c.dias < a.dias ? c : a), vencidas[0]);
    saida.push({
      id: 'contas-vencidas',
      tipo: 'conta',
      quando: 'atrasado',
      titulo: `${vencidas.length} ${vencidas.length === 1 ? 'conta vencida' : 'contas vencidas'}`,
      texto: '{valor} em aberto — {nomes}. A mais antiga venceu em {data}.',
      valores: {
        valor: total,
        nomes: vencidas.map((c) => c.nome).slice(0, 3).join(' · '),
        data: maisAntiga.data.slice(8, 10) + '/' + maisAntiga.data.slice(5, 7)
      }
    });
  }

  if (vencendo.length) {
    const hojeMesmo = vencendo.filter((c) => c.dias === 0);
    const proximas = vencendo.filter((c) => c.dias > 0);
    if (hojeMesmo.length) {
      saida.push({
        id: 'contas-hoje',
        tipo: 'conta',
        quando: 'hoje',
        titulo: `${hojeMesmo.length} ${hojeMesmo.length === 1 ? 'conta vence' : 'contas vencem'} hoje`,
        texto: '{nomes} · {valor}.',
        valores: {
          nomes: hojeMesmo.map((c) => c.nome).slice(0, 3).join(' · '),
          valor: round2(hojeMesmo.reduce((a, c) => a + c.valor, 0))
        }
      });
    }
    if (proximas.length) {
      const menor = proximas.reduce((a, c) => (c.dias < a.dias ? c : a), proximas[0]);
      saida.push({
        id: 'contas-proximas',
        tipo: 'conta',
        quando: menor.dias === 1 ? 'amanha' : 'proximo',
        titulo: `${proximas.length} ${proximas.length === 1 ? 'conta vence' : 'contas vencem'} em até 3 dias`,
        texto: '{nomes} · {valor}. A próxima é {data}.',
        valores: {
          nomes: proximas.map((c) => c.nome).slice(0, 3).join(' · '),
          valor: round2(proximas.reduce((a, c) => a + c.valor, 0)),
          data: menor.data.slice(8, 10) + '/' + menor.data.slice(5, 7)
        }
      });
    }
  }

  /* 4b. Contas sem prazo informado ----------------------------------- */
  const semPrazo = arr(caixa && caixa.pendentes).filter((p) => !diaDe(p.nome));
  if (caixa && semPrazo.length > 0) {
    const nomes = semPrazo.map((p) => p.nome).slice(0, 3).join(' · ');
    saida.push({
      id: 'contas-pendentes',
      tipo: 'conta',
      quando: 'mes',
      titulo: `${semPrazo.length} ${semPrazo.length === 1 ? 'conta' : 'contas'} a pagar (sem prazo)`,
      texto: '{valor} pendentes — {nomes}. Informe o dia em Vencimentos.',
      valores: { valor: round2(semPrazo.reduce((a, p) => a + num(p.valor), 0)), nomes }
    });
  }

  const ordem = (q) => (PESO_ALERTA[q] !== undefined ? PESO_ALERTA[q] : 9);
  return saida
    .map((a, i) => ({ ...a, i }))
    .sort((a, b) => ordem(a.quando) - ordem(b.quando) || a.i - b.i)
    .map(({ i, ...a }) => a);
}
