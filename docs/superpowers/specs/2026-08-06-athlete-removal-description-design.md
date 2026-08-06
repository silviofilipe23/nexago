# Descrição do organizador ao remover atleta da categoria

**Data:** 06/08/2026
**Branch:** `claude/athlete-removal-description-947a56`

## Problema

Quando o organizador remove um atleta da categoria, a inscrição some sem explicação
nenhuma. Pior: hoje o atleta só é avisado se a inscrição estava paga — remoção de
inscrição não paga é completamente silenciosa. O atleta perde a vaga e descobre
sozinho, sem saber o motivo e sem ter a quem responder.

O fluxo de cancelamento de inscrição já resolveu esse tipo de assimetria nos dois
sentidos: o atleta é **obrigado** a escrever o motivo ao pedir o cancelamento
(`requestRegistrationCancellation`), e o organizador pode responder com um `note`
que chega ao atleta. Falta o caminho equivalente para a remoção feita pelo
organizador.

## Escopo

Tornar obrigatória uma descrição do organizador em toda remoção de atleta da
categoria, entregá-la ao atleta como notificação e deixar rastro auditável.

Fora de escopo: motivos pré-definidos/estruturados (decidido: só texto livre),
tela de histórico de remoções para o atleta, e qualquer automação de estorno — a
plataforma segue sem movimentar dinheiro na remoção, como já é hoje.

## Decisões

| Questão | Decisão |
|---|---|
| Descrição obrigatória ou opcional | **Obrigatória**, mín. 10 e máx. 500 caracteres |
| Onde a descrição fica | **Notificação ao atleta + auditoria**; não há doc de inscrição pra guardar (é deletado) |
| Formato | **Texto livre**, sem chips nem motivo estruturado |
| Retrocompatibilidade | **Exigir no servidor**; app antigo da store passa a receber erro até atualizar |

A remoção deleta o doc da inscrição, então a descrição não tem onde morar no
Firestore do lado do atleta. O canal durável que já existe é
`users/{uid}/notifications`, escrito por `deliverNotificationToUser` — persiste e é
renderizado tanto no app (`athlete_notifications_page.dart`) quanto no portal do
atleta (`athlete-notifications.component.ts`).

## Arquitetura

### 1. Lógica pura — `functions/src/organizer-removal-description.ts` (novo)

Módulo sem I/O, no mesmo padrão de `tournament-cancellation-request.ts`:

- `MIN_REMOVAL_DESCRIPTION_LENGTH = 10`, `MAX_REMOVAL_DESCRIPTION_LENGTH = 500`
- `parseRemovalDescription(raw: unknown): { ok: true; value: string } | { ok: false; message: string }`
  — faz `trim`, valida os limites e devolve a mensagem em português pronta para o
  `HttpsError`.
- `buildRemovalNotificationBody(params: { description: string; wasPaid: boolean; refundAmount: number }): string`
  — devolve a descrição do organizador e, quando `wasPaid`, concatena o aviso de
  reembolso que hoje é montado inline na callable (`Reembolso de R$ X será tratado
  pelo organizador.` / `Procure o organizador para tratar do reembolso.`).

Testes em `functions/src/organizer-removal-description.test.ts`: vazio, só espaços,
9 caracteres, 10 caracteres, 501 caracteres, trim das pontas, corpo com e sem
reembolso, corpo pago com `refundAmount = 0`.

### 2. Callable — `organizerRemoveFromCategory` (`functions/src/organizer-category-ops.ts:459`)

Mudanças, mantendo o retorno atual `{ok, refundPending, refundAmount}`:

1. Lê `request.data.description`, valida com `parseRemovalDescription`; inválida →
   `HttpsError('invalid-argument', mensagem)`. A validação roda **depois** de
   `assertCanManageTournament`, para não vazar existência de inscrição a quem não
   gerencia o torneio.
2. Destinatários passam a vir de `registrationAthleteUids(registration, team)`
   (`tournament-registration-pix-helpers.ts:96`) em vez do par
   `team.player1Id`/`team.player2Id` lido inline. O código atual devolve lista
   vazia quando a inscrição não tem `teamId`, ou seja, **hoje uma inscrição paga sem
   equipe não notifica ninguém**. Como a notificação passa a ser o único lugar onde
   o feedback existe, esse buraco fecha junto.
3. Notifica **sempre**, não só quando paga. Título `Inscrição cancelada`, tipo
   `tournament_registration_cancelled` (já tem ícone e rota em
   `athlete_notifications_logic.dart:286` e `notification_navigation.dart:99`),
   corpo vindo de `buildRemovalNotificationBody`. Cada envio segue com
   `.catch(() => undefined)`: falha de push não pode abortar a remoção.
4. Grava auditoria antes do delete, no mesmo batch, em
   `tournamentRegistrationCancellations` — a coleção que
   `respondRegistrationCancellationRequest` já usa ao aprovar:

   ```ts
   batch.set(auditRef, {
     ...buildRegistrationCancellationAudit({registrationId, cancelledBy: uid, athleteUids, registration}),
     cancelledAt: FieldValue.serverTimestamp(),
     removedByOrganizer: true,
     removalDescription: description,
   });
   batch.delete(ref);
   ```

   Hoje a remoção pelo organizador não deixa rastro nenhum — só um `ref.delete()`.

Sem mudança em `firestore.rules`: `tournamentRegistrationCancellations` não tem
rules, logo só o Admin SDK escreve e lê.

### 3. Portal do organizador — `inscricoes.component.ts`

O `confirm()` nativo em `remove()` sai. "Remover da categoria" passa a abrir um
bloco inline dentro de `og-inscricoes-actions`, espelhando o bloco `og-cancel-req`
que já vive ali — classes novas `og-remove-req`, `og-remove-req-title`,
`og-remove-req-warn`, `og-remove-req-input` e `og-remove-req-actions`, com os
mesmos estilos das equivalentes `og-cancel-req-*`:

- Título "Remover da categoria"
- `textarea` com `maxlength="500"`, placeholder "Explique ao atleta o motivo da
  remoção"
- Aviso de reembolso (`refundNotice`, já existente) quando a inscrição é paga
- Botões "Confirmar remoção" — desabilitado enquanto o texto tiver menos de 10
  caracteres após `trim` — e "Cancelar", que fecha o bloco

Estado: signal próprio `removeReason = signal('')` e `removeFor = signal<string | null>(null)`,
separados do `responseNote`/`actionsFor` do pedido de cancelamento, para não vazar
texto de um fluxo no outro. `toggleActions` limpa os dois.

`removeFromCategory(registrationId)` em `organizer-ops.service.ts:48` ganha o
segundo parâmetro `description` e o repassa na chamada.

### 4. App Flutter — `organizer_team_actions_sheet.dart`

O `AlertDialog` de confirmação em `organizer_team_actions_sheet.dart:308` vira um
widget próprio no mesmo arquivo, `_RemoveFromCategoryDialog` (`StatefulWidget`,
porque precisa reagir ao texto digitado para habilitar o botão), que devolve a
descrição via `Navigator.pop(ctx, texto)`:

- Mantém o texto de reembolso que já aparece quando `paidAmountCents > 0`
- `TextField` multiline, `maxLength: 500`, label "Motivo para o atleta"
- "Remover" habilita só com 10+ caracteres após `trim`

`OrganizerCategoryOpsService.removeFromCategory` ganha
`required String description` e envia no payload.

## Fluxo

```
Organizador (portal ou app)
  → escreve a descrição (>= 10 chars) e confirma
  → organizerRemoveFromCategory({registrationId, description})
      → assertCanManageTournament
      → valida a descrição
      → batch: auditoria (com removalDescription) + delete da inscrição
      → notifica TODOS os atletas da inscrição
          corpo = descrição [+ aviso de reembolso, se paga]
  → atleta recebe push e vê a mensagem em /notificacoes (app e portal)
```

## Erros

| Situação | Resposta |
|---|---|
| Sem login | `unauthenticated` — "Login necessário" |
| `registrationId` vazio | `invalid-argument` — "registrationId obrigatório" |
| Inscrição inexistente | `not-found` — "Inscrição não encontrada" |
| Não gerencia o torneio | o que `assertCanManageTournament` já lança |
| Descrição vazia ou < 10 | `invalid-argument` — "Escreva o motivo da remoção para o atleta (mínimo 10 caracteres)." |
| Descrição > 500 | `invalid-argument` — "O motivo deve ter no máximo 500 caracteres." |
| Falha ao notificar | engolida (`catch`); a remoção conclui, o erro vai pro log |

## Testes

- **Unitários (`functions`)**: `organizer-removal-description.test.ts` cobrindo
  validação e montagem do corpo, conforme a lista da seção 1. Suíte completa do
  `functions` tem que passar.
- **Manual**: remover inscrição não paga (atleta recebe notificação com o texto —
  hoje não recebe nada) e remover inscrição paga (texto + aviso de reembolso no
  mesmo corpo), nas duas superfícies.

## Deploy

Ordem: **functions → portal do organizador → app**.

Entre o deploy da function e a publicação do app, a remoção pelo app antigo da
store passa a falhar com "Escreva o motivo da remoção para o atleta". É a escolha
deliberada de exigir no servidor — mesma decisão tomada no cancelamento de
inscrição meio-paga. O portal web atualiza sozinho e cobre o organizador de
imediato.

Sem mudança em `firestore.rules`.

## Referências

- `docs/superpowers/specs/2026-08-06-athlete-registration-cancellation-design.md`
- `docs/superpowers/specs/2026-08-06-cancellation-request-to-organizer-design.md`
