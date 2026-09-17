# Carteira do torneio — app Flutter e backoffice (Fase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar as duas superfícies que faltam — o app Flutter passa a falar com o caixa por torneio (e a reconhecer o papel "administrador"), e o backoffice passa a mostrar de qual evento e de quem é cada pedido de saque.

**Architecture:** o app hoje lê `organizerWallets/{uid}` direto do Firestore e pede saque sem `tournamentId`. As duas coisas param: saldo, extrato e saques passam a vir da callable `loadOrganizerWalletView` (que é a única fonte capaz de mostrar o caixa de um evento a um gestor, porque as rules de `organizerWithdrawals` só liberam leitura ao dono), e o saque manda `tournamentId` sem chave. No backoffice, os campos já vêm do backend desde a Fase 1 — falta a tela usá-los.

**Tech Stack:** Flutter/Dart (Riverpod, go_router), `cloud_firestore`, `cloud_functions`; Angular standalone no backoffice.

**Spec:** `docs/superpowers/specs/2026-09-16-carteira-do-torneio-design.md` (seções "App Flutter" e "Backoffice")

**Fases anteriores, na mesma branch:**
- `docs/superpowers/plans/2026-09-16-carteira-do-torneio-backend.md` — backend, rules, migração (mergeado na main pelo PR #455)
- `docs/superpowers/plans/2026-09-17-carteira-do-torneio-portal.md` — portal web (PR #456, aberto)

## Por que esta fase destrava o deploy

Hoje, se as functions subirem sem esta fase, o app publicado na loja:
- mostra **R$ 0,00 para os donos** (lê `organizerWallets`, que a migração debita);
- devolve `invalid-argument: "Informe o torneio do saque."` em todo saque;
- chama o administrador de **"Gestor"** em toda a interface, porque o enum de papel só conhece `manager` e `scorer`.

E o app da loja aponta para o projeto **DEV** (`volley-track-dev-4596c`), então isso atinge usuários reais mesmo sem deploy em produção.

## Global Constraints

- Português nas strings de UI e nos comentários; inglês no código.
- **Teste Flutter é obrigatório nesta fase.** O projeto manda acionar o agente `flutter-test-engineer` sempre que houver criação ou alteração de funcionalidade Flutter — quem executar este plano aciona esse agente para as tasks 1 a 3 (ele escreve/ajusta os testes; o implementador escreve o código).
- **Meça a baseline da suíte Flutter ANTES de mexer em qualquer coisa** e anote o número: `cd <worktree>/nexago_app && flutter test 2>&1 | tail -5`. O projeto tem falhas pré-existentes nessa suíte; sem a baseline não há como distinguir falha nova de falha herdada, e "a suíte está vermelha" deixa de significar qualquer coisa.
- A máscara de chave PIX de terceiro **já vem do servidor**. Nenhuma superfície desta fase re-mascara nem tenta desmascarar.
- O saque manda `{tournamentId, amountReais}` e **nunca** a chave: o destino sai do perfil de quem pede, resolvido no servidor.
- No backoffice, a fila de saques é onde um humano aprova valores acima de R$ 500 — o que ela mostra tem de ser verdade sobre quem pediu.
- Backoffice: `cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='<glob>'` e `npx tsc -p projects/backoffice/tsconfig.app.json --noEmit`.
- O `cd` não persiste entre chamadas: repetir o caminho absoluto em cada comando.
- Commits na branch atual (`claude/new-organizer-wallet-access-a1a9fe`), que já tem as Fases 1 e 2 e um PR aberto (#456). `git add` explícito; nunca `-A`.
- Nenhum worktree irmão do app mexe nos arquivos desta fase — conferido em 17/09/2026 (6 worktrees de `nexago_app`, zero com arquivos de carteira do organizador modificados). Reconferir se a fase demorar.

## Contrato que o backend já entrega (não mexer)

`loadOrganizerWalletView({tournamentId?, ledgerLimit?})`:

```
tournaments: [{tournamentId, tournamentName, availableReais, pendingReais}]   // saldo desc, empate por nome
selected: {tournamentId, tournamentName, availableReais, pendingReais} | null // null = não alcança caixa
payout: {pixKey, pixKeyType, hasPixKey}                                       // do PRÓPRIO chamador
ledger: [{id, netReais, grossReais, platformFeeReais, createdAt (ISO string|null), athleteLabel}]
withdrawals: [{id, amountReais, status, pixKey, requestedBy, requestedByStaff, payoutStatus, createdAt (ISO|null)}]
```

`requestOrganizerWithdrawal({tournamentId, amountReais})` → `{withdrawalId, status, payoutStatus, autoProcessed, processingMode, message}`.
`setOrganizerPayoutPixKey({pixKey, pixKeyType})` → `{success, pixKey, pixKeyType}` **normalizados pelo servidor** (telefone volta com `+55`).
`listPendingOrganizerWithdrawals` → itens com `organizerId`, `organizerName`, `tournamentId`, `tournamentName`, `requestedBy`, `requestedByName`, `amountReais`, `pixKey`, `status`.

**Por que o app não pode continuar lendo do Firestore direto:** as rules de `organizerWithdrawals` liberam leitura só para `organizerId == uid` (o dono). Um gestor que saca do caixa de outro dono **não consegue** ler os próprios saques pelo cliente — só pela callable. O mesmo para o caixa: `tournamentWallets` libera dono e gestor, mas o extrato precisa dos rótulos de atleta, que a callable resolve.

## Decisão sobre o guard do app (o spec pede, o código não tem onde receber)

O spec diz: "O guard de staff (`hasActiveTournamentStaffAccess`,
`isOrganizerStaffOperablePath`) passa a conhecer `eventAdmin`". Medi os dois antes de
escrever task para isso:

- `hasActiveTournamentStaffAccess` (`my_tournament_staff_providers.dart:110-117`) devolve
  `entries.isNotEmpty` — é agnóstico de papel, então o administrador **já** recebe operação
  do evento sem nenhuma mudança.
- `isOrganizerStaffOperablePath` (`role_route_guard.dart:13-16`) libera só
  `/organizer/tournaments/...`. `/organizer/wallet` **já está bloqueado** para quem é staff
  sem o papel global de organizador — por caminho, independente do papel de equipe.
- Quem tem o papel global `organizer` (o gatilho de staff concede) passa pelo guard e
  alcança `/organizer/wallet` com `activeRole == organizer`. Aí a fronteira do dinheiro é o
  servidor (a callable devolve lista vazia) mais o estado vazio explicativo da Task 3.

**Ruling: nenhuma task de guard.** Ensinar o guard a barrar `/organizer/wallet` por papel de
equipe é impossível por construção — a rota não é de um torneio, e a mesma pessoa pode ser
gestora do evento A (vê dinheiro) e administradora do evento B (não vê). É exatamente por
isso que o design pôs o dinheiro dentro do torneio. O requisito do spec — "opera o torneio e
não alcança carteira nem financeiro do organizador" — fica satisfeito pelo caminho já
bloqueado, pelo servidor e pelo estado vazio da Task 3. Se o revisor apontar "falta o guard",
esta é a resposta; se ele mostrar um caminho que eu não medi, aí é defeito de verdade.

**Residual anotado, fora de escopo:** `hasActiveTournamentStaffAccess` engole erro em
`false` (`:114-116`), então uma falha transitória de rede joga um membro de equipe para a
home de atleta. É a mesma classe do `listStaffTournamentRoles` do portal, anotada na Fase 2.
Não conserto aqui — é caminho de login, não de carteira.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `nexago_app/lib/features/organizer/domain/tournament_staff/tournament_staff_models.dart` (modificar) | enum de papel ganha `eventAdmin` |
| `nexago_app/lib/features/organizer/presentation/staff/my_staff_tournaments_section.dart` (modificar) | rótulo do papel na lista "Torneios que eu opero" |
| `nexago_app/lib/features/tournaments/presentation/widgets/my_tournaments_home_section.dart` (modificar) | rótulo do papel na home |
| `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_staff_page.dart` (modificar) | tela de Equipe do app: oferece o papel novo |
| `nexago_app/lib/features/organizer/data/organizer_wallet_repository.dart` (modificar) | contrato novo: callable no lugar das leituras diretas |
| `nexago_app/lib/features/organizer/domain/organizer_wallet_providers.dart` (modificar) | providers do caixa por torneio |
| `nexago_app/lib/features/organizer/presentation/organizer_financial_page.dart` (modificar) | tela: caixas por evento |
| `frontend/projects/backoffice/src/app/painel/financeiro/data/withdrawals.repository.ts` (modificar) | fila carrega evento e solicitante |
| `frontend/projects/backoffice/src/app/painel/financeiro/panel-financeiro.component.ts` (modificar) | fila exibe evento e solicitante |
| `frontend/projects/backoffice/src/app/painel/organizadores/data/organizers.repository.ts` (modificar) | chave PIX vem do perfil |
| `frontend/projects/backoffice/src/app/painel/organizadores/role-form.state.ts` (modificar) | comentário/rótulo da chave |

`organizer_financial_page.dart` tem 667 linhas e vai mudar muito. **Não** reestruturar além do necessário: a lógica nova que der para extrair sai como função/classe pura em `domain/`, que é onde os testes do app alcançam.

---

### Task 1: O app reconhece o papel "administrador"

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_staff/tournament_staff_models.dart:5-17`
- Modify: `nexago_app/lib/features/organizer/presentation/staff/my_staff_tournaments_section.dart:22,95`
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/my_tournaments_home_section.dart:163,346`
- Modify: `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_staff_page.dart:84-87`
- Modify: `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_detail_page.dart:77` (só conferir; ver abaixo)
- Test: `nexago_app/test/features/organizer/tournament_staff_role_test.dart` (criar)

**Dois pontos já conferidos — não mexer:**
- `tournament_staff_repository.dart:46,58` grava `role.value`, então o papel novo passa a ser atribuível pelo app sozinho, sem tocar no repositório.
- `firestore.rules:2094` já aceita `request.resource.data.role in ['manager', 'eventAdmin', 'scorer']` (Fase 1). **Nenhuma mudança de rules nesta fase.**
- `my_tournament_staff_providers.dart:40` chama `fromValue`, então herda a correção sem edição.

**Interfaces:**
- Consumes: nada.
- Produces: `TournamentStaffRole` ganha `eventAdmin('eventAdmin')`; `fromValue` deixa de ser toggle binário; `label` (getter novo) devolve `'Gestor'`, `'Administrador'` ou `'Mesário'`.

- [ ] **Step 1: Medir a baseline da suíte Flutter**

```bash
cd <worktree>/nexago_app && flutter test 2>&1 | tail -5
```

Anote o número de falhas no relatório **antes** de qualquer mudança. O projeto tem falhas pré-existentes nessa suíte; é essa linha que separa "eu quebrei" de "já estava quebrado".

- [ ] **Step 2: Escrever o teste que falha**

Criar `nexago_app/test/features/organizer/tournament_staff_role_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';

void main() {
  group('TournamentStaffRole.fromValue', () {
    test('gestor', () {
      expect(TournamentStaffRole.fromValue('manager'), TournamentStaffRole.manager);
    });

    test('administrador do evento tem papel próprio, não cai em gestor', () {
      expect(TournamentStaffRole.fromValue('eventAdmin'), TournamentStaffRole.eventAdmin);
    });

    test('mesário', () {
      expect(TournamentStaffRole.fromValue('scorer'), TournamentStaffRole.scorer);
    });

    test('papel ausente conta como gestor, igual ao backend', () {
      expect(TournamentStaffRole.fromValue(null), TournamentStaffRole.manager);
    });

    test('papel desconhecido conta como gestor, igual ao backend', () {
      expect(TournamentStaffRole.fromValue('viewer'), TournamentStaffRole.manager);
    });
  });

  group('TournamentStaffRole.label', () {
    test('cada papel tem rótulo próprio em português', () {
      expect(TournamentStaffRole.manager.label, 'Gestor');
      expect(TournamentStaffRole.eventAdmin.label, 'Administrador');
      expect(TournamentStaffRole.scorer.label, 'Mesário');
    });
  });
}
```

Nota sobre os dois últimos casos de `fromValue`: aqui o app segue o backend (`buildStaffMirrorData` grava `role: 'manager'` como default, e papel desconhecido cai em gestor no `staffRoleLabel`). **É diferente do portal web**, onde papel desconhecido virou `null` de propósito — lá o `null` governa acesso a dinheiro na tela; aqui o enum governa apenas rótulo e o que a tela oferece, e o acesso ao dinheiro é decidido pela callable. Se algum consumidor deste enum passar a decidir dinheiro, esta decisão tem de ser revisitada.

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
cd <worktree>/nexago_app && flutter test test/features/organizer/tournament_staff_role_test.dart
```

Esperado: FAIL na compilação — `eventAdmin` não existe no enum e `label` não existe.

- [ ] **Step 4: Implementar**

Em `tournament_staff_models.dart`:

```dart
/// Papel de um membro da equipe do torneio.
///
/// `eventAdmin` ("administrador", criado em 16/09/2026) opera o evento inteiro
/// mas não vê o caixa nem saca — a fronteira é o servidor (as rules liberam a
/// leitura do caixa só a dono e gestor, e a callable de saque recusa o
/// administrador), então aqui o papel serve para rótulo e para o que a tela
/// oferece.
enum TournamentStaffRole {
  manager('manager', 'Gestor'),
  eventAdmin('eventAdmin', 'Administrador'),
  scorer('scorer', 'Mesário');

  const TournamentStaffRole(this.value, this.label);

  final String value;
  final String label;

  /// Papel a partir do valor gravado no Firestore. Papel ausente ou
  /// desconhecido conta como gestor — mesmo default de `buildStaffMirrorData`
  /// no backend. Divergir daqui criaria tela que mostra uma coisa e servidor
  /// que decide outra.
  static TournamentStaffRole fromValue(String? value) {
    for (final role in TournamentStaffRole.values) {
      if (role.value == value) return role;
    }
    return TournamentStaffRole.manager;
  }
}
```

Nos quatro pontos de UI, trocar o `if/else` binário por `role.label`:
- `my_staff_tournaments_section.dart:95` e `my_tournaments_home_section.dart:346` — onde hoje escolhem entre dois textos, passam a usar `entry.role.label`.
- `my_staff_tournaments_section.dart:22` e `my_tournaments_home_section.dart:163` — o `if (entry.role == TournamentStaffRole.scorer)` que desvia mesário para Partidas **continua igual**: mesário segue com o destino próprio, e administrador acompanha o gestor (ele opera o evento).
- `organizer_tournament_staff_page.dart:84-87` — o `for (final role in TournamentStaffRole.values)` já itera o enum, então o papel novo aparece sozinho; o `role == TournamentStaffRole.manager ? … : …` da linha 87 vira `role.label`.

Em `organizer_tournament_detail_page.dart:77`, `final isScorer = staffRole == TournamentStaffRole.scorer` **não muda**: a distinção que aquela tela faz é "mesário vê só placar", e administrador de fato opera como gestor ali. Confira e diga no relatório que conferiu.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd <worktree>/nexago_app && flutter test test/features/organizer/tournament_staff_role_test.dart
cd <worktree>/nexago_app && flutter analyze lib/features/organizer lib/features/tournaments 2>&1 | tail -5
```

Esperado: 6 testes passando e `analyze` sem erro novo.

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/organizer/domain/tournament_staff/tournament_staff_models.dart nexago_app/lib/features/organizer/presentation/staff/my_staff_tournaments_section.dart nexago_app/lib/features/tournaments/presentation/widgets/my_tournaments_home_section.dart nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_staff_page.dart nexago_app/test/features/organizer/tournament_staff_role_test.dart
git commit -m "feat(app): papel de administrador do evento com rotulo proprio"
```

---

### Task 2: Repositório do app no contrato por torneio

**Files:**
- Modify: `nexago_app/lib/features/organizer/data/organizer_wallet_repository.dart`
- Test: `nexago_app/test/features/organizer/organizer_wallet_view_test.dart` (criar)

**Interfaces:**
- Consumes: o contrato da callable descrito no topo deste plano.
- Produces:
  - `class TournamentCashBox` com construtor de parâmetros nomeados obrigatórios: `TournamentCashBox({required String tournamentId, required String tournamentName, required double availableReais, required double pendingReais})` — a Task 3 constrói instâncias assim nos testes.
  - `class OrganizerPayoutProfile {final String pixKey; final String pixKeyType; final bool hasPixKey;}`
  - `class OrganizerWalletView {final List<TournamentCashBox> cashBoxes; final TournamentCashBox? selected; final OrganizerPayoutProfile payout; final List<OrganizerLedgerEntry> ledger; final List<OrganizerWithdrawalItem> withdrawals;}`
  - `OrganizerWalletView.fromCallable(Map<String, dynamic> data)` — parse puro, testável sem Firebase.
  - `Future<OrganizerWalletView> loadWalletView({String? tournamentId, int? ledgerLimit})`
  - `Future<OrganizerWithdrawalRequestResult> requestWithdrawal({required String tournamentId, required double amountReais})`
  - `Stream<TournamentCashBox?> watchCashBox(String tournamentId)` — saldo ao vivo de `tournamentWallets/{tournamentId}`; **no erro, não emite** (o valor da callable é o autoritativo). É a mesma decisão que o portal tomou depois de um defeito real: emitir zero no erro transformava saldo correto em R$ 0,00 e deixava o saque impossível.
  - `setPayoutPixKey` passa a devolver `OrganizerPayoutProfile` (o servidor ecoa a chave normalizada).
  - `watchWallet`, `watchLedger` e `watchWithdrawals` **saem**.

- [ ] **Step 1: Escrever o teste que falha**

Criar `nexago_app/test/features/organizer/organizer_wallet_view_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';

void main() {
  group('OrganizerWalletView.fromCallable', () {
    test('lê os caixas por torneio e o perfil de quem chamou', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': [
          {'tournamentId': 't2', 'tournamentName': 'Copa B', 'availableReais': 90, 'pendingReais': 5},
        ],
        'selected': {'tournamentId': 't2', 'tournamentName': 'Copa B', 'availableReais': 90, 'pendingReais': 5},
        'payout': {'pixKey': 'a@b.com', 'pixKeyType': 'EMAIL', 'hasPixKey': true},
        'ledger': [
          {'id': 'l1', 'netReais': 92, 'grossReais': 100, 'platformFeeReais': 8, 'createdAt': '2026-09-16T12:00:00.000Z', 'athleteLabel': 'Ana Paula'},
        ],
        'withdrawals': [
          {'id': 'w1', 'amountReais': 40, 'status': 'pending', 'pixKey': '123••••••01', 'requestedBy': 'outro', 'requestedByStaff': true, 'createdAt': '2026-09-16T13:00:00.000Z'},
        ],
      });

      expect(view.cashBoxes.length, 1);
      expect(view.selected?.tournamentId, 't2');
      expect(view.selected?.availableReais, 90);
      expect(view.payout.hasPixKey, isTrue);
      expect(view.ledger.single.athleteLabel, 'Ana Paula');
      expect(view.withdrawals.single.pixKey, '123••••••01');
    });

    test('sem caixa acessível devolve lista vazia e selecionado nulo', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': <dynamic>[],
        'selected': null,
        'payout': {'pixKey': '', 'pixKeyType': '', 'hasPixKey': false},
        'ledger': <dynamic>[],
        'withdrawals': <dynamic>[],
      });

      expect(view.cashBoxes, isEmpty);
      expect(view.selected, isNull);
      expect(view.payout.hasPixKey, isFalse);
    });

    test('payload vazio não estoura', () {
      final view = OrganizerWalletView.fromCallable(const <String, dynamic>{});
      expect(view.cashBoxes, isEmpty);
      expect(view.selected, isNull);
      expect(view.ledger, isEmpty);
      expect(view.withdrawals, isEmpty);
      expect(view.payout.pixKey, '');
    });

    test('data inválida no extrato vira nulo em vez de estourar', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'ledger': [
          {'id': 'l1', 'createdAt': 'não é data'},
        ],
      });
      expect(view.ledger.single.createdAt, isNull);
    });

    test('número que vem como string ainda soma', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': [
          {'tournamentId': 't1', 'tournamentName': 'Copa A', 'availableReais': '12.5', 'pendingReais': 0},
        ],
      });
      expect(view.cashBoxes.single.availableReais, 12.5);
    });
  });
}
```

O último caso existe porque o SDK de Functions no Flutter entrega `Map<Object?, Object?>` com números que podem chegar como `int`, `double` ou `String` dependendo do trânsito JSON — o parse tem de ser tolerante, e o teste é o que garante.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/nexago_app && flutter test test/features/organizer/organizer_wallet_view_test.dart
```

Esperado: FAIL na compilação — `OrganizerWalletView` não existe.

- [ ] **Step 3: Implementar**

Em `organizer_wallet_repository.dart`:

- Acrescentar as três classes de dados e o parse. Use um helper local de coerção para números tolerar `int`/`double`/`String`:

```dart
double _asDouble(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

DateTime? _asDate(Object? v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
  return null;
}

String _asString(Object? v) => v is String ? v.trim() : '';
```

- `OrganizerWalletView.fromCallable` monta `cashBoxes`, `selected` (nulo quando ausente), `payout` e as duas listas, usando os helpers. Mantenha `OrganizerLedgerEntry` e `OrganizerWithdrawalItem` como classes, mas acrescente construtores `fromCallable` — os `fromDoc` atuais saem junto com as leituras diretas.
- `loadWalletView` chama `httpsCallable('loadOrganizerWalletView')` com `{if (tournamentId != null) 'tournamentId': tournamentId, if (ledgerLimit != null) 'ledgerLimit': ledgerLimit}` e devolve `OrganizerWalletView.fromCallable(Map<String, dynamic>.from(result.data as Map))`.
- `requestWithdrawal` passa a receber `tournamentId` e **não** manda chave:

```dart
  /// Saque do caixa de um torneio. A chave PIX NÃO vai no payload: o destino é
  /// sempre o perfil de quem pede, resolvido no servidor.
  Future<OrganizerWithdrawalRequestResult> requestWithdrawal({
    required String tournamentId,
    required double amountReais,
  }) async {
    final result = await _functions.httpsCallable('requestOrganizerWithdrawal').call(
      <String, dynamic>{'tournamentId': tournamentId, 'amountReais': amountReais},
    );
    // … mesmo parse de resultado que já existe
  }
```

- `watchCashBox` lê `tournamentWallets/{tournamentId}` e **não emite no erro**:

```dart
  /// Saldo do caixa ao vivo. Virou possível quando as rules passaram a liberar
  /// `tournamentWallets/{id}` para dono e gestor. No erro NÃO emite: o valor da
  /// callable é o autoritativo, e emitir zero aqui transformaria saldo correto
  /// em R$ 0,00 — foi esse o defeito que o portal precisou consertar.
  Stream<TournamentCashBox?> watchCashBox(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('tournamentWallets')
        .doc(id)
        .snapshots()
        .map<TournamentCashBox?>((snap) { /* monta TournamentCashBox com o id e os saldos */ })
        .handleError((Object _) {});
  }
```

- `setPayoutPixKey` devolve `OrganizerPayoutProfile` a partir do eco do servidor, com fallback no valor enviado.
- Apagar `watchWallet`, `watchLedger`, `watchWithdrawals` e os `fromDoc` que só elas usavam. Antes de apagar, rode `grep -rn "watchWallet\|watchLedger\|watchWithdrawals" nexago_app/lib` e conserte os consumidores na Task 3 — se sobrar consumidor fora da tela financeira, **pare e reporte**.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/nexago_app && flutter test test/features/organizer/organizer_wallet_view_test.dart
cd <worktree>/nexago_app && flutter analyze lib/features/organizer 2>&1 | tail -8
```

Esperado: 5 testes passando. O `analyze` vai apontar a tela financeira e os providers quebrados — **esperado**, a Task 3 conserta, e é por isso que as duas vão no mesmo commit ou em commits seguidos sem release no meio.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer/data/organizer_wallet_repository.dart nexago_app/test/features/organizer/organizer_wallet_view_test.dart
git commit -m "feat(app): repositorio da carteira no contrato por torneio"
```

---

### Task 3: Tela financeira do app lista os caixas por evento

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/organizer_wallet_providers.dart`
- Modify: `nexago_app/lib/features/organizer/presentation/organizer_financial_page.dart`
- Test: `nexago_app/test/features/organizer/organizer_financial_logic_test.dart` (criar)

**Interfaces:**
- Consumes: `loadWalletView`, `requestWithdrawal`, `watchCashBox`, `OrganizerWalletView`, `TournamentCashBox` (Task 2).
- Produces:
  - provider `organizerWalletViewProvider` (família por `tournamentId?`) que carrega a view;
  - provider `selectedCashBoxIdProvider` (estado local da escolha);
  - função pura `sumCashBoxes(List<TournamentCashBox>)` → `TournamentCashBoxTotals({required double availableReais, required double pendingReais})`, arredondado a 2 casas, em `domain/` (é preciso arredondar: `0.1 + 0.2` em `double` não dá `0.3`, e há teste para isso);
  - função pura `withdrawalRequesterLabel({required String requestedBy, required bool requestedByStaff, required String viewerUid})` → `'Você'` | `'Gestor da equipe'` | `'Dono do evento'` | `'—'` quando `requestedBy` vem vazio.

- [ ] **Step 1: Escrever o teste que falha**

Criar `nexago_app/test/features/organizer/organizer_financial_logic_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';
import 'package:nexago_app/features/organizer/domain/organizer_wallet_providers.dart';

TournamentCashBox box(String id, double available, double pending) => TournamentCashBox(
      tournamentId: id,
      tournamentName: id,
      availableReais: available,
      pendingReais: pending,
    );

void main() {
  group('sumCashBoxes', () {
    test('soma disponível e pendente de todos os caixas', () {
      final total = sumCashBoxes([box('a', 90, 5), box('b', 10.5, 0)]);
      expect(total.availableReais, 100.5);
      expect(total.pendingReais, 5);
    });

    test('lista vazia soma zero', () {
      final total = sumCashBoxes(const []);
      expect(total.availableReais, 0);
      expect(total.pendingReais, 0);
    });

    test('não acumula erro de ponto flutuante', () {
      expect(sumCashBoxes([box('a', 0.1, 0), box('b', 0.2, 0)]).availableReais, 0.3);
    });
  });

  group('withdrawalRequesterLabel', () {
    test('o próprio pedido aparece como Você', () {
      expect(
        withdrawalRequesterLabel(requestedBy: 'u1', requestedByStaff: false, viewerUid: 'u1'),
        'Você',
      );
    });

    test('pedido da equipe aparece como gestor', () {
      expect(
        withdrawalRequesterLabel(requestedBy: 'outro', requestedByStaff: true, viewerUid: 'u1'),
        'Gestor da equipe',
      );
    });

    test('pedido do dono aparece como dono', () {
      expect(
        withdrawalRequesterLabel(requestedBy: 'dono', requestedByStaff: false, viewerUid: 'u1'),
        'Dono do evento',
      );
    });

    test('sem quem pediu não afirma papel', () {
      expect(
        withdrawalRequesterLabel(requestedBy: '', requestedByStaff: false, viewerUid: 'u1'),
        '—',
      );
    });
  });
}
```

O último caso é o que impede a tela de **afirmar** "Dono do evento" quando o dado não diz nada — o portal teve exatamente esse defeito, porque `requestedByStaff` ausente vira `false` e `false` parecia significar "dono".

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/nexago_app && flutter test test/features/organizer/organizer_financial_logic_test.dart
```

Esperado: FAIL na compilação — `sumCashBoxes` e `withdrawalRequesterLabel` não existem.

- [ ] **Step 3: Implementar**

Em `organizer_wallet_providers.dart`: as duas funções puras e os providers da view (a família por `tournamentId` e o estado da seleção). Mantenha o padrão Riverpod que o arquivo já usa.

Em `organizer_financial_page.dart`, a tela passa de "uma carteira" para "caixas por evento":

- **Lista de caixas**: quando há mais de um, um seletor (o padrão de chips/lista que a tela já usa para outras escolhas); com um só, sem seletor; com nenhum, o estado vazio abaixo.
- **Estado vazio** (`selected == null`): texto explicando que o Financeiro é do dono e dos gestores do evento, e que o administrador organiza o evento sem acessar o caixa. É o que um administrador vê, e o que um organizador novo vê antes do primeiro evento — **não** escreva "nada por aqui".
- **Erro de carga separado do vazio**: falha de rede não pode ser apresentada como "você não alcança caixa nenhum". Card de erro com ação de tentar de novo.
- **Card da chave PIX sempre editável** (a chave é da pessoa), exibindo o eco normalizado do servidor depois de salvar, e **só** depois do sucesso — se a callable falhar, a tela continua mostrando o destino que o servidor tem.
- **Saque**: `requestWithdrawal(tournamentId: selecionado, amountReais: valor)`, sem chave.
- **Saldo ao vivo**: `watchCashBox(tournamentId)` do caixa selecionado, fechando o anterior ao trocar.
- **Histórico de saques**: usar `withdrawalRequesterLabel`; a chave vem mascarada do servidor e é exibida como veio.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/nexago_app && flutter test test/features/organizer/organizer_financial_logic_test.dart
cd <worktree>/nexago_app && flutter analyze lib/features/organizer 2>&1 | tail -5
cd <worktree>/nexago_app && flutter test 2>&1 | tail -5
```

Esperado: 7 testes novos passando, `analyze` limpo em `lib/features/organizer`, e a suíte inteira **na mesma contagem de falhas da baseline do Step 1 da Task 1** — nem uma falha nova.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer/domain/organizer_wallet_providers.dart nexago_app/lib/features/organizer/presentation/organizer_financial_page.dart nexago_app/test/features/organizer/organizer_financial_logic_test.dart
git commit -m "feat(app): financeiro do organizador lista os caixas por evento"
```

---

### Task 4: Fila do backoffice mostra o evento e quem pediu

**Files:**
- Modify: `frontend/projects/backoffice/src/app/painel/financeiro/data/withdrawals.repository.ts:18,62,65`
- Modify: `frontend/projects/backoffice/src/app/painel/financeiro/panel-financeiro.component.ts`
- Test: `frontend/projects/backoffice/src/app/painel/financeiro/data/withdrawals.rows.spec.ts` (criar)

**Interfaces:**
- Consumes: `listPendingOrganizerWithdrawals`, que desde a Fase 1 devolve `tournamentId`, `tournamentName`, `requestedBy` e `requestedByName` além do que já devolvia.
- Produces: `PendingWithdrawal` ganha `tournamentName: string`, `requestedByName: string` e `requestedByStaff: boolean`; função pura `withdrawalQueueSubtitle(row)` → o texto de contexto da linha.

- [ ] **Step 1: Escrever o teste que falha**

Criar `withdrawals.rows.spec.ts`:

```ts
import { withdrawalQueueSubtitle } from './withdrawals.repository';

describe('withdrawalQueueSubtitle', () => {
  it('saque de organizador mostra o evento e quem pediu', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'organizer', tournamentName: 'Copa Goiás', requesterName: 'Harlan',
      requestedByName: 'Marina', requestedByStaff: true,
    } as never)).toBe('Copa Goiás · pedido por Marina (gestor da equipe)');
  });

  it('pedido do próprio dono não repete o papel', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'organizer', tournamentName: 'Copa Goiás', requesterName: 'Harlan',
      requestedByName: 'Harlan', requestedByStaff: false,
    } as never)).toBe('Copa Goiás · pedido pelo dono');
  });

  it('sem evento gravado não inventa nome', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'organizer', tournamentName: '', requesterName: 'Harlan',
      requestedByName: 'Harlan', requestedByStaff: false,
    } as never)).toBe('Evento não identificado · pedido pelo dono');
  });

  it('saque de arena não fala de evento', () => {
    expect(withdrawalQueueSubtitle({
      kind: 'arena', requesterName: 'Arena Central',
    } as never)).toBe('Arena Central');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/withdrawals.rows.spec.ts'
```

Esperado: FAIL — `withdrawalQueueSubtitle` não existe.

- [ ] **Step 3: Implementar**

Em `withdrawals.repository.ts`: acrescentar os três campos ao tipo e ao mapper (`row['tournamentName']`, `row['requestedByName']`, `row['requestedByStaff']`), e exportar:

```ts
/** Contexto da linha na fila de aprovação. É aqui que um humano decide sobre
 *  dinheiro, então a linha diz de qual evento o dinheiro sai e quem pediu —
 *  antes mostrava só o nome do organizador, mesmo quando o pedido era de um
 *  gestor da equipe. */
export function withdrawalQueueSubtitle(row: PendingWithdrawal): string {
  if (row.kind !== 'organizer') return row.requesterName;
  const evento = row.tournamentName?.trim() || 'Evento não identificado';
  const quem = row.requestedByStaff
    ? `pedido por ${row.requestedByName?.trim() || 'gestor da equipe'} (gestor da equipe)`
    : 'pedido pelo dono';
  return `${evento} · ${quem}`;
}
```

`requestedByStaff` vem do backend como booleano de verdade (`organizer-withdrawal.ts:899`), não derivado de comparação de uid — use o campo. Já `requestedByName` cai no uid cru quando o doc de `users` não tem nome; exibir o uid é feio mas é verdade, e inventar "gestor da equipe" no lugar dele seria pior.

Em `panel-financeiro.component.ts`, a linha da fila passa a exibir esse subtítulo abaixo do nome do organizador. Não remova o nome do organizador: ele é quem responde pelo evento, e o valor sai do caixa dele.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/withdrawals.rows.spec.ts'
cd <worktree>/frontend && npx tsc -p projects/backoffice/tsconfig.app.json --noEmit
```

Esperado: 4 testes passando e `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/backoffice/src/app/painel/financeiro/
git commit -m "feat(backoffice): fila de saques mostra o evento e quem pediu"
```

---

### Task 5: Backoffice lê a chave PIX do perfil da pessoa

**Files:**
- Modify: `frontend/projects/backoffice/src/app/painel/organizadores/data/organizers.repository.ts:63-64,180,205`
- Modify: `frontend/projects/backoffice/src/app/painel/organizadores/role-form.state.ts:69,74`

**Interfaces:**
- Consumes: `organizerPayoutProfiles/{uid}` (criada na Fase 1; leitura liberada ao próprio e a admin).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Verificar o que a tela mostra hoje**

```bash
cd <worktree> && grep -rn "payoutPixKey" frontend/projects/backoffice/src/app/painel/organizadores/
```

Anote no relatório onde a chave aparece e se é só leitura (o comentário de `role-form.state.ts:69` diz "exibição apenas"; confirme).

- [ ] **Step 2: Implementar**

Em `organizers.repository.ts:180`, trocar a leitura de `organizerWallets/${uid}` por `organizerPayoutProfiles/${uid}`, mantendo o mesmo campo `payoutPixKey` no retorno (o nome do campo no doc novo é o mesmo). Atualizar o comentário de `:63-64` e o de `role-form.state.ts:69` para dizer que a chave é o **perfil de repasse da pessoa** (`organizerPayoutProfiles/{uid}`), usado em qualquer evento de que ela saque.

**Fallback deliberado:** enquanto a migração não rodar em produção, existe chave que só está em `organizerWallets`. Leia o perfil e, se vier vazio, caia na carteira antiga — mesma tolerância que `loadPayoutPixKey` tem no backend. Deixe isso num comentário, dizendo que o fallback sai quando a migração rodar em todos os ambientes.

- [ ] **Step 3: Verificar**

```bash
cd <worktree>/frontend && npx tsc -p projects/backoffice/tsconfig.app.json --noEmit
cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless
```

Esperado: `tsc` limpo e a suíte do backoffice verde (anote a contagem).

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/backoffice/src/app/painel/organizadores/
git commit -m "feat(backoffice): chave PIX do organizador vem do perfil da pessoa"
```

---

## Verificação final desta fase

```bash
cd <worktree>/nexago_app && flutter analyze 2>&1 | tail -5
cd <worktree>/nexago_app && flutter test 2>&1 | tail -5
cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless
cd <worktree>/frontend && npx tsc -p projects/backoffice/tsconfig.app.json --noEmit
```

A suíte do app tem de fechar **na contagem de falhas da baseline**, não em zero — e o relatório final tem de dizer a baseline e a contagem final, lado a lado.

**Verificação manual obrigatória, no app rodando** (nenhuma tela do app tem teste de widget para isso):
1. Logado como **gestor de evento alheio**: a tela financeira lista o caixa daquele evento, o saque vai para a própria chave, e o saldo muda ao vivo.
2. Logado como **administrador**: a tela financeira mostra o estado vazio explicativo, e o rótulo do papel aparece como "Administrador" na home e em "Torneios que eu opero".
3. Logado como **dono com 2+ eventos**: trocar de caixa e ver saldo, extrato e saques mudarem juntos.
4. **Backoffice**: um saque pedido por gestor aparece na fila com o evento e o nome de quem pediu.

## Depois desta fase: o deploy fica possível

Ordem, conforme o plano da Fase 1 corrigido: `firestore:rules` → índices → functions + portal (hPanel) + app (build de loja) → migração (dry-run imediatamente antes do `--yes`). Só então o caixa por torneio está no ar de ponta a ponta.
