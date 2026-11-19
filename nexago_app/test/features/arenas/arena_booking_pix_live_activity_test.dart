import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/live_activity/pix_live_activity_models.dart';
import 'package:nexago_app/core/live_activity/pix_live_activity_service.dart';
import 'package:nexago_app/core/router/routes.dart';
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

/// Fiação da Live Activity na tela do Pix da reserva: gerar o Pix inicia o
/// card, o webhook de pago encerra, desistir some com ele.

class _FakePaymentService implements PaymentService {
  @override
  Future<ArenaBookingPixPaymentResult> createArenaBookingPixPayment({
    required String bookingId,
    String? cpfCnpj,
    double? paymentFraction,
    bool useCashback = false,
    String? squadCode,
  }) async {
    return ArenaBookingPixPaymentResult(
      paymentId: 'pay_1',
      qrCode: '00020101021226860014br.gov.bcb.pix',
      qrCodeBase64: '',
      expiresAt: DateTime.now().add(const Duration(minutes: 15)),
      amountToPayNowReais: 100,
      chargedReais: 90,
    );
  }

  @override
  Future<void> cancelPendingArenaBookingPayment({
    required String bookingId,
  }) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopStore implements PixLiveActivityStore {
  @override
  Future<void> remove(String paymentId) async {}

  @override
  Future<void> refreshToken({
    required String paymentId,
    required String liveActivityToken,
  }) async {}

  @override
  Future<void> saveToken({
    required String paymentId,
    required PixLiveActivityKind kind,
    required DateTime expiresAt,
    required String liveActivityToken,
  }) async {}
}

class _RecordingLiveActivity extends PixLiveActivityService {
  _RecordingLiveActivity()
      : super(store: _NoopStore(), isSupportedPlatform: false);

  final started = <PixLiveActivityRequest>[];
  final ended = <(String, PixLiveActivityOutcome)>[];

  @override
  Future<void> start(PixLiveActivityRequest request) async =>
      started.add(request);

  @override
  Future<void> end(String paymentId, PixLiveActivityOutcome outcome) async =>
      ended.add((paymentId, outcome));
}

// ignore: subtype_of_sealed_class
class _BookingSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _BookingSnapshot(this._data);
  final Map<String, dynamic> _data;

  @override
  bool get exists => true;

  @override
  Map<String, dynamic>? data() => _data;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingPixArgs _reserva() {
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
    amountToPayNowReais: 100,
    amountDueOnsiteReais: 0,
    paymentFraction: 1,
  );
}

Future<void> _abrirEGerarPix(
  WidgetTester tester, {
  required _RecordingLiveActivity liveActivity,
  required StreamController<DocumentSnapshot<Map<String, dynamic>>?> docs,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: '/pix',
    routes: [
      GoRoute(
        path: '/pix',
        builder: (context, state) =>
            ArenaBookingPixPage(arenaId: 'a1', args: _reserva()),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingSuccess,
        builder: (context, state) => const Scaffold(body: Text('sucesso')),
      ),
      GoRoute(
        path: AppRoutes.discover,
        builder: (context, state) => const Scaffold(body: Text('descobrir')),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        paymentServiceProvider.overrideWithValue(_FakePaymentService()),
        pixLiveActivityServiceProvider.overrideWithValue(liveActivity),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        arenaBookingDocProvider('b1').overrideWith((ref) => docs.stream),
        cashbackConfigProvider.overrideWith(
          (ref) => Stream.value(
            const CashbackConfig(
              enabled: false,
              ratePercent: 2,
              maxShareOfFee: 0.5,
              minCashCents: 500,
              expiryMonths: 6,
              expiryWarningDays: 15,
            ),
          ),
        ),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(const CashbackWallet(availableCents: 0)),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
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
      'gerar o Pix inicia o card com a cobrança e o contexto da reserva',
      (tester) async {
    final liveActivity = _RecordingLiveActivity();
    final docs = StreamController<DocumentSnapshot<Map<String, dynamic>>?>();
    addTearDown(docs.close);

    await _abrirEGerarPix(tester, liveActivity: liveActivity, docs: docs);

    final request = liveActivity.started.single;
    expect(request.paymentId, 'pay_1');
    expect(request.kind, PixLiveActivityKind.booking);
    expect(request.amountReais, 90, reason: 'o card mostra o que o QR cobra');
    expect(request.summary, 'Reserva · Arena Sol · Quadra 1');
    expect(request.detail, 'Seg, 12/10 · 19h–20h');
    expect(request.isValid, isTrue);
    expect(liveActivity.ended, isEmpty);
  });

  testWidgets('Pix pago encerra o card como pago', (tester) async {
    final liveActivity = _RecordingLiveActivity();
    final docs = StreamController<DocumentSnapshot<Map<String, dynamic>>?>();
    addTearDown(docs.close);
    await _abrirEGerarPix(tester, liveActivity: liveActivity, docs: docs);

    docs.add(
        _BookingSnapshot({'paymentStatus': 'paid', 'status': 'confirmed'}));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(liveActivity.ended, [('pay_1', PixLiveActivityOutcome.paid)]);
  });

  testWidgets('reserva cancelada antes do prazo some com o card na hora',
      (tester) async {
    final liveActivity = _RecordingLiveActivity();
    final docs = StreamController<DocumentSnapshot<Map<String, dynamic>>?>();
    addTearDown(docs.close);
    await _abrirEGerarPix(tester, liveActivity: liveActivity, docs: docs);

    docs.add(_BookingSnapshot({'status': 'cancelled'}));
    await tester.pump();
    await tester.pump();

    expect(liveActivity.ended, [('pay_1', PixLiveActivityOutcome.dismissed)]);
  });
}
