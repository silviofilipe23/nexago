// Tela de Detalhe da inscrição (Task 4 da jornada de substituição v2):
// status/badge, avatares, ação de substituir (gate + estado "em curso" com
// convite pendente), ação de cancelar (direto vs. pedido ao organizador) e
// histórico de trocas — asserts que ANTES viviam em
// `tournament_detail_my_registration_tab_test.dart` e migraram pra cá quando
// o card confirmado passou a só navegar.
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_detail_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_wizard_page.dart';

void main() {
  const meuUid = 'me';
  const tournamentId = 't1';
  const registrationId = 'reg-1';

  AppUserProfile perfil(String uid, String nome) =>
      AppUserProfile(uid: uid, fullName: nome);

  MyTournamentRegistration inscricao({
    bool isPaid = true,
    bool isWaitlist = false,
    bool hasPartialPayment = false,
    bool bracketPublished = false,
    List<String> participantUids = const [meuUid, 'parceiro'],
    int? teamSize,
    String? teamName,
    String? captainUid,
    List<RegistrationSubstitutionEntry> historico = const [],
  }) =>
      MyTournamentRegistration(
        registrationId: registrationId,
        tournamentId: tournamentId,
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        locationLine: 'Arena Sol · São Paulo',
        statusLabel: 'Confirmada e paga',
        isPaid: isPaid,
        isWaitlist: isWaitlist,
        hasPartialPayment: hasPartialPayment,
        categoryId: 'masc',
        participantUids: participantUids,
        teamSize: teamSize,
        teamName: teamName,
        captainUid: captainUid,
        substitutionHistory: historico,
        category: TournamentCategoryOffer(
          id: 'masc',
          name: 'Dupla Masculina',
          entryFee: 100,
          maxTeams: 16,
          genderType: 'male',
          teamSize: teamSize,
          bracketPublished: bracketPublished,
        ),
      );

  TournamentPartnerInvite convitePendente({
    String inviteeName = 'Carla Nunes',
  }) =>
      TournamentPartnerInvite(
        id: 'inv-1',
        tournamentId: tournamentId,
        categoryId: 'masc',
        inviterUid: meuUid,
        inviterName: 'Eu Mesmo',
        inviteeUid: 'carla',
        inviteeName: inviteeName,
        status: 'pending',
        attachRegistrationId: registrationId,
        isSubstitutionInvite: true,
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(hours: 40)),
      );

  late _FakeUsersRepository users;
  late _FakeInviteService convites;

  Future<void> abrirDetalhe(
    WidgetTester tester, {
    required MyTournamentRegistration registration,
    List<TournamentPartnerInvite> convitesEnviados = const [],
    Map<String, AppUserProfile> perfis = const {},
    TournamentPartnerInviteException? erro,
  }) async {
    users = _FakeUsersRepository(perfis);
    convites = _FakeInviteService(erro: erro);

    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => TournamentRegistrationDetailPage(
            tournamentId: registration.tournamentId,
            registrationId: registration.registrationId,
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentSubstitutionWizard,
          name: AppRouteNames.tournamentSubstitutionWizard,
          builder: (context, state) => TournamentSubstitutionWizardPage(
            tournamentId: state.pathParameters['tournamentId'] ?? '',
            registrationId: state.pathParameters['registrationId'] ?? '',
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(MockUser(uid: meuUid)),
          ),
          myTournamentRegistrationsProvider.overrideWith(
            (ref) => Stream.value([registration]),
          ),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(convitesEnviados),
          ),
          usersRepositoryProvider.overrideWithValue(users),
          tournamentPartnerInviteServiceProvider.overrideWithValue(convites),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('AppBar', () {
    testWidgets('mostra "Minha inscrição" e o subtítulo torneio · categoria',
        (tester) async {
      await abrirDetalhe(tester, registration: inscricao());

      expect(find.text('Minha inscrição'), findsOneWidget);
      expect(find.text('Copa de Teste · Dupla Masculina'), findsOneWidget);
    });
  });

  group('badge de status', () {
    testWidgets('paga: INSCRIÇÃO CONFIRMADA + valor pago', (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(isPaid: true, bracketPublished: false),
      );

      expect(find.text('INSCRIÇÃO CONFIRMADA'), findsOneWidget);
      expect(find.text('${formatBRL(100)} pagos'), findsOneWidget);
    });

    testWidgets('paga + chave publicada acrescenta "chave publicada"',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(isPaid: true, bracketPublished: true),
      );

      expect(
        find.text('${formatBRL(100)} pagos · chave publicada'),
        findsOneWidget,
      );
    });

    testWidgets('não paga e sem lista de espera: PAGAMENTO PENDENTE',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(isPaid: false, isWaitlist: false),
      );

      expect(find.text('PAGAMENTO PENDENTE'), findsOneWidget);
      expect(find.text('pagamento pendente'), findsOneWidget);
    });

    testWidgets('lista de espera: LISTA DE ESPERA', (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(isPaid: false, isWaitlist: true),
      );

      expect(find.text('LISTA DE ESPERA'), findsOneWidget);
      expect(find.text('na lista de espera'), findsOneWidget);
    });
  });

  group('ação de substituir', () {
    testWidgets('gate fechado (chave publicada): ação não aparece',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(bracketPublished: true),
      );

      expect(
        find.textContaining('Substituir um atleta da'),
        findsNothing,
      );
      expect(find.text('Substituição em curso'), findsNothing);
    });

    testWidgets(
        'gate aberto: ação aparece e o toque abre o fluxo de substituição',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(bracketPublished: false),
        perfis: {
          meuUid: perfil(meuUid, 'Eu Mesmo'),
          'parceiro': perfil('parceiro', 'Pedro Alves'),
        },
      );

      expect(find.text('Substituir um atleta da dupla'), findsOneWidget);
      expect(
        find.text(
          'Alguém não vai poder jogar — mantenha a vaga trocando o parceiro',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Substituir um atleta da dupla'));
      await tester.pumpAndSettle();

      // Task 5: o sheet foi aposentado — o toque navega pro wizard dedicado.
      expect(find.text('Quem não vai poder jogar?'), findsOneWidget);
    });

    testWidgets(
        'convite de substituição pendente mostra "Substituição em curso" no lugar do wizard',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(bracketPublished: false),
        convitesEnviados: [convitePendente(inviteeName: 'Carla Nunes')],
      );

      expect(find.text('Substituição em curso'), findsOneWidget);
      expect(
        find.text('Carla Nunes ainda não respondeu — acompanhe'),
        findsOneWidget,
      );
      expect(find.text('Substituir um atleta da dupla'), findsNothing);
    });

    testWidgets('equipe (trio+): copy usa "equipe"/"atleta"', (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(
          bracketPublished: false,
          teamSize: 3,
          teamName: 'Trovão',
          captainUid: meuUid,
          participantUids: const [meuUid, 'p2', 'p3'],
        ),
      );

      expect(find.text('Substituir um atleta da equipe'), findsOneWidget);
      expect(
        find.text(
          'Alguém não vai poder jogar — mantenha a vaga trocando o atleta',
        ),
        findsOneWidget,
      );
    });
  });

  group('histórico de trocas', () {
    testWidgets('renderiza uma linha por substituição', (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(
          historico: const [
            RegistrationSubstitutionEntry(outName: 'Bia', inName: 'Ana'),
            RegistrationSubstitutionEntry(outName: 'Caio', inName: 'Léo'),
          ],
        ),
      );

      expect(find.text('Ana entrou no lugar de Bia.'), findsOneWidget);
      expect(find.text('Léo entrou no lugar de Caio.'), findsOneWidget);
    });

    testWidgets('sem histórico não renderiza nenhuma linha', (tester) async {
      await abrirDetalhe(tester, registration: inscricao());

      expect(find.textContaining('entrou no lugar de'), findsNothing);
    });
  });

  group('ação de cancelar', () {
    testWidgets(
        'sem pagamento: confirma e chama cancelRegistration diretamente',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration:
            inscricao(isPaid: false, isWaitlist: false, hasPartialPayment: false),
      );

      await tester.tap(find.text('Cancelar a inscrição da dupla'));
      await tester.pumpAndSettle();

      expect(find.text('Cancelar inscrição?'), findsOneWidget);
      await tester.tap(find.text('Cancelar inscrição'));
      await tester.pumpAndSettle();

      expect(convites.cancelChamadas, [registrationId]);
      expect(find.text('Inscrição cancelada.'), findsOneWidget);
    });

    testWidgets(
        'já paga: abre pedido ao organizador e chama requestRegistrationCancellation',
        (tester) async {
      await abrirDetalhe(
        tester,
        registration: inscricao(isPaid: true),
      );

      await tester.tap(find.text('Cancelar a inscrição da dupla'));
      await tester.pumpAndSettle();

      expect(find.text('Solicitar cancelamento'), findsOneWidget);
      await tester.enterText(
        find.byType(TextField),
        'Machuquei o tornozelo.',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enviar pedido'));
      await tester.pumpAndSettle();

      expect(convites.requestChamadas, [
        (registrationId: registrationId, reason: 'Machuquei o tornozelo.'),
      ]);
      expect(
        find.text('Pedido enviado. O organizador foi avisado.'),
        findsOneWidget,
      );
    });
  });

  group('card final do torneio', () {
    testWidgets('mostra torneio, categoria, data e local', (tester) async {
      await abrirDetalhe(tester, registration: inscricao());

      expect(find.text('Copa de Teste'), findsOneWidget);
      expect(find.text('Dupla Masculina · 20 ago'), findsOneWidget);
      // O local aparece duas vezes por desenho: no card de info (topo) e
      // de novo aqui, no card final — ambos exibem `locationLine`.
      expect(find.text('Arena Sol · São Paulo'), findsNWidgets(2));
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
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}

/// Dublê de `TournamentPartnerInviteService`: captura os argumentos do
/// cancelamento (direto e pedido ao organizador) e, quando configurado,
/// reproduz o erro do backend.
class _FakeInviteService implements TournamentPartnerInviteService {
  _FakeInviteService({this.erro});
  final TournamentPartnerInviteException? erro;
  final cancelChamadas = <String>[];
  final requestChamadas = <({String registrationId, String reason})>[];

  @override
  Future<void> cancelRegistration(String registrationId) async {
    cancelChamadas.add(registrationId);
    if (erro != null) throw erro!;
  }

  @override
  Future<void> requestRegistrationCancellation({
    required String registrationId,
    required String reason,
  }) async {
    requestChamadas.add((registrationId: registrationId, reason: reason));
    if (erro != null) throw erro!;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
