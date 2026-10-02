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
  // `FadeSlideIn` agenda o início da animação num `Future` (= `Timer` com
  // delay zero no fake_async dos testes): só `pump()` sem duração nunca o
  // libera (o binding só chama `elapse` quando a duração não é nula).
  await tester.pump(const Duration(milliseconds: 50));
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
