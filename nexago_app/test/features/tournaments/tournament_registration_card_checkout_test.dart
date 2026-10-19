import 'dart:async';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_pix_args.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_pix_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_card_checkout_panel.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';

const _invoiceUrl = 'https://www.asaas.com/i/pay_c1';

void main() {
  testWidgets('oferece PIX e cartão; PIX vem marcado e o fluxo de sempre segue',
      (tester) async {
    final service = _FakeCardPaymentService();
    await _abrir(tester, service: service);

    expect(find.text('Pagamento'), findsOneWidget);
    expect(find.byKey(RegistrationPaymentMethodPicker.pixKey), findsOneWidget);
    expect(find.byKey(RegistrationPaymentMethodPicker.cardKey), findsOneWidget);
    expect(find.text('Gerar PIX'), findsOneWidget);
  });

  testWidgets(
      'cartão: abre a cobrança com o mesmo payload e o checkout do Asaas',
      (tester) async {
    final service = _FakeCardPaymentService(charged: 90);
    await _abrir(tester, service: service);

    await _pagarNoCartao(tester);

    expect(service.cardCalls.single, (
      registrationId: 'reg-1',
      cpfCnpj: '52998224725',
      amountType: 'full',
    ));
    expect(service.openedUrls, [_invoiceUrl]);
    expect(find.text('Pagamento com cartão'), findsOneWidget);
    expect(find.byType(RegistrationCardCheckoutPanel), findsOneWidget);
    expect(find.byType(RegistrationPaymentMethodPicker), findsNothing);
    // O painel mostra o que o cartão cobra, não o preço.
    expect(
      find.descendant(
        of: find.byType(RegistrationCardCheckoutPanel),
        matching: find.text(formatBRL(90)),
      ),
      findsOneWidget,
    );
  });

  testWidgets('fechou o navegador sem pagar: reabre o mesmo checkout',
      (tester) async {
    final service = _FakeCardPaymentService();
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester);

    await tester.tap(find.byKey(RegistrationCardCheckoutPanel.openKey));
    await tester.pump();

    expect(service.openedUrls, [_invoiceUrl, _invoiceUrl]);
    expect(service.cardCalls, hasLength(1));
  });

  testWidgets('cancelar e trocar o meio: cancela a cobrança e volta ao seletor',
      (tester) async {
    final service = _FakeCardPaymentService();
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester);

    await tester.tap(find.text('Cancelar e trocar o meio de pagamento'));
    await tester.pump();
    await tester.pump();

    expect(service.cancelCalls, 1);
    expect(find.byType(RegistrationCardCheckoutPanel), findsNothing);
    expect(find.byType(RegistrationPaymentMethodPicker), findsOneWidget);
  });

  testWidgets('cartão aprovado com o checkout aberto: fecha o navegador',
      (tester) async {
    final service = _FakeCardPaymentService();
    final registration = StreamController<TournamentRegistrationSnapshot>();
    addTearDown(registration.close);
    await _abrir(tester, service: service, registration: registration);
    await _pagarNoCartao(tester);

    registration.add(
      _snapshot(sharePaidUids: const ['atleta-1']),
    );
    await tester.pump();
    await tester.pump();
    // Fim da transição do pop (sem pumpAndSettle: o relógio da cobrança tica).
    await tester.pump(const Duration(seconds: 1));

    expect(service.closeCalls, 1);
    expect(find.textContaining('Parcela paga'), findsOneWidget);
    expect(find.byType(TournamentRegistrationPixPage), findsNothing);
  });

  testWidgets('cobrança do cartão venceu: fecha o checkout e avisa',
      (tester) async {
    final service = _FakeCardPaymentService(
      expiresIn: const Duration(seconds: 2),
    );
    await _abrir(tester, service: service);
    await _pagarNoCartao(tester);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    expect(service.cancelCalls, 1);
    expect(service.closeCalls, 1);
    expect(find.text('Pagamento expirado'), findsOneWidget);
  });
}

/// Dublê do serviço só com o caminho do cartão.
class _FakeCardPaymentService implements PaymentService {
  _FakeCardPaymentService({
    this.charged,
    this.expiresIn = const Duration(minutes: 15),
  });

  final double? charged;
  final Duration expiresIn;
  final cardCalls =
      <({String registrationId, String? cpfCnpj, String amountType})>[];
  final openedUrls = <String>[];
  var closeCalls = 0;
  var cancelCalls = 0;

  @override
  Future<CardCheckoutPaymentResult>
  createTournamentRegistrationCardPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
    bool useCashback = false,
    String? squadCode,
  }) async {
    cardCalls.add((
      registrationId: registrationId,
      cpfCnpj: cpfCnpj,
      amountType: amountType,
    ));
    return CardCheckoutPaymentResult(
      paymentId: 'pay_c1',
      invoiceUrl: _invoiceUrl,
      expiresAt: DateTime.now().add(expiresIn),
      amountReais: 100,
      chargedReais: charged,
    );
  }

  @override
  Future<void> openHostedCheckout(String url) async => openedUrls.add(url);

  @override
  Future<void> closeHostedCheckout() async => closeCalls++;

  @override
  Future<void> cancelPendingTournamentRegistrationPix({
    required String registrationId,
  }) async =>
      cancelCalls++;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

TournamentRegistrationSnapshot _snapshot({
  List<String> sharePaidUids = const [],
}) {
  return TournamentRegistrationSnapshot(
    registrationId: 'reg-1',
    isPaid: false,
    paidAmount: 0,
    sharePaidUids: sharePaidUids,
    holdExpiresAt: DateTime.now().add(const Duration(minutes: 20)),
  );
}

/// Abre a tela de cobrança por cima de uma rota inicial, para o `pop` do
/// pagamento confirmado ter para onde voltar.
Future<void> _abrir(
  WidgetTester tester, {
  required _FakeCardPaymentService service,
  StreamController<TournamentRegistrationSnapshot>? registration,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final args = TournamentRegistrationPixArgs(
    registrationId: 'reg-1',
    tournamentId: 't1',
    tournamentName: 'Copa Teste',
    categoryName: 'Dupla Masculina',
    shareAmountReais: 100,
    amountType: 'full',
    holdExpiresAt: DateTime.now().add(const Duration(minutes: 20)),
    holdMinutes: 30,
  );
  final router = GoRouter(
    initialLocation: '/pagar',
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: Text('inscrição')),
        routes: [
          GoRoute(
            path: 'pagar',
            builder: (_, __) => TournamentRegistrationPixPage(args: args),
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);

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
          (ref) => registration?.stream ?? Stream.value(_snapshot()),
        ),
        paymentServiceProvider.overrideWithValue(service),
        cashbackConfigProvider.overrideWith(
          (ref) => Stream.value(CashbackConfig.fallback),
        ),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(CashbackWallet(availableCents: 0)),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Future<void> _pagarNoCartao(WidgetTester tester) async {
  await tester.tap(find.byKey(RegistrationPaymentMethodPicker.cardKey));
  await tester.pump();
  expect(find.text('Pagar ${formatBRL(100)} no cartão'), findsOneWidget);
  await tester.enterText(find.byType(TextField), '52998224725');
  await tester.pump();
  await tester.tap(find.text('Pagar ${formatBRL(100)} no cartão'));
  await tester.pump();
  await tester.pump();
}
