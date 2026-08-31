// Widget tests do passo 2 do wizard de substituição (Task 5 da jornada v2):
// subtítulo "Saindo: ...", busca (mesma regra do sheet antigo: filtra quem
// já está na inscrição, catch com snackbar padrão), seção "Suas últimas
// duplas" (novo — `RecentPartnersRepository`), envio (`sendSubstitutionInvite`
// com reason/reasonNote, leva pra tela de acompanhamento — Task 6, ver
// `kSubstitutionStatusRouteReady`), erro do backend mantém a página e o
// aviso âmbar de pagamento condicional (`isPaid || hasPartialPayment`).
//
// Migra a cobertura "busca com filtro", "payload do envio", "erro mantém a
// página" e "aviso de pagamento condicional" que antes vivia em
// `tournament_substitution_sheet_test.dart` (sheet aposentado nesta task).
// A página é construída direto (sem passar pelo passo 1): recebe
// `replacedUid`/`replacedName`/`reason`/`reasonNote` prontos, como a rota
// real entrega via push interno.
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
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';
import 'package:nexago_app/features/tournaments/data/recent_partners_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_pick_page.dart';

void main() {
  const meuUid = 'me';

  AppUserProfile perfil(String uid, String nome) =>
      AppUserProfile(uid: uid, fullName: nome);

  MyTournamentRegistration inscricao({
    List<String> participantUids = const [meuUid, 'ana', 'bia'],
    bool isPaid = true,
    bool hasPartialPayment = false,
    int? teamSize,
  }) =>
      MyTournamentRegistration(
        registrationId: 'reg-1',
        tournamentId: 't1',
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada',
        isPaid: isPaid,
        hasPartialPayment: hasPartialPayment,
        categoryId: 'trio',
        participantUids: participantUids,
        teamSize: teamSize,
        category: const TournamentCategoryOffer(
          id: 'trio',
          name: 'Trio Misto',
          entryFee: 150,
          genderType: 'mixed',
        ),
      );

  late _FakeUsersRepository users;
  late _FakePartnerSearchService busca;
  late _FakeRecentPartnersRepository recentes;
  late _FakeSubstitutionInviteService convites;

  /// Dois `pump()` (gesto + microtask do `setState`) e um `pump` com duração
  /// pra animações finitas assentarem — sem `pumpAndSettle`, que trava no
  /// `CircularProgressIndicator` (animação contínua) da busca. Mesmo padrão
  /// do sheet aposentado nesta task.
  Future<void> assentar(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// Monta uma pilha DETALHE → PASSO 1 → passo 2 (a página sob teste), pra
  /// que o caminho de sucesso do envio tenha aonde pousar — espelha a
  /// navegação real (wizard empurrado por cima do detalhe).
  ///
  /// DETALHE vive numa rota de verdade (`GoRouter`), não só num
  /// `MaterialApp.home`: com `kSubstitutionStatusRouteReady` (Task 6), o
  /// envio chama `context.pushReplacementNamed` — que precisa de um
  /// `GoRouter` ancestral pra resolver, mesmo com PASSO 1/passo 2
  /// empilhados por cima via `Navigator.push` imperativo (mesma mecânica da
  /// navegação real).
  Future<void> abrirPick(
    WidgetTester tester, {
    required MyTournamentRegistration registration,
    required String replacedUid,
    required String replacedName,
    String? reason,
    String? reasonNote,
    Map<String, AppUserProfile> perfis = const {},
    List<AppUserProfile> resultadosBusca = const [],
    List<AppUserProfile> parceirosRecentes = const [],
    Object? erroBusca,
    TournamentPartnerInviteException? erroAoEnviar,
  }) async {
    users = _FakeUsersRepository(perfis);
    busca = _FakePartnerSearchService(resultadosBusca, erro: erroBusca);
    recentes = _FakeRecentPartnersRepository(parceirosRecentes);
    convites = _FakeSubstitutionInviteService(erroAoEnviar: erroAoEnviar);
    final navigatorKey = GlobalKey<NavigatorState>();

    final router = GoRouter(
      navigatorKey: navigatorKey,
      initialLocation: '/detalhe',
      routes: [
        GoRoute(
          path: '/detalhe',
          builder: (context, state) => Consumer(
            // `Consumer` "esquenta" o `authProvider` (StreamProvider) já no
            // 1º build: sem isto, o `ref.read(authProvider)` que a página
            // real dispara no `initState` (`_loadInviterProfile`) bate num
            // `AsyncLoading` — na navegação de verdade quem esquenta é o
            // passo 1 (`ref.watch` no `build`), que aqui não existe.
            builder: (context, ref, child) {
              ref.watch(authProvider);
              return child!;
            },
            child: const Scaffold(body: Center(child: Text('DETALHE'))),
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentSubstitutionStatus,
          name: AppRouteNames.tournamentSubstitutionStatus,
          builder: (context, state) {
            final tournamentId =
                state.pathParameters['tournamentId']?.trim() ?? '';
            final inviteId = state.pathParameters['inviteId']?.trim() ?? '';
            return Scaffold(
              body: Center(child: Text('STATUS $tournamentId/$inviteId')),
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
          usersRepositoryProvider.overrideWithValue(users),
          partnerSearchServiceProvider.overrideWithValue(busca),
          recentPartnersRepositoryProvider.overrideWithValue(recentes),
          tournamentPartnerInviteServiceProvider.overrideWithValue(convites),
        ],
        child: MaterialApp.router(
          theme: AppTheme.dark,
          routerConfig: router,
        ),
      ),
    );
    await assentar(tester);

    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Center(child: Text('PASSO 1'))),
      ),
    );
    await assentar(tester);

    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => TournamentSubstitutionPickPage(
          registration: registration,
          replacedUid: replacedUid,
          replacedName: replacedName,
          reason: reason,
          reasonNote: reasonNote,
        ),
      ),
    );
    await assentar(tester);
  }

  group('AppBar — "Saindo: ..."', () {
    testWidgets('sem motivo', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

      expect(find.text('Quem entra no lugar'), findsOneWidget);
      expect(find.text('Saindo: Ana Souza'), findsOneWidget);
    });

    testWidgets('com motivo acrescenta " · {label}"', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        reason: 'trabalho',
      );

      expect(find.text('Saindo: Ana Souza · Trabalho'), findsOneWidget);
    });
  });

  group('busca', () {
    testWidgets('resultado exclui quem já está na inscrição', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana', 'bia']),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        resultadosBusca: [
          // 'bia' já está na inscrição — o serviço a devolve (fake simples),
          // mas a tela precisa filtrá-la do resultado exibido.
          perfil('bia', 'Bia Lima'),
          perfil('carla', 'Carla Nunes'),
        ],
      );

      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      expect(busca.chamadas, hasLength(1));
      expect(busca.chamadas.single.currentUserId, meuUid);
      expect(busca.chamadas.single.categoryGenderType, 'mixed');
      expect(busca.chamadas.single.query, 'car');
      expect(find.text('Bia Lima'), findsNothing);
      expect(find.text('Carla Nunes'), findsOneWidget);
    });

    testWidgets('erro na busca mostra o snackbar padrão e mantém a página',
        (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        erroBusca: Exception('falhou'),
      );

      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      expect(
        find.text('Não foi possível buscar atletas. Tente novamente.'),
        findsOneWidget,
      );
      expect(find.text('Quem entra no lugar'), findsOneWidget);
    });
  });

  group('Suas últimas duplas', () {
    testWidgets('lista os parceiros recentes com "Convidar", excluindo membros',
        (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana', 'bia']),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        parceirosRecentes: [
          // 'bia' já está na inscrição — mesmo exclusão da busca.
          perfil('bia', 'Bia Lima'),
          perfil('duda', 'Duda Prado'),
        ],
      );

      expect(find.text('Suas últimas duplas'), findsOneWidget);
      expect(
        find.text('Atletas com quem você já jogou e que cabem em Trio Misto.'),
        findsOneWidget,
      );
      expect(find.text('Bia Lima'), findsNothing);
      expect(find.text('Duda Prado'), findsOneWidget);
      expect(find.text('Convidar'), findsOneWidget);
    });

    testWidgets('sem parceiros recentes a seção não aparece', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

      expect(find.text('Suas últimas duplas'), findsNothing);
    });
  });

  group('convidar — envio', () {
    testWidgets(
        'sucesso: chama sendSubstitutionInvite com reason/reasonNote e leva '
        'pra tela de acompanhamento', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(participantUids: const [meuUid, 'ana', 'bia']),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        reason: 'lesao',
        reasonNote: 'Torceu o tornozelo.',
        perfis: {meuUid: perfil(meuUid, 'Eu Mesmo')},
        resultadosBusca: [perfil('carla', 'Carla Nunes')],
      );

      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      await tester.tap(find.text('Convidar'));
      // Sem animação contínua na tela anterior (o spinner da busca já não
      // está ativo aqui) — `pumpAndSettle` é seguro pra transição do
      // `pushReplacementNamed`.
      await tester.pumpAndSettle();

      expect(convites.chamadas, hasLength(1));
      final chamada = convites.chamadas.single;
      expect(chamada.registrationId, 'reg-1');
      expect(chamada.replacedUid, 'ana');
      expect(chamada.replacedName, 'Ana Souza');
      expect(chamada.inviteeUid, 'carla');
      expect(chamada.inviteeName, 'Carla Nunes');
      expect(chamada.inviterName, 'Eu Mesmo');
      expect(chamada.reason, 'lesao');
      expect(chamada.reasonNote, 'Torceu o tornozelo.');

      // `kSubstitutionStatusRouteReady` (Task 6, agora `true`): o envio leva
      // direto pra rota de acompanhamento com o `tournamentId`/`inviteId`
      // certos — nada de pop duplo nem snackbar (esse era o comportamento
      // só enquanto a rota não existia, Task 5).
      expect(find.text('STATUS t1/invite-1'), findsOneWidget);
      expect(find.text('DETALHE'), findsNothing);
      expect(find.text('PASSO 1'), findsNothing);
      expect(find.text('Quem entra no lugar'), findsNothing);
    });

    testWidgets('erro do backend mantém a página e mostra a mensagem',
        (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        perfis: {meuUid: perfil(meuUid, 'Eu Mesmo')},
        resultadosBusca: [perfil('carla', 'Carla Nunes')],
        erroAoEnviar: TournamentPartnerInviteException(
          'Convite de substituição não pôde ser criado.',
        ),
      );

      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      await tester.tap(find.text('Convidar'));
      await assentar(tester);

      expect(convites.chamadas, hasLength(1));
      // Nada de pop no caminho de erro — a página continua aberta.
      expect(find.text('Quem entra no lugar'), findsOneWidget);
      expect(
        find.text('Convite de substituição não pôde ser criado.'),
        findsOneWidget,
      );
    });
  });

  group('aviso de pagamento (âmbar)', () {
    const texto =
        'O substituto entra sem pagar de novo — a inscrição da dupla já '
        'está quitada. O acerto com Ana Souza é entre vocês.';

    testWidgets('aparece quando isPaid', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(isPaid: true, hasPartialPayment: false),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

      expect(find.text(texto), findsOneWidget);
    });

    testWidgets('aparece quando hasPartialPayment (mesmo sem isPaid)',
        (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(isPaid: false, hasPartialPayment: true),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

      expect(find.text(texto), findsOneWidget);
    });

    testWidgets('some quando nem isPaid nem hasPartialPayment', (tester) async {
      await abrirPick(
        tester,
        registration: inscricao(isPaid: false, hasPartialPayment: false),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

      expect(find.text(texto), findsNothing);
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

/// Dublê de `PartnerSearchService`: registra a chamada e devolve a lista fixa
/// passada no teste (ou lança [erro], quando configurado, pra exercitar o
/// catch da busca).
class _FakePartnerSearchService implements PartnerSearchService {
  _FakePartnerSearchService(this._results, {this.erro});
  final List<AppUserProfile> _results;
  final Object? erro;
  final chamadas =
      <({String currentUserId, String? categoryGenderType, String query})>[];

  @override
  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = PartnerSearchService.searchResultLimit,
  }) async {
    chamadas.add((
      currentUserId: currentUserId,
      categoryGenderType: categoryGenderType,
      query: query,
    ));
    final erroConfigurado = erro;
    if (erroConfigurado != null) throw erroConfigurado;
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

/// Dublê de `RecentPartnersRepository`: devolve a lista fixa passada no
/// teste (o filtro por gênero é responsabilidade do repositório real,
/// coberto em `partner_search_logic_test.dart`).
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

/// Dublê de `TournamentPartnerInviteService`: captura os argumentos do envio
/// e, quando configurado, reproduz o erro do backend.
class _FakeSubstitutionInviteService implements TournamentPartnerInviteService {
  _FakeSubstitutionInviteService({this.erroAoEnviar});
  final TournamentPartnerInviteException? erroAoEnviar;
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
    final erro = erroAoEnviar;
    if (erro != null) throw erro;
    return 'invite-1';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
