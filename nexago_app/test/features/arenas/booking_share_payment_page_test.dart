import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_split.dart';
import 'package:nexago_app/features/arenas/domain/booking_split_providers.dart';
import 'package:nexago_app/features/arenas/presentation/booking_share_payment_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';

import '../weather/weather_test_fakes.dart';

// Tela do CONVIDADO da reserva dividida: o toque no push abre a fatia dele,
// mostra o Pix enquanto está pendente e vira "Pago" ao vivo.

const _key = (bookingId: 'b1', shareId: 's1');

/// Payload exato do push de `splitArenaBookingPaymentCore`.
const _pushData = <String, dynamic>{
  'type': 'arena_booking_share_payment_pending',
  'bookingId': 'b1',
  'shareId': 's1',
  'amountReais': '35',
  'url': '/reservas/b1/parcela/s1',
};

BookingPaymentShare _share(String status, {String? pix = '00020126PIXs1'}) =>
    BookingPaymentShare.fromMap('s1', {
      'payerAthleteId': 'joana',
      'amountReais': 35,
      'status': status,
      'pixCopyPaste': pix,
      'expiresAt': DateTime(2030, 11, 8, 17),
    });

Future<StreamController<BookingPaymentShare?>> _open(
  WidgetTester tester, {
  String initialLocation = '/reservas/b1/parcela/s1',
  Stream<BookingPaymentShare?> Function(StreamController<BookingPaymentShare?>)?
      shareStream,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final shares = StreamController<BookingPaymentShare?>();
  // Sem `await`: com o stream de erro ninguém escuta o controller, e o
  // `close()` de um controller sem ouvinte nunca completa.
  addTearDown(() => unawaited(shares.close()));

  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        path: AppRoutes.bookingSharePayment,
        builder: (_, state) => BookingSharePaymentPage(
          bookingId: state.pathParameters['bookingId'] ?? '',
          shareId: state.pathParameters['shareId'] ?? '',
        ),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingPaymentShareProvider(_key).overrideWith(
          (ref) => shareStream?.call(shares) ?? shares.stream,
        ),
        arenaBookingDocProvider('b1').overrideWith(
          (ref) => Stream<DocumentSnapshot<Map<String, dynamic>>?>.value(
            FakeBookingSnapshot('b1', {
              'arenaName': 'Arena CFC',
              'courtName': 'Quadra 2',
              'date': '2030-11-08',
              'startTime': '19:00',
              'endTime': '20:00',
              'athleteId': 'dono',
            }),
          ),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  return shares;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  test('o toque no push resolve para a rota da fatia', () {
    expect(resolveNotificationRoute(_pushData), '/reservas/b1/parcela/s1');
    expect(
      appRouteForNotificationUrl(_pushData['url'] as String),
      '/reservas/b1/parcela/s1',
    );
  });

  test('push sem ids usa o url; sem nada cai em Minhas reservas', () {
    expect(
      resolveNotificationRoute({
        'type': 'arena_booking_share_payment_pending',
        'url': '/reservas/b9/parcela/s9',
      }),
      '/reservas/b9/parcela/s9',
    );
    expect(
      resolveNotificationRoute({'type': 'arena_booking_share_payment_pending'}),
      AppRoutes.myBookings,
    );
  });

  testWidgets(
      'pendente: resumo da reserva, valor, QR e copia e cola; '
      'vira "Pago" ao vivo', (tester) async {
    final shares = await _open(
      tester,
      initialLocation: resolveNotificationRoute(_pushData)!,
    );
    shares.add(_share('pending'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Arena CFC'), findsOneWidget);
    expect(find.text('Quadra 2'), findsOneWidget);
    expect(find.textContaining('08/11 · 19:00–20:00'), findsOneWidget);
    expect(find.text('Sua parte: ${formatBRL(35)}'), findsOneWidget);
    expect(find.text('Aguardando'), findsOneWidget);
    expect(find.byType(BookingPixQrCard), findsOneWidget);
    expect(find.text('Copiar Pix Copia & Cola'), findsOneWidget);
    expect(find.textContaining('Pague até 08/11 às 17:00'), findsOneWidget);

    // Webhook do Asaas marca a fatia como paga.
    shares.add(_share('paid'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Pago'), findsOneWidget);
    expect(find.text('Pagamento confirmado. Bom jogo!'), findsOneWidget);
    expect(find.byType(BookingPixQrCard), findsNothing);
    expect(find.text('Copiar Pix Copia & Cola'), findsNothing);
  });

  testWidgets('prazo vencido: virou conta de quem reservou, sem Pix',
      (tester) async {
    final shares = await _open(tester);
    shares.add(_share('covered_by_organizer'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Virou conta de quem reservou'), findsOneWidget);
    expect(find.textContaining('Acerte a sua parte direto'), findsOneWidget);
    expect(find.byType(BookingPixQrCard), findsNothing);
  });

  testWidgets('expirada: avisa e não mostra o Pix', (tester) async {
    final shares = await _open(tester);
    shares.add(_share('expired'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Expirado'), findsOneWidget);
    expect(find.byType(BookingPixQrCard), findsNothing);
  });

  testWidgets('fatia que não existe: "Cobrança não encontrada"',
      (tester) async {
    final shares = await _open(tester);
    shares.add(null);
    await tester.pump();
    await tester.pump();

    expect(find.text('Cobrança não encontrada'), findsOneWidget);
  });

  testWidgets('erro de leitura mostra mensagem amigável, nunca a exceção',
      (tester) async {
    await _open(
      tester,
      shareStream: (_) => Stream.error(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Não foi possível abrir a cobrança'), findsOneWidget);
    expect(find.textContaining('FirebaseException'), findsNothing);
    expect(find.textContaining('permission-denied'), findsNothing);
  });
}
