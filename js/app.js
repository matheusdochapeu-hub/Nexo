/**
 * Nexo · app.js
 * Renderização do shell. Lê o snapshot de core.js via store.js.
 * Nenhuma escrita no estado dos outros apps.
 */

import { lerTudo, lerContexto, lerPreferencia, salvarPreferencia, definirDono, definirVencimento, limparRegras, lerBruto, lerRegras, aplicarAjustes } from './store.js';
import { DONO_LABEL, proximoDono, conciliar, contarAlertas, buildSnapshot, alertas, normalizarNomeConta } from './core.js';
import { serializarAjustes, lerAjustes, nomeArquivo } from './ajustes.js';
import { normalizarUrl, urlValida, sincronizar } from './sync.js';
import { deveMostrarBotao, emModoApp, CHAVE_INSTALADO } from './instalar.js';
import { construirIndice, buscar, agrupar, resumo } from './search.js';
import { APPS, urlDoApp, VERSION } from './config.js';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const INTEIRO = new Intl.NumberFormat('pt-BR');

const VIEWS = [
  { id: 'casa', nome: 'Casa', emoji: '🏡' },
  { id: 'matheus', nome: 'Matheus', emoji: '🧑🏻' },
  { id: 'scarlet', nome: 'Scarlet', emoji: '👩🏻' }
];

let snapshot = null;
let viewAtual = 'casa';
let estadoHoje = [];
let estadoVenc = {};

/* ------------------------------------------------------------------ utils */
const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function money(v, opcoes = {}) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) {
    return '<span class="nx-money" title="Sem dado">—</span>';
  }
  const classe = opcoes.cor ? ` ${v < 0 ? 'nx-neg' : 'nx-pos'}` : '';
  return `<span class="nx-money${classe}">${BRL.format(Number(v))}</span>`;
}

function pct(v) {
  return Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : '—';
}

function pctHtml(v, alerta = 100) {
  if (!Number.isFinite(Number(v))) return '—';
  const cor = Number(v) > alerta ? ' nx-neg' : '';
  return `<span class="nx-money${cor}">${pct(v)}</span>`;
}

function qtd(v, singular, plural) {
  if (!Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  return `${INTEIRO.format(n)} ${n === 1 ? singular : plural}`;
}

/** "1 gasto atribuído" / "4 gastos atribuídos" — concordância certa. */
function qtdGastos(n) {
  const total = Number(n) || 0;
  return total === 1 ? '1 gasto atribuído' : `${INTEIRO.format(total)} gastos atribuídos`;
}

function desde(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.round((Date.now() - t) / 6e4);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

function kpi(rotulo, valorHtml, dica, classe) {
  return `<div class="nx-kpi">
    <p class="nx-kpi-label">${esc(rotulo)}</p>
    <div class="nx-kpi-val${classe ? ` ${classe}` : ''}">${valorHtml}</div>
    ${dica ? `<div class="nx-kpi-hint">${dica}</div>` : ''}
  </div>`;
}

/** Número principal do cartão: ocupa a linha toda, sozinho. */
function heroKpi(rotulo, valorHtml, dica) {
  return `<div class="nx-hero-kpi">
    <p class="nx-kpi-label">${esc(rotulo)}</p>
    <div class="nx-kpi-val">${valorHtml}</div>
    ${dica ? `<div class="nx-kpi-hint">${dica}</div>` : ''}
  </div>`;
}

function lista(itens, mapa) {
  if (!itens || !itens.length) {
    return '<p class="nx-card-sub">Nada aqui neste mês.</p>';
  }
  const linhas = itens.map((it) => {
    const { nome, valor, nota } = mapa(it);
    return `<li class="nx-row">
      <span class="nx-row-nome">${esc(nome)}</span>
      ${nota ? `<span class="nx-row-note">${esc(nota)}</span>` : ''}
      <span class="nx-row-val">${money(valor)}</span>
    </li>`;
  });
  return `<ul class="nx-list">${linhas.join('')}</ul>`;
}

function barra(rotulo, valorTexto, percentual, tom) {
  const p = Number.isFinite(Number(percentual)) ? Math.max(0, Math.min(100, Number(percentual))) : 0;
  const cor = tom === 'bad' ? ' nx-bar-fill--bad' : tom === 'warn' ? ' nx-bar-fill--warn' : '';
  return `<div class="nx-bar-row">
    <div class="nx-bar-top"><span>${esc(rotulo)}</span><b>${valorTexto}</b></div>
    <div class="nx-bar" role="img" aria-label="${esc(rotulo)}: ${p}%"><div class="nx-bar-fill${cor}" style="width:${p}%"></div></div>
  </div>`;
}

function chip(texto, tom) {
  return `<span class="nx-chip${tom ? ` nx-chip--${tom}` : ''}"><span class="nx-dot${tom ? ` nx-dot--${tom}` : ''}"></span>${esc(texto)}</span>`;
}

/**
 * Lista de gastos com dono. Cada linha é um botão: tocar alterna
 * Casa → Matheus → Scarlet e a escolha vale para os próximos meses.
 */
function listaGastos(itens) {
  if (!itens || !itens.length) {
    return '<p class="nx-card-sub">Nenhum gasto com este dono neste mês.</p>';
  }
  const linhas = itens.map((g) => {
    const dono = g.dono || 'casa';
    return `<li>
      <button class="nx-row nx-row--btn" type="button" data-nome="${esc(g.nome)}" data-tipo="${esc(g.tipo)}" data-dono="${esc(dono)}"
              title="Toque para trocar de quem é este gasto" aria-label="${esc(g.nome)}, ${moneyTexto(g.valor)}, de ${esc(DONO_LABEL[dono] || dono)}. Toque para trocar.">
        <span class="nx-row-nome">${esc(g.nome)}</span>
        <span class="nx-dono nx-dono--${esc(dono)}">${esc(DONO_LABEL[dono] || dono)}</span>
        <span class="nx-row-val">${money(g.valor)}</span>
      </button>
    </li>`;
  });
  return `<ul class="nx-list">${linhas.join('')}</ul>`;
}

function moneyTexto(v) {
  return Number.isFinite(Number(v)) ? BRL.format(Number(v)) : 'sem valor';
}

/* ---------------------------------------------------- vencimentos */
function listaVencimentos(pendentes, vencimentos) {
  if (!pendentes || !pendentes.length) {
    return '<p class="nx-card-sub">Nenhuma conta em aberto neste mês.</p>';
  }
  return `<ul class="nx-list">${pendentes
    .map((p) => {
      const dia = vencimentos[normalizarNomeConta(p.nome)] || '';
      return `<li class="nx-row nx-row--venc">
        <span class="nx-row-nome">${esc(p.nome)}</span>
        <input class="nx-input nx-input--dia" type="number" min="1" max="31" inputmode="numeric"
               value="${esc(dia)}" placeholder="dia" data-venc="${esc(p.nome)}"
               aria-label="Dia de vencimento de ${esc(p.nome)}">
        <span class="nx-row-val">${money(p.valor)}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

/* ------------------------------------------------------- conciliação */
const TOM_DOT = { risco: 'bad', atencao: 'warn', ok: 'ok', info: '' };

/**
 * Texto do achado com os valores já formatados.
 * Convenção: chave terminada em `Pct` vira porcentagem; número vira R$.
 */
function textoAchado(a) {
  return esc(a.texto).replace(/\{(\w+)\}/g, (bruto, chave) => {
    const v = a.valores ? a.valores[chave] : undefined;
    if (v === undefined || v === null) return bruto;
    if (/Pct$/.test(chave)) {
      return `<span class="nx-money">${Math.round(Number(v))}%</span>`;
    }
    if (typeof v === 'number') {
      return `<span class="nx-money">${moneyTexto(v)}</span>`;
    }
    return esc(String(v));
  });
}

function listaAchados(achados) {
  return `<ul class="nx-achados">${achados
    .map(
      (a) => `<li class="nx-achado nx-achado--${esc(a.tom)}">
        <span class="nx-dot${TOM_DOT[a.tom] ? ` nx-dot--${TOM_DOT[a.tom]}` : ''}"></span>
        <div class="nx-achado-txt">
          <strong>${esc(a.titulo)}</strong>
          <p>${textoAchado(a)}</p>
        </div>
      </li>`
    )
    .join('')}</ul>`;
}

function card(titulo, subtitulo, corpo, opcoes = {}) {
  const classes = ['nx-card'];
  if (opcoes.hero) classes.push('nx-card--hero');
  if (opcoes.largo) classes.push('nx-card--largo');
  return `<section class="${classes.join(' ')}">
    <div class="nx-card-head">
      <div>
        <h2 class="nx-card-title">${esc(titulo)}</h2>
        ${subtitulo ? `<p class="nx-card-sub">${subtitulo}</p>` : ''}
      </div>
      ${opcoes.chip || ''}
    </div>
    ${corpo}
  </section>`;
}

/* ------------------------------------------------------------ hoje */
const ICONE_TIPO = { tarefa: '🧹', atendimento: '🩺', beneficio: '💳', conta: '💰' };
const TOM_QUANDO = { atrasado: 'risco', hoje: 'atencao', amanha: 'ok', proximo: 'ok', mes: 'info' };

function dataLonga(d) {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function listaHoje(itens) {
  if (!itens.length) {
    return '<p class="nx-card-sub">Nada pendente para hoje. Bom sinal.</p>';
  }
  return `<ul class="nx-achados">${itens
    .map(
      (a) => `<li class="nx-achado nx-achado--${TOM_QUANDO[a.quando] || 'info'}">
        <span class="nx-hoje-icone" aria-hidden="true">${ICONE_TIPO[a.tipo] || '•'}</span>
        <div class="nx-achado-txt">
          <strong>${esc(a.titulo)}</strong>
          <p>${textoAchado(a)}</p>
        </div>
      </li>`
    )
    .join('')}</ul>`;
}

/* ------------------------------------------------------------------ views */
function viewCasa(s) {
  const c = s.casa.caixa;
  const cart = s.casa.cartoes;
  const ben = s.casa.beneficios;
  const trab = s.casa.trabalho;
  const pecas = [];
  const achados = conciliar(s);
  const alertas = contarAlertas(achados);

  const atrasadosHoje = estadoHoje.filter((a) => a.quando === 'atrasado').length;
  const chipHoje = atrasadosHoje
    ? chip(`${atrasadosHoje} atrasado${atrasadosHoje === 1 ? '' : 's'}`, 'bad')
    : estadoHoje.length
      ? chip(`${estadoHoje.length} ${estadoHoje.length === 1 ? 'item' : 'itens'}`, 'warn')
      : chip('em dia', 'ok');

  pecas.push(card('Hoje', dataLonga(new Date()), listaHoje(estadoHoje), { chip: chipHoje, largo: true }));

  const tomSaldo = c.saldo < 0 ? 'bad' : c.saldo < 200 ? 'warn' : 'ok';
  const pendentesTxt = c.qtdPendentes > 0
    ? `${qtd(c.qtdPendentes, 'conta', 'contas')} a pagar · ${money(c.pendente)}`
    : 'Tudo pago neste mês';

  pecas.push(card(
    'Caixa do mês',
    `${esc(s.periodo.mes)} de ${s.periodo.ano}`,
    `<div class="nx-hero-bloco">
      ${heroKpi('Sobra do mês', money(c.saldo, { cor: true }), pendentesTxt)}
      <div class="nx-kpis">
        ${kpi('Receitas', money(c.receitas), 'em conta')}
        ${kpi('Gastos', money(c.gastosTotal), 'fixos + variáveis + diários')}
      </div>
    </div>
    ${barra('Contas pagas', `${pct(c.pctPago)} · ${money(c.pago)} de ${money(c.pago + c.pendente)}`, c.pctPago, c.pctPago >= 80 ? '' : 'warn')}
    ${c.maioresPendentes.length
      ? `<div>${lista(c.maioresPendentes, (p) => ({ nome: p.nome, valor: p.valor, nota: 'a pagar' }))}</div>`
      : ''}`,
    { hero: true, chip: chip(tomSaldo === 'ok' ? 'no azul' : tomSaldo === 'warn' ? 'atenção' : 'negativo', tomSaldo) }
  ));

  if (achados.length) {
    pecas.push(card(
      'Conciliação',
      'Cruzando o que cada app vê sozinho',
      `${listaAchados(achados)}
       <p class="nx-card-sub">Aqui eu comparo os quatro apps — a fatura não entra no caixa duas vezes.</p>`,
      { chip: alertas ? chip(`${alertas} ${alertas === 1 ? 'alerta' : 'alertas'}`, 'warn') : chip('tudo certo', 'ok'), largo: true }
    ));
  }

  pecas.push(card(
    'Cartão',
    'Nubank Black · pago pela Scarlet',
    `<div class="nx-kpis">
      ${kpi('Fatura atual', money(cart.black), 'Black')}
      ${kpi('Uso da meta', pctHtml(cart.pctMeta), cart.meta ? `meta ${money(cart.meta)}` : 'sem meta')}
    </div>
    ${cart.meta ? barra('Meta mensal', `${pct(cart.pctMeta)} de ${money(cart.meta)}`, cart.pctMeta, (cart.pctMeta || 0) > 100 ? 'bad' : (cart.pctMeta || 0) > 85 ? 'warn' : '') : ''}
    ${lista(
      [
        { nome: 'Nubank Black (gasto do casal)', valor: cart.black },
        { nome: 'Próximo mês', valor: cart.futuras }
      ],
      (r) => r
    )}`,
    { chip: cart.velho ? chip('desatualizado', 'warn') : cart.fonte === 'faturas' ? chip('via Faturas', 'ok') : (cart.black !== null ? chip(desde(cart.atualizadoEm) || 'sem hora', 'ok') : '') }
  ));

  if (ben) {
    pecas.push(card(
      'Benefícios',
      ben.ciclo ? `Ciclo ${esc(ben.ciclo)}` : 'VA e VR',
      `<div class="nx-kpis">
        ${kpi('Disponível', money(ben.disponivel), 'VA + VR restante')}
        ${kpi('Mercado no ciclo', money(ben.mercado), 'VA consumido')}
      </div>
      ${barra('VA', `${money(ben.vaSaldo)} de ${money(ben.vaTotal)}`, ben.pctVa, ben.pctVa < 25 ? 'warn' : '')}
      ${barra('VR', `${money(ben.vrSaldo)} de ${money(ben.vrTotal)}`, ben.pctVr, ben.pctVr < 25 ? 'warn' : '')}`,
      { chip: ben.velho ? chip('desatualizado', 'warn') : chip(ben.fonte === 'matrix' ? 'via Matrix' : 'via Casa Maracaju', 'ok') }
    ));
  }

  if (trab) {
    const base = trab.recebido + trab.aReceber;
    pecas.push(card(
      'Trabalho da Scarlet',
      'Atendimentos do mês',
      `<div class="nx-kpis">
        ${kpi('Total do mês', money(base), qtd(trab.sessoes, 'sessão', 'sessões'))}
        ${kpi('Recebido', money(trab.recebido), 'já em caixa')}
      </div>
      <ul class="nx-list">
        <li class="nx-row">
          <span class="nx-row-nome">A receber${trab.pacientes ? ` · ${INTEIRO.format(trab.pacientes)} pacientes` : ''}</span>
          <span class="nx-row-val">${money(trab.aReceber)}</span>
        </li>
      </ul>`,
      { chip: trab.velho ? chip('desatualizado', 'warn') : chip(trab.fonte === 'matrix' ? 'via Matrix' : 'via app dela', 'ok') }
    ));
  }

  pecas.push(card(
    'Gastos da casa',
    `${qtd(s.casa.gastos.length, 'conta', 'contas')} · ${money(s.casa.caixa.gastosPorDono.casa)}`,
    `${listaGastos(s.casa.gastos)}
     <p class="nx-card-sub">Toque em um gasto para trocar de dono. Errou?
       <button class="nx-link" type="button" data-acao="limpar-regras">Reverter tudo</button></p>`,
    { largo: true }
  ));

  if (c.pendentes && c.pendentes.length) {
    pecas.push(card(
      'Vencimentos',
      'Dia de cada conta em aberto',
      `${listaVencimentos(c.pendentes, estadoVenc)}
       <p class="nx-card-sub">O Matrix não guarda vencimento. O dia que você informar aqui vira aviso no "Hoje".</p>`,
      { largo: true }
    ));
  }

  if (!ben) {
    pecas.push(card(
      'Benefícios',
      'VA e VR',
      `<p class="nx-card-sub">Abra o <strong>Casa Maracaju</strong> uma vez neste navegador para o saldo de VA/VR aparecer aqui.</p>`
    ));
  }

  if (!trab) {
    pecas.push(card(
      'Trabalho da Scarlet',
      'Atendimentos do mês',
      `<p class="nx-card-sub">Abra o <strong>Atendimentos</strong> uma vez neste navegador, ou o Matrix (que puxa esses dados), para ver os ganhos dela.</p>`
    ));
  }

  return `<div class="nx-grid">${pecas.join('')}</div>`;
}

function viewMatheus(s) {
  const m = s.matheus;
  const cart = s.casa.cartoes;
  const pecas = [];

  pecas.push(card(
    'Seu mês',
    `${esc(s.periodo.mes)} de ${s.periodo.ano}`,
    `<div class="nx-hero-bloco">
      ${heroKpi('Seus gastos', money(m.totalGastos), `de ${money(s.casa.caixa.gastosTotal)} na casa`)}
      <div class="nx-kpis">
        ${kpi('Receitas', money(m.totalReceitas), 'o que entra')}
        ${kpi('Gastos do dia', money(m.diarios), 'débito e cartões')}
      </div>
    </div>`,
    { hero: true }
  ));

  pecas.push(card(
    'Seus lançamentos',
    `${qtdGastos(m.gastos.length)} a você`,
    `${listaGastos(m.gastos)}
     <p class="nx-card-sub">Toque em um gasto para trocar de dono — a escolha vale para os próximos meses.</p>`
  ));

  pecas.push(card(
    'Suas receitas',
    `${m.receitas.length ? qtd(m.receitas.length, 'lançamento', 'lançamentos') : 'nenhum lançamento'}`,
    lista(m.receitas, (r) => ({
      nome: r.nome,
      valor: r.valor,
      nota: r.pago ? '' : 'previsto'
    }))
  ));

  return `<div class="nx-grid">${pecas.join('')}</div>`;
}

function viewScarlet(s) {
  const sc = s.scarlet;
  const temDados = sc.ganhos !== null || sc.cartao !== null;
  const pecas = [];

  pecas.push(card(
    'Seu mês',
    `${esc(s.periodo.mes)} de ${s.periodo.ano}`,
    `<div class="nx-hero-bloco">
      ${heroKpi('Ganhos', money(sc.ganhos), sc.fonte === 'matrix' ? 'via Matrix' : 'atendimentos')}
      <div class="nx-kpis">
        ${kpi('Recebido', money(sc.recebido), 'já em caixa')}
        ${kpi('A receber', money(sc.aReceber), 'pendente')}
      </div>
    </div>`,
    { hero: true }
  ));

  pecas.push(card(
    'Atendimentos',
    'Seu volume do mês',
    `<div class="nx-kpis">
      ${kpi('Sessões', sc.sessoes === null ? '—' : INTEIRO.format(sc.sessoes), 'neste mês')}
      ${kpi('Pacientes', sc.pacientes === null ? '—' : INTEIRO.format(sc.pacientes), 'ativos')}
    </div>
    <ul class="nx-list">
      <li class="nx-row">
        <span class="nx-row-nome">Ticket médio</span>
        <span class="nx-row-val">${sc.sessoes && sc.ganhos ? money(sc.ganhos / sc.sessoes) : '—'}</span>
      </li>
    </ul>`
  ));

  pecas.push(card(
    'Seu cartão',
    'Nubank Black · o gasto é do casal, a fatura é sua',
    `<div class="nx-kpis">
      ${kpi('Fatura', money(sc.cartao), 'a pagar')}
      ${kpi('Renda comprometida', sc.cartao && sc.ganhos ? pctHtml((sc.cartao / sc.ganhos) * 100, 50) : '—', 'da fatura sobre os ganhos')}
    </div>`
  ));

  pecas.push(card(
    'Seus gastos',
    `${qtdGastos(sc.gastos.length)} a você`,
    `<div class="nx-kpis">
      ${kpi('Total', money(sc.totalGastos), 'no mês')}
    </div>
    ${listaGastos(sc.gastos)}
    <p class="nx-card-sub">Toque em um gasto para trocar de dono.</p>`
  ));

  if (!temDados) {
    pecas.push(`<p class="nx-note" style="grid-column:1/-1">
      Abra o <strong>Atendimentos</strong> neste navegador para os seus números aparecerem.
      O Nexo só lê — nada do seu app é alterado.
    </p>`);
  }

  return `<div class="nx-grid">${pecas.join('')}</div>`;
}

function viewVazia(s) {
  return `<div class="nx-grid"><div class="nx-empty">
    <h2>Ainda não há dados neste navegador</h2>
    <p>
      O Nexo não guarda cópia de nada: ele lê o que os quatro apps já gravam neste mesmo
      endereço. Abra um deles uma vez e volte aqui.
    </p>
    <div class="nx-empty-acoes">
      <a class="nx-btn nx-btn--primario" href="${esc(urlDoApp(APPS[0]))}">Abrir o Matrix</a>
      <a class="nx-btn" href="${esc(urlDoApp(APPS[1]))}">Casa Maracaju</a>
      <a class="nx-btn" href="${esc(urlDoApp(APPS[2]))}">Faturas</a>
      <a class="nx-btn" href="${esc(urlDoApp(APPS[3]))}">Atendimentos</a>
    </div>
  </div></div>`;
}

/* -------------------------------------------------------------- lançador */
function launcher(s) {
  const status = {
    matrix: s.fontes.matrix ? ['ok', 'lido'] : ['', 'não aberto'],
    maracaju: s.casa.beneficios ? ['ok', 'lido'] : ['', 'não aberto'],
    faturas: s.casa.cartoes.black !== null ? ['ok', 'lido'] : ['', 'não aberto'],
    atendimentos: s.casa.trabalho ? ['ok', 'lido'] : ['', 'não aberto']
  };

  return APPS.map((app) => {
    const [tom, texto] = status[app.id] || ['', ''];
    const inicial = app.nome.charAt(0);
    return `<a class="nx-dock-item" href="${esc(urlDoApp(app))}" title="${esc(app.papel)} · ${esc(texto)}">
      <span class="nx-dock-icone" style="background:${esc(app.cor)}" aria-hidden="true">${esc(inicial)}</span>
      <span class="nx-dock-nome">${esc(app.nome)}</span>
      <span class="nx-dot${tom ? ` nx-dot--${tom}` : ''}" aria-hidden="true"></span>
      <span class="nx-sr">${esc(texto)}</span>
    </a>`;
  }).join('');
}

/* ------------------------------------------------------------------ busca */
let indiceBusca = null;

function indice() {
  if (!indiceBusca) indiceBusca = construirIndice(lerBruto());
  return indiceBusca;
}

function linhaResultado(d) {
  const app = APPS.find((a) => a.id === d.app);
  return `<li><a class="nx-row nx-row--link" href="${esc(urlDoApp(app))}">
    <span class="nx-row-nome">${esc(d.nome)}<span class="nx-row-contexto">${esc(resumo(d))}</span></span>
    ${d.valor === null || d.valor === undefined ? '' : `<span class="nx-row-val">${money(d.valor)}</span>`}
  </a></li>`;
}

function renderBusca(consulta) {
  const alvo = $('#busca-resultados');
  const ajuda = $('#busca-ajuda');
  if (!alvo || !ajuda) return;

  const q = String(consulta || '').trim();
  if (q.length < 2) {
    alvo.innerHTML = '';
    ajuda.textContent = 'Digite ao menos 2 letras, um valor (921,85) ou um mês.';
    return;
  }

  const r = buscar(indice(), q, { limite: 60 });

  if (!r.total) {
    alvo.innerHTML = `<p class="nx-busca-vazio">Nada encontrado para <strong>${esc(q)}</strong>.</p>`;
    ajuda.textContent = 'Tente parte do nome, um mês ou o valor exato.';
    return;
  }

  const grupos = agrupar(r.itens);
  ajuda.textContent = `${r.total} ${r.total === 1 ? 'resultado' : 'resultados'} em ${grupos.length} ${grupos.length === 1 ? 'app' : 'apps'}`;

  alvo.innerHTML =
    grupos
      .map(
        (g) => `<section class="nx-busca-grupo">
        <h3 class="nx-busca-grupo-titulo">${esc(g.titulo)}<span class="nx-busca-conta">${g.itens.length}</span></h3>
        <ul class="nx-list">${g.itens.map(linhaResultado).join('')}</ul>
      </section>`
      )
      .join('') + (r.total > r.itens.length ? `<p class="nx-busca-mais">Mostrando ${r.itens.length} de ${r.total}.</p>` : '');
}

function abrirBusca() {
  const painel = $('#busca');
  if (!painel || !painel.hidden) return;
  indiceBusca = construirIndice(lerBruto());
  painel.hidden = false;
  document.body.classList.add('nx-travado');
  const input = $('#busca-input');
  input.value = '';
  renderBusca('');
  requestAnimationFrame(() => input.focus());
}

function fecharBusca() {
  const painel = $('#busca');
  if (!painel || painel.hidden) return;
  painel.hidden = true;
  document.body.classList.remove('nx-travado');
  $('#btn-busca')?.focus();
}

/* --------------------------------------------------------------- ajustes */
function renderAjustes() {
  const alvo = $('#ajustes');
  if (!alvo) return;
  const regras = lerRegras();
  alvo.innerHTML = `
    <span class="nx-ajustes-rotulo">Ajustes${regras.length ? ` · ${regras.length} ${regras.length === 1 ? 'regra' : 'regras'}` : ''}</span>
    <button class="nx-btn nx-btn--mini" type="button" data-ajuste="exportar">Exportar</button>
    <button class="nx-btn nx-btn--mini" type="button" data-ajuste="importar">Importar</button>
    <button class="nx-btn nx-btn--mini" type="button" data-ajuste="reverter"${regras.length ? '' : ' disabled'}>Reverter</button>
    <input id="aj-arquivo" type="file" accept="application/json,.json" hidden>
    <span class="nx-ajustes-nota" id="aj-nota"></span>`;
}

function avisoAjuste(msg) {
  const nota = $('#aj-nota');
  if (nota) nota.textContent = msg;
}

function exportarAjustes() {
  const texto = serializarAjustes({
    regras: lerRegras(),
    privacidade: document.body.dataset.privado === '1'
  });
  const blob = new Blob([texto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  avisoAjuste('Arquivo de ajustes baixado.');
}

function aplicarPrivacidade(ativo) {
  const valor = ativo === true;
  document.body.dataset.privado = valor ? '1' : '0';
  const botao = $('#btn-privacidade');
  if (!botao) return;
  botao.setAttribute('aria-pressed', String(valor));
  botao.title = valor ? 'Mostrar valores' : 'Esconder valores';
}

/* ---------------------------------------------------------- instalar app */
let promptInstalacao = null;

function atualizarBotaoInstalar() {
  const barra = $('#instalar');
  if (!barra) return;
  barra.hidden = !deveMostrarBotao({
    emModoApp: emModoApp(window),
    marcadoInstalado: lerPreferencia(CHAVE_INSTALADO, false) === true,
    temPrompt: !!promptInstalacao
  });
}

/** Esconde a barra; `marcar` grava que já foi instalado neste navegador. */
function esconderInstalar(marcar) {
  if (marcar) salvarPreferencia(CHAVE_INSTALADO, true);
  const barra = $('#instalar');
  if (barra) barra.hidden = true;
  promptInstalacao = null;
}

/* ------------------------------------------------------------------ shell */
function render() {
  const ctx = lerContexto();
  const agora = new Date();
  snapshot = buildSnapshot({
    matrix: ctx.matrix,
    maracaju: ctx.maracaju,
    atendimentos: ctx.atendimentos,
    faturas: ctx.faturas,
    regras: ctx.regras,
    now: agora
  });
  estadoHoje = alertas(snapshot, {
    maracaju: ctx.maracaju,
    agenda: ctx.agenda,
    vencimentos: ctx.vencimentos,
    now: agora
  });
  estadoVenc = ctx.vencimentos || {};
  indiceBusca = null; // dado novo = índice novo na próxima busca

  const semNada = !snapshot.fontes.matrix && !snapshot.fontes.atendimentos && !snapshot.casa.beneficios;
  $('#periodo').textContent = `${snapshot.periodo.mes} de ${snapshot.periodo.ano}`;

  const corpo = semNada
    ? viewVazia(snapshot)
    : viewAtual === 'casa'
      ? viewCasa(snapshot)
      : viewAtual === 'matheus'
        ? viewMatheus(snapshot)
        : viewScarlet(snapshot);

  $('#view').innerHTML = corpo;
  $('#launcher').innerHTML = launcher(snapshot);
  renderAjustes();

  const aviso = snapshot.avisos[0];
  if (aviso) {
    $('#avisos').innerHTML = `<p class="nx-note">${esc(aviso)}</p>`;
    $('#avisos').hidden = false;
  } else {
    $('#avisos').hidden = true;
    $('#avisos').innerHTML = '';
  }

  $('#rodape-fontes').innerHTML = [
    snapshot.fontes.matrix ? 'Matrix' : null,
    snapshot.casa.beneficios ? 'Casa Maracaju' : null,
    snapshot.casa.cartoes.total !== null ? 'Faturas' : null,
    snapshot.casa.trabalho ? 'Atendimentos' : null
  ].filter(Boolean).map((n) => `<strong>${esc(n)}</strong>`).join(' · ') || 'sem fonte lida';

  atualizarAbas();
}

function atualizarAbas() {
  document.querySelectorAll('.nx-tab').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.view === viewAtual));
    btn.tabIndex = btn.dataset.view === viewAtual ? 0 : -1;
  });
}

function trocarView(id, opts = {}) {
  if (!VIEWS.some((v) => v.id === id)) return;
  viewAtual = id;
  if (opts.hash !== false) {
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* file:// pode bloquear history */
    }
  }
  render();
  if (opts.foco) document.querySelector(`.nx-tab[data-view="${id}"]`)?.focus();
}

/* --------------------------------------------------------------- ligações */
function iniciar() {
  const nav = $('#tabs');
  nav.innerHTML = VIEWS.map(
    (v) => `<button class="nx-tab" role="tab" data-view="${v.id}"
      aria-controls="view" aria-selected="false" tabindex="-1">
      <span class="nx-tab-emoji" aria-hidden="true">${v.emoji}</span>${esc(v.nome)}
    </button>`
  ).join('');

  const daHash = (location.hash || '').replace('#', '');
  viewAtual = VIEWS.some((v) => v.id === daHash) ? daHash : 'casa';

  nav.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.nx-tab');
    if (btn) trocarView(btn.dataset.view);
  });

  nav.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const i = VIEWS.findIndex((v) => v.id === viewAtual);
    let alvo = i;
    if (ev.key === 'ArrowLeft') alvo = (i - 1 + VIEWS.length) % VIEWS.length;
    if (ev.key === 'ArrowRight') alvo = (i + 1) % VIEWS.length;
    if (ev.key === 'Home') alvo = 0;
    if (ev.key === 'End') alvo = VIEWS.length - 1;
    trocarView(VIEWS[alvo].id, { foco: true });
  });

  $('#btn-privacidade').addEventListener('click', () => {
    const novo = document.body.dataset.privado !== '1';
    aplicarPrivacidade(novo);
    salvarPreferencia('privacidade', novo);
  });

  $('#btn-atualizar').addEventListener('click', () => {
    render();
    const btn = $('#btn-atualizar');
    btn.classList.add('is-ok');
    setTimeout(() => btn.classList.remove('is-ok'), 600);
  });

  /* Vencimentos: digitar o dia e sair do campo já salva. */
  $('#view').addEventListener('change', (ev) => {
    const campo = ev.target.closest('[data-venc]');
    if (!campo) return;
    const nome = campo.dataset.venc;
    definirVencimento(nome, campo.value);
    render();
    const mesmo = [...document.querySelectorAll('[data-venc]')].find((el) => el.dataset.venc === nome);
    mesmo?.focus();
  });

  /* Atribuição por pessoa: tocar num gasto troca o dono e a escolha fica salva. */
  $('#view').addEventListener('click', (ev) => {
    const reverter = ev.target.closest('[data-acao="limpar-regras"]');
    if (reverter) {
      limparRegras();
      render();
      return;
    }

    const linha = ev.target.closest('.nx-row--btn');
    if (!linha) return;

    const { nome, tipo, dono } = linha.dataset;
    definirDono(nome, tipo, proximoDono(dono));
    render();

    const mesmo = [...document.querySelectorAll('.nx-row--btn')].find(
      (b) => b.dataset.nome === nome && b.dataset.tipo === tipo
    );
    (mesmo || document.querySelector(`.nx-tab[data-view="${viewAtual}"]`))?.focus();
  });

  /* Baixar o app: só aparece se o navegador oferecer instalação */
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    promptInstalacao = ev;
    atualizarBotaoInstalar();
  });

  window.addEventListener('appinstalled', () => esconderInstalar(true));

  $('#btn-instalar')?.addEventListener('click', async () => {
    if (!promptInstalacao) {
      esconderInstalar(false);
      return;
    }
    try {
      promptInstalacao.prompt();
      const escolha = await promptInstalacao.userChoice;
      if (escolha && escolha.outcome === 'accepted') {
        esconderInstalar(true);
      } else {
        promptInstalacao = null; // o evento só pode ser usado uma vez
        atualizarBotaoInstalar();
      }
    } catch {
      promptInstalacao = null;
      atualizarBotaoInstalar();
    }
  });

  atualizarBotaoInstalar();

  /* Busca global manual */
  $('#btn-busca')?.addEventListener('click', abrirBusca);
  $('#busca-fechar')?.addEventListener('click', fecharBusca);
  document.querySelector('[data-fechar-busca]')?.addEventListener('click', fecharBusca);
  $('#busca-input')?.addEventListener('input', (ev) => renderBusca(ev.target.value));

  document.addEventListener('keydown', (ev) => {
    const painel = $('#busca');
    if (painel && !painel.hidden && ev.key === 'Escape') {
      ev.preventDefault();
      fecharBusca();
      return;
    }
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement && document.activeElement.tagName) || '');
    const atalho = (ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey);
    if (atalho || (ev.key === '/' && !digitando && !ev.metaKey && !ev.ctrlKey && !ev.altKey)) {
      ev.preventDefault();
      abrirBusca();
    }
  });

  const privacidade = lerPreferencia('privacidade', false);
  if (privacidade) aplicarPrivacidade(true);

  /* Nuvem: URL + token ficam neste aparelho e nunca entram no backup */
  const syncUrl = $('#sync-url');
  const syncToken = $('#sync-token');
  const syncNota = (msg) => {
    const el = $('#sync-nota');
    if (el) el.textContent = msg;
  };
  if (syncUrl) syncUrl.value = lerPreferencia('sync_url', '');
  if (syncToken) syncToken.value = lerPreferencia('sync_token', '');

  $('#sync-btn')?.addEventListener('click', async () => {
    const url = normalizarUrl(syncUrl ? syncUrl.value : '');
    const token = syncToken ? syncToken.value.trim() : '';

    if (!urlValida(url)) {
      syncNota('URL inválida. Cole a URL /exec da implantação do Apps Script.');
      return;
    }
    if (!token) {
      syncNota('Informe o token configurado nas Propriedades do script.');
      return;
    }

    salvarPreferencia('sync_url', url);
    salvarPreferencia('sync_token', token);
    syncNota('Sincronizando…');

    try {
      const r = await sincronizar({ url, token, regras: lerRegras() });
      aplicarAjustes({ regras: r.regras });
      render();
      syncNota(
        `Sincronizado · ${r.regras.length} ${r.regras.length === 1 ? 'regra' : 'regras'} · revisão ${r.revisao}` +
          (r.enviado ? ' · enviado' : ' · nada a enviar')
      );
    } catch (erro) {
      syncNota(erro && erro.message ? erro.message : 'Não consegui sincronizar.');
    }
  });

  /* Ajustes: exportar, importar e reverter (o bloco é recriado a cada render) */
  $('#ajustes').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-ajuste]');
    if (!btn || btn.disabled) return;
    const acao = btn.dataset.ajuste;

    if (acao === 'exportar') {
      exportarAjustes();
      return;
    }
    if (acao === 'importar') {
      $('#aj-arquivo')?.click();
      return;
    }
    if (acao === 'reverter') {
      limparRegras();
      render();
      avisoAjuste('Atribuições revertidas ao padrão.');
    }
  });

  $('#ajustes').addEventListener('change', async (ev) => {
    if (ev.target.id !== 'aj-arquivo') return;
    const arquivo = ev.target.files && ev.target.files[0];
    if (!arquivo) return;
    try {
      const lido = lerAjustes(await arquivo.text());
      if (!lido.ok) {
        avisoAjuste(lido.erro);
        return;
      }
      aplicarAjustes(lido);
      aplicarPrivacidade(lido.privacidade);
      render();
      avisoAjuste(
        `Importados ${lido.regras.length} ${lido.regras.length === 1 ? 'ajuste' : 'ajustes'}` +
          (lido.descartadas ? ` · ${lido.descartadas} descartado${lido.descartadas === 1 ? '' : 's'}` : '') +
          '.'
      );
    } catch {
      avisoAjuste('Não consegui ler o arquivo.');
    }
  });

  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace('#', '');
    if (id && id !== viewAtual) trocarView(id, { hash: false });
  });

  /* Voltar para o Nexo com dados novos: re-renderiza ao ganhar foco. */
  window.addEventListener('focus', () => render());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });

  $('#versao').textContent = `v${VERSION}`;
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
        /* dev em file:// ou http sem HTTPS: ignora */
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
