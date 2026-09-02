import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/data/athlete_profile_repository.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_consent_page.dart';

/// `saveMarketingOptIn` sem efeito — `_firestore` nunca é usado de verdade
/// (o override abaixo substitui o único método que o tocaria). Mesmo padrão
/// de `athlete_level_upgrade_only_test.dart`: sem isso, a primeira chamada
/// tentaria `FirebaseFirestore.instance` de verdade e explodiria com
/// `[core/no-app]`.
class _NoopMarketingRepository extends AthleteProfileRepository {
  _NoopMarketingRepository()
      : super(_UnusedFirestore(), functions: _UnusedFunctions());

  @override
  Future<void> saveMarketingOptIn({
    required String uid,
    required bool optIn,
  }) async {}
}

class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Testes da tela 2 do wizard de inscrição: o consentimento LGPD.
///
/// O harness segue `registration_category_page_test.dart` — mesmo torneio de
/// uma categoria só, mais `firebaseAuthProvider`/`athleteProfileRepositoryProvider`
/// fakes porque esta tela grava o opt-in de marketing no perfil ao confirmar.
void main() {
  const meuUid = 'atleta-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    String genderType = 'male',
    double entryFee = 100,
    int maxTeams = 8,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: genderType,
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    String name = 'Copa de Teste',
    String? regulationsText,
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
    regulationsText: regulationsText,
  );

  late List<String> rotasAbertas;
  /// Query params com que a rota de condições foi aberta — é onde `lgpd=1`
  /// aparece (ou não).
  late Map<String, String>? condicoesQueryParams;

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
  }) async {
    // Tela alta o bastante pra montar as três caixas de consentimento e a
    // barra fixa — o viewport padrão do teste (800×600) corta a lista antes
    // disso, e um `SliverList` só CONSTRÓI o que cabe no viewport + cache
    // extent, então o resto nem entra na árvore de widgets.
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    rotasAbertas = <String>[];
    condicoesQueryParams = null;

    final router = GoRouter(
      initialLocation: '/inscricao',
      routes: [
        GoRoute(
          path: '/inscricao',
          builder: (_, __) => const RegistrationConsentPage(
            tournamentId: 't1',
            categoryId: 'masc',
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/condicoes',
          name: AppRouteNames.tournamentRegistrationTerms,
          builder: (_, state) {
            rotasAbertas.add('condicoes');
            condicoesQueryParams = Map.of(state.uri.queryParameters);
            return const Scaffold(body: Text('condições'));
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
          athleteProfileRepositoryProvider.overrideWithValue(
            _NoopMarketingRepository(),
          ),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Dá o ato afirmativo nas duas caixas obrigatórias — é o que destrava o CTA
  /// desde que o pré-marcado saiu.
  Future<void> marcarObrigatorias(WidgetTester tester) async {
    await tester.tap(
      find.text('Autorizo o uso dos meus dados para esta inscrição'),
    );
    await tester.pump();
    await tester.tap(find.text('Autorizo o uso da minha imagem nos jogos'));
    await tester.pump();
  }

  testWidgets(
    'as duas obrigatórias vêm DESMARCADAS e o CTA nasce travado',
    (tester) async {
      // Consentimento pré-marcado é o exemplo clássico de consentimento
      // inválido sob a LGPD (art. 8): o aceite tem de ser ato afirmativo. A
      // tela aposentada já exigia isso (`_lgpdAccepted = false`).
      await abrirTela(tester, tournament: torneio([dupla()]));

      expect(
        find.text('Autorizo o uso dos meus dados para esta inscrição'),
        findsOneWidget,
      );
      expect(
        find.text('Autorizo o uso da minha imagem nos jogos'),
        findsOneWidget,
      );
      expect(
        find.text('Quero receber avisos de novos torneios'),
        findsOneWidget,
      );

      final botao = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(botao.onPressed, isNull);
    },
  );

  testWidgets('marcar as duas obrigatórias libera o CTA', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    await tester.tap(
      find.text('Autorizo o uso dos meus dados para esta inscrição'),
    );
    await tester.pump();
    // Uma só não basta: as duas caixas são as duas METADES do mesmo termo.
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );

    await tester.tap(find.text('Autorizo o uso da minha imagem nos jogos'));
    await tester.pump();

    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });

  testWidgets('desmarcar uma obrigatória trava o CTA de novo', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));
    await marcarObrigatorias(tester);

    await tester.tap(find.text('Autorizo o uso da minha imagem nos jogos'));
    await tester.pump();

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
  });

  testWidgets('a lista descreve o que o organizador RECEBE de fato', (
    tester,
  ) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Nome completo e apelido'), findsOneWidget);
    expect(find.text('Telefone para avisos do torneio'), findsOneWidget);
    expect(
      find.text('Nível, categoria e histórico de resultados'),
      findsOneWidget,
    );
    // O protótipo dizia CPF e cartão; nenhum dos dois chega ao organizador.
    expect(find.textContaining('CPF'), findsNothing);
    expect(find.textContaining('cartão'), findsNothing);
  });

  testWidgets('mostra direitos LGPD e links de leitura', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio(
        [dupla()],
        name: 'Copa Aparecida',
        regulationsText: 'Regras gerais do torneio.',
      ),
    );

    expect(find.text('Seus direitos'), findsOneWidget);
    expect(
      find.textContaining('Perfil > Privacidade'),
      findsOneWidget,
    );
    expect(find.text('Guarda dos dados'), findsOneWidget);
    expect(
      find.textContaining('5 anos após o torneio'),
      findsOneWidget,
    );
    expect(
      find.text('LER POLÍTICA DE PRIVACIDADE COMPLETA'),
      findsOneWidget,
    );
    expect(
      find.text('LER REGULAMENTO DO COPA APARECIDA'),
      findsOneWidget,
    );
    expect(find.text('Ler termo completo'), findsNothing);
  });

  testWidgets('concordar leva às condições carregando o aceite', (
    tester,
  ) async {
    await abrirTela(tester, tournament: torneio([dupla()]));
    await marcarObrigatorias(tester);

    await tester.tap(find.text('Concordar e continuar'));
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('condicoes'));
    // "carregando o aceite" é a METADE que importa: sem `lgpd=1` na URL o
    // aceite não atravessa até a callable, e ela não grava `lgpdAcceptedUids`
    // — em silêncio, sem erro. Checar só o nome da rota deixava isso passar.
    expect(condicoesQueryParams?['lgpd'], '1');
    expect(condicoesQueryParams?['categoryId'], 'masc');
  });
}
