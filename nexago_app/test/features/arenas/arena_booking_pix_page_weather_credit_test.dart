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

import '../weather/weather_test_fakes.dart';

/// Reserva com crédito de chuva: o servidor cobra o resto INTEGRAL (metade
/// de um resto pequeno cairia abaixo do mínimo do Pix) e ignora o pedido de
/// 50% — a tela não oferece o sinal.
class _FakePaymentService implements PaymentService {
  final fractions = <double?>[];

  @override
  Future<ArenaBookingPixPaymentResult> createArenaBookingPixPayment({
    required String bookingId,
    String? cpfCnpj,
    double? paymentFraction,
    bool useCashback = false,
    String? squadCode,
  }) async {
    fractions.add(paymentFraction);
    return ArenaBookingPixPaymentResult(
      paymentId: 'pay_1',
      qrCode: '00020101021226860014br.gov.bcb.pix',
      qrCodeBase64: '',
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      amountToPayNowReais: 10,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingPixArgs reserva({
  required double payNow,
  required double dueOnsite,
  double fraction = 1.0,
  double weatherCredit = 0,
}) {
  return ArenaBookingPixArgs(
    bookingId: 'b1',
    confirmArgs: ArenaBookingConfirmArgs(
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      courtId: 'q2',
      courtName: 'Quadra 2',
      date: DateTime(2030, 11, 8),
      startTime: '19:00',
      endTime: '20:00',
      amountReais: 70,
    ),
    amountToPayNowReais: payNow,
    amountDueOnsiteReais: dueOnsite,
    paymentFraction: fraction,
    weatherCreditAppliedReais: weatherCredit,
  );
}

Future<void> abrirPix(
  WidgetTester tester, {
  required _FakePaymentService service,
  required ArenaBookingPixArgs args,
  Map<String, dynamic>? bookingDoc,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        paymentServiceProvider.overrideWithValue(service),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        arenaBookingDocProvider('b1').overrideWith(
          (ref) => Stream<DocumentSnapshot<Map<String, dynamic>>?>.value(
            bookingDoc == null ? null : FakeBookingSnapshot('b1', bookingDoc),
          ),
        ),
        cashbackConfigProvider.overrideWith(
          (ref) => Stream.value(CashbackConfig.fallback),
        ),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(const CashbackWallet(availableCents: 0)),
        ),
      ],
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

  testWidgets('crédito na criação: sem sinal de 50%, cobra o resto integral',
      (tester) async {
    final service = _FakePaymentService();
    // R$ 70 com R$ 60 de crédito: resta R$ 10, cobrado inteiro agora.
    await abrirPix(
      tester,
      service: service,
      args: reserva(payNow: 10, dueOnsite: 0, weatherCredit: 60),
    );

    expect(find.text('Apenas sinal · 50%'), findsNothing);
    expect(find.byKey(const Key('booking-pix-full-only')), findsOneWidget);
    expect(find.text(formatBRL(10)), findsWidgets);
    expect(
      find.textContaining('Crédito de chuva de ${formatBRL(60)} já descontado'),
      findsOneWidget,
    );

    await gerarPix(tester);
    expect(service.fractions.single, 1.0);
  });

  testWidgets(
      'retomada: crédito no doc ignora o 50% antigo e cobra o resto inteiro',
      (tester) async {
    final service = _FakePaymentService();
    await abrirPix(
      tester,
      service: service,
      // Pix retomado de antes da regra: veio com sinal de 50% do resto.
      args: reserva(payNow: 5, dueOnsite: 5, fraction: 0.5),
      bookingDoc: {
        'status': 'pending_payment',
        'paymentStatus': 'pending',
        'weatherCreditReais': 60,
      },
    );

    expect(find.text('Apenas sinal · 50%'), findsNothing);
    expect(find.byKey(const Key('booking-pix-full-only')), findsOneWidget);

    await gerarPix(tester);
    expect(service.fractions.single, 1.0);
  });

  testWidgets('sem crédito: as duas opções seguem como antes', (tester) async {
    final service = _FakePaymentService();
    await abrirPix(
      tester,
      service: service,
      args: reserva(payNow: 70, dueOnsite: 0),
    );

    expect(find.text('Apenas sinal · 50%'), findsOneWidget);
    expect(find.byKey(const Key('booking-pix-full-only')), findsNothing);

    await tester.tap(find.text('Apenas sinal · 50%'));
    await tester.pump();
    await gerarPix(tester);
    expect(service.fractions.single, 0.5);
  });
}
