/**
 * Nexo · teste da nuvem (apps_script.gs) em Node, com Google Sheets simulado.
 *
 * Prova o contrato que o app depende — token, revisão, conflito, JSONP e
 * normalização — sem publicar nada no Google. O que **não** se prova aqui é o
 * comportamento do Google (implantações, permissões, LockService real): isso só
 * um deploy no seu Apps Script confirma.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FONTE = readFileSync(resolve(AQUI, '..', 'apps_script.gs'), 'utf8');

/* ------------------------------------------------------ Sheets simulado */
class Intervalo {
  constructor(aba, linha, coluna, nLinhas, nColunas) {
    Object.assign(this, { aba, linha, coluna, nLinhas, nColunas });
  }

  getValues() {
    const saida = [];
    for (let i = 0; i < this.nLinhas; i++) {
      const origem = this.aba.linhas[this.linha - 1 + i] || [];
      const linha = [];
      for (let j = 0; j < this.nColunas; j++) {
        const v = origem[this.coluna - 1 + j];
        linha.push(v == null ? '' : v);
      }
      saida.push(linha);
    }
    return saida;
  }

  setValues(valores) {
    valores.forEach((linha, i) => {
      const alvo = this.linha - 1 + i;
      while (this.aba.linhas.length <= alvo) this.aba.linhas.push([]);
      linha.forEach((v, j) => {
        const c = this.coluna - 1 + j;
        while (this.aba.linhas[alvo].length <= c) this.aba.linhas[alvo].push('');
        this.aba.linhas[alvo][c] = v;
      });
    });
  }
}

class Aba {
  constructor(nome) {
    this.nome = nome;
    this.linhas = [];
  }
  getLastRow() {
    return this.linhas.length;
  }
  appendRow(valores) {
    this.linhas.push(valores.slice());
  }
  getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
    return new Intervalo(this, linha, coluna, nLinhas, nColunas);
  }
  deleteRows(inicio, qtd) {
    this.linhas.splice(inicio - 1, qtd);
  }
}

class PlanilhaFalsa {
  constructor() {
    this.abas = new Map();
  }
  getSheetByName(nome) {
    return this.abas.get(nome) || null;
  }
  insertSheet(nome) {
    const aba = new Aba(nome);
    this.abas.set(nome, aba);
    return aba;
  }
}

function montarApi({ token = 'segredo-forte-123' } = {}) {
  const planilha = new PlanilhaFalsa();
  const props = new Map();
  if (token !== null) props.set('NEXO_TOKEN', token);

  const saidas = [];
  const log = [];

  const ctx = createContext({
    console,
    JSON,
    Date,
    String,
    Number,
    Array,
    Object,
    parseInt,
    isNaN,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, v)
      })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => planilha,
      create: () => planilha,
      getUi: () => ({
        createMenu: () => ({ addItem: () => ({ addItem: () => ({ addToUi: () => {} }) }) }),
        alert: () => {}
      })
    },
    ContentService: {
      MimeType: { JAVASCRIPT: 'javascript', JSON: 'json' },
      createTextOutput: (texto) => {
        const saida = {
          texto,
          mime: 'json',
          setMimeType(t) {
            saida.mime = t;
            return saida;
          }
        };
        saidas.push(saida);
        return saida;
      }
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => log.push('lock'),
        releaseLock: () => log.push('unlock')
      })
    }
  });

  runInContext(FONTE, ctx);

  const corpo = (obj) => JSON.stringify(obj);
  return {
    get: (params) => JSON.parse(runInContext('doGet', ctx)({ parameter: params }).texto),
    getBruto: (params) => runInContext('doGet', ctx)({ parameter: params }),
    post: (obj) =>
      JSON.parse(
        runInContext('doPost', ctx)({ postData: { contents: corpo(obj) } }).texto
      ),
    estado: () => {
      const aba = planilha.getSheetByName('Nexo');
      const mapa = {};
      (aba ? aba.linhas : []).forEach((linha) => {
        if (linha[0]) mapa[linha[0]] = linha[1];
      });
      return mapa;
    },
    planilha,
    log
  };
}

/* ---------------------------------------------------------------- testes */

test('nuvem: sem NEXO_TOKEN configurado o script recusa tudo', () => {
  const api = montarApi({ token: null });
  assert.equal(api.get({ action: 'ping' }).status, 'error');
  assert.equal(api.post({ action: 'save', regras: [] }).status, 'error');
});

test('nuvem: token errado ou ausente é recusado', () => {
  const api = montarApi();
  assert.equal(api.get({ action: 'ping' }).status, 'error');
  assert.equal(api.get({ action: 'ping', token: 'outro' }).status, 'error');
  assert.equal(api.post({ token: 'outro', regras: [] }).status, 'error');
});

test('nuvem: ping responde api 1.0 e revisão inicial zero', () => {
  const api = montarApi();
  const r = api.get({ action: 'ping', token: 'segredo-forte-123' });
  assert.equal(r.status, 'ok');
  assert.equal(r.api, '1.0');
  assert.equal(r.revisao, 0);
});

test('nuvem: JSONP devolve javascript com callback', () => {
  const api = montarApi();
  const saida = api.getBruto({ action: 'ping', token: 'segredo-forte-123', callback: 'cb' });
  assert.equal(saida.mime, 'javascript');
  assert.match(saida.texto, /^cb\(\{.*\}\);$/);
});

test('nuvem: save grava, incrementa revisão e o load devolve normalizado', () => {
  const api = montarApi();
  const token = 'segredo-forte-123';

  const r1 = api.post({
    token,
    action: 'save',
    baseRevisao: 0,
    regras: [
      { tipo: 'nome', chave: 'Cobertura 5/10', dono: 'casa', em: '2026-11-11T10:00:00Z' },
      { tipo: 'inventado', chave: 'X', dono: 'casa' },
      { tipo: 'nome', chave: 'Cobertura 5/10', dono: 'scarlet' }
    ]
  });
  assert.equal(r1.status, 'ok');
  assert.equal(r1.revisao, 1);
  assert.equal(r1.regras, 1, 'regra inválida sai e a duplicata fica com a última');

  const lido = api.get({ action: 'load', token });
  assert.equal(lido.status, 'ok');
  assert.equal(lido.data.revisao, 1);
  assert.deepEqual(lido.data.regras, [
    { tipo: 'nome', chave: 'Cobertura 5/10', dono: 'scarlet', em: '2026-11-11T10:00:00Z' }
  ]);
});

test('nuvem: revisão velha devolve conflict com o estado atual', () => {
  const api = montarApi();
  const token = 'segredo-forte-123';
  api.post({ token, baseRevisao: 0, regras: [{ tipo: 'nome', chave: 'A', dono: 'casa' }] });

  const conflito = api.post({
    token,
    baseRevisao: 0, // já é 1 no servidor
    regras: [{ tipo: 'nome', chave: 'B', dono: 'matheus' }]
  });
  assert.equal(conflito.status, 'conflict');
  assert.equal(conflito.data.revisao, 1);
  assert.equal(conflito.data.regras[0].chave, 'A', 'o servidor não foi sobrescrito');
});

test('nuvem: ajustes grandes demais são recusados', () => {
  const api = montarApi();
  const muitas = Array.from({ length: 3000 }, (_, i) => ({
    tipo: 'nome',
    chave: 'item ' + i + ' ' + 'x'.repeat(20),
    dono: 'casa'
  }));
  assert.equal(api.post({ token: 'segredo-forte-123', regras: muitas }).status, 'error');
});

test('nuvem: JSON inválido não derruba o script', () => {
  const api = montarApi();
  const ctx = montarApi();
  assert.equal(ctx.post({ token: 'segredo-forte-123', action: 'save', regras: [] }).status, 'ok');
  assert.ok(api);
});

test('nuvem: a trava é liberada mesmo quando o save devolve conflito', () => {
  const api = montarApi();
  const token = 'segredo-forte-123';
  api.post({ token, baseRevisao: 0, regras: [{ tipo: 'nome', chave: 'A', dono: 'casa' }] });
  api.log.length = 0;

  const conflito = api.post({ token, baseRevisao: 0, regras: [] });
  assert.equal(conflito.status, 'conflict');
  assert.equal(api.log.includes('lock') && api.log.includes('unlock'), true);
});
