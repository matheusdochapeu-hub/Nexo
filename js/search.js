/**
 * Nexo · search.js
 * ---------------------------------------------------------------------------
 * Índice e busca MANUAL sobre os quatro apps. Sem bot, sem servidor, sem rede:
 * o usuário digita e o Nexo filtra o que já está no navegador.
 *
 * Puro (sem DOM/localStorage) — recebe os estados brutos e devolve resultados.
 */

import { normChave, num, arr } from './core.js';

export const APP_LABEL = {
  matrix: 'Matrix',
  faturas: 'Faturas',
  atendimentos: 'Atendimentos',
  maracaju: 'Casa Maracaju'
};

/** Ordem em que os grupos aparecem nos resultados. */
export const APP_ORDEM = ['casa', 'matrix', 'faturas', 'atendimentos', 'maracaju'];

const MESES_CURTOS = {
  janeiro: 'Jan', fevereiro: 'Fev', marco: 'Mar', abril: 'Abr',
  maio: 'Mai', junho: 'Jun', julho: 'Jul', agosto: 'Ago',
  setembro: 'Set', outubro: 'Out', novembro: 'Nov', dezembro: 'Dez'
};

function mesCurto(nome) {
  return MESES_CURTOS[normChave(nome)] || String(nome || '').slice(0, 3);
}

/** "2026-Novembro" → { mes: 'Novembro', ano: '2026' }. Aceita "Novembro/2026". */
export function partirMes(chave) {
  const s = String(chave || '').trim();
  const m1 = s.match(/^(\d{4})[-/ ]([A-Za-zÀ-ÿ]+)$/);
  if (m1) return { ano: m1[1], mes: m1[2] };
  const m2 = s.match(/^([A-Za-zÀ-ÿ]+)[-/ ](\d{4})$/);
  if (m2) return { ano: m2[2], mes: m2[1] };
  return { ano: '', mes: s };
}

function doc(base) {
  const valor = base.valor === null || base.valor === undefined ? null : num(base.valor);
  const partes = [base.nome, base.contexto, base.categoria, base.conta];
  return {
    app: base.app,
    tipo: base.tipo,
    nome: String(base.nome || '').trim() || '(sem nome)',
    valor,
    contexto: base.contexto || '',
    mes: base.mes || '',
    ano: base.ano || '',
    ym: base.ym || '',
    busca: normChave(partes.filter(Boolean).join(' '))
  };
}

function ymDe(ano, mes) {
  if (!ano || !mes) return '';
  const idx = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].indexOf(normChave(mes));
  if (idx < 0) return String(ano);
  return `${ano}-${String(idx + 1).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------
 * Índice
 * ---------------------------------------------------------------------- */
export function construirIndice({ matrix, maracaju, atendimentos } = {}) {
  const docs = [];

  /* 1. Matrix: fluxo do mês (gastos e receitas) */
  const anos = (matrix && matrix.anos) || {};
  Object.keys(anos).forEach((ano) => {
    const meses = anos[ano] || {};
    Object.keys(meses).forEach((mes) => {
      const m = meses[mes] || {};
      const ym = ymDe(ano, mes);
      const ctx = `${mes} ${ano}`;

      [['fixos', 'gasto'], ['outros', 'gasto'], ['inicioAno', 'gasto'], ['diarios', 'gasto']].forEach(
        ([chave, tipo]) => {
          arr(m[chave]).forEach((it) => {
            docs.push(
              doc({
                app: 'matrix',
                tipo,
                nome: it.nome,
                valor: it.valor,
                contexto: ctx,
                mes,
                ano,
                ym,
                categoria: it.categoria,
                conta: it.conta
              })
            );
          });
        }
      );

      arr(m.receitas).forEach((it) => {
        docs.push(
          doc({
            app: 'matrix',
            tipo: 'receita',
            nome: it.nome,
            valor: it.valor,
            contexto: ctx,
            mes,
            ano,
            ym,
            categoria: it.categoria,
            conta: it.conta
          })
        );
      });
    });
  });

  /* 2. Faturas: itens de cada mês já normalizados no satélite do Matrix */
  const faturas = matrix && matrix.satellites && matrix.satellites.faturas;
  const porMes = (faturas && faturas.faturasPorMes) || {};
  Object.keys(porMes).forEach((chave) => {
    const { ano, mes } = partirMes(chave);
    const ym = /^\d{4}-\d{2}$/.test(chave) ? chave : ymDe(ano, mes);
    arr(porMes[chave] && porMes[chave].itens).forEach((it) => {
      docs.push(
        doc({
          app: 'faturas',
          tipo: 'fatura',
          nome: it.desc,
          valor: it.valor,
          contexto: `${mes} ${ano} · fatura`,
          mes,
          ano,
          ym,
          categoria: it.categoria
        })
      );
    });
  });

  /* 3. Atendimentos: lançamentos da Scarlet */
  arr(atendimentos).forEach((e) => {
    const data = String(e.data || '');
    const ym = data.slice(0, 7);
    const [ano, mesNum] = ym.split('-');
    const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
      'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mes = nomes[Number(mesNum) - 1] || '';
    docs.push(
      doc({
        app: 'atendimentos',
        tipo: 'atendimento',
        nome: e.nome,
        valor: e.valor,
        contexto: `${mes} ${ano} · ${e.status || 'lançado'}`,
        mes,
        ano,
        ym
      })
    );
  });

  /* 4. Casa Maracaju: rotina, lista de mercado, carro, reformas e sonhos */
  const m = maracaju || {};
  const colecoes = [
    ['tasks', 'tarefa', 'tarefa'],
    ['compras', 'mercado', 'lista de mercado'],
    ['carro', 'carro', 'carro'],
    ['reformas', 'reforma', 'reforma'],
    ['sonhos', 'sonho', 'sonho']
  ];
  colecoes.forEach(([chave, tipo, rotulo]) => {
    arr(m[chave]).forEach((it) => {
      docs.push(
        doc({
          app: 'maracaju',
          tipo,
          nome: it.title || it.name || it.nome,
          valor: null,
          contexto: rotulo,
          categoria: it.category,
          conta: it.room
        })
      );
    });
  });

  return {
    docs,
    porApp: {
      matrix: docs.filter((d) => d.app === 'matrix').length,
      faturas: docs.filter((d) => d.app === 'faturas').length,
      atendimentos: docs.filter((d) => d.app === 'atendimentos').length,
      maracaju: docs.filter((d) => d.app === 'maracaju').length
    }
  };
}

/* -------------------------------------------------------------------------
 * Busca
 * ---------------------------------------------------------------------- */

/** Só parece valor quem tem só dígitos, vírgula e ponto (e vira número > 0). */
export function pareceValor(consulta) {
  const s = String(consulta || '').trim().replace(/^r\$\s*/i, '');
  if (!/^[\d.,]+$/.test(s)) return null;
  if (!/\d/.test(s)) return null;
  const v = num(s);
  return v > 0 ? v : null;
}

const TOLERANCIA = 0.011;

function pontuar(d, q, valorBuscado) {
  let pontos = 0;
  if (d.nome && normChave(d.nome).startsWith(q)) pontos += 5;
  if (valorBuscado && d.valor !== null && Math.abs(d.valor - valorBuscado) < TOLERANCIA) pontos += 4;
  if (d.busca.includes(q)) pontos += 2;
  if (normChave(d.contexto).includes(q)) pontos += 1;
  return pontos;
}

/**
 * Busca por texto (com ou sem acento), por valor (921,85 / 921.85 / R$ 921,85)
 * e por mês/ano. Consulta com menos de 2 letras não devolve nada.
 */
export function buscar(indice, consulta, opcoes = {}) {
  const limite = Number(opcoes.limite) > 0 ? Number(opcoes.limite) : 60;
  const q = normChave(consulta);
  if (q.length < 2) return { itens: [], total: 0, consulta: String(consulta || '') };

  const valorBuscado = pareceValor(consulta);
  const docs = (indice && indice.docs) || [];

  const achados = [];
  docs.forEach((d) => {
    const pontos = pontuar(d, q, valorBuscado);
    if (pontos > 0) achados.push({ d, pontos });
  });

  achados.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (a.d.ym !== b.d.ym) return String(b.d.ym).localeCompare(String(a.d.ym));
    return (b.d.valor || 0) - (a.d.valor || 0);
  });

  const itens = achados.slice(0, limite).map((x) => x.d);
  return { itens, total: achados.length, consulta: String(consulta || ''), valorBuscado };
}

/** Agrupa resultados por app, na ordem do catálogo. */
export function agrupar(itens) {
  const grupos = [];
  APP_ORDEM.forEach((app) => {
    const doApp = itens.filter((d) => d.app === app);
    if (doApp.length) {
      grupos.push({
        app,
        titulo: app === 'casa' ? 'Casa' : APP_LABEL[app] || app,
        itens: doApp
      });
    }
  });
  return grupos;
}

/** Resumo curto para a tela ("Nov 2026 · Combustível"). */
export function resumo(d) {
  if (!d) return '';
  if (d.app === 'maracaju') return d.contexto;
  if (d.ym && /^\d{4}-\d{2}$/.test(d.ym)) {
    const [ano, mm] = d.ym.split('-');
    const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
      'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mes = nomes[Number(mm) - 1] || '';
    return `${mesCurto(mes)} ${ano} · ${d.contexto.includes('fatura') ? 'fatura' : d.tipo}`;
  }
  return d.contexto;
}
