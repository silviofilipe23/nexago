// Testes da TELA de pagamento (Task 11 do wizard de inscrição): re-skin do
// `Scaffold` + `TournamentRegistrationHeader` para `RegistrationWizardScaffold`.
//
// O harness `abrirPagamento` é NOVO — o único teste que existia para esta
// tela (`tournament_registration_payment_step_test.dart`) monta só o WIDGET
// do passo (`TournamentRegistrationPaymentStep`) dentro de um `Scaffold` de
// teste, não a `TournamentRegistrationPaymentPage` de verdade. Testar o
// widget do passo deixaria o re-skin da PÁGINA sem cobertura nenhuma — daí
// este arquivo, seguindo o padrão de `registration_partner_page_test.dart`
// (`ProviderScope` + `GoRouter`, capturando o `state` das rotas de destino).
import 'dart:async';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_pix_args.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_success_args.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_payment_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_pix_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';

/// Dublê do serviço de pagamento: só o necessário para o PIX da inscrição
/// gerar um `paymentId` na tela empilhada por cima do pagamento (teste do
/// I1 — corrida de navegação ao sucesso).
class _FakeRegistrationPixPaymentService implements PaymentService {
  _FakeRegistrationPixPaymentService(this.result);

  final ArenaBookingPixPaymentResult result;

  @override
  Future<ArenaBookingPixPaymentResult> createTournamentRegistrationPixPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
    bool useCashback = false,
  }) async => result;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  const meuUid = 'atleta-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    double entryFee = 100,
  }) => TournamentCategoryOffer(id: id, name: name, entryFee: entryFee);

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    String name = 'Copa de Teste',
  }) => TournamentDetail(
    id: 't1',
    name: name,
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: '20–22 Ago',
    startDate: DateTime(2026, 8, 20),
    endDate: DateTime(2026, 8, 22),
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 100',
    priceValue: 100,
    spotsLeft: 8,
    spotsTotal: 8,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: categorias,
    sport: 'beachTennis',
  );

  late List<String> rotasAbertas;

  Future<void> abrirPagamento(
    WidgetTester tester, {
    required TournamentDetail tournament,
    String categoryId = 'masc',
    String registrationId = 'reg-1',
    TournamentRegistrationSnapshot? snapshot,
  }) async {
    rotasAbertas = <String>[];

    final router = GoRouter(
      initialLocation: '/pagamento',
      routes: [
        GoRoute(
          path: '/pagamento',
          builder: (_, __) => TournamentRegistrationPaymentPage(
            tournamentId: 't1',
            registrationId: registrationId,
            categoryId: categoryId,
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao',
          name: AppRouteNames.tournamentRegistration,
          builder: (_, __) {
            rotasAbertas.add('inscrição');
            return const Scaffold(body: Text('inscrição'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/pix',
          name: AppRouteNames.tournamentRegistrationPix,
          builder: (_, __) {
            rotasAbertas.add('pix');
            return const Scaffold(body: Text('pix'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/sucesso',
          name: AppRouteNames.tournamentRegistrationSuccess,
          builder: (_, __) {
            rotasAbertas.add('sucesso');
            return const Scaffold(body: Text('sucesso'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) {
            rotasAbertas.add('detalhe');
            return const Scaffold(body: Text('detalhe'));
          },
        ),
        GoRoute(
          path: '/competir/meus-torneios',
          name: AppRouteNames.myTournaments,
          builder: (_, __) {
            rotasAbertas.add('meus-torneios');
            return const Scaffold(body: Text('meus torneios'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    final auth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: meuUid, displayName: 'Eu Mesmo'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          if (registrationId.isNotEmpty)
            tournamentRegistrationSnapshotProvider(
              registrationId,
            ).overrideWith((ref) => Stream.value(snapshot)),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(const <TournamentPartnerInvite>[]),
          ),
          registrationRosterProfilesProvider.overrideWith(
            (ref, uids) async => <String, AppUserProfile>{},
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  // ── Step 1 do brief: os 2 testes que abrem a task ────────────────────────

  testWidgets('pagamento não oferece cartão', (tester) async {
    await abrirPagamento(tester, tournament: torneio([dupla(entryFee: 220)]));

    // O protótipo tem um toggle Pix|Cartão — não existe pagamento por
    // cartão neste app, só PIX. Este teste prende a próxima pessoa que for
    // copiar o protótipo sem olhar a spec.
    expect(find.text('Cartão'), findsNothing);
    // Confirma que a tela renderizou o passo de pagamento de verdade (não
    // um estado vazio/erro que faria o "findsNothing" acima passar à toa).
    expect(find.text('Confirmar e pagar'), findsOneWidget);
  });

  testWidgets(
    'pagamento mostra o aviso do relógio da vaga na casca do wizard',
    (tester) async {
      // O aviso usa `RegistrationWizardNotice` com countdown a partir de
      // `holdExpiresAt` e janela fixa do torneio (`registrationHoldMinutes`).
      await abrirPagamento(
        tester,
        tournament: torneio([dupla()]),
        snapshot: TournamentRegistrationSnapshot(
          registrationId: 'reg-1',
          isPaid: false,
          paidAmount: 0,
          holdExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
        ),
      );

      expect(find.byType(RegistrationWizardNotice), findsOneWidget);
      expect(find.text('PAGUE EM 30 MIN'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(RegistrationWizardNotice),
          matching: find.textContaining(':'),
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'inscrição sem holdExpiresAt não mostra aviso de relógio nenhum',
    (tester) async {
      await abrirPagamento(
        tester,
        tournament: torneio([dupla()]),
        snapshot: const TournamentRegistrationSnapshot(
          registrationId: 'reg-1',
          isPaid: false,
          paidAmount: 0,
        ),
      );

      expect(find.textContaining('Vaga garantida até'), findsNothing);
      expect(find.textContaining('Prazo encerrado'), findsNothing);
    },
  );

  testWidgets('mostra dupla confirmada, opções e resumo do protótipo', (
    tester,
  ) async {
    await abrirPagamento(
      tester,
      tournament: torneio([dupla(entryFee: 220, name: 'Intermediário')]),
      snapshot: const TournamentRegistrationSnapshot(
        registrationId: 'reg-1',
        isPaid: false,
        paidAmount: 0,
        participantUids: ['atleta-1', 'parceiro-1'],
        player1Id: 'atleta-1',
      ),
    );

    expect(find.text('DUPLA CONFIRMADA'), findsOneWidget);
    expect(find.text('AGORA SIM: O PAGAMENTO'), findsOneWidget);
    expect(find.textContaining('Metade e metade'), findsOneWidget);
    expect(find.textContaining('Pagar a inscrição inteira'), findsOneWidget);
    expect(find.text('RESUMO'), findsOneWidget);
    expect(find.textContaining('no total'), findsOneWidget);
    expect(find.text(formatRegistrationMoney(110)), findsWidgets);
  });

  // ── I1 (revisão final): corrida entre o PIX empilhado e a página de
  // pagamento por baixo — as duas reagem à inscrição virar paga. ──────────

  testWidgets(
    'PIX empilhado sobre o pagamento: só uma navegação ao sucesso, e com o paymentId',
    (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final service = _FakeRegistrationPixPaymentService(
        ArenaBookingPixPaymentResult(
          paymentId: 'pay_123',
          qrCode: '00020101021226860014br.gov.bcb.pix',
          qrCodeBase64: '',
          expiresAt: DateTime.now().add(const Duration(minutes: 15)),
          amountToPayNowReais: 220,
        ),
      );
      final snapshotController =
          StreamController<TournamentRegistrationSnapshot?>.broadcast();
      addTearDown(snapshotController.close);

      var sucessoAberturas = 0;
      Object? sucessoExtra;

      final router = GoRouter(
        initialLocation: '/pagamento',
        routes: [
          GoRoute(
            path: '/pagamento',
            builder: (_, __) => const TournamentRegistrationPaymentPage(
              tournamentId: 't1',
              registrationId: 'reg-1',
              categoryId: 'masc',
            ),
          ),
          GoRoute(
            path: '/torneios/:tournamentId/inscricao/pix',
            name: AppRouteNames.tournamentRegistrationPix,
            builder: (_, state) => TournamentRegistrationPixPage(
              args: state.extra! as TournamentRegistrationPixArgs,
            ),
          ),
          GoRoute(
            path: '/torneios/:tournamentId/inscricao/sucesso',
            name: AppRouteNames.tournamentRegistrationSuccess,
            builder: (_, state) {
              sucessoAberturas++;
              sucessoExtra = state.extra;
              return const Scaffold(body: Text('sucesso'));
            },
          ),
        ],
      );
      addTearDown(router.dispose);

      final auth = MockFirebaseAuth(
        signedIn: true,
        mockUser: MockUser(uid: meuUid, displayName: 'Eu Mesmo'),
      );

      final container = ProviderContainer(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          // Uid vazio pro notifier de "já vistas": com uid de verdade ele
          // tenta ler `tournamentRegistrationSuccessPreferencesRepositoryProvider`
          // (SharedPreferences), não registrado neste teste — mesmo padrão
          // de `tournament_registration_success_page_test.dart`. `markHandled`
          // continua atualizando o estado em memória, que é o que importa
          // aqui. `authServiceProvider.currentUser` (síncrono, usado para o
          // elenco) segue vindo do `MockFirebaseAuth` logado acima.
          authProvider.overrideWith((ref) => Stream.value(null)),
          tournamentDetailProvider('t1').overrideWith(
            (ref) => Stream.value(torneio([dupla(entryFee: 220)])),
          ),
          tournamentRegistrationSnapshotProvider(
            'reg-1',
          ).overrideWith((ref) => snapshotController.stream),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(const <TournamentPartnerInvite>[]),
          ),
          registrationRosterProfilesProvider.overrideWith(
            (ref, uids) async => <String, AppUserProfile>{},
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
          paymentServiceProvider.overrideWithValue(service),
          cashbackConfigProvider.overrideWith(
            (ref) => Stream.value(CashbackConfig.fallback),
          ),
          cashbackWalletProvider.overrideWith(
            (ref) => Stream.value(const CashbackWallet()),
          ),
        ],
      );
      addTearDown(container.dispose);

      // Pré-aquece o notifier de "já vistas" (e o `authProvider` que ele
      // observa) ANTES da corrida: sem isto, o `authProvider` (nunca lido
      // até aqui) só resolveria de `AsyncLoading` pra `AsyncData` bem no
      // meio da corrida — o notifier reconstruiria e perderia o
      // `markHandled` do PIX entre uma navegação e a outra, um artefato do
      // teste (em produção o `authProvider` já está resolvido muito antes
      // de chegar nesta tela).
      container.listen(tournamentRegistrationSuccessHandledIdsProvider, (
        _,
        _,
      ) {});
      await container.read(authProvider.future);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(routerConfig: router),
        ),
      );

      snapshotController.add(
        const TournamentRegistrationSnapshot(
          registrationId: 'reg-1',
          isPaid: false,
          paidAmount: 0,
          participantUids: ['atleta-1', 'parceiro-1'],
          player1Id: 'atleta-1',
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirmar e pagar'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '52998224725');
      await tester.pump();
      await tester.tap(find.text('Gerar PIX'));
      await tester.pump();
      await tester.pump();

      // A inscrição vira paga: o `ref.listen` do PIX (empilhado, em cima) e
      // o `build` da página de pagamento (por baixo) reagem ambos ao mesmo
      // snapshot — a corrida do I1.
      snapshotController.add(
        const TournamentRegistrationSnapshot(
          registrationId: 'reg-1',
          isPaid: true,
          paidAmount: 220,
          participantUids: ['atleta-1', 'parceiro-1'],
          player1Id: 'atleta-1',
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      expect(sucessoAberturas, 1);
      expect(
        (sucessoExtra! as TournamentRegistrationSuccessArgs).paymentId,
        'pay_123',
      );
    },
  );
}
