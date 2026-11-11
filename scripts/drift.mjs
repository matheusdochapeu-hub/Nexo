/**
 * Nexo · drift das faturas
 * ---------------------------------------------------------------------------
 * Os itens de fatura existem DUAS vezes hoje:
 *   - ../parcelado-a-vista/index.html        → BASE_ITEMS (o dono do dado)
 *   - ../matrix/js/satellite-connectors.js   → cópia para o painel central
 *
 * Esta ferramenta lê os dois arquivos, compara e escreve o relatório. Não
 * altera nenhum app. Uso:
 *
 *   node scripts/drift.mjs              # relatório legível
 *   node scripts/drift.mjs --json       # relatório em JSON
 *   node scripts/drift.mjs --gerar      # grava shared/faturas-base.json
 *
 * O arquivo gerado é a lista canônica, pronta para os apps consumirem quando
 * o dono aprovar a migração (Fase 3.2).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PADRAO = resolve(AQUI, '..', '..');

/** Permite apontar para uma cópia dos apps (usado para validar patch). */
const RAIZ = process.env.NEXO_RAIZ
  ? resolve(process.cwd(), process.env.NEXO_RAIZ)
  : RAIZ_PADRAO;

export const ARQUIVOS = {
  faturas: resolve(RAIZ, 'parcelado-a-vista', 'index.html'),
  matrix: resolve(RAIZ, 'matrix', 'js', 'satellite-connectors.js'),
  base: resolve(RAIZ, 'nexo', 'shared', 'faturas-base.json')
};

/** Extrai o literal de array/objeto que começa em `inicio` (índice do `[` ou `{`). */
export function extrairBloco(texto, inicio) {
  const abrir = texto[inicio];
  const fechar = abrir === '[' ? ']' : '}';
  let profundidade = 0;
  let aspas = null;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '\\') i++;
      else if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"') {
      aspas = c;
      continue;
    }
    if (c === abrir) profundidade++;
    else if (c === fechar) {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

export const extrairArray = extrairBloco;

/** Acha `NOME = [` ou `NOME=[` e devolve o array literal. */
export function blocoArray(texto, nome) {
  const re = new RegExp(`${nome}\\s*=\\s*\\[`);
  const m = re.exec(texto);
  if (!m) return null;
  return extrairBloco(texto, m.index + m[0].length - 1);
}

/** Acha `NOME = {` e devolve o objeto já parseado (ou null). */
export function blocoObjeto(texto, nome) {
  const re = new RegExp(`${nome}\\s*=\\s*\\{`);
  const m = re.exec(texto);
  if (!m) return null;
  const literal = extrairBloco(texto, m.index + m[0].length - 1);
  if (!literal) return null;
  try {
    return JSON.parse(literal);
  } catch {
    return null;
  }
}

const ITEM_RE =
  /\{\s*d\s*:\s*(['"])((?:[^\\]|\\.)*?)\1\s*,\s*v\s*:\s*(-?[\d.]+)\s*,\s*de\s*:\s*(\d+)\s*,\s*ate\s*:\s*(\d+)([^}]*)\}/g;

/** Converte o literal em itens normalizados (tag/cat só quando existem). */
export function lerItens(literal) {
  if (!literal) return [];
  const itens = [];
  let m;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(literal))) {
    const resto = m[6] || '';
    const item = {
      nome: m[2].replace(/\\'/g, "'").trim(),
      valor: Number(m[3]),
      de: Number(m[4]),
      ate: Number(m[5])
    };
    const tag = /\btag\s*:\s*(['"])([^'"]*)\1/.exec(resto);
    const cat = /\bcat\s*:\s*(['"])([^'"]*)\1/.exec(resto);
    if (tag) item.tag = tag[2];
    if (cat) item.cat = cat[2];
    itens.push(item);
  }
  return itens;
}

const chave = (it) => `${it.nome.toLowerCase()}|${it.de}|${it.ate}`;

/** Compara a lista do Faturas (dona) com a cópia do Matrix. */
export function comparar(faturas, matrix) {
  const mapaF = new Map();
  const mapaM = new Map();
  faturas.forEach((it) => mapaF.set(chave(it), it));
  matrix.forEach((it) => mapaM.set(chave(it), it));

  const faltandoNoMatrix = [...mapaF.keys()].filter((k) => !mapaM.has(k)).map((k) => mapaF.get(k));
  const sobrandoNoMatrix = [...mapaM.keys()].filter((k) => !mapaF.has(k)).map((k) => mapaM.get(k));

  const valorDiferente = [];
  [...mapaF.keys()].forEach((k) => {
    const a = mapaF.get(k);
    const b = mapaM.get(k);
    if (!b) return;
    if (Math.abs(a.valor - b.valor) > 0.005) {
      valorDiferente.push({ nome: a.nome, de: a.de, ate: a.ate, faturas: a.valor, matrix: b.valor });
    }
  });

  return { faltandoNoMatrix, sobrandoNoMatrix, valorDiferente };
}

export function relatorio(opcoes = {}) {
  const lerArquivo = opcoes.ler || ((p) => readFileSync(p, 'utf8'));

  const htmlFaturas = lerArquivo(ARQUIVOS.faturas);
  const jsMatrix = lerArquivo(ARQUIVOS.matrix);

  const faturas = lerItens(blocoArray(htmlFaturas, 'BASE_ITEMS'));

  // Depois da migração, o Matrix consome js/faturas-data.js (gerado). Se ele
  // existir, é ele a lista efetiva; o array embutido virou só fallback.
  let matrix = null;
  let fonteMatrix = 'inline';
  try {
    const dados = lerArquivo(resolve(RAIZ, 'matrix', 'js', 'faturas-data.js'));
    const i = dados.indexOf('{');
    const j = dados.lastIndexOf('}');
    if (i >= 0 && j > i) {
      const obj = JSON.parse(dados.slice(i, j + 1));
      if (obj && Array.isArray(obj.base)) {
        matrix = obj.base.map((it) => ({
          nome: it.d,
          valor: Number(it.v),
          de: Number(it.de),
          ate: Number(it.ate),
          tag: it.tag || undefined
        }));
        fonteMatrix = 'gerada';
      }
    }
  } catch {
    /* sem arquivo gerado: compara com o array embutido */
  }
  if (!matrix) matrix = lerItens(blocoArray(jsMatrix, 'BASE_ITEMS'));

  const diff = comparar(faturas, matrix);

  // O Matrix tem um "baseline" com overrides próprios. Se o item que falta está
  // apagado ali (-1), a ausência pode ser intencional — o relatório precisa dizer isso.
  const baseline = blocoObjeto(jsMatrix, 'BASELINE_FATURAS_RAW');
  const overridesBase = (baseline && baseline.overrides) || {};

  const faltandoNoMatrix = diff.faltandoNoMatrix.map((it) => {
    const mesesApagados = [];
    for (let m = it.de; m <= it.ate; m++) {
      if (Number(overridesBase[`${it.nome}__${m}`]) === -1) mesesApagados.push(m);
    }
    return { ...it, apagadoNoBaseline: mesesApagados.length > 0, mesesApagados };
  });

  const valorDiferente = diff.valorDiferente.map((it) => {
    const ov = overridesBase[`${it.nome}__${it.de}`];
    return { ...it, overrideDoMatrix: ov != null ? Number(ov) : null };
  });

  const emDia = faltandoNoMatrix.length === 0 && diff.sobrandoNoMatrix.length === 0 && valorDiferente.length === 0;

  // Divergência "de verdade" = o que NÃO é explicado por um ajuste do usuário.
  // O baseline do Matrix é um retrato do pv4_* do app Faturas: -1 é exclusão
  // feita à mão e valor é edição feita à mão. Isso não é bug, é decisão.
  const divergenciaReal =
    faltandoNoMatrix.filter((it) => !it.apagadoNoBaseline).length +
    diff.sobrandoNoMatrix.length +
    valorDiferente.filter((it) => it.overrideDoMatrix === null).length;

  return {
    geradoEm: new Date().toISOString(),
    origem: 'parcelado-a-vista/index.html → BASE_ITEMS',
    copia: fonteMatrix === 'gerada' ? 'matrix/js/faturas-data.js (gerado)' : 'matrix/js/satellite-connectors.js → BASE_ITEMS',
    fonteMatrix,
    totais: { faturas: faturas.length, matrix: matrix.length },
    emDia,
    divergenciaReal,
    explicadoPeloBaseline: !emDia && divergenciaReal === 0,
    faltandoNoMatrix,
    sobrandoNoMatrix: diff.sobrandoNoMatrix,
    valorDiferente,
    faturas,
    matrix
  };
}

export function salvarBase(lista, destino = ARQUIVOS.base) {
  mkdirSync(dirname(destino), { recursive: true });
  const itens = lista.map((it) => ({ d: it.nome, v: it.valor, de: it.de, ate: it.ate }));

  const conteudo = {
    _leia: 'Lista canônica dos itens de fatura. Gerado por nexo/scripts/drift.mjs.',
    versao: 1,
    origem: 'parcelado-a-vista/index.html',
    itens
  };
  writeFileSync(destino, `${JSON.stringify(conteudo, null, 2)}\n`, 'utf8');

  // Espelho em ES module: o Nexo importa sem fetch e funciona offline.
  const js = destino.replace(/\.json$/, '.js');
  const corpo =
    '/* GERADO por nexo/scripts/drift.mjs — não edite à mão. */\n' +
    'export const BASE_FATURAS = [\n' +
    itens
      .map(
        (it) =>
          `  { d: ${JSON.stringify(it.d)}, v: ${it.v}, de: ${it.de}, ate: ${it.ate} }`
      )
      .join(',\n') +
    '\n];\n';
  writeFileSync(js, corpo, 'utf8');

  return { json: destino, js };
}

/**
 * Dados para o Matrix (script clássico, sem módulos): lista canônica + os
 * metadados `tag`/`cat` que só existem lá. Assim o Matrix para de manter a
 * cópia à mão e passa a consumir um artefato gerado e verificado pelo drift.
 */
export function salvarDadosMatrix(base, meta, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  const conteudo =
    '/* GERADO por nexo/scripts/drift.mjs — não edite à mão.\n' +
    '   Lista canônica (dona: app Faturas) + metadados cat/tag do Matrix. */\n' +
    `window.NEXO_FATURAS = ${JSON.stringify({ base, meta }, null, 2)};\n`;
  writeFileSync(destino, conteudo, 'utf8');
  return destino;
}

/* ------------------------------------------------------------------ CLI */
const executandoDireto = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executandoDireto) {
  const r = relatorio();
  const soJson = process.argv.includes('--json');
  const gerar = process.argv.includes('--gerar');

  if (gerar) {
    const destino = salvarBase(r.faturas);
    // Metadados que só o Matrix tem (categoria curada e tag de exibição)
    const meta = {};
    r.matrix.forEach((it) => {
      if (!it.cat && !it.tag) return;
      meta[`${it.nome}__${it.de}`] = { tag: it.tag || null, cat: it.cat || null };
    });
    const base = r.faturas.map((it) => ({ d: it.nome, v: it.valor, de: it.de, ate: it.ate, tag: it.tag || null }));
    const dadosMatrix = salvarDadosMatrix(base, meta, resolve(RAIZ, 'matrix', 'js', 'faturas-data.js'));

    if (!soJson) {
      console.log(`✔ lista canônica em ${destino.json} e ${destino.js} (${r.faturas.length} itens)`);
      console.log(`✔ dados do Matrix em ${dadosMatrix} (${base.length} itens, ${Object.keys(meta).length} metadados)`);
    }
  }

  if (soJson) {
    const { faturas, matrix, ...resumo } = r;
    console.log(JSON.stringify(resumo, null, 2));
  } else if (!gerar) {
    console.log('');
    console.log(`Faturas (dono) .... ${r.totais.faturas} itens`);
    console.log(`Matrix  (cópia) ... ${r.totais.matrix} itens`);
    console.log('');

    if (r.emDia) {
      console.log('✔ Em dia: a cópia bate com o dono.');
    } else if (r.divergenciaReal === 0) {
      console.log('✔ Nada a corrigir: todas as diferenças são ajustes seus no app Faturas.');
      console.log('  (o Matrix aplica os mesmos ajustes — a lista bruta é que difere)');
      if (r.faltandoNoMatrix.length) {
        console.log(`\n  Apagados por você (${r.faltandoNoMatrix.length}):`);
        r.faltandoNoMatrix.forEach((it) =>
          console.log(`    · ${it.nome} — R$ ${it.valor}  ⟵ -1 no mês ${it.mesesApagados.join(', ')}`)
        );
      }
      if (r.valorDiferente.length) {
        console.log(`\n  Valor editado por você (${r.valorDiferente.length}):`);
        r.valorDiferente.forEach((it) =>
          console.log(`    · ${it.nome}: lista R$ ${it.faturas} → ajustado R$ ${it.overrideDoMatrix}`)
        );
      }
    } else {
      console.log(`✖ Divergência real: ${r.divergenciaReal} diferença(s) sem explicação.`);
      const reais = r.faltandoNoMatrix.filter((it) => !it.apagadoNoBaseline);
      if (reais.length) {
        console.log(`\n  Faltam no Matrix (${reais.length}):`);
        reais.forEach((it) => console.log(`    · ${it.nome} — R$ ${it.valor} (${it.de}..${it.ate})`));
      }
      if (r.sobrandoNoMatrix.length) {
        console.log(`\n  Sobram no Matrix (${r.sobrandoNoMatrix.length}):`);
        r.sobrandoNoMatrix.forEach((it) => console.log(`    · ${it.nome} — R$ ${it.valor} (${it.de}..${it.ate})`));
      }
      const valores = r.valorDiferente.filter((it) => it.overrideDoMatrix === null);
      if (valores.length) {
        console.log(`\n  Valor diferente (${valores.length}):`);
        valores.forEach((it) => console.log(`    · ${it.nome}: faturas R$ ${it.faturas} × matrix R$ ${it.matrix}`));
      }
      console.log('\n  Conserto: alinhar a cópia do Matrix (ou os dois lerem a lista compartilhada).');
    }
    console.log('');
  }
}
