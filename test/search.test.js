/**
 * Nexo · testes do motor de busca (puro).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  construirIndice, buscar, agrupar, pareceValor, partirMes, resumo
} from '../js/search.js';

function estado() {
  return {
    matrix: {
      anos: {
        2026: {
          Novembro: {
            fixos: [
              { nome: 'Água', valor: 118.4, pago: true },
              { nome: 'Caronas', valor: 921.85, pago: false }
            ],
            outros: [{ nome: 'Renda+ 2055', valor: 103, pago: true }],
            diarios: [{ nome: 'Padaria', valor: 22.5, conta: 'debito_inter', categoria: 'Alimentação' }],
            receitas: [{ nome: 'Salário Líquido USP', valor: 5786.24, categoria: 'Salário / Proventos', conta: 'bb' }]
          },
          Outubro: {
            fixos: [{ nome: 'Unimed', valor: 867.72, pago: true }],
            outros: [],
            diarios: [],
            receitas: []
          }
        }
      },
      satellites: {
        faturas: {
          faturasPorMes: {
            '2026-Novembro': {
              itens: [{ desc: 'Tennis One 4/5', valor: 79.99, categoria: 'Vestuário & Moda' }]
            }
          }
        }
      }
    },
    atendimentos: [
      { nome: 'Ana Paula', data: '2026-11-03', valor: 120, status: 'Pago' },
      { nome: 'Bianca', data: '2026-10-05', valor: 150, status: 'Pendente' }
    ],
    maracaju: {
      tasks: [{ id: 't1', title: 'Lavar a louça', room: 'cozinha' }],
      compras: [{ id: 'c1', name: 'Café', qty: 2 }],
      carro: [{ id: 'k1', title: 'Troca de óleo' }],
      reformas: [{ id: 'r1', title: 'Iluminação da sala' }],
      sonhos: [{ id: 's1', title: 'Viagem para a Serra Gaúcha' }]
    }
  };
}

const indice = construirIndice(estado());

test('partirMes entende "2026-Novembro" e "Novembro/2026"', () => {
  assert.deepEqual(partirMes('2026-Novembro'), { ano: '2026', mes: 'Novembro' });
  assert.deepEqual(partirMes('Novembro/2026'), { ano: '2026', mes: 'Novembro' });
  assert.deepEqual(partirMes('qualquer'), { ano: '', mes: 'qualquer' });
});

test('pareceValor aceita pt-BR e recusa texto', () => {
  assert.equal(pareceValor('921,85'), 921.85);
  assert.equal(pareceValor('921.85'), 921.85);
  assert.equal(pareceValor('R$ 118,40'), 118.4);
  assert.equal(pareceValor('carona'), null);
  assert.equal(pareceValor(''), null);
});

test('o índice enxerga os quatro apps', () => {
  assert.ok(indice.docs.length >= 10);
  assert.equal(indice.porApp.matrix, 6);
  assert.equal(indice.porApp.faturas, 1);
  assert.equal(indice.porApp.atendimentos, 2);
  assert.equal(indice.porApp.maracaju, 5);
});

test('busca por nome ignora acento', () => {
  const r = buscar(indice, 'agua');
  assert.ok(r.itens.some((d) => d.nome === 'Água'));
});

test('busca por valor entende vírgula e ponto', () => {
  assert.equal(buscar(indice, '921,85').itens[0].nome, 'Caronas');
  assert.equal(buscar(indice, '921.85').itens[0].nome, 'Caronas');
  assert.equal(buscar(indice, 'R$ 867,72').itens[0].nome, 'Unimed');
});

test('busca por mês traz os lançamentos daquele mês', () => {
  const r = buscar(indice, 'novembro');
  assert.ok(r.total >= 4);
  assert.ok(r.itens.every((d) => /Novembro|Nov/.test(d.ym ? d.mes || 'Novembro' : d.contexto) || d.ym.startsWith('2026-11')));
});

test('consulta curta não devolve nada', () => {
  assert.equal(buscar(indice, 'a').total, 0);
  assert.equal(buscar(indice, '').total, 0);
  assert.equal(buscar(indice, '   ').total, 0);
});

test('respeita o limite e informa o total', () => {
  const idx = construirIndice({
    maracaju: { tasks: Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, title: `Tarefa ${i}` })) }
  });
  const r = buscar(idx, 'tarefa', { limite: 2 });
  assert.equal(r.itens.length, 2);
  assert.equal(r.total, 5);
});

test('nome que começa com a consulta vem antes', () => {
  const r = buscar(indice, 'carona');
  assert.equal(r.itens[0].nome, 'Caronas');
});

test('encontra item de fatura e de atendimento', () => {
  assert.equal(buscar(indice, 'tennis').itens[0].app, 'faturas');
  assert.equal(buscar(indice, 'bianca').itens[0].app, 'atendimentos');
});

test('encontra tarefa, carro, reforma e sonho do Casa Maracaju', () => {
  assert.equal(buscar(indice, 'louça').itens[0].app, 'maracaju');
  assert.equal(buscar(indice, 'óleo').itens[0].app, 'maracaju');
  assert.equal(buscar(indice, 'iluminacao').itens[0].app, 'maracaju');
  assert.equal(buscar(indice, 'serra gaucha').itens[0].app, 'maracaju');
});

test('agrupar mantém a ordem dos apps e ignora grupo vazio', () => {
  const grupos = agrupar([
    { app: 'faturas', nome: 'X' },
    { app: 'matrix', nome: 'Y' },
    { app: 'matrix', nome: 'Z' }
  ]);
  assert.deepEqual(grupos.map((g) => g.app), ['matrix', 'faturas']);
  assert.equal(grupos[0].itens.length, 2);
  assert.equal(grupos[1].titulo, 'Faturas');
  assert.deepEqual(agrupar([]), []);
});

test('resumo devolve texto curto e legível', () => {
  const item = buscar(indice, 'carona').itens[0];
  assert.ok(resumo(item).includes('2026'));
});

test('índice de estado vazio não quebra a busca', () => {
  const vazio = construirIndice({});
  assert.equal(vazio.docs.length, 0);
  const r = buscar(vazio, 'qualquer coisa');
  assert.equal(r.total, 0);
  assert.deepEqual(agrupar(r.itens), []);
});
