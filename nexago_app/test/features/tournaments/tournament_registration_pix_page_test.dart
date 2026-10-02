import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_pix_args.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_pix_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';

void main() {
  testWidgets('PIX mostra countdown da vaga com janela fixa do torneio', (
    tester,
  ) async {
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

    final auth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: 'atleta-1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
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
        ],
        child: MaterialApp(
          home: TournamentRegistrationPixPage(args: args),
        ),
      ),
    );
    await tester.pump();

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
