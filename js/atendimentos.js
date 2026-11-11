/**
 * Nexo · atendimentos da Scarlet (fonte remota)
 * ---------------------------------------------------------------------------
 * O Nexo lia só `ft_local_entries` — que existe apenas no navegador onde o app
 * dela foi aberto. Em outro aparelho a área ficava vazia ("sem dados neste
 * aparelho"). Aqui normalizamos a resposta do Apps Script dela (JSONP) para o
 * mesmo formato que o `core.js` já entende, e decidimos quando vale ir à nuvem.
 *
 * Só leitura: o Nexo nunca escreve na planilha dela.
 */

/** Endpoint público do app da Scarlet (o mesmo que o Matrix consome). */
export const URL_ATENDIMENTOS =
  'https://script.google.com/macros/s/AKfycbz9uHQZiq_eNMs7pA4_uiI_qLxcrkG7BuW_ThjLt7yRh7cBuHT3Pg8B2nIn402JrlO7Vw/exec';

/** Onde o retrato remoto fica guardado (chave do próprio Nexo). */
export const CHAVE_CACHE = 'atend_cache';

/** Idade máxima antes de buscar de novo. */
export const VALIDADE_HORAS = 6;

const PAGO = /pago|recebido|paid|quitad/i;

/** "R$ 1.234,50" | "1234.5" | 1234.5 → 1234.5 */
export function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor == null ? '' : valor).replace(/[^\d.,-]/g, '');
  if (!texto) return 0;
  const normalizado =
    texto.includes(',') && texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** Data da planilha → "AAAA-MM-DD" (aceita ISO, "31/12/2026" e Date). */
export function dia(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${d}`;
  }
  const texto = String(valor == null ? '' : valor).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return '';
}

/**
 * Resposta do `doGet` → lançamentos e agenda no formato do core.
 * Entrada: `{ atendimentos: [...], agendamentos: [...] }`.
 */
export function normalizar(resposta, agora = new Date()) {
  const atendimentos = Array.isArray(resposta && resposta.atendimentos) ? resposta.atendimentos : [];
  const agendamentos = Array.isArray(resposta && resposta.agendamentos) ? resposta.agendamentos : [];

  const entradas = atendimentos
    .map((a) => {
      const data = dia(a && (a.Data || a.data));
      const status = String((a && (a.Status || a.status)) || '');
      return {
        id: String((a && (a.ID || a.id)) || ''),
        data,
        hora: String((a && (a.Hora || a.hora)) || ''),
        valor: numero(a && (a.Valor != null ? a.Valor : a.valor)),
        status,
        paciente: String((a && (a.Paciente || a.paciente)) || ''),
        pago: PAGO.test(status) || !!(a && a.DataPagamento)
      };
    })
    .filter((e) => e.data);

  const agenda = agendamentos
    .map((g) => ({
      id: String((g && (g.ID || g.id)) || ''),
      data: dia(g && (g.Data || g.data)),
      hora: String((g && (g.Hora || g.hora)) || ''),
      duracao: numero(g && (g.DuracaoMin || g.duracao)),
      valor: numero(g && (g.Valor != null ? g.Valor : g.valor)),
      status: String((g && (g.Status || g.status)) || ''),
      paciente: String((g && (g.PacienteNome || g.Paciente || g.paciente)) || '')
    }))
    .filter((g) => g.data);

  return {
    entradas,
    agenda,
    atualizadoEm: agora.toISOString(),
    totais: { atendimentos: entradas.length, agendamentos: agenda.length }
  };
}

/** O cache está velho (ou ausente) e vale tentar a nuvem? */
export function precisaBuscar({ cacheEm, agora = new Date(), validadeHoras = VALIDADE_HORAS } = {}) {
  if (!cacheEm) return true;
  const quando = Date.parse(cacheEm);
  if (!Number.isFinite(quando)) return true;
  return agora.getTime() - quando > validadeHoras * 3600 * 1000;
}
