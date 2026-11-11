/**
 * Nexo · store.js
 * ---------------------------------------------------------------------------
 * Ponte com o localStorage compartilhado da origem.
 *
 * IMPORTANTE: o Nexo é SOMENTE LEITURA. Nenhum setItem acontece aqui —
 * exceto a preferência de privacidade, que é do próprio Nexo (`nexo_*`).
 *
 * Os quatro apps rodam em `matheusdochapeu-hub.github.io` (caminhos
 * diferentes, mesma origem), então o localStorage é o mesmo. O Nexo lê
 * as chaves que cada app já grava, sem pedir nada a ninguém.
 */

import { safeParse, buildSnapshot, arr, normalizarNomeConta } from './core.js';
import { CHAVE_CACHE as CHAVE_ATEND_CACHE } from './atendimentos.js';

export const CHAVES = {
  matrix: 'MATRIX_FINANCE_STATE_v2',
  maracaju: 'MARACAJU_STATE_v1',
  maracajuLegado: 'MARACAJU88_STATE_v1',
  atendimentos: 'ft_local_entries',
  agenda: 'ft_local_schedules'
};

function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function lerMatrix() {
  return safeParse(ler(CHAVES.matrix));
}

export function lerMaracaju() {
  return safeParse(ler(CHAVES.maracaju)) || safeParse(ler(CHAVES.maracajuLegado));
}

export function lerAtendimentos() {
  const local = arr(safeParse(ler(CHAVES.atendimentos)));
  if (local.length) return local;
  const cache = lerPreferencia(CHAVE_ATEND_CACHE, null);
  return cache && Array.isArray(cache.entradas) ? cache.entradas : [];
}

/** Agenda da Scarlet: `ft_local_schedules` (array com data/hora/status). */
export function lerAgenda() {
  const local = arr(safeParse(ler(CHAVES.agenda)));
  if (local.length) return local;
  const cache = lerPreferencia(CHAVE_ATEND_CACHE, null);
  return cache && Array.isArray(cache.agenda) ? cache.agenda : [];
}

/** Ajustes que o app Faturas grava (overrides de item, extras, simulações, perfil). */
export const PV4 = {
  over: 'pv4_over',
  extra: 'pv4_extra',
  sim: 'pv4_sim',
  profile: 'pv4_profile'
};

export function lerFaturasLocal() {
  const overrides = safeParse(ler(PV4.over));
  const extras = safeParse(ler(PV4.extra));
  const sim = safeParse(ler(PV4.sim));
  const profile = safeParse(ler(PV4.profile));
  return {
    overrides: overrides && !Array.isArray(overrides) ? overrides : {},
    extras: Array.isArray(extras) ? extras : [],
    sim: Array.isArray(sim) ? sim : [],
    profile: profile && !Array.isArray(profile) ? profile : {}
  };
}

/** Uma leitura só de todos os estados brutos (evita parse duplicado por render). */
export function lerContexto() {
  return {
    matrix: lerMatrix(),
    maracaju: lerMaracaju(),
    atendimentos: lerAtendimentos(),
    agenda: lerAgenda(),
    faturas: lerFaturasLocal(),
    vencimentos: lerVencimentos(),
    regras: lerRegras()
  };
}

/** Retrato normalizado, pronto para a tela. */
export function lerTudo(agora = new Date()) {
  return buildSnapshot({
    matrix: lerMatrix(),
    maracaju: lerMaracaju(),
    atendimentos: lerAtendimentos(),
    faturas: lerFaturasLocal(),
    regras: lerRegras(),
    now: agora
  });
}

/** Estados brutos, para o índice de busca. */
export function lerBruto() {
  return {
    matrix: lerMatrix(),
    maracaju: lerMaracaju(),
    atendimentos: lerAtendimentos()
  };
}

/* -------------------------------------------------------------------------
 * Atribuições (quem é o dono de cada gasto) — vivem só no Nexo.
 * Chave: `nexo_regras`. Formato: [{ tipo: 'nome', chave, dono }].
 * ---------------------------------------------------------------------- */
export function lerRegras() {
  const r = lerPreferencia('regras', []);
  return Array.isArray(r) ? r : [];
}

export function definirDono(nome, tipo, dono) {
  const chave = String(nome || '').trim();
  if (!chave || !dono) return lerRegras();
  const atuais = lerRegras().filter(
    (r) => !(r && r.tipo === tipo && String(r.chave || '').toLowerCase() === chave.toLowerCase())
  );
  atuais.push({ tipo: tipo || 'nome', chave, dono, em: new Date().toISOString() });
  salvarPreferencia('regras', atuais);
  return atuais;
}

export function limparRegras() {
  salvarPreferencia('regras', []);
  return [];
}

/** Aplica um backup de ajustes (regras + privacidade). */
export function aplicarAjustes({ regras, privacidade } = {}) {
  salvarPreferencia('regras', Array.isArray(regras) ? regras : []);
  if (typeof privacidade === 'boolean') salvarPreferencia('privacidade', privacidade);
}

/* -------------------------------------------------------------------------
 * Vencimentos informados à mão — o Matrix só guarda `pago: true/false`.
 * Chave `nexo_vencimentos`: { "<nome normalizado>": diaDoMês (1..31) }.
 * ---------------------------------------------------------------------- */
export function lerVencimentos() {
  const mapa = lerPreferencia('vencimentos', {});
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return {};
  const saida = {};
  Object.keys(mapa).forEach((k) => {
    const dia = Number(mapa[k]);
    if (Number.isFinite(dia) && dia >= 1 && dia <= 31) saida[k] = Math.trunc(dia);
  });
  return saida;
}

/** `dia` vazio/0 remove o vencimento daquela conta. */
export function definirVencimento(nome, dia) {
  const chave = normalizarNomeConta(nome);
  if (!chave) return lerVencimentos();
  const atuais = lerVencimentos();
  const n = Number(dia);
  if (!Number.isFinite(n) || n < 1 || n > 31) {
    delete atuais[chave];
  } else {
    atuais[chave] = Math.trunc(n);
  }
  salvarPreferencia('vencimentos', atuais);
  return atuais;
}

/* Preferências do próprio Nexo (namespace separado — não colide com os apps) */
export function lerPreferencia(chave, fallback = null) {
  try {
    const raw = localStorage.getItem(`nexo_${chave}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function salvarPreferencia(chave, valor) {
  try {
    localStorage.setItem(`nexo_${chave}`, JSON.stringify(valor));
  } catch {
    /* modo privado / cota cheia: preferência não persiste, tela continua */
  }
}
