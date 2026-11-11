# Diagnóstico: os itens de fatura existem duas vezes — **resolvido**

> Atualizado em 2026-11-11. Nenhum app foi alterado.

## A pergunta

O Matrix tem 90 itens de fatura; o Faturas, 91. A diferença era:

```
· Cobertura 5/10 — R$ •••• (de 4 a 4)
· Cotton On 2/3: faturas R$ •••• × matrix R$ ••••
```

Pergunta que eu tinha feito ao dono: *o Cobertura deve aparecer em janeiro/2027?*

## A resposta: não é bug — é ajuste seu

Três evidências, todas no código dos apps:

1. **`BASELINE_FATURAS_RAW` é um retrato do `pv4_*` do app Faturas.**
   Ele traz `extraIdx` em cada extra — campo que só o Faturas produz
   (`result.push({desc, val, tag:'extra', isExtra:true, extraIdx:i, ...})`).
2. **`-1` é como o app Faturas apaga um item.** Em duas linhas do app:
   `overrides[key] = -1` (`index.html:4374`) e `overrides[match.key] = -1` (`:5047`).
   O Matrix lê isso como "não existe" (`if (valor >= 0)`).
3. **O baseline carrega outras edições suas.** `"Borelli (2)__1": 23` — e a lista bruta
   do Faturas tem `Borelli (2)` por `28.00`. É edição manual, não divergência.

E no Git: o Faturas tem o Cobertura desde o **commit inicial** (2026-10-15) e o
`BASELINE_FATURAS_RAW` nasceu pronto no commit `6c25111` (2026-11-09, v98) — ou seja,
o `-1` veio junto com o retrato da sua configuração, não de uma decisão de "esconder
uma despesa" no conector.

**Conclusão:** o Matrix está certo. Você apagou o Cobertura 5/10 e ajustou o Cotton On
para 69,95 no app Faturas; o Matrix reproduz isso. Não há nada a consertar.

## O que a ferramenta passou a fazer

Comparar listas cruas dava falso positivo. Agora `npm run drift` compara o **efeito**:

```
✔ Nada a corrigir: todas as diferenças são ajustes seus no app Faturas.
  (o Matrix aplica os mesmos ajustes — a lista bruta é que difere)

  Apagados por você (1):
    · Cobertura 5/10 — R$ ••••  ⟵ -1 no mês 4

  Valor editado por você (1):
    · Cotton On 2/3: lista R$ •••• → ajustado R$ ••••
```

E quando a diferença **não** tem explicação:

```
✖ Divergência real: 1 diferença(s) sem explicação.
  · <item> — R$ <valor> (de..ate)
  Conserto: alinhar a cópia do Matrix (ou os dois lerem a lista compartilhada).
```

A distinção mora em `divergenciaReal` / `explicadoPeloBaseline`, cobertos por teste.

## O que continua valendo

- **O Nexo não herda mais a cópia:** ele recalcula da lista canônica **aplicando os
  `pv4_over`** do seu aparelho — portanto também respeita a sua exclusão do Cobertura.
  Há teste para isso (`override -1 apaga o item do mês`).
- **A cópia do Matrix ainda existe** (é o que o painel central usa). Ela só vira problema
  se você **criar um item novo** no Faturas e esquecer do Matrix — aí o drift acusa
  "divergência real", que é exatamente o alarme certo.
- **Aposentar a cópia** (os dois lerem `shared/`) continua valendo como Fase 3.2, mas
  deixou de ser urgente: hoje não há nada errado nos números.
