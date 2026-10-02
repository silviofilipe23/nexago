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
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';
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

ArenaClubSession sessao({double preco = 30, bool allowOnsite = false}) {
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
    allowOnsitePayment: allowOnsite,
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
      'seletor com onsite: PIX mostra o valor com cashback, arena mantém o preço cheio (Minor 1)',
      (tester) async {
    await abrir(
      tester,
      session: sessao(allowOnsite: true),
      availableCents: 1000,
    );

    // Antes de ligar o toggle, as duas opções mostram o preço cheio.
    expect(
      find.text('${formatBRL(30)} agora · aprovação na hora'),
      findsOneWidget,
    );
    expect(
      find.text('${formatBRL(30)} no dia · vaga garantida agora'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    await tester.pump();

    // Saldo de R$ 10 sobre R$ 30, mínimo de R$ 5: usa R$ 10 — PIX cai pra
    // R$ 20. A opção "pagar na arena" continua com o preço cheio.
    expect(
      find.text('${formatBRL(20)} agora · aprovação na hora'),
      findsOneWidget,
    );
    expect(
      find.text('${formatBRL(30)} no dia · vaga garantida agora'),
      findsOneWidget,
    );
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
