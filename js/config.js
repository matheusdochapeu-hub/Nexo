/**
 * Nexo · config.js
 * Versão do app e catálogo dos 4 aplicativos.
 */

export const VERSION = '0.15.2';

/**
 * `local`  → caminho relativo quando tudo roda do mesmo servidor (dev).
 * `remoto` → caminho no GitHub Pages (mesma origem `matheusdochapeu-hub.github.io`,
 *            por isso o localStorage é compartilhado entre os cinco).
 */
export const APPS = [
  {
    id: 'matrix',
    nome: 'Matrix',
    papel: 'Caixa, cartões e investimentos',
    desc: 'Fluxo do mês, simuladores, financiamento e holerites.',
    local: '../matrix/',
    remoto: '../Matrix/',
    cor: '#1E5C4A'
  },
  {
    id: 'maracaju',
    nome: 'Casa Maracaju',
    papel: 'VA/VR, mercado e rotina',
    desc: 'Tarefas, mercado com NFC-e, carro, reformas e sonhos.',
    local: '../maracaju88/',
    remoto: '../maracaju88/',
    cor: '#2F6B3F'
  },
  {
    id: 'faturas',
    nome: 'Faturas',
    papel: 'Cartões e calculadora',
    desc: 'Faturas mês a mês, categorias e à vista × parcelado.',
    local: '../parcelado-a-vista/',
    remoto: '../parcelado-a-vista/',
    cor: '#2A4A7F'
  },
  {
    id: 'atendimentos',
    nome: 'Atendimentos',
    papel: 'Trabalho da Scarlet',
    desc: 'Pacientes, sessões, evoluções e recibos.',
    local: '../matheus-app-fisioterapia/',
    remoto: '../matheus-app-fisioterapia/',
    cor: '#A9532F'
  }
];

const EH_GITHUB_PAGES = /(^|\.)github\.io$/i.test(
  typeof location !== 'undefined' ? location.hostname : ''
);

export function urlDoApp(app) {
  if (!app) return '#';
  return EH_GITHUB_PAGES ? app.remoto : app.local;
}
