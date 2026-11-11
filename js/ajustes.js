/**
 * Nexo · ajustes.js
 * ---------------------------------------------------------------------------
 * Exporta e importa os AJUSTES do Nexo (regras de dono + privacidade) em JSON.
 *
 * Por que existe: `nexo_regras` e a preferência de privacidade vivem no
 * localStorage de cada aparelho. Sem backend, a única forma honesta de levar
 * isso para o celular é um arquivo que o usuário carrega.
 *
 * Tudo puro: valida e normaliza sem tocar em DOM ou storage.
 */

import { DONOS } from './core.js';

export const VERSAO_AJUSTES = 1;
export const TIPOS_REGRA = ['nome', 'categoria', 'conta'];

const normalizarTexto = (v) => String(v == null ? '' : v).trim();

/** Regra só é válida com dono conhecido, tipo conhecido e chave não vazia. */
export function regraValida(r) {
  if (!r || typeof r !== 'object') return false;
  if (!DONOS.includes(r.dono)) return false;
  if (!TIPOS_REGRA.includes(r.tipo)) return false;
  return normalizarTexto(r.chave).length > 0;
}

/** Remove inválidas, tira duplicatas (tipo+chave) e mantém a última escolhida. */
export function normalizarRegras(regras) {
  const mapa = new Map();
  (Array.isArray(regras) ? regras : []).forEach((r) => {
    if (!regraValida(r)) return;
    const chave = `${r.tipo}::${normalizarTexto(r.chave).toLowerCase()}`;
    const regra = { tipo: r.tipo, chave: normalizarTexto(r.chave), dono: r.dono };
    // `em` é a marca de quando a escolha foi feita: sem ela a mescla entre
    // aparelhos não tem como decidir qual versão é a mais nova.
    if (typeof r.em === 'string' && r.em.trim()) regra.em = r.em.trim();
    mapa.set(chave, regra);
  });
  return [...mapa.values()];
}

export function serializarAjustes({ regras, privacidade } = {}, agora = new Date()) {
  return JSON.stringify(
    {
      app: 'nexo',
      versao: VERSAO_AJUSTES,
      geradoEm: agora.toISOString(),
      privacidade: privacidade === true,
      regras: normalizarRegras(regras)
    },
    null,
    2
  );
}

/**
 * Lê um JSON exportado. Nunca lança: devolve `{ ok, erro }`.
 * Versão futura é recusada em vez de aplicada pela metade.
 */
export function lerAjustes(texto) {
  let dados;
  try {
    dados = JSON.parse(String(texto || ''));
  } catch {
    return { ok: false, erro: 'Arquivo não é um JSON válido.' };
  }

  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { ok: false, erro: 'O arquivo não parece um backup do Nexo.' };
  }
  if (dados.app !== 'nexo') {
    return { ok: false, erro: 'Este arquivo não é do Nexo.' };
  }

  const versao = Number(dados.versao);
  if (!Number.isFinite(versao) || versao < 1) {
    return { ok: false, erro: 'Backup sem versão reconhecida.' };
  }
  if (versao > VERSAO_AJUSTES) {
    return { ok: false, erro: `Backup da versão ${versao}; este Nexo entende até a ${VERSAO_AJUSTES}.` };
  }

  const regras = normalizarRegras(dados.regras);
  const descartadas = (Array.isArray(dados.regras) ? dados.regras.length : 0) - regras.length;

  return {
    ok: true,
    regras,
    privacidade: dados.privacidade === true,
    descartadas,
    geradoEm: dados.geradoEm || null
  };
}

/** Nome de arquivo estável e ordenável. */
export function nomeArquivo(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `nexo-ajustes-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}.json`;
}
