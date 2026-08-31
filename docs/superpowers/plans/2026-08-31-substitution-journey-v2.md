# Jornada de Substituição v2 (app) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o fluxo de substituição do app (hoje um bottom-sheet) na jornada de telas dos mockups: detalhe da inscrição → wizard (quem sai + motivo → quem entra) → acompanhamento do convite → sucesso; com motivo persistido, read-receipt e lembrete no backend.

**Architecture:** Reusa TODA a base do PR #359 (callables, lógica pura, service, modelos). Backend ganha 2 campos opcionais no envio e 2 callables pequenas no MESMO arquivo `tournament-substitution.ts`. No app, o sheet é aposentado; nascem 5 páginas roteadas na feature tournaments, com lógica pura nova (countdown/labels) testável isolada.

**Tech Stack:** Cloud Functions TS + matriz no emulador; Flutter/Riverpod/GoRouter; share_plus ^10.

**Spec:** docs/superpowers/specs/2026-08-31-substitution-journey-v2-design.md (o design aprovado; os mockups do dono guiam o visual, as regras da spec prevalecem).

## Global Constraints

- Gate INALTERADO: publicação das chaves; countdown das telas usa `expiresAt` do convite (TTL 48h). Nenhuma mudança em `substitutionBlockReason`/gate.
- Regras/rules do Firestore INTOCADAS (viewedAt/lastReminderAt gravados só por callable Admin).
- `reason` ∈ {lesao, imprevisto, trabalho, viagem, outro} (string livre no doc; validar no envio quando presente); `reasonNote` ≤ 300 chars. Ambos opcionais — clientes antigos continuam funcionando.
- Labels PT dos motivos: lesao→"Lesão", imprevisto→"Imprevisto pessoal", trabalho→"Trabalho", viagem→"Viagem", outro→"Outro".
- WhatsApp/lembrete SEM telefone do banco: share sheet (share_plus) + push resend.
- Strings PT, código EN. Worktree: ler arquivos INTEIROS antes de editar. NÃO commitar `nexago_app/analysis_options.yaml`/`pubspec.lock`.
- Testes matrix: `cd functions && npm run test:registrations` (hoje 166 verdes). Flutter: `flutter analyze lib/features/tournaments` (12 issues pré-existentes) + `flutter test test/features/tournaments/`.
- Commits pequenos por tarefa; a branch é a do PR #359 (`claude/athlete-substitution-before-brackets-e6e421`).

---

### Task 1: Backend — motivo persistido (reason/reasonNote)

**Files:**
- Modify: `functions/src/tournament-substitution.ts`
- Modify: `functions/test/registration-substituicao.test.mjs`

**Interfaces:**
- Consumes: envio/aceite do PR #359.
- Produces: envio aceita `reason?`/`reasonNote?`; doc do convite ganha os 2 campos (quando presentes); entrada do `substitutionHistory` ganha `reason`/`reasonNote` (quando presentes no convite); notificação `tournament_substitution_completed` ao ORGANIZADOR ganha o motivo no corpo: `" Motivo informado: {label}."` (usar o label PT; com `reasonNote`, acrescentar ` — "{note}"`).

- [ ] **Step 1 (teste primeiro):** na matriz, novo teste "motivo viaja do envio à história e ao organizador": enviar com `reason: 'lesao', reasonNote: 'Torceu o tornozelo'`; assert no doc do convite (`invite.reason === 'lesao'`, `invite.reasonNote === 'Torceu o tornozelo'`); aceitar; assert `reg.substitutionHistory[0].reason === 'lesao'` e `.reasonNote`; assert que a notificação do organizador (`users/{managerId}/notifications`, tipo `tournament_substitution_completed`) contém `/Lesão/`. Seed do torneio precisa de `managerId` (usar `seedTournament({...})` + set-merge de `{managerId: 'org-1'}` no doc, ou verificar se o harness já grava organizerId/managerId — ajustar ao real). Segundo teste: `reason` inválido (`'xpto'`) → `invalid-argument`; `reasonNote` >300 → `invalid-argument`.
- [ ] **Step 2:** rodar `npm run test:registrations` → novos testes FAIL.
- [ ] **Step 3:** implementar no `sendTournamentSubstitutionInvite`: parse+validação dos 2 campos (constante `SUBSTITUTION_REASONS = ["lesao","imprevisto","trabalho","viagem","outro"]`; export `substitutionReasonLabel(reason: string): string` com os labels PT — usado também na notificação); gravar no doc só quando presentes. No `acceptSubstitutionInviteFor`: copiar `reason`/`reasonNote` do convite para a entrada do history (só quando presentes) e anexar o motivo ao corpo da notificação do organizador.
- [ ] **Step 4:** `npm run test:registrations` verde (166+2) e `npm test` verde. Commit: `feat(functions): motivo da substituição — convite, história e notificação ao organizador`

---

### Task 2: Backend — viewedAt + lembrete

**Files:**
- Modify: `functions/src/tournament-substitution.ts`
- Modify: `functions/src/index.ts` (import/export das 2 callables)
- Modify: `functions/test/registration-harness.mjs` (callables novas)
- Modify: `functions/test/registration-substituicao.test.mjs`

**Interfaces:**
- Produces: `markSubstitutionInviteViewed({inviteId})` — só `inviteeUid`, convite `pending` com `isSubstitutionInvite`, grava `viewedAt: serverTimestamp` UMA vez (segunda chamada é no-op `{ok: true, alreadyViewed: true}`); `resendSubstitutionInvite({inviteId})` — só `inviterUid`, convite `pending`, não expirado, rate-limit: se `lastReminderAt` < 6h atrás → `resource-exhausted` "Aguarde para lembrar novamente."; senão grava `lastReminderAt` e reenvia a MESMA push `tournament_substitution_invite` ao invitee (title `"Lembrete: {inviterName} te chamou como substituto"`).

- [ ] **Step 1 (testes primeiro):** matriz — viewed: invitee marca, `viewedAt` existe; segunda chamada não muda o timestamp; inviter chamando → `permission-denied`. Resend: inviter reenvia → notificação nova no inbox do invitee (`users/{invitee}/notifications` com `/Lembrete/`) e `lastReminderAt` gravado; segunda chamada imediata → erro `/aguarde/i`; invitee chamando → `permission-denied`; convite aceito → `failed-precondition`.
- [ ] **Step 2:** FAIL → implementar as 2 callables (mesmo arquivo, padrão das existentes: `str` helpers, HttpsError, logger) → exportar no index.ts → harness (`markViewed`, `resendSubstitution` em `callables`).
- [ ] **Step 3:** `npm run test:registrations` + `npm test` verdes. Commit: `feat(functions): visualização e lembrete do convite de substituição`

---

### Task 3: Flutter — dados e lógica pura da jornada

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_partner_invite.dart` (invite: `reason`, `reasonNote`, `viewedAt`, `lastReminderAt` — DateTime? nos 2 últimos)
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_discovery_models.dart` (`RegistrationSubstitutionEntry` ganha `reason`/`reasonNote` String?)
- Modify: `nexago_app/lib/features/tournaments/data/my_tournament_registrations_repository.dart` (parse dos 2 campos)
- Modify: `nexago_app/lib/features/tournaments/data/tournament_partner_invite_service.dart` (`sendSubstitutionInvite` ganha `reason`/`reasonNote` opcionais; novos `markSubstitutionInviteViewed(inviteId)` e `resendSubstitutionInvite(inviteId)`)
- Create: `nexago_app/lib/features/tournaments/domain/substitution_journey_logic.dart`
- Create: `nexago_app/test/features/tournaments/substitution_journey_logic_test.dart`

**Interfaces (Produces — Tasks 4–6 consomem):**

```dart
/// substitution_journey_logic.dart — puro, sem Flutter/Firestore.
const substitutionReasonLabels = <String, String>{
  'lesao': 'Lesão', 'imprevisto': 'Imprevisto pessoal',
  'trabalho': 'Trabalho', 'viagem': 'Viagem', 'outro': 'Outro',
};

/// "1d 04h" / "05h 12min" / "12min" — restante até [expiresAt]; null se vencido.
String? substitutionCountdownLabel(DateTime expiresAt, DateTime now);

/// Fração 0..1 do TTL consumido (para a barra), clamp nos extremos.
double substitutionTtlProgress(DateTime createdAt, DateTime expiresAt, DateTime now);

/// "visualizado há 3 min" / "visualizado há 2 h" / null sem viewedAt.
String? substitutionViewedLabel(DateTime? viewedAt, DateTime now);

enum SubstitutionInviteOutcome { pending, accepted, declined, expired, cancelled, stale }
SubstitutionInviteOutcome substitutionOutcomeOf(String status, DateTime expiresAt, DateTime now);
```

- [ ] **Step 1 (teste primeiro):** testes puros de countdown (1d04h; <1h vira "Xmin"; vencido → null), progress (0 no início, 1 no fim, clamp), viewedLabel (min/h) e outcomeOf (pending+vencido → expired; status manda nos demais).
- [ ] **Step 2:** FAIL → implementar lógica pura + campos/parses/serviço (padrões idênticos aos existentes; `viewedAt`/`lastReminderAt` via `(d['x'] as Timestamp?)?.toDate()`).
- [ ] **Step 3:** `flutter test test/features/tournaments/` verde; `flutter analyze lib/features/tournaments` sem issue nova. Commit: `feat(app): dados e lógica pura da jornada de substituição`

---

### Task 4: Flutter — tela Detalhe da Inscrição

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/tournament_registration_detail_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart` + arquivo de rotas do GoRouter (seguir o padrão das rotas de tournaments existentes; nome `tournamentRegistrationDetail`, path `/torneios/:tournamentId/inscricao/:registrationId/detalhe`)
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_my_registration_tab.dart` (card confirmado NAVEGA para o detalhe em vez de abrir a tela de sucesso; o TextButton "Substituir atleta" e o histórico saem do card — moram no detalhe)

**Estrutura da tela (copy exata):** AppBar "Minha inscrição" + subtítulo "{torneio} · {categoria}". Card 1 (verde): badge "INSCRIÇÃO CONFIRMADA" (ou "PAGAMENTO PENDENTE"/"LISTA DE ESPERA" conforme estado), avatares (iniciais; perfis via `getUsersByIds`), título "Você & {parceiro}" (equipe: "{teamName}"), linha "R$ {entryFee} pagos · chave publicada" quando pago+publicado (variações: "R$ {v} pagos", "pagamento pendente", "na lista de espera"; "chave publicada" só quando `category.bracketPublished`). Card 2: data (`tournament.dateLabel`) + local (`locationLine`) e categoria + "{maxTeams} duplas" quando houver. Seção "PRECISA MUDAR ALGUMA COISA?" com dois cards de ação:
- **Substituir** (destaque laranja, ícone swap): quando há convite de substituição pendente da inscrição (watch dos convites enviados do usuário filtrado por `attachRegistrationId == registrationId && isSubstitutionInvite`), o card vira título "Substituição em curso" sub "{invitee} ainda não respondeu — acompanhe" e navega para a Task 6; senão, quando `substitutionReplaceableUids` não-vazio: título "Substituir um atleta da {dupla|equipe}" sub "Alguém não vai poder jogar — mantenha a vaga trocando o {parceiro|atleta}" → navega ao wizard (Task 5). Oculto quando gate fechado/roster incompleto.
- **Cancelar**: título "Cancelar a inscrição da {dupla|equipe}" sub "Sujeito à política de cancelamento do organizador" → dispara o fluxo existente do tab (cancelar direto quando `canCancel`; senão pedido ao organizador — reusar os widgets/fluxos existentes da aba, extraindo o que for preciso).
Histórico (`substitutionHistory` não-vazio): linhas "{inName} entrou no lugar de {outName}." como no card antigo. Card final: nome do torneio + categoria + data + local.

- [ ] **Step 1:** implementar tela + rota + navegação do card confirmado (que perde botão/histórico, mantendo o teste de visibilidade adaptado: agora o que se testa é o card do DETALHE).
- [ ] **Step 2:** adaptar os 4 widget tests existentes de `tournament_detail_my_registration_tab_test.dart` ao novo comportamento (navegação) e mover asserts de visibilidade/histórico para um teste novo da tela de detalhe (mínimo: botão aparece/some pelo gate; histórico renderiza; estado "Substituição em curso" com convite pendente fake).
- [ ] **Step 3:** `flutter analyze` + `flutter test test/features/tournaments/` verdes. Commit: `feat(app): tela de detalhe da inscrição com ações de substituição e cancelamento`

---

### Task 5: Flutter — wizard "Quem sai" + "Quem entra" (aposenta o sheet)

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/tournament_substitution_wizard_page.dart` (passo 1) e `tournament_substitution_pick_page.dart` (passo 2) — rotas `tournamentSubstitutionWizard` (`/torneios/:tournamentId/inscricao/:registrationId/substituir`) e passo 2 como push com argumentos (registration, replacedUid, replacedName, reason, reasonNote)
- Delete: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_registration/tournament_substitution_sheet.dart` (+ seu teste)
- Create: testes das duas páginas migrando a cobertura do sheet

**Passo 1 (copy exata):** AppBar "Substituir {parceiro|atleta}" + sub "{torneio} · {categoria}". Headline "Quem não vai poder jogar?" + sub "A vaga da {dupla|equipe} continua sua. Só precisamos saber quem sai e quem entra no lugar.". Radios (cards com avatar): cada `replaceableUids` com nome + papel — o próprio uid: "Você" + sub "Capitão da inscrição" quando for `captainUid`, senão "Sua vaga"; parceiro: "Parceiro · confirmado" (equipe: "Integrante"). Seção "MOTIVO · VAI PRO ORGANIZADOR": chips das 5 opções (seleção única, opcional) + TextField multiline opcional placeholder "Conte o que aconteceu (opcional)" maxLength 300. Caixa "REGRAS DESTE TORNEIO": item "Troca permitida até a publicação das chaves" sub "Depois de publicadas, não é possível substituir" + item "O substituto precisa caber na categoria" sub "Nível compatível com {categoria}". CTA cheio "Escolher o substituto →" (habilita com vaga selecionada) + "Voltar" (pop).

**Passo 2 (copy exata):** AppBar "Quem entra no lugar" + sub "Saindo: {replacedName}{ · label do motivo}". Busca placeholder "Buscar atleta por nome" (mesma busca do sheet: partnerSearchService, excluindo membros). Seção "Suas últimas duplas" sub "Atletas com quem você já jogou e que cabem em {categoria}." — `RecentPartnersRepository.loadRecentPartners` filtrado por gênero da categoria (`filterPartnersByCategoryGender` do domain) e excluindo membros; cada linha com botão "Convidar". Aviso âmbar (só quando `sharePaidUids` não-vazio ou `isPaid`): "O substituto entra sem pagar de novo — a inscrição da {dupla|equipe} já está quitada. O acerto com {replacedName} é entre vocês.". Convidar → `sendSubstitutionInvite(..., reason, reasonNote)` → `pushReplacement` para a tela de acompanhamento (Task 6) com o inviteId. Erros: snackbar com a mensagem (padrão do sheet, incl. o catch da busca).

- [ ] **Step 1:** implementar as duas páginas + rotas; detalhe (Task 4) passa a navegar pro wizard; deletar o sheet e `tournament_substitution_sheet_test.dart`.
- [ ] **Step 2:** testes: migrar as 6 coberturas do sheet para as páginas (radios/nomes, revelar passo 2, busca com filtro, payload do envio com reason/reasonNote, erro mantém a página, aviso de pagamento condicional) usando os mesmos fakes de providers.
- [ ] **Step 3:** `flutter analyze` + `flutter test test/features/tournaments/` verdes (garantir que NADA mais referencia o sheet: grep). Commit: `feat(app): wizard de substituição em duas etapas com motivo`

---

### Task 6: Flutter — acompanhamento + sucesso + viewed na tela do convite

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/tournament_substitution_status_page.dart` (rota `tournamentSubstitutionStatus`, path `/torneios/:tournamentId/substituicao/:inviteId`)
- Create: `nexago_app/lib/features/tournaments/presentation/tournament_substitution_success_page.dart` (pushReplacement a partir do status quando aceitar; sem rota própria — página com argumentos)
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_partner_invite_page.dart` (fire-and-forget `markSubstitutionInviteViewed` no primeiro build quando `invite.isSubstitutionInvite && invite.isPending && uid == inviteeUid`)

**Status (copy exata):** AppBar "Substituição em curso" + sub torneio·categoria. Watch do convite (`watchInvite`). Hero: avatares "{out} → {in}" + "{outPrimeiroNome} sai, {inPrimeiroNome} entra" + "Sua vaga está mantida. A troca fica valendo quando {in} aceitar.". Seção "O QUE FALTA": linha 1 check verde "Pedido de substituição enviado" + `createdAt` formatado ("hoje · 14:02" / "ontem · ..." / "dd/MM · HH:mm"); linha 2 pendente "{in} precisa aceitar" + `substitutionViewedLabel` quando houver. Box âmbar "VAGA RESERVADA" + `substitutionCountdownLabel(expiresAt)` + barra `substitutionTtlProgress` + "Enquanto isso {out} segue escalado. Se a troca não sair até {expiresAt formatado}, a {dupla|equipe} segue como está.". Card "ACERTO DO VALOR" (só com pagamento na inscrição — carregar a inscrição via repositório existente): "A inscrição de R$ {v} continua paga — nada é cobrado de novo. Combine com {out} e {in} como fica o acerto.". Ações: "Lembrar {in}" → bottom-sheet simples com 2 opções: "Enviar lembrete por notificação" (`resendSubstitutionInvite`; sucesso snackbar "Lembrete enviado."; rate-limit → mensagem do backend) e "Compartilhar no WhatsApp" (`SharePlus`/`Share.share` com "Fala, {in}! Te chamei como substituto no {torneio} — aceita lá no nexaGO."); "Cancelar troca" → confirm dialog → `cancelInvite` → pop. Estados terminais (via `substitutionOutcomeOf`): accepted → pushReplacement sucesso; declined/expired/cancelled/stale → corpo com mensagem ("O convite foi recusado." / "O convite expirou." / "A troca foi cancelada." / "Este convite não está mais válido.") + CTA "Tentar com outro atleta" (→ wizard passo 1) + "Voltar".

**Sucesso (copy exata):** AppBar "{Dupla|Equipe} atualizada". Hero verde "{in} é sua nova {dupla|equipe}" + "{in} aceitou seu convite.". Dois cards: "INSCRIÇÃO / confirmada" (ou estado real) e "PAGAMENTO / R$ {v}" (só quando pago). Linhas: "{out} saiu da {dupla|equipe}" + sub "Motivo: {label} · registrado com o organizador" (sub só com motivo) e "{in} entrou" + sub "Dentro da categoria {nome}". Card do torneio. CTA "Ver inscrição →" (→ detalhe, Task 4).

- [ ] **Step 1:** implementar as 2 páginas + rotas + o viewed na página do convite.
- [ ] **Step 2:** testes: página de status com convite fake pendente (timeline, countdown, viewed label), transição para sucesso com status accepted, estado terminal declined; viewed disparado 1x na página do convite (fake service capturando chamada).
- [ ] **Step 3:** `flutter analyze` + `flutter test test/features/tournaments/` verdes. Commit: `feat(app): acompanhamento da substituição e tela de sucesso`

---

### Task 7: Widget tests complementares (flutter-test-engineer — dispatch do CONTROLLER)

Escopo: detalhe da inscrição (estados do card de ação: substituir/em curso/oculto; navegações), wizard (fluxo completo com envio), status (lembrete com rate-limit exibindo erro; cancelar troca com confirm). Sem tocar produção. Commit: `test(app): widget tests da jornada de substituição`.

---

### Task 8: Docs + verificação completa + push

- [ ] **Step 1:** `docs/business-rules/registrations.md`, seção de substituição: acrescentar 3 linhas — motivo opcional persistido (convite→história→notificação); `viewedAt` (read-receipt via callable, 1x); lembrete (`resendSubstitutionInvite`, rate-limit 6h) e o princípio "WhatsApp sem telefone do banco (share sheet)".
- [ ] **Step 2:** rodar TUDO: functions (`npm test` + `test:registrations`), rules test, flutter (analyze + pasta tournaments), angular (`ng test athlete` + build — deve permanecer intocado/verde).
- [ ] **Step 3:** commit docs (`docs: jornada v2 da substituição — motivo, visualização e lembrete`) e `git push` (o PR #359 recebe os commits novos).

## Self-review notes

- Cobertura da spec v2: gate inalterado (copy nova apenas) ✓; motivo T1 ✓; sugestões simples T5 ✓; viewed+lembrete T2/T6 ✓; share sheet T6 ✓; sheet aposentado T5 ✓; portal intocado ✓; mesma branch/PR T8 ✓.
- Riscos apontados: rotas GoRouter seguem padrão existente (implementers leem `routes.dart` inteiro); fluxo de cancelar no detalhe REUSA os widgets da aba (extrair sem duplicar); `Share.share` API conforme versão do share_plus no lockfile.
