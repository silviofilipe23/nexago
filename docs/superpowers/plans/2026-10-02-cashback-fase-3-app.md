# Fase 3 — Cashback do atleta no app Flutter: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O atleta vê e usa o cashback no app: tela "Meu cashback" (`/cashback`), pílula no herói da home, tile nos ajustes, toggle "Usar meu cashback" nos três PIX (reserva, inscrição, clubinho), nota "+R$ X de cashback pendente" nas telas de sucesso — tudo atrás de `appConfig/cashback.enabled` — e o falso "cashback 3%" sai da comanda.

**Architecture:** Feature nova `lib/features/cashback/` em quatro camadas. `domain/` é Dart puro: modelos espelhando o backend em centavos (`CashbackConfig`, `CashbackWallet`, `CashbackLot`, `CashbackLedgerEntry`), as regras da prévia (`redeemablePreviewCents`, `quoteCheckoutCashback`, `cashbackPillCents`, agrupamento do extrato por mês) e a interface `CashbackRepository`. `infrastructure/` lê `athleteWallets/{uid}` (+ `ledger`, `lots`) e `appConfig/cashback` no Firestore e converte `Timestamp`. `application/` expõe providers `autoDispose` presos ao uid da sessão (deslogado = valores neutros, sem tocar nas rules). `presentation/` tem a página, a pílula, o tile, o toggle e a nota, com o texto todo num arquivo só (`cashback_copy.dart`, o regulamento). As três páginas de PIX existentes ganham o toggle antes de gerar a cobrança, mandam `useCashback` às callables e passam a mostrar `chargedReais`; as telas de sucesso recebem o `paymentId` e ouvem `lots/{paymentId}` ao vivo.

**Tech Stack:** Flutter (Dart 3.11), flutter_riverpod 2.6, go_router 14, cloud_firestore 5, cloud_functions 5; testes com flutter_test, firebase_auth_mocks e fakes escritos à mão.

**Spec:** `docs/superpowers/specs/2026-10-01-cashback-atleta-design.md` (seção 4, telas do atleta) + brief vinculante `.superpowers/sdd/cashback-ui-design-brief.md`. Backend: `docs/superpowers/plans/2026-10-01-cashback-fase-1-backend.md` (mesma branch, em execução).

## Global Constraints

**Contrato do backend (do brief, vinculante):**

- `athleteWallets/{uid}`: `{uid, availableCents, pendingCents, heldCents, lifetimeEarnedCents, lifetimeRedeemedCents, nextExpiryAt: Timestamp|null, nextExpiryCents, updatedAt: Timestamp}`. Doc ausente = carteira zerada.
- `athleteWallets/{uid}/ledger/{id}`: `{type, amountCents (sempre positivo), label, lotId|null, holdId|null, createdAt: Timestamp}`; `type` ∈ `earn | release | cancel | redeem | expire | reverse | refund`.
- `athleteWallets/{uid}/lots/{asaasPaymentId}`: `{status (pending|available|consumed|expired|cancelled|reversed), earnedCents, remainingCents, label, eventAt, expiresAt|null, ...}` — o id do lote é o id do pagamento no Asaas.
- `appConfig/cashback` (lido por qualquer autenticado): `{enabled, ratePercent, maxShareOfFee, minCashReais, expiryMonths, expiryWarningDays}`. Ausente/inválido → padrão `{enabled:false, ratePercent:2, minCashReais:5, expiryMonths:6}` (+ `maxShareOfFee` 0.5, `expiryWarningDays` 15). Espelhar a normalização de `functions/src/cashback-config.ts` (faixas: rate 0–20, share 0–1, minCash 0–1000 reais, meses 1–60, dias 0–90; `enabled` só com `true` literal).
- Callables aceitam `useCashback: boolean` opcional; sem ele, comportamento antigo. `createArenaBookingPixPayment` → resposta ganha `cashbackAppliedReais`, `chargedReais`; `amountToPayNowReais` continua sendo o PREÇO; o QR vale `chargedReais`. `createTournamentRegistrationPixPayment` → idem; `amountReais` continua o preço. `joinArenaClubSession` → idem; `amountReais` continua o preço. Cota dividida de reserva: sem saldo (o app não tem divisão).
- Push: `type` `cashback_released` e `cashback_expiring`, `data: {url: "/cashback", webUrl: "/cashback"}`.

**Decisões de interface (do brief, vinculantes):**

- Nada de cashback aparece com `enabled == false`, EXCETO a página `/cashback` acessada diretamente (o saldo já ganho segue visível). Pílula só com `enabled && (availableCents + pendingCents) > 0`.
- Página: herói com **Disponível** em destaque; "Pendente R$ X · libera depois do jogo"; "R$ Y vencem em DD/MM" se houver `nextExpiryAt/nextExpiryCents`; "Reservado R$ Z" só se `heldCents > 0` ("em um pagamento em andamento"). "Como funciona" em 5 linhas com valores da config. Extrato: últimos 50 (`orderBy createdAt desc`), agrupado por mês ("outubro de 2026"), ícone/tom e título por tipo, `label` como subtítulo, data curta, valor com sinal (earn "Cashback ganho" +, amarelo, sufixo "pendente"; release "Cashback liberado" +, verde; cancel "Cashback cancelado" −, cinza riscado; redeem "Usado no pagamento" −, laranja; expire "Venceu" −, cinza; reverse "Estornado" −, cinza; refund "Devolvido ao saldo" +, verde). Vazio: "Você ainda não tem cashback. Pague reservas, inscrições e clubinho pelo app e ganhe até X% de volta."
- Entradas no app: pílula no herói da home ao lado da de XP + tile "Meu cashback" no grupo PREFERÊNCIAS dos ajustes ("Pagamentos" continua o de métodos salvos) + rota `/cashback` em `isAthleteExperiencePath`.
- Toggle (antes de gerar a cobrança; some depois que ela existe): `redeemablePreviewCents = max(0, min(availableCents, priceCents − minCashCents))`. Com `enabled && redeemable > 0`: switch "Usar meu cashback", sublinha "R$ {disponível} disponível"; ligado → "Usando R$ {redeemable}" e, se `redeemable < available`, "(o mínimo de R$ {min} vai no PIX)"; resumo ganha "Cashback −R$ {redeemable}" e o total cai. Com `enabled && redeemable == 0`: só "Ganhe até {rate}% de volta neste pagamento". `!enabled`: nada. Switch começa DESLIGADO. `useCashback: true` só ligado. Depois da resposta, o valor exibido é `chargedReais` (fallback ao preço quando ausente).
- Sucesso: "+R$ X de cashback pendente · libera depois do jogo" quando `lots/{paymentId}` existir (ouvir ao vivo enquanto a tela está aberta); senão, com `enabled`, "Pagamentos pelo app geram cashback — veja em Meu cashback" com link.
- Copy é regulamento: o "Como funciona" mora num arquivo só (`presentation/cashback_copy.dart`), para o dono revisar antes de ligar.
- Formatação: BRL com centavos (`formatBRL` / `formatBRLFromCents` de `core/formatting/app_currency_format.dart`); datas `dd/MM`; mês por extenso ("outubro de 2026").

**Decisões deste plano (onde o material deixava em aberto):**

- O toggle mora na página do PIX (pré-QR) dos três fluxos — é ela que chama a callable. O spec citava as telas de confirmação; o brief e o mapa do código corrigem.
- A pílula mostra **disponível + pendente** (o mesmo total que a acende).
- O tile dos ajustes aparece só com `enabled` (a página continua alcançável por push e link direto).
- A nota de sucesso só existe quando a tela tem o `paymentId` de um PIX pago pelo app nesta sessão; card reaberto, inscrição gratuita, reserva no local e vaga paga na arena não ganham nota.
- Sem `cacheFor` nos providers do cashback: a home (montada o tempo todo no shell) já mantém config e carteira vivas pela pílula, e o `Timer` do `cacheFor` deixaria timer pendente nos testes que usam `UncontrolledProviderScope`.

**Regras do app:**

- Feature nova em `nexago_app/lib/features/cashback/` com `domain/` (Dart puro, sem tipo do Firebase), `infrastructure/`, `application/`, `presentation/`.
- Firestore só por `firestoreProvider` (`core/firebase/firebase_providers.dart`); callables só pela instância regional `nexagoFunctions` (`core/firebase/functions_region.dart`) — nunca `FirebaseFunctions.instance` nem `FirebaseFirestore.instance` direto.
- Riverpod 2.6: ler `AsyncValue` com `valueOrNull` (o `.value` relança o erro); providers `autoDispose`; chave de `family` sempre `String`.
- **Nunca `dart format` em arquivo existente** (reformata o arquivo inteiro); escrever no estilo do arquivo e validar com `flutter analyze <arquivos>`. Arquivo novo pode ser formatado.
- Fakes escritos à mão (`implements` + `noSuchMethod`); sem mocktail nem fake_cloud_firestore. Callable fake: padrão `_FakeFirebaseFunctions` de `test/features/arenas/data/booking_service_coupon_test.dart`.
- Widget tests: `pump()`, nunca `pumpAndSettle` com stream aberto ou indicador infinito na árvore; tela alta via `tester.view` (a `ListView` monta preguiçosamente); dinheiro comparado por `formatBRL(...)` / `formatBRLFromCents(...)` — o intl põe espaço não separável depois de "R$", então literal `'R$ 2,40'` nunca casa.
- Lints do `flutter_lints 6` em código novo: curinga `(_, _)` (não `(_, __)`); em literal de coleção, `if (x.isNotEmpty) 'k': x` (o `if (x != null) 'k': x` cai no `use_null_aware_elements`); `const` só onde não for redundante.
- Strings ao usuário em português; identificadores em inglês; comentários em português.

**Worktree e git:**

- Todo comando começa com `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app &&` (o cwd não persiste entre chamadas). O worktree nasce sem `.dart_tool`: `flutter pub get` uma vez, na Task 1.
- Rodar um teste: `flutter test <arquivo ou pasta>`. Analisar: `flutter analyze <arquivos>` — `No issues found!`. Se aparecer info antiga numa linha que a task não tocou (o repo tem `(_, __)` e `if (x != null)` antigos), deixar como está e anotar no relatório; issue em linha tocada é da task.
- Branch `claude/cashback-atleta`, compartilhada com os agentes do backend: nunca tocar em `functions/`, nunca `git add -A`, nunca `git stash`/`checkout`. Commits listam os arquivos e terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Reserva com sinal de 50%**: a prévia e o toggle usam o valor a pagar AGORA (a metade), não o total da reserva — senão a tela promete saldo que o servidor não aplica — teste na Task 6.
- **Functions antigas no DEV (resposta sem `chargedReais`/`cashbackAppliedReais`)**: o QR mostra o preço, nunca zero nem nulo — testes na Task 6 (reserva e inscrição) e na Task 8 (clubinho).
- **Servidor aplica menos que a prévia** (saldo gasto em outro checkout entre abrir a tela e gerar o PIX): a tela do QR mostra o `chargedReais` que voltou e esconde a nota de saldo usado — teste na Task 7.
- **Recurso desligado com saldo antigo**: pílula, tile, toggle e nota somem, mas `/cashback` segue mostrando o saldo — testes nas Tasks 3, 4, 5 e 9.
- **Lote criado segundos depois da tela de sucesso** (o webhook aplica a intenção depois de confirmar): a nota passa do texto genérico para "+R$ X pendente" sem recarregar — teste na Task 9.

---

### Task 1: Domínio — modelos e regras puras

**Files:**
- Create: `nexago_app/lib/features/cashback/domain/cashback_models.dart`
- Create: `nexago_app/lib/features/cashback/domain/cashback_rules.dart`
- Create: `nexago_app/lib/features/cashback/domain/cashback_repository.dart`
- Create: `nexago_app/test/features/cashback/domain/cashback_models_test.dart`
- Create: `nexago_app/test/features/cashback/domain/cashback_rules_test.dart`

**Interfaces:**
- Consumes: nada (Dart puro).
- Produces (`cashback_models.dart`):
  - `class CashbackConfig {bool enabled; double ratePercent; double maxShareOfFee; int minCashCents; int expiryMonths; int expiryWarningDays}`; `static const CashbackConfig fallback`; `factory CashbackConfig.fromMap(Map<String, dynamic>? raw)`.
  - `class CashbackWallet {int availableCents, pendingCents, heldCents, lifetimeEarnedCents, lifetimeRedeemedCents, nextExpiryCents; DateTime? nextExpiryAt}` (todos com padrão 0/null); `static const CashbackWallet empty`; `int get balanceCents` (= disponível + pendente).
  - `enum CashbackLotStatus {pending, available, consumed, expired, cancelled, reversed, unknown}` + `static CashbackLotStatus from(Object? raw)`.
  - `class CashbackLot {String id; CashbackLotStatus status; int earnedCents; int remainingCents; String label; DateTime? eventAt; DateTime? expiresAt}`; `bool get isPendingEarn`.
  - `enum CashbackLedgerType {earn, release, cancel, redeem, expire, reverse, refund, unknown}` + `static CashbackLedgerType from(Object? raw)`; `enum CashbackLedgerTone {pending, positive, brand, muted}`.
  - `class CashbackLedgerEntry {String id; CashbackLedgerType type; int amountCents; String label; DateTime? createdAt}`; `String get title`; `bool get isCredit`; `CashbackLedgerTone get tone`.
- Produces (`cashback_rules.dart`): `int reaisToCents(double reais)`; `int redeemablePreviewCents({required int availableCents, required int priceCents, required int minCashCents})`; `int? cashbackPillCents({CashbackConfig? config, CashbackWallet? wallet})`; `class CashbackCheckoutContext {CashbackConfig config; int availableCents}`; `enum CashbackToggleMode {hidden, earnHint, toggle}`; `class CashbackCheckoutQuote {mode, priceCents, availableCents, redeemableCents, useCashback; int get appliedPreviewCents; int get chargePreviewCents; bool get minCashHoldsBack; bool get sendUseCashback}`; `CashbackCheckoutQuote quoteCheckoutCashback({required int priceCents, required CashbackCheckoutContext? checkout, required bool useCashback})`; `String cashbackMonthTitle(DateTime at)`; `String cashbackShortDate(DateTime at)`; `const String cashbackUndatedMonthTitle`; `class CashbackLedgerMonth {String title; List<CashbackLedgerEntry> entries}`; `List<CashbackLedgerMonth> groupLedgerByMonth(List<CashbackLedgerEntry> entries)`; `String formatCashbackRate(double ratePercent)`.
- Produces (`cashback_repository.dart`): `abstract interface class CashbackRepository {Stream<CashbackConfig> watchConfig(); Stream<CashbackWallet> watchWallet(String uid); Stream<List<CashbackLedgerEntry>> watchLedger(String uid); Stream<CashbackLot?> watchLot(String uid, String lotId);}`.

- [ ] **Step 1: Preparar o worktree**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter pub get
```

Expected: `Got dependencies!` (cria `.dart_tool/`, que o git ignora).

- [ ] **Step 2: Escrever os testes que falham**

Criar `nexago_app/test/features/cashback/domain/cashback_models_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';

void main() {
  group('CashbackConfig.fromMap', () {
    test('doc ausente cai no padrão, desligado', () {
      final config = CashbackConfig.fromMap(null);
      expect(config.enabled, isFalse);
      expect(config.ratePercent, 2);
      expect(config.maxShareOfFee, 0.5);
      expect(config.minCashCents, 500);
      expect(config.expiryMonths, 6);
      expect(config.expiryWarningDays, 15);
    });

    test('lê os campos válidos e converte o mínimo para centavos', () {
      final config = CashbackConfig.fromMap({
        'enabled': true,
        'ratePercent': 3,
        'maxShareOfFee': 0.4,
        'minCashReais': 7.5,
        'expiryMonths': 12,
        'expiryWarningDays': 10,
      });
      expect(config.enabled, isTrue);
      expect(config.ratePercent, 3);
      expect(config.maxShareOfFee, 0.4);
      expect(config.minCashCents, 750);
      expect(config.expiryMonths, 12);
      expect(config.expiryWarningDays, 10);
    });

    test('campo fora da faixa ou de outro tipo volta ao padrão (como o backend)',
        () {
      final config = CashbackConfig.fromMap({
        'enabled': 'true',
        'ratePercent': 50,
        'maxShareOfFee': '0.5',
        'minCashReais': -1,
        'expiryMonths': 0,
        'expiryWarningDays': double.nan,
      });
      expect(config.enabled, isFalse);
      expect(config.ratePercent, 2);
      expect(config.maxShareOfFee, 0.5);
      expect(config.minCashCents, 500);
      expect(config.expiryMonths, 6);
      expect(config.expiryWarningDays, 15);
    });
  });

  group('CashbackWallet', () {
    test('vazia é zerada e o saldo da pílula soma disponível + pendente', () {
      expect(CashbackWallet.empty.balanceCents, 0);
      expect(CashbackWallet.empty.nextExpiryAt, isNull);
      expect(
        const CashbackWallet(
          availableCents: 1000,
          pendingCents: 240,
          heldCents: 500,
        ).balanceCents,
        1240,
      );
    });
  });

  group('CashbackLot', () {
    test('status do servidor; qualquer outra coisa vira unknown', () {
      expect(CashbackLotStatus.from('pending'), CashbackLotStatus.pending);
      expect(CashbackLotStatus.from(' cancelled '), CashbackLotStatus.cancelled);
      expect(CashbackLotStatus.from('unknown'), CashbackLotStatus.unknown);
      expect(CashbackLotStatus.from(42), CashbackLotStatus.unknown);
    });

    test('só lote pendente com ganho é anunciado na tela de sucesso', () {
      CashbackLot lot(CashbackLotStatus status, int cents) => CashbackLot(
            id: 'pay_1',
            status: status,
            earnedCents: cents,
            remainingCents: cents,
          );
      expect(lot(CashbackLotStatus.pending, 240).isPendingEarn, isTrue);
      expect(lot(CashbackLotStatus.pending, 0).isPendingEarn, isFalse);
      expect(lot(CashbackLotStatus.cancelled, 240).isPendingEarn, isFalse);
      expect(lot(CashbackLotStatus.available, 240).isPendingEarn, isFalse);
    });
  });

  group('CashbackLedgerEntry', () {
    CashbackLedgerEntry entry(CashbackLedgerType type) =>
        CashbackLedgerEntry(id: 'e', type: type, amountCents: 100);

    test('título, sinal e tom por tipo', () {
      final expected = <CashbackLedgerType, (String, bool, CashbackLedgerTone)>{
        CashbackLedgerType.earn: (
          'Cashback ganho',
          true,
          CashbackLedgerTone.pending,
        ),
        CashbackLedgerType.release: (
          'Cashback liberado',
          true,
          CashbackLedgerTone.positive,
        ),
        CashbackLedgerType.cancel: (
          'Cashback cancelado',
          false,
          CashbackLedgerTone.muted,
        ),
        CashbackLedgerType.redeem: (
          'Usado no pagamento',
          false,
          CashbackLedgerTone.brand,
        ),
        CashbackLedgerType.expire: ('Venceu', false, CashbackLedgerTone.muted),
        CashbackLedgerType.reverse: (
          'Estornado',
          false,
          CashbackLedgerTone.muted,
        ),
        CashbackLedgerType.refund: (
          'Devolvido ao saldo',
          true,
          CashbackLedgerTone.positive,
        ),
      };
      for (final item in expected.entries) {
        final (title, credit, tone) = item.value;
        final e = entry(item.key);
        expect(e.title, title, reason: item.key.name);
        expect(e.isCredit, credit, reason: item.key.name);
        expect(e.tone, tone, reason: item.key.name);
      }
    });

    test('tipo que o app não conhece não quebra o extrato', () {
      expect(CashbackLedgerType.from('bonus'), CashbackLedgerType.unknown);
      expect(CashbackLedgerType.from(null), CashbackLedgerType.unknown);
      expect(CashbackLedgerType.from('redeem'), CashbackLedgerType.redeem);
      expect(entry(CashbackLedgerType.unknown).title, 'Movimento');
    });
  });
}
```

Criar `nexago_app/test/features/cashback/domain/cashback_rules_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/domain/cashback_rules.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

void main() {
  group('reaisToCents', () {
    test('arredonda em vez de truncar', () {
      expect(reaisToCents(19.99), 1999);
      expect(reaisToCents(0.1 + 0.2), 30);
      expect(reaisToCents(120), 12000);
    });
  });

  group('redeemablePreviewCents', () {
    test('abate até deixar o mínimo em dinheiro', () {
      expect(
        redeemablePreviewCents(
          availableCents: 3000,
          priceCents: 2000,
          minCashCents: 500,
        ),
        1500,
      );
    });

    test('saldo menor que o teto é usado inteiro', () {
      expect(
        redeemablePreviewCents(
          availableCents: 300,
          priceCents: 5000,
          minCashCents: 500,
        ),
        300,
      );
    });

    test('preço no mínimo ou abaixo dele não usa saldo', () {
      expect(
        redeemablePreviewCents(
          availableCents: 3000,
          priceCents: 500,
          minCashCents: 500,
        ),
        0,
      );
      expect(
        redeemablePreviewCents(
          availableCents: 3000,
          priceCents: 400,
          minCashCents: 500,
        ),
        0,
      );
    });

    test('sem saldo é zero', () {
      expect(
        redeemablePreviewCents(
          availableCents: 0,
          priceCents: 5000,
          minCashCents: 500,
        ),
        0,
      );
    });
  });

  group('cashbackPillCents', () {
    test('ligado com saldo: disponível + pendente', () {
      expect(
        cashbackPillCents(
          config: ligado,
          wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
        ),
        1240,
      );
    });

    test('só pendente também acende a pílula', () {
      expect(
        cashbackPillCents(
          config: ligado,
          wallet: const CashbackWallet(pendingCents: 240),
        ),
        240,
      );
    });

    test('desligado, sem saldo ou carregando: escondida', () {
      expect(
        cashbackPillCents(
          config: CashbackConfig.fallback,
          wallet: const CashbackWallet(availableCents: 1000),
        ),
        isNull,
      );
      expect(
        cashbackPillCents(config: ligado, wallet: CashbackWallet.empty),
        isNull,
      );
      expect(
        cashbackPillCents(
          config: null,
          wallet: const CashbackWallet(availableCents: 1000),
        ),
        isNull,
      );
      expect(cashbackPillCents(config: ligado, wallet: null), isNull);
    });
  });

  group('quoteCheckoutCashback', () {
    CashbackCheckoutContext checkout(
      int available, {
      CashbackConfig config = ligado,
    }) =>
        CashbackCheckoutContext(config: config, availableCents: available);

    test('desligado, carregando ou sem preço: escondido', () {
      expect(
        quoteCheckoutCashback(
          priceCents: 2000,
          checkout: null,
          useCashback: true,
        ).mode,
        CashbackToggleMode.hidden,
      );
      expect(
        quoteCheckoutCashback(
          priceCents: 2000,
          checkout: checkout(3000, config: CashbackConfig.fallback),
          useCashback: true,
        ).mode,
        CashbackToggleMode.hidden,
      );
      expect(
        quoteCheckoutCashback(
          priceCents: 0,
          checkout: checkout(3000),
          useCashback: true,
        ).mode,
        CashbackToggleMode.hidden,
      );
    });

    test('nada do saldo cabe: só a linha de ganho, e nunca pede useCashback',
        () {
      final quote = quoteCheckoutCashback(
        priceCents: 500,
        checkout: checkout(3000),
        useCashback: true,
      );
      expect(quote.mode, CashbackToggleMode.earnHint);
      expect(quote.sendUseCashback, isFalse);
      expect(quote.chargePreviewCents, 500);
    });

    test('switch desligado: mostra o toggle e cobra o preço cheio', () {
      final quote = quoteCheckoutCashback(
        priceCents: 2000,
        checkout: checkout(3000),
        useCashback: false,
      );
      expect(quote.mode, CashbackToggleMode.toggle);
      expect(quote.redeemableCents, 1500);
      expect(quote.appliedPreviewCents, 0);
      expect(quote.chargePreviewCents, 2000);
      expect(quote.sendUseCashback, isFalse);
    });

    test('switch ligado: abate a prévia e avisa quando o mínimo segurou saldo',
        () {
      final quote = quoteCheckoutCashback(
        priceCents: 2000,
        checkout: checkout(3000),
        useCashback: true,
      );
      expect(quote.appliedPreviewCents, 1500);
      expect(quote.chargePreviewCents, 500);
      expect(quote.minCashHoldsBack, isTrue);
      expect(quote.sendUseCashback, isTrue);
    });

    test('saldo pequeno é usado inteiro, sem aviso do mínimo', () {
      final quote = quoteCheckoutCashback(
        priceCents: 5000,
        checkout: checkout(1000),
        useCashback: true,
      );
      expect(quote.appliedPreviewCents, 1000);
      expect(quote.chargePreviewCents, 4000);
      expect(quote.minCashHoldsBack, isFalse);
    });
  });

  group('extrato por mês', () {
    CashbackLedgerEntry entry(String id, DateTime? at) => CashbackLedgerEntry(
          id: id,
          type: CashbackLedgerType.release,
          amountCents: 100,
          createdAt: at,
        );

    test('agrupa mantendo a ordem (mais recente primeiro) e separa os anos', () {
      final months = groupLedgerByMonth([
        entry('a', DateTime(2027, 1, 3)),
        entry('b', DateTime(2026, 12, 30)),
        entry('c', DateTime(2026, 12, 2)),
        entry('d', DateTime(2026, 10, 12)),
      ]);
      expect(
        months.map((m) => m.title).toList(),
        ['janeiro de 2027', 'dezembro de 2026', 'outubro de 2026'],
      );
      expect(months[1].entries.map((e) => e.id).toList(), ['b', 'c']);
    });

    test('lançamento sem data vai para o fim', () {
      final months = groupLedgerByMonth([
        entry('a', null),
        entry('b', DateTime(2026, 3, 1)),
      ]);
      expect(
        months.map((m) => m.title).toList(),
        ['março de 2026', cashbackUndatedMonthTitle],
      );
    });

    test('data curta dd/MM', () {
      expect(cashbackShortDate(DateTime(2027, 3, 2)), '02/03');
      expect(cashbackMonthTitle(DateTime(2026, 10, 31)), 'outubro de 2026');
    });
  });

  group('formatCashbackRate', () {
    test('inteiro sem casas; fração com vírgula', () {
      expect(formatCashbackRate(2), '2');
      expect(formatCashbackRate(2.5), '2,5');
    });
  });
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/domain`
Expected: FAIL — não compila: `Error when reading 'lib/features/cashback/domain/cashback_models.dart'` (e `cashback_rules.dart`).

- [ ] **Step 4: Implementar**

Criar `nexago_app/lib/features/cashback/domain/cashback_models.dart`:

```dart
// Modelos do cashback do atleta — espelho do backend (`functions/src/
// cashback-config.ts`, `athlete-wallet-state.ts`). Dinheiro sempre em
// CENTAVOS inteiros, como no Firestore. Nenhum tipo do Firebase aqui: o
// `Timestamp` vira `DateTime` na infraestrutura.

/// Configuração ao vivo do cashback (`appConfig/cashback`).
///
/// Mesma normalização de `parseCashbackConfig`: doc ausente ou campo inválido
/// cai no padrão, e o padrão é DESLIGADO.
class CashbackConfig {
  const CashbackConfig({
    required this.enabled,
    required this.ratePercent,
    required this.maxShareOfFee,
    required this.minCashCents,
    required this.expiryMonths,
    required this.expiryWarningDays,
  });

  /// Doc ausente ou ilegível: desligado, com os valores padrão do backend.
  static const CashbackConfig fallback = CashbackConfig(
    enabled: false,
    ratePercent: 2,
    maxShareOfFee: 0.5,
    minCashCents: 500,
    expiryMonths: 6,
    expiryWarningDays: 15,
  );

  factory CashbackConfig.fromMap(Map<String, dynamic>? raw) {
    const d = fallback;
    if (raw == null) return d;
    final minCashReais =
        _numberInRange(raw['minCashReais'], 0, 1000, d.minCashCents / 100);
    return CashbackConfig(
      enabled: raw['enabled'] == true,
      ratePercent: _numberInRange(raw['ratePercent'], 0, 20, d.ratePercent),
      maxShareOfFee:
          _numberInRange(raw['maxShareOfFee'], 0, 1, d.maxShareOfFee),
      minCashCents: (minCashReais * 100).round(),
      expiryMonths: _numberInRange(
        raw['expiryMonths'],
        1,
        60,
        d.expiryMonths.toDouble(),
      ).round(),
      expiryWarningDays: _numberInRange(
        raw['expiryWarningDays'],
        0,
        90,
        d.expiryWarningDays.toDouble(),
      ).round(),
    );
  }

  final bool enabled;

  /// % sobre o dinheiro pago ("Ganhe até X% de volta").
  final double ratePercent;

  /// Teto do ganho como fração da taxa da nexaGO (só o servidor usa).
  final double maxShareOfFee;

  /// Mínimo que sempre vai no PIX quando o atleta usa saldo.
  final int minCashCents;

  /// Validade de cada crédito depois de liberado.
  final int expiryMonths;

  /// Antecedência do aviso de vencimento (push do servidor).
  final int expiryWarningDays;
}

double _numberInRange(Object? raw, num min, num max, double fallback) {
  if (raw is num && raw.isFinite && raw >= min && raw <= max) {
    return raw.toDouble();
  }
  return fallback;
}

/// `athleteWallets/{uid}` — doc ausente = carteira zerada.
class CashbackWallet {
  const CashbackWallet({
    this.availableCents = 0,
    this.pendingCents = 0,
    this.heldCents = 0,
    this.lifetimeEarnedCents = 0,
    this.lifetimeRedeemedCents = 0,
    this.nextExpiryAt,
    this.nextExpiryCents = 0,
  });

  static const CashbackWallet empty = CashbackWallet();

  /// Pronto para usar no próximo pagamento.
  final int availableCents;

  /// Ganho esperando o jogo acontecer.
  final int pendingCents;

  /// Preso numa cobrança aberta (volta se ela expirar).
  final int heldCents;
  final int lifetimeEarnedCents;
  final int lifetimeRedeemedCents;

  /// Vencimento mais próximo entre os créditos disponíveis.
  final DateTime? nextExpiryAt;
  final int nextExpiryCents;

  /// O que a pílula da home mostra: disponível + pendente.
  int get balanceCents => availableCents + pendingCents;
}

/// Estado de um lote (`athleteWallets/{uid}/lots/{asaasPaymentId}`).
enum CashbackLotStatus {
  pending,
  available,
  consumed,
  expired,
  cancelled,
  reversed,
  unknown;

  static CashbackLotStatus from(Object? raw) {
    final value = raw is String ? raw.trim() : '';
    for (final status in values) {
      if (status != unknown && status.name == value) return status;
    }
    return unknown;
  }
}

/// Um crédito de cashback — o id é o id do pagamento no Asaas.
class CashbackLot {
  const CashbackLot({
    required this.id,
    required this.status,
    required this.earnedCents,
    required this.remainingCents,
    this.label = '',
    this.eventAt,
    this.expiresAt,
  });

  final String id;
  final CashbackLotStatus status;
  final int earnedCents;
  final int remainingCents;
  final String label;
  final DateTime? eventAt;
  final DateTime? expiresAt;

  /// Ganho deste pagamento ainda esperando o jogo — o que a tela de sucesso
  /// anuncia. Lote cancelado/estornado não é anunciado.
  bool get isPendingEarn =>
      status == CashbackLotStatus.pending && earnedCents > 0;
}

/// Tipo de lançamento do extrato (`athleteWallets/{uid}/ledger`).
enum CashbackLedgerType {
  earn,
  release,
  cancel,
  redeem,
  expire,
  reverse,
  refund,
  unknown;

  static CashbackLedgerType from(Object? raw) {
    final value = raw is String ? raw.trim() : '';
    for (final type in values) {
      if (type != unknown && type.name == value) return type;
    }
    return unknown;
  }
}

/// Tom visual da linha do extrato; a cor concreta fica na apresentação.
enum CashbackLedgerTone { pending, positive, brand, muted }

/// Linha do extrato. `amountCents` é sempre positivo — o sinal vem do tipo.
class CashbackLedgerEntry {
  const CashbackLedgerEntry({
    required this.id,
    required this.type,
    required this.amountCents,
    this.label = '',
    this.createdAt,
  });

  final String id;
  final CashbackLedgerType type;
  final int amountCents;

  /// Pronto do servidor para o extrato ("Reserva · Arena Sol · 12/10").
  final String label;
  final DateTime? createdAt;

  String get title => switch (type) {
        CashbackLedgerType.earn => 'Cashback ganho',
        CashbackLedgerType.release => 'Cashback liberado',
        CashbackLedgerType.cancel => 'Cashback cancelado',
        CashbackLedgerType.redeem => 'Usado no pagamento',
        CashbackLedgerType.expire => 'Venceu',
        CashbackLedgerType.reverse => 'Estornado',
        CashbackLedgerType.refund => 'Devolvido ao saldo',
        CashbackLedgerType.unknown => 'Movimento',
      };

  /// Entra no saldo (+) ou sai (−).
  bool get isCredit => switch (type) {
        CashbackLedgerType.earn ||
        CashbackLedgerType.release ||
        CashbackLedgerType.refund =>
          true,
        _ => false,
      };

  CashbackLedgerTone get tone => switch (type) {
        CashbackLedgerType.earn => CashbackLedgerTone.pending,
        CashbackLedgerType.release ||
        CashbackLedgerType.refund =>
          CashbackLedgerTone.positive,
        CashbackLedgerType.redeem => CashbackLedgerTone.brand,
        _ => CashbackLedgerTone.muted,
      };
}
```

Criar `nexago_app/lib/features/cashback/domain/cashback_rules.dart`:

```dart
import 'cashback_models.dart';

/// Reais (como chegam das callables e dos args) → centavos sem erro de ponto
/// flutuante: `19.99 * 100` é `1998.9999…`, e truncar daria um centavo a menos.
int reaisToCents(double reais) => (reais * 100).round();

/// Espelho de `computeRedeemableCents` do servidor: quanto do saldo cabe nesta
/// cobrança deixando sempre o mínimo em dinheiro. É só a PRÉVIA — o servidor
/// recalcula e devolve o valor aplicado de verdade.
int redeemablePreviewCents({
  required int availableCents,
  required int priceCents,
  required int minCashCents,
}) {
  final cap = priceCents - minCashCents;
  final usable = availableCents < cap ? availableCents : cap;
  return usable > 0 ? usable : 0;
}

/// Valor da pílula da home, ou `null` para escondê-la: só com o recurso ligado
/// e saldo (disponível + pendente) positivo.
int? cashbackPillCents({CashbackConfig? config, CashbackWallet? wallet}) {
  if (config == null || !config.enabled || wallet == null) return null;
  final total = wallet.balanceCents;
  return total > 0 ? total : null;
}

/// O que um checkout precisa saber do cashback: a config e o disponível.
class CashbackCheckoutContext {
  const CashbackCheckoutContext({
    required this.config,
    required this.availableCents,
  });

  final CashbackConfig config;
  final int availableCents;
}

/// Os três estados do toggle no checkout.
enum CashbackToggleMode {
  /// Recurso desligado (ou ainda carregando): nada aparece.
  hidden,

  /// Ligado, mas nada do saldo cabe nesta cobrança: só "Ganhe até X%".
  earnHint,

  /// Ligado com saldo usável: o switch "Usar meu cashback".
  toggle,
}

/// Prévia do cashback num checkout, para um preço e a escolha do atleta.
class CashbackCheckoutQuote {
  const CashbackCheckoutQuote({
    required this.mode,
    required this.priceCents,
    required this.availableCents,
    required this.redeemableCents,
    required this.useCashback,
  });

  final CashbackToggleMode mode;
  final int priceCents;
  final int availableCents;
  final int redeemableCents;
  final bool useCashback;

  /// Saldo que a tela promete usar (zero com o switch desligado).
  int get appliedPreviewCents =>
      mode == CashbackToggleMode.toggle && useCashback ? redeemableCents : 0;

  /// Total que a prévia manda para o PIX.
  int get chargePreviewCents => priceCents - appliedPreviewCents;

  /// O mínimo em dinheiro segurou parte do saldo ("o mínimo de R$ 5 vai no
  /// PIX").
  bool get minCashHoldsBack => redeemableCents < availableCents;

  /// Manda `useCashback: true` na callable só com o switch ligado e algo a
  /// usar.
  bool get sendUseCashback => appliedPreviewCents > 0;
}

CashbackCheckoutQuote quoteCheckoutCashback({
  required int priceCents,
  required CashbackCheckoutContext? checkout,
  required bool useCashback,
}) {
  final available = checkout?.availableCents ?? 0;
  if (checkout == null || !checkout.config.enabled || priceCents <= 0) {
    return CashbackCheckoutQuote(
      mode: CashbackToggleMode.hidden,
      priceCents: priceCents,
      availableCents: available,
      redeemableCents: 0,
      useCashback: useCashback,
    );
  }
  final redeemable = redeemablePreviewCents(
    availableCents: available,
    priceCents: priceCents,
    minCashCents: checkout.config.minCashCents,
  );
  return CashbackCheckoutQuote(
    mode: redeemable > 0
        ? CashbackToggleMode.toggle
        : CashbackToggleMode.earnHint,
    priceCents: priceCents,
    availableCents: available,
    redeemableCents: redeemable,
    useCashback: useCashback,
  );
}

const List<String> _monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/// "outubro de 2026" — sem depender dos dados de locale do intl.
String cashbackMonthTitle(DateTime at) =>
    '${_monthNames[at.month - 1]} de ${at.year}';

/// "12/10".
String cashbackShortDate(DateTime at) {
  final dd = at.day.toString().padLeft(2, '0');
  final mm = at.month.toString().padLeft(2, '0');
  return '$dd/$mm';
}

/// Grupo de lançamentos sem data (o servidor sempre grava; é defesa).
const String cashbackUndatedMonthTitle = 'Sem data';

class CashbackLedgerMonth {
  const CashbackLedgerMonth({required this.title, required this.entries});

  final String title;
  final List<CashbackLedgerEntry> entries;
}

/// Agrupa por mês mantendo a ordem de chegada (o extrato vem do mais recente
/// para o mais antigo).
List<CashbackLedgerMonth> groupLedgerByMonth(
  List<CashbackLedgerEntry> entries,
) {
  final titles = <String>[];
  final byTitle = <String, List<CashbackLedgerEntry>>{};
  final undated = <CashbackLedgerEntry>[];
  for (final entry in entries) {
    final at = entry.createdAt;
    if (at == null) {
      undated.add(entry);
      continue;
    }
    final title = cashbackMonthTitle(at);
    final bucket = byTitle[title];
    if (bucket == null) {
      titles.add(title);
      byTitle[title] = [entry];
    } else {
      bucket.add(entry);
    }
  }
  return [
    for (final title in titles)
      CashbackLedgerMonth(title: title, entries: byTitle[title]!),
    if (undated.isNotEmpty)
      CashbackLedgerMonth(title: cashbackUndatedMonthTitle, entries: undated),
  ];
}

/// "2" para 2.0, "2,5" para 2.5.
String formatCashbackRate(double ratePercent) {
  if (ratePercent == ratePercent.roundToDouble()) {
    return ratePercent.round().toString();
  }
  return ratePercent.toString().replaceAll('.', ',');
}
```

Criar `nexago_app/lib/features/cashback/domain/cashback_repository.dart`:

```dart
import 'cashback_models.dart';

/// Leitura da carteira de cashback do atleta. Escrita é só do servidor (as
/// rules negam qualquer escrita do cliente).
abstract interface class CashbackRepository {
  /// `appConfig/cashback`, já normalizado.
  Stream<CashbackConfig> watchConfig();

  /// `athleteWallets/{uid}` — doc ausente emite a carteira zerada.
  Stream<CashbackWallet> watchWallet(String uid);

  /// Últimos lançamentos do extrato, do mais recente para o mais antigo.
  Stream<List<CashbackLedgerEntry>> watchLedger(String uid);

  /// `lots/{lotId}` — `null` enquanto o lote não existe.
  Stream<CashbackLot?> watchLot(String uid, String lotId);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/domain`
Expected: PASS — `All tests passed!` (25 testes).

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback/domain test/features/cashback/domain`
Expected: `No issues found!`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/cashback/domain/cashback_models.dart nexago_app/lib/features/cashback/domain/cashback_rules.dart nexago_app/lib/features/cashback/domain/cashback_repository.dart nexago_app/test/features/cashback/domain/cashback_models_test.dart nexago_app/test/features/cashback/domain/cashback_rules_test.dart && git commit -m "feat(cashback-app): modelos e regras puras do cashback do atleta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Infraestrutura e providers

**Files:**
- Create: `nexago_app/lib/features/cashback/infrastructure/firestore_cashback_repository.dart`
- Create: `nexago_app/lib/features/cashback/application/cashback_providers.dart`
- Create: `nexago_app/test/features/cashback/infrastructure/firestore_cashback_repository_test.dart`
- Create: `nexago_app/test/features/cashback/application/cashback_providers_test.dart`

**Interfaces:**
- Consumes: `CashbackRepository`, modelos e `cashbackPillCents`/`CashbackCheckoutContext` (Task 1); `firestoreProvider` (`core/firebase/firebase_providers.dart`); `authProvider` (`core/auth/auth_providers.dart`, `StreamProvider<User?>`).
- Produces (`firestore_cashback_repository.dart`): `const int cashbackLedgerLimit = 50`; `class FirestoreCashbackRepository implements CashbackRepository` (`FirestoreCashbackRepository(FirebaseFirestore db)`); `final cashbackRepositoryProvider = Provider<CashbackRepository>`; `CashbackWallet cashbackWalletFromMap(Map<String, dynamic>? data)`; `CashbackLedgerEntry cashbackLedgerEntryFromMap(String id, Map<String, dynamic> data)`; `CashbackLot? cashbackLotFromMap(String id, Map<String, dynamic>? data)`.
- Produces (`cashback_providers.dart`, reexporta `cashbackRepositoryProvider`): `cashbackUidProvider: AutoDisposeProvider<String>`; `cashbackConfigProvider: AutoDisposeStreamProvider<CashbackConfig>`; `cashbackWalletProvider: AutoDisposeStreamProvider<CashbackWallet>`; `cashbackLedgerProvider: AutoDisposeStreamProvider<List<CashbackLedgerEntry>>`; `cashbackLotProvider: AutoDisposeStreamProviderFamily<CashbackLot?, String>`; `cashbackPillCentsProvider: AutoDisposeProvider<int?>`; `cashbackCheckoutContextProvider: AutoDisposeProvider<CashbackCheckoutContext?>`; `cashbackEnabledProvider: AutoDisposeProvider<bool>`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/cashback/infrastructure/firestore_cashback_repository_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/infrastructure/firestore_cashback_repository.dart';

void main() {
  group('cashbackWalletFromMap', () {
    test('doc ausente é a carteira zerada', () {
      final wallet = cashbackWalletFromMap(null);
      expect(wallet.availableCents, 0);
      expect(wallet.pendingCents, 0);
      expect(wallet.nextExpiryAt, isNull);
    });

    test('lê os totais e o próximo vencimento', () {
      final wallet = cashbackWalletFromMap({
        'uid': 'u1',
        'availableCents': 1240,
        'pendingCents': 480,
        'heldCents': 300,
        'lifetimeEarnedCents': 5000,
        'lifetimeRedeemedCents': 2000,
        'nextExpiryAt': Timestamp.fromDate(DateTime(2027, 3, 12, 10)),
        'nextExpiryCents': 320,
        'updatedAt': Timestamp.fromDate(DateTime(2026, 10, 2)),
      });
      expect(wallet.availableCents, 1240);
      expect(wallet.pendingCents, 480);
      expect(wallet.heldCents, 300);
      expect(wallet.lifetimeEarnedCents, 5000);
      expect(wallet.lifetimeRedeemedCents, 2000);
      expect(wallet.nextExpiryAt, DateTime(2027, 3, 12, 10));
      expect(wallet.nextExpiryCents, 320);
    });

    test('valor corrompido vira zero; fração arredonda; negativo não passa',
        () {
      final wallet = cashbackWalletFromMap({
        'availableCents': 240.0,
        'pendingCents': -5,
        'heldCents': '100',
        'nextExpiryAt': '2027-03-12',
      });
      expect(wallet.availableCents, 240);
      expect(wallet.pendingCents, 0);
      expect(wallet.heldCents, 0);
      expect(wallet.nextExpiryAt, isNull);
    });
  });

  group('cashbackLedgerEntryFromMap', () {
    test('lê tipo, valor, rótulo e data', () {
      final entry = cashbackLedgerEntryFromMap('e1', {
        'type': 'redeem',
        'amountCents': 1500,
        'label': ' Inscrição · Copa Verão ',
        'lotId': null,
        'holdId': 'h1',
        'createdAt': Timestamp.fromDate(DateTime(2026, 10, 5, 18)),
      });
      expect(entry.id, 'e1');
      expect(entry.type, CashbackLedgerType.redeem);
      expect(entry.amountCents, 1500);
      expect(entry.label, 'Inscrição · Copa Verão');
      expect(entry.createdAt, DateTime(2026, 10, 5, 18));
    });

    test('tipo desconhecido e campos ausentes não quebram', () {
      final entry = cashbackLedgerEntryFromMap('e2', {'type': 'bonus'});
      expect(entry.type, CashbackLedgerType.unknown);
      expect(entry.amountCents, 0);
      expect(entry.label, '');
      expect(entry.createdAt, isNull);
    });
  });

  group('cashbackLotFromMap', () {
    test('lote ausente é null', () {
      expect(cashbackLotFromMap('pay_1', null), isNull);
    });

    test('lê o lote pendente', () {
      final lot = cashbackLotFromMap('pay_1', {
        'status': 'pending',
        'earnedCents': 240,
        'remainingCents': 240,
        'label': 'Reserva · Arena Sol · 12/10',
        'eventAt': Timestamp.fromDate(DateTime(2026, 10, 12, 19)),
        'expiresAt': null,
      });
      expect(lot!.id, 'pay_1');
      expect(lot.status, CashbackLotStatus.pending);
      expect(lot.earnedCents, 240);
      expect(lot.eventAt, DateTime(2026, 10, 12, 19));
      expect(lot.expiresAt, isNull);
      expect(lot.isPendingEarn, isTrue);
    });
  });
}
```

Criar `nexago_app/test/features/cashback/application/cashback_providers_test.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/domain/cashback_repository.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

/// Repositório dublê: registra cada leitura (`calls`) e devolve o que o teste
/// encenou. Deslogado, nenhuma leitura pode acontecer.
class _FakeCashbackRepository implements CashbackRepository {
  _FakeCashbackRepository({
    this.config = CashbackConfig.fallback,
    this.wallet = CashbackWallet.empty,
    this.ledger = const [],
    this.lot,
  });

  final CashbackConfig config;
  final CashbackWallet wallet;
  final List<CashbackLedgerEntry> ledger;
  final CashbackLot? lot;
  final calls = <String>[];

  @override
  Stream<CashbackConfig> watchConfig() {
    calls.add('config');
    return Stream.value(config);
  }

  @override
  Stream<CashbackWallet> watchWallet(String uid) {
    calls.add('wallet:$uid');
    return Stream.value(wallet);
  }

  @override
  Stream<List<CashbackLedgerEntry>> watchLedger(String uid) {
    calls.add('ledger:$uid');
    return Stream.value(ledger);
  }

  @override
  Stream<CashbackLot?> watchLot(String uid, String lotId) {
    calls.add('lot:$uid/$lotId');
    return Stream.value(lot);
  }
}

ProviderContainer _container({
  required String uid,
  required CashbackRepository repo,
}) {
  final container = ProviderContainer(
    overrides: [
      cashbackUidProvider.overrideWith((ref) => uid),
      cashbackRepositoryProvider.overrideWithValue(repo),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Mantém o provider `autoDispose` vivo e espera o primeiro valor.
Future<T> _valueOf<T>(
  ProviderContainer container,
  AutoDisposeStreamProvider<T> provider,
) {
  container.listen(provider, (_, _) {});
  return container.read(provider.future);
}

void main() {
  test('logado: config, carteira, extrato e lote vêm do repositório do uid',
      () async {
    final repo = _FakeCashbackRepository(
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000),
      ledger: const [
        CashbackLedgerEntry(
          id: 'e1',
          type: CashbackLedgerType.earn,
          amountCents: 240,
        ),
      ],
      lot: const CashbackLot(
        id: 'pay_1',
        status: CashbackLotStatus.pending,
        earnedCents: 240,
        remainingCents: 240,
      ),
    );
    final container = _container(uid: 'u1', repo: repo);

    expect((await _valueOf(container, cashbackConfigProvider)).enabled, isTrue);
    expect(
      (await _valueOf(container, cashbackWalletProvider)).availableCents,
      1000,
    );
    expect((await _valueOf(container, cashbackLedgerProvider)).single.id, 'e1');
    expect(
      (await _valueOf(container, cashbackLotProvider('pay_1')))?.earnedCents,
      240,
    );
    expect(
      repo.calls,
      containsAll(<String>['config', 'wallet:u1', 'ledger:u1', 'lot:u1/pay_1']),
    );
  });

  test('deslogado: valores neutros sem tocar no repositório', () async {
    final repo = _FakeCashbackRepository(
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000),
    );
    final container = _container(uid: '', repo: repo);

    expect(
      (await _valueOf(container, cashbackConfigProvider)).enabled,
      isFalse,
    );
    expect(
      (await _valueOf(container, cashbackWalletProvider)).availableCents,
      0,
    );
    expect(await _valueOf(container, cashbackLedgerProvider), isEmpty);
    expect(await _valueOf(container, cashbackLotProvider('pay_1')), isNull);
    expect(repo.calls, isEmpty);
  });

  test('lote sem id não lê nada', () async {
    final repo = _FakeCashbackRepository();
    final container = _container(uid: 'u1', repo: repo);

    expect(await _valueOf(container, cashbackLotProvider(' ')), isNull);
    expect(repo.calls.where((c) => c.startsWith('lot:')), isEmpty);
  });

  test('pílula: ligado com saldo mostra disponível + pendente', () async {
    final container = _container(
      uid: 'u1',
      repo: _FakeCashbackRepository(
        config: ligado,
        wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
      ),
    );
    container.listen(cashbackPillCentsProvider, (_, _) {});
    container.listen(cashbackEnabledProvider, (_, _) {});
    await _valueOf(container, cashbackConfigProvider);
    await _valueOf(container, cashbackWalletProvider);

    expect(container.read(cashbackPillCentsProvider), 1240);
    expect(container.read(cashbackEnabledProvider), isTrue);
  });

  test('pílula: desligado esconde mesmo com saldo antigo', () async {
    final container = _container(
      uid: 'u1',
      repo: _FakeCashbackRepository(
        wallet: const CashbackWallet(availableCents: 1000),
      ),
    );
    container.listen(cashbackPillCentsProvider, (_, _) {});
    container.listen(cashbackEnabledProvider, (_, _) {});
    await _valueOf(container, cashbackConfigProvider);
    await _valueOf(container, cashbackWalletProvider);

    expect(container.read(cashbackPillCentsProvider), isNull);
    expect(container.read(cashbackEnabledProvider), isFalse);
  });

  test('checkout: contexto com a config e o disponível', () async {
    final container = _container(
      uid: 'u1',
      repo: _FakeCashbackRepository(
        config: ligado,
        wallet: const CashbackWallet(availableCents: 1000, pendingCents: 999),
      ),
    );
    container.listen(cashbackCheckoutContextProvider, (_, _) {});
    await _valueOf(container, cashbackConfigProvider);
    await _valueOf(container, cashbackWalletProvider);

    final checkout = container.read(cashbackCheckoutContextProvider);
    expect(checkout, isNotNull);
    expect(checkout!.availableCents, 1000);
    expect(checkout.config.enabled, isTrue);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/infrastructure test/features/cashback/application`
Expected: FAIL — não compila: `firestore_cashback_repository.dart` e `cashback_providers.dart` não existem.

- [ ] **Step 3: Implementar**

Criar `nexago_app/lib/features/cashback/infrastructure/firestore_cashback_repository.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_repository.dart';

/// Linhas do extrato na tela (as mais recentes).
const int cashbackLedgerLimit = 50;

/// Leitura da carteira no Firestore. As rules só deixam o DONO ler
/// `athleteWallets/{uid}` e as subcoleções; escrita é só do servidor.
class FirestoreCashbackRepository implements CashbackRepository {
  FirestoreCashbackRepository(this._db);

  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _wallet(String uid) =>
      _db.collection('athleteWallets').doc(uid);

  @override
  Stream<CashbackConfig> watchConfig() => _db
      .doc('appConfig/cashback')
      .snapshots()
      .map((snap) => CashbackConfig.fromMap(snap.data()));

  @override
  Stream<CashbackWallet> watchWallet(String uid) => _wallet(uid)
      .snapshots()
      .map((snap) => cashbackWalletFromMap(snap.data()));

  @override
  Stream<List<CashbackLedgerEntry>> watchLedger(String uid) => _wallet(uid)
      .collection('ledger')
      .orderBy('createdAt', descending: true)
      .limit(cashbackLedgerLimit)
      .snapshots()
      .map(
        (snap) => snap.docs
            .map((doc) => cashbackLedgerEntryFromMap(doc.id, doc.data()))
            .toList(),
      );

  @override
  Stream<CashbackLot?> watchLot(String uid, String lotId) => _wallet(uid)
      .collection('lots')
      .doc(lotId)
      .snapshots()
      .map((snap) => cashbackLotFromMap(snap.id, snap.data()));
}

final cashbackRepositoryProvider = Provider<CashbackRepository>((ref) {
  return FirestoreCashbackRepository(ref.watch(firestoreProvider));
});

CashbackWallet cashbackWalletFromMap(Map<String, dynamic>? data) {
  if (data == null) return CashbackWallet.empty;
  return CashbackWallet(
    availableCents: _cents(data['availableCents']),
    pendingCents: _cents(data['pendingCents']),
    heldCents: _cents(data['heldCents']),
    lifetimeEarnedCents: _cents(data['lifetimeEarnedCents']),
    lifetimeRedeemedCents: _cents(data['lifetimeRedeemedCents']),
    nextExpiryAt: _date(data['nextExpiryAt']),
    nextExpiryCents: _cents(data['nextExpiryCents']),
  );
}

CashbackLedgerEntry cashbackLedgerEntryFromMap(
  String id,
  Map<String, dynamic> data,
) {
  return CashbackLedgerEntry(
    id: id,
    type: CashbackLedgerType.from(data['type']),
    amountCents: _cents(data['amountCents']),
    label: _text(data['label']),
    createdAt: _date(data['createdAt']),
  );
}

CashbackLot? cashbackLotFromMap(String id, Map<String, dynamic>? data) {
  if (data == null) return null;
  return CashbackLot(
    id: id,
    status: CashbackLotStatus.from(data['status']),
    earnedCents: _cents(data['earnedCents']),
    remainingCents: _cents(data['remainingCents']),
    label: _text(data['label']),
    eventAt: _date(data['eventAt']),
    expiresAt: _date(data['expiresAt']),
  );
}

/// Centavos do servidor: inteiro não negativo; qualquer outra coisa vira 0.
int _cents(Object? raw) {
  if (raw is! num || !raw.isFinite) return 0;
  final cents = raw.round();
  return cents > 0 ? cents : 0;
}

DateTime? _date(Object? raw) {
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw;
  return null;
}

String _text(Object? raw) => raw is String ? raw.trim() : '';
```

Criar `nexago_app/lib/features/cashback/application/cashback_providers.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_rules.dart';
import '../infrastructure/firestore_cashback_repository.dart';

export '../infrastructure/firestore_cashback_repository.dart'
    show cashbackRepositoryProvider;

// Sem TTL de cache de propósito: a home fica montada no shell e a pílula já
// mantém config e carteira vivas enquanto o atleta usa o app (e o `Timer` de
// um TTL ficaria pendente nos testes com `UncontrolledProviderScope`).

/// Uid da sessão; vazio deslogado (os streams viram valores neutros e nenhuma
/// leitura bate nas rules).
final cashbackUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// `appConfig/cashback` (a rule exige sessão).
final cashbackConfigProvider =
    StreamProvider.autoDispose<CashbackConfig>((ref) {
  final uid = ref.watch(cashbackUidProvider);
  if (uid.isEmpty) return Stream.value(CashbackConfig.fallback);
  return ref.watch(cashbackRepositoryProvider).watchConfig();
});

final cashbackWalletProvider =
    StreamProvider.autoDispose<CashbackWallet>((ref) {
  final uid = ref.watch(cashbackUidProvider);
  if (uid.isEmpty) return Stream.value(CashbackWallet.empty);
  return ref.watch(cashbackRepositoryProvider).watchWallet(uid);
});

final cashbackLedgerProvider =
    StreamProvider.autoDispose<List<CashbackLedgerEntry>>((ref) {
  final uid = ref.watch(cashbackUidProvider);
  if (uid.isEmpty) return Stream.value(const <CashbackLedgerEntry>[]);
  return ref.watch(cashbackRepositoryProvider).watchLedger(uid);
});

/// Lote de um pagamento (`lots/{asaasPaymentId}`), ao vivo.
final cashbackLotProvider =
    StreamProvider.autoDispose.family<CashbackLot?, String>((ref, lotId) {
  final uid = ref.watch(cashbackUidProvider);
  final id = lotId.trim();
  if (uid.isEmpty || id.isEmpty) return Stream<CashbackLot?>.value(null);
  return ref.watch(cashbackRepositoryProvider).watchLot(uid, id);
});

/// Valor da pílula da home; `null` = escondida (desligado, sem saldo ou
/// carregando).
final cashbackPillCentsProvider = Provider.autoDispose<int?>((ref) {
  return cashbackPillCents(
    config: ref.watch(cashbackConfigProvider).valueOrNull,
    wallet: ref.watch(cashbackWalletProvider).valueOrNull,
  );
});

/// O que os checkouts precisam; `null` enquanto carrega ou com erro (aí o
/// toggle não aparece e a cobrança sai como sempre).
final cashbackCheckoutContextProvider =
    Provider.autoDispose<CashbackCheckoutContext?>((ref) {
  final config = ref.watch(cashbackConfigProvider).valueOrNull;
  final wallet = ref.watch(cashbackWalletProvider).valueOrNull;
  if (config == null || wallet == null) return null;
  return CashbackCheckoutContext(
    config: config,
    availableCents: wallet.availableCents,
  );
});

/// O recurso está ligado? Carregando ou com erro conta como desligado.
final cashbackEnabledProvider = Provider.autoDispose<bool>((ref) {
  return ref.watch(cashbackConfigProvider).valueOrNull?.enabled ?? false;
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/infrastructure test/features/cashback/application`
Expected: PASS — `All tests passed!` (13 testes).

- [ ] **Step 5: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback test/features/cashback`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/cashback/infrastructure/firestore_cashback_repository.dart nexago_app/lib/features/cashback/application/cashback_providers.dart nexago_app/test/features/cashback/infrastructure/firestore_cashback_repository_test.dart nexago_app/test/features/cashback/application/cashback_providers_test.dart && git commit -m "feat(cashback-app): leitura da carteira no Firestore e providers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tela "Meu cashback", rota `/cashback` e push

**Files:**
- Create: `nexago_app/lib/features/cashback/presentation/cashback_copy.dart`
- Create: `nexago_app/lib/features/cashback/presentation/cashback_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart`
- Modify: `nexago_app/lib/core/router/app_router.dart`
- Modify: `nexago_app/lib/core/auth/role_route_guard.dart`
- Modify: `nexago_app/lib/core/notifications/notification_navigation.dart`
- Create: `nexago_app/test/features/cashback/presentation/cashback_copy_test.dart`
- Create: `nexago_app/test/features/cashback/presentation/cashback_page_test.dart`
- Modify: `nexago_app/test/core/auth/role_route_guard_test.dart`
- Modify: `nexago_app/test/core/notifications/notification_navigation_test.dart`

**Interfaces:**
- Consumes: `cashbackConfigProvider`, `cashbackWalletProvider`, `cashbackLedgerProvider` (Task 2); `groupLedgerByMonth`, `cashbackShortDate`, `formatCashbackRate`, `CashbackLedgerMonth` (Task 1); `formatBRLFromCents`; `NexaAppBar`; `NexaAsyncView`; `popOrGo(context, fallback)` (`core/router/navigation_helpers.dart`).
- Produces: `abstract final class CashbackCopy` (constantes `pageTitle`, `availableLabel`, `howItWorksTitle`, `ledgerTitle`, `ledgerError`, `toggleTitle`, `summaryLabel`, `settingsFallbackSubtitle`, `pillTooltip`, `genericSuccessNote`, `openCashbackAction`; funções `howItWorks(CashbackConfig) → List<String>`, `pendingLine(int)`, `expiringLine(int, DateTime)`, `heldLine(int)`, `emptyLedger(CashbackConfig)`, `signedAmount(CashbackLedgerEntry)`, `ledgerMeta(CashbackLedgerEntry)`, `availableToUse(int)`, `using(int)`, `minCashNote(int)`, `summaryAmount(int)`, `earnHint(CashbackConfig)`, `earnedNote(int)`, `appliedNote(int)`); `class CashbackPage extends ConsumerWidget` (`const CashbackPage({Key? key})`); `AppRoutes.athleteCashback = '/cashback'`; `AppRouteNames.athleteCashback = 'athleteCashback'`; `isAthleteExperiencePath('/cashback') == true`; `resolveNotificationRoute` leva `cashback_*` a `/cashback`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/cashback/presentation/cashback_copy_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';

void main() {
  group('CashbackCopy.howItWorks', () {
    test('cinco linhas com os valores da config', () {
      const config = CashbackConfig(
        enabled: true,
        ratePercent: 2.5,
        maxShareOfFee: 0.5,
        minCashCents: 750,
        expiryMonths: 12,
        expiryWarningDays: 15,
      );
      final lines = CashbackCopy.howItWorks(config);
      expect(lines, hasLength(5));
      expect(lines[0], contains('2,5%'));
      expect(lines[1], 'O cashback fica pendente e libera depois que o jogo acontece.');
      expect(lines[2], 'Vale por 12 meses depois de liberado.');
      expect(lines[3], contains(formatBRLFromCents(750)));
      expect(lines[4], 'Não pode ser sacado nem transferido.');
    });

    test('validade de 1 mês no singular', () {
      const config = CashbackConfig(
        enabled: true,
        ratePercent: 2,
        maxShareOfFee: 0.5,
        minCashCents: 500,
        expiryMonths: 1,
        expiryWarningDays: 15,
      );
      expect(
        CashbackCopy.howItWorks(config)[2],
        'Vale por 1 mês depois de liberado.',
      );
    });
  });

  group('linhas do extrato', () {
    test('sinal pelo tipo e sufixo "pendente" só no ganho', () {
      final earn = CashbackLedgerEntry(
        id: 'a',
        type: CashbackLedgerType.earn,
        amountCents: 240,
        createdAt: DateTime(2026, 9, 28, 9),
      );
      const redeem = CashbackLedgerEntry(
        id: 'b',
        type: CashbackLedgerType.redeem,
        amountCents: 1500,
      );
      expect(CashbackCopy.signedAmount(earn), '+${formatBRLFromCents(240)}');
      expect(
        CashbackCopy.signedAmount(redeem),
        '−${formatBRLFromCents(1500)}',
      );
      expect(CashbackCopy.ledgerMeta(earn), 'pendente · 28/09');
      expect(CashbackCopy.ledgerMeta(redeem), '');
    });
  });
}
```

Criar `nexago_app/test/features/cashback/presentation/cashback_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_page.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirPagina(
  WidgetTester tester, {
  CashbackConfig config = ligado,
  CashbackWallet wallet = CashbackWallet.empty,
  List<CashbackLedgerEntry> ledger = const [],
}) async {
  // Tela alta: a ListView monta preguiçosamente e o extrato fica abaixo da
  // dobra num 800x600.
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith((ref) => Stream.value(wallet)),
        cashbackLedgerProvider.overrideWith((ref) => Stream.value(ledger)),
      ],
      child: MaterialApp(theme: AppTheme.dark, home: const CashbackPage()),
    ),
  );
  // Sem pumpAndSettle: carregando, o extrato mostra um indicador infinito.
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('herói: disponível em destaque, pendente, vencimento e reservado',
      (tester) async {
    await abrirPagina(
      tester,
      wallet: CashbackWallet(
        availableCents: 1240,
        pendingCents: 480,
        heldCents: 300,
        nextExpiryAt: DateTime(2027, 3, 12),
        nextExpiryCents: 320,
      ),
    );

    expect(find.text(CashbackCopy.availableLabel), findsOneWidget);
    expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
    expect(find.text(CashbackCopy.pendingLine(480)), findsOneWidget);
    expect(
      find.text(CashbackCopy.expiringLine(320, DateTime(2027, 3, 12))),
      findsOneWidget,
    );
    expect(find.text(CashbackCopy.heldLine(300)), findsOneWidget);
  });

  testWidgets('sem reserva nem vencimento: as duas linhas somem',
      (tester) async {
    await abrirPagina(
      tester,
      wallet: const CashbackWallet(availableCents: 1240),
    );

    expect(find.text(CashbackCopy.pendingLine(0)), findsOneWidget);
    expect(find.textContaining('Reservado'), findsNothing);
    expect(find.textContaining('vencem em'), findsNothing);
  });

  testWidgets('"Como funciona" mostra as 5 linhas com os valores da config',
      (tester) async {
    const config = CashbackConfig(
      enabled: true,
      ratePercent: 3,
      maxShareOfFee: 0.5,
      minCashCents: 750,
      expiryMonths: 12,
      expiryWarningDays: 15,
    );
    await abrirPagina(tester, config: config);

    expect(find.text(CashbackCopy.howItWorksTitle), findsOneWidget);
    for (final line in CashbackCopy.howItWorks(config)) {
      expect(find.text(line), findsOneWidget);
    }
  });

  testWidgets('extrato agrupado por mês, título por tipo e valor com sinal',
      (tester) async {
    final ledger = [
      CashbackLedgerEntry(
        id: 'e1',
        type: CashbackLedgerType.release,
        amountCents: 240,
        label: 'Reserva · Arena Sol · 12/10',
        createdAt: DateTime(2026, 10, 13, 10),
      ),
      CashbackLedgerEntry(
        id: 'e2',
        type: CashbackLedgerType.redeem,
        amountCents: 1500,
        label: 'Inscrição · Copa Verão',
        createdAt: DateTime(2026, 10, 5, 18),
      ),
      CashbackLedgerEntry(
        id: 'e3',
        type: CashbackLedgerType.earn,
        amountCents: 240,
        label: 'Reserva · Arena Sol · 12/10',
        createdAt: DateTime(2026, 9, 28, 9),
      ),
    ];
    await abrirPagina(tester, ledger: ledger);

    expect(find.text('outubro de 2026'), findsOneWidget);
    expect(find.text('setembro de 2026'), findsOneWidget);
    // O mês mais recente vem antes.
    expect(
      tester.getTopLeft(find.text('outubro de 2026')).dy,
      lessThan(tester.getTopLeft(find.text('setembro de 2026')).dy),
    );
    expect(find.text('Cashback liberado'), findsOneWidget);
    expect(find.text('Usado no pagamento'), findsOneWidget);
    expect(find.text('Cashback ganho'), findsOneWidget);
    expect(find.text('Reserva · Arena Sol · 12/10'), findsNWidgets(2));
    expect(find.text('Inscrição · Copa Verão'), findsOneWidget);
    expect(find.text(CashbackCopy.signedAmount(ledger[0])), findsNWidgets(2));
    expect(find.text(CashbackCopy.signedAmount(ledger[1])), findsOneWidget);
    expect(find.text(CashbackCopy.ledgerMeta(ledger[2])), findsOneWidget);
    expect(find.text(CashbackCopy.ledgerMeta(ledger[0])), findsOneWidget);
  });

  testWidgets('sem lançamentos: estado vazio com a taxa da config',
      (tester) async {
    await abrirPagina(tester);

    expect(find.text(CashbackCopy.emptyLedger(ligado)), findsOneWidget);
  });

  testWidgets('recurso desligado: a página segue mostrando o saldo já ganho',
      (tester) async {
    await abrirPagina(
      tester,
      config: CashbackConfig.fallback,
      wallet: const CashbackWallet(availableCents: 1240),
    );

    expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
    expect(find.text(CashbackCopy.howItWorksTitle), findsOneWidget);
  });
}
```

Em `nexago_app/test/core/auth/role_route_guard_test.dart`, trocar o fim do arquivo:

```dart
      expect(isOrganizerStaffOperablePath('/organizer/home'), isFalse);
      expect(isOrganizerStaffOperablePath('/torneios'), isFalse);
    });
  });
}
```

por:

```dart
      expect(isOrganizerStaffOperablePath('/organizer/home'), isFalse);
      expect(isOrganizerStaffOperablePath('/torneios'), isFalse);
    });
  });

  // `/cashback` é o destino do push `cashback_released`/`cashback_expiring`:
  // fora da área do atleta, um organizador ativo abriria a tela do atleta.
  group('Meu cashback', () {
    test('é rota do atleta', () {
      expect(isAthleteExperiencePath(AppRoutes.athleteCashback), isTrue);
    });

    test('atleta abre; outro papel ativo volta para a própria home', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.athleteCashback,
          activeRole: AppMobileRole.athlete,
          availableRoles: const [AppMobileRole.athlete],
          needsRoleSelection: false,
        ),
        isNull,
      );
      expect(
        redirectForActiveRole(
          path: AppRoutes.athleteCashback,
          activeRole: AppMobileRole.organizer,
          availableRoles: const [
            AppMobileRole.athlete,
            AppMobileRole.organizer,
          ],
          needsRoleSelection: false,
        ),
        AppRoutes.organizerHome,
      );
    });
  });
}
```

Em `nexago_app/test/core/notifications/notification_navigation_test.dart`:

(a) Imports — depois de `import 'package:nexago_app/core/notifications/notification_navigation.dart';` acrescentar:

```dart
import 'package:nexago_app/core/router/routes.dart';
```

(b) Trocar o fim do arquivo:

```dart
      expect(route, '/athlete/history/match/m1');
    });
  });
}
```

por:

```dart
      expect(route, '/athlete/history/match/m1');
    });
  });

  // Varredura diária do backend: `cashback_released` e `cashback_expiring`
  // mandam `url: '/cashback'` (app) e `webUrl: '/cashback'` (portal).
  group('cashback', () {
    for (final type in ['cashback_released', 'cashback_expiring']) {
      test('$type abre Meu cashback pelo url do app', () {
        final route = resolveNotificationRoute({
          'type': type,
          'url': '/cashback',
          'webUrl': '/cashback',
        });
        expect(route, AppRoutes.athleteCashback);
      });

      test('$type sem url (item antigo do inbox) também abre Meu cashback', () {
        expect(
          resolveNotificationRoute({'type': type}),
          AppRoutes.athleteCashback,
        );
      });
    }
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation test/core/auth/role_route_guard_test.dart test/core/notifications/notification_navigation_test.dart`
Expected: FAIL — não compila: `cashback_copy.dart`/`cashback_page.dart` não existem e `The getter 'athleteCashback' isn't defined for the type 'AppRoutes'`.

- [ ] **Step 3: Implementar a copy e a página**

Criar `nexago_app/lib/features/cashback/presentation/cashback_copy.dart`:

```dart
import '../../../core/formatting/app_currency_format.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_rules.dart';

/// Textos do cashback no app — um lugar só.
///
/// O bloco "Como funciona" é o REGULAMENTO da promoção (validade, mínimo em
/// dinheiro, sem saque): o dono revisa este arquivo antes de ligar
/// `appConfig/cashback.enabled`. O portal tem o seu equivalente — mudou aqui,
/// muda lá.
abstract final class CashbackCopy {
  static const String pageTitle = 'Meu cashback';
  static const String availableLabel = 'Disponível';
  static const String howItWorksTitle = 'Como funciona';
  static const String ledgerTitle = 'Extrato';
  static const String ledgerError = 'Não foi possível carregar o extrato.';
  static const String toggleTitle = 'Usar meu cashback';
  static const String summaryLabel = 'Cashback';
  static const String settingsFallbackSubtitle = 'Saldo e extrato';
  static const String pillTooltip = 'Ver meu cashback';
  static const String genericSuccessNote =
      'Pagamentos pelo app geram cashback — veja em Meu cashback';
  static const String openCashbackAction = 'Ver';

  /// As 5 linhas do "Como funciona", com os valores da config.
  static List<String> howItWorks(CashbackConfig config) {
    final months = config.expiryMonths == 1
        ? '1 mês'
        : '${config.expiryMonths} meses';
    return [
      'Ganhe até ${formatCashbackRate(config.ratePercent)}% de volta em '
          'reservas, inscrições e clubinho pagos pelo app.',
      'O cashback fica pendente e libera depois que o jogo acontece.',
      'Vale por $months depois de liberado.',
      'Use como desconto no próximo pagamento pelo app — sempre fica um '
          'mínimo de ${formatBRLFromCents(config.minCashCents)} no PIX.',
      'Não pode ser sacado nem transferido.',
    ];
  }

  static String pendingLine(int cents) =>
      'Pendente ${formatBRLFromCents(cents)} · libera depois do jogo';

  static String expiringLine(int cents, DateTime at) =>
      '${formatBRLFromCents(cents)} vencem em ${cashbackShortDate(at)}';

  static String heldLine(int cents) =>
      'Reservado ${formatBRLFromCents(cents)} · em um pagamento em andamento';

  static String emptyLedger(CashbackConfig config) =>
      'Você ainda não tem cashback. Pague reservas, inscrições e clubinho '
      'pelo app e ganhe até ${formatCashbackRate(config.ratePercent)}% de '
      'volta.';

  /// "+R$ 2,40" / "−R$ 15,00" (sinal de menos tipográfico, U+2212).
  static String signedAmount(CashbackLedgerEntry entry) {
    final sign = entry.isCredit ? '+' : '−';
    return '$sign${formatBRLFromCents(entry.amountCents)}';
  }

  /// Linha miúda sob o valor: "pendente · 28/09" no ganho, só a data no resto.
  static String ledgerMeta(CashbackLedgerEntry entry) {
    final createdAt = entry.createdAt;
    return [
      if (entry.type == CashbackLedgerType.earn) 'pendente',
      if (createdAt != null) cashbackShortDate(createdAt),
    ].join(' · ');
  }

  static String availableToUse(int cents) =>
      '${formatBRLFromCents(cents)} disponível';

  static String using(int cents) => 'Usando ${formatBRLFromCents(cents)}';

  static String minCashNote(int minCashCents) =>
      '(o mínimo de ${formatBRLFromCents(minCashCents)} vai no PIX)';

  static String summaryAmount(int cents) =>
      '−${formatBRLFromCents(cents)}';

  static String earnHint(CashbackConfig config) =>
      'Ganhe até ${formatCashbackRate(config.ratePercent)}% de volta neste '
      'pagamento';

  static String earnedNote(int cents) =>
      '+${formatBRLFromCents(cents)} de cashback pendente · libera depois do '
      'jogo';

  static String appliedNote(int cents) =>
      '${formatBRLFromCents(cents)} do seu cashback neste pagamento';
}
```

Criar `nexago_app/lib/features/cashback/presentation/cashback_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../application/cashback_providers.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_rules.dart';
import 'cashback_copy.dart';

/// "Meu cashback": saldo, regras e extrato do atleta (`/cashback`).
///
/// Abre mesmo com o recurso desligado (link direto ou push): o saldo já ganho
/// continua do atleta e precisa seguir visível. Só as ENTRADAS (pílula, tile,
/// toggle, nota) somem quando `enabled` é falso.
class CashbackPage extends ConsumerWidget {
  const CashbackPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(cashbackConfigProvider).valueOrNull ??
        CashbackConfig.fallback;
    final walletAsync = ref.watch(cashbackWalletProvider);
    final ledgerAsync = ref.watch(cashbackLedgerProvider);
    final colors = context.themeColors;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        // O push abre com `go` (sem pilha): sem o voltar explícito o atleta
        // ficaria preso aqui.
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(context, AppRoutes.discover),
        ),
        title: const Text(CashbackCopy.pageTitle),
      ),
      body: NexaAsyncView<CashbackWallet>(
        value: walletAsync,
        onRetry: () => ref.invalidate(cashbackWalletProvider),
        data: (wallet) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            AppSpacing.xxxl,
          ),
          children: [
            _BalanceHero(wallet: wallet),
            const SizedBox(height: AppSpacing.xl),
            _HowItWorksCard(config: config),
            const SizedBox(height: AppSpacing.sectionGap),
            Text(
              CashbackCopy.ledgerTitle,
              style: AppTypography.titleM.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: AppSpacing.xs),
            ledgerAsync.when(
              data: (entries) => entries.isEmpty
                  ? _EmptyLedger(text: CashbackCopy.emptyLedger(config))
                  : _LedgerList(months: groupLedgerByMonth(entries)),
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, _) => Text(
                CashbackCopy.ledgerError,
                style: AppTypography.bodyS.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceHero extends StatelessWidget {
  const _BalanceHero({required this.wallet});

  final CashbackWallet wallet;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final muted = AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted);
    final nextExpiryAt = wallet.nextExpiryAt;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: AppRadii.xlAll,
        border: Border.all(color: AppColors.win.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(CashbackCopy.availableLabel, style: muted),
          const SizedBox(height: AppSpacing.xs),
          Text(
            formatBRLFromCents(wallet.availableCents),
            style: AppTypography.displayL.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            CashbackCopy.pendingLine(wallet.pendingCents),
            style: AppTypography.bodyS.copyWith(
              color: AppColors.pending,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (nextExpiryAt != null && wallet.nextExpiryCents > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              CashbackCopy.expiringLine(wallet.nextExpiryCents, nextExpiryAt),
              style: muted,
            ),
          ],
          if (wallet.heldCents > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(CashbackCopy.heldLine(wallet.heldCents), style: muted),
          ],
        ],
      ),
    );
  }
}

class _HowItWorksCard extends StatelessWidget {
  const _HowItWorksCard({required this.config});

  final CashbackConfig config;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final lines = CashbackCopy.howItWorks(config);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            CashbackCopy.howItWorksTitle,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.md),
          for (var i = 0; i < lines.length; i++)
            Padding(
              padding: EdgeInsets.only(
                bottom: i == lines.length - 1 ? 0 : AppSpacing.sm,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 22,
                    child: Text(
                      '${i + 1}.',
                      style: AppTypography.bodyS.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      lines[i],
                      style: AppTypography.bodyS.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LedgerList extends StatelessWidget {
  const _LedgerList({required this.months});

  final List<CashbackLedgerMonth> months;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final month in months) ...[
          Padding(
            padding: const EdgeInsets.only(
              top: AppSpacing.md,
              bottom: AppSpacing.xs,
            ),
            child: Text(
              month.title,
              style: AppTypography.labelS.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          for (final entry in month.entries) _LedgerRow(entry: entry),
        ],
      ],
    );
  }
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.entry});

  final CashbackLedgerEntry entry;

  static IconData _iconFor(CashbackLedgerType type) => switch (type) {
        CashbackLedgerType.earn => Icons.hourglass_top_rounded,
        CashbackLedgerType.release => Icons.check_circle_rounded,
        CashbackLedgerType.cancel => Icons.block_rounded,
        CashbackLedgerType.redeem => Icons.shopping_bag_rounded,
        CashbackLedgerType.expire => Icons.event_busy_rounded,
        CashbackLedgerType.reverse => Icons.undo_rounded,
        CashbackLedgerType.refund => Icons.replay_rounded,
        CashbackLedgerType.unknown => Icons.receipt_long_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = switch (entry.tone) {
      CashbackLedgerTone.pending => AppColors.pending,
      CashbackLedgerTone.positive => AppColors.win,
      CashbackLedgerTone.brand => AppColors.brand,
      CashbackLedgerTone.muted => colors.onSurfaceMuted,
    };
    final meta = CashbackCopy.ledgerMeta(entry);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(_iconFor(entry.type), size: 18, color: color),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.title,
                  style: AppTypography.bodyM.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (entry.label.isNotEmpty)
                  Text(
                    entry.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                CashbackCopy.signedAmount(entry),
                style: AppTypography.bodyM.copyWith(
                  color: color,
                  fontWeight: FontWeight.w800,
                  decoration: entry.type == CashbackLedgerType.cancel
                      ? TextDecoration.lineThrough
                      : null,
                ),
              ),
              if (meta.isNotEmpty)
                Text(
                  meta,
                  style: AppTypography.labelS.copyWith(
                    color: entry.type == CashbackLedgerType.earn
                        ? AppColors.pending
                        : colors.onSurfaceMuted,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyLedger extends StatelessWidget {
  const _EmptyLedger({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      margin: const EdgeInsets.only(top: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.savings_outlined, color: colors.onSurfaceMuted),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rota, guarda de papel e push**

Em `nexago_app/lib/core/router/routes.dart`:

(a) Em `AppRoutes`, logo depois de:

```dart
  /// Convide um amigo (programa de indicação).
  static const String athleteReferral = '/athlete/referral';
```

acrescentar:

```dart

  /// Meu cashback (saldo, regras e extrato). Mesmo caminho do portal e do
  /// `url` dos pushes `cashback_released` / `cashback_expiring`.
  static const String athleteCashback = '/cashback';
```

(b) Em `AppRouteNames`, logo depois de `  static const String athleteReferral = 'athleteReferral';` acrescentar:

```dart
  static const String athleteCashback = 'athleteCashback';
```

Em `nexago_app/lib/core/router/app_router.dart`:

(a) Imports — depois de `import '../../features/athlete/presentation/athlete_referral_page.dart';` acrescentar:

```dart
import '../../features/cashback/presentation/cashback_page.dart';
```

(b) Logo depois do bloco:

```dart
      GoRoute(
        path: AppRoutes.athleteReferral,
        name: AppRouteNames.athleteReferral,
        builder: (context, state) => const AthleteReferralPage(),
      ),
```

acrescentar:

```dart
      GoRoute(
        path: AppRoutes.athleteCashback,
        name: AppRouteNames.athleteCashback,
        builder: (context, state) => const CashbackPage(),
      ),
```

Em `nexago_app/lib/core/auth/role_route_guard.dart`, em `isAthleteExperiencePath`, trocar:

```dart
      path == AppRoutes.myBookings ||
      path == AppRoutes.bookingSuccess) {
```

por:

```dart
      path == AppRoutes.myBookings ||
      path == AppRoutes.bookingSuccess ||
      path == AppRoutes.athleteCashback) {
```

Em `nexago_app/lib/core/notifications/notification_navigation.dart`, em `resolveNotificationRoute`, logo depois de:

```dart
  final url = appRouteForNotificationUrl(data['url'] as String?);
  if (url != null) return url;
```

acrescentar:

```dart

  // Cashback liberado / vencendo: o backend manda `url: '/cashback'`; sem ele
  // (item antigo do inbox), o tipo ainda leva a Meu cashback.
  if (type.startsWith('cashback_')) return AppRoutes.athleteCashback;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation test/core/auth/role_route_guard_test.dart test/core/notifications/notification_navigation_test.dart`
Expected: PASS — `All tests passed!` (testes antigos dos dois arquivos de `core/` inclusive).

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback lib/core/router/routes.dart lib/core/router/app_router.dart lib/core/auth/role_route_guard.dart lib/core/notifications/notification_navigation.dart test/features/cashback test/core/auth/role_route_guard_test.dart test/core/notifications/notification_navigation_test.dart`
Expected: `No issues found!` (ver regra de infos antigas nas Global Constraints).

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/cashback/presentation/cashback_copy.dart nexago_app/lib/features/cashback/presentation/cashback_page.dart nexago_app/lib/core/router/routes.dart nexago_app/lib/core/router/app_router.dart nexago_app/lib/core/auth/role_route_guard.dart nexago_app/lib/core/notifications/notification_navigation.dart nexago_app/test/features/cashback/presentation/cashback_copy_test.dart nexago_app/test/features/cashback/presentation/cashback_page_test.dart nexago_app/test/core/auth/role_route_guard_test.dart nexago_app/test/core/notifications/notification_navigation_test.dart && git commit -m "feat(cashback-app): tela Meu cashback, rota /cashback e destino do push

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Entradas — pílula na home e tile nos ajustes

**Files:**
- Create: `nexago_app/lib/features/cashback/presentation/widgets/cashback_balance_pill.dart`
- Create: `nexago_app/lib/features/cashback/presentation/widgets/cashback_settings_tile.dart`
- Modify: `nexago_app/lib/features/athlete/presentation/athlete_home_page.dart`
- Modify: `nexago_app/lib/features/athlete/presentation/athlete_settings_page.dart`
- Create: `nexago_app/test/features/cashback/presentation/cashback_balance_pill_test.dart`
- Create: `nexago_app/test/features/cashback/presentation/cashback_settings_tile_test.dart`

**Interfaces:**
- Consumes: `cashbackPillCentsProvider`, `cashbackEnabledProvider`, `cashbackWalletProvider` (Task 2); `CashbackCopy` e `AppRouteNames.athleteCashback` (Task 3); `AthleteSettingsTile`, `AthleteSettingsIconVariant` (`features/athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart`).
- Produces: `class CashbackBalancePill extends StatelessWidget` (`{required int balanceCents, required VoidCallback onTap}`); `class CashbackHeroPillSlot extends ConsumerWidget` (`{VoidCallback? onTap}` — nulo abre `AppRouteNames.athleteCashback`); `class CashbackSettingsTile extends ConsumerWidget` (`{VoidCallback? onTap}`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/cashback/presentation/cashback_balance_pill_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_balance_pill.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirSlot(
  WidgetTester tester, {
  required CashbackConfig config,
  required CashbackWallet wallet,
  VoidCallback? onTap,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith((ref) => Stream.value(wallet)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Center(child: CashbackHeroPillSlot(onTap: onTap ?? () {})),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('ligado com saldo: mostra disponível + pendente e abre a tela',
      (tester) async {
    var aberturas = 0;
    await abrirSlot(
      tester,
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
      onTap: () => aberturas++,
    );

    expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
    await tester.tap(find.byType(CashbackBalancePill));
    expect(aberturas, 1);
  });

  testWidgets('só pendente também acende a pílula', (tester) async {
    await abrirSlot(
      tester,
      config: ligado,
      wallet: const CashbackWallet(pendingCents: 240),
    );

    expect(find.text(formatBRLFromCents(240)), findsOneWidget);
  });

  testWidgets('desligado com saldo antigo: a pílula some', (tester) async {
    await abrirSlot(
      tester,
      config: CashbackConfig.fallback,
      wallet: const CashbackWallet(availableCents: 1000),
    );

    expect(find.byType(CashbackBalancePill), findsNothing);
  });

  testWidgets('ligado sem saldo: a pílula some', (tester) async {
    await abrirSlot(tester, config: ligado, wallet: CashbackWallet.empty);

    expect(find.byType(CashbackBalancePill), findsNothing);
  });
}
```

Criar `nexago_app/test/features/cashback/presentation/cashback_settings_tile_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_settings_tile.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirTile(
  WidgetTester tester, {
  required CashbackConfig config,
  CashbackWallet wallet = CashbackWallet.empty,
  VoidCallback? onTap,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith((ref) => Stream.value(wallet)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: CashbackSettingsTile(onTap: onTap ?? () {})),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('ligado: "Meu cashback" com o disponível, e o toque abre a tela',
      (tester) async {
    var aberturas = 0;
    await abrirTile(
      tester,
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
      onTap: () => aberturas++,
    );

    expect(find.text(CashbackCopy.pageTitle), findsOneWidget);
    expect(find.text(CashbackCopy.availableToUse(1000)), findsOneWidget);
    await tester.tap(find.text(CashbackCopy.pageTitle));
    expect(aberturas, 1);
  });

  testWidgets('desligado com saldo antigo: o tile some', (tester) async {
    await abrirTile(
      tester,
      config: CashbackConfig.fallback,
      wallet: const CashbackWallet(availableCents: 1000),
    );

    expect(find.text(CashbackCopy.pageTitle), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation/cashback_balance_pill_test.dart test/features/cashback/presentation/cashback_settings_tile_test.dart`
Expected: FAIL — não compila: `cashback_balance_pill.dart` e `cashback_settings_tile.dart` não existem.

- [ ] **Step 3: Implementar os widgets**

Criar `nexago_app/lib/features/cashback/presentation/widgets/cashback_balance_pill.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/cashback_providers.dart';
import '../cashback_copy.dart';

/// Pílula "R$ 12,40" do herói da home. Fundo escuro próprio, como a de XP: o
/// canto inferior direito das artes é claro (ver `AthleteHomeHero`).
class CashbackBalancePill extends StatelessWidget {
  const CashbackBalancePill({
    super.key,
    required this.balanceCents,
    required this.onTap,
  });

  final int balanceCents;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: CashbackCopy.pillTooltip,
      child: Material(
        color: AppColors.black.withValues(alpha: 0.55),
        borderRadius: AppRadii.pillAll,
        child: InkWell(
          onTap: onTap,
          borderRadius: AppRadii.pillAll,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: AppRadii.pillAll,
              border: Border.all(color: AppColors.win.withValues(alpha: 0.55)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.savings_rounded,
                  size: 16,
                  color: AppColors.win,
                ),
                const SizedBox(width: 5),
                Text(
                  formatBRLFromCents(balanceCents),
                  style: AppTypography.titleS.copyWith(
                    color: AppColors.white,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Encaixe da pílula ao lado da de XP: some com o recurso desligado ou sem
/// saldo (disponível + pendente), levando o espaçamento junto.
class CashbackHeroPillSlot extends ConsumerWidget {
  const CashbackHeroPillSlot({super.key, this.onTap});

  /// Injetável para teste; em produção abre Meu cashback.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cents = ref.watch(cashbackPillCentsProvider);
    if (cents == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: CashbackBalancePill(
        balanceCents: cents,
        onTap: onTap ?? () => context.pushNamed(AppRouteNames.athleteCashback),
      ),
    );
  }
}
```

Criar `nexago_app/lib/features/cashback/presentation/widgets/cashback_settings_tile.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../application/cashback_providers.dart';
import '../cashback_copy.dart';

/// Tile "Meu cashback" no grupo PREFERÊNCIAS dos ajustes — o "Pagamentos"
/// continua sendo o de métodos salvos. Some com o recurso desligado: a tela
/// segue alcançável pelo push e pelo link direto.
class CashbackSettingsTile extends ConsumerWidget {
  const CashbackSettingsTile({super.key, this.onTap});

  /// Injetável para teste; em produção abre Meu cashback.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(cashbackEnabledProvider)) return const SizedBox.shrink();
    final wallet = ref.watch(cashbackWalletProvider).valueOrNull;
    return AthleteSettingsTile(
      icon: Icons.savings_outlined,
      title: CashbackCopy.pageTitle,
      subtitle: wallet == null
          ? CashbackCopy.settingsFallbackSubtitle
          : CashbackCopy.availableToUse(wallet.availableCents),
      variant: AthleteSettingsIconVariant.green,
      onTap: onTap ?? () => context.pushNamed(AppRouteNames.athleteCashback),
      showDivider: true,
    );
  }
}
```

- [ ] **Step 4: Ligar na home e nos ajustes**

Em `nexago_app/lib/features/athlete/presentation/athlete_home_page.dart`:

(a) Imports — depois de `import '../../arenas/domain/my_bookings_providers.dart';` acrescentar:

```dart
import '../../cashback/presentation/widgets/cashback_balance_pill.dart';
```

(b) No `AthleteHomeHero(...)`, trocar:

```dart
                        bottomRight: _HeroXpPill(
                          current: summary.xpInCurrentLevel,
                          goal: 100,
                          onTap: () =>
                              context.pushNamed(AppRouteNames.athleteQuest),
                        ),
```

por:

```dart
                        // Pílula do cashback à esquerda da de XP; o encaixe
                        // some sozinho com o recurso desligado ou sem saldo.
                        bottomRight: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const CashbackHeroPillSlot(),
                            _HeroXpPill(
                              current: summary.xpInCurrentLevel,
                              goal: 100,
                              onTap: () =>
                                  context.pushNamed(AppRouteNames.athleteQuest),
                            ),
                          ],
                        ),
```

Em `nexago_app/lib/features/athlete/presentation/athlete_settings_page.dart`:

(a) Imports — depois de `import '../../arenas/domain/my_bookings_providers.dart';` acrescentar:

```dart
import '../../cashback/presentation/widgets/cashback_settings_tile.dart';
```

(b) No grupo `PREFERÊNCIAS`, trocar:

```dart
                AthleteSettingsTile(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Pagamentos',
```

por:

```dart
                const CashbackSettingsTile(),
                AthleteSettingsTile(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Pagamentos',
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation/cashback_balance_pill_test.dart test/features/cashback/presentation/cashback_settings_tile_test.dart test/features/athlete/athlete_home_page_test.dart`
Expected: PASS — `All tests passed!` (o teste antigo da home só renderiza o skeleton e continua verde).

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback/presentation/widgets lib/features/athlete/presentation/athlete_home_page.dart lib/features/athlete/presentation/athlete_settings_page.dart test/features/cashback/presentation`
Expected: `No issues found!`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/cashback/presentation/widgets/cashback_balance_pill.dart nexago_app/lib/features/cashback/presentation/widgets/cashback_settings_tile.dart nexago_app/lib/features/athlete/presentation/athlete_home_page.dart nexago_app/lib/features/athlete/presentation/athlete_settings_page.dart nexago_app/test/features/cashback/presentation/cashback_balance_pill_test.dart nexago_app/test/features/cashback/presentation/cashback_settings_tile_test.dart && git commit -m "feat(cashback-app): pílula na home e tile Meu cashback nos ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Toggle "Usar meu cashback" do checkout

**Files:**
- Create: `nexago_app/lib/features/cashback/presentation/widgets/checkout_cashback_toggle.dart`
- Create: `nexago_app/test/features/cashback/presentation/checkout_cashback_toggle_test.dart`

**Interfaces:**
- Consumes: `CashbackConfig` (Task 1); `quoteCheckoutCashback`, `CashbackCheckoutContext`, `CashbackToggleMode` (Task 1); `CashbackCopy` (Task 3).
- Produces: `class CheckoutCashbackToggle extends StatelessWidget` (`{required int priceCents, required int availableCents, required CashbackConfig config, required bool value, required ValueChanged<bool> onChanged, bool enabled = true}`; `static const Key switchKey`); `class CheckoutCashbackAppliedNote extends StatelessWidget` (`{required int appliedCents}`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/cashback/presentation/checkout_cashback_toggle_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

CheckoutCashbackToggle toggle({
  CashbackConfig config = ligado,
  int price = 2000,
  int available = 3000,
  bool value = false,
  bool enabled = true,
  ValueChanged<bool>? onChanged,
}) {
  return CheckoutCashbackToggle(
    priceCents: price,
    availableCents: available,
    config: config,
    value: value,
    enabled: enabled,
    onChanged: onChanged ?? (_) {},
  );
}

Future<void> abrir(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: Padding(padding: const EdgeInsets.all(16), child: child),
      ),
    ),
  );
}

void main() {
  testWidgets('recurso desligado: nada aparece', (tester) async {
    await abrir(tester, toggle(config: CashbackConfig.fallback));

    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
    expect(find.textContaining('de volta'), findsNothing);
  });

  testWidgets('sem saldo: só a linha de ganho', (tester) async {
    await abrir(tester, toggle(available: 0));

    expect(find.text(CashbackCopy.earnHint(ligado)), findsOneWidget);
    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
  });

  testWidgets('preço no mínimo em dinheiro: só a linha de ganho, sem switch',
      (tester) async {
    await abrir(tester, toggle(price: 500, available: 3000));

    expect(find.text(CashbackCopy.earnHint(ligado)), findsOneWidget);
    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
  });

  testWidgets('com saldo e desligado: mostra o disponível, sem resumo',
      (tester) async {
    await abrir(tester, toggle());

    expect(find.text(CashbackCopy.toggleTitle), findsOneWidget);
    expect(find.text(CashbackCopy.availableToUse(3000)), findsOneWidget);
    expect(
      tester.widget<Switch>(find.byKey(CheckoutCashbackToggle.switchKey)).value,
      isFalse,
    );
    expect(find.text(CashbackCopy.using(1500)), findsNothing);
    expect(find.text(CashbackCopy.summaryLabel), findsNothing);
  });

  testWidgets('ligado: "Usando", aviso do mínimo e linha de resumo',
      (tester) async {
    await abrir(tester, toggle(value: true));

    expect(find.text(CashbackCopy.using(1500)), findsOneWidget);
    expect(find.text(CashbackCopy.minCashNote(500)), findsOneWidget);
    expect(find.text(CashbackCopy.summaryLabel), findsOneWidget);
    expect(find.text(CashbackCopy.summaryAmount(1500)), findsOneWidget);
  });

  testWidgets('saldo abaixo do teto: usa tudo, sem aviso do mínimo',
      (tester) async {
    await abrir(tester, toggle(price: 5000, available: 1000, value: true));

    expect(find.text(CashbackCopy.using(1000)), findsOneWidget);
    expect(find.text(CashbackCopy.minCashNote(500)), findsNothing);
    expect(find.text(CashbackCopy.summaryAmount(1000)), findsOneWidget);
  });

  testWidgets('tocar no switch devolve a escolha', (tester) async {
    final escolhas = <bool>[];
    await abrir(tester, toggle(onChanged: escolhas.add));

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    expect(escolhas, [true]);
  });

  testWidgets('desabilitado enquanto a cobrança é gerada', (tester) async {
    final escolhas = <bool>[];
    await abrir(tester, toggle(enabled: false, onChanged: escolhas.add));

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    expect(escolhas, isEmpty);
  });

  group('CheckoutCashbackAppliedNote', () {
    testWidgets('mostra o que o servidor aplicou', (tester) async {
      await abrir(tester, const CheckoutCashbackAppliedNote(appliedCents: 1500));

      expect(find.text(CashbackCopy.appliedNote(1500)), findsOneWidget);
    });

    testWidgets('nada aplicado: nada aparece', (tester) async {
      await abrir(tester, const CheckoutCashbackAppliedNote(appliedCents: 0));

      expect(find.textContaining('do seu cashback'), findsNothing);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation/checkout_cashback_toggle_test.dart`
Expected: FAIL — não compila: `checkout_cashback_toggle.dart` não existe.

- [ ] **Step 3: Implementar**

Criar `nexago_app/lib/features/cashback/presentation/widgets/checkout_cashback_toggle.dart`:

```dart
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/cashback_models.dart';
import '../../domain/cashback_rules.dart';
import '../cashback_copy.dart';

/// "Usar meu cashback" no checkout, ANTES de gerar a cobrança (some depois que
/// o QR existe). Controlado: a página guarda o valor — começa DESLIGADO, o
/// atleta escolhe gastar — e manda `useCashback: true` só com ele ligado.
///
/// Três estados (os mesmos do portal):
/// - recurso desligado → nada;
/// - ligado sem saldo usável (inclusive preço no mínimo em dinheiro) → só a
///   linha "Ganhe até X% de volta neste pagamento";
/// - ligado com saldo usável → o switch, a prévia e a linha de resumo.
class CheckoutCashbackToggle extends StatelessWidget {
  const CheckoutCashbackToggle({
    super.key,
    required this.priceCents,
    required this.availableCents,
    required this.config,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  static const Key switchKey = ValueKey('checkout-cashback-switch');

  /// Preço desta cobrança (na reserva com sinal, o valor a pagar AGORA).
  final int priceCents;
  final int availableCents;
  final CashbackConfig config;
  final bool value;
  final ValueChanged<bool> onChanged;

  /// Falso enquanto a cobrança está sendo gerada.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final quote = quoteCheckoutCashback(
      priceCents: priceCents,
      checkout: CashbackCheckoutContext(
        config: config,
        availableCents: availableCents,
      ),
      useCashback: value,
    );
    return switch (quote.mode) {
      CashbackToggleMode.hidden => const SizedBox.shrink(),
      CashbackToggleMode.earnHint =>
        _CashbackLine(text: CashbackCopy.earnHint(config)),
      CashbackToggleMode.toggle => _ToggleCard(
          quote: quote,
          minCashCents: config.minCashCents,
          value: value,
          enabled: enabled,
          onChanged: onChanged,
        ),
    };
  }
}

/// Depois da cobrança: quanto do saldo o SERVIDOR aplicou (pode ser menos que
/// a prévia, se o saldo mudou no meio). Nada quando não aplicou.
class CheckoutCashbackAppliedNote extends StatelessWidget {
  const CheckoutCashbackAppliedNote({super.key, required this.appliedCents});

  final int appliedCents;

  @override
  Widget build(BuildContext context) {
    if (appliedCents <= 0) return const SizedBox.shrink();
    return _CashbackLine(text: CashbackCopy.appliedNote(appliedCents));
  }
}

class _CashbackLine extends StatelessWidget {
  const _CashbackLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.savings_outlined, size: 16, color: AppColors.win),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
      ],
    );
  }
}

class _ToggleCard extends StatelessWidget {
  const _ToggleCard({
    required this.quote,
    required this.minCashCents,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final CashbackCheckoutQuote quote;
  final int minCashCents;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final muted = theme.textTheme.bodySmall?.copyWith(
      color: colors.onSurfaceMuted,
    );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: value
              ? AppColors.win.withValues(alpha: 0.45)
              : colors.surfaceRaised,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.savings_outlined,
                color: AppColors.win,
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      CashbackCopy.toggleTitle,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      value
                          ? CashbackCopy.using(quote.redeemableCents)
                          : CashbackCopy.availableToUse(quote.availableCents),
                      style: muted,
                    ),
                    if (value && quote.minCashHoldsBack)
                      Text(CashbackCopy.minCashNote(minCashCents), style: muted),
                  ],
                ),
              ),
              Switch(
                key: CheckoutCashbackToggle.switchKey,
                value: value,
                onChanged: enabled ? onChanged : null,
                activeTrackColor: AppColors.win.withValues(alpha: 0.45),
                activeThumbColor: AppColors.win,
              ),
            ],
          ),
          if (value) ...[
            const SizedBox(height: 10),
            Divider(height: 1, color: colors.surfaceRaised),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(CashbackCopy.summaryLabel, style: muted),
                ),
                Text(
                  CashbackCopy.summaryAmount(quote.redeemableCents),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.win,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation/checkout_cashback_toggle_test.dart`
Expected: PASS — `All tests passed!` (10 testes).

- [ ] **Step 5: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback/presentation/widgets/checkout_cashback_toggle.dart test/features/cashback/presentation/checkout_cashback_toggle_test.dart`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/cashback/presentation/widgets/checkout_cashback_toggle.dart nexago_app/test/features/cashback/presentation/checkout_cashback_toggle_test.dart && git commit -m "feat(cashback-app): toggle Usar meu cashback do checkout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reserva — `useCashback` na callable e toggle no PIX

**Files:**
- Modify: `nexago_app/lib/features/arenas/data/payment_service.dart`
- Modify: `nexago_app/lib/features/arenas/presentation/arena_booking_pix_page.dart`
- Create: `nexago_app/test/features/arenas/data/payment_service_cashback_test.dart`
- Create: `nexago_app/test/features/arenas/arena_booking_pix_page_cashback_test.dart`

**Interfaces:**
- Consumes: `cashbackCheckoutContextProvider` (Task 2); `quoteCheckoutCashback`, `reaisToCents`, `CashbackCheckoutQuote`, `CashbackCheckoutContext`, `CashbackToggleMode` (Task 1); `CheckoutCashbackToggle`, `CheckoutCashbackAppliedNote` (Task 5).
- Produces:
  - `ArenaBookingPixPaymentResult` ganha `final double cashbackAppliedReais` (padrão 0) e `final double chargedReais` (padrão = `amountToPayNowReais`); `amountToPayNowReais` continua o PREÇO. O mesmo tipo serve à inscrição (Task 7).
  - `PaymentService.createArenaBookingPixPayment({required String bookingId, String? cpfCnpj, double? paymentFraction, bool useCashback = false})` e `PaymentService.createTournamentRegistrationPixPayment({required String registrationId, String? cpfCnpj, String amountType = 'share', bool useCashback = false})` — `useCashback: true` só vai no payload quando ligado; respostas lidas por `static ArenaBookingPixPaymentResult _parsePixResponse(Object? data, {required String priceKey, required Duration expiryFallback})`.
  - `ArenaBookingPixPage` com `bool _useCashback = false` e `CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext?)` sobre `_payNowReais`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/arenas/data/payment_service_cashback_test.dart`:

```dart
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';

/// Resposta comum das callables de PIX; cada teste soma o preço e, se for o
/// caso, os campos de cashback.
const _pix = <String, Object?>{
  'paymentId': 'pay_1',
  'qrCode': '00020101021226860014br.gov.bcb.pix',
  'qrCodeBase64': '',
  'expiresAt': '2026-10-02T15:00:00.000Z',
};

void main() {
  group('createArenaBookingPixPayment — cashback', () {
    test('manda useCashback só quando o atleta ligou o toggle', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingPixPayment': {..._pix, 'amountToPayNowReais': 20.0},
      });
      final service = PaymentService(functions: functions);

      await service.createArenaBookingPixPayment(
        bookingId: 'b1',
        useCashback: true,
      );
      await service.createArenaBookingPixPayment(bookingId: 'b1');

      expect(functions.calledPayloads[0]?['useCashback'], isTrue);
      expect(
        functions.calledPayloads[1]?.containsKey('useCashback'),
        isFalse,
      );
    });

    test('lê o aplicado e o cobrado; amountToPayNowReais segue sendo o preço',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingPixPayment': {
          ..._pix,
          'amountToPayNowReais': 20.0,
          'cashbackAppliedReais': 15.0,
          'chargedReais': 5.0,
        },
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createArenaBookingPixPayment(
        bookingId: 'b1',
        useCashback: true,
      );

      expect(pix.amountToPayNowReais, 20.0);
      expect(pix.cashbackAppliedReais, 15.0);
      expect(pix.chargedReais, 5.0);
    });

    test('functions antigas (sem chargedReais): o PIX vale o preço', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingPixPayment': {..._pix, 'amountToPayNowReais': 20.0},
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createArenaBookingPixPayment(
        bookingId: 'b1',
        useCashback: true,
      );

      expect(pix.cashbackAppliedReais, 0);
      expect(pix.chargedReais, 20.0);
    });
  });

  group('createTournamentRegistrationPixPayment — cashback', () {
    test('manda useCashback e lê o cobrado; amountReais segue sendo o preço',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationPixPayment': {
          ..._pix,
          'amountReais': 100.0,
          'cashbackAppliedReais': 10.0,
          'chargedReais': 90.0,
        },
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: 'r1',
        useCashback: true,
      );

      expect(functions.calledPayloads.single?['useCashback'], isTrue);
      expect(pix.amountToPayNowReais, 100.0);
      expect(pix.cashbackAppliedReais, 10.0);
      expect(pix.chargedReais, 90.0);
    });

    test('toggle desligado e functions antigas: payload e valor de antes',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationPixPayment': {..._pix, 'amountReais': 100.0},
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: 'r1',
      );

      expect(
        functions.calledPayloads.single?.containsKey('useCashback'),
        isFalse,
      );
      expect(pix.chargedReais, 100.0);
    });
  });
}

/// Mesmo dublê de `booking_service_coupon_test.dart`: registra o payload de
/// cada chamada e devolve a resposta encenada por nome de callable.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calledPayloads.add(
          parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        );
      },
      result: responses[name],
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result});

  final void Function(dynamic parameters) onCall;
  final Object? result;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeHttpsCallableResult<T>(result);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  _FakeHttpsCallableResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
```

Criar `nexago_app/test/features/arenas/arena_booking_pix_page_cashback_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_pix_args.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
import 'package:nexago_app/features/arenas/presentation/arena_booking_pix_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

/// Dublê do serviço de pagamento: guarda o que a tela pediu e devolve a
/// resposta encenada pelo teste (o que a callable devolveria).
class _FakePaymentService implements PaymentService {
  _FakePaymentService(this.result);

  final ArenaBookingPixPaymentResult result;
  final calls = <({double? fraction, bool useCashback})>[];

  @override
  Future<ArenaBookingPixPaymentResult> createArenaBookingPixPayment({
    required String bookingId,
    String? cpfCnpj,
    double? paymentFraction,
    bool useCashback = false,
  }) async {
    calls.add((fraction: paymentFraction, useCashback: useCashback));
    return result;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingPixPaymentResult resposta({
  required double price,
  double applied = 0,
  double? charged,
  String paymentId = 'pay_1',
}) {
  return ArenaBookingPixPaymentResult(
    paymentId: paymentId,
    qrCode: '00020101021226860014br.gov.bcb.pix',
    qrCodeBase64: '',
    expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    amountToPayNowReais: price,
    cashbackAppliedReais: applied,
    chargedReais: charged,
  );
}

/// Reserva de R$ 100; com `fraction: 0.5` o atleta paga R$ 50 agora.
ArenaBookingPixArgs reserva({double fraction = 1.0}) {
  return ArenaBookingPixArgs(
    bookingId: 'b1',
    confirmArgs: ArenaBookingConfirmArgs(
      arenaId: 'a1',
      arenaName: 'Arena Sol',
      courtId: 'q1',
      courtName: 'Quadra 1',
      date: DateTime(2026, 10, 12),
      startTime: '19:00',
      endTime: '20:00',
      amountReais: 100,
    ),
    amountToPayNowReais: 100 * fraction,
    amountDueOnsiteReais: 100 - 100 * fraction,
    paymentFraction: fraction,
  );
}

List<Override> overridesDaTela(
  _FakePaymentService service, {
  CashbackConfig config = ligado,
  int availableCents = 0,
  Stream<DocumentSnapshot<Map<String, dynamic>>?>? bookingDocs,
}) {
  return [
    paymentServiceProvider.overrideWithValue(service),
    athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
    arenaBookingDocProvider('b1').overrideWith(
      (ref) =>
          bookingDocs ??
          Stream<DocumentSnapshot<Map<String, dynamic>>?>.value(null),
    ),
    cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
    cashbackWalletProvider.overrideWith(
      (ref) => Stream.value(CashbackWallet(availableCents: availableCents)),
    ),
  ];
}

Future<void> abrirPix(
  WidgetTester tester, {
  required _FakePaymentService service,
  required ArenaBookingPixArgs args,
  CashbackConfig config = ligado,
  int availableCents = 0,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overridesDaTela(
        service,
        config: config,
        availableCents: availableCents,
      ),
      child: MaterialApp(
        theme: AppTheme.dark,
        home: ArenaBookingPixPage(arenaId: 'a1', args: args),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Future<void> gerarPix(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '52998224725');
  await tester.pump();
  await tester.tap(find.text('Gerar PIX'));
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets(
      'sinal de 50%: a prévia usa o valor a pagar agora e a cobrança vai com useCashback',
      (tester) async {
    final service = _FakePaymentService(
      resposta(price: 50, applied: 45, charged: 5),
    );
    await abrirPix(
      tester,
      service: service,
      args: reserva(fraction: 0.5),
      availableCents: 6000,
    );

    // O switch começa DESLIGADO: o atleta escolhe gastar.
    expect(find.text(CashbackCopy.availableToUse(6000)), findsOneWidget);
    expect(
      tester.widget<Switch>(find.byKey(CheckoutCashbackToggle.switchKey)).value,
      isFalse,
    );

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    await tester.pump();

    // R$ 50 agora menos o mínimo de R$ 5: usa R$ 45 — não R$ 60 nem R$ 95.
    expect(find.text(CashbackCopy.using(4500)), findsOneWidget);
    expect(find.text(CashbackCopy.minCashNote(500)), findsOneWidget);
    expect(find.text('${formatBRL(5)} · pagar com seu banco'), findsOneWidget);

    await gerarPix(tester);

    expect(service.calls.single, (fraction: 0.5, useCashback: true));
    // Depois da resposta vale o que o servidor cobrou.
    expect(find.text(formatBRL(5)), findsOneWidget);
    expect(find.text(CashbackCopy.appliedNote(4500)), findsOneWidget);
    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
  });

  testWidgets('toggle intocado: a cobrança sai sem useCashback, pelo preço',
      (tester) async {
    final service = _FakePaymentService(resposta(price: 100));
    await abrirPix(
      tester,
      service: service,
      args: reserva(),
      availableCents: 6000,
    );

    await gerarPix(tester);

    expect(service.calls.single, (fraction: 1.0, useCashback: false));
    expect(find.text(formatBRL(100)), findsOneWidget);
    expect(find.textContaining('do seu cashback'), findsNothing);
  });

  testWidgets('recurso desligado com saldo: nem toggle nem linha de ganho',
      (tester) async {
    final service = _FakePaymentService(resposta(price: 100));
    await abrirPix(
      tester,
      service: service,
      args: reserva(),
      config: CashbackConfig.fallback,
      availableCents: 6000,
    );

    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
    expect(find.textContaining('de volta'), findsNothing);

    await gerarPix(tester);
    expect(service.calls.single.useCashback, isFalse);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/arenas/data/payment_service_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart`
Expected: FAIL — não compila: `No named parameter with the name 'useCashback'` e `No named parameter with the name 'cashbackAppliedReais'`.

- [ ] **Step 3: Implementar o serviço**

Em `nexago_app/lib/features/arenas/data/payment_service.dart`:

(a) Trocar a classe inteira:

```dart
/// Resposta da callable `createArenaBookingPixPayment`.
class ArenaBookingPixPaymentResult {
  const ArenaBookingPixPaymentResult({
    required this.paymentId,
    required this.qrCode,
    required this.qrCodeBase64,
    required this.expiresAt,
    required this.amountToPayNowReais,
  });

  final String paymentId;
  final String qrCode;
  final String qrCodeBase64;
  final DateTime expiresAt;
  final double amountToPayNowReais;
}
```

por:

```dart
/// Resposta das callables de PIX da reserva e da inscrição.
class ArenaBookingPixPaymentResult {
  const ArenaBookingPixPaymentResult({
    required this.paymentId,
    required this.qrCode,
    required this.qrCodeBase64,
    required this.expiresAt,
    required this.amountToPayNowReais,
    this.cashbackAppliedReais = 0,
    double? chargedReais,
  }) : chargedReais = chargedReais ?? amountToPayNowReais;

  final String paymentId;
  final String qrCode;
  final String qrCodeBase64;
  final DateTime expiresAt;

  /// PREÇO desta cobrança — com cashback aplicado continua o preço cheio.
  final double amountToPayNowReais;

  /// Parte paga com o saldo de cashback (0 sem saldo).
  final double cashbackAppliedReais;

  /// O que o QR cobra no PIX: o valor a mostrar depois da resposta.
  final double chargedReais;
}
```

(b) Trocar o trecho que vai de `  /// Gera cobrança PIX in-app (QR + copia e cola).` até a `}` que fecha `createTournamentRegistrationPixPayment` (a linha antes de `  /// Confirma inscrição gratuita (taxa zero) sem PIX.`) por:

```dart
  /// Gera cobrança PIX in-app (QR + copia e cola).
  ///
  /// `useCashback` só vai no payload quando o atleta ligou o toggle: sem ele a
  /// callable segue o comportamento de sempre (cliente antigo também).
  Future<ArenaBookingPixPaymentResult> createArenaBookingPixPayment({
    required String bookingId,
    String? cpfCnpj,
    double? paymentFraction,
    bool useCashback = false,
  }) async {
    if (bookingId.isEmpty) {
      throw PaymentException('Reserva inválida.');
    }

    try {
      final callable = _functions.httpsCallable(
        _callableCreateArenaBookingPixPayment,
      );
      final payload = <String, dynamic>{'bookingId': bookingId};
      final cpf = cpfCnpj?.replaceAll(RegExp(r'\D'), '') ?? '';
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      if (paymentFraction == 0.5 || paymentFraction == 1.0) {
        payload['paymentFraction'] = paymentFraction;
      }
      if (useCashback) {
        payload['useCashback'] = true;
      }
      final raw = await callable.call(payload);
      return _parsePixResponse(
        raw.data,
        priceKey: 'amountToPayNowReais',
        expiryFallback: arenaBookingPixExpiryFallback,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível gerar o PIX: $e');
    }
  }

  /// Gera cobrança PIX in-app para parcela de inscrição em torneio.
  Future<ArenaBookingPixPaymentResult> createTournamentRegistrationPixPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
    bool useCashback = false,
  }) async {
    if (registrationId.isEmpty) {
      throw PaymentException('Inscrição inválida.');
    }

    try {
      final callable = _functions.httpsCallable(
        _callableCreateTournamentRegistrationPixPayment,
      );
      final payload = <String, dynamic>{
        'registrationId': registrationId,
        if (amountType == 'full') 'amountType': 'full',
      };
      final cpf = cpfCnpj?.replaceAll(RegExp(r'\D'), '') ?? '';
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      if (useCashback) {
        payload['useCashback'] = true;
      }
      final raw = await callable.call(payload);
      return _parsePixResponse(
        raw.data,
        priceKey: 'amountReais',
        expiryFallback: tournamentRegistrationPixExpiryFallback,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível gerar o PIX: $e');
    }
  }

  /// Lê a resposta das callables de PIX (reserva e inscrição).
  ///
  /// [priceKey] é o PREÇO (`amountToPayNowReais` na reserva, `amountReais` na
  /// inscrição) e continua o preço mesmo com saldo aplicado. O QR vale
  /// `chargedReais`; sem o campo (functions antigas) vale o preço.
  static ArenaBookingPixPaymentResult _parsePixResponse(
    Object? data, {
    required String priceKey,
    required Duration expiryFallback,
  }) {
    if (data is! Map) {
      throw PaymentException('Resposta inválida do servidor.');
    }
    final map = Map<String, dynamic>.from(data);
    final paymentId = map['paymentId'] as String?;
    final qrCode = map['qrCode'] as String?;
    final qrCodeBase64 = map['qrCodeBase64'] as String?;
    final expiresAtRaw = map['expiresAt'] as String?;
    final amount = (map[priceKey] as num?)?.toDouble();
    if (paymentId == null ||
        paymentId.isEmpty ||
        qrCode == null ||
        qrCode.isEmpty ||
        amount == null ||
        amount <= 0) {
      throw PaymentException('Resposta inválida do servidor de pagamento.');
    }
    final expiresAt = expiresAtRaw != null
        ? DateTime.tryParse(expiresAtRaw) ?? DateTime.now().add(expiryFallback)
        : DateTime.now().add(expiryFallback);
    final applied = (map['cashbackAppliedReais'] as num?)?.toDouble() ?? 0;
    final charged = (map['chargedReais'] as num?)?.toDouble();
    return ArenaBookingPixPaymentResult(
      paymentId: paymentId,
      qrCode: qrCode,
      qrCodeBase64: qrCodeBase64 ?? '',
      expiresAt: expiresAt,
      amountToPayNowReais: amount,
      cashbackAppliedReais: applied > 0 ? applied : 0,
      chargedReais: charged != null && charged > 0 ? charged : amount,
    );
  }
```

- [ ] **Step 4: Ligar o toggle no PIX da reserva**

Em `nexago_app/lib/features/arenas/presentation/arena_booking_pix_page.dart`:

(a) Imports — depois de `import '../../athlete/domain/athlete_profile_providers.dart';` acrescentar:

```dart
import '../../cashback/application/cashback_providers.dart';
import '../../cashback/domain/cashback_rules.dart';
import '../../cashback/presentation/widgets/checkout_cashback_toggle.dart';
```

(b) Estado — trocar:

```dart
  bool _saveCpf = true;
  double _paymentFraction = 1.0;
```

por:

```dart
  bool _saveCpf = true;

  /// "Usar meu cashback" — começa desligado: o atleta escolhe gastar.
  bool _useCashback = false;
  double _paymentFraction = 1.0;
```

(c) Logo depois de:

```dart
  double get _dueOnsiteReais =>
      ArenaBookingPixAmounts.dueOnsiteReais(_totalReais, _paymentFraction);
```

acrescentar:

```dart

  /// Prévia do cashback sobre o valor a pagar AGORA — com sinal de 50% é a
  /// metade: o servidor reserva o saldo sobre `amountToPayNow`.
  CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext? checkout) =>
      quoteCheckoutCashback(
        priceCents: reaisToCents(_payNowReais),
        checkout: checkout,
        useCashback: _useCashback,
      );
```

(d) Em `_loadPix`, trocar:

```dart
      await _saveCpfToProfileIfNeeded();
      final pix = await ref
          .read(paymentServiceProvider)
          .createArenaBookingPixPayment(
            bookingId: widget.args.bookingId,
            cpfCnpj: _cpfDigits,
            paymentFraction: _paymentFraction,
          );
```

por:

```dart
      await _saveCpfToProfileIfNeeded();
      // Só pede o saldo com o switch ligado e algo a usar; o servidor
      // recalcula e devolve o valor aplicado de verdade.
      final useCashback = _cashbackQuote(
        ref.read(cashbackCheckoutContextProvider),
      ).sendUseCashback;
      final pix = await ref
          .read(paymentServiceProvider)
          .createArenaBookingPixPayment(
            bookingId: widget.args.bookingId,
            cpfCnpj: _cpfDigits,
            paymentFraction: _paymentFraction,
            useCashback: useCashback,
          );
```

(e) Em `build`, trocar:

```dart
    final expiresAt = _pix?.expiresAt ?? widget.args.paymentExpiresAt;
    final showQr = _pix != null && !_loadingPix;
```

por:

```dart
    final expiresAt = _pix?.expiresAt ?? widget.args.paymentExpiresAt;
    final showQr = _pix != null && !_loadingPix;
    final cashbackCtx = ref.watch(cashbackCheckoutContextProvider);
    final cashbackQuote = _cashbackQuote(cashbackCtx);
```

(f) Trocar o cartão do método:

```dart
                          BookingPixMethodCard(
                            amountLabel: BookingPixMethodCard.formatAmount(
                              _payNowReais,
                            ),
                          ),
```

por:

```dart
                          BookingPixMethodCard(
                            amountLabel: BookingPixMethodCard.formatAmount(
                              cashbackQuote.chargePreviewCents / 100,
                            ),
                          ),
```

(g) Toggle antes do CPF — trocar:

```dart
                          SizedBox(height: 20),
                          BookingPixCpfField(
```

por:

```dart
                          SizedBox(height: 20),
                          if (cashbackCtx != null &&
                              cashbackQuote.mode !=
                                  CashbackToggleMode.hidden) ...[
                            CheckoutCashbackToggle(
                              priceCents: cashbackQuote.priceCents,
                              availableCents: cashbackCtx.availableCents,
                              config: cashbackCtx.config,
                              value: _useCashback,
                              enabled: !_loadingPix,
                              onChanged: (v) =>
                                  setState(() => _useCashback = v),
                            ),
                            const SizedBox(height: 20),
                          ],
                          BookingPixCpfField(
```

(h) Valor do QR — trocar:

```dart
                          if (expiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: expiresAt,
                              amountReais:
                                  _pix?.amountToPayNowReais ?? _payNowReais,
                            ),
                            SizedBox(height: 20),
                          ],
```

por:

```dart
                          if (expiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: expiresAt,
                              // O QR cobra `chargedReais` (preço − saldo).
                              amountReais: _pix?.chargedReais ?? _payNowReais,
                            ),
                            SizedBox(height: 20),
                          ],
                          if (_pix!.cashbackAppliedReais > 0) ...[
                            CheckoutCashbackAppliedNote(
                              appliedCents: reaisToCents(
                                _pix!.cashbackAppliedReais,
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/arenas/data/payment_service_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart test/features/arenas/booking_pix_expiry_card_test.dart`
Expected: PASS — `All tests passed!`

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/arenas/data/payment_service.dart lib/features/arenas/presentation/arena_booking_pix_page.dart test/features/arenas/data/payment_service_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart`
Expected: `No issues found!`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/arenas/data/payment_service.dart nexago_app/lib/features/arenas/presentation/arena_booking_pix_page.dart nexago_app/test/features/arenas/data/payment_service_cashback_test.dart nexago_app/test/features/arenas/arena_booking_pix_page_cashback_test.dart && git commit -m "feat(cashback-app): saldo de cashback no PIX da reserva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Inscrição — toggle no PIX do torneio

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_registration_pix_page.dart`
- Modify: `nexago_app/test/features/tournaments/tournament_registration_pix_page_test.dart`

**Interfaces:**
- Consumes: `PaymentService.createTournamentRegistrationPixPayment(..., bool useCashback = false)` e `ArenaBookingPixPaymentResult.chargedReais/cashbackAppliedReais` (Task 6); `cashbackCheckoutContextProvider` (Task 2); `quoteCheckoutCashback`, `reaisToCents`, `CashbackCheckoutQuote`, `CashbackCheckoutContext`, `CashbackToggleMode` (Task 1); `CheckoutCashbackToggle`, `CheckoutCashbackAppliedNote` (Task 5).
- Produces: `TournamentRegistrationPixPage` com `bool _useCashback = false` e `CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext?)` sobre `_shareReais` (o preço que a callable cobra: parcela ou integral, conforme `amountType`).

- [ ] **Step 1: Escrever os testes que falham**

Em `nexago_app/test/features/tournaments/tournament_registration_pix_page_test.dart`:

(a) Imports — depois de `import 'package:nexago_app/core/auth/auth_providers.dart';` acrescentar:

```dart
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
```

e depois de `import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';` acrescentar:

```dart
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';
```

(b) Trocar o fim do arquivo:

```dart
    expect(find.byType(RegistrationWizardNotice), findsOneWidget);
    expect(find.text('PAGUE EM 30 MIN'), findsOneWidget);
    expect(find.text('PAGUE EM 20 MIN'), findsNothing);
  });
}
```

por:

```dart
    expect(find.byType(RegistrationWizardNotice), findsOneWidget);
    expect(find.text('PAGUE EM 30 MIN'), findsOneWidget);
    expect(find.text('PAGUE EM 20 MIN'), findsNothing);
  });

  group('cashback no PIX da inscrição', () {
    testWidgets(
        'servidor aplicou menos que a prévia: o QR mostra o cobrado que voltou',
        (tester) async {
      // Prévia: R$ 10 de saldo sobre R$ 100. Entre abrir a tela e gerar, o
      // saldo foi gasto em outro checkout — o servidor não aplicou nada.
      final service = _FakePaymentService(_resposta());
      await _abrirPixComCashback(tester, service: service, availableCents: 1000);

      await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
      await tester.pump();
      expect(
        find.text('${formatBRL(90)} · pagar com seu banco'),
        findsOneWidget,
      );

      await _gerarPix(tester);

      expect(service.useCashbackCalls, [true]);
      expect(find.text(formatBRL(100)), findsOneWidget);
      expect(find.textContaining('do seu cashback'), findsNothing);
    });

    testWidgets('servidor aplicou o saldo: QR pelo cobrado e nota do aplicado',
        (tester) async {
      final service = _FakePaymentService(
        _resposta(applied: 10, charged: 90),
      );
      await _abrirPixComCashback(tester, service: service, availableCents: 1000);

      await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
      await tester.pump();
      await _gerarPix(tester);

      expect(service.useCashbackCalls, [true]);
      expect(find.text(formatBRL(90)), findsOneWidget);
      expect(find.text(CashbackCopy.appliedNote(1000)), findsOneWidget);
    });

    testWidgets('recurso desligado: sem toggle e sem useCashback',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        availableCents: 1000,
      );

      expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
      await _gerarPix(tester);
      expect(service.useCashbackCalls, [false]);
    });
  });
}

const _ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

/// Dublê do serviço de pagamento: guarda o `useCashback` de cada pedido.
class _FakePaymentService implements PaymentService {
  _FakePaymentService(this.result);

  final ArenaBookingPixPaymentResult result;
  final useCashbackCalls = <bool>[];

  @override
  Future<ArenaBookingPixPaymentResult> createTournamentRegistrationPixPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
    bool useCashback = false,
  }) async {
    useCashbackCalls.add(useCashback);
    return result;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingPixPaymentResult _resposta({double applied = 0, double? charged}) {
  return ArenaBookingPixPaymentResult(
    paymentId: 'pay_t1',
    qrCode: '00020101021226860014br.gov.bcb.pix',
    qrCodeBase64: '',
    expiresAt: DateTime.now().add(const Duration(minutes: 15)),
    amountToPayNowReais: 100,
    cashbackAppliedReais: applied,
    chargedReais: charged,
  );
}

Future<void> _abrirPixComCashback(
  WidgetTester tester, {
  required _FakePaymentService service,
  CashbackConfig config = _ligado,
  int availableCents = 0,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final holdExpiresAt = DateTime.now().add(const Duration(minutes: 20));
  final args = TournamentRegistrationPixArgs(
    registrationId: 'reg-1',
    tournamentId: 't1',
    tournamentName: 'Copa Teste',
    categoryName: 'Dupla Masculina',
    shareAmountReais: 100,
    holdExpiresAt: holdExpiresAt,
    holdMinutes: 30,
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        firebaseAuthProvider.overrideWithValue(
          MockFirebaseAuth(
            signedIn: true,
            mockUser: MockUser(uid: 'atleta-1'),
          ),
        ),
        tournamentAccessStateProvider.overrideWith(
          (ref) => const TournamentAccessState(
            canAccess: true,
            onboardingCompleted: true,
            isProfileComplete: true,
            blockMessage: null,
            missingStepTitles: [],
          ),
        ),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        tournamentRegistrationSnapshotProvider('reg-1').overrideWith(
          (ref) => Stream.value(
            TournamentRegistrationSnapshot(
              registrationId: 'reg-1',
              isPaid: false,
              paidAmount: 0,
              holdExpiresAt: holdExpiresAt,
            ),
          ),
        ),
        paymentServiceProvider.overrideWithValue(service),
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(CashbackWallet(availableCents: availableCents)),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: TournamentRegistrationPixPage(args: args),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Future<void> _gerarPix(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '52998224725');
  await tester.pump();
  await tester.tap(find.text('Gerar PIX'));
  await tester.pump();
  await tester.pump();
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/tournaments/tournament_registration_pix_page_test.dart`
Expected: FAIL nos 2 primeiros testes novos — não há switch na tela (o `tap` em `find.byKey(CheckoutCashbackToggle.switchKey)` não acha nada). O de recurso desligado e o antigo do countdown já passam.

- [ ] **Step 3: Implementar**

Em `nexago_app/lib/features/tournaments/presentation/tournament_registration_pix_page.dart`:

(a) Imports — depois de `import '../../athlete/presentation/widgets/tournament_access_banner.dart';` acrescentar:

```dart
import '../../cashback/application/cashback_providers.dart';
import '../../cashback/domain/cashback_rules.dart';
import '../../cashback/presentation/widgets/checkout_cashback_toggle.dart';
```

(b) Estado — trocar:

```dart
  bool _saveCpf = true;
  Timer? _expiryTimer;

  double get _shareReais => widget.args.shareAmountReais;
```

por:

```dart
  bool _saveCpf = true;

  /// "Usar meu cashback" — começa desligado: o atleta escolhe gastar.
  bool _useCashback = false;
  Timer? _expiryTimer;

  double get _shareReais => widget.args.shareAmountReais;

  /// Prévia do cashback sobre o valor desta cobrança (parcela ou integral,
  /// o mesmo `chargeAmount` que a callable cobra).
  CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext? checkout) =>
      quoteCheckoutCashback(
        priceCents: reaisToCents(_shareReais),
        checkout: checkout,
        useCashback: _useCashback,
      );
```

(c) Em `_loadPix`, trocar:

```dart
      await _saveCpfToProfileIfNeeded();
      final pix = await ref
          .read(paymentServiceProvider)
          .createTournamentRegistrationPixPayment(
            registrationId: widget.args.registrationId,
            cpfCnpj: _cpfDigits,
            amountType: widget.args.amountType,
          );
```

por:

```dart
      await _saveCpfToProfileIfNeeded();
      // Só pede o saldo com o switch ligado e algo a usar; o servidor
      // recalcula e devolve o valor aplicado de verdade.
      final useCashback = _cashbackQuote(
        ref.read(cashbackCheckoutContextProvider),
      ).sendUseCashback;
      final pix = await ref
          .read(paymentServiceProvider)
          .createTournamentRegistrationPixPayment(
            registrationId: widget.args.registrationId,
            cpfCnpj: _cpfDigits,
            amountType: widget.args.amountType,
            useCashback: useCashback,
          );
```

(d) Em `build`, trocar:

```dart
      pixExpiresAt: pixExpiresAt,
    );
    final showQr = _pix != null && !_loadingPix;
```

por:

```dart
      pixExpiresAt: pixExpiresAt,
    );
    final showQr = _pix != null && !_loadingPix;
    final cashbackCtx = ref.watch(cashbackCheckoutContextProvider);
    final cashbackQuote = _cashbackQuote(cashbackCtx);
```

(e) Trocar o cartão do método:

```dart
                          BookingPixMethodCard(
                            amountLabel: BookingPixMethodCard.formatAmount(
                              _shareReais,
                            ),
                          ),
```

por:

```dart
                          BookingPixMethodCard(
                            amountLabel: BookingPixMethodCard.formatAmount(
                              cashbackQuote.chargePreviewCents / 100,
                            ),
                          ),
```

(f) Toggle antes do CPF — trocar:

```dart
                          SizedBox(height: 20),
                          BookingPixCpfField(
```

por:

```dart
                          SizedBox(height: 20),
                          if (cashbackCtx != null &&
                              cashbackQuote.mode !=
                                  CashbackToggleMode.hidden) ...[
                            CheckoutCashbackToggle(
                              priceCents: cashbackQuote.priceCents,
                              availableCents: cashbackCtx.availableCents,
                              config: cashbackCtx.config,
                              value: _useCashback,
                              enabled: !_loadingPix,
                              onChanged: (v) =>
                                  setState(() => _useCashback = v),
                            ),
                            const SizedBox(height: 20),
                          ],
                          BookingPixCpfField(
```

(g) Valor do QR — trocar:

```dart
                          if (displayExpiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: displayExpiresAt,
                              amountReais:
                                  _pix?.amountToPayNowReais ?? _shareReais,
                            ),
                            const SizedBox(height: 20),
                          ],
```

por:

```dart
                          if (displayExpiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: displayExpiresAt,
                              // O QR cobra `chargedReais` (preço − saldo).
                              amountReais: _pix?.chargedReais ?? _shareReais,
                            ),
                            const SizedBox(height: 20),
                          ],
                          if (_pix!.cashbackAppliedReais > 0) ...[
                            CheckoutCashbackAppliedNote(
                              appliedCents: reaisToCents(
                                _pix!.cashbackAppliedReais,
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/tournaments/tournament_registration_pix_page_test.dart`
Expected: PASS — `All tests passed!` (4 testes).

- [ ] **Step 5: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/tournaments/presentation/tournament_registration_pix_page.dart test/features/tournaments/tournament_registration_pix_page_test.dart`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/tournaments/presentation/tournament_registration_pix_page.dart nexago_app/test/features/tournaments/tournament_registration_pix_page_test.dart && git commit -m "feat(cashback-app): saldo de cashback no PIX da inscrição

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Clubinho — `useCashback` no join e toggle no PIX da vaga

**Files:**
- Modify: `nexago_app/lib/features/arenas/data/arena_clubs_repository.dart`
- Modify: `nexago_app/lib/features/arenas/presentation/club_session_pix_page.dart`
- Create: `nexago_app/test/features/arenas/data/arena_clubs_repository_cashback_test.dart`
- Create: `nexago_app/test/features/arenas/club_session_pix_page_cashback_test.dart`

**Interfaces:**
- Consumes: `cashbackCheckoutContextProvider` (Task 2); `quoteCheckoutCashback`, `reaisToCents`, `CashbackCheckoutQuote`, `CashbackCheckoutContext`, `CashbackToggleMode` (Task 1); `CheckoutCashbackToggle`, `CheckoutCashbackAppliedNote` (Task 5); `clubSessionProvider(sessionId)` (`ArenaClubSession.priceReais` — o mesmo preço que `joinArenaClubSession` cobra).
- Produces: `ClubJoinPixResult` ganha `final double cashbackAppliedReais` (padrão 0) e `final double chargedReais` (padrão = `amountReais`); `ArenaClubsRepository.joinSession({required String sessionId, String? cpfCnpj, bool useCashback = false})`; `ClubSessionPixPage` com `bool _useCashback = false` e `CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext?, double priceReais)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/arenas/data/arena_clubs_repository_cashback_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/arena_clubs_repository.dart';

const _join = <String, Object?>{
  'sessionId': 's1',
  'paymentId': 'pay_c1',
  'qrCode': '00020101021226860014br.gov.bcb.pix',
  'qrCodeBase64': '',
  'expiresAt': '2026-10-02T15:00:00.000Z',
  'amountReais': 30.0,
};

void main() {
  group('joinSession — cashback', () {
    test('manda useCashback só com o toggle ligado', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'joinArenaClubSession': _join,
      });
      final repo = ArenaClubsRepository(_UnusedFirestore(), functions: functions);

      await repo.joinSession(sessionId: 's1', useCashback: true);
      await repo.joinSession(sessionId: 's1');

      expect(functions.calledPayloads[0]?['useCashback'], isTrue);
      expect(
        functions.calledPayloads[1]?.containsKey('useCashback'),
        isFalse,
      );
    });

    test('lê o aplicado e o cobrado; amountReais segue sendo o preço',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'joinArenaClubSession': {
          ..._join,
          'cashbackAppliedReais': 10.0,
          'chargedReais': 20.0,
        },
      });
      final repo = ArenaClubsRepository(_UnusedFirestore(), functions: functions);

      final pix = await repo.joinSession(sessionId: 's1', useCashback: true);

      expect(pix.amountReais, 30.0);
      expect(pix.cashbackAppliedReais, 10.0);
      expect(pix.chargedReais, 20.0);
    });

    test('functions antigas (sem chargedReais): o PIX vale o preço', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'joinArenaClubSession': _join,
      });
      final repo = ArenaClubsRepository(_UnusedFirestore(), functions: functions);

      final pix = await repo.joinSession(sessionId: 's1', useCashback: true);

      expect(pix.cashbackAppliedReais, 0);
      expect(pix.chargedReais, 30.0);
    });
  });
}

class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calledPayloads.add(
          parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        );
      },
      result: responses[name],
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result});

  final void Function(dynamic parameters) onCall;
  final Object? result;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeHttpsCallableResult<T>(result);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  _FakeHttpsCallableResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// `joinSession` não toca no Firestore — nunca deve ser chamado aqui.
class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
```

Criar `nexago_app/test/features/arenas/club_session_pix_page_cashback_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/arena_clubs_repository.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_session.dart';
import 'package:nexago_app/features/arenas/presentation/club_session_pix_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

/// Dublê do repositório do clubinho: guarda o `useCashback` de cada entrada.
class _FakeClubsRepository implements ArenaClubsRepository {
  _FakeClubsRepository(this.result);

  final ClubJoinPixResult result;
  final useCashbackCalls = <bool>[];

  @override
  Future<ClubJoinPixResult> joinSession({
    required String sessionId,
    String? cpfCnpj,
    bool useCashback = false,
  }) async {
    useCashbackCalls.add(useCashback);
    return result;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaClubSession sessao({double preco = 30}) {
  return ArenaClubSession(
    id: 's1',
    clubId: 'c1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    clubName: 'Clubinho da Manhã',
    date: '2026-10-12',
    startTime: '08:00',
    endTime: '10:00',
    courtIds: const ['q1'],
    courtNames: const ['Quadra 1'],
    capacity: 12,
    priceReais: preco,
    cancelWindowHours: 12,
    allowOnsitePayment: false,
    confirmedCount: 2,
    pendingCount: 0,
    status: 'scheduled',
    source: 'manual',
  );
}

ClubJoinPixResult resultado({
  double price = 30,
  double applied = 0,
  double? charged,
}) {
  return ClubJoinPixResult(
    sessionId: 's1',
    paymentId: 'pay_c1',
    qrCode: '00020101021226860014br.gov.bcb.pix',
    qrCodeBase64: '',
    pixCopyPaste: '00020101021226860014br.gov.bcb.pix',
    expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    amountReais: price,
    cashbackAppliedReais: applied,
    chargedReais: charged,
  );
}

Future<_FakeClubsRepository> abrir(
  WidgetTester tester, {
  required ArenaClubSession session,
  CashbackConfig config = ligado,
  int availableCents = 0,
  ClubJoinPixResult? result,
  Stream<ClubParticipant?>? participant,
  List<Override> extraOverrides = const [],
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final repo = _FakeClubsRepository(result ?? resultado());
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        arenaClubsRepositoryProvider.overrideWithValue(repo),
        clubSessionProvider('s1').overrideWith((ref) => Stream.value(session)),
        myClubParticipantProvider('s1').overrideWith(
          (ref) => participant ?? Stream<ClubParticipant?>.value(null),
        ),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(CashbackWallet(availableCents: availableCents)),
        ),
        ...extraOverrides,
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const ClubSessionPixPage(sessionId: 's1'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return repo;
}

Future<void> gerarPix(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '52998224725');
  await tester.pump();
  await tester.tap(find.text('Gerar PIX'));
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets(
      'saldo abaixo do teto: usa tudo, sem aviso do mínimo, e o QR cobra o resto',
      (tester) async {
    final repo = await abrir(
      tester,
      session: sessao(),
      availableCents: 1000,
      result: resultado(applied: 10, charged: 20),
    );

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    await tester.pump();

    expect(find.text(CashbackCopy.using(1000)), findsOneWidget);
    expect(find.text(CashbackCopy.minCashNote(500)), findsNothing);
    expect(find.text('${formatBRL(20)} · pagar com seu banco'), findsOneWidget);

    await gerarPix(tester);

    expect(repo.useCashbackCalls, [true]);
    expect(find.text(formatBRL(20)), findsOneWidget);
    expect(find.text(CashbackCopy.appliedNote(1000)), findsOneWidget);
  });

  testWidgets(
      'clubinho no mínimo em dinheiro (R\$ 5): só a linha de ganho, sem useCashback',
      (tester) async {
    final repo = await abrir(
      tester,
      session: sessao(preco: 5),
      availableCents: 3000,
      result: resultado(price: 5),
    );

    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
    expect(find.text(CashbackCopy.earnHint(ligado)), findsOneWidget);

    await gerarPix(tester);
    expect(repo.useCashbackCalls, [false]);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/arenas/data/arena_clubs_repository_cashback_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart`
Expected: FAIL — não compila: `No named parameter with the name 'useCashback'` / `'cashbackAppliedReais'`.

- [ ] **Step 3: Implementar o repositório**

Em `nexago_app/lib/features/arenas/data/arena_clubs_repository.dart`:

(a) Trocar a classe `ClubJoinPixResult` inteira:

```dart
/// Resposta da callable `joinArenaClubSession` (cobrança PIX da vaga).
class ClubJoinPixResult {
  const ClubJoinPixResult({
    required this.sessionId,
    required this.paymentId,
    required this.qrCode,
    required this.qrCodeBase64,
    required this.pixCopyPaste,
    required this.expiresAt,
    required this.amountReais,
  });

  final String sessionId;
  final String paymentId;
  final String qrCode;
  final String qrCodeBase64;
  final String pixCopyPaste;
  final DateTime expiresAt;
  final double amountReais;
}
```

por:

```dart
/// Resposta da callable `joinArenaClubSession` (cobrança PIX da vaga).
class ClubJoinPixResult {
  const ClubJoinPixResult({
    required this.sessionId,
    required this.paymentId,
    required this.qrCode,
    required this.qrCodeBase64,
    required this.pixCopyPaste,
    required this.expiresAt,
    required this.amountReais,
    this.cashbackAppliedReais = 0,
    double? chargedReais,
  }) : chargedReais = chargedReais ?? amountReais;

  final String sessionId;
  final String paymentId;
  final String qrCode;
  final String qrCodeBase64;
  final String pixCopyPaste;
  final DateTime expiresAt;

  /// Preço da vaga — com cashback aplicado continua o preço cheio.
  final double amountReais;

  /// Parte paga com o saldo de cashback (0 sem saldo).
  final double cashbackAppliedReais;

  /// O que o QR cobra no PIX.
  final double chargedReais;
}
```

(b) Em `joinSession`, trocar a assinatura e o payload:

```dart
  Future<ClubJoinPixResult> joinSession({
    required String sessionId,
    String? cpfCnpj,
  }) async {
```

por:

```dart
  ///
  /// `useCashback` só vai no payload com o toggle ligado (sem ele, o de
  /// sempre).
  Future<ClubJoinPixResult> joinSession({
    required String sessionId,
    String? cpfCnpj,
    bool useCashback = false,
  }) async {
```

e trocar:

```dart
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      final raw =
          await _functions.httpsCallable('joinArenaClubSession').call(payload);
```

por:

```dart
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      if (useCashback) {
        payload['useCashback'] = true;
      }
      final raw =
          await _functions.httpsCallable('joinArenaClubSession').call(payload);
```

(c) Ainda em `joinSession`, trocar:

```dart
      return ClubJoinPixResult(
        sessionId: (map['sessionId'] as String?)?.trim() ?? id,
        paymentId: paymentId,
        qrCode: qrCode,
        qrCodeBase64: (map['qrCodeBase64'] as String?) ?? '',
        pixCopyPaste: (map['pixCopyPaste'] as String?)?.trim() ?? qrCode,
        expiresAt: expiresAt,
        amountReais: amount,
      );
```

por:

```dart
      // `amountReais` segue o preço; o QR vale `chargedReais` (sem o campo —
      // functions antigas — vale o preço).
      final applied = (map['cashbackAppliedReais'] as num?)?.toDouble() ?? 0;
      final charged = (map['chargedReais'] as num?)?.toDouble();
      return ClubJoinPixResult(
        sessionId: (map['sessionId'] as String?)?.trim() ?? id,
        paymentId: paymentId,
        qrCode: qrCode,
        qrCodeBase64: (map['qrCodeBase64'] as String?) ?? '',
        pixCopyPaste: (map['pixCopyPaste'] as String?)?.trim() ?? qrCode,
        expiresAt: expiresAt,
        amountReais: amount,
        cashbackAppliedReais: applied > 0 ? applied : 0,
        chargedReais: charged != null && charged > 0 ? charged : amount,
      );
```

- [ ] **Step 4: Ligar o toggle no PIX do clubinho**

Em `nexago_app/lib/features/arenas/presentation/club_session_pix_page.dart`:

(a) Imports — depois de `import '../domain/arena_club_providers.dart';` acrescentar:

```dart
import '../../cashback/application/cashback_providers.dart';
import '../../cashback/domain/cashback_rules.dart';
import '../../cashback/presentation/widgets/checkout_cashback_toggle.dart';
```

(b) Estado — trocar:

```dart
  bool _saveCpf = true;
  bool _cancelling = false;
```

por:

```dart
  bool _saveCpf = true;

  /// "Usar meu cashback" — começa desligado: o atleta escolhe gastar.
  bool _useCashback = false;
  bool _cancelling = false;
```

(c) Logo depois de:

```dart
  String? get _cpfHint =>
      CpfCnpjValidator.validationMessage(_cpfController.text);
```

acrescentar:

```dart

  /// Prévia do cashback sobre o preço da vaga (`session.priceReais`, o mesmo
  /// que `joinArenaClubSession` cobra).
  CashbackCheckoutQuote _cashbackQuote(
    CashbackCheckoutContext? checkout,
    double priceReais,
  ) =>
      quoteCheckoutCashback(
        priceCents: reaisToCents(priceReais),
        checkout: checkout,
        useCashback: _useCashback,
      );
```

(d) Em `_loadPix`, trocar:

```dart
      await _saveCpfToProfileIfNeeded();
      final pix = await ref.read(arenaClubsRepositoryProvider).joinSession(
            sessionId: widget.sessionId,
            cpfCnpj: _cpfDigits,
          );
```

por:

```dart
      await _saveCpfToProfileIfNeeded();
      // Só pede o saldo com o switch ligado e algo a usar; o servidor
      // recalcula e devolve o valor aplicado de verdade.
      final price = ref
              .read(clubSessionProvider(widget.sessionId))
              .valueOrNull
              ?.priceReais ??
          0;
      final useCashback = _cashbackQuote(
        ref.read(cashbackCheckoutContextProvider),
        price,
      ).sendUseCashback;
      final pix = await ref.read(arenaClubsRepositoryProvider).joinSession(
            sessionId: widget.sessionId,
            cpfCnpj: _cpfDigits,
            useCashback: useCashback,
          );
```

(e) Em `build`, logo depois de:

```dart
    final onsiteSelected = allowOnsite && _method == _ClubPayMethod.onsite;
```

acrescentar:

```dart
    final cashbackCtx = ref.watch(cashbackCheckoutContextProvider);
    final cashbackQuote =
        _cashbackQuote(cashbackCtx, session?.priceReais ?? 0);
```

(f) Trocar o cartão do método (ramo sem pagamento na arena):

```dart
                    ] else ...[
                      BookingPixMethodCard(
                        amountLabel: formatBRL(amountReais),
                      ),
                      const SizedBox(height: 20),
                    ],
```

por:

```dart
                    ] else ...[
                      BookingPixMethodCard(
                        amountLabel: formatBRL(
                          cashbackQuote.chargePreviewCents / 100,
                        ),
                      ),
                      const SizedBox(height: 20),
                    ],
```

(g) Toggle antes do CPF (só no PIX; pagar na arena não usa saldo) — trocar:

```dart
                    ] else ...[
                      BookingPixCpfField(
```

por:

```dart
                    ] else ...[
                      if (cashbackCtx != null &&
                          cashbackQuote.mode != CashbackToggleMode.hidden) ...[
                        CheckoutCashbackToggle(
                          priceCents: cashbackQuote.priceCents,
                          availableCents: cashbackCtx.availableCents,
                          config: cashbackCtx.config,
                          value: _useCashback,
                          enabled: !_loadingPix,
                          onChanged: (v) => setState(() => _useCashback = v),
                        ),
                        const SizedBox(height: 20),
                      ],
                      BookingPixCpfField(
```

(h) Valor do QR — trocar:

```dart
                    BookingPixExpiryCard(
                      expiresAt: _pix!.expiresAt,
                      amountReais: _pix!.amountReais,
                    ),
                    const SizedBox(height: 20),
```

por:

```dart
                    BookingPixExpiryCard(
                      expiresAt: _pix!.expiresAt,
                      // O QR cobra `chargedReais` (preço − saldo).
                      amountReais: _pix!.chargedReais,
                    ),
                    const SizedBox(height: 20),
                    if (_pix!.cashbackAppliedReais > 0) ...[
                      CheckoutCashbackAppliedNote(
                        appliedCents: reaisToCents(_pix!.cashbackAppliedReais),
                      ),
                      const SizedBox(height: 16),
                    ],
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/arenas/data/arena_clubs_repository_cashback_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart test/features/arenas/domain/arena_club_session_test.dart`
Expected: PASS — `All tests passed!`

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/arenas/data/arena_clubs_repository.dart lib/features/arenas/presentation/club_session_pix_page.dart test/features/arenas/data/arena_clubs_repository_cashback_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart`
Expected: `No issues found!`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/arenas/data/arena_clubs_repository.dart nexago_app/lib/features/arenas/presentation/club_session_pix_page.dart nexago_app/test/features/arenas/data/arena_clubs_repository_cashback_test.dart nexago_app/test/features/arenas/club_session_pix_page_cashback_test.dart && git commit -m "feat(cashback-app): saldo de cashback no PIX do clubinho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Nota de cashback no sucesso — widget e reserva

**Files:**
- Create: `nexago_app/lib/features/cashback/presentation/widgets/cashback_earned_note.dart`
- Modify: `nexago_app/lib/features/arenas/domain/arena_booking_success_args.dart`
- Modify: `nexago_app/lib/features/arenas/presentation/booking_success_page.dart`
- Modify: `nexago_app/lib/features/arenas/presentation/arena_booking_pix_page.dart`
- Create: `nexago_app/test/features/cashback/presentation/cashback_earned_note_test.dart`
- Create: `nexago_app/test/features/arenas/booking_success_page_cashback_test.dart`
- Modify: `nexago_app/test/features/arenas/arena_booking_pix_page_cashback_test.dart`

**Interfaces:**
- Consumes: `cashbackEnabledProvider`, `cashbackLotProvider` (Task 2); `CashbackLot.isPendingEarn` (Task 1); `CashbackCopy.earnedNote/genericSuccessNote/openCashbackAction` e `AppRouteNames.athleteCashback` (Task 3); `ArenaBookingPixPaymentResult.paymentId` (já existe).
- Produces: `class CashbackEarnedNote extends ConsumerWidget` (`{required String paymentId, EdgeInsetsGeometry padding = const EdgeInsets.only(top: AppSpacing.lg), VoidCallback? onOpenCashback}`); `BookingSuccessArgs.paymentId: String?` (+ query `paymentId` na rota `arenaBookingSuccess`, lida por `BookingSuccessPage` na restauração).

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/cashback/presentation/cashback_earned_note_test.dart`:

```dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

CashbackLot lote({
  CashbackLotStatus status = CashbackLotStatus.pending,
  int cents = 240,
}) {
  return CashbackLot(
    id: 'pay_1',
    status: status,
    earnedCents: cents,
    remainingCents: cents,
  );
}

Future<void> abrirNota(
  WidgetTester tester, {
  CashbackConfig config = ligado,
  required Stream<CashbackLot?> lot,
  VoidCallback? onOpen,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackLotProvider('pay_1').overrideWith((ref) => lot),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: CashbackEarnedNote(
            paymentId: 'pay_1',
            onOpenCashback: onOpen ?? () {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('lote pendente do pagamento: "+R\$ X de cashback pendente"',
      (tester) async {
    await abrirNota(tester, lot: Stream.value(lote()));

    expect(find.text(CashbackCopy.earnedNote(240)), findsOneWidget);
    expect(find.text(CashbackCopy.genericSuccessNote), findsNothing);
  });

  testWidgets('sem lote: nota genérica com link para Meu cashback',
      (tester) async {
    var aberturas = 0;
    await abrirNota(
      tester,
      lot: Stream.value(null),
      onOpen: () => aberturas++,
    );

    expect(find.text(CashbackCopy.genericSuccessNote), findsOneWidget);
    await tester.tap(find.text(CashbackCopy.openCashbackAction));
    expect(aberturas, 1);
  });

  testWidgets('lote criado depois da navegação: a nota troca sozinha',
      (tester) async {
    final lots = StreamController<CashbackLot?>.broadcast();
    addTearDown(lots.close);
    await abrirNota(tester, lot: lots.stream);

    expect(find.text(CashbackCopy.genericSuccessNote), findsOneWidget);

    lots.add(lote(cents: 360));
    await tester.pump();
    await tester.pump();

    expect(find.text(CashbackCopy.earnedNote(360)), findsOneWidget);
    expect(find.text(CashbackCopy.genericSuccessNote), findsNothing);
  });

  testWidgets('lote cancelado não é anunciado', (tester) async {
    await abrirNota(
      tester,
      lot: Stream.value(lote(status: CashbackLotStatus.cancelled)),
    );

    expect(find.text(CashbackCopy.genericSuccessNote), findsOneWidget);
  });

  testWidgets('recurso desligado: nada, nem com lote', (tester) async {
    await abrirNota(
      tester,
      config: CashbackConfig.fallback,
      lot: Stream.value(lote()),
    );

    expect(find.textContaining('cashback'), findsNothing);
  });
}
```

Criar `nexago_app/test/features/arenas/booking_success_page_cashback_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/booking_success_page.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirSucesso(
  WidgetTester tester, {
  required String location,
  Object? extra,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    initialExtra: extra,
    routes: [
      GoRoute(path: '/sucesso', builder: (_, _) => const BookingSuccessPage()),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(ligado)),
        cashbackLotProvider('pay_1').overrideWith(
          (ref) => Stream.value(
            const CashbackLot(
              id: 'pay_1',
              status: CashbackLotStatus.pending,
              earnedCents: 240,
              remainingCents: 240,
            ),
          ),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('paymentId pela query (rota restaurada): nota do lote pendente',
      (tester) async {
    await abrirSucesso(
      tester,
      location: '/sucesso?date=2026-10-12&startTime=19:00&endTime=20:00'
          '&bookingId=b1&payment=pix_ok&paymentId=pay_1',
    );

    expect(find.text(CashbackCopy.earnedNote(240)), findsOneWidget);
  });

  testWidgets('paymentId pela extra: mesma nota', (tester) async {
    await abrirSucesso(
      tester,
      location: '/sucesso',
      extra: const BookingSuccessArgs(
        arenaId: '',
        arenaName: 'Arena Sol',
        courtName: 'Quadra 1',
        dateKey: '2026-10-12',
        startTime: '19:00',
        endTime: '20:00',
        dateLabel: '12 out 2026',
        timeRangeLabel: '19:00 – 20:00',
        bookingIds: ['b1'],
        amountReais: 50,
        paymentApproved: true,
        paymentId: 'pay_1',
      ),
    );

    expect(find.text(CashbackCopy.earnedNote(240)), findsOneWidget);
  });

  testWidgets('reserva sem pagamento pelo app: nenhuma nota de cashback',
      (tester) async {
    await abrirSucesso(
      tester,
      location: '/sucesso?date=2026-10-12&startTime=19:00&endTime=20:00'
          '&bookingId=b1',
    );

    expect(find.byType(CashbackEarnedNote), findsNothing);
  });
}
```

Em `nexago_app/test/features/arenas/arena_booking_pix_page_cashback_test.dart`:

(a) Imports — trocar a primeira linha `import 'package:cloud_firestore/cloud_firestore.dart';` por:

```dart
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
```

e, depois de `import 'package:flutter_test/flutter_test.dart';`, acrescentar:

```dart
import 'package:go_router/go_router.dart';
```

e, depois de `import 'package:nexago_app/core/formatting/app_currency_format.dart';`, acrescentar:

```dart
import 'package:nexago_app/core/router/routes.dart';
```

e, depois de `import 'package:nexago_app/features/arenas/domain/arena_booking_pix_args.dart';`, acrescentar:

```dart
import 'package:nexago_app/features/arenas/domain/arena_booking_success_args.dart';
```

(b) Trocar o fim do arquivo:

```dart
    await gerarPix(tester);
    expect(service.calls.single.useCashback, isFalse);
  });
}
```

por:

```dart
    await gerarPix(tester);
    expect(service.calls.single.useCashback, isFalse);
  });

  testWidgets('PIX pago: a confirmação recebe o paymentId na extra e na query',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final docs =
        StreamController<DocumentSnapshot<Map<String, dynamic>>?>.broadcast();
    addTearDown(docs.close);
    final service = _FakePaymentService(
      resposta(price: 100, paymentId: 'pay_9'),
    );
    Object? extra;
    var query = <String, String>{};
    final router = GoRouter(
      initialLocation: '/pix',
      routes: [
        GoRoute(
          path: '/pix',
          builder: (_, _) => ArenaBookingPixPage(arenaId: 'a1', args: reserva()),
        ),
        GoRoute(
          path: AppRoutes.arenaBookingSuccess,
          builder: (_, state) {
            extra = state.extra;
            query = state.uri.queryParameters;
            return const Scaffold(body: Text('sucesso'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: overridesDaTela(service, bookingDocs: docs.stream),
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump();
    await gerarPix(tester);

    docs.add(_PaidBookingSnapshot());
    await tester.pump();
    await tester.pump();

    expect(find.text('sucesso'), findsOneWidget);
    expect((extra! as BookingSuccessArgs).paymentId, 'pay_9');
    expect(query['paymentId'], 'pay_9');
  });
}

/// Doc da reserva como o webhook deixa depois do PIX pago.
class _PaidBookingSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  @override
  bool get exists => true;

  @override
  Map<String, dynamic>? data() => {
        'paymentStatus': 'paid',
        'status': 'confirmed',
      };

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation/cashback_earned_note_test.dart test/features/arenas/booking_success_page_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart`
Expected: FAIL — não compila: `cashback_earned_note.dart` não existe e `No named parameter with the name 'paymentId'` em `BookingSuccessArgs`.

- [ ] **Step 3: Implementar a nota**

Criar `nexago_app/lib/features/cashback/presentation/widgets/cashback_earned_note.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../application/cashback_providers.dart';
import '../cashback_copy.dart';

/// Nota de cashback na tela de sucesso de um PIX pago pelo app.
///
/// Ouve `lots/{paymentId}` enquanto a tela está aberta: o webhook cria o lote
/// logo depois de confirmar o pagamento — às vezes segundos depois da
/// navegação —, então a nota passa do texto genérico para "+R$ X pendente"
/// sozinha. Com o recurso desligado, nada.
class CashbackEarnedNote extends ConsumerWidget {
  const CashbackEarnedNote({
    super.key,
    required this.paymentId,
    this.padding = const EdgeInsets.only(top: AppSpacing.lg),
    this.onOpenCashback,
  });

  /// Id do pagamento no Asaas — é o id do lote.
  final String paymentId;
  final EdgeInsetsGeometry padding;

  /// Injetável para teste; em produção abre Meu cashback.
  final VoidCallback? onOpenCashback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(cashbackEnabledProvider)) return const SizedBox.shrink();
    final lot = ref.watch(cashbackLotProvider(paymentId)).valueOrNull;
    final earnedCents =
        lot != null && lot.isPendingEarn ? lot.earnedCents : null;
    final accent = earnedCents != null ? AppColors.pending : AppColors.win;
    final colors = context.themeColors;
    return Padding(
      padding: padding,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: accent.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            Icon(Icons.savings_rounded, size: 20, color: accent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                earnedCents != null
                    ? CashbackCopy.earnedNote(earnedCents)
                    : CashbackCopy.genericSuccessNote,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
              ),
            ),
            if (earnedCents == null)
              TextButton(
                onPressed: onOpenCashback ??
                    () => context.pushNamed(AppRouteNames.athleteCashback),
                child: const Text(CashbackCopy.openCashbackAction),
              ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Levar o `paymentId` até a confirmação da reserva**

Em `nexago_app/lib/features/arenas/domain/arena_booking_success_args.dart`:

(a) Trocar:

```dart
    this.paymentLabel,
    this.headline,
  });
```

por:

```dart
    this.paymentLabel,
    this.headline,
    this.paymentId,
  });
```

(b) Trocar:

```dart
  final String? headline;
```

por:

```dart
  final String? headline;

  /// Pagamento do Asaas que acabou de confirmar (= id do lote de cashback).
  /// Só vem do PIX pago pelo app; reserva no local não tem.
  final String? paymentId;
```

Em `nexago_app/lib/features/arenas/presentation/arena_booking_pix_page.dart`, em `_goSuccess`:

(a) Trocar:

```dart
        : 'Total pago: ${formatBRL(paid)}';

    final uri = Uri(
```

por:

```dart
        : 'Total pago: ${formatBRL(paid)}';
    // Id do pagamento = id do lote de cashback: a confirmação ouve o lote.
    final paymentId = _pix?.paymentId ?? '';

    final uri = Uri(
```

(b) Trocar:

```dart
        'arenaName': confirm.arenaName,
        'courtName': confirm.courtName,
      },
    );
```

por:

```dart
        'arenaName': confirm.arenaName,
        'courtName': confirm.courtName,
        if (paymentId.isNotEmpty) 'paymentId': paymentId,
      },
    );
```

(c) Trocar:

```dart
        paymentLabel: due > 0.02
            ? 'O restante você paga na arena no dia do jogo.'
            : null,
      ),
    );
  }
```

por:

```dart
        paymentLabel: due > 0.02
            ? 'O restante você paga na arena no dia do jogo.'
            : null,
        paymentId: paymentId.isEmpty ? null : paymentId,
      ),
    );
  }
```

Em `nexago_app/lib/features/arenas/presentation/booking_success_page.dart`:

(a) Imports — depois de `import '../../../core/ui/fade_slide_in.dart';` acrescentar:

```dart
import '../../cashback/presentation/widgets/cashback_earned_note.dart';
```

(b) Logo depois do bloco:

```dart
                    BookingSuccessTicketCard(
                      dateCompact: ticketDate,
                      timeRange: ticketTime,
                      locationLabel: locationLabel,
                      qrPayload: bookingId,
                    ),
```

acrescentar:

```dart
                    // Só PIX pago pelo app tem lote de cashback para ouvir.
                    if (resolved.paymentId != null)
                      CashbackEarnedNote(paymentId: resolved.paymentId!),
```

(c) Logo antes de `  static BookingSuccessArgs? _resolveArgs({` acrescentar:

```dart
  /// `paymentId` da query (rota restaurada / deep link); vazio = nenhum.
  static String? _paymentIdFrom(Map<String, String> query) {
    final id = query['paymentId']?.trim() ?? '';
    return id.isEmpty ? null : id;
  }

```

(d) No fim de `_resolveArgs`, trocar:

```dart
      paymentApproved: paymentApproved,
    );
  }

  static BookingSuccessArgs _fillFromQuery(
```

por:

```dart
      paymentApproved: paymentApproved,
      paymentId: _paymentIdFrom(query),
    );
  }

  static BookingSuccessArgs _fillFromQuery(
```

(e) No fim de `_fillFromQuery`, trocar:

```dart
      headline: extra.headline,
    );
```

por:

```dart
      headline: extra.headline,
      paymentId: extra.paymentId ?? _paymentIdFrom(query),
    );
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback/presentation/cashback_earned_note_test.dart test/features/arenas/booking_success_page_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart test/features/arenas/arena_booking_success_actions_test.dart`
Expected: PASS — `All tests passed!`

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback/presentation/widgets/cashback_earned_note.dart lib/features/arenas/domain/arena_booking_success_args.dart lib/features/arenas/presentation/booking_success_page.dart lib/features/arenas/presentation/arena_booking_pix_page.dart test/features/cashback/presentation/cashback_earned_note_test.dart test/features/arenas/booking_success_page_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart`
Expected: `No issues found!`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/cashback/presentation/widgets/cashback_earned_note.dart nexago_app/lib/features/arenas/domain/arena_booking_success_args.dart nexago_app/lib/features/arenas/presentation/booking_success_page.dart nexago_app/lib/features/arenas/presentation/arena_booking_pix_page.dart nexago_app/test/features/cashback/presentation/cashback_earned_note_test.dart nexago_app/test/features/arenas/booking_success_page_cashback_test.dart nexago_app/test/features/arenas/arena_booking_pix_page_cashback_test.dart && git commit -m "feat(cashback-app): nota de cashback no sucesso da reserva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Nota de cashback no sucesso — inscrição e clubinho

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_registration_success_args.dart`
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_registration_navigation.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_registration_pix_page.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_registration_success_page.dart`
- Modify: `nexago_app/lib/core/router/app_router.dart`
- Modify: `nexago_app/lib/features/arenas/presentation/club_session_pix_page.dart`
- Create: `nexago_app/test/features/tournaments/tournament_registration_navigation_payment_id_test.dart`
- Modify: `nexago_app/test/features/tournaments/tournament_registration_success_page_test.dart`
- Modify: `nexago_app/test/features/arenas/club_session_pix_page_cashback_test.dart`

**Interfaces:**
- Consumes: `CashbackEarnedNote` (Task 9); `ClubParticipant.asaasPaymentId` e `ClubJoinPixResult.paymentId` (já existem).
- Produces: `TournamentRegistrationSuccessArgs.paymentId: String?`; `navigateToTournamentRegistrationSuccess(..., String? paymentId)` (vai na `extra` e na query `paymentId`); a rota de sucesso do torneio lê `paymentId` da query quando não há `extra`.
- Call sites conferidos: `tournament_registration_pix_page.dart` passa `_pix?.paymentId`; `tournament_invite_accept_coordinator.dart` (o parceiro pagou, não este atleta) e os construtores diretos de `TournamentRegistrationSuccessArgs` em `tournament_registration_detail_page.dart`, `tournament_registration_payment_page.dart` (inscrição gratuita), `tournament_detail_categories_card.dart`, `tournament_detail_category_card.dart` e `tournament_detail_category_pick_section.dart` (reabrir o card) ficam SEM `paymentId` de propósito — o parâmetro é opcional e eles não têm pagamento para anunciar.

- [ ] **Step 1: Escrever os testes que falham**

Criar `nexago_app/test/features/tournaments/tournament_registration_navigation_payment_id_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_navigation.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_success_args.dart';

void main() {
  Future<({Object? extra, Map<String, String> query})> navegar(
    WidgetTester tester, {
    String? paymentId,
  }) async {
    Object? extra;
    var query = <String, String>{};
    final router = GoRouter(
      initialLocation: '/inicio',
      routes: [
        GoRoute(
          path: '/inicio',
          builder: (_, _) => Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => navigateToTournamentRegistrationSuccess(
                context,
                ref: ref,
                tournamentId: 't1',
                registrationId: 'r1',
                tournamentName: 'Copa',
                categoryName: 'Dupla Masculina',
                paymentId: paymentId,
              ),
              child: const Text('ir'),
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentRegistrationSuccess,
          name: AppRouteNames.tournamentRegistrationSuccess,
          builder: (_, state) {
            extra = state.extra;
            query = state.uri.queryParameters;
            return const Text('sucesso');
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        // Sem sessão: o "já vistas" vira memória pura (não lê preferências).
        overrides: [authProvider.overrideWith((ref) => Stream.value(null))],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('ir'));
    await tester.pumpAndSettle();
    return (extra: extra, query: query);
  }

  testWidgets('o paymentId do PIX segue na extra e na query', (tester) async {
    final result = await navegar(tester, paymentId: 'pay_9');

    expect(
      (result.extra! as TournamentRegistrationSuccessArgs).paymentId,
      'pay_9',
    );
    expect(result.query['paymentId'], 'pay_9');
  });

  testWidgets('sem pagamento nesta sessão: nada de paymentId', (tester) async {
    final result = await navegar(tester);

    expect(
      (result.extra! as TournamentRegistrationSuccessArgs).paymentId,
      isNull,
    );
    expect(result.query.containsKey('paymentId'), isFalse);
  });
}
```

Em `nexago_app/test/features/tournaments/tournament_registration_success_page_test.dart`:

(a) Imports — depois de `import 'package:nexago_app/core/ui/nexa_skeleton.dart';` acrescentar:

```dart
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';
```

(b) Na assinatura de `abrirConfirmacao`, trocar:

```dart
    TournamentRegistrationReceipt? receipt,
    Map<String, int> inscritosPorCategoria = const {'masc': 5},
  }) async {
```

por:

```dart
    TournamentRegistrationReceipt? receipt,
    Map<String, int> inscritosPorCategoria = const {'masc': 5},
    String? paymentId,
    List<Override> cashbackOverrides = const [],
  }) async {
```

(c) Trocar a rota `/sucesso`:

```dart
        GoRoute(
          path: '/sucesso',
          builder: (_, __) => const TournamentRegistrationSuccessPage(
            args: TournamentRegistrationSuccessArgs(
              tournamentId: 't1',
              registrationId: registrationId,
              tournamentName: 'Copa de Teste',
              categoryName: 'Dupla Masculina',
            ),
          ),
        ),
```

por:

```dart
        GoRoute(
          path: '/sucesso',
          builder: (_, _) => TournamentRegistrationSuccessPage(
            args: TournamentRegistrationSuccessArgs(
              tournamentId: 't1',
              registrationId: registrationId,
              tournamentName: 'Copa de Teste',
              categoryName: 'Dupla Masculina',
              paymentId: paymentId,
            ),
          ),
        ),
```

(d) Trocar:

```dart
        tournamentCategoryEnrollmentCountsProvider(
          't1',
        ).overrideWith((ref) => Stream.value(inscritosPorCategoria)),
      ],
    );
```

por:

```dart
        tournamentCategoryEnrollmentCountsProvider(
          't1',
        ).overrideWith((ref) => Stream.value(inscritosPorCategoria)),
        ...cashbackOverrides,
      ],
    );
```

(e) Trocar o fim de `main()`:

```dart
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(pedidosDeAvaliacao, 1);
  });
}
```

por:

```dart
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(pedidosDeAvaliacao, 1);
  });

  testWidgets('pago por PIX nesta sessão: nota do cashback pendente do lote', (
    tester,
  ) async {
    const ligado = CashbackConfig(
      enabled: true,
      ratePercent: 2,
      maxShareOfFee: 0.5,
      minCashCents: 500,
      expiryMonths: 6,
      expiryWarningDays: 15,
    );
    await abrirConfirmacao(
      tester,
      tournament: torneio([dupla()]),
      receipt: comprovante(),
      paymentId: 'pay_t1',
      cashbackOverrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(ligado)),
        cashbackLotProvider('pay_t1').overrideWith(
          (ref) => Stream.value(
            const CashbackLot(
              id: 'pay_t1',
              status: CashbackLotStatus.pending,
              earnedCents: 200,
              remainingCents: 200,
            ),
          ),
        ),
      ],
    );

    expect(find.text(CashbackCopy.earnedNote(200)), findsOneWidget);

    await esperarPedidoDeAvaliacao(tester);
  });

  testWidgets('card reaberto depois (sem paymentId): sem nota de cashback', (
    tester,
  ) async {
    await abrirConfirmacao(
      tester,
      tournament: torneio([dupla()]),
      receipt: comprovante(),
    );

    expect(find.byType(CashbackEarnedNote), findsNothing);

    await esperarPedidoDeAvaliacao(tester);
  });
}
```

Em `nexago_app/test/features/arenas/club_session_pix_page_cashback_test.dart`:

(a) Imports — depois de `import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';` acrescentar:

```dart
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';
```

(b) Trocar o fim do arquivo:

```dart
    await gerarPix(tester);
    expect(repo.useCashbackCalls, [false]);
  });
}
```

por:

```dart
    await gerarPix(tester);
    expect(repo.useCashbackCalls, [false]);
  });

  testWidgets('PIX confirmado: a tela de sucesso anuncia o cashback do lote',
      (tester) async {
    await abrir(
      tester,
      session: sessao(),
      participant: Stream.value(confirmado()),
      extraOverrides: [
        cashbackLotProvider('pay_c1').overrideWith(
          (ref) => Stream.value(
            const CashbackLot(
              id: 'pay_c1',
              status: CashbackLotStatus.pending,
              earnedCents: 60,
              remainingCents: 60,
            ),
          ),
        ),
      ],
    );
    await tester.pump();

    expect(find.text('Você está na lista!'), findsOneWidget);
    expect(find.text(CashbackCopy.earnedNote(60)), findsOneWidget);
  });

  testWidgets('vaga paga na arena: sem nota de cashback', (tester) async {
    await abrir(
      tester,
      session: sessao(),
      participant: Stream.value(confirmado(onsite: true)),
    );
    await tester.pump();

    expect(find.text('Vaga garantida!'), findsOneWidget);
    expect(find.byType(CashbackEarnedNote), findsNothing);
  });
}

/// Participante que o webhook confirmou (PIX) ou que garantiu na arena.
ClubParticipant confirmado({bool onsite = false}) {
  return ClubParticipant(
    sessionId: 's1',
    athleteId: 'u1',
    athleteName: 'Eu',
    clubId: 'c1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    clubName: 'Clubinho da Manhã',
    date: '2026-10-12',
    startTime: '08:00',
    endTime: '10:00',
    status: 'confirmed',
    paymentMethod: onsite ? 'onsite' : 'pix',
    amountReais: 30,
    refundStatus: 'none',
    asaasPaymentId: onsite ? null : 'pay_c1',
  );
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/tournaments/tournament_registration_navigation_payment_id_test.dart test/features/tournaments/tournament_registration_success_page_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart`
Expected: FAIL — não compila: `No named parameter with the name 'paymentId'` em `navigateToTournamentRegistrationSuccess` e em `TournamentRegistrationSuccessArgs`; no clubinho, "PIX confirmado" não acha a nota.

- [ ] **Step 3: Implementar — inscrição**

Trocar o conteúdo inteiro de `nexago_app/lib/features/tournaments/domain/tournament_registration_success_args.dart` por:

```dart
class TournamentRegistrationSuccessArgs {
  const TournamentRegistrationSuccessArgs({
    required this.tournamentId,
    required this.registrationId,
    required this.tournamentName,
    required this.categoryName,
    this.paymentId,
  });

  final String tournamentId;
  final String registrationId;
  final String tournamentName;
  final String categoryName;

  /// Pagamento do Asaas que acabou de confirmar (= id do lote de cashback).
  /// Só vem do PIX pago nesta sessão; reabrir o card não traz.
  final String? paymentId;
}
```

Em `nexago_app/lib/features/tournaments/domain/tournament_registration_navigation.dart`, trocar a função inteira:

```dart
/// Navega para a tela de confirmação (compartilhamento social).
void navigateToTournamentRegistrationSuccess(
  BuildContext context, {
  required WidgetRef ref,
  required String tournamentId,
  required String registrationId,
  required String tournamentName,
  required String categoryName,
}) {
  ref
      .read(tournamentRegistrationSuccessHandledIdsProvider.notifier)
      .markHandled(registrationId);

  context.goNamed(
    AppRouteNames.tournamentRegistrationSuccess,
    pathParameters: {'tournamentId': tournamentId},
    extra: TournamentRegistrationSuccessArgs(
      tournamentId: tournamentId,
      registrationId: registrationId,
      tournamentName: tournamentName,
      categoryName: categoryName,
    ),
    queryParameters: {
      'registrationId': registrationId,
      'tournamentName': tournamentName,
      'categoryName': categoryName,
    },
  );
}
```

por:

```dart
/// Navega para a tela de confirmação (compartilhamento social).
///
/// [paymentId] é o PIX que acabou de ser pago nesta sessão: a confirmação
/// ouve o lote de cashback dele. Quem não vem de um pagamento não passa.
void navigateToTournamentRegistrationSuccess(
  BuildContext context, {
  required WidgetRef ref,
  required String tournamentId,
  required String registrationId,
  required String tournamentName,
  required String categoryName,
  String? paymentId,
}) {
  ref
      .read(tournamentRegistrationSuccessHandledIdsProvider.notifier)
      .markHandled(registrationId);

  final payment = paymentId?.trim() ?? '';
  context.goNamed(
    AppRouteNames.tournamentRegistrationSuccess,
    pathParameters: {'tournamentId': tournamentId},
    extra: TournamentRegistrationSuccessArgs(
      tournamentId: tournamentId,
      registrationId: registrationId,
      tournamentName: tournamentName,
      categoryName: categoryName,
      paymentId: payment.isEmpty ? null : payment,
    ),
    queryParameters: {
      'registrationId': registrationId,
      'tournamentName': tournamentName,
      'categoryName': categoryName,
      if (payment.isNotEmpty) 'paymentId': payment,
    },
  );
}
```

Em `nexago_app/lib/features/tournaments/presentation/tournament_registration_pix_page.dart`, em `_onRegistrationUpdate`, trocar:

```dart
      navigateToTournamentRegistrationSuccess(
        context,
        ref: ref,
        tournamentId: widget.args.tournamentId,
        registrationId: widget.args.registrationId,
        tournamentName: widget.args.tournamentName,
        categoryName: widget.args.categoryName,
      );
```

por:

```dart
      navigateToTournamentRegistrationSuccess(
        context,
        ref: ref,
        tournamentId: widget.args.tournamentId,
        registrationId: widget.args.registrationId,
        tournamentName: widget.args.tournamentName,
        categoryName: widget.args.categoryName,
        paymentId: _pix?.paymentId,
      );
```

Em `nexago_app/lib/features/tournaments/presentation/tournament_registration_success_page.dart`:

(a) Imports — depois de `import '../domain/tournament_registration_success_args.dart';` acrescentar:

```dart
import '../../cashback/presentation/widgets/cashback_earned_note.dart';
```

(b) No fim de `children:` do `RegistrationWizardScaffold`, trocar:

```dart
                  footerLabel: widget.footerLabel,
                ),
              ),
      ],
    );
  }
```

por:

```dart
                  footerLabel: widget.footerLabel,
                ),
              ),
        // Só quando esta tela veio de um PIX pago agora: card reaberto
        // depois não tem pagamento para anunciar.
        if (args.paymentId != null)
          CashbackEarnedNote(paymentId: args.paymentId!),
      ],
    );
  }
```

Em `nexago_app/lib/core/router/app_router.dart`, na rota `AppRoutes.tournamentRegistrationSuccess`, trocar:

```dart
            return TournamentRegistrationSuccessPage(
              args: TournamentRegistrationSuccessArgs(
                tournamentId: tournamentId,
                registrationId: registrationId,
                tournamentName: tournamentName,
                categoryName: categoryName,
              ),
            );
```

por:

```dart
            final paymentId =
                state.uri.queryParameters['paymentId']?.trim() ?? '';
            return TournamentRegistrationSuccessPage(
              args: TournamentRegistrationSuccessArgs(
                tournamentId: tournamentId,
                registrationId: registrationId,
                tournamentName: tournamentName,
                categoryName: categoryName,
                paymentId: paymentId.isEmpty ? null : paymentId,
              ),
            );
```

- [ ] **Step 4: Implementar — clubinho**

Em `nexago_app/lib/features/arenas/presentation/club_session_pix_page.dart`:

(a) Imports — depois de `import '../../cashback/presentation/widgets/checkout_cashback_toggle.dart';` (Task 8) acrescentar:

```dart
import '../../cashback/presentation/widgets/cashback_earned_note.dart';
```

(b) No bloco `if (_confirmed) {`, logo depois de:

```dart
      final sessionLabel = session != null
          ? '${session.clubName} · ${session.dateShortLabel} · '
              '${session.timeRangeLabel}'
          : null;
```

acrescentar:

```dart
      // Só PIX pago pelo app gera cashback; vaga paga na arena não tem nota.
      // Reaberta a tela, o id vem do participante (`asaasPaymentId`).
      final cashbackPaymentId = isOnsite
          ? null
          : (_pix?.paymentId ?? myParticipant?.asaasPaymentId);
```

(c) Trocar:

```dart
          primaryAction: FeedbackAction(
            label: 'Ver a lista',
            onPressed: _onBack,
          ),
```

por:

```dart
          primaryAction: FeedbackAction(
            label: 'Ver a lista',
            onPressed: _onBack,
          ),
          extraContent: cashbackPaymentId == null
              ? null
              : CashbackEarnedNote(
                  paymentId: cashbackPaymentId,
                  padding: EdgeInsets.zero,
                ),
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/tournaments/tournament_registration_navigation_payment_id_test.dart test/features/tournaments/tournament_registration_success_page_test.dart test/features/tournaments/tournament_registration_pix_page_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart`
Expected: PASS — `All tests passed!` (testes antigos da tela de confirmação inclusive).

- [ ] **Step 6: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/tournaments/domain/tournament_registration_success_args.dart lib/features/tournaments/domain/tournament_registration_navigation.dart lib/features/tournaments/presentation/tournament_registration_pix_page.dart lib/features/tournaments/presentation/tournament_registration_success_page.dart lib/core/router/app_router.dart lib/features/arenas/presentation/club_session_pix_page.dart test/features/tournaments/tournament_registration_navigation_payment_id_test.dart test/features/tournaments/tournament_registration_success_page_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart`
Expected: `No issues found!` (o `(_, __)` antigo de outras linhas do teste de confirmação, se acusado, é pré-existente).

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/tournaments/domain/tournament_registration_success_args.dart nexago_app/lib/features/tournaments/domain/tournament_registration_navigation.dart nexago_app/lib/features/tournaments/presentation/tournament_registration_pix_page.dart nexago_app/lib/features/tournaments/presentation/tournament_registration_success_page.dart nexago_app/lib/core/router/app_router.dart nexago_app/lib/features/arenas/presentation/club_session_pix_page.dart nexago_app/test/features/tournaments/tournament_registration_navigation_payment_id_test.dart nexago_app/test/features/tournaments/tournament_registration_success_page_test.dart nexago_app/test/features/arenas/club_session_pix_page_cashback_test.dart && git commit -m "feat(cashback-app): nota de cashback no sucesso da inscrição e do clubinho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Comanda — remover o "cashback 3%"

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/comandas/arena_comanda_logic.dart`
- Modify: `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_closed_page.dart`
- Modify: `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_customer_page.dart`
- Modify: `nexago_app/test/features/arena/comandas/arena_comanda_logic_test.dart`
- Create: `nexago_app/test/features/arena/comandas/arena_comanda_closed_page_test.dart`

**Interfaces:**
- Consumes: `ArenaComandaClosedPage`, `ArenaComandaClosedArgs`, `ArenaComanda`, `ArenaComandaPayment` (já existem).
- Produces: `computeCashbackCents` deixa de existir; a comanda fechada e a tela do cliente não prometem cashback (a v1 não credita comanda — spec, "Fora da v1").

- [ ] **Step 1: Escrever o teste que falha**

Criar `nexago_app/test/features/arena/comandas/arena_comanda_closed_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_closed_args.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_payment.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_closed_page.dart';

void main() {
  testWidgets('comanda fechada não promete cashback (a v1 não credita comanda)',
      (tester) async {
    const comanda = ArenaComanda(
      id: 'c1',
      arenaId: 'a1',
      displayNumber: 7,
      type: ArenaComandaType.individual,
      status: ArenaComandaStatus.closed,
      customerName: 'Ana',
      allowAppOrders: false,
      rentalCents: 0,
      itemsTotalCents: 10000,
      totalCents: 10000,
      itemsCount: 3,
      paidCents: 10000,
      openedByUid: 'u1',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const ArenaComandaClosedPage(
          args: ArenaComandaClosedArgs(
            comanda: comanda,
            payments: [
              ArenaComandaPayment(
                id: 'p1',
                method: ArenaComandaPaymentMethod.pix,
                amountCents: 10000,
                payerName: 'Ana',
                receivedByUid: 'u1',
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Comanda fechada'), findsOneWidget);
    expect(find.textContaining('Cashback'), findsNothing);
    expect(find.textContaining('cashback'), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/arena/comandas/arena_comanda_closed_page_test.dart`
Expected: FAIL — `find.textContaining('Cashback')` acha 1 widget (`Cashback (3%)`).

- [ ] **Step 3: Remover**

Em `nexago_app/lib/features/arena/domain/comandas/arena_comanda_logic.dart`, apagar:

```dart
int computeCashbackCents(int totalCents) {
  return (totalCents * 0.03).round();
}

```

Em `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_closed_page.dart`:

(a) Apagar a linha:

```dart
    final cashback = computeCashbackCents(comanda.totalCents);
```

(b) Apagar o bloco (o divisor e a linha "Cashback (3%)" depois da lista de pagamentos):

```dart
                          Divider(
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.12),
                          ),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Cashback (3%)',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: context.themeColors.onSurfaceMuted,
                                  ),
                                ),
                              ),
                              Text(
                                formatComandaReais(cashback),
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.brand,
                                ),
                              ),
                            ],
                          ),
```

Em `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_customer_page.dart`:

(a) Apagar o bloco comentado (o switch "Comprovante e cashback" que nunca saiu):

```dart
          // const SizedBox(height: 20),
          // SwitchListTile(
          //   contentPadding: EdgeInsets.zero,
          //   title: Text(
          //     'Comprovante e cashback',
          //     style: Theme.of(context).textTheme.titleSmall?.copyWith(
          //           fontWeight: FontWeight.w700,
          //           color: context.themeColors.onSurface,
          //         ),
          //   ),
          //   subtitle: Text(
          //     'Enviar no WhatsApp ao fechar a conta',
          //     style: Theme.of(context).textTheme.bodySmall?.copyWith(
          //           color: context.themeColors.onSurfaceMuted,
          //         ),
          //   ),
          //   value: draft.sendReceiptWhatsapp,
          //   activeTrackColor: AppColors.brand,
          //   onChanged: ref
          //       .read(arenaComandaDraftProvider.notifier)
          //       .setSendReceiptWhatsapp,
          // ),
```

(b) Trocar:

```dart
                  'Só o nome é obrigatório. WhatsApp e CPF são usados para comprovante, cashback NexaGO e nota fiscal.',
```

por:

```dart
                  'Só o nome é obrigatório. WhatsApp e CPF são usados para comprovante e nota fiscal.',
```

Em `nexago_app/test/features/arena/comandas/arena_comanda_logic_test.dart`, apagar o grupo:

```dart
  group('computeCashbackCents', () {
    test('returns 3 percent rounded', () {
      expect(computeCashbackCents(10000), 300);
      expect(computeCashbackCents(14500), 435);
    });
  });

```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/arena/comandas`
Expected: PASS — `All tests passed!`

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && grep -rni "cashback" lib/features/arena`
Expected: nenhuma saída.

- [ ] **Step 5: Analisar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/arena/domain/comandas/arena_comanda_logic.dart lib/features/arena/presentation/comandas/arena_comanda_closed_page.dart lib/features/arena/presentation/comandas/arena_comanda_customer_page.dart test/features/arena/comandas`
Expected: `No issues found!` (se `AppColors` ficar sem uso em algum arquivo, apagar o import — na tela fechada ele segue usado pelo `AppColors.win`/`AppColors.brand` do resto da página).

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add nexago_app/lib/features/arena/domain/comandas/arena_comanda_logic.dart nexago_app/lib/features/arena/presentation/comandas/arena_comanda_closed_page.dart nexago_app/lib/features/arena/presentation/comandas/arena_comanda_customer_page.dart nexago_app/test/features/arena/comandas/arena_comanda_logic_test.dart nexago_app/test/features/arena/comandas/arena_comanda_closed_page_test.dart && git commit -m "chore(comanda): remove o cashback 3% que nunca foi creditado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificação final

**Files:** nenhum novo (só verificação).

**Interfaces:**
- Consumes: tudo das Tasks 1–11.
- Produces: suíte da fase verde, análise limpa, nenhum acesso direto ao Firebase na feature nova.

- [ ] **Step 1: Analisar todos os arquivos tocados**

Run:

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter analyze lib/features/cashback lib/core/router/routes.dart lib/core/router/app_router.dart lib/core/auth/role_route_guard.dart lib/core/notifications/notification_navigation.dart lib/features/athlete/presentation/athlete_home_page.dart lib/features/athlete/presentation/athlete_settings_page.dart lib/features/arenas/data/payment_service.dart lib/features/arenas/data/arena_clubs_repository.dart lib/features/arenas/domain/arena_booking_success_args.dart lib/features/arenas/presentation/arena_booking_pix_page.dart lib/features/arenas/presentation/booking_success_page.dart lib/features/arenas/presentation/club_session_pix_page.dart lib/features/tournaments/domain/tournament_registration_success_args.dart lib/features/tournaments/domain/tournament_registration_navigation.dart lib/features/tournaments/presentation/tournament_registration_pix_page.dart lib/features/tournaments/presentation/tournament_registration_success_page.dart lib/features/arena/domain/comandas/arena_comanda_logic.dart lib/features/arena/presentation/comandas/arena_comanda_closed_page.dart lib/features/arena/presentation/comandas/arena_comanda_customer_page.dart test/features/cashback test/core/auth/role_route_guard_test.dart test/core/notifications/notification_navigation_test.dart test/features/arenas/data/payment_service_cashback_test.dart test/features/arenas/data/arena_clubs_repository_cashback_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart test/features/arenas/booking_success_page_cashback_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart test/features/tournaments/tournament_registration_pix_page_test.dart test/features/tournaments/tournament_registration_success_page_test.dart test/features/tournaments/tournament_registration_navigation_payment_id_test.dart test/features/arena/comandas
```

Expected: `No issues found!` (info antiga em linha não tocada: anotar e seguir).

- [ ] **Step 2: Rodar todos os testes novos e tocados**

Run:

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && flutter test test/features/cashback test/core/auth/role_route_guard_test.dart test/core/notifications/notification_navigation_test.dart test/features/arenas/data/payment_service_cashback_test.dart test/features/arenas/data/arena_clubs_repository_cashback_test.dart test/features/arenas/data/booking_service_coupon_test.dart test/features/arenas/arena_booking_pix_page_cashback_test.dart test/features/arenas/booking_success_page_cashback_test.dart test/features/arenas/club_session_pix_page_cashback_test.dart test/features/arenas/booking_pix_expiry_card_test.dart test/features/arenas/arena_booking_success_actions_test.dart test/features/tournaments/tournament_registration_pix_page_test.dart test/features/tournaments/tournament_registration_success_page_test.dart test/features/tournaments/tournament_registration_navigation_payment_id_test.dart test/features/athlete/athlete_home_page_test.dart test/features/arena/comandas
```

Expected: `All tests passed!` A contagem tem de incluir os testes novos (se um arquivo novo não aparecer na contagem, plantar um `expect(1, 2)` nele antes de investigar qualquer outra coisa — pode ser a árvore errada).

- [ ] **Step 3: Conferir as regras do app na feature nova**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/nexago_app && grep -rnE "FirebaseFunctions\.instance|FirebaseFirestore\.instance|cacheFor|keepAlive|\.value[^O]" lib/features/cashback`
Expected: nenhuma saída (Firestore só por `firestoreProvider`; `valueOrNull` em vez de `.value`; sem TTL de cache).

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git status --short`
Expected: nada de `nexago_app/` pendente (o que aparecer em `functions/` é dos agentes do backend — não mexer).

- [ ] **Step 4: Entregar**

Sem commit nesta task. Para o relatório: a fase 3 não sobe `minBuildNumber` (app antigo segue pagando igual, sem `useCashback`), e a ordem de deploy do spec vale — rules → índices → functions → portal → build de loja aprovada → só então `appConfig/cashback.enabled` no DEV. Antes de ligar, o dono revisa `nexago_app/lib/features/cashback/presentation/cashback_copy.dart` (regulamento). QA manual sugerido no simulador com o recurso ligado no DEV: pílula ao lado do XP, tile nos ajustes, `/cashback` pelo push, toggle nos três PIX (reserva com sinal de 50% incluída) e a nota trocando de genérica para "+R$ X pendente" depois do pagamento.
