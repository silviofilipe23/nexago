// Widget tests do fluxo "Substituir atleta": passo 1 (escolher a vaga que
// sai), passo 2 (buscar e convidar o substituto). Quem pode substituir quem
// já é coberto por `tournament_substitution_logic_test.dart`
// (`substitutionReplaceableUids`) — este arquivo assume `replaceableUids`
// pronto (como a tela real recebe) e cobre só a fiação do sheet: nomes
// resolvidos via `usersRepositoryProvider`, filtro de resultado que exclui
// quem já está na inscrição, argumento certo em `sendSubstitutionInvite` e o
// sheet permanecer aberto quando o backend recusa o convite.
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_substitution_sheet.dart';

void main() {
  const meuUid = 'me';

  AppUserProfile perfil(String uid, String nome) =>
      AppUserProfile(uid: uid, fullName: nome);

  MyTournamentRegistration inscricao({
    List<String> participantUids = const ['me', 'ana', 'bia'],
  }) =>
      MyTournamentRegistration(
        registrationId: 'reg-1',
        tournamentId: 't1',
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada',
        isPaid: true,
        categoryId: 'trio',
        participantUids: participantUids,
        category: const TournamentCategoryOffer(
          id: 'trio',
          name: 'Trio Misto',
          entryFee: 150,
          genderType: 'mixed',
          teamSize: 3,
        ),
      );

  late _FakeUsersRepository users;
  late _FakePartnerSearchService busca;
  late _FakeSubstitutionInviteService convites;

  /// `pump()` duplo: um para processar o gesto/callback (agenda o Future),
  /// outro para esvaziar a microtask e refletir o `setState` resultante — sem
  /// usar `pumpAndSettle`, que trava com o `CircularProgressIndicator`
  /// (animação contínua) da busca. Depois, um `pump` com duração explícita
  /// deixa animações finitas (fechar o sheet, entrada do SnackBar) assentarem.
  Future<void> assentar(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> abrirSheet(
    WidgetTester tester, {
    required MyTournamentRegistration registration,
    required List<String> replaceableUids,
    Map<String, AppUserProfile> perfis = const {},
    List<AppUserProfile> resultadosBusca = const [],
    TournamentPartnerInviteException? erroAoEnviar,
  }) async {
    users = _FakeUsersRepository(perfis);
    busca = _FakePartnerSearchService(resultadosBusca);
    convites = _FakeSubstitutionInviteService(erroAoEnviar: erroAoEnviar);

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
          tournamentPartnerInviteServiceProvider.overrideWithValue(convites),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            // `Consumer` "esquenta" o `authProvider` (StreamProvider) já no
            // 1º build: sem isto, o `ref.read(authProvider)` dentro de
            // `_search`/`_send` bate num `AsyncLoading` (o valor do
            // `Stream.value` só chega numa microtask seguinte) e o uid do
            // usuário sai vazio.
            body: Consumer(
              builder: (context, ref, child) {
                ref.watch(authProvider);
                return child!;
              },
              child: Builder(
                builder: (context) => ElevatedButton(
                  onPressed: () => showTournamentSubstitutionSheet(
                    context,
                    registration: registration,
                    replaceableUids: replaceableUids,
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
  }

  group('passo 1 — escolher a vaga', () {
    testWidgets(
        'mostra título, aviso de pagamento e uma opção por uid de replaceableUids',
        (tester) async {
      await abrirSheet(
        tester,
        registration: inscricao(),
        replaceableUids: const ['ana', 'bia'],
        perfis: {
          'me': perfil('me', 'Eu Mesmo'),
          'ana': perfil('ana', 'Ana Souza'),
          'bia': perfil('bia', 'Bia Lima'),
        },
      );

      expect(find.text('Substituir atleta'), findsOneWidget);
      expect(
        find.text(
          'A vaga (e o pagamento dela) passa para o substituto quando ele '
          'aceitar o convite. Válido até a publicação das chaves.',
        ),
        findsOneWidget,
      );
      expect(find.text('Quem sai?'), findsOneWidget);
      expect(find.byType(RadioListTile<String>), findsNWidgets(2));
      expect(find.text('Ana Souza'), findsOneWidget);
      expect(find.text('Bia Lima'), findsOneWidget);
      // Quem não está em replaceableUids (mesmo estando na inscrição) não
      // vira opção de saída.
      expect(find.text('Eu Mesmo'), findsNothing);
    });

    testWidgets('perfil não resolvido cai no rótulo genérico "Atleta"',
        (tester) async {
      await abrirSheet(
        tester,
        registration: inscricao(participantUids: const ['me', 'ana']),
        replaceableUids: const ['ana'],
        perfis: const {},
      );

      expect(find.text('Atleta'), findsOneWidget);
    });

    testWidgets('antes de escolher a vaga não há campo de busca',
        (tester) async {
      await abrirSheet(
        tester,
        registration: inscricao(),
        replaceableUids: const ['ana', 'bia'],
        perfis: {
          'ana': perfil('ana', 'Ana Souza'),
          'bia': perfil('bia', 'Bia Lima'),
        },
      );

      expect(find.byType(TextField), findsNothing);
    });
  });

  group('passo 2 — buscar e convidar o substituto', () {
    testWidgets(
        'selecionar a vaga revela a busca; resultado exclui quem já está na inscrição',
        (tester) async {
      await abrirSheet(
        tester,
        registration: inscricao(),
        replaceableUids: const ['ana', 'bia'],
        perfis: {
          'me': perfil('me', 'Eu Mesmo'),
          'ana': perfil('ana', 'Ana Souza'),
          'bia': perfil('bia', 'Bia Lima'),
        },
        resultadosBusca: [
          // 'ana' já está na inscrição — o serviço a devolve (fake simples),
          // mas o sheet precisa filtrá-la do resultado exibido.
          perfil('ana', 'Ana Souza'),
          perfil('carla', 'Carla Nunes'),
        ],
      );

      await tester.tap(find.text('Ana Souza'));
      await assentar(tester);
      expect(find.byType(TextField), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      expect(busca.chamadas, hasLength(1));
      expect(busca.chamadas.single.currentUserId, meuUid);
      expect(busca.chamadas.single.categoryGenderType, 'mixed');
      expect(busca.chamadas.single.query, 'car');

      // 'Ana Souza' segue existindo só como opção do passo 1 (um único
      // widget) — não duplica na lista de resultados.
      expect(find.text('Ana Souza'), findsOneWidget);
      expect(find.text('Carla Nunes'), findsOneWidget);
    });

    testWidgets(
        'tocar "Convidar" chama sendSubstitutionInvite com os dados certos e fecha o sheet',
        (tester) async {
      await abrirSheet(
        tester,
        registration: inscricao(),
        replaceableUids: const ['ana', 'bia'],
        perfis: {
          'me': perfil('me', 'Eu Mesmo'),
          'ana': perfil('ana', 'Ana Souza'),
          'bia': perfil('bia', 'Bia Lima'),
        },
        resultadosBusca: [perfil('carla', 'Carla Nunes')],
      );

      await tester.tap(find.text('Ana Souza'));
      await assentar(tester);
      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      await tester.tap(find.text('Convidar'));
      await assentar(tester);

      expect(convites.chamadas, hasLength(1));
      final chamada = convites.chamadas.single;
      expect(chamada.registrationId, 'reg-1');
      expect(chamada.replacedUid, 'ana');
      expect(chamada.inviteeUid, 'carla');
      expect(chamada.replacedName, 'Ana Souza');
      expect(chamada.inviteeName, 'Carla Nunes');
      expect(chamada.inviterName, 'Eu Mesmo');

      // Sheet fechou (sucesso) e o SnackBar de confirmação apareceu.
      expect(find.text('Substituir atleta'), findsNothing);
      expect(
        find.text('Convite enviado. A troca acontece quando Carla Nunes aceitar.'),
        findsOneWidget,
      );
    });
  });

  group('erro do backend', () {
    testWidgets(
        'TournamentPartnerInviteException mantém o sheet aberto e mostra a mensagem',
        (tester) async {
      await abrirSheet(
        tester,
        registration: inscricao(),
        replaceableUids: const ['ana', 'bia'],
        perfis: {
          'me': perfil('me', 'Eu Mesmo'),
          'ana': perfil('ana', 'Ana Souza'),
          'bia': perfil('bia', 'Bia Lima'),
        },
        resultadosBusca: [perfil('carla', 'Carla Nunes')],
        erroAoEnviar: TournamentPartnerInviteException(
          'Convite de substituição não pôde ser criado.',
        ),
      );

      await tester.tap(find.text('Ana Souza'));
      await assentar(tester);
      await tester.enterText(find.byType(TextField), 'car');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await assentar(tester);

      await tester.tap(find.text('Convidar'));
      await assentar(tester);

      expect(convites.chamadas, hasLength(1));
      // Sheet continua aberto — nada de Navigator.pop no caminho de erro.
      expect(find.text('Substituir atleta'), findsOneWidget);
      expect(
        find.text('Convite de substituição não pôde ser criado.'),
        findsOneWidget,
      );
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
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o sheet passou a usar este método, cubra-o aqui.',
    );
  }
}

/// Dublê de `PartnerSearchService`: registra a chamada e devolve a lista
/// fixa passada no teste (a filtragem por gênero/já-membro é responsabilidade
/// do serviço real, coberto em `partner_search_logic_test.dart`).
class _FakePartnerSearchService implements PartnerSearchService {
  _FakePartnerSearchService(this._results);
  final List<AppUserProfile> _results;
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
    return _results;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o sheet passou a usar este método, cubra-o aqui.',
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
      })>[];

  @override
  Future<String> sendSubstitutionInvite({
    required String registrationId,
    required String replacedUid,
    required String replacedName,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
  }) async {
    chamadas.add((
      registrationId: registrationId,
      replacedUid: replacedUid,
      replacedName: replacedName,
      inviteeUid: inviteeUid,
      inviteeName: inviteeName,
      inviterName: inviterName,
    ));
    if (erroAoEnviar != null) throw erroAoEnviar!;
    return 'invite-1';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o sheet passou a usar este método, cubra-o aqui.',
    );
  }
}
