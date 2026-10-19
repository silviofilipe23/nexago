import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_pix_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_success_args.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
import 'package:nexago_app/features/arenas/presentation/arena_booking_pix_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_card_checkout_panel.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';

const _invoiceUrl = 'https://www.asaas.com/i/pay_c1';

/// Dublê do serviço só com o caminho do cartão da reserva.
class _FakeBookingCardService implements PaymentService {
  _FakeBookingCardService({
    this.expiresIn = const Duration(minutes: 15),
    this.cancelError,
  });

  final Duration expiresIn;
  final PaymentException? cancelError;
  final cardCalls = <({String bookingId, double? fraction, String? cpf})>[];
  final openedUrls = <String>[];
  var closeCalls = 0;
  var cancelCalls = 0;

  @override
  Future<CardCheckoutPaymentResult> createArenaBookingCardPayment({
    required String bookingId,
    String? cpfCnpj,
    double? paymentFraction,
    bool useCashback = false,
    String? squadCode,
  }) async {
    cardCalls.add((bookingId: bookingId, fraction: paymentFraction, cpf: cpfCnpj));
    return CardCheckoutPaymentResult(
      paymentId: 'pay_c1',
      invoiceUrl: _invoiceUrl,
      expiresAt: DateTime.now().add(expiresIn),
      amountReais: 100 * (paymentFraction ?? 1),
    );
  }

  @override
  Future<void> openHostedCheckout(String url) async => openedUrls.add(url);

  @override
  Future<void> closeHostedCheckout() async => closeCalls++;

  /// O caminho do cartão usa a variante que repassa a recusa do servidor.
  @override
  Future<void> releasePendingArenaBookingCardPayment({required String bookingId}) async {
    cancelCalls++;
    final error = cancelError;
    if (error != null) throw error;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingPixArgs _reserva({double fraction = 1.0}) {
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

class _Tela {
  _Tela(this.service);
  final _FakeBookingCardService service;
  Object? successExtra;
}

Future<_Tela> _abrir(
  WidgetTester tester, {
  required _FakeBookingCardService service,
  ArenaBookingPixArgs? args,
  Stream<DocumentSnapshot<Map<String, dynamic>>?>? bookingDocs,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final tela = _Tela(service);
  final router = GoRouter(
    initialLocation: '/pix',
    routes: [
      GoRoute(
        path: '/pix',
        builder: (_, _) => ArenaBookingPixPage(arenaId: 'a1', args: args ?? _reserva()),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingSuccess,
        builder: (_, state) {
          tela.successExtra = state.extra;
          return const Scaffold(body: Text('sucesso'));
        },
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        paymentServiceProvider.overrideWithValue(service),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        arenaBookingDocProvider('b1').overrideWith(
          (ref) => bookingDocs ?? Stream<DocumentSnapshot<Map<String, dynamic>>?>.value(null),
        ),
        cashbackConfigProvider.overrideWith((ref) => Stream.value(CashbackConfig.fallback)),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(CashbackWallet(availableCents: 0)),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
  return tela;
}

Future<void> _pagarNoCartao(WidgetTester tester, {required double valor}) async {
  await tester.tap(find.byKey(RegistrationPaymentMethodPicker.cardKey));
  await tester.pump();
  final botao = 'Pagar ${formatBRL(valor)} no cartão';
  expect(find.text(botao), findsOneWidget);
  await tester.enterText(find.byType(TextField), '52998224725');
  await tester.pump();
  await tester.tap(find.text(botao));
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('oferece PIX e cartão; PIX vem marcado e o fluxo de sempre segue', (tester) async {
    await _abrir(tester, service: _FakeBookingCardService());

    expect(find.byKey(RegistrationPaymentMethodPicker.pixKey), findsOneWidget);
    expect(find.byKey(RegistrationPaymentMethodPicker.cardKey), findsOneWidget);
    expect(find.text('Gerar PIX'), findsOneWidget);
  });

  testWidgets('cartão no sinal de 50%: cobra a metade e abre o checkout do Asaas', (tester) async {
    final service = _FakeBookingCardService();
    await _abrir(tester, service: service, args: _reserva(fraction: 0.5));

    await _pagarNoCartao(tester, valor: 50);

    expect(service.cardCalls.single, (bookingId: 'b1', fraction: 0.5, cpf: '52998224725'));
    expect(service.openedUrls, [_invoiceUrl]);
    expect(find.text('Pagamento com cartão'), findsOneWidget);
    expect(find.byType(RegistrationCardCheckoutPanel), findsOneWidget);
    expect(find.byType(RegistrationPaymentMethodPicker), findsNothing);
  });

  testWidgets('"Pagar com PIX" volta ao seletor sem cancelar a reserva', (tester) async {
    final service = _FakeBookingCardService();
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester, valor: 100);

    await tester.tap(find.text('Pagar com PIX'));
    await tester.pump();

    expect(service.cancelCalls, 0);
    expect(find.byType(RegistrationPaymentMethodPicker), findsOneWidget);
    expect(find.byType(RegistrationCardCheckoutPanel), findsNothing);
  });

  testWidgets('prazo vence com o cartão aprovado no servidor: não mostra falha', (tester) async {
    final service = _FakeBookingCardService(
      expiresIn: const Duration(seconds: 2),
      cancelError: PaymentException('Seu pagamento com cartão já foi aprovado — a reserva está confirmada.'),
    );
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester, valor: 100);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    expect(service.cancelCalls, 1);
    expect(find.text('Pagamento não concluído'), findsNothing);
    expect(find.textContaining('já foi aprovado'), findsOneWidget);
  });

  testWidgets('trocou para PIX e o prazo do cartão venceu com o cartão aprovado: não mostra falha',
      (tester) async {
    final service = _FakeBookingCardService(
      expiresIn: const Duration(seconds: 2),
      cancelError: PaymentException('Seu pagamento com cartão já foi aprovado — a reserva está confirmada.'),
    );
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester, valor: 100);
    await tester.tap(find.text('Pagar com PIX'));
    await tester.pump();

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    // Soltou pela chamada do cartão (que repassa a recusa), não pela do PIX.
    expect(service.cancelCalls, 1);
    expect(find.text('Pagamento não concluído'), findsNothing);
  });

  testWidgets('prazo vence sem pagamento: libera o horário, fecha o checkout e avisa', (tester) async {
    final service = _FakeBookingCardService(expiresIn: const Duration(seconds: 2));
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester, valor: 100);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    expect(service.cancelCalls, 1);
    expect(service.closeCalls, 1);
    expect(find.text('Pagamento não concluído'), findsOneWidget);
  });

  testWidgets('cartão aprovado: fecha o checkout e confirma com o pagamento do cartão', (tester) async {
    final docs = StreamController<DocumentSnapshot<Map<String, dynamic>>?>.broadcast();
    addTearDown(docs.close);
    final service = _FakeBookingCardService();
    final tela = await _abrir(tester, service: service, bookingDocs: docs.stream);
    await _pagarNoCartao(tester, valor: 100);

    docs.add(_PaidBookingSnapshot());
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(service.closeCalls, 1);
    expect(find.text('sucesso'), findsOneWidget);
    final extra = tela.successExtra! as BookingSuccessArgs;
    expect(extra.paymentId, 'pay_c1');
    expect(extra.amountLabel, 'Total pago: ${formatBRL(100)} no cartão');
  });
}

// Fake escrito à mão (padrão do repo); `DocumentSnapshot` é sealed.
// ignore: subtype_of_sealed_class
class _PaidBookingSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  @override
  bool get exists => true;

  @override
  Map<String, dynamic>? data() => {'paymentStatus': 'paid', 'status': 'confirmed'};

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
