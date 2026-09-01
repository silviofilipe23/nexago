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
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_partner_page.dart';

/// Testes da tela 4 do wizard de inscrição: parceiro (dupla) ou elenco
/// (equipe trio+).
///
/// O harness segue `registration_terms_page_test.dart` (torneio de uma
/// categoria só, rotas-alvo que capturam o `state` da navegação — não só o
/// nome). Some 3 dublês a mais que lá: `PartnerSearchService` (a tela
/// consome o passo de busca já existente), `authProvider` (o passo de busca
/// lê o uid direto dele, não de `athleteProfileProvider`) e
/// `TournamentRegistrationSnapshot`/`registrationRosterProfilesProvider`
/// (variante "equipe com inscrição").
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

  TournamentCategoryOffer equipe({
    String id = 'quarteto',
    String name = 'Quarteto Livre',
    int teamSize = 4,
    double entryFee = 400,
    int maxTeams = 8,
    String? uniformType,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: '',
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    teamSize: teamSize,
    uniformType: uniformType,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    String name = 'Copa de Teste',
    bool requireFormedPair = false,
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
    requireFormedPair: requireFormedPair,
  );

  AthleteProfile perfil({String gender = 'Masculino'}) => AthleteProfile(
    id: meuUid,
    name: 'Eu Mesmo',
    sport: 'Beach Tennis',
    level: 'Open',
    city: 'Goiânia',
    gender: gender,
    phoneVerified: true,
    onboardingCompleted: true,
    isProfileComplete: true,
    levelsBySportFirestore: const {'BEACH_TENNIS': 'open'},
    levelLocked: const {'BEACH_TENNIS': true},
  );

  late List<String> rotasAbertas;
  late Map<String, String>? destinoQueryParams;
  late _FakeInviteService servico;
  late _FakePartnerSearchService busca;

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
    String categoryId = 'masc',
    String? registrationId,
    bool lgpdAccepted = true,
    List<AppUserProfile> resultadosBusca = const [],
    Map<String, AppUserProfile> perfisElenco = const {},
    List<TournamentPartnerInvite> convitesEnviados = const [],
    TournamentRegistrationSnapshot? snapshot,
    AthleteProfile? profile,
  }) async {
    // Tela alta o bastante pra montar o passo de busca inteiro (o viewport
    // padrão do teste corta antes disso, como nas telas irmãs).
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    rotasAbertas = <String>[];
    destinoQueryParams = null;
    servico = _FakeInviteService();
    busca = _FakePartnerSearchService(resultadosBusca);

    final router = GoRouter(
      initialLocation: '/inscricao',
      routes: [
        GoRoute(
          path: '/inscricao',
          // `Consumer` "esquenta" o `authProvider` (StreamProvider) já no 1º
          // build: o dublê de `athleteProfileProvider` NÃO passa por
          // `authProvider` (o override substitui a implementação inteira),
          // então sem isto o `ref.read(authProvider)` que
          // `TournamentRegistrationPartnerStep._runPartnerSearch` dispara no
          // debounce bate num `AsyncLoading` e o uid sai vazio — mesma
          // armadilha documentada em `tournament_substitution_pick_page_test.dart`.
          builder: (_, __) => Consumer(
            builder: (context, ref, __) {
              ref.watch(authProvider);
              return RegistrationPartnerPage(
                tournamentId: 't1',
                categoryId: categoryId,
                registrationId: registrationId,
                lgpdAccepted: lgpdAccepted,
              );
            },
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao',
          name: AppRouteNames.tournamentRegistration,
          builder: (_, state) {
            rotasAbertas.add('inscrição');
            destinoQueryParams = Map.of(state.uri.queryParameters);
            return const Scaffold(body: Text('inscrição'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/uniforme',
          name: AppRouteNames.tournamentRegistrationUniform,
          builder: (_, state) {
            rotasAbertas.add('uniforme');
            destinoQueryParams = Map.of(state.uri.queryParameters);
            return const Scaffold(body: Text('uniforme'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/pagamento',
          name: AppRouteNames.tournamentRegistrationPayment,
          builder: (_, state) {
            rotasAbertas.add('pagamento');
            destinoQueryParams = Map.of(state.uri.queryParameters);
            return const Scaffold(body: Text('pagamento'));
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
      ],
    );
    addTearDown(router.dispose);

    final regId = registrationId;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(MockUser(uid: meuUid, displayName: 'Eu Mesmo')),
          ),
          athleteProfileProvider.overrideWith(
            (ref) => Stream.value(profile ?? perfil()),
          ),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          tournamentPartnerInviteServiceProvider.overrideWithValue(servico),
          partnerSearchServiceProvider.overrideWithValue(busca),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(convitesEnviados),
          ),
          registrationRosterProfilesProvider.overrideWith(
            (ref, uids) async => perfisElenco,
          ),
          if (regId != null)
            tournamentRegistrationSnapshotProvider(
              regId,
            ).overrideWith((ref) => Stream.value(snapshot)),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Digita a busca e espera o debounce (350ms) + a resposta do dublê.
  Future<void> buscar(WidgetTester tester, String query) async {
    await tester.enterText(find.byType(TextField).first, query);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
  }

  // ── Step 1 do brief: os 3 testes que abrem a task ────────────────────────

  testWidgets('abre sem listar atletas e pede 3 letras', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(
      find.text('Digite ao menos 3 letras do nome ou do @ para buscar.'),
      findsOneWidget,
    );
    expect(busca.chamadas, isEmpty);
  });

  testWidgets('CTA fica travado enquanto nenhum atleta é escolhido', (
    tester,
  ) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
  });

  testWidgets('equipe trio+ mostra o elenco em vez do convite único', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([equipe(teamSize: 4)]),
      categoryId: 'quarteto',
    );

    expect(find.textContaining('Elenco'), findsOneWidget);
  });

  // ── variante dupla ───────────────────────────────────────────────────────

  group('dupla', () {
    testWidgets(
      'escolher o parceiro destrava o CTA com o primeiro nome dele',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()]),
          resultadosBusca: [
            const AppUserProfile(
              uid: 'parceiro-1',
              fullName: 'Bruno Alves',
              gender: 'Masculino',
            ),
          ],
        );

        await buscar(tester, 'bru');
        await tester.tap(find.text('Bruno Alves'));
        await tester.pumpAndSettle();

        expect(find.text('Convidar Bruno'), findsOneWidget);
        final botao = tester.widget<FilledButton>(find.byType(FilledButton));
        expect(botao.onPressed, isNotNull);
      },
    );

    testWidgets(
      'confirmar dispara sendInvite com o aceite LGPD e sem registrationId '
      'volta para a tela guarda-chuva (convite nasce sem inscrição própria)',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()]),
          lgpdAccepted: true,
          resultadosBusca: [
            const AppUserProfile(uid: 'parceiro-1', fullName: 'Bruno Alves', gender: 'Masculino'),
          ],
        );

        await buscar(tester, 'bru');
        await tester.tap(find.text('Bruno Alves'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Convidar Bruno'));
        await tester.pumpAndSettle();

        expect(servico.sendInviteCalls, hasLength(1));
        final chamada = servico.sendInviteCalls.single;
        expect(chamada.tournamentId, 't1');
        expect(chamada.categoryId, 'masc');
        expect(chamada.inviteeUid, 'parceiro-1');
        expect(chamada.inviteeName, 'Bruno Alves');
        expect(chamada.lgpdAccepted, isTrue);

        expect(rotasAbertas, contains('inscrição'));
        // A promessa do nome do teste é NÃO viajar um registrationId
        // inventado — o teste falharia se o código chutasse um id qualquer.
        expect(destinoQueryParams?.containsKey('registrationId'), isFalse);
        expect(destinoQueryParams?['categoryId'], 'masc');
      },
    );

    testWidgets('sem aceite LGPD, sendInvite recebe lgpdAccepted false', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        lgpdAccepted: false,
        resultadosBusca: [
          const AppUserProfile(uid: 'parceiro-1', fullName: 'Bruno Alves', gender: 'Masculino'),
        ],
      );

      await buscar(tester, 'bru');
      await tester.tap(find.text('Bruno Alves'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Convidar Bruno'));
      await tester.pumpAndSettle();

      expect(servico.sendInviteCalls.single.lgpdAccepted, isFalse);
    });

    testWidgets(
      'convidado com cadastro incompleto avisa o convidante em vez do '
      'snackbar padrão',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()]),
          resultadosBusca: [
            const AppUserProfile(
              uid: 'parceiro-1',
              fullName: 'Bruno Alves',
              gender: 'Masculino',
            ),
          ],
        );
        servico.sendInviteResult = const TournamentPartnerInviteSendResult(
          inviteId: 'convite-novo',
          inviteeProfileReady: false,
          inviteeMissingSteps: ['WhatsApp'],
        );

        await buscar(tester, 'bru');
        await tester.tap(find.text('Bruno Alves'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Convidar Bruno'));
        await tester.pumpAndSettle();

        expect(
          find.text(
            'Convite enviado! Avise Bruno: falta completar WhatsApp no '
            'perfil para poder aceitar.',
          ),
          findsOneWidget,
        );
        expect(find.text('Convite enviado para Bruno.'), findsNothing);
        // O convite foi enviado de verdade (não é caminho de erro) — segue
        // navegando normalmente, mesma regra de sucesso das outras variantes.
        expect(rotasAbertas, contains('inscrição'));
      },
    );

    testWidgets(
      'torneio SEM dupla obrigatória mostra a reserva solo, e ela navega '
      'para o uniforme quando a categoria exige',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([
            dupla(uniformType: 'full'),
          ], requireFormedPair: false),
          lgpdAccepted: true,
        );

        expect(find.text('Sem dupla aqui? Garanta sua vaga'), findsOneWidget);

        await tester.tap(find.text('Sem dupla aqui? Garanta sua vaga'));
        await tester.pumpAndSettle();

        expect(servico.soloCalls, hasLength(1));
        expect(servico.soloCalls.single.lgpdAccepted, isTrue);
        expect(rotasAbertas, contains('uniforme'));
        expect(destinoQueryParams?['registrationId'], 'reg-solo');
        expect(destinoQueryParams?['categoryId'], 'masc');
      },
    );

    testWidgets(
      'reserva solo sem uniforme exigido navega direto para o pagamento',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()], requireFormedPair: false),
        );

        await tester.tap(find.text('Sem dupla aqui? Garanta sua vaga'));
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('pagamento'));
        expect(rotasAbertas, isNot(contains('uniforme')));
      },
    );

    testWidgets(
      'torneio com dupla obrigatória NÃO mostra a reserva solo',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()], requireFormedPair: true),
        );

        expect(find.text('Sem dupla aqui? Garanta sua vaga'), findsNothing);
      },
    );

    testWidgets(
      'erro da callable mostra o feedback e NÃO navega',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()], requireFormedPair: false),
        );
        // Mensagem que casa com `isRegistrationConflict`
        // (`TournamentPartnerInviteException`) — o erro vira página de
        // ALERTA (`pushAlertFeedback`), não snackbar. As duas metades do
        // nome do teste precisam de asserção: "mostra o feedback" é o
        // título+descrição da página; "NÃO navega" é `rotasAbertas` vazio.
        servico.erroSolo = TournamentPartnerInviteException(
          'Você já possui inscrição nesta categoria.',
        );

        await tester.tap(find.text('Sem dupla aqui? Garanta sua vaga'));
        await tester.pumpAndSettle();

        expect(find.text('Inscrição indisponível'), findsOneWidget);
        expect(
          find.text('Você já possui inscrição nesta categoria.'),
          findsOneWidget,
        );
        expect(rotasAbertas, isEmpty);
      },
    );
  });

  // ── variante equipe SEM inscrição ───────────────────────────────────────

  group('equipe sem inscrição', () {
    testWidgets('mostra o campo de nome da equipe, não o passo de busca', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        categoryId: 'quarteto',
      );

      expect(find.text('Nome da equipe'), findsOneWidget);
      expect(
        find.text('Digite ao menos 3 letras do nome ou do @ para buscar.'),
        findsNothing,
      );
      expect(find.text('Criar equipe'), findsOneWidget);
    });

    testWidgets('nome curto demais barra o envio com aviso, sem chamar a callable', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        categoryId: 'quarteto',
      );

      await tester.enterText(find.byType(TextField), 'AB');
      await tester.tap(find.text('Criar equipe'));
      await tester.pumpAndSettle();

      expect(
        find.text('Dê um nome de 3 a 30 caracteres para criar a equipe.'),
        findsOneWidget,
      );
      expect(servico.createTeamCalls, isEmpty);
      expect(rotasAbertas, isEmpty);
    });

    testWidgets(
      'nome válido cria a equipe com o aceite LGPD e navega com o '
      'registrationId devolvido pela callable',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([equipe(uniformType: 'full')]),
          categoryId: 'quarteto',
          lgpdAccepted: true,
        );

        await tester.enterText(find.byType(TextField), 'Areia Fera');
        await tester.tap(find.text('Criar equipe'));
        await tester.pumpAndSettle();

        expect(servico.createTeamCalls, hasLength(1));
        final chamada = servico.createTeamCalls.single;
        expect(chamada.tournamentId, 't1');
        expect(chamada.categoryId, 'quarteto');
        expect(chamada.teamName, 'Areia Fera');
        expect(chamada.lgpdAccepted, isTrue);

        expect(rotasAbertas, contains('uniforme'));
        expect(destinoQueryParams?['registrationId'], 'reg-equipe-nova');
      },
    );
  });

  // ── variante equipe COM inscrição ───────────────────────────────────────

  group('equipe com inscrição', () {
    TournamentRegistrationSnapshot snap({int pendingSlotsFilled = 0}) =>
        TournamentRegistrationSnapshot(
          registrationId: 'reg-equipe',
          isPaid: false,
          paidAmount: 0,
          teamName: 'Areia Fera',
          teamSize: 4,
          captainUid: meuUid,
          participantUids: [
            meuUid,
            'atleta-2',
            if (pendingSlotsFilled >= 1) 'atleta-3',
            if (pendingSlotsFilled >= 2) 'atleta-4',
          ],
        );

    testWidgets('mostra o elenco atual acima do passo de convite', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([equipe()]),
        categoryId: 'quarteto',
        registrationId: 'reg-equipe',
        snapshot: snap(),
        perfisElenco: {
          meuUid: const AppUserProfile(uid: meuUid, fullName: 'Eu Mesmo'),
          'atleta-2': const AppUserProfile(
            uid: 'atleta-2',
            fullName: 'Carlos Dias',
            gender: 'Masculino',
          ),
        },
      );

      expect(find.text('Areia Fera'), findsOneWidget);
      expect(find.text('Carlos Dias'), findsOneWidget);
      expect(find.text('2 VAGAS'), findsOneWidget);

      final botao = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(botao.onPressed, isNull);
    });

    testWidgets(
      'elenco completo esconde o passo de busca e trava o CTA',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([equipe()]),
          categoryId: 'quarteto',
          registrationId: 'reg-equipe',
          snapshot: snap(pendingSlotsFilled: 2),
        );

        expect(find.text('ELENCO COMPLETO'), findsOneWidget);
        expect(
          find.text('Elenco completo — não há mais vagas para convidar.'),
          findsOneWidget,
        );
        expect(
          find.text('Digite ao menos 3 letras do nome ou do @ para buscar.'),
          findsNothing,
        );
        // "trava o CTA": sem o passo de busca não há como selecionar
        // ninguém, então o botão fica desabilitado — mesma asserção forte
        // do teste "CTA fica travado..." acima, não só o texto do aviso.
        final botao = tester.widget<FilledButton>(find.byType(FilledButton));
        expect(botao.onPressed, isNull);
      },
    );

    testWidgets(
      'convidar mais um integrante anexa à inscrição do capitão (o '
      'registrationId já conhecido, não um novo)',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([equipe()]),
          categoryId: 'quarteto',
          registrationId: 'reg-equipe',
          snapshot: snap(),
          resultadosBusca: [
            const AppUserProfile(
              uid: 'parceiro-3',
              fullName: 'Dani Souza',
              gender: 'Feminino',
            ),
          ],
        );

        await buscar(tester, 'dan');
        await tester.tap(find.text('Dani Souza'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Convidar para a equipe'));
        await tester.pumpAndSettle();

        expect(servico.sendInviteCalls, hasLength(1));
        final chamada = servico.sendInviteCalls.single;
        expect(chamada.categoryId, 'quarteto');
        expect(chamada.inviteeUid, 'parceiro-3');

        // Ao contrário da dupla "no vácuo", aqui JÁ existe inscrição — o
        // sucesso usa o id que a tela já tinha, não um vindo da callable
        // (que nem devolve `registrationId`).
        expect(rotasAbertas, contains('pagamento'));
        expect(destinoQueryParams?['registrationId'], 'reg-equipe');
      },
    );
  });
}

/// Dublê de `TournamentPartnerInviteService`: registra as chamadas em vez de
/// tocar no Firebase. Mesmo padrão de `registration_terms_page_test.dart`.
class _FakeInviteService implements TournamentPartnerInviteService {
  final sendInviteCalls =
      <
        ({
          String tournamentId,
          String categoryId,
          String inviteeUid,
          String inviteeName,
          bool lgpdAccepted,
        })
      >[];
  final soloCalls =
      <({String tournamentId, String categoryId, bool lgpdAccepted})>[];
  final createTeamCalls =
      <
        ({
          String tournamentId,
          String categoryId,
          String teamName,
          bool lgpdAccepted,
        })
      >[];

  TournamentPartnerInviteException? erroSolo;

  /// Resultado que `sendInvite` devolve — sobrescrevível para exercitar o
  /// convidado com cadastro incompleto (`inviteeProfileReady: false`).
  TournamentPartnerInviteSendResult sendInviteResult =
      const TournamentPartnerInviteSendResult(
        inviteId: 'convite-novo',
        inviteeProfileReady: true,
        inviteeMissingSteps: [],
      );

  @override
  Future<TournamentPartnerInviteSendResult> sendInvite({
    required String tournamentId,
    required String categoryId,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
    dynamic inviterUniform,
    bool lgpdAccepted = false,
  }) async {
    sendInviteCalls.add((
      tournamentId: tournamentId,
      categoryId: categoryId,
      inviteeUid: inviteeUid,
      inviteeName: inviteeName,
      lgpdAccepted: lgpdAccepted,
    ));
    return sendInviteResult;
  }

  @override
  Future<String> registerSolo({
    required String tournamentId,
    required String categoryId,
    dynamic uniform,
    bool lgpdAccepted = false,
  }) async {
    final erro = erroSolo;
    if (erro != null) throw erro;
    soloCalls.add((
      tournamentId: tournamentId,
      categoryId: categoryId,
      lgpdAccepted: lgpdAccepted,
    ));
    return 'reg-solo';
  }

  @override
  Future<({String registrationId, String teamId})> createTeamRegistration({
    required String tournamentId,
    required String categoryId,
    required String teamName,
    dynamic uniform,
    bool lgpdAccepted = false,
  }) async {
    createTeamCalls.add((
      tournamentId: tournamentId,
      categoryId: categoryId,
      teamName: teamName,
      lgpdAccepted: lgpdAccepted,
    ));
    return (registrationId: 'reg-equipe-nova', teamId: 'time-novo');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}

/// Dublê de `PartnerSearchService`: devolve a lista fixa passada no teste.
class _FakePartnerSearchService implements PartnerSearchService {
  _FakePartnerSearchService(this._results);
  final List<AppUserProfile> _results;
  final chamadas = <String>[];

  @override
  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = PartnerSearchService.kFetchLimit,
  }) async {
    chamadas.add(query);
    return _results;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
