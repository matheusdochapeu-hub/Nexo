# Nexo · estado do projeto

> Retrato de **11/11/2026**. Serve para retomar o trabalho sem reler o histórico.
> O detalhe técnico e as regras de negócio vivem em [`AGENTS.md`](AGENTS.md).

## Onde cada app está

| App | Versão publicada | O que mudou por causa do Nexo |
|---|---|---|
| **Nexo** | `0.13.0` | o próprio shell |
| **Matrix** | `v134` | consome `js/faturas-data.js` gerado (desde a v132) |
| **Faturas** | `4.3.0` | consome `js/faturas-data.js` gerado |
| **Atendimentos** | cache `atend-v67` | adotou o tema (1 linha + CSS) |
| **Casa Maracaju** | `2.7.4` | **intocado** |

Todos publicados no GitHub Pages e verificados por HTTP.

## O que o Nexo entrega

- **Fase 1** — áreas Casa / Matheus / Scarlet, KPIs, lançador, modo privacidade,
  avisos de dado velho.
- **Fase 2** — atribuição de gastos por dono (regra por nome, troca por toque),
  busca global manual (`/` ou `Ctrl+K`), conciliação cruzada e card "Hoje".
- **Fase 3** — tema compartilhado (`theme/`), lista canônica de faturas sem cópia
  à mão, exportar/importar ajustes, sincronização opcional por Apps Script,
  botão "Baixar o app".

Extras pedidos no caminho: vencimentos digitados à mão, dock fixo no topo com os
quatro apps, cartão Black como um só (pago pela Scarlet).

## Decisões que **não** devem ser desfeitas

1. **O Black é um cartão só** (`cartoes.black`), pago pela **Scarlet**.
   `matheus` é sempre `null`. Somar satélite + nó `scarlet` dobrava a fatura.
2. **"Cobertura 5/10" não existe mais** na lista canônica (excluído pelo dono em
   todos os meses). Se voltar, reaparece no Matrix e no Nexo.
3. **Ninguém mantém a lista de faturas à mão**: `shared/` é a fonte, e os dois
   apps carregam um `faturas-data.js` **gerado**. Para mudar item, edite o Faturas
   e rode `npm run drift:gerar`.
4. **O tema não pinta** — só tipografia, forma, foco, números e movimento.
5. **Sem bot de busca** e **sem escrita em chave de outro app** (`nexo_*` apenas).
6. **Um app só é editado com pedido explícito do dono.**

## Como retomar

```powershell
# testes (na pasta do app)
node --test 'nexo\test\*.test.js'        # 137
node --test 'matrix\test\*.test.js'      # 22
node --test 'parcelado-a-vista\tests\*.test.js'   # 104
node --test 'matheus-app-fisioterapia\test\*.test.js'  # 95

# a lista canônica bate com o dono?
npm run drift            # dentro de nexo/

# regenerar os artefatos depois de editar o Faturas
npm run drift:gerar
```

Publicar = commitar na `main`. O Pages reconstrói sozinho.

O Node do workspace fica em `..\node-bin\PFiles64\nodejs\node.exe`.

## Pendências conhecidas (nada urgente)

| Item | Situação |
|---|---|
| **Apps Script da nuvem** | escrito e revisado, **nunca implantado nem testado ao vivo**. Só vale quando o dono publicar a `/exec` e colar URL + token em Ajustes. |
| **Tema nos outros três apps** | só o Atendimentos adotou. Casa Maracaju, Faturas e Matrix têm uma linha cada — mas a Fase 3.1 dizia "não aplicado"; é decisão do dono. |
| **Instalar no iPhone** | Safari não dispara `beforeinstallprompt`; o botão não aparece. Falta um fallback com a instrução "Compartilhar → Adicionar à Tela de Início". |
| **Valores reais no repo público** | `docs/preview-*.jpg`, `shared/faturas-base.json` e os artefatos gerados têm valores da casa. O repo `Nexo` é público. |
| **Ícones do Atendimentos** | três PNGs estão modificados no working tree daquele repo (não é trabalho do Nexo; não commitei). |
| **Duas telas para o mesmo fato** | a conciliação mostra "fatura acima da meta" e "cartão da Scarlet passa dos ganhos" — medem coisas diferentes, mas é repetitivo. |

## Mapa rápido

| Quero mexer em… | Arquivo |
|---|---|
| cálculo e regras | `nexo/js/core.js` (puro, testável) |
| tela | `nexo/js/app.js` |
| leitura dos outros apps | `nexo/js/store.js` (única ponte com `localStorage`) |
| lista canônica | `nexo/scripts/drift.mjs` → `nexo/shared/` |
| tema | `nexo/theme/nexo-theme.css` |
| nuvem | `nexo/apps_script.gs` + `nexo/js/sync.js` |
