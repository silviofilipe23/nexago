import 'dart:async';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/registration_wizard_step.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_gate_page.dart';

/// Testes do PORTEIRO de `/torneios/:tournamentId/inscricao`.
///
/// A tela não tem UI própria além do loader: ela lê torneio, inscrições e
/// convites, chama `resolveRegistrationStep` e se substitui pela rota da
/// etapa certa. Por isso as asserções são sobre a ROTA aberta, não sobre
/// pixels — o harness (copiado de `registration_partner_page_test.dart`)
/// registra cada rota-alvo com um builder que anota o nome e os query params.
void main() {
  const meuUid = 'atleta-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    String genderType = 'male',
    double entryFee = 100,
    int maxTeams = 8,
    String? uniformType,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: genderType,
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    uniformType: uniformType,
  );

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

  TournamentPartnerInvite convite({
    String id = 'convite-1',
    String tournamentId = 't1',
    String categoryId = 'masc',
    String inviterUid = 'atleta-9',
    String inviteeUid = meuUid,
    String status = 'pending',
    String? registrationId,
  }) => TournamentPartnerInvite(
    id: id,
    tournamentId: tournamentId,
    categoryId: categoryId,
    inviterUid: inviterUid,
    inviterName: 'Bia Nunes',
    inviteeUid: inviteeUid,
    inviteeName: 'Eu Mesmo',
    status: status,
    registrationId: registrationId,
    createdAt: DateTime(2026, 8, 1),
    expiresAt: DateTime(2027, 1, 1),
  );

  /// Convite que EU enviei: só troca quem é convidante e quem é convidado.
  TournamentPartnerInvite conviteEnviado({
    String id = 'convite-enviado-1',
    String categoryId = 'masc',
  }) => convite(
    id: id,
    categoryId: categoryId,
    inviterUid: meuUid,
    inviteeUid: 'atleta-9',
  );

  /// Perfil com o nível JÁ travado neste esporte: a folha de confirmação de
  /// nível não é devida, que é o caso da maioria dos testes.
  AthleteProfile perfil({bool nivelTravado = true}) => AthleteProfile(
    id: meuUid,
    name: 'Eu Mesmo',
    sport: 'Beach Tennis',
    level: 'Open',
    city: 'Goiânia',
    gender: 'Masculino',
    phoneVerified: true,
    onboardingCompleted: true,
    isProfileComplete: true,
    levelsBySportFirestore: const {'BEACH_TENNIS': 'open'},
    levelLocked: {'BEACH_TENNIS': nivelTravado},
  );

  late List<String> rotasAbertas;
  late Map<String, String>? destinoQueryParams;
  late Map<String, String>? destinoPathParams;

  Future<void> abrirPorteiro(
    WidgetTester tester, {
    required TournamentDetail tournament,
    Stream<TournamentDetail?>? tournamentStream,
    String? categoryId,
    String? registrationId,
    String? inviteId,
    bool lgpdAccepted = false,
    RegistrationWizardStep? requestedStep,
    bool requestedStepWaitingOnly = false,
    AthleteProfile? profile,
    Stream<AthleteProfile?>? profileStream,
    Map<String, UserCategoryRegistration> registrations = const {},
    Stream<TournamentUserRegistrationsByCategory>? registrationsStream,
    List<TournamentPartnerInvite> convitesRecebidos = const [],
    Stream<List<TournamentPartnerInvite>>? convitesRecebidosStream,
    List<TournamentPartnerInvite> convitesEnviados = const [],
    Stream<List<TournamentPartnerInvite>>? convitesEnviadosStream,
    TournamentRegistrationSnapshot? snapshot,
  }) async {
    rotasAbertas = <String>[];
    destinoQueryParams = null;
    destinoPathParams = null;

    GoRoute alvo(String path, String nome, String rotulo) => GoRoute(
      path: path,
      name: nome,
      builder: (_, state) {
        rotasAbertas.add(rotulo);
        destinoQueryParams = Map.of(state.uri.queryParameters);
        destinoPathParams = Map.of(state.pathParameters);
        return Scaffold(body: Text(rotulo));
      },
    );

    final router = GoRouter(
      initialLocation: '/torneios/t1/inscricao',
      routes: [
        GoRoute(
          path: AppRoutes.tournamentRegistration,
          name: AppRouteNames.tournamentRegistration,
          builder: (_, __) => RegistrationGatePage(
            tournamentId: 't1',
            categoryId: categoryId,
            registrationId: registrationId,
            inviteId: inviteId,
            lgpdAccepted: lgpdAccepted,
            requestedStep: requestedStep,
            requestedStepWaitingOnly: requestedStepWaitingOnly,
          ),
        ),
        alvo(
          AppRoutes.tournamentRegistrationCategory,
          AppRouteNames.tournamentRegistrationCategory,
          'categoria',
        ),
        alvo(
          AppRoutes.tournamentCategories,
          AppRouteNames.tournamentCategories,
          'lista de categorias',
        ),
        alvo(
          AppRoutes.tournamentDetail,
          AppRouteNames.tournamentDetail,
          'detalhe do torneio',
        ),
        alvo(
          AppRoutes.tournamentRegistrationConsent,
          AppRouteNames.tournamentRegistrationConsent,
          'consentimento',
        ),
        alvo(
          AppRoutes.tournamentRegistrationTerms,
          AppRouteNames.tournamentRegistrationTerms,
          'condicoes',
        ),
        alvo(
          AppRoutes.tournamentRegistrationPartner,
          AppRouteNames.tournamentRegistrationPartner,
          'parceiro',
        ),
        alvo(
          AppRoutes.tournamentRegistrationUniform,
          AppRouteNames.tournamentRegistrationUniform,
          'uniforme',
        ),
        alvo(
          AppRoutes.tournamentRegistrationPayment,
          AppRouteNames.tournamentRegistrationPayment,
          'pagamento',
        ),
        alvo(
          AppRoutes.tournamentRegistrationDetail,
          AppRouteNames.tournamentRegistrationDetail,
          'sucesso',
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) =>
                Stream.value(MockUser(uid: meuUid, displayName: 'Eu Mesmo')),
          ),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => tournamentStream ?? Stream.value(tournament)),
          athleteProfileProvider.overrideWith(
            (ref) => profileStream ?? Stream.value(profile ?? perfil()),
          ),
          tournamentUserRegistrationsByCategoryProvider('t1').overrideWith(
            (ref) => registrationsStream ?? Stream.value(registrations),
          ),
          pendingTournamentPartnerInvitesProvider.overrideWith(
            (ref) => convitesRecebidosStream ?? Stream.value(convitesRecebidos),
          ),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => convitesEnviadosStream ?? Stream.value(convitesEnviados),
          ),
          // O id da inscrição pode chegar pelo stream (não só pelo parâmetro),
          // então o dublê é do SERVIÇO, não da família de providers.
          tournamentRegistrationServiceProvider.overrideWithValue(
            _FakeRegistrationService(snapshot),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
  }

  // ── Step 1 do brief ──────────────────────────────────────────────────────

  testWidgets('sem categoria na rota abre a LISTA de categorias', (
    tester,
  ) async {
    // A tela 1 do wizard mostra UMA categoria vinda da rota — não é seletor.
    // Mandar para ela sem `categoryId` dava "Categoria não encontrada".
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla(), dupla(id: 'fem', genderType: 'female')]),
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('lista de categorias'));
    expect(rotasAbertas, isNot(contains('categoria')));
  });

  testWidgets('convite recebido abre as condições', (tester) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      convitesRecebidos: [convite()],
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('condicoes'));
    expect(rotasAbertas, isNot(contains('consentimento')));
  });

  testWidgets('inscrição com parceiro pendente ignora step=payment', (
    tester,
  ) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrations: const {
        'masc': UserCategoryRegistration(
          registrationId: 'reg-1',
          isPaid: false,
          partnerPending: true,
        ),
      },
      requestedStep: RegistrationWizardStep.pagamento,
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('parceiro'));
    expect(rotasAbertas, isNot(contains('pagamento')));
  });

  testWidgets('inscrição só devendo pagamento abre o pagamento', (
    tester,
  ) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrations: const {
        'masc': UserCategoryRegistration(
          registrationId: 'reg-1',
          isPaid: false,
          partnerPending: false,
        ),
      },
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('pagamento'));
    expect(destinoQueryParams?['registrationId'], 'reg-1');
    expect(destinoQueryParams?['categoryId'], 'masc');
  });

  testWidgets('não decide enquanto as inscrições não resolveram', (
    tester,
  ) async {
    // Stream que nunca emite: o porteiro tem que esperar, não chutar.
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrationsStream:
          const Stream<TournamentUserRegistrationsByCategory>.empty(),
    );
    await tester.pump();

    expect(rotasAbertas, isEmpty);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  // ── a regra de esperar vale para os TRÊS streams ─────────────────────────

  group('espera todos os streams resolverem', () {
    testWidgets('convites recebidos ainda pendurados seguram a decisão', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        convitesRecebidosStream:
            const Stream<List<TournamentPartnerInvite>>.empty(),
      );
      await tester.pump();

      expect(rotasAbertas, isEmpty);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('convites ENVIADOS ainda pendurados seguram a decisão', (
      tester,
    ) async {
      // Sem esta espera, o atleta com convite em voo cairia no consentimento
      // no primeiro build, antes de o stream dos enviados voltar.
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        convitesEnviadosStream:
            const Stream<List<TournamentPartnerInvite>>.empty(),
      );
      await tester.pump();

      expect(rotasAbertas, isEmpty);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('o loader do porteiro tem Scaffold', (tester) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrationsStream:
            const Stream<TournamentUserRegistrationsByCategory>.empty(),
      );
      await tester.pump();

      expect(
        find.descendant(
          of: find.byType(Scaffold),
          matching: find.byType(CircularProgressIndicator),
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      'inscrição que chega DEPOIS ganha de "primeira categoria livre"',
      (tester) async {
        // O beco sem saída antigo: decidir no primeiro build mandava para a
        // categoria/consentimento e a inscrição solo pendente ficava órfã.
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          registrationsStream: Stream.value(
            const {
              'masc': UserCategoryRegistration(
                registrationId: 'reg-1',
                isPaid: false,
                partnerPending: true,
              ),
            },
          ).asyncMap((value) async {
            await Future<void>.delayed(const Duration(milliseconds: 20));
            return value;
          }),
        );
        await tester.pump();
        expect(rotasAbertas, isEmpty);

        await tester.pump(const Duration(milliseconds: 30));
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('parceiro'));
        expect(rotasAbertas, isNot(contains('consentimento')));
        expect(rotasAbertas, isNot(contains('categoria')));
      },
    );
  });

  // ── correção do brief: convidou e ainda não há inscrição ─────────────────

  group('convite ENVIADO pendente', () {
    testWidgets(
      'sem inscrição e sem lgpd na rota cai no parceiro, não no consentimento',
      (tester) async {
        // Atleta voltando por push/Home depois de convidar: a callable não
        // cria inscrição, o backend só cria no aceite.
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          convitesEnviados: [conviteEnviado()],
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('parceiro'));
        expect(rotasAbertas, isNot(contains('consentimento')));
        expect(rotasAbertas, isNot(contains('condicoes')));
      },
    );

    testWidgets('convite enviado em OUTRA categoria não segura esta', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(), dupla(id: 'fem', genderType: 'female')]),
        categoryId: 'masc',
        convitesEnviados: [conviteEnviado(categoryId: 'fem')],
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('consentimento'));
      expect(rotasAbertas, isNot(contains('parceiro')));
    });

    testWidgets('step=waiting da rota antiga também cai no parceiro', (
      tester,
    ) async {
      // `tournamentRegistrationWaitingParams` manda categoryId + inviteId +
      // step=waiting, sem registrationId — o convite ainda não virou inscrição.
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        inviteId: 'convite-enviado-1',
        requestedStep: registrationStepFromParam('waiting')?.step,
        requestedStepWaitingOnly: true,
        convitesEnviados: [conviteEnviado()],
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('parceiro'));
      expect(destinoQueryParams?['categoryId'], 'masc');
    });
  });

  // ── resolução da categoria ───────────────────────────────────────────────

  group('de onde sai a categoria', () {
    testWidgets('torneio de categoria única dispensa o parâmetro', (
      tester,
    ) async {
      await abrirPorteiro(tester, tournament: torneio([dupla()]));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('consentimento'));
      expect(rotasAbertas, isNot(contains('categoria')));
      expect(destinoQueryParams?['categoryId'], 'masc');
    });

    testWidgets('categoria da rota que não existe no torneio cai na escolha', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(), dupla(id: 'fem', genderType: 'female')]),
        categoryId: 'inexistente',
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('lista de categorias'));
      expect(rotasAbertas, isNot(contains('consentimento')));
    });

    testWidgets('só com registrationId a categoria sai da inscrição', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(), dupla(id: 'fem', genderType: 'female')]),
        registrationId: 'reg-1',
        registrations: const {
          'fem': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('parceiro'));
      expect(rotasAbertas, isNot(contains('categoria')));
      expect(destinoQueryParams?['categoryId'], 'fem');
      expect(destinoQueryParams?['registrationId'], 'reg-1');
    });

    testWidgets('só com inviteId a categoria sai do convite recebido', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(), dupla(id: 'fem', genderType: 'female')]),
        inviteId: 'convite-1',
        convitesRecebidos: [convite(categoryId: 'fem')],
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('condicoes'));
      expect(destinoQueryParams?['categoryId'], 'fem');
    });
  });

  // ── uniforme e sucesso ───────────────────────────────────────────────────

  group('uniforme e sucesso', () {
    TournamentRegistrationSnapshot snap({
      bool isPaid = false,
      TournamentUniformSelection? uniforme,
    }) => TournamentRegistrationSnapshot(
      registrationId: 'reg-1',
      isPaid: isPaid,
      paidAmount: 0,
      player1Id: meuUid,
      participantUids: const [meuUid, 'atleta-2'],
      uniformPlayer1: uniforme,
    );

    testWidgets('categoria com uniforme em branco abre o uniforme', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(uniformType: 'top')]),
        categoryId: 'masc',
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
          ),
        },
        snapshot: snap(),
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('uniforme'));
      expect(rotasAbertas, isNot(contains('pagamento')));
    });

    testWidgets('uniforme já escolhido libera o pagamento', (tester) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(uniformType: 'top')]),
        categoryId: 'masc',
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
          ),
        },
        snapshot: snap(uniforme: const TournamentUniformSelection(sizeTop: 'M')),
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('pagamento'));
      expect(rotasAbertas, isNot(contains('uniforme')));
    });

    testWidgets(
      'inscrição paga e completa abre o detalhe com o id no CAMINHO',
      (tester) async {
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          registrations: const {
            'masc': UserCategoryRegistration(
              registrationId: 'reg-1',
              isPaid: true,
            ),
          },
          snapshot: snap(isPaid: true),
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('sucesso'));
        // O `registrationId` do detalhe é PATH param; mandá-lo na query
        // estouraria com "missing path parameter".
        expect(destinoPathParams?['registrationId'], 'reg-1');
        expect(destinoPathParams?['tournamentId'], 't1');
      },
    );
  });


  // ── fix 1: `step=waiting` não pode derrubar quem já fechou a dupla ───────

  group('`step=waiting` com inscrição já criada', () {
    testWidgets(
      'dupla formada devendo pagamento vai ao PAGAMENTO, não ao parceiro',
      (tester) async {
        // As três entradas reais que mandam `waiting` com inscrição: o aceite
        // do convite, o "convite já aceito" e o card que diz "Pagar inscrição".
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          registrationId: 'reg-1',
          inviteId: 'convite-1',
          registrations: const {
            'masc': UserCategoryRegistration(
              registrationId: 'reg-1',
              isPaid: false,
              partnerPending: false,
            ),
          },
          requestedStep: RegistrationWizardStep.parceiro,
          requestedStepWaitingOnly: true,
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('pagamento'));
        expect(rotasAbertas, isNot(contains('parceiro')));
      },
    );

    testWidgets('dupla formada com uniforme pendente vai ao UNIFORME', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla(uniformType: 'top')]),
        categoryId: 'masc',
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
          ),
        },
        snapshot: TournamentRegistrationSnapshot(
          registrationId: 'reg-1',
          isPaid: false,
          paidAmount: 0,
          player1Id: meuUid,
          participantUids: const [meuUid, 'atleta-2'],
        ),
        requestedStep: RegistrationWizardStep.parceiro,
        requestedStepWaitingOnly: true,
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('uniforme'));
      expect(rotasAbertas, isNot(contains('parceiro')));
    });

    testWidgets('reserva solo ainda esperando parceiro continua no parceiro', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        requestedStep: RegistrationWizardStep.parceiro,
        requestedStepWaitingOnly: true,
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('parceiro'));
    });

    testWidgets('`step=partner` (elenco) segue abrindo o parceiro', (
      tester,
    ) async {
      // `tournamentRegistrationRosterParams` — não caduca com a dupla formada.
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
          ),
        },
        requestedStep: RegistrationWizardStep.parceiro,
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('parceiro'));
      expect(rotasAbertas, isNot(contains('pagamento')));
    });
  });

  // ── fix 2: a folha de confirmação de nível mora na tela 1 ────────────────

  group('folha de confirmação de nível', () {
    testWidgets(
      'nível ainda não travado manda para a TELA 1, não para o consentimento',
      (tester) async {
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          profile: perfil(nivelTravado: false),
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('categoria'));
        expect(rotasAbertas, isNot(contains('consentimento')));
        // Com `categoryId`: a tela 1 mostra UMA categoria, vinda da rota.
        expect(destinoQueryParams?['categoryId'], 'masc');
      },
    );

    testWidgets('nível já travado segue direto para o consentimento', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        profile: perfil(nivelTravado: true),
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('consentimento'));
      expect(rotasAbertas, isNot(contains('categoria')));
    });

    testWidgets('perfil ainda pendurado segura a decisão', (tester) async {
      // `needsLevelConfirmation` trata perfil nulo como "não precisa": decidir
      // antes da 1a emissao pularia o gate em silêncio.
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        profileStream: const Stream<AthleteProfile?>.empty(),
      );
      await tester.pump();

      expect(rotasAbertas, isEmpty);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  // ── fix 3: a rota é autoridade sobre "existe inscrição" ──────────────────

  group('registrationId da rota', () {
    testWidgets(
      'inscrição ausente do mapa (cache atrasado) NÃO vira consentimento',
      (tester) async {
        // O mapa vem de `snapshots()`, que entrega o cache primeiro: logo
        // depois do aceite a inscrição nova pode não estar nele.
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          registrationId: 'reg-1',
          registrations: const {},
          snapshot: TournamentRegistrationSnapshot(
            registrationId: 'reg-1',
            isPaid: false,
            paidAmount: 0,
            player1Id: meuUid,
            participantUids: const [meuUid, 'atleta-2'],
          ),
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('pagamento'));
        expect(rotasAbertas, isNot(contains('consentimento')));
        expect(destinoQueryParams?['registrationId'], 'reg-1');
      },
    );

    testWidgets(
      'sem nem o snapshot no cache, ainda assim não volta ao consentimento',
      (tester) async {
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla()]),
          categoryId: 'masc',
          registrationId: 'reg-1',
          registrations: const {},
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('pagamento'));
        expect(rotasAbertas, isNot(contains('consentimento')));
      },
    );

    testWidgets('o mapa manda quando tem a inscrição da categoria', (
      tester,
    ) async {
      // Rota diz `reg-1`, mapa diz que a inscrição desta categoria é a mesma e
      // está com parceiro pendente — o dado vivo vence.
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrationId: 'reg-1',
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('parceiro'));
      expect(rotasAbertas, isNot(contains('pagamento')));
    });

    testWidgets(
      'registrationId de OUTRA categoria não inventa inscrição nesta',
      (tester) async {
        await abrirPorteiro(
          tester,
          tournament: torneio([dupla(), dupla(id: 'fem', genderType: 'female')]),
          categoryId: 'masc',
          registrationId: 'reg-fem',
          registrations: const {
            'fem': UserCategoryRegistration(
              registrationId: 'reg-fem',
              isPaid: false,
            ),
          },
        );
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('consentimento'));
        expect(rotasAbertas, isNot(contains('pagamento')));
      },
    );
  });

  // ── fix 4: erro é erro, não spinner eterno ──────────────────────────────

  group('erro na porta de entrada', () {
    testWidgets('torneio com erro mostra a tela de erro, não o loader', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        tournamentStream: Stream<TournamentDetail?>.error(
          Exception('sem rede'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Não foi possível abrir a inscrição'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(rotasAbertas, isEmpty);
    });

    testWidgets('inscrições com erro também param o porteiro com saída', (
      tester,
    ) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrationsStream:
            Stream<TournamentUserRegistrationsByCategory>.error(
              Exception('permission-denied'),
            ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Não foi possível abrir a inscrição'), findsOneWidget);
      // "com saída": há o botão de tentar de novo E o de voltar.
      expect(find.text('Tentar novamente'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
    });

    testWidgets('o loader também tem saída', (tester) async {
      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrationsStream:
            const Stream<TournamentUserRegistrationsByCategory>.empty(),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
    });
  });

  // ── uma decisão só por entrada ───────────────────────────────────────────

  testWidgets('snapshot novo do Firestore NÃO reempurra a rota', (
    tester,
  ) async {
    final controller = StreamController<TournamentUserRegistrationsByCategory>();
    addTearDown(controller.close);

    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrationsStream: controller.stream,
    );

    controller.add(const {
      'masc': UserCategoryRegistration(registrationId: 'reg-1', isPaid: false),
    });
    await tester.pumpAndSettle();
    expect(rotasAbertas, ['pagamento']);

    // Segundo snapshot, agora pago: se o porteiro decidisse de novo, empurraria
    // o sucesso por cima da tela que o atleta está usando.
    controller.add(const {
      'masc': UserCategoryRegistration(registrationId: 'reg-1', isPaid: true),
    });
    await tester.pumpAndSettle();

    expect(rotasAbertas, ['pagamento']);
    expect(rotasAbertas, isNot(contains('sucesso')));
  });

  testWidgets(
    'desistir de navegar deixa o portão ABERTO para a decisão seguinte',
    (tester) async {
      // O ramo de `sucesso` desiste quando não há `registrationId` (o detalhe
      // leva o id no caminho). Se o portão fechasse antes dessa desistência,
      // o build seguinte — já com o id — não navegaria e a tela ficaria em
      // loader para sempre.
      final controller =
          StreamController<TournamentUserRegistrationsByCategory>();
      addTearDown(controller.close);

      await abrirPorteiro(
        tester,
        tournament: torneio([dupla()]),
        categoryId: 'masc',
        registrationsStream: controller.stream,
      );

      controller.add(const {
        'masc': UserCategoryRegistration(registrationId: '', isPaid: true),
      });
      // `pumpAndSettle` não serve aqui: o porteiro fica no loader, e o
      // `CircularProgressIndicator` agenda frames para sempre.
      await tester.pump();
      await tester.pump();
      expect(rotasAbertas, isEmpty);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      controller.add(const {
        'masc': UserCategoryRegistration(registrationId: 'reg-1', isPaid: true),
      });
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('sucesso'));
      expect(destinoPathParams?['registrationId'], 'reg-1');
    },
  );

  testWidgets('o passo pedido JÁ liberado é obedecido', (tester) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla(uniformType: 'top')]),
      categoryId: 'masc',
      registrations: const {
        'masc': UserCategoryRegistration(
          registrationId: 'reg-1',
          isPaid: false,
        ),
      },
      snapshot: TournamentRegistrationSnapshot(
        registrationId: 'reg-1',
        isPaid: false,
        paidAmount: 0,
        player1Id: meuUid,
        participantUids: const [meuUid, 'atleta-2'],
        uniformPlayer1: const TournamentUniformSelection(sizeTop: 'M'),
      ),
      requestedStep: RegistrationWizardStep.uniforme,
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('uniforme'));
    expect(rotasAbertas, isNot(contains('pagamento')));
  });
}

/// Dublê de `TournamentRegistrationService`: devolve o snapshot do teste para
/// o id dele e `null` para qualquer outro, sem tocar no Firestore.
class _FakeRegistrationService implements TournamentRegistrationService {
  _FakeRegistrationService(this._snapshot);

  final TournamentRegistrationSnapshot? _snapshot;

  @override
  Stream<TournamentRegistrationSnapshot?> watchRegistration(
    String registrationId,
  ) {
    final snap = _snapshot;
    if (snap == null || snap.registrationId != registrationId) {
      return Stream.value(null);
    }
    return Stream.value(snap);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o porteiro passou a usar este método, cubra-o aqui.',
    );
  }
}
