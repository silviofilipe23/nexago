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
