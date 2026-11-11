# Tema compartilhado da casa

Um arquivo. Um `<link>`. Reversível em um segundo.

`nexo-theme.css` unifica o **chassi** dos quatro apps — tipografia, forma, foco,
números e movimento — **sem repintar a identidade de cada um**. A ideia é simples:
mesmo chassi, quatro marcas.

Abra `demo.html` e alterne **Com tema / Sem tema** para ver exatamente o que muda.

---

## O que ele unifica

| Item | Antes (cada app fazia do seu jeito) | Depois |
|---|---|---|
| Tipografia | 4 pilhas diferentes; campos de formulário com fonte do navegador | uma pilha só, herdada até em `input`/`select` |
| Números | valores desalinhados em listas | `tabular-nums` global: colunas de R$ alinham |
| Foco | às vezes só `outline: none` | anel de 3 px na cor da marca, só no teclado |
| Movimento | animações ignorando o sistema | respeita `prefers-reduced-motion` |
| Seleção | azul padrão do navegador | tom da marca |

### O que ainda não é automático: forma

Nenhum dos quatro apps usa `var(--radius)`: cada um tem a sua escala
(`--r-sm`, `--r-md`… no Faturas; valores literais nos outros). Um arquivo único
não consegue mudar isso sem adivinhar seletor. Então, ao adotar, alinhe o raio
**no app**, em uma linha:

```css
:root { --r-md: 14px; --r-lg: 18px; }   /* exemplo no Faturas */
```

Eu preferi documentar do que prometer "forma unificada" e não entregar.

## O que ele NÃO faz (de propósito)

- **Não troca cor de marca.** Terracota continua terracota, verde continua verde.
- **Não define fundo nem cor de texto.** Por isso funciona em tema claro **e** escuro
  sem quebrar contraste — o Faturas é escuro, o Maracaju é claro.
- **Não mexe em layout**: nada de grid, posição, tamanho de componente.

Essa escolha é deliberada: um tema que impõe paleta quebra o app escuro e apaga a
identidade dos outros três. O ganho real de "UX homogêneo" está no chassi.

---

## Como adotar em um app

1. Copie `nexo-theme.css` para a raiz do app.
2. No `<head>`, **depois** do `<style>`/`<link>` do app:
   ```html
   <link rel="stylesheet" href="./nexo-theme.css">
   ```
3. Suba a versão do app (a regra de cada pasta) para o Service Worker não servir
   o HTML antigo em cache.

**Rollback:** apague a linha do `<link>`. O app volta exatamente como era — o arquivo
sozinho não altera nada.

## Ordem de adoção sugerida

| Ordem | App | Por quê |
|---|---|---|
| 1 | Atendimentos | mais isolado, poucas telas densas |
| 2 | Casa Maracaju | usa fonte própria; o delta de tipografia aparece mais |
| 3 | Nexus/Matrix | tem scripts clássicos e CSS grande; conferir 1440 e 360 |
| 4 | Faturas | tema escuro; validar contraste depois do anel de foco |

## Riscos e como checar

- **Reflow de texto**: trocar a fonte muda a quebra de linha. Conferir 1440, 768,
  390 e 360 px, sem overflow horizontal e sem rótulo cortado.
- **Contraste do foco**: o anel usa `--primary` do app; se o app não define, cai em
  `currentColor`. Vale um print em cada app depois de adotar.
- **Nada de JS**: o tema não injeta script, não observa DOM, não altera dados.

## Estado

- `nexo-theme.css` — pronto (v1 do chassi).
- `demo.html` — vitrine com as quatro marcas e o comparador.
- **Aplicado em:** nenhum app ainda. A adoção é decisão do dono, um app por vez.
