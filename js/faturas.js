/**
 * Nexo · faturas.js
 * ---------------------------------------------------------------------------
 * Recalcula as faturas a partir da LISTA CANÔNICA (`shared/faturas-base.js`)
 * + os ajustes que o app Faturas grava no localStorage (`pv4_over`, `pv4_extra`).
 *
 * Por que isso existe: o Matrix mantém uma CÓPIA dos itens (90 de 91, com um
 * valor 2 centavos diferente). Ler do dono elimina a divergência sem tocar
 * em nenhum app. O Nexo é o primeiro consumidor da lista canônica.
 *
 * Regras replicadas do app Faturas:
 *   - índice 0 = Set/2026 (âncora), 1 = Out/2026, 2 = Nov/2026 …
 *   - item entra no mês se `de <= índice <= ate`
 *   - override por item é `"<nome>__<índice>"`; valor -1 = apagado
 *   - `extras` têm `{desc|d, val|valor, de, ate}`
 *   - `sim` ({d,v,de,ate}) só entra se `incluirSimulados`
 *
 * Puro: sem DOM, sem localStorage, sem rede.
 */

import { BASE_FATURAS } from '../shared/faturas-base.js';

/** 0 = Set/2026 (mesma âncora do app Faturas e do conector do Matrix). */
export const ANCORA = { ano: 2026, mes: 9 };

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function indiceDoMes(ano, mes) {
  return (Number(ano) - ANCORA.ano) * 12 + (Number(mes) - ANCORA.mes);
}

export function mesDoIndice(indice) {
  const total = ANCORA.mes - 1 + Number(indice);
  return {
    ano: ANCORA.ano + Math.floor(total / 12),
    mes: (((total % 12) + 12) % 12) + 1
  };
}

export function rotuloMes(indice) {
  const { ano, mes } = mesDoIndice(indice);
  return `${MESES_CURTOS[mes - 1]} ${ano}`;
}

export function chaveOverride(nome, indice) {
  return `${nome}__${indice}`;
}

const numero = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Itens de um mês. `dados` aceita `{ base, overrides, extras, sim, incluirSimulados }`.
 * A base só é substituível para teste.
 */
export function itensDoMes(indice, dados = {}) {
  const idx = Number(indice);
  if (!Number.isFinite(idx)) return [];

  const base = Array.isArray(dados.base) ? dados.base : BASE_FATURAS;
  const overrides = dados.overrides || {};
  const extras = Array.isArray(dados.extras) ? dados.extras : [];
  const sim = Array.isArray(dados.sim) ? dados.sim : [];
  const saida = [];

  base.forEach((it) => {
    if (!it || idx < Number(it.de) || idx > Number(it.ate)) return;
    const chave = chaveOverride(it.d, idx);
    const valor = Object.prototype.hasOwnProperty.call(overrides, chave)
      ? numero(overrides[chave])
      : numero(it.v);
    if (valor >= 0) saida.push({ desc: it.d, valor, origem: 'base' });
  });

  extras.forEach((ex) => {
    if (!ex) return;
    const de = parseInt(ex.de, 10);
    const ate = parseInt(ex.ate, 10);
    if (!(idx >= de && idx <= ate)) return;
    saida.push({
      desc: ex.desc || ex.d || 'Gasto do cartão',
      valor: numero(ex.val != null ? ex.val : ex.valor != null ? ex.valor : ex.v),
      origem: 'extra'
    });
  });

  if (dados.incluirSimulados) {
    sim.forEach((s) => {
      if (!s) return;
      const de = parseInt(s.de, 10);
      const ate = parseInt(s.ate, 10);
      if (!(idx >= de && idx <= ate)) return;
      saida.push({
        desc: `(Simulado) ${s.d || 'Simulação'}`,
        valor: numero(s.v != null ? s.v : s.val),
        origem: 'sim'
      });
    });
  }

  return saida;
}

export function totalDoMes(indice, dados = {}) {
  const total = itensDoMes(indice, dados).reduce((a, it) => a + it.valor, 0);
  return Math.round(total * 100) / 100;
}

/** Só para diagnóstico: quantos itens a lista canônica tem. */
export function tamanhoBase(base = BASE_FATURAS) {
  return Array.isArray(base) ? base.length : 0;
}
