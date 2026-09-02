import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_terms_page.dart';

/// Testes da tela 3 do wizard de inscrição: condições da inscrição.
///
/// O harness segue `registration_consent_page_test.dart` — mesmo torneio de
/// uma categoria só, mais um `TournamentPartnerInviteService` dublê porque a
/// variante "dupla com reserva solo" dispara `registerSolo` direto desta
/// tela, e `pendingTournamentPartnerInvitesProvider` porque a variante
/// "convite recebido" lê os convites pendentes do atleta.
void main() {
  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    String genderType = 'male',
    double entryFee = 100,
    int maxTeams = 8,
    int? teamSize,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: genderType,
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    teamSize: teamSize,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    String name = 'Copa de Teste',
    bool requireFormedPair = false,
    DateTime? registrationClosesAt,
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
    registrationClosesAt: registrationClosesAt,
  );

  late List<String> rotasAbertas;
  late _FakeInviteService servico;
  // Capturado pelo builder da rota do parceiro — prova que a URL de destino
  // carrega `lgpd=1` e `categoryId`, não só que a navegação por nome
  // aconteceu (ver achado 2 da revisão: um builder que descarta `state` não
  // pega regressão nenhuma no aceite LGPD).
  late Map<String, String>? parceiroQueryParams;

  /// Path params com que a rota DEDICADA do convite foi aberta — é lá que
  /// `acceptInvite`/`declineInvite` moram, e é o que o CTA "Aceitar convite"
  /// tem de abrir.
  late Map<String, String>? convitePathParams;

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
    List<TournamentPartnerInvite> pendingInvites = const [],
    bool lgpdAccepted = true,
  }) async {
    // Tela alta o bastante pra montar as três garantias e o cartão de preço —
    // o viewport padrão do teste (800×600) corta a lista antes disso.
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    rotasAbertas = <String>[];
    servico = _FakeInviteService();
    parceiroQueryParams = null;
    convitePathParams = null;

    final router = GoRouter(
      initialLocation: '/inscricao',
      routes: [
        GoRoute(
          path: '/inscricao',
          builder: (_, __) => RegistrationTermsPage(
            tournamentId: 't1',
            categoryId: 'masc',
            lgpdAccepted: lgpdAccepted,
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/parceiro',
          name: AppRouteNames.tournamentRegistrationPartner,
          builder: (_, state) {
            rotasAbertas.add('parceiro');
            parceiroQueryParams = Map.of(state.uri.queryParameters);
            return const Scaffold(body: Text('parceiro'));
          },
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
          path: '/torneios-convite/:inviteId',
          name: AppRouteNames.tournamentPartnerInvite,
          builder: (_, state) {
            rotasAbertas.add('convite');
            convitePathParams = Map.of(state.pathParameters);
            return const Scaffold(body: Text('convite'));
          },
        ),
        GoRoute(
          // A rota real declara `:tournamentId` (`AppRoutes.tournamentDetail`)
          // — sem o parâmetro aqui, `goNamed` com `pathParameters:
          // {'tournamentId': ...}` derruba uma asserção do go_router
          // ("unknown param"). "Ver outras categorias" é quem de fato
          // exercita este caminho (`_goToTournamentDetail`).
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

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          pendingTournamentPartnerInvitesProvider.overrideWith(
            (ref) => Stream.value(pendingInvites),
          ),
          tournamentPartnerInviteServiceProvider.overrideWithValue(servico),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('mostra as três garantias e o preço por atleta', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(entryFee: 220)], requireFormedPair: true),
    );

    expect(
      find.text('Este torneio só aceita\ninscrição com dupla'),
      findsOneWidget,
    );
    expect(find.text('Parceiro definido antes de pagar'), findsOneWidget);
    // `formatRegistrationMoney` é a formatação canônica do wizard (a mesma
    // que a tela 1 usa no spec row de preço) — inclui centavos ("R$ 220,00"),
    // então a asserção usa a própria função em vez de um literal sem vírgula.
    expect(find.text(formatRegistrationMoney(220)), findsNWidgets(2));
    expect(find.text(formatRegistrationMoney(110)), findsOneWidget);
  });

  testWidgets('dupla obrigatória não oferece guardar a vaga sozinho', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
    );

    expect(find.text('Guardar minha vaga sem parceiro'), findsNothing);
  });

  testWidgets(
    'dupla obrigatória AINDA ASSIM mostra "Ver outras categorias" e navega '
    'para o detalhe do torneio',
    (tester) async {
      // Achado 1 da revisão: "Ver outras categorias" não pode depender de
      // `copy.secondaryLabel` (só preenchido na variante de reserva solo) —
      // dupla obrigatória é justamente a variante em que o atleta pode não
      // ter parceiro e mais precisa de uma saída de um toque.
      await abrirTela(
        tester,
        tournament: torneio([dupla()], requireFormedPair: true),
      );

      expect(find.text('Ver outras categorias'), findsOneWidget);

      await tester.tap(find.text('Ver outras categorias'));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('detalhe'));
    },
  );

  testWidgets('equipe trio+ também mostra "Ver outras categorias"', (
    tester,
  ) async {
    // Julgamento do fix: equipe é outra variante em que o atleta ainda não
    // se comprometeu com nada — trocar de categoria faz o mesmo sentido
    // que em dupla obrigatória/reserva solo.
    await abrirTela(
      tester,
      tournament: torneio([dupla(teamSize: 4, entryFee: 400)]),
    );

    expect(find.text('Ver outras categorias'), findsOneWidget);
  });

  testWidgets('convite recebido NÃO mostra "Ver outras categorias"', (
    tester,
  ) async {
    // Ali a decisão é aceitar ou recusar o convite, não trocar de
    // categoria — explicitamente fora do escopo do achado 1.
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
      pendingInvites: [_convite(inviterName: 'Bia Souza')],
    );

    expect(find.text('Ver outras categorias'), findsNothing);
  });

  testWidgets('CTA leva ao parceiro carregando o aceite adiante', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
      lgpdAccepted: true,
    );

    await tester.tap(find.text('Definir meu parceiro'));
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('parceiro'));
    // A promessa do nome do teste é o aceite ATRAVESSANDO na URL — checar só
    // a navegação por nome deixaria passar uma regressão que perdesse
    // `lgpd=1` no caminho.
    expect(parceiroQueryParams?['lgpd'], '1');
    expect(parceiroQueryParams?['categoryId'], 'masc');
  });

  testWidgets('CTA sem aceite LGPD não carrega lgpd=1 para o parceiro', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
      lgpdAccepted: false,
    );

    await tester.tap(find.text('Definir meu parceiro'));
    await tester.pumpAndSettle();

    expect(parceiroQueryParams?.containsKey('lgpd'), isFalse);
  });

  testWidgets(
    'dupla com reserva solo mostra a ação de guardar a vaga sozinho',
    (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()], requireFormedPair: false),
      );

      expect(find.text('Escolher meu parceiro'), findsOneWidget);
      expect(find.text('Guardar minha vaga sem parceiro'), findsOneWidget);
      expect(find.text('Ver outras categorias'), findsOneWidget);
    },
  );

  testWidgets('guardar a vaga sozinho dispara registerSolo com o aceite LGPD', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: false),
      lgpdAccepted: true,
    );

    await tester.tap(find.text('Guardar minha vaga sem parceiro'));
    await tester.pumpAndSettle();

    expect(servico.soloCalls, hasLength(1));
    expect(servico.soloCalls.single.tournamentId, 't1');
    expect(servico.soloCalls.single.categoryId, 'masc');
    expect(servico.soloCalls.single.lgpdAccepted, isTrue);
    expect(rotasAbertas, contains('inscrição'));
  });

  testWidgets('equipe trio+ mostra o CTA de montar elenco', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(teamSize: 4, entryFee: 400)]),
    );

    expect(
      find.text('Esta categoria é disputada em equipe de 4'),
      findsOneWidget,
    );
    expect(find.text('Montar meu elenco'), findsOneWidget);
    expect(find.text('Guardar minha vaga sem parceiro'), findsNothing);
  });

  testWidgets('convite recebido vira o aceite com o nome de quem convidou', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
      pendingInvites: [_convite(inviterName: 'Bia Souza')],
    );

    expect(find.text('Bia Souza quer jogar com você'), findsOneWidget);
    expect(find.text('Aceitar convite'), findsOneWidget);
  });

  testWidgets(
    'convite recebido de EQUIPE fala em elenco, não em "jogar com você"',
    (tester) async {
      // Achado 3 da revisão: `isTeamInvite` vem do CONVITE
      // (`TournamentPartnerInvite.isTeamInvite`), então mesmo uma categoria
      // com `teamSize` preenchido só ganha o texto de elenco quando o
      // convite em si é marcado como de equipe.
      await abrirTela(
        tester,
        tournament: torneio([dupla(teamSize: 4, entryFee: 400)]),
        pendingInvites: [
          _convite(inviterName: 'Bia Souza', isTeamInvite: true),
        ],
      );

      expect(find.text('Bia Souza te chamou para o elenco'), findsOneWidget);
      expect(find.text('Bia Souza quer jogar com você'), findsNothing);
      expect(find.text('Aceitar convite'), findsOneWidget);
    },
  );

  testWidgets(
    'tocar "Aceitar convite" abre a rota DEDICADA do convite, não a busca '
    'de parceiro',
    (tester) async {
      // O CTA prometia aceitar e chamava `_advance`, que empurrava para
      // "convide um parceiro". Nenhuma tela do wizard chama `acceptInvite` —
      // a ação mora na rota do convite, que é a mesma do push e do link.
      await abrirTela(
        tester,
        tournament: torneio([dupla()], requireFormedPair: true),
        pendingInvites: [_convite(inviterName: 'Bia Souza')],
      );

      await tester.tap(find.text('Aceitar convite'));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('convite'));
      expect(rotasAbertas, isNot(contains('parceiro')));
      // O id tem de ser o do convite REAL, não um placeholder.
      expect(convitePathParams?['inviteId'], 'convite-1');
    },
  );

  testWidgets('convite recebido de EQUIPE também abre a rota do convite', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(teamSize: 4, entryFee: 400)]),
      pendingInvites: [_convite(inviterName: 'Bia Souza', isTeamInvite: true)],
    );

    await tester.tap(find.text('Aceitar convite'));
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('convite'));
    expect(convitePathParams?['inviteId'], 'convite-1');
  });

  testWidgets('sem registrationClosesAt a linha do prazo não aparece', (
    tester,
  ) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.textContaining('Inscrições até'), findsNothing);
  });
}

TournamentPartnerInvite _convite({
  required String inviterName,
  bool isTeamInvite = false,
}) {
  final now = DateTime.now();
  return TournamentPartnerInvite(
    id: 'convite-1',
    tournamentId: 't1',
    categoryId: 'masc',
    inviterUid: 'outro-atleta',
    inviterName: inviterName,
    inviteeUid: 'atleta-1',
    inviteeName: 'Atleta Teste',
    status: 'pending',
    createdAt: now,
    expiresAt: now.add(const Duration(hours: 48)),
    isTeamInvite: isTeamInvite,
  );
}

/// Serviço dublê: registra as chamadas em vez de tocar no Firebase. Mesmo
/// padrão de `tournament_registration_page_test.dart`.
class _FakeInviteService implements TournamentPartnerInviteService {
  final soloCalls =
      <({String tournamentId, String categoryId, bool lgpdAccepted})>[];

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
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
