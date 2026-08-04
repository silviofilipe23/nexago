# Modal da regra de pico no fluxo do atleta — Design

**Data:** 2026-08-04
**Contexto:** A feature de horário de pico ([spec de 03/08](2026-08-03-horario-pico-minimo-2h-design.md), PR #116) já impede a reserva avulsa em horário concorrido, mas o atleta só percebe a restrição por um badge no chip e pelas opções de duração desabilitadas. Falta explicar **por que** no momento em que ele clica no horário.

## Decisões de produto (aprovadas pelo dono)

1. **Superfícies:** portal web do atleta **e** app Flutter (paridade).
2. **Ação:** o modal explica **e** resolve — botão primário aplica a reserva mínima.
3. **Gatilho:** só quando o mínimo está de fato sendo exigido. Slot que casa com a regra mas está liberado (vizinhas ocupadas ou janela de antecedência aberta) não abre modal — dizer "exige 2h" ali seria falso e mataria uma venda que a arena quer.
4. **Auto-bump removido no web:** o modal pede consentimento antes de mudar a seleção, em vez de ajustar por trás e avisar depois.
5. **Botão mostra o intervalo real** (`Reservar 19h–21h`), podendo mover o início para trás quando essa é a única cadeia possível.

## 1. Gatilho

O modal abre quando um clique resulta numa seleção que **viola** o mínimo de pico. Equivale, na prática, a "sempre que o atleta clicar no horário concorrido", porque clicar sozinho num slot de pico restrito sempre viola.

- **Web** (`arena-booking.component.ts`): `selectStartSlot` define o slot inicial e, se `peakCheckFor([slot]).minSlots > 1`, abre o modal. O auto-bump de duração (`durationSlots.set(minSlots)`) é **removido** — o modal assume esse papel.
- **App** (`slots_page.dart`): `_onSlotTap` executa a lógica de intervalo existente (adicionar/remover slots adjacentes) e, depois do `setState`, se a seleção resultante viola o mínimo, abre o modal. Reclicar o mesmo slot limpa a seleção (comportamento atual preservado), então não há loop.

Não abre quando: a seleção já cumpre o mínimo; o slot não casa com nenhuma regra ativa; o slot está liberado pela janela de antecedência ou por não existir cadeia possível.

## 2. Conteúdo

| Elemento | Conteúdo |
|---|---|
| Chip (opcional) | `rule.label` da arena, quando preenchido |
| Título | `Horário concorrido` |
| Corpo | `{faixa} é o horário mais procurado desta arena. Para a quadra não ficar vaga na hora seguinte, a reserva mínima nesta faixa é de {mínimo}.` |
| Detalhe | `{intervalo} · {preço total}` — exatamente o que será reservado se aceitar |
| Ação primária | `Reservar {intervalo}` (ex.: `Reservar 19h–21h`) |
| Ação secundária | `Escolher outro horário` (só fecha) |

Faixa e mínimo saem da regra que impôs a restrição (`PeakSelectionCheck.rule`), formatados com os helpers de duração já existentes em cada superfície. A copy segue a regra do design do portal: o que houve → consequência → próxima ação.

## 3. Cadeia mínima (correção que o modal força)

Hoje o web só monta cadeia **para frente** (`chainForDuration` a partir do slot inicial). Quando as 21h estão vendidas e a única cadeia possível é 19h+20h, o slot é restrito mas nenhuma opção de duração funciona — beco sem saída. O predicado do servidor já aceita essa reserva; a UI é que não a oferece.

Entra um helper novo, na lib compartilhada web e no Dart — **não** no servidor, que só precisa do booleano que já tem (`chainExistsContaining`); devolver a cadeia lá seria código morto:

```
minimumChainContaining(slot, courtDaySlots, minSlots, now) → cadeia | null
```

Percorre os mesmos offsets de `chainExistsContaining` (de `idx - (minSlots-1)` até `idx`), preferindo a cadeia que **começa no slot clicado** e caindo para as anteriores. Retorna os slots, não só um booleano — é o que o botão primário aplica e o que o detalhe do modal exibe.

Quando o modal abre, essa cadeia sempre existe: se não existisse, o slot estaria liberado e o modal não abriria. O botão primário nunca fica sem destino.

No web, a opção extra de duração (adicionada no PR #116 para quadras de 30min) passa a usar esse helper em vez de `chainForDuration`, o que conserta o beco também no seletor de duração.

## 4. Componentes

**Web** reusa `NxBlockingDialogComponent` (`shared/feedback/`): já tem título, corpo, detalhe, duas ações, foco preso e ARIA, e é declarativo (renderiza dentro de `@if`, sem overlay imperativo global). Tone `warning`. Duas mudanças no componente:

- input opcional `role` (default `alertdialog`, aqui `dialog`) — `alertdialog` é correto para erro, exagerado para uma decisão;
- o doc-comment ganha uma linha reconhecendo o uso de decisão informada, hoje ele diz apenas "erro CRÍTICO".

Estado no componente da grade: um signal `peakPrompt` com a regra, a cadeia e o preço, ou `null`.

**App** usa `showDialog` + `AlertDialog`, o mesmo padrão já usado na própria `slots_page.dart` (lista de espera, alerta de vaga), com `context.themeColors.surfaceSheet` e os botões `TextButton`/`FilledButton` da tela.

## 5. Testes

- **Helper de cadeia** (unit, na lib web e no Dart): cadeia para frente; só para trás; nenhuma (slot liberado); quadra de 30min. O predicado do servidor não muda e sua suíte atual continua valendo como está.
- **Web** (spec): viola → abre; seleção já cumpre → não abre; slot liberado → não abre; ação primária aplica a cadeia e fecha; secundária só fecha.
- **App** (teste Dart da decisão pura): mesma matriz de casos do gatilho, sobre a função que decide abrir, sem widget test.

## Fora do escopo

- "Não mostrar novamente" / persistência de dispensa (o dono pediu explicitamente que apareça sempre).
- Mudança em qualquer regra de negócio do servidor — este trabalho é só UX; a autoridade continua em `ensurePeakRuleSatisfied`.
- Modal no painel da arena ou no fluxo do gestor.
