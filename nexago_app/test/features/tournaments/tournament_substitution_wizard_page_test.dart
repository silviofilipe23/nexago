// Widget tests do passo 1 do wizard de substituição (Task 5 da jornada v2):
// título/subtítulo, radios com nome+papel por `replaceableUids`, motivo
// (chip único opcional + nota livre) e a navegação pro passo 2 já carregando
// `replacedUid`/`replacedName`/`reason`/`reasonNote`. Quem pode substituir
// quem já é coberto por `tournament_substitution_logic_test.dart`
// (`substitutionReplaceableUids`) — aqui assume-se `replaceableUids` pronto,
// como a tela real recebe (via `myTournamentRegistrationsProvider` + gate).
//
// Migra a cobertura "radios/nomes" e "revelar passo 2" que antes vivia em
// `tournament_substitution_sheet_test.dart` (sheet aposentado nesta task).
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';
import 'package:nexago_app/features/tournaments/data/recent_partners_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_wizard_page.dart';

void main() {
  const meuUid = 'me';
  const tournamentId = 't1';
  const registrationId = 'reg-1';

  AppUserProfile perfil(String uid, String nome) =>
      AppUserProfile(uid: uid, fullName: nome);

  MyTournamentRegistration inscricao({
    List<String> participantUids = const [meuUid, 'ana', 'bia'],
    int? teamSize,
    String? captainUid,
  }) =>
      MyTournamentRegistration(
        registrationId: registrationId,
        tournamentId: tournamentId,
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada',
        isPaid: true,
        categoryId: 'trio',
        participantUids: participantUids,
        teamSize: teamSize,
        captainUid: captainUid,
        category: TournamentCategoryOffer(
          id: 'trio',
          name: 'Trio Misto',
          entryFee: 150,
          genderType: 'mixed',
          teamSize: teamSize,
        ),
      );

  late _FakeUsersRepository users;
  late _FakeRecentPartnersRepository recentes;

  /// Mesmo padrão de assentamento do sheet antigo: dois `pump()` (gesto +
  /// microtask do `setState`) e um `pump` com duração pra animações finitas
  /// (push/pop de rota, SnackBar) sem usar `pumpAndSettle` — o passo 2 chega
  /// a ter `CircularProgressIndicator` (animação contínua) na busca.
  Future<void> assentar(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> abrirWizard(
    WidgetTester tester, {
    required MyTournamentRegistration registration,
    Map<String, AppUserProfile> perfis = const {},
  }) async {
    users = _FakeUsersRepository(perfis);
    recentes = _FakeRecentPartnersRepository(const []);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(
              MockUser(uid: meuUid, displayName: 'Eu Mesmo'),
            ),
          ),
          myTournamentRegistrationsProvider.overrideWith(
            (ref) => Stream.value([registration]),
          ),
          usersRepositoryProvider.overrideWithValue(users),
          recentPartnersRepositoryProvider.overrideWithValue(recentes),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentSubstitutionWizardPage(
            tournamentId: tournamentId,
            registrationId: registrationId,
          ),
        ),
      ),
    );
    await assentar(tester);
  }

  group('AppBar e headline', () {
    testWidgets('dupla: "Substituir parceiro" + subtítulo torneio · categoria',
        (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana']),
        perfis: {meuUid: perfil(meuUid, 'Eu Mesmo'), 'ana': perfil('ana', 'Ana Souza')},
      );

      expect(find.text('Substituir parceiro'), findsOneWidget);
      expect(find.text('Copa de Teste · Trio Misto'), findsOneWidget);
      expect(find.text('Quem não vai poder jogar?'), findsOneWidget);
      expect(
        find.text(
          'A vaga da dupla continua sua. Só precisamos saber quem sai e '
          'quem entra no lugar.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('equipe: "Substituir atleta" + sub com "equipe"',
        (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(
          participantUids: const [meuUid, 'p2', 'p3'],
          teamSize: 3,
          captainUid: meuUid,
        ),
      );

      expect(find.text('Substituir atleta'), findsOneWidget);
      expect(
        find.text(
          'A vaga da equipe continua sua. Só precisamos saber quem sai e '
          'quem entra no lugar.',
        ),
        findsOneWidget,
      );
    });
  });

  group('radios — nome e papel por replaceableUid', () {
    testWidgets('dupla: uma opção por participante, "Você"/"Sua vaga" + '
        'nome/"Parceiro · confirmado" do parceiro', (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana']),
        perfis: {meuUid: perfil(meuUid, 'Eu Mesmo'), 'ana': perfil('ana', 'Ana Souza')},
      );

      expect(find.byType(RadioListTile<String>), findsNWidgets(2));
      expect(find.text('Você'), findsOneWidget);
      expect(find.text('Sua vaga'), findsOneWidget);
      expect(find.text('Ana Souza'), findsOneWidget);
      expect(find.text('Parceiro · confirmado'), findsOneWidget);
    });

    testWidgets('equipe: só integrantes (nunca o capitão) e papel "Integrante"',
        (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(
          participantUids: const [meuUid, 'p2', 'p3'],
          teamSize: 3,
          captainUid: meuUid,
        ),
        perfis: {
          meuUid: perfil(meuUid, 'Eu Mesmo'),
          'p2': perfil('p2', 'Léo Reis'),
          'p3': perfil('p3', 'Caio Mota'),
        },
      );

      expect(find.byType(RadioListTile<String>), findsNWidgets(2));
      // O capitão (viewer) não pode se auto-substituir na equipe.
      expect(find.text('Você'), findsNothing);
      expect(find.text('Léo Reis'), findsOneWidget);
      expect(find.text('Caio Mota'), findsOneWidget);
      expect(find.text('Integrante'), findsNWidgets(2));
    });

    testWidgets(
        '"Capitão da inscrição" aparece quando a própria vaga é a do captainUid',
        (tester) async {
      // Combinação defensiva: `substitutionReplaceableUids` só olha
      // `captainUid` pra equipe (trio+), mas a copy prevê o rótulo pra
      // qualquer vaga própria marcada como capitã — cobre a UI mesmo que o
      // domínio atual não produza esse caso pra dupla.
      await abrirWizard(
        tester,
        registration: inscricao(
          participantUids: const [meuUid, 'ana'],
          captainUid: meuUid,
        ),
      );

      expect(find.text('Você'), findsOneWidget);
      expect(find.text('Capitão da inscrição'), findsOneWidget);
    });

    testWidgets('perfil não resolvido cai no rótulo genérico "Atleta"',
        (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana']),
        perfis: const {},
      );

      expect(find.text('Atleta'), findsOneWidget);
    });
  });

  group('CTA — habilita com vaga selecionada e revela o passo 2', () {
    testWidgets('CTA desabilitado sem seleção; some ao escolher a vaga',
        (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana']),
        perfis: {meuUid: perfil(meuUid, 'Eu Mesmo'), 'ana': perfil('ana', 'Ana Souza')},
      );

      final ctaAntes = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(ctaAntes.onPressed, isNull);

      await tester.tap(find.text('Ana Souza'));
      await assentar(tester);

      final ctaDepois = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(ctaDepois.onPressed, isNotNull);
    });

    testWidgets(
        'toque no CTA navega pro passo 2 com replacedName e motivo escolhido',
        (tester) async {
      await abrirWizard(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana']),
        perfis: {meuUid: perfil(meuUid, 'Eu Mesmo'), 'ana': perfil('ana', 'Ana Souza')},
      );

      await tester.tap(find.text('Ana Souza'));
      await assentar(tester);

      // Motivo (chip único, opcional).
      await tester.tap(find.text('Lesão'));
      await assentar(tester);

      await tester.tap(find.text('Escolher o substituto →'));
      await assentar(tester);

      expect(find.text('Quem entra no lugar'), findsOneWidget);
      expect(find.text('Saindo: Ana Souza · Lesão'), findsOneWidget);
    });

    testWidgets('"Voltar" faz pop', (tester) async {
      final navigatorKey = GlobalKey<NavigatorState>();
      users = _FakeUsersRepository({meuUid: perfil(meuUid, 'Eu Mesmo')});
      recentes = _FakeRecentPartnersRepository(const []);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => Stream.value(MockUser(uid: meuUid)),
            ),
            myTournamentRegistrationsProvider.overrideWith(
              (ref) => Stream.value([
                inscricao(participantUids: const [meuUid, 'ana']),
              ]),
            ),
            usersRepositoryProvider.overrideWithValue(users),
            recentPartnersRepositoryProvider.overrideWithValue(recentes),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            navigatorKey: navigatorKey,
            home: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const TournamentSubstitutionWizardPage(
                          tournamentId: tournamentId,
                          registrationId: registrationId,
                        ),
                      ),
                    ),
                    child: const Text('abrir'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await assentar(tester);
      await tester.tap(find.text('abrir'));
      await assentar(tester);

      expect(find.text('Quem não vai poder jogar?'), findsOneWidget);

      // `pumpAndSettle` é seguro aqui — nem o wizard nem o "abrir" têm
      // animação contínua; é só a transição de rota do pop assentar.
      await tester.tap(find.text('Voltar'));
      await tester.pumpAndSettle();

      expect(find.text('Quem não vai poder jogar?'), findsNothing);
      expect(find.text('abrir'), findsOneWidget);
    });
  });

  group('fluxo completo — passo 1 até o envio do convite', () {
    testWidgets(
        'vaga + chip de motivo + nota livre do passo 1 chegam no payload do '
        'convite enviado no passo 2', (tester) async {
      users = _FakeUsersRepository({
        meuUid: perfil(meuUid, 'Eu Mesmo'),
        'ana': perfil('ana', 'Ana Souza'),
      });
      recentes = _FakeRecentPartnersRepository(const []);
      final busca = _FakePartnerSearchServiceFluxo([
        perfil('carla', 'Carla Nunes'),
      ]);
      final convites = _FakeSubstitutionInviteServiceFluxo();

      // `GoRouter` real: o envio bem-sucedido no passo 2 chama
      // `context.pushReplacementNamed(tournamentSubstitutionStatus)`
      // (Task 6) — precisa de um `GoRouter` ancestral pra resolver. O
      // destino é um placeholder: a tela de acompanhamento tem cobertura
      // própria em `tournament_substitution_status_page_test.dart`.
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const TournamentSubstitutionWizardPage(
              tournamentId: tournamentId,
              registrationId: registrationId,
            ),
          ),
          GoRoute(
            path: AppRoutes.tournamentSubstitutionStatus,
            name: AppRouteNames.tournamentSubstitutionStatus,
            builder: (context, state) {
              final tId = state.pathParameters['tournamentId'] ?? '';
              final invId = state.pathParameters['inviteId'] ?? '';
              return Scaffold(
                body: Center(child: Text('STATUS $tId/$invId')),
              );
            },
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => Stream.value(
                MockUser(uid: meuUid, displayName: 'Eu Mesmo'),
              ),
            ),
            myTournamentRegistrationsProvider.overrideWith(
              (ref) => Stream.value([
                inscricao(participantUids: const [meuUid, 'ana']),
              ]),
            ),
            usersRepositoryProvider.overrideWithValue(users),
            recentPartnersRepositoryProvider.overrideWithValue(recentes),
            partnerSearchServiceProvider.overrideWithValue(busca),
            tournamentPartnerInviteServiceProvider.overrideWithValue(
              convites,
            ),
          ],
          child:
              MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
        ),
      );
      await assentar(tester);

      // Passo 1: escolhe a vaga, o motivo (chip) e escreve a nota livre.
      await tester.tap(find.text('Ana Souza'));
      await assentar(tester);

      await tester.tap(find.text('Lesão'));
      await assentar(tester);

      await tester.enterText(
        find.byType(TextField),
        'Torceu o tornozelo no treino.',
      );
      await assentar(tester);

      await tester.tap(find.text('Escolher o substituto →'));
      await assentar(tester);

      expect(find.text('Saindo: Ana Souza · Lesão'), findsOneWidget);

      // Passo 2: busca e convida — o campo de busca precisa de um finder
      // específico porque o `TextField` da nota do passo 1 continua montado
      // por baixo (o `Navigator.push` não desmonta a rota anterior).
      final campoBusca = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.hintText == 'Buscar atleta por nome',
      );
      await tester.enterText(campoBusca, 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      await tester.tap(find.text('Convidar'));
      // Sem animação contínua na tela anterior — seguro pra transição do
      // `pushReplacementNamed`.
      await tester.pumpAndSettle();

      expect(convites.chamadas, hasLength(1));
      final chamada = convites.chamadas.single;
      expect(chamada.registrationId, registrationId);
      expect(chamada.replacedUid, 'ana');
      expect(chamada.replacedName, 'Ana Souza');
      expect(chamada.inviteeUid, 'carla');
      expect(chamada.inviteeName, 'Carla Nunes');
      // O motivo escolhido no chip do passo 1...
      expect(chamada.reason, 'lesao');
      // ...e a nota livre digitada no mesmo passo — o alvo desta cobertura:
      // o texto sobrevive à travessia passo 1 → passo 2 → envio.
      expect(chamada.reasonNote, 'Torceu o tornozelo no treino.');

      expect(find.text('STATUS $tournamentId/invite-1'), findsOneWidget);
    });

    // Achado do review v2: o rótulo do rádio da própria vaga é "Você", mas
    // isso é só copy de tela — o payload que vira convite/push/notificação
    // do organizador/`substitutionHistory` precisa do nome de verdade, ou
    // "Você" aparece literal pra quem recebe (ex.: "Entre no lugar de Você").
    testWidgets(
        'autossubstituição: replacedName do payload é o nome real, não '
        '"Você"', (tester) async {
      users = _FakeUsersRepository({
        meuUid: perfil(meuUid, 'Eu Mesmo'),
        'ana': perfil('ana', 'Ana Souza'),
      });
      recentes = _FakeRecentPartnersRepository(const []);
      final busca = _FakePartnerSearchServiceFluxo([
        perfil('carla', 'Carla Nunes'),
      ]);
      final convites = _FakeSubstitutionInviteServiceFluxo();

      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const TournamentSubstitutionWizardPage(
              tournamentId: tournamentId,
              registrationId: registrationId,
            ),
          ),
          GoRoute(
            path: AppRoutes.tournamentSubstitutionStatus,
            name: AppRouteNames.tournamentSubstitutionStatus,
            builder: (context, state) {
              final tId = state.pathParameters['tournamentId'] ?? '';
              final invId = state.pathParameters['inviteId'] ?? '';
              return Scaffold(
                body: Center(child: Text('STATUS $tId/$invId')),
              );
            },
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => Stream.value(
                MockUser(uid: meuUid, displayName: 'Eu Mesmo'),
              ),
            ),
            myTournamentRegistrationsProvider.overrideWith(
              (ref) => Stream.value([
                inscricao(participantUids: const [meuUid, 'ana']),
              ]),
            ),
            usersRepositoryProvider.overrideWithValue(users),
            recentPartnersRepositoryProvider.overrideWithValue(recentes),
            partnerSearchServiceProvider.overrideWithValue(busca),
            tournamentPartnerInviteServiceProvider.overrideWithValue(
              convites,
            ),
          ],
          child:
              MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
        ),
      );
      await assentar(tester);

      // Passo 1: escolhe a PRÓPRIA vaga ("Você").
      await tester.tap(find.text('Você'));
      await assentar(tester);

      await tester.tap(find.text('Escolher o substituto →'));
      await assentar(tester);

      // O header do passo 2 também mostra o nome real — mais claro pro
      // convidante do que "Saindo: Você".
      expect(find.text('Saindo: Eu Mesmo'), findsOneWidget);

      final campoBusca = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.hintText == 'Buscar atleta por nome',
      );
      await tester.enterText(campoBusca, 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      await tester.tap(find.text('Convidar'));
      await tester.pumpAndSettle();

      expect(convites.chamadas, hasLength(1));
      final chamada = convites.chamadas.single;
      expect(chamada.replacedUid, meuUid);
      expect(chamada.replacedName, 'Eu Mesmo');
      expect(chamada.replacedName, isNot('Você'));
    });
  });
}

/// Dublê de `UsersRepository`: só resolve os perfis passados em memória.
class _FakeUsersRepository implements UsersRepository {
  _FakeUsersRepository(this._profiles);
  final Map<String, AppUserProfile> _profiles;

  @override
  Future<Map<String, AppUserProfile>> getUsersByIds(
    Iterable<String> uids,
  ) async {
    final result = <String, AppUserProfile>{};
    for (final uid in uids) {
      final profile = _profiles[uid];
      if (profile != null) result[uid] = profile;
    }
    return result;
  }

  @override
  Future<AppUserProfile?> getUserById(String uid) async => _profiles[uid];

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}

/// Dublê de `RecentPartnersRepository`: devolve a lista fixa passada no teste
/// (o filtro por gênero é responsabilidade do repositório real, coberto em
/// `partner_search_logic_test.dart`).
class _FakeRecentPartnersRepository implements RecentPartnersRepository {
  _FakeRecentPartnersRepository(this._partners);
  final List<AppUserProfile> _partners;

  @override
  Future<List<AppUserProfile>> loadRecentPartners({
    required String currentUserId,
    required String? categoryGenderType,
    int maxProfiles = 12,
  }) async =>
      _partners;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}

/// Dublê de `PartnerSearchService`: só devolve a lista fixa passada no teste
/// (usado no fluxo completo passo 1 → passo 2 → convidar; a lógica de busca
/// em si já é coberta em `tournament_substitution_pick_page_test.dart`).
class _FakePartnerSearchServiceFluxo implements PartnerSearchService {
  _FakePartnerSearchServiceFluxo(this._results);
  final List<AppUserProfile> _results;

  @override
  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = PartnerSearchService.kFetchLimit,
  }) async =>
      _results;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o teste passou a exercitar este método, cubra-o aqui.',
    );
  }
}

/// Dublê de `TournamentPartnerInviteService`: captura o payload do envio no
/// fluxo completo passo 1 → passo 2 → convidar — o alvo é confirmar que
/// `reason`/`reasonNote` escolhidos na UI do passo 1 sobrevivem até aqui.
class _FakeSubstitutionInviteServiceFluxo
    implements TournamentPartnerInviteService {
  final chamadas = <
      ({
        String registrationId,
        String replacedUid,
        String replacedName,
        String inviteeUid,
        String inviteeName,
        String inviterName,
        String? reason,
        String? reasonNote,
      })>[];

  @override
  Future<String> sendSubstitutionInvite({
    required String registrationId,
    required String replacedUid,
    required String replacedName,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
    String? reason,
    String? reasonNote,
  }) async {
    chamadas.add((
      registrationId: registrationId,
      replacedUid: replacedUid,
      replacedName: replacedName,
      inviteeUid: inviteeUid,
      inviteeName: inviteeName,
      inviterName: inviterName,
      reason: reason,
      reasonNote: reasonNote,
    ));
    return 'invite-1';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o teste passou a exercitar este método, cubra-o aqui.',
    );
  }
}
