# Cancelamento de inscrição pelo atleta — Design

**Data:** 2026-08-06
**Escopo aprovado:** cancelamento apenas de inscrição **sem nenhum pagamento** (nem `isPaid`, nem parcela em `sharePaidUids`), exposto no app Flutter e no portal web do atleta. Inscrição com qualquer pagamento continua "fale com o organizador" — sem estorno automático nesta versão.

## Contexto

Hoje existe a callable `cancelTournamentRegistration` (`functions/src/tournament-partner-invite.ts:756`), usada apenas dentro do fluxo de inscrição do app (passo de pagamento). Ela bloqueia `isPaid === true`, cancela convites pendentes, notifica o parceiro e faz hard delete do doc de inscrição em `artifacts/{projectId}/public/data/inscriptions/{registrationId}`.

Lacunas atuais:

- Não cancela cobrança PIX aberta no Asaas nem limpa a subcoleção `pixPending` → cobrança viva; se paga depois, o webhook cai em `orphan` e o dinheiro fica sem inscrição.
- Não deleta o doc `teams` da dupla → team órfão.
- Permite cancelar dupla onde um dos dois já pagou a metade (`sharePaidUids`), sem estorno — dinheiro perdido.
- Hard delete sem trilha de auditoria; sem testes.
- Nenhum botão em "Meus torneios" (app) nem em lugar algum do portal web do atleta.
- A notificação `tournament_registration_cancelled` não tem tratamento no app (cai no default sem ícone/rota).
- No passo "Aguardando" do fluxo de inscrição, o botão rotulado "Cancelar inscrição" na verdade cancela só o convite.

## Decisões de escopo

1. **Só inscrição sem pagamento algum.** `isPaid === true` OU `sharePaidUids` não vazio → bloqueio com `failed-precondition` e mensagem "Já existe pagamento nesta inscrição. Fale com o organizador."
2. **Superfícies:** app Flutter (Meus torneios + fluxo de inscrição) e portal web do atleta (aba "Minha inscrição" + card de acompanhamento do painel).
3. **Abordagem:** endurecer a callable existente (mesmo nome e contrato), manter o modelo atual de hard delete + estado derivado de flags. Sem `status: 'cancelled'` persistido.
4. **Auditoria:** doc de log gravado antes do delete (para disputas de suporte).
5. **Sem bloqueio por prazo/chave:** inscrição sem pagamento nunca entra na chave (`generateCategoryBracket` filtra `isPaid === true`); cancelar reserva morta após fechamento é inofensivo.

## 1. Backend — callable `cancelTournamentRegistration`

Mesmo contrato de entrada (`{registrationId}`). Mudanças:

1. **Bloqueio ampliado:** `isPaid === true` OU `sharePaidUids.length > 0` → `failed-precondition` "Já existe pagamento nesta inscrição. Fale com o organizador."
2. **Cancelar PIX aberto:** para cada doc da subcoleção `pixPending` com `status: 'pending'`, cancelar a cobrança no Asaas (reaproveitar a lógica interna de `cancelPendingTournamentRegistrationPix` em `functions/src/tournament-registration-pix.ts:368` — que hoje quebra em inscrição solo por exigir `teamId`) e **deletar** os docs `pixPending` (subcoleção não é apagada junto com o doc pai). Falha no Asaas → abortar com erro, nada é deletado.
3. **Team órfão:** se a inscrição tem `teamId` não vazio, deletar `artifacts/.../teams/{teamId}` **somente se** nenhuma outra inscrição referencia o mesmo `teamId` (query `inscriptions where teamId == X` excluindo a própria).
4. **Auditoria:** antes do delete, gravar doc em coleção nova `tournamentRegistrationCancellations/{autoId}`: `registrationId`, `tournamentId`, `categoryId`, `cancelledBy` (uid), `participantUids`, `cancelledAt` (server timestamp) e `registrationSnapshot` (mapa com o doc inteiro). Sem rule declarada → deny por default, só Admin SDK.
5. **Mantém:** validação de que o caller é um dos atletas da inscrição, cancelamento de convites `pending` ligados (`status:'cancelled'`, `cancelReason:'registration_cancelled'`), notificação `tournament_registration_cancelled` ao parceiro, hard delete do doc.

**Ordem de execução:** validar → cancelar cobranças no Asaas (chamada externa, idempotente) → batch Firestore (auditoria + delete de `pixPending` + delete condicional de `teams` + delete da inscrição + update dos convites) → notificar parceiro.

## 2. App Flutter

- **"Meus torneios"** (`nexago_app/lib/features/tournaments/presentation/widgets/my_tournaments/my_tournaments_ongoing_card.dart`): ação "Cancelar inscrição" no card da inscrição em andamento, visível apenas quando cancelável (`!isPaid && sharePaidUids.isEmpty`). Dialog de confirmação no mesmo padrão de `_confirmCancelRegistration` do fluxo de inscrição. Chama `TournamentPartnerInviteService.cancelRegistration` (já existe).
- **Passo de pagamento** (`tournament_registration_payment_step.dart`): esconder "Cancelar reserva" quando `sharePaidUids` não vazio; no lugar, hint "Já existe pagamento — fale com o organizador".
- **Passo "Aguardando"** (`tournament_registration_waiting_step.dart`): o botão "Cancelar inscrição" passa a chamar o cancelamento real da inscrição (a callable já cancela os convites junto), em vez de `_cancelInvite`.
- **Notificação:** tratar `tournament_registration_cancelled` em `athlete_notifications_logic.dart` (ícone/título) e `notification_navigation.dart` (rota para o detalhe do torneio).

## 3. Portal web do atleta

- **Repository** (`frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts`): wrapper novo `cancelTournamentRegistration(registrationId)` chamando a callable.
- **Aba "Minha inscrição"** (`frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.ts`): botão "Cancelar inscrição" quando cancelável, dialog de confirmação do sistema de feedback existente (superfície dialog), toast de sucesso; o stream atualiza a tela sozinho.
- **Card de acompanhamento do painel** (`frontend/projects/athlete/src/app/painel/at-registration-tracker.component.ts`): link discreto "Cancelar inscrição" com o mesmo dialog.
- Estados de erro da callable exibidos via toast (mensagem vinda do backend).

## 4. Firestore rules

Endurecer o `delete` de `inscriptions` (`firestore.rules:1770-1808`) para `isAdmin()` apenas. O caminho de delete direto pelo cliente não é usado por nenhum client e já quebra em inscrição solo (o predicado depende de `teams/{teamId}` que não existe). Pré-condição no plano: grep nos três clients por delete direto em `inscriptions` antes de fechar a rule.

## 5. Testes

- **Functions:** testes unitários da callable — casos: não paga cancela ok; meio-paga (`sharePaidUids`) bloqueia; paga bloqueia; solo sem `teamId` não tenta deletar team; team referenciado por outra inscrição não é deletado; PIX pendente é cancelado no Asaas e `pixPending` limpo; falha no Asaas aborta sem deletar; auditoria gravada; caller que não é da inscrição recebe `permission-denied`.
- **Flutter:** testes da condição "cancelável" e do fluxo do dialog (agente flutter-test-engineer).
- **Web:** spec do botão/dialog com TestBed zoneless (`provideZonelessChangeDetection()`).

## 6. Deploy e retrocompatibilidade

Ordem: functions → rules → app/web. A callable mantém nome e contrato; app antigo chamando em inscrição meio-paga passa a receber a mensagem de bloqueio nova (comportamento desejado, fecha o buraco de dinheiro perdido). Rules endurecidas não afetam nenhum fluxo em uso.

## Fora de escopo (registrado para o futuro)

- Cancelamento de inscrição paga com estorno (exigiria `debitOrganizerWallet`, janela de cancelamento, bloqueio por chave publicada — padrão de referência: `leaveArenaClubSession` em `functions/src/arena-club-join.ts:454`).
- Promoção automática da lista de espera quando uma vaga é liberada.
- Sweeper agendado para PIX de inscrição expirado.
