import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_pix_args.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_split.dart';
import 'package:nexago_app/features/arenas/domain/booking_split_providers.dart';
import 'package:nexago_app/features/arenas/presentation/arena_booking_pix_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_success_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import '../weather/weather_test_fakes.dart';

// Tela do Pix com a reserva dividida: acompanha as fatias, não gera o Pix da
// reserva inteira e não deixa o relógio de 5 min cancelar a reserva (que já
// está confirmada desde a divisão).

ArenaBookingPixArgs _args({bool split = true, DateTime? expiresAt}) =>
    ArenaBookingPixArgs(
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
      amountToPayNowReais: 70,
      amountDueOnsiteReais: 0,
      paymentFraction: 1,
      paymentExpiresAt: expiresAt,
      split: split,
      splitPayerNames: const {'u1': 'Você', 'joana': 'Joana'},
    );

BookingPaymentShare _share(String id, String payer, String status) =>
    BookingPaymentShare.fromMap(id, {
      'payerAthleteId': payer,
      'amountReais': 35,
      'status': status,
      'pixCopyPaste': '00020126PIX$id',
    });

Future<StreamController<DocumentSnapshot<Map<String, dynamic>>?>> _open(
  WidgetTester tester, {
  required ArenaBookingPixArgs args,
  required List<BookingPaymentShare> shares,
  Map<String, dynamic> bookingDoc = const {
    'status': 'confirmed',
    'paymentStatus': 'split_pending',
    'hasSplitShares': true,
  },
  List<Object?>? successExtras,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final doc = StreamController<DocumentSnapshot<Map<String, dynamic>>?>();
  addTearDown(doc.close);
  doc.add(FakeBookingSnapshot('b1', bookingDoc));

  final router = GoRouter(
    initialLocation: '/pix',
    routes: [
      GoRoute(
        path: '/pix',
        builder: (_, __) => ArenaBookingPixPage(arenaId: 'a1', args: args),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingSuccess,
        builder: (_, state) {
          successExtras?.add(state.extra);
          return const Scaffold(body: Text('tela de sucesso'));
        },
      ),
    ],
  );
  addTearDown(router.dispose);

  final user = MockUser(uid: 'u1');
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(user)),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        arenaBookingDocProvider('b1').overrideWith((ref) => doc.stream),
        bookingPaymentSharesProvider('b1')
            .overrideWith((ref) => Stream.value(shares)),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
  return doc;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('dividida: acompanha as fatias, sem gerar o Pix inteiro',
      (tester) async {
    await _open(
      tester,
      args: _args(),
      shares: [_share('1', 'u1', 'pending'), _share('2', 'joana', 'paid')],
    );

    expect(find.text('Pagamento dividido'), findsOneWidget);
    expect(find.text('Reserva confirmada'), findsOneWidget);
    expect(find.textContaining('1 de 2 pagaram'), findsOneWidget);
    expect(find.text('Joana'), findsOneWidget);
    expect(find.text('CPF DO TITULAR'), findsNothing);
    expect(find.text('Gerar PIX'), findsNothing);
  });

  testWidgets('prazo do Pix inteiro vencido não cancela a reserva dividida',
      (tester) async {
    await _open(
      tester,
      args:
          _args(expiresAt: DateTime.now().subtract(const Duration(minutes: 1))),
      shares: [_share('1', 'u1', 'pending'), _share('2', 'joana', 'pending')],
    );
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Pagamento não concluído'), findsNothing);
    expect(find.text('Reserva confirmada'), findsOneWidget);
  });

  testWidgets('reaberta sem o aviso nos args: o doc diz que foi dividida',
      (tester) async {
    await _open(
      tester,
      args: _args(split: false),
      shares: [_share('1', 'u1', 'pending'), _share('2', 'joana', 'pending')],
    );
    await tester.pump();

    expect(find.text('Reserva confirmada'), findsOneWidget);
    expect(find.text('Gerar PIX'), findsNothing);
  });

  testWidgets('todo mundo pagou: vai para o sucesso com o resumo da divisão',
      (tester) async {
    final extras = <Object?>[];
    final doc = await _open(
      tester,
      args: _args(),
      shares: [_share('1', 'u1', 'paid'), _share('2', 'joana', 'paid')],
      successExtras: extras,
    );

    doc.add(FakeBookingSnapshot('b1', const {
      'status': 'confirmed',
      'paymentStatus': 'paid',
      'hasSplitShares': true,
    }));
    await tester.pumpAndSettle();

    expect(find.text('tela de sucesso'), findsOneWidget);
    final success = extras.single! as BookingSuccessArgs;
    expect(success.paymentApproved, isTrue);
    expect(success.amountLabel, contains('Pago no Pix por 2 pessoas'));
  });

  testWidgets('"Concluir" sai antes de todos pagarem, sem dar como pago',
      (tester) async {
    final extras = <Object?>[];
    await _open(
      tester,
      args: _args(),
      shares: [_share('1', 'u1', 'paid'), _share('2', 'joana', 'pending')],
      successExtras: extras,
    );

    await tester.tap(find.byKey(const Key('booking-split-done')));
    await tester.pumpAndSettle();

    final success = extras.single! as BookingSuccessArgs;
    expect(success.paymentApproved, isFalse);
    expect(success.amountLabel, 'Dividido entre 2 pessoas · 1 de 2 pagaram');
    expect(success.paymentLabel, contains('Cada um paga a sua parte no Pix'));
  });
}
