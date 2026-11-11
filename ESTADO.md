# Nexo · estado do projeto

> Retrato de **11/11/2026**. Serve para retomar o trabalho sem reler o histórico.
> O detalhe técnico e as regras de negócio vivem em [`AGENTS.md`](AGENTS.md).

## Onde cada app está

| App | Versão publicada | O que mudou por causa do Nexo |
|---|---|---|
| **Nexo** | `0.14.0` | o próprio shell |
| **Matrix** | `v135` | lista de faturas gerada + tema |
| **Faturas** | `4.4.0` | lista de faturas gerada + tema |
| **Atendimentos** | cache `atend-v67` | tema |
| **Casa Maracaju** | `2.7.10` | tema |

**O tema está nos quatro apps.** Todos publicados no GitHub Pages.

## O que o Nexo entrega

- **Fase 1** — áreas Casa / Matheus / Scarlet, KPIs, dock, privacidade, avisos de dado velho.
- **Fase 2** — dono de cada gasto (regra por nome), busca global manual, conciliação, "Hoje".
- **Fase 3** — tema compartilhado, lista canônica de faturas sem cópia à mão,
  exportar/importar ajustes, nuvem opcional por Apps Script, botão "Baixar o app".

Extras pedidos no caminho: vencimentos digitados à mão, dock fixo no topo, cartão Black
como um só (pago pela Scarlet).

## Decisões que **não** devem ser desfeitas

1. **O Black é um cartão só** (`cartoes.black`), pago pela **Scarlet**; `matheus` é sempre
   `null`. Somar satélite + nó `scarlet` dobrava a fatura.
2. **"Cobertura 5/10" não existe mais** na lista canônica. Se voltar, reaparece em dois apps.
3. **Ninguém mantém a lista de faturas à mão**: `shared/` é a fonte e os apps carregam um
   `faturas-data.js` **gerado**. Para mudar item: edite o Faturas e rode `npm run drift:gerar`.
4. **O tema não pinta** — tipografia, forma, foco, números e movimento; nunca cor de marca.
5. **Sem bot de busca** e **sem escrita em chave de outro app** (`nexo_*` apenas).
6. **Um app só é editado com pedido explícito do dono.**

## Atendimentos da Scarlet

O Nexo lia só `ft_local_entries` (só existe no navegador onde o app dela foi aberto) — em
outro aparelho a área ficava vazia. Agora, quando o dado local falta ou o retrato guardado
tem mais de 6 h, ele busca no **Apps Script dela por JSONP** e guarda em `nexo_atend_cache`.

- `js/atendimentos.js` — mapeia `{atendimentos, agendamentos}` para o formato do core.
- Precedência: **local > cache da nuvem > vazio**. O dado do aparelho nunca é sobrescrito.
- Só leitura: o Nexo não escreve na planilha dela.
- Verificado contra a resposta real (121 lançamentos e 85 agendamentos, mapeados 121/121).

## A nuvem

`apps_script.gs` está **testado** por `nexo/test/nuvem.test.js` (9 casos, Sheets simulado):
token obrigatório, JSONP, gravação com revisão, conflito que não sobrescreve, limite de
tamanho, regra inválida descartada, trava liberada no conflito.

O teste achou um bug real: ao deduplicar, o servidor **perdia o `em`** da regra anterior —
e é o `em` que decide a mescla. Corrigido (a última regra manda no dono, o `em` mais novo
sobrevive).

**O que só um deploy prova:** permissões, criação das abas, `LockService` sob concorrência
e o comportamento do Google. Passo a passo em `apps_script.gs` (cabeçalho, 5 minutos).

## Como retomar

```powershell
node --test 'nexo\test\*.test.js'                      # 146
node --test 'matrix\test\*.test.js'                    # 22
node --test 'parcelado-a-vista\tests\*.test.js'        # 104
node --test 'maracaju88\test\**\*.test.js'             # 167
node --test 'matheus-app-fisioterapia\test\*.test.js'  # 95

npm run drift        # a lista canônica bate com o dono?
npm run drift:gerar  # regenera os artefatos depois de editar o Faturas
```

Publicar = commitar na `main`. O Pages reconstrói sozinho.
Node do workspace: `..\node-bin\PFiles64\nodejs\node.exe`.

## Pendências conhecidas (nada urgente)

| Item | Situação |
|---|---|
| **Implantar o Apps Script do Nexo** | único passo que falta para a sincronização de ajustes. Os atendimentos da Scarlet **já vêm da nuvem** (endpoint dela, que está no ar). |
| **iPhone** | decisão do dono: fica sem botão de baixar (Safari não tem o prompt). |
| **Só as prévias foram mascaradas** | `docs/preview-*.jpg` e o diagnóstico agora vêm com privacidade ligada. **Os dados gerados (`shared/`, `faturas-data.js`) continuam com valores reais**, porque espelham apps que já são públicos — esconder aqui não esconderia nada. |
| **Ícones do Atendimentos** | três PNGs modificados no working tree daquele repo desde 10/11 16:43, antes desta sessão. Não são do Nexo. |
| **Duas telas para o mesmo fato** | "fatura acima da meta" e "cartão da Scarlet passa dos ganhos" medem coisas diferentes, mas é repetitivo. |

## Mapa rápido

| Quero mexer em… | Arquivo |
|---|---|
| cálculo e regras | `nexo/js/core.js` (puro, testável) |
| tela | `nexo/js/app.js` |
| leitura dos outros apps | `nexo/js/store.js` (única ponte com `localStorage`) |
| lista canônica | `nexo/scripts/drift.mjs` → `nexo/shared/` |
| tema | `nexo/theme/nexo-theme.css` |
| nuvem | `nexo/apps_script.gs` + `nexo/js/sync.js` |
