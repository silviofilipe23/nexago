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
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/domain/squad_rules.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_pix_args.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_service_fee.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_pix_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';

void main() {
  _taxaDeServicoTests();

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

  group('código de embaixador (NexaSquad)', () {
    testWidgets('recolhido por padrão; sem código a cobrança vai como antes',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
      );

      expect(find.byKey(const Key('squad-code-field')), findsNothing);
      await _gerarPix(tester);
      expect(service.squadCodeCalls.single ?? '', isEmpty);
    });

    testWidgets('o código digitado vai na cobrança, em maiúsculas',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const Key('squad-code-field')),
        'joao10',
      );
      // O CPF é o primeiro campo da tela; o código fica logo abaixo.
      await tester.enterText(find.byType(TextField).first, '52998224725');
      await tester.pump();
      await tester.tap(find.text('Gerar PIX'));
      await tester.pump();
      await tester.pump();

      expect(service.squadCodeCalls, ['JOAO10']);
    });

    testWidgets('QR mostra o desconto da indicação que o servidor aplicou',
        (tester) async {
      final service = _FakePaymentService(
        ArenaBookingPixPaymentResult(
          paymentId: 'pay_t1',
          qrCode: '00020101021226860014br.gov.bcb.pix',
          qrCodeBase64: '',
          expiresAt: DateTime.now().add(const Duration(minutes: 15)),
          amountToPayNowReais: 100,
          squadDiscountReais: 10,
          chargedReais: 90,
        ),
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
      );
      await _gerarPix(tester);

      expect(find.byKey(const Key('squad-discount-note')), findsOneWidget);
      expect(
        find.text('${formatBRL(10)} de desconto pela indicação de embaixador'),
        findsOneWidget,
      );
      expect(find.text(formatBRL(90)), findsOneWidget);
    });
  });

  // Tela 07: "Aplicar" confere com checkSquadCode antes de cobrar; a indicação
  // por link/QR é consultada sozinha (código vazio) quando a tela abre.
  group('código de embaixador: Aplicar e indicação por link (tela 07)', () {
    const joao = SquadCodeCheck(
      ambassadorName: 'João Victor',
      code: 'JOAO10',
      origin: 'code',
      discountPct: 10,
      feePercent: 8,
    );
    const maria = SquadCodeCheck(
      ambassadorName: 'Maria Souza',
      code: 'MARIA10',
      origin: 'link',
      discountPct: 10,
      feePercent: null,
    );

    Future<void> aplicar(WidgetTester tester, String code) async {
      await tester.enterText(find.byKey(const Key('squad-code-field')), code);
      await tester.pump();
      await tester.tap(find.byKey(const Key('squad-code-apply')));
      await tester.pump();
      await tester.pump();
    }

    testWidgets(
        'Aplicar confere o código, mostra o card, o resumo e a cobrança leva JOAO10',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      final squad = _FakeSquadRepository(check: joao);
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();
      await aplicar(tester, 'joao10');

      final conferido = squad.calls.last;
      expect(conferido.code, 'JOAO10');
      expect(conferido.registrationId, 'reg-1');

      expect(find.byKey(const Key('squad-code-applied')), findsOneWidget);
      expect(find.byKey(const Key('squad-code-field')), findsNothing);
      expect(find.text('Convite de João Victor · Squad'), findsOneWidget);
      expect(find.text('10% OFF nesta inscrição'), findsOneWidget);

      // R$ 100 × 10% = R$ 10, mas a taxa de 8% (R$ 8) é o teto do desconto.
      expect(find.byKey(const Key('squad-summary')), findsOneWidget);
      expect(find.text('Código JOAO10'), findsOneWidget);
      expect(find.text('− ${formatBRLFromCents(800)}'), findsOneWidget);
      expect(find.text(formatBRLFromCents(9200)), findsOneWidget);
      expect(
        find.text('${formatBRL(92)} · pagar com seu banco'),
        findsOneWidget,
      );

      await _gerarPix(tester);
      expect(service.squadCodeCalls, ['JOAO10']);
    });

    testWidgets('indicação por link aparece sozinha e a cobrança não manda código',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      final squad = _FakeSquadRepository(link: maria);
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      // A consulta da indicação vai com o código vazio, uma vez por checkout.
      expect(squad.calls.single.code, isEmpty);
      expect(squad.calls.single.registrationId, 'reg-1');
      expect(find.text('Indicação por link'), findsOneWidget);
      expect(find.text('Convite de Maria Souza · Squad'), findsOneWidget);
      expect(find.text('Tenho outro código'), findsOneWidget);
      expect(find.text('Tem código de embaixador?'), findsNothing);

      // Sem organizador (feePercent null): sem teto, R$ 10 de desconto.
      expect(find.text('Indicação'), findsOneWidget);
      expect(find.text('− ${formatBRLFromCents(1000)}'), findsOneWidget);
      expect(find.text(formatBRLFromCents(9000)), findsOneWidget);

      // O servidor acha a indicação pela conta; a cobrança vai sem código.
      await _gerarPix(tester);
      expect(service.squadCodeCalls, ['']);
    });

    testWidgets('Remover volta ao estado sem código', (tester) async {
      final service = _FakePaymentService(_resposta());
      final squad = _FakeSquadRepository(check: joao);
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();
      await aplicar(tester, 'joao10');
      expect(find.byKey(const Key('squad-summary')), findsOneWidget);

      await tester.tap(find.text('Remover'));
      await tester.pump();

      expect(find.byKey(const Key('squad-code-applied')), findsNothing);
      expect(find.byKey(const Key('squad-summary')), findsNothing);
      expect(find.text('Tem código de embaixador?'), findsOneWidget);
      expect(
        find.text('${formatBRL(100)} · pagar com seu banco'),
        findsOneWidget,
      );

      await _gerarPix(tester);
      expect(service.squadCodeCalls, ['']);
    });

    testWidgets('com indicação por link, Remover o código digitado volta para ela',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      final squad = _FakeSquadRepository(check: joao, link: maria);
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tenho outro código'));
      await tester.pump();
      await aplicar(tester, 'joao10');
      expect(find.text('Código JOAO10'), findsOneWidget);
      expect(find.text('Indicação por link'), findsNothing);

      await tester.tap(find.text('Remover'));
      await tester.pump();

      expect(find.text('Indicação por link'), findsOneWidget);
      expect(find.text('Indicação'), findsOneWidget);
      expect(find.text('Código JOAO10'), findsNothing);
    });

    testWidgets(
        'código recusado na conferência: erro no campo e a cobrança confere o digitado',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      final squad = _FakeSquadRepository(
        checkError: const SquadException('Esse código não existe.'),
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();
      await aplicar(tester, 'joao99');

      expect(find.text('Esse código não existe.'), findsOneWidget);
      expect(find.byKey(const Key('squad-code-applied')), findsNothing);
      expect(find.byKey(const Key('squad-summary')), findsNothing);

      await tester.enterText(find.byType(TextField).first, '52998224725');
      await tester.pump();
      await tester.tap(find.text('Gerar PIX'));
      await tester.pump();
      await tester.pump();
      expect(service.squadCodeCalls, ['JOAO99']);
    });

    testWidgets('desconto da 1ª inscrição já usado: card avisa e não há resumo',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      final squad = _FakeSquadRepository(
        check: const SquadCodeCheck(
          ambassadorName: 'João Victor',
          code: 'JOAO10',
          origin: 'code',
          discountPct: 0,
          feePercent: 8,
        ),
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();
      await aplicar(tester, 'JOAO10');

      expect(find.byKey(const Key('squad-code-applied')), findsOneWidget);
      expect(
        find.text('O desconto de indicação vale só na primeira inscrição.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('squad-summary')), findsNothing);
    });

    testWidgets('Aplicar fica desabilitado com o campo vazio', (tester) async {
      final squad = _FakeSquadRepository(check: joao);
      await _abrirPixComCashback(
        tester,
        service: _FakePaymentService(_resposta()),
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();

      final aplicarBtn = tester.widget<OutlinedButton>(
        find.byKey(const Key('squad-code-apply')),
      );
      expect(aplicarBtn.onPressed, isNull);
      expect(squad.calls.where((c) => c.code.isNotEmpty), isEmpty);
    });
  });
}

// "Quem paga" a taxa da nexaGO: com o atleta pagando (inteira ou metade) a
// prévia soma a parte dele ao preço; com o organizador, a tela é a de sempre.
void _taxaDeServicoTests() {
  group('taxa de serviço no checkout da inscrição', () {
    const regraAtleta = TournamentServiceFeeRule(
      percent: 8,
      floorReais: 1.5,
      payer: TournamentServiceFeePayer.athlete,
    );
    const regraDividida = TournamentServiceFeeRule(
      percent: 8,
      floorReais: 1.5,
      payer: TournamentServiceFeePayer.split,
    );

    testWidgets('organizador paga: nenhuma linha nova e o valor de sempre',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
      );

      expect(service.feeRuleCalls, ['t1']);
      expect(find.text('Taxa de serviço'), findsNothing);
      expect(find.byKey(const Key('squad-summary')), findsNothing);
      expect(
        find.text('${formatBRL(100)} · pagar com seu banco'),
        findsOneWidget,
      );

      await _gerarPix(tester);
      expect(find.byKey(const Key('service-fee-note')), findsNothing);
      expect(find.text(formatBRL(100)), findsOneWidget);
    });

    testWidgets('atleta paga: "Taxa de serviço" no resumo e total preço + taxa',
        (tester) async {
      final service = _FakePaymentService(
        _resposta(serviceFee: 8, charged: 108),
        feeRule: regraAtleta,
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
      );

      // R$ 100 × 8% = R$ 8 (acima do piso de R$ 1,50).
      expect(find.byKey(const Key('squad-summary')), findsOneWidget);
      expect(find.text('Inscrição'), findsOneWidget);
      expect(find.text(formatBRLFromCents(10000)), findsOneWidget);
      expect(find.text('Taxa de serviço'), findsOneWidget);
      expect(find.text(formatBRLFromCents(800)), findsOneWidget);
      expect(find.text(formatBRLFromCents(10800)), findsOneWidget);
      expect(
        find.text('${formatBRL(108)} · pagar com seu banco'),
        findsOneWidget,
      );

      // Depois da cobrança vale o que o servidor devolveu.
      await _gerarPix(tester);
      expect(
        find.text('Inclui ${formatBRL(8)} de taxa de serviço'),
        findsOneWidget,
      );
      expect(find.text(formatBRL(108)), findsOneWidget);
    });

    testWidgets('dividido com código: taxa pela metade sobre o preço e desconto',
        (tester) async {
      final service = _FakePaymentService(_resposta(), feeRule: regraDividida);
      final squad = _FakeSquadRepository(
        check: const SquadCodeCheck(
          ambassadorName: 'João Victor',
          code: 'JOAO10',
          origin: 'code',
          discountPct: 10,
          feePercent: 8,
        ),
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: squad,
      );

      await tester.tap(find.text('Tem código de embaixador?'));
      await tester.pump();
      await tester.enterText(find.byKey(const Key('squad-code-field')), 'joao10');
      await tester.pump();
      await tester.tap(find.byKey(const Key('squad-code-apply')));
      await tester.pump();
      await tester.pump();

      // Taxa R$ 8 → metade R$ 4; desconto R$ 8 (teto da taxa), sobre o preço.
      expect(find.text('Taxa de serviço'), findsOneWidget);
      expect(find.text(formatBRLFromCents(400)), findsOneWidget);
      expect(find.text('− ${formatBRLFromCents(800)}'), findsOneWidget);
      expect(find.text(formatBRLFromCents(9600)), findsOneWidget);
      expect(
        find.text('${formatBRL(96)} · pagar com seu banco'),
        findsOneWidget,
      );
    });

    testWidgets('o cashback também cobre a taxa de serviço', (tester) async {
      final service = _FakePaymentService(
        _resposta(serviceFee: 8, applied: 103, charged: 5),
        feeRule: regraAtleta,
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        availableCents: 20000,
      );

      await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
      await tester.pump();

      // Base do saldo: R$ 100 + R$ 8; sobra só o mínimo de R$ 5 no PIX.
      Finder noResumo(String text) => find.descendant(
            of: find.byKey(const Key('squad-summary')),
            matching: find.text(text),
          );
      expect(noResumo('Taxa de serviço'), findsOneWidget);
      expect(noResumo('Cashback'), findsOneWidget);
      expect(noResumo('− ${formatBRLFromCents(10300)}'), findsOneWidget);
      expect(noResumo(formatBRLFromCents(500)), findsOneWidget);
      expect(
        find.text('${formatBRL(5)} · pagar com seu banco'),
        findsOneWidget,
      );

      await _gerarPix(tester);
      expect(service.useCashbackCalls, [true]);
    });
  });

  // Benefício "Inscrições" do próprio embaixador: vem no `ownPerk` da consulta
  // da indicação (código vazio), que sai sozinha quando a tela abre.
  group('benefício do próprio embaixador (NexaSquad)', () {
    _FakeSquadRepository comBeneficio(SquadOwnPerk perk) => _FakeSquadRepository(
          link: SquadCodeCheck(
            ambassadorName: null,
            code: null,
            origin: null,
            discountPct: 0,
            feePercent: null,
            ownPerk: perk,
          ),
        );

    testWidgets('grátis disponível: ação principal confirma a parcela sem cobrar',
        (tester) async {
      final service = _FakePaymentService(
        _resposta(),
        freeError: PaymentException(
          'Suas inscrições grátis deste mês já foram usadas.',
        ),
      );
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: comBeneficio(
          const SquadOwnPerk.free(available: true, remaining: 2),
        ),
      );

      expect(find.byKey(const Key('squad-free-share')), findsOneWidget);
      expect(
        find.text('2 inscrições grátis restantes este mês'),
        findsOneWidget,
      );
      // O pagamento normal continua abaixo.
      expect(find.text('Gerar PIX'), findsOneWidget);

      await tester.tap(find.byKey(const Key('squad-free-confirm')));
      await tester.pump();
      await tester.pump();

      expect(service.freeCalls, ['reg-1']);
      expect(service.useCashbackCalls, isEmpty);
      // Recusa do servidor chega com a copy pronta.
      expect(
        find.text('Suas inscrições grátis deste mês já foram usadas.'),
        findsOneWidget,
      );
    });

    testWidgets('grátis ilimitado: sem número de restantes', (tester) async {
      await _abrirPixComCashback(
        tester,
        service: _FakePaymentService(_resposta()),
        config: CashbackConfig.fallback,
        squad: comBeneficio(const SquadOwnPerk.free(available: true)),
      );

      expect(find.byKey(const Key('squad-free-share')), findsOneWidget);
      expect(find.textContaining('restante'), findsNothing);
    });

    testWidgets('pagando a dupla inteira: só o aviso, sem a ação grátis',
        (tester) async {
      await _abrirPixComCashback(
        tester,
        service: _FakePaymentService(_resposta()),
        config: CashbackConfig.fallback,
        amountType: 'full',
        shareAmountReais: 200,
        ownShareReais: 100,
        squad: comBeneficio(
          const SquadOwnPerk.free(available: true, remaining: 1),
        ),
      );

      expect(find.byKey(const Key('squad-free-share')), findsNothing);
      expect(
        find.textContaining('cobre só a sua parcela'),
        findsOneWidget,
      );
    });

    testWidgets('gratuidades do mês usadas: aviso e pagamento normal',
        (tester) async {
      final service = _FakePaymentService(_resposta());
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: comBeneficio(
          const SquadOwnPerk.free(available: false, remaining: 0),
        ),
      );

      expect(find.byKey(const Key('squad-free-share')), findsNothing);
      expect(
        find.text('Suas inscrições grátis deste mês já foram usadas.'),
        findsOneWidget,
      );
      await _gerarPix(tester);
      expect(service.useCashbackCalls, [false]);
    });

    testWidgets(
        'desconto: linha no resumo e, gerada a cobrança, vale o squadPerkReais',
        (tester) async {
      final service = _FakePaymentService(_resposta(perk: 9, charged: 91));
      await _abrirPixComCashback(
        tester,
        service: service,
        config: CashbackConfig.fallback,
        squad: comBeneficio(const SquadOwnPerk.discount(10)),
      );

      final label = 'Benefício de embaixador (${squadPercent(10)})';
      expect(find.text(label), findsOneWidget);
      expect(find.text('− ${formatBRLFromCents(1000)}'), findsOneWidget);
      expect(find.text(formatBRLFromCents(9000)), findsOneWidget);
      expect(
        find.text('${formatBRL(90)} · pagar com seu banco'),
        findsOneWidget,
      );

      await _gerarPix(tester);
      expect(find.byKey(const Key('squad-perk-note')), findsOneWidget);
      expect(
        find.text('${formatBRL(9)} de desconto do seu benefício de embaixador'),
        findsOneWidget,
      );
      expect(find.text(formatBRL(91)), findsOneWidget);
    });

    testWidgets('desconto pagando a dupla inteira: só sobre a parcela dele',
        (tester) async {
      await _abrirPixComCashback(
        tester,
        service: _FakePaymentService(_resposta()),
        config: CashbackConfig.fallback,
        amountType: 'full',
        shareAmountReais: 200,
        ownShareReais: 100,
        squad: comBeneficio(const SquadOwnPerk.discount(10)),
      );

      expect(find.text('− ${formatBRLFromCents(1000)}'), findsOneWidget);
      expect(find.text(formatBRLFromCents(19000)), findsOneWidget);
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
/// [feeRule] é a regra da taxa de serviço que a prévia recebe (padrão: o
/// organizador paga, como em todos os torneios até aqui).
class _FakePaymentService implements PaymentService {
  _FakePaymentService(
    this.result, {
    this.feeRule = TournamentServiceFeeRule.none,
    this.freeError,
  });

  final ArenaBookingPixPaymentResult result;
  final TournamentServiceFeeRule feeRule;

  /// Recusa da gratuidade do embaixador (`confirmSquadFreeTournamentRegistration`).
  final PaymentException? freeError;
  final freeCalls = <String>[];
  final useCashbackCalls = <bool>[];
  final squadCodeCalls = <String?>[];
  final feeRuleCalls = <String>[];

  @override
  Future<TournamentServiceFeeRule> getTournamentServiceFee({
    required String tournamentId,
  }) async {
    feeRuleCalls.add(tournamentId);
    return feeRule;
  }

  @override
  Future<ArenaBookingPixPaymentResult> createTournamentRegistrationPixPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
    bool useCashback = false,
    String? squadCode,
  }) async {
    useCashbackCalls.add(useCashback);
    squadCodeCalls.add(squadCode);
    return result;
  }

  @override
  Future<({String registrationId, bool isPaid, double squadFreeReais})>
  confirmSquadFreeTournamentRegistration({
    required String registrationId,
  }) async {
    freeCalls.add(registrationId);
    final error = freeError;
    if (error != null) throw error;
    return (registrationId: registrationId, isPaid: false, squadFreeReais: 100.0);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Dublê do NexaSquad no checkout: só `checkCode` (código vazio = indicação
/// por link/QR guardada na conta).
class _FakeSquadRepository implements SquadRepository {
  _FakeSquadRepository({
    this.check = SquadCodeCheck.none,
    this.link = SquadCodeCheck.none,
    this.checkError,
  });

  final SquadCodeCheck check;
  final SquadCodeCheck link;
  final Object? checkError;
  final calls = <({String code, List<String> athleteUids, String registrationId})>[];

  @override
  Future<SquadCodeCheck> checkCode({
    required String code,
    required List<String> athleteUids,
    required String registrationId,
    String purpose = 'registration',
    String? arenaId,
  }) async {
    calls.add((
      code: code,
      athleteUids: athleteUids,
      registrationId: registrationId,
    ));
    if (code.isEmpty) return link;
    final error = checkError;
    if (error != null) throw error;
    return check;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingPixPaymentResult _resposta({
  double applied = 0,
  double? charged,
  double serviceFee = 0,
  double perk = 0,
}) {
  return ArenaBookingPixPaymentResult(
    paymentId: 'pay_t1',
    qrCode: '00020101021226860014br.gov.bcb.pix',
    qrCodeBase64: '',
    expiresAt: DateTime.now().add(const Duration(minutes: 15)),
    amountToPayNowReais: 100,
    cashbackAppliedReais: applied,
    serviceFeeReais: serviceFee,
    squadPerkReais: perk,
    chargedReais: charged,
  );
}

Future<void> _abrirPixComCashback(
  WidgetTester tester, {
  required _FakePaymentService service,
  CashbackConfig config = _ligado,
  int availableCents = 0,
  SquadRepository? squad,
  double shareAmountReais = 100,
  String amountType = 'share',
  double? ownShareReais,
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
    shareAmountReais: shareAmountReais,
    amountType: amountType,
    ownShareReais: ownShareReais,
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
        if (squad != null) squadRepositoryProvider.overrideWithValue(squad),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: TournamentRegistrationPixPage(args: args),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  // A consulta da indicação por link sai no primeiro frame e volta depois.
  if (squad != null) await tester.pump();
}

Future<void> _gerarPix(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '52998224725');
  await tester.pump();
  await tester.tap(find.text('Gerar PIX'));
  await tester.pump();
  await tester.pump();
}
