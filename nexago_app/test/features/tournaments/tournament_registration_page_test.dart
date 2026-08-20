import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_page.dart';

/// Testes da TELA de inscrição: o que o atleta vê em cada estado e QUAL
/// callable o app dispara com quais argumentos.
///
/// A regra de negócio propriamente dita vive no backend e é coberta pela
/// matriz de integração (`functions/test/registration-*.test.mjs`). Aqui o
/// alvo é a fiação: cartão certo, botão certo, argumento certo.
void main() {
  const meuUid = 'atleta-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    String genderType = 'male',
    double entryFee = 100,
    int maxTeams = 8,
    String? uniformType,
    bool registrationClosed = false,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: genderType,
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    uniformType: uniformType,
    registrationClosed: registrationClosed,
  );

  TournamentCategoryOffer equipe({
    String id = 'quarteto',
    String name = 'Quarteto Misto',
    int teamSize = 4,
    int? men,
    int? women,
    bool genderFree = false,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: 'mixed',
    entryFee: 200,
    maxTeams: 8,
    spotsTotal: 8,
    spotsLeft: 8,
    teamSize: teamSize,
    genderFree: genderFree,
    genderCompositionMen: men,
    genderCompositionWomen: women,
  );

  TournamentDetail torneio(List<TournamentCategoryOffer> categorias) =>
      TournamentDetail(
        id: 't1',
        name: 'Copa de Teste',
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

  AthleteProfile perfil({
    String gender = 'Masculino',
    Map<String, bool> levelLocked = const {'BEACH_TENNIS': true},
  }) => AthleteProfile(
    id: meuUid,
    name: 'João Teste',
    sport: 'Beach Tennis',
    level: 'Open',
    city: 'Goiânia',
    gender: gender,
    phoneVerified: true,
    onboardingCompleted: true,
    isProfileComplete: true,
    levelsBySportFirestore: const {'BEACH_TENNIS': 'open'},
    levelLocked: levelLocked,
  );

  TournamentPartnerInvite convite({
    String categoryId = 'masc',
    bool isTeamInvite = false,
    String? teamName,
  }) => TournamentPartnerInvite(
    id: 'convite-1',
    tournamentId: 't1',
    categoryId: categoryId,
    inviterUid: 'outro',
    inviterName: 'Bia Souza',
    inviteeUid: meuUid,
    inviteeName: 'João Teste',
    status: 'pending',
    createdAt: DateTime.now().subtract(const Duration(hours: 1)),
    expiresAt: DateTime.now().add(const Duration(hours: 20)),
    isTeamInvite: isTeamInvite,
    teamName: teamName,
  );

  TournamentRegistrationSnapshot snapshot({
    String id = 'reg-1',
    bool isPaid = false,
    bool partnerPending = true,
    List<String> participantUids = const [meuUid],
    int? teamSize,
    String? teamName,
    String? captainUid,
    List<String> lgpdAcceptedUids = const [meuUid],
    List<String> sharePaidUids = const [],
  }) => TournamentRegistrationSnapshot(
    registrationId: id,
    isPaid: isPaid,
    paidAmount: 0,
    partnerPending: partnerPending,
    participantUids: participantUids,
    teamSize: teamSize,
    teamName: teamName,
    captainUid: captainUid,
    player1Id: participantUids.isEmpty ? null : participantUids.first,
    lgpdAcceptedUids: lgpdAcceptedUids,
    sharePaidUids: sharePaidUids,
  );

  late _FakeInviteService servico;
  late List<String> rotasAbertas;

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
    Map<String, UserCategoryRegistration> registrations = const {},
    TournamentRegistrationSnapshot? snap,
    List<TournamentPartnerInvite> convitesRecebidos = const [],
    List<TournamentPartnerInvite> convitesEnviados = const [],
    Map<String, int> inscritosPorCategoria = const {},
    AthleteProfile? profile,
    bool canAccess = true,
    String? initialCategoryId,
  }) async {
    servico = _FakeInviteService();
    rotasAbertas = <String>[];

    final router = GoRouter(
      initialLocation: '/inscricao',
      routes: [
        GoRoute(
          path: '/inscricao',
          builder: (_, __) => TournamentRegistrationPage(
            tournamentId: 't1',
            initialCategoryId: initialCategoryId,
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/pagamento',
          name: AppRouteNames.tournamentRegistrationPayment,
          builder: (_, __) {
            rotasAbertas.add('pagamento');
            return const Scaffold(body: Text('tela de pagamento'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId/minha-inscricao',
          name: AppRouteNames.tournamentMyRegistration,
          builder: (_, __) {
            rotasAbertas.add('minha-inscricao');
            return const Scaffold(body: Text('minha inscrição'));
          },
        ),
        GoRoute(
          path: '/niveis',
          name: AppRouteNames.athleteSportsLevels,
          builder: (_, __) {
            rotasAbertas.add('niveis');
            return const Scaffold(body: Text('níveis'));
          },
        ),
        GoRoute(
          path: '/torneio',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) => const Scaffold(body: Text('detalhe')),
        ),
      ],
    );
    addTearDown(router.dispose);

    final auth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: meuUid, displayName: 'João Teste'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          athleteProfileProvider.overrideWith(
            (ref) => Stream.value(profile ?? perfil()),
          ),
          tournamentAccessStateProvider.overrideWithValue(
            canAccess
                ? const TournamentAccessState(
                    canAccess: true,
                    onboardingCompleted: true,
                    isProfileComplete: true,
                  )
                : TournamentAccessState.locked,
          ),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          tournamentUserRegistrationsByCategoryProvider(
            't1',
          ).overrideWith((ref) => Stream.value(registrations)),
          tournamentCategoryEnrollmentCountsProvider(
            't1',
          ).overrideWith((ref) => Stream.value(inscritosPorCategoria)),
          pendingTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(convitesRecebidos),
          ),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(convitesEnviados),
          ),
          registrationRosterProfilesProvider.overrideWith(
            (ref, uids) async => <String, AppUserProfile>{},
          ),
          tournamentPartnerInviteServiceProvider.overrideWithValue(servico),
          if (snap != null)
            tournamentRegistrationSnapshotProvider(
              snap.registrationId,
            ).overrideWith((ref) => Stream.value(snap)),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> marcarLgpd(WidgetTester tester) async {
    await tester.tap(find.byType(Checkbox).first);
    await tester.pumpAndSettle();
  }

  group('dupla — sem inscrição', () {
    testWidgets('mostra o CTA de reservar a vaga', (tester) async {
      await abrirTela(tester, tournament: torneio([dupla()]));

      expect(find.text('Reservar minha vaga'), findsOneWidget);
      expect(find.text('Criar equipe'), findsNothing);
      expect(find.text('Nome da equipe'), findsNothing);
    });

    testWidgets('sem aceitar o termo, o app não chama o servidor', (
      tester,
    ) async {
      await abrirTela(tester, tournament: torneio([dupla()]));

      await tester.tap(find.text('Reservar minha vaga'));
      await tester.pumpAndSettle();

      expect(servico.soloCalls, isEmpty);
      expect(find.textContaining('Marque o aceite do termo'), findsOneWidget);
    });

    testWidgets('com o termo aceito, reserva a vaga na categoria escolhida', (
      tester,
    ) async {
      await abrirTela(tester, tournament: torneio([dupla()]));

      await marcarLgpd(tester);
      await tester.tap(find.text('Reservar minha vaga'));
      await tester.pumpAndSettle();

      expect(servico.soloCalls, hasLength(1));
      expect(servico.soloCalls.single.tournamentId, 't1');
      expect(servico.soloCalls.single.categoryId, 'masc');
      expect(
        servico.soloCalls.single.lgpdAccepted,
        isTrue,
        reason: 'o aceite tem de viajar com a reserva',
      );
    });

    testWidgets('perfil sem acesso a torneios desabilita o CTA', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        canAccess: false,
      );

      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Reservar minha vaga'),
      );
      expect(botao.onPressed, isNull);
    });

    testWidgets('categoria encerrada bloqueia o CTA e mostra o selo', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(registrationClosed: true)]),
      );

      expect(find.text('ENCERRADA'), findsWidgets);
      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Reservar minha vaga'),
      );
      expect(botao.onPressed, isNull);
    });

    testWidgets('categoria lotada pela contagem real bloqueia o CTA', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(maxTeams: 2)]),
        inscritosPorCategoria: const {'masc': 2},
      );

      expect(find.text('LOTADO'), findsWidgets);
      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Reservar minha vaga'),
      );
      expect(botao.onPressed, isNull);
    });

    testWidgets('gênero incompatível bloqueia o CTA', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        profile: perfil(gender: 'Feminino'),
      );

      expect(find.text('GÊNERO'), findsWidgets);
      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Reservar minha vaga'),
      );
      expect(botao.onPressed, isNull);
    });

    testWidgets('nível ainda não travado abre a confirmação antes de reservar', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        profile: perfil(levelLocked: const {}),
      );

      await marcarLgpd(tester);
      await tester.tap(find.text('Reservar minha vaga'));
      await tester.pumpAndSettle();

      expect(
        servico.soloCalls,
        isEmpty,
        reason: 'a reserva espera a confirmação de nível',
      );
      expect(find.textContaining('nível'), findsWidgets);
    });
  });

  group('equipe — sem inscrição', () {
    testWidgets('quarteto pede nome da equipe em vez de reservar vaga', (
      tester,
    ) async {
      await abrirTela(tester, tournament: torneio([equipe()]));

      expect(find.text('Criar equipe'), findsOneWidget);
      expect(find.text('Nome da equipe'), findsOneWidget);
      expect(find.text('Reservar minha vaga'), findsNothing);
      expect(find.textContaining('Categoria de quarteto'), findsOneWidget);
    });

    testWidgets('nome curto não chega ao servidor', (tester) async {
      await abrirTela(tester, tournament: torneio([equipe()]));

      await tester.enterText(find.byType(TextField).first, 'AB');
      await marcarLgpd(tester);
      await tester.tap(find.text('Criar equipe'));
      await tester.pumpAndSettle();

      expect(servico.teamCalls, isEmpty);
      expect(find.textContaining('3 a 30 caracteres'), findsOneWidget);
    });

    testWidgets('nome válido cria a equipe com o nome digitado', (
      tester,
    ) async {
      await abrirTela(tester, tournament: torneio([equipe()]));

      await tester.enterText(find.byType(TextField).first, '  Leões  da Praia ');
      await marcarLgpd(tester);
      await tester.tap(find.text('Criar equipe'));
      await tester.pumpAndSettle();

      expect(servico.teamCalls, hasLength(1));
      expect(
        servico.teamCalls.single.teamName,
        'Leões da Praia',
        reason: 'espaços colapsam antes de sair do app',
      );
      expect(servico.teamCalls.single.categoryId, 'quarteto');
    });

    for (final (teamSize, rotulo) in [
      (3, 'trio'),
      (4, 'quarteto'),
      (5, 'quinteto'),
    ]) {
      testWidgets('$rotulo mostra a copy do próprio formato', (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([equipe(teamSize: teamSize)]),
        );
        expect(find.textContaining('Categoria de $rotulo'), findsOneWidget);
      });
    }
  });

  group('convite recebido', () {
    testWidgets('aceitar e recusar aparecem antes de qualquer inscrição', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convitesRecebidos: [convite()],
      );

      expect(find.text('Aceitar convite'), findsOneWidget);
      expect(find.text('Recusar'), findsOneWidget);
      expect(find.text('Reservar minha vaga'), findsNothing);
      expect(find.textContaining('Bia Souza'), findsWidgets);
    });

    testWidgets('convite de equipe nomeia a equipe na copy', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        convitesRecebidos: [
          convite(
            categoryId: 'quarteto',
            isTeamInvite: true,
            teamName: 'Leões da Praia',
          ),
        ],
      );

      expect(find.textContaining('Leões da Praia'), findsWidgets);
    });

    testWidgets('aceitar sem o termo não chama o servidor', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convitesRecebidos: [convite()],
      );

      await tester.tap(find.text('Aceitar convite'));
      await tester.pumpAndSettle();

      expect(servico.acceptCalls, isEmpty);
      expect(find.textContaining('Marque o aceite do termo'), findsOneWidget);
    });

    testWidgets('aceitar com o termo envia o id do convite', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convitesRecebidos: [convite()],
      );

      await marcarLgpd(tester);
      await tester.tap(find.text('Aceitar convite'));
      await tester.pumpAndSettle();

      expect(servico.acceptCalls, ['convite-1']);
    });

    testWidgets('recusar não exige o termo', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convitesRecebidos: [convite()],
      );

      await tester.tap(find.text('Recusar'));
      await tester.pumpAndSettle();

      expect(servico.declineCalls, ['convite-1']);
    });

    testWidgets('convite de OUTRA categoria não aparece na selecionada', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(), dupla(id: 'fem', name: 'Dupla Feminina')]),
        convitesRecebidos: [convite(categoryId: 'fem')],
        initialCategoryId: 'masc',
      );

      expect(find.text('Aceitar convite'), findsNothing);
      expect(find.text('Reservar minha vaga'), findsOneWidget);
    });
  });

  group('inscrição em andamento', () {
    testWidgets('reserva solo mostra a busca de parceiro', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        snap: snapshot(),
      );

      expect(find.textContaining('Vaga reservada!'), findsOneWidget);
      expect(find.text('Reservar minha vaga'), findsNothing);
    });

    testWidgets('equipe incompleta mostra o elenco e o que falta', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        registrations: const {
          'quarteto': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        snap: snapshot(
          participantUids: const [meuUid, 'outro'],
          teamSize: 4,
          teamName: 'Leões da Praia',
          captainUid: meuUid,
        ),
      );

      expect(find.textContaining('Elenco 2/4'), findsOneWidget);
      expect(find.textContaining('Convide os atletas que faltam'), findsOneWidget);
    });

    testWidgets('integrante que não é capitão vê o elenco sem convidar', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        registrations: const {
          'quarteto': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        snap: snapshot(
          participantUids: const ['capitao', meuUid],
          teamSize: 4,
          teamName: 'Leões da Praia',
          captainUid: 'capitao',
        ),
      );

      expect(
        find.textContaining('O capitão está montando o elenco'),
        findsOneWidget,
      );
      expect(find.text('Sair da equipe'), findsOneWidget);
    });

    testWidgets('capitão não vê a saída da própria equipe', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        registrations: const {
          'quarteto': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        snap: snapshot(
          participantUids: const [meuUid, 'outro'],
          teamSize: 4,
          teamName: 'Leões da Praia',
          captainUid: meuUid,
        ),
      );

      expect(find.text('Sair da equipe'), findsNothing);
    });

    testWidgets('elenco fechado leva ao pagamento', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: false,
          ),
        },
        snap: snapshot(
          partnerPending: false,
          participantUids: const [meuUid, 'parceiro'],
        ),
      );

      expect(find.textContaining('Dupla completa!'), findsOneWidget);
      await tester.tap(find.text('Ir para pagamento'));
      await tester.pumpAndSettle();
      expect(rotasAbertas, contains('pagamento'));
    });

    testWidgets('equipe completa usa a copy de equipe', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        registrations: const {
          'quarteto': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: false,
          ),
        },
        snap: snapshot(
          partnerPending: false,
          participantUids: const [meuUid, 'a', 'b', 'c'],
          teamSize: 4,
        ),
      );

      expect(find.textContaining('Equipe completa!'), findsOneWidget);
    });

    testWidgets('inscrição paga mostra a confirmação', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: true,
            partnerPending: false,
          ),
        },
        snap: snapshot(
          isPaid: true,
          partnerPending: false,
          participantUids: const [meuUid, 'parceiro'],
        ),
      );

      expect(find.textContaining('Inscrição confirmada e paga'), findsOneWidget);
      await tester.tap(find.text('Ver minha inscrição'));
      await tester.pumpAndSettle();
      expect(rotasAbertas, contains('minha-inscricao'));
    });

    testWidgets('convite pendente abre a categoria DELE, não a primeira', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(), equipe()]),
        convitesRecebidos: [
          convite(
            categoryId: 'quarteto',
            isTeamInvite: true,
            teamName: 'Leões da Praia',
          ),
        ],
      );

      // Sem isto, quem foi convidado para o quarteto abria na primeira
      // categoria e não achava o convite em lugar nenhum.
      expect(find.text('Aceitar convite'), findsOneWidget);
      expect(find.textContaining('Leões da Praia'), findsWidgets);
    });

    testWidgets('dupla com convite enviado ainda oferece buscar outro parceiro', (
      tester,
    ) async {
      final enviado = TournamentPartnerInvite(
        id: 'enviado-1',
        tournamentId: 't1',
        categoryId: 'masc',
        inviterUid: meuUid,
        inviterName: 'João Teste',
        inviteeUid: 'candidato',
        inviteeName: 'Pedro Alves',
        status: 'pending',
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(hours: 20)),
      );

      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        snap: snapshot(),
        convitesEnviados: [enviado],
      );

      // Na dupla sempre cabe outro convite: o primeiro aceite fecha a vaga e o
      // backend derruba os demais.
      expect(find.textContaining('Pedro Alves'), findsWidgets);
      expect(find.textContaining('Vaga reservada!'), findsOneWidget);
    });

    testWidgets('a categoria com inscrição abre por padrão, não a primeira', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([
          dupla(),
          dupla(id: 'fem', name: 'Dupla Feminina', genderType: 'female'),
        ]),
        registrations: const {
          'fem': UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
        snap: snapshot(),
      );

      expect(find.text('JÁ INSCRITO'), findsWidgets);
      expect(find.textContaining('Vaga reservada!'), findsOneWidget);
    });
  });

  group('uniforme', () {
    testWidgets('categoria sem uniforme não mostra o cartão', (tester) async {
      await abrirTela(tester, tournament: torneio([dupla()]));

      expect(find.text('Uniforme'), findsNothing);
    });

    testWidgets('categoria com uniforme insere o cartão como passo 2', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(uniformType: 'full')]),
      );

      expect(find.text('Uniforme'), findsOneWidget);
      expect(find.text('Sua inscrição'), findsOneWidget);
    });

    testWidgets('no convite recebido o uniforme mora dentro do aceite', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(uniformType: 'top_only')]),
        convitesRecebidos: [convite()],
      );

      // O cartão próprio de uniforme sai de cena: a escolha viaja no aceite.
      expect(find.text('Uniforme'), findsNothing);
      expect(find.text('Aceitar convite'), findsOneWidget);
    });
  });
}

/// Serviço dublê: registra as chamadas em vez de tocar no Firebase.
class _FakeInviteService implements TournamentPartnerInviteService {
  final soloCalls =
      <({String tournamentId, String categoryId, bool lgpdAccepted})>[];
  final teamCalls =
      <({String tournamentId, String categoryId, String teamName})>[];
  final acceptCalls = <String>[];
  final declineCalls = <String>[];
  final cancelInviteCalls = <String>[];
  final leaveTeamCalls = <String>[];

  @override
  Future<String> registerSolo({
    required String tournamentId,
    required String categoryId,
    TournamentUniformSelection? uniform,
    bool lgpdAccepted = false,
  }) async {
    soloCalls.add((
      tournamentId: tournamentId,
      categoryId: categoryId,
      lgpdAccepted: lgpdAccepted,
    ));
    return 'reg-novo';
  }

  @override
  Future<({String registrationId, String teamId})> createTeamRegistration({
    required String tournamentId,
    required String categoryId,
    required String teamName,
    TournamentUniformSelection? uniform,
    bool lgpdAccepted = false,
  }) async {
    teamCalls.add((
      tournamentId: tournamentId,
      categoryId: categoryId,
      teamName: teamName,
    ));
    return (registrationId: 'reg-novo', teamId: 'team-novo');
  }

  @override
  Future<TournamentPartnerInviteAcceptResult> acceptInvite(
    String inviteId, {
    TournamentUniformSelection? inviteeUniform,
    bool lgpdAccepted = false,
  }) async {
    acceptCalls.add(inviteId);
    return const TournamentPartnerInviteAcceptResult(
      registrationId: 'reg-novo',
      teamId: 'team-novo',
      tournamentId: 't1',
      categoryId: 'masc',
    );
  }

  @override
  Future<void> cancelInvite(String inviteId, {bool asDecline = false}) async {
    (asDecline ? declineCalls : cancelInviteCalls).add(inviteId);
  }

  @override
  Future<void> leaveTeamRegistration(String registrationId) async {
    leaveTeamCalls.add(registrationId);
  }

  @override
  Future<void> setRegistrationUniform({
    required String registrationId,
    required TournamentUniformSelection uniform,
  }) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
