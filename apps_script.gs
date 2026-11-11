/**
 * NEXO · API de ajustes (Google Apps Script)
 * ---------------------------------------------------------------------------
 * Guarda SÓ os ajustes do Nexo: regras de dono e a preferência de privacidade.
 * Não lê planilha de nenhum outro app, não toca em dados financeiros.
 *
 * Instalação (5 minutos, uma vez):
 *   1. Crie uma planilha nova no Google Sheets → Extensões → Apps Script.
 *   2. Apague o conteúdo e cole este arquivo.
 *   3. Configurações do projeto → Propriedades do script → adicione:
 *        NEXO_TOKEN = <uma senha longa só sua>
 *   4. Implantar → Nova implantação → App da Web
 *        Executar como: Eu · Quem pode acessar: Qualquer pessoa
 *   5. Copie a URL /exec e cole no Nexo → Ajustes → Nuvem.
 *
 * A planilha é criada/gerenciada pelo próprio script (abas Nexo e Log).
 * Formato da aba Nexo: chave | valor | atualizado_em
 */

var ABA = 'Nexo';
var ABA_LOG = 'Log';
var LIMITE_BYTES = 60 * 1024;      // ajustes são pequenos; 60 KB é folga
var TIPOS = ['nome', 'categoria', 'conta'];
var DONOS = ['casa', 'matheus', 'scarlet'];

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('NEXO_TOKEN') || '';
}

/** Comparação simples em tempo ~constante. */
function tokenOk_(recebido) {
  var esperado = getToken_();
  if (!esperado) return false;
  var a = String(recebido == null ? '' : recebido);
  if (a.length !== esperado.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

function planilha_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('Nexo — ajustes');
  }
  return ss;
}

function aba_(nome, cabecalho) {
  var ss = planilha_();
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    if (cabecalho) sh.appendRow(cabecalho);
  }
  return sh;
}

/** Lê todas as chaves de uma vez. */
function lerTudo_() {
  var sh = aba_(ABA, ['chave', 'valor', 'atualizado_em']);
  var ultima = sh.getLastRow();
  if (ultima < 2) return {};
  var dados = sh.getRange(2, 1, ultima - 1, 3).getValues();
  var mapa = {};
  for (var i = 0; i < dados.length; i++) {
    var chave = String(dados[i][0] || '').trim();
    if (!chave) continue;
    mapa[chave] = { valor: String(dados[i][1] == null ? '' : dados[i][1]), em: dados[i][2] || null, linha: i + 2 };
  }
  return mapa;
}

/** Grava várias chaves numa única passada. */
function gravar_(pares) {
  var sh = aba_(ABA, ['chave', 'valor', 'atualizado_em']);
  var existentes = lerTudo_();
  var agora = new Date().toISOString();
  var novas = [];
  Object.keys(pares).forEach(function (chave) {
    var valor = String(pares[chave] == null ? '' : pares[chave]);
    if (existentes[chave]) {
      sh.getRange(existentes[chave].linha, 2, 1, 2).setValues([[valor, agora]]);
    } else {
      novas.push([chave, valor, agora]);
    }
  });
  if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, 3).setValues(novas);
}

function registrar_(acao, detalhe) {
  try {
    var sh = aba_(ABA_LOG, ['quando', 'acao', 'detalhe']);
    sh.appendRow([new Date().toISOString(), acao, String(detalhe || '').slice(0, 200)]);
  } catch (e) {
    /* log nunca derruba a requisição */
  }
}

/** Regras válidas e sem duplicata. Mesma regra do cliente (nexo/js/ajustes.js). */
function normalizarRegras_(lista) {
  if (!Array.isArray(lista)) return [];
  var mapa = {};
  var ordem = [];
  lista.forEach(function (r) {
    if (!r || typeof r !== 'object') return;
    var tipo = String(r.tipo || '');
    var dono = String(r.dono || '');
    var chave = String(r.chave == null ? '' : r.chave).trim();
    if (TIPOS.indexOf(tipo) < 0 || DONOS.indexOf(dono) < 0 || !chave) return;
    var k = tipo + '::' + chave.toLowerCase();
    if (!mapa[k]) ordem.push(k);
    mapa[k] = { tipo: tipo, chave: chave, dono: dono, em: r.em || null };
  });
  return ordem.map(function (k) { return mapa[k]; });
}

function leituraAtual_() {
  var mapa = lerTudo_();
  var regras = [];
  try {
    regras = normalizarRegras_(JSON.parse((mapa.regras && mapa.regras.valor) || '[]'));
  } catch (e) {
    regras = [];
  }
  return {
    regras: regras,
    privacidade: String((mapa.privacidade && mapa.privacidade.valor) || '') === 'true',
    revisao: parseInt((mapa.revisao && mapa.revisao.valor) || '0', 10) || 0,
    salvoEm: (mapa.salvoEm && mapa.salvoEm.valor) || null
  };
}

function resposta_(obj, parametroCallback) {
  var texto = JSON.stringify(obj);
  if (parametroCallback) {
    return ContentService.createTextOutput(parametroCallback + '(' + texto + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

function erro_(mensagem, callback) {
  return resposta_({ status: 'error', message: mensagem }, callback);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var callback = p.callback || '';   // JSONP: o Nexo lê por aqui (sem CORS)
  if (!getToken_()) return erro_('NEXO_TOKEN não configurado no script.', callback);
  if (!tokenOk_(p.token)) return erro_('Token inválido ou ausente.', callback);

  var acao = String(p.action || 'ping');

  if (acao === 'ping') {
    return resposta_({ status: 'ok', api: '1.0', revisao: leituraAtual_().revisao }, callback);
  }
  if (acao === 'load') {
    var dados = leituraAtual_();
    return resposta_({ status: 'ok', data: dados }, callback);
  }
  return erro_('Ação inválida: ' + acao, callback);
}

function doPost(e) {
  if (!getToken_()) return erro_('NEXO_TOKEN não configurado no script.');
  var corpo = {};
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (erro) {
    return erro_('JSON inválido.');
  }
  if (!tokenOk_(corpo.token)) return erro_('Token inválido.');

  var acao = String(corpo.action || 'save');
  if (acao !== 'save') return erro_('Ação inválida: ' + acao);

  var texto = JSON.stringify(corpo.regras || []);
  if (texto.length > LIMITE_BYTES) return erro_('Ajustes grandes demais.');

  var trava = LockService.getScriptLock();
  try {
    trava.waitLock(15000);
  } catch (erro) {
    return erro_('Ocupado, tente de novo.');
  }

  try {
    var atual = leituraAtual_();
    var base = parseInt(corpo.baseRevisao, 10);
    if (Number.isFinite(base) && base !== atual.revisao) {
      // Alguém gravou entre a leitura e a escrita: devolve o estado atual
      // para o cliente mesclar em vez de sobrescrever.
      return resposta_({ status: 'conflict', data: atual });
    }

    var regras = normalizarRegras_(corpo.regras);
    var proxima = atual.revisao + 1;
    gravar_({
      regras: JSON.stringify(regras),
      privacidade: corpo.privacidade === true ? 'true' : 'false',
      revisao: String(proxima),
      salvoEm: new Date().toISOString()
    });
    registrar_('save', 'regras=' + regras.length + ' revisao=' + proxima);

    return resposta_({ status: 'ok', revisao: proxima, regras: regras.length });
  } finally {
    trava.releaseLock();
  }
}

/* Menu de diagnóstico na planilha */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Nexo')
      .addItem('Diagnóstico', 'menuDiagnostico_')
      .addItem('Limpar log', 'menuLimparLog_')
      .addToUi();
  } catch (e) {}
}

function menuDiagnostico_() {
  var d = leituraAtual_();
  SpreadsheetApp.getUi().alert(
    'Nexo — ajustes\n\n' +
      'Token configurado: ' + (getToken_() ? 'sim' : 'NÃO') + '\n' +
      'Revisão: ' + d.revisao + '\n' +
      'Regras: ' + d.regras.length + '\n' +
      'Salvo em: ' + (d.salvoEm || '—')
  );
}

function menuLimparLog_() {
  var sh = aba_(ABA_LOG, ['quando', 'acao', 'detalhe']);
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  SpreadsheetApp.getUi().alert('Log limpo.');
}
