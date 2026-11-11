# AGENTS.md — Nexo

> Contexto para agentes de IA. Escopo: **esta pasta**.

## O que é

Shell unificado dos quatro apps da casa (Matrix, Casa Maracaju, Faturas,
Atendimentos da Scarlet). **Fase 1** entregue: áreas Casa / Matheus / Scarlet, lançador,
modo privacidade e avisos de dado velho.
**Fase 2.1** entregue: atribuição de cada gasto a Casa / Matheus / Scarlet, com regra
por nome guardada em `nexo_regras` e troca por toque.
**Fase 2.2** entregue: busca global manual (`/` ou `Ctrl+K`) sobre os quatro apps.
**Fase 2.3** entregue: conciliação cruzada (achados com tom risco/atenção/ok/info).
**Fase 2.4** entregue: "Hoje" (alertas com data real). Fase 2 fechada.
**Fase 3.1** entregue: tema compartilhado (`theme/`) — pacote opt-in, **não aplicado**
em nenhum app ainda.
**Fase 3.2** concluída: o Matrix consome `matrix/js/faturas-data.js`, **gerado** da lista do
Faturas + metadados dele. O array embutido virou fallback. `npm run drift` compara com o
artefato e diz "Em dia" (91 × 91). Nada de cópia à mão.
**Fase 3.3** entregue: exportar/importar ajustes em JSON (`js/ajustes.js`).
**Fase 3.5** concluída: **nenhum app mantém a lista de faturas à mão**. O gerador escreve
`matrix/js/faturas-data.js` **e** `parcelado-a-vista/js/faturas-data.js` (ambos 90 itens);
cada app aplica o artefato sobre o array embutido, que virou só fallback offline. A lista
canônica em `shared/` é a fonte; os dois arquivos são projeções geradas e verificadas.

Este app **não substitui** nenhum dos quatro. Eles continuam funcionando sozinhos e são a
fonte da verdade dos seus próprios dados.

## Stack

- PWA em HTML/CSS/JS puro, **ES modules** (`import`/`export`) — diferente do Matrix, que usa
  scripts clássicos. Sem framework, sem bundler, sem dependência.
- Sem backend. Sem rede. Só `localStorage` da origem compartilhada.
- Design system próprio em `css/nexo.css` com tokens `--nx-*` (embrião do tema único da Fase 3).

## Rodar localmente

```powershell
# na pasta pai (5. IA), para todos os apps dividirem a mesma origem
python -m http.server 8000
# http://localhost:8000/nexo/
```

## Testes

```powershell
node --test test/*.test.js    # 129 testes
npm run drift                 # diferenças dono × cópia, separando ajuste de bug
```

Publicado em <https://matheusdochapeu-hub.github.io/Nexo/> (repo `Nexo`, Pages na `main`).
Publicar = commitar na `main`; o Pages reconstrói sozinho.

O Node do workspace fica em `..\node-bin\PFiles64\nodejs\node.exe` (só quando não há
`node` no PATH).

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | shell: header, abas, `#view`, lançador, rodapé |
| `js/core.js` | **puro**: normaliza e calcula o retrato. Testável no Node |
| `js/search.js` | **puro**: índice e busca sobre os quatro apps. Testável no Node |
| `js/faturas.js` | **puro**: recalcula faturas da lista canônica + `pv4_*` |
| `js/ajustes.js` | **puro**: serializa/valida o backup de regras e privacidade |
| `js/sync.js` | **puro no núcleo**: URL, mescla e conflito; rede por JSONP/POST |
| `apps_script.gs` | backend opcional dos ajustes (Sheets + token + revisão) |
| `shared/faturas-base.js` | **gerado**: lista canônica (90 itens, já sem o excluído). Não edite à mão |
| `scripts/drift.mjs` | compara dono × cópia, gera a lista canônica |
| `js/store.js` | única ponte com `localStorage` (leitura dos outros apps + `nexo_*`) |
| `js/app.js` | render das três áreas, abas, privacidade, atalhos |
| `js/config.js` | `VERSION` e catálogo dos quatro apps (URL local × GitHub Pages) |
| `sw.js` | Service Worker, escopo `/nexo/` |
| `css/nexo.css` | design system (`--nx-*`), light + dark |
| `theme/nexo-theme.css` | chassi para os quatro apps (opt-in, sem paleta) |
| `theme/demo.html` | vitrine do tema com comparador on/off |
| `test/` | núcleo + guarda de versão |

## Regras críticas

1. **Nunca escreva em chave de outro app.** Só `nexo_*`. O Nexo é somente leitura sobre
   `MATRIX_FINANCE_STATE_v2`, `MARACAJU_STATE_v1`, `ft_local_entries`,
   `ft_local_schedules` e `pv4_*`.
2. **Nada de valor inventado.** Fonte ausente = `null` → a tela mostra `—`. Dado com mais
   de 6 h = chip "desatualizado". Não copie a solução do seed do Matrix, que já causou bug.
3. **`core.js` continua puro.** Sem DOM, sem `localStorage`, sem `fetch`, sem `new Date()`
   escondido — o `now` entra por parâmetro. É o que permite testar.
4. **Uma versão, quatro lugares:** `package.json`, `VERSION` em `js/config.js`,
   `CACHE_NAME` em `sw.js` e o `?v=` de todos os assets do `index.html`. `versao.test.js`
   reprova divergência.
5. **Escopo do PWA é `./`.** Não mexa para `/` — o Nexo não pode capturar as rotas dos
   outros apps nem disputar Service Worker com eles.
6. **UX: informação nunca é cortada.** Nada de `ellipsis` em texto informativo; quebra de
   linha. Alvos de toque ≥ 40 px. Conferir 1440, 768, 390 e 360 px sem overflow horizontal.
7. **Números tabulares.** Todo valor monetário usa `.nx-money` (e portanto respeita o modo
   privacidade). Não escreva valor solto sem essa classe.
8. **Sem bot de busca.** Decisão do dono: onde não der para automatizar, ele insere e
   procura sozinho. A busca é **manual** — `search.js` filtra o que já está no navegador,
   sem sugestão automática, sem sinônimos e sem chamada de rede. Não transforme em chat.
9. **Índice de busca é reconstruído a cada abertura** (`indiceBusca = null` no `render()`).
   Se você adicionar uma fonte nova, inclua em `construirIndice` e em `APP_ORDEM`, e
   teste o novo `porApp` — a busca promete cobrir os quatro apps.
10. **Atribuição por pessoa é regra de nome.** O dono de um gasto sai de
    `donoPadrao()` (conta fixa → casa; diário VA/VR → casa; diário no débito/cartão →
    Matheus) e pode ser trocado por `nexo_regras` (`{tipo:'nome', chave, dono}`).
    Precedência: **nome > categoria > conta > padrão**. Regra é por nome justamente para
    valer nos meses seguintes — não troque para "por id", que quebra a continuidade.
    Trocar o dono **não pode** alterar `gastosTotal`; só `gastosPorDono`. Há teste para isso.
11. **Nome do dono tem 3 valores fixos:** `casa`, `matheus`, `scarlet` (`DONOS` em
    `core.js`). Não invente um quarto sem revisar `DONO_LABEL`, o CSS `.nx-dono--*` e a
    ordem do ciclo em `proximoDono()`.
12. **Não unifique `fisioflow` com `matheus-app-fisioterapia` nem aponte para o produto.**
    A fonte dos atendimentos é a pasta `../matheus-app-fisioterapia`.
13. **Conciliação compara, não soma.** `conciliar()` nunca adiciona a fatura ao caixa: se o
    Matrix já lançou pagamento de cartão (`parecePagamentoDeCartao`), o achado vira
    `duplicidade` (info) e o achado `sobra` **não** é emitido. Se você criar um achado que
    some valores de apps diferentes, prove em teste que não há contagem dupla.
14. **Texto de achado usa placeholders `{chave}`.** Chave terminada em `Pct` vira
    porcentagem; número vira R$. `test/core.test.js` percorre todos os placeholders e falha
    se algum não existir em `valores` — mantenha esse teste.
15. **Ordem dos tons é fixa:** `risco > atencao > ok > info` (`PESO_TOM`). `contarAlertas`
    conta só risco + atenção, porque é o número do chip "N alertas".
16. **"Hoje" só usa data que existe.** `alertas()` lê `history[data][taskId]` do Casa
    Maracaju, `ft_local_schedules` (data/hora/status), `creditDate` do satélite e os
    **vencimentos informados à mão** (`nexo_vencimentos`, por nome de conta). O Matrix
    **não** guarda vencimento (`pago: true/false` só) — conta sem dia informado é
    "a pagar (sem prazo)", nunca alarme falso.
17. **Data sempre local.** Use `isoLocal()`/`somarDias()` de `core.js`; `toISOString()`
    desloca o dia no fuso de São Paulo e faz tarefa de hoje virar de ontem.
18. **Push não existe.** O Nexo não tem servidor: "notificação" aqui é o card "Hoje".
    Se algum dia entrar push, precisa de backend e de um requisito novo do dono.
19. **O tema não pinta.** `theme/nexo-theme.css` mexe em tipografia, forma, foco, números
    e movimento — **nunca** em `background`, `color` ou cor de marca. Um app dos quatro é
    escuro (Faturas); impor paleta quebra o contraste. Se for mexer em cor, é no app, com
    o dono aprovando.
20. **Nenhum dos quatro apps é editado sem pedido explícito do dono.** Eles têm versão
    tripla e Service Worker próprios; adotar o tema exige subir a versão do app. A ordem
    sugerida e os riscos estão em `theme/README.md`.
21. **Faturas: a lista canônica manda.** `shared/faturas-base.js` é **gerado** por
    `npm run drift:gerar` a partir do `index.html` do Faturas. Nunca edite o arquivo à mão;
    edite o dono e regenere. A âncora é **Set/2026 = índice 0** (igual ao app e ao Matrix).
    **Item apagado em todos os meses da janela (`-1` no baseline) sai da lista canônica** —
    decisão do dono em 11/11/2026 sobre o "Cobertura 5/10". Não "restaure" esse item: se
    voltar, ele reaparece no Matrix e no Nexo sem ninguém pedir.
    **Os dois apps carregam `js/faturas-data.js` gerado** e aplicam sobre o array embutido
    (fallback). Não reintroduza edição manual da lista em nenhum deles: rode o gerador.
22. **O Black é UM cartão, pago pela Scarlet.** `satellites.faturas` (app Faturas) e
    `anos[ano][mes].scarlet.faturaNubank` são a **mesma fatura** — o próprio Matrix confirma
    em `getFaturaNubankMes()`, que usa um como fallback do outro. Nunca some os dois
    (dobrava R$ 4.883,05 em R$ 9.718,27) e nunca rotule o cartão como do Matheus:
    `cartoes.matheus` é sempre `null`, `cartoes.black` é o valor único.
    Precedência: ajustes do Faturas → satélite → nó `scarlet` do mês.
23. **`npm run drift` separa ajuste de bug.** O `BASELINE_FATURAS_RAW` do Matrix é um
    retrato do `pv4_*` do Faturas: `-1` = item apagado à mão, valor = editado à mão.
    `divergenciaReal` conta só o que **não** tem essa explicação; se ela for 0, o veredito
    é "nada a corrigir". Não trate diferença explicada como bug — o diagnóstico completo,
    com as evidências, está em `docs/diagnostico-faturas.md`.
24. **Importação valida antes de aplicar.** `lerAjustes()` nunca lança e nunca aplica pela
    metade: recusa JSON inválido, `app` diferente de `nexo`, versão futura e regra com
    dono/tipo desconhecido. Regra inválida é descartada e **contada** na mensagem ao
    usuário. Mantenha `VERSAO_AJUSTES` e o teste de versão futura se mudar o formato.
25. **`NEXO_RAIZ` permite testar um conserto numa cópia** (`$env:NEXO_RAIZ='.tmp/patch'`).
    Use isso para provar uma mudança em app antes de tocar no original.
26. **Nuvem: só as regras viajam.** Privacidade é preferência de cada aparelho e **não** é
    aplicada a partir da nuvem. O token fica em `nexo_sync_token` (local) e **nunca** entra
    no backup JSON nem no payload da planilha além do POST autenticado.
27. **Sync é JSONP para ler e POST `no-cors` para gravar** — o Apps Script não manda CORS.
    A confirmação da escrita é sempre uma leitura seguinte (`sincronizar`), nunca a
    resposta do POST. Conflito é por revisão: se `baseRevisao` não bate, o servidor
    devolve `conflict` e o cliente mescla por `em` (regra mais recente vence).
    Não troque a mescla por "nuvem sobrescreve": isso apaga escolha feita no celular.
28. **`em` é obrigatório no merge.** `normalizarRegras()` precisa preservar `em`; sem ele a
    mescla não distingue a versão nova da velha (bug real, coberto por teste).
29. **Vencimento é digitado, não inferido.** `nexo_vencimentos` guarda
    `{ "<nome normalizado>": dia 1..31 }` — chave por **nome da conta**, valendo em todo
    mês; `dataNoMes()` ajusta dia 31 para o último dia do mês. Conta paga é ignorada;
    conta sem dia é "sem prazo", nunca atrasada. Não deduza vencimento de data de
    pagamento ou de ordem de lista.

## Vizinhança

- `../matrix` — fonte da maior parte dos números (`anos` + `satellites`). O conector
  `js/satellite-connectors.js` de lá define o formato que o Nexo consome. **Se o contrato
  mudar, ajuste `core.js` no mesmo commit.**
- `../maracaju88` — dono do saldo de VA/VR (`settings.benefitsSummary`).
- `../parcelado-a-vista` — dono das faturas (chega ao Nexo via `satellites.faturas`).
- `../matheus-app-fisioterapia` — dono dos atendimentos da Scarlet (`ft_local_entries`).
