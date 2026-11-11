/**
 * Nexo · sync.js
 * ---------------------------------------------------------------------------
 * Sincronização dos AJUSTES (regras de dono) com o Apps Script do Nexo.
 *
 * O que viaja: só as regras de dono. Privacidade é preferência de cada
 * aparelho e não é aplicada a partir da nuvem.
 *
 * Estratégia de rede (mesma dos outros apps da casa):
 *   - leitura por JSONP (o Apps Script não manda CORS);
 *   - escrita por POST `no-cors` (a resposta é opaca), confirmada por uma
 *     leitura seguinte que devolve a revisão gravada.
 *   - conflito por revisão: se a planilha mudou entre ler e gravar, o servidor
 *     devolve `conflict` e o cliente mescla em vez de sobrescrever.
 *
 * As funções puras (URL, mescla, comparação) são testáveis no Node.
 */

import { normalizarRegras, regraValida } from './ajustes.js';

export const CHAVE_URL = 'nexo_sync_url';
export const CHAVE_TOKEN = 'nexo_sync_token';
export const CHAVE_REVISAO = 'nexo_sync_revisao';

export function normalizarUrl(valor) {
  return String(valor == null ? '' : valor).trim().replace(/\/+$/, '');
}

/** Só aceita a URL de implantação do Apps Script (`/exec`). */
export function urlValida(valor) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(normalizarUrl(valor));
}

const chaveRegra = (r) => `${r.tipo}::${String(r.chave || '').trim().toLowerCase()}`;

const emMs = (r) => {
  const t = Date.parse((r && r.em) || '');
  return Number.isFinite(t) ? t : null;
};

/**
 * União por (tipo, chave). Quando os dois lados têm a mesma regra, vence a
 * mais recente pelo campo `em`; sem timestamp de um lado, vence a remota
 * (a nuvem é a versão compartilhada).
 */
export function mesclarRegras(locais, remotas) {
  const mapa = new Map();

  normalizarRegras(locais).forEach((r) => mapa.set(chaveRegra(r), { ...r, _origem: 'local' }));
  normalizarRegras(remotas).forEach((r) => {
    const k = chaveRegra(r);
    const local = mapa.get(k);
    if (!local) {
      mapa.set(k, { ...r, _origem: 'remota' });
      return;
    }
    const a = emMs(local);
    const b = emMs(r);
    const vencedor = a !== null && b !== null ? (b >= a ? r : local) : a !== null && b === null ? local : r;
    mapa.set(k, { ...vencedor, _origem: 'mesclada' });
  });

  return [...mapa.values()].map(({ _origem, ...r }) => r);
}

export function mesmasRegras(a, b) {
  const ka = normalizarRegras(a).map(chaveRegra).sort();
  const kb = normalizarRegras(b).map(chaveRegra).sort();
  if (ka.length !== kb.length) return false;
  if (ka.some((k, i) => k !== kb[i])) return false;
  const da = new Map(normalizarRegras(a).map((r) => [chaveRegra(r), r.dono]));
  const db = new Map(normalizarRegras(b).map((r) => [chaveRegra(r), r.dono]));
  return ka.every((k) => da.get(k) === db.get(k));
}

/** Valida o que veio da nuvem antes de usar. */
export function validarRemoto(dados) {
  if (!dados || typeof dados !== 'object') return null;
  const regras = normalizarRegras(dados.regras);
  const revisao = Number.isFinite(Number(dados.revisao)) ? Number(dados.revisao) : 0;
  return {
    regras: regras.filter(regraValida),
    revisao,
    salvoEm: dados.salvoEm || null
  };
}

/* ----------------------------------------------------------------- rede */

/** GET por JSONP — funciona sem CORS. */
export function puxar(url, token, timeout = 9000) {
  const alvo = normalizarUrl(url);
  return new Promise((resolve, reject) => {
    if (!urlValida(alvo)) {
      reject(new Error('URL do Apps Script inválida.'));
      return;
    }
    const nome = `__nexo_cb_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
    const script = document.createElement('script');
    let encerrado = false;

    const limpar = () => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(temporizador);
      try { delete window[nome]; } catch { window[nome] = undefined; }
      script.remove();
    };

    const temporizador = setTimeout(() => {
      limpar();
      reject(new Error('A planilha não respondeu.'));
    }, timeout);

    window[nome] = (resposta) => {
      limpar();
      if (!resposta || resposta.status !== 'ok') {
        reject(new Error((resposta && resposta.message) || 'Resposta inválida da planilha.'));
        return;
      }
      resolve(validarRemoto(resposta.data));
    };

    script.onerror = () => {
      limpar();
      reject(new Error('Não consegui falar com a planilha.'));
    };

    script.src = `${alvo}?action=load&token=${encodeURIComponent(token)}&callback=${nome}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

/** POST no-cors; a confirmação vem da leitura seguinte. */
export async function enviar(url, token, regras, baseRevisao) {
  const alvo = normalizarUrl(url);
  await fetch(alvo, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'save', token, regras, baseRevisao })
  });
  return puxar(alvo, token);
}

/**
 * Ciclo completo: lê, mescla, grava (se preciso) e confirma.
 * Devolve `{ regras, revisao, enviado, mudouLocal }`.
 */
export async function sincronizar({ url, token, regras }) {
  const remoto = await puxar(url, token);
  const mescladas = mesclarRegras(regras, remoto.regras);
  const mudouLocal = !mesmasRegras(mescladas, regras);

  if (mesmasRegras(mescladas, remoto.regras)) {
    return { regras: mescladas, revisao: remoto.revisao, enviado: false, mudouLocal };
  }

  const depois = await enviar(url, token, mescladas, remoto.revisao);
  // Se o servidor recusou por conflito, ele devolveu o estado novo: mescla de novo.
  const finais = mesmasRegras(mescladas, depois.regras) ? mescladas : mesclarRegras(mescladas, depois.regras);
  return { regras: finais, revisao: depois.revisao, enviado: true, mudouLocal: !mesmasRegras(finais, regras) };
}
