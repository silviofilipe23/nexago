# Pedido de cancelamento ao organizador — Design

**Data:** 2026-08-06
**Continuação de:** `2026-08-06-athlete-registration-cancellation-design.md` (que cobriu o cancelamento direto, só de inscrição SEM pagamento).

**Escopo aprovado:** inscrição COM pagamento não é cancelada pelo atleta nem estornada pela plataforma. Em vez disso, o atleta envia um **pedido de cancelamento** ao organizador, que aprova (libera a vaga) ou recusa. **A devolução do dinheiro acontece fora da plataforma, direto entre atleta e organizador — e isso precisa estar explícito na UI.**

## Contexto

Hoje a inscrição paga bate no bloqueio da callable com a mensagem "Fale com o organizador", e não há canal nenhum para isso: a exploração confirmou que **não existe nenhum canal atleta→organizador** na plataforma (`contactMessages` vai para o admin, não para o organizador) e que **o organizador não tem inbox** — o sino do portal (`panel-inicio.component.ts:70`) é decorativo, sem clique e sem rota, e nenhuma notificação de torneio tem o organizador como destinatário.

Por isso o pedido precisa aparecer **onde o organizador já olha**: a tela de Inscrições (portal) e a lista de duplas da categoria (app).

## Decisões

1. **Onde o organizador vê:** tela de Inscrições / lista de duplas (não criar inbox — feature separada).
2. **Ações do organizador:** aprovar (remove a inscrição e libera a vaga) ou recusar (mantém a inscrição), ambas com resposta curta opcional e notificação ao atleta.
3. **Contato:** além do aviso, o atleta ganha botão "Falar com o organizador" (WhatsApp) — exige expor o telefone do organizador por callable.
4. **Superfícies:** atleta em app + portal; organizador em portal + app.
5. **Reembolso:** fora da plataforma, sem controle nenhum do sistema, com aviso explícito em quatro pontos do fluxo.

## 1. Modelo de dados

Mapa `cancellationRequest` no doc da inscrição (`artifacts/{projectId}/public/data/inscriptions/{id}`), sempre escrito **inteiro de uma vez** — nunca por caminho com ponto (`set(merge)` não interpreta ponto como caminho; foi a causa do bug dos palpites):

```
cancellationRequest: {
  status: 'pending' | 'declined',   // 'approved' não persiste: a inscrição é deletada
  reason: string,                   // mensagem escrita pelo atleta
  requestedBy: uid,
  requestedAt: Timestamp,
  respondedBy: uid | null,
  respondedAt: Timestamp | null,
  responseNote: string,             // resposta do organizador
}
```

Padrão da casa: igual a `waitlist`, só Cloud Function escreve.

## 2. Backend — três callables

### `requestRegistrationCancellation({registrationId, reason})`
- Guard: caller é um dos atletas da inscrição (`registrationAthleteUids`).
- **Só aceita quando HÁ pagamento** (`isPaid` ou `sharePaidUids`/`paidAmount`): sem pagamento o caminho é `cancelTournamentRegistration`, e dois caminhos para a mesma coisa confundem.
- Recusa pedido duplicado com `status: 'pending'`.
- Grava o mapa e notifica o organizador (`managerId`) — primeiro caso de notificação de torneio para o organizador; ele não tem inbox para reler, mas o push chega e o badge na tela cobre o resto.

### `respondRegistrationCancellationRequest({registrationId, approve, note})`
- Guard: `assertCanManageTournament`.
- **Aprovar:** reusa o núcleo de `organizerRemoveFromCategory` (auditoria em `tournamentRegistrationCancellations` + delete da inscrição + vaga liberada). Notifica o atleta.
- **Recusar:** grava `status: 'declined'`, `responseNote`, `respondedBy/At`. Notifica o atleta; ele pode pedir de novo.

### `getTournamentOrganizerContact({tournamentId})`
- Espelho invertido de `getTournamentAthleteContacts`.
- Guard: caller tem inscrição no torneio.
- Devolve `{name, whatsappPhone}` de `users/{managerId}.organizerProfile.contactPhone`, com fallback para `phoneNumber`.
- Existe porque `users/{outro}` é fechado: hoje o app lê o telefone do organizador pela brecha `userDocIsPublicAthlete` das rules e falha calado quando o organizador não é atleta público.
- `normalizePhoneForWhatsApp` (hoje privado em `organizer-category-ops.ts:39`) é extraído para módulo compartilhado.

## 3. UI do atleta (app Flutter + portal web)

- Onde hoje há o texto morto "Já existe pagamento nesta inscrição — fale com o organizador", entra o botão **"Solicitar cancelamento"**.
- Formulário com campo de motivo (obrigatório) + aviso da seção 5.
- Pedido pendente: estado **"Cancelamento solicitado · aguardando o organizador"** + botão **"Falar com o organizador"** (WhatsApp com texto pré-preenchido).
- Recusado: mostra a resposta do organizador e libera novo pedido.
- Aprovado: a inscrição some (foi deletada); o atleta recebe a notificação.

## 4. UI do organizador (portal web + app Flutter)

**Portal** (`painel/inscricoes/inscricoes.component.ts`):
- Pílula vermelha "Cancelamento solicitado" na linha (a lista já tem duas colunas de pílula — Pagamento e LGPD; esta é a terceira).
- KPI "Cancelamentos" no topo, ao lado de "Pagamentos pendentes".
- Aba nova no filtro existente: `todos | pago | pendente | espera | cancelamento`.
- Na gaveta de ações: bloco com o motivo do atleta, campo de resposta e botões Aprovar / Recusar (reusa o `run(key, action, okMessage)` que já dá spinner por botão).
- Mapear o campo novo em `inscriptions-repository.ts` (`RawInscription` e `TournamentInscription`).

**App** (`organizer_category_teams_page.dart` + `organizer_team_list_tile.dart` + `organizer_team_actions_sheet.dart`):
- Terceira pílula na linha, seguindo `_StatusPill`/`_LgpdPill`.
- Mesmo bloco de resposta no sheet de ações.
- Estado novo nos enums `OrganizerTeamRegistrationStatus` / `OrganizerCategoryTeamFilter`.

## 5. Copy explícita (requisito do dono)

Quatro pontos, sempre a mesma mensagem:

| Momento | Texto |
|---|---|
| Atleta, antes de enviar | "A nexaGO não processa o reembolso. Ao aprovar, o organizador libera sua vaga — a devolução do valor pago é combinada diretamente com ele, fora da plataforma." |
| Atleta, pedido pendente | "Aguardando o organizador. Combine a devolução do valor diretamente com ele." |
| Organizador, ao responder | "Aprovar remove a inscrição e libera a vaga. A nexaGO não processa o reembolso — combine a devolução diretamente com o atleta." |
| Notificação de aprovado | "Cancelamento aprovado. Sua vaga foi liberada. Combine a devolução do valor com o organizador." |

## 6. Firestore rules

Novo helper `inscriptionCancellationRequestFieldsUnchanged()` no `allow update` de inscriptions, no formato de `inscriptionEnrollmentFieldsUnchanged()` — impede o cliente de forjar um pedido ou se auto-aprovar. Escrita continua 100% via callable.

## 7. Testes

- **Functions:** lógica pura das transições (pedido só com pagamento, duplicado bloqueado, aprovar deleta + audita, recusar mantém, guards de atleta e de organizador, contato só para inscrito).
- **Web:** specs zoneless da lista do organizador (pílula, KPI, filtro) e do fluxo do atleta.
- **App:** widget tests da pílula, do sheet e do formulário de pedido.

## 8. Deploy

Ordem: functions → rules → app/web. Retrocompatível: inscrição sem `cancellationRequest` se comporta exatamente como hoje.

## Fora de escopo (registrado)

- Estorno automático e débito de carteira do organizador (`debitOrganizerWallet` não existe).
- Inbox/notificações do organizador (o sino continua decorativo).
- Prazo/janela limite para pedir cancelamento.
- Resposta do atleta à resposta do organizador (não é um chat).
