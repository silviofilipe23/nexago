import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/core/layout/nexa_bottom_nav_bar.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_shell_page.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/sections/focus_agora_section.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/sections/focus_arena_section.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_predictions_page.dart';

TournamentDetail _tournament() {
  final today = DateTime.now();
  return TournamentDetail(
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena X',
    city: 'Goiânia',
    dateLabel: '',
    startDate: today,
    endDate: today,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.live,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
  );
}

// iOS explícito: estes testes exercitam a troca de seção via o rótulo da nav
// (find.text), que no Android fica sempre minimizado (só ícone) — ver
// NexaBottomNavBar.build. O comportamento de navegação em si não é
// platform-specific, então fixamos a plataforma onde o rótulo é visível.
Widget _app() {
  return ProviderScope(
    overrides: [
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament())),
      tournamentMatchCardsProvider('t1')
          .overrideWith((ref) => Stream.value(const [])),
      tournamentUserTeamIdsByCategoryProvider('t1')
          .overrideWith((ref) => Stream.value(const {})),
      // Sem isto o provider iria ao Firestore real, que o teste não tem.
      myTournamentPredictionEntryProvider('t1')
          .overrideWith((ref) async => null),
    ],
    child: MaterialApp(
      theme: ThemeData(platform: TargetPlatform.iOS),
      home: const FocusShellPage(tournamentId: 't1'),
    ),
  );
}

/// Torneio com UMA categoria de dupla eliminação.
TournamentDetail _doubleEliminationTournament() {
  final base = _tournament();
  return TournamentDetail(
    id: base.id,
    name: base.name,
    location: base.location,
    city: base.city,
    dateLabel: base.dateLabel,
    startDate: base.startDate,
    endDate: base.endDate,
    categories: base.categories,
    format: base.format,
    priceLabel: base.priceLabel,
    priceValue: base.priceValue,
    spotsLeft: base.spotsLeft,
    spotsTotal: base.spotsTotal,
    status: base.status,
    featured: base.featured,
    enrolledCount: base.enrolledCount,
    liveMatchesNow: base.liveMatchesNow,
    categoryOffers: const [
      TournamentCategoryOffer(
        id: 'cat-a',
        name: 'Masculina A',
        entryFee: 90,
        bracketFormat: 'Double Elimination',
      ),
    ],
  );
}

TournamentMatchCardViewModel _completedCard() {
  const team = TournamentMatchCardTeamViewModel(
    displayName: 'Dupla',
    players: [
      TournamentMatchCardPlayerViewModel(
        initials: 'DP',
        avatarColor: Color(0xFF00FF88),
      ),
    ],
  );
  return TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'cat-a',
      round: 1,
      matchType: 'WB',
      poolId: '',
      teamAId: 'meu-time',
      teamBId: 'outro',
      // Eliminado: nenhuma partida por jogar sobrou.
      status: 'Completed',
      resultA: '0',
      resultB: '2',
      isGroupMatch: false,
      matchNumber: 1,
      winnerId: 'outro',
    ),
    teamA: team,
    teamB: team,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  testWidgets('nav inferior traz as cinco seções e o cabeçalho tem o ×',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    // Rótulos em caixa alta: é o `uppercaseLabels` da nav do app.
    expect(find.text('AGORA'), findsOneWidget);
    expect(find.text('JORNADA'), findsOneWidget);
    expect(find.text('TRAJETÓRIA'), findsNothing);
    // Sem formato de dupla eliminação resolvido, a terceira aba é o Grupo.
    expect(find.text('GRUPO'), findsOneWidget);
    expect(find.text('CHAVE'), findsNothing);
    expect(find.text('ARENA'), findsOneWidget);
    expect(find.text('PALPITES'), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    expect(find.text('FOCUS'), findsOneWidget);
  });

  // A Arena é a única seção que não se recorta por categoria: tem que abrir
  // mesmo quando o atleta não tem partida nenhuma neste torneio — que é
  // exatamente o cenário deste `_app()`.
  testWidgets('a aba Arena abre sem categoria em foco', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('ARENA'));
    await tester.pumpAndSettle();

    expect(find.byType(FocusArenaSection), findsOneWidget);
    expect(find.text('AO VIVO NA ARENA'), findsOneWidget);
    expect(find.textContaining('o grupo e a chave dela'), findsNothing);
  });

  testWidgets('trocar de seção mantém a casca e a nav', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('JORNADA'));
    await tester.pumpAndSettle();

    expect(find.text('AGORA'), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
  });

  // A casca usa `extendBody: true`: a nav flutua POR CIMA do corpo. Com padding
  // fixo o fim da lista some atrás do vidro, que foi o que aconteceu.
  testWidgets('a lista da seção deixa folga para a nav flutuante',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    final list = tester.widget<ListView>(
      find.descendant(
        of: find.byType(FocusAgoraSection),
        matching: find.byType(ListView),
      ),
    );

    expect(
      (list.padding as EdgeInsets).bottom,
      greaterThanOrEqualTo(
        nexaBottomNavBarHeight(tester.element(find.byType(FocusShellPage))),
      ),
    );
  });

  testWidgets('sem categoria em foco a seção de grupo explica em vez de vazar',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('GRUPO'));
    await tester.pumpAndSettle();

    expect(find.textContaining('o grupo e a chave dela'), findsWidgets);
  });

  // Regressão: `pickAthleteNextMatch` devolve null quando o atleta foi
  // eliminado, e a categoria em foco ia junto — a nav caía em GRUPO mesmo numa
  // categoria de dupla eliminatória, e as duas seções viravam tela vazia.
  testWidgets('eliminado numa categoria de dupla eliminação, a aba é CHAVE',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentDetailProvider('t1').overrideWith(
            (ref) => Stream.value(_doubleEliminationTournament()),
          ),
          tournamentMatchCardsProvider('t1')
              .overrideWith((ref) => Stream.value([_completedCard()])),
          tournamentUserTeamIdsByCategoryProvider('t1')
              .overrideWith((ref) => Stream.value(const {'cat-a': 'meu-time'})),
          // O `IndexedStack` da casca constrói TODAS as seções, inclusive a de
          // palpites — que sem este override iria ao Firestore real.
          myTournamentPredictionEntryProvider('t1')
              .overrideWith((ref) async => null),
        ],
        child: MaterialApp(
          theme: ThemeData(platform: TargetPlatform.iOS),
          home: const FocusShellPage(tournamentId: 't1'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('CHAVE'), findsOneWidget);
    expect(find.text('GRUPO'), findsNothing);
    expect(find.text('FOCUS · DUPLA ELIMINATÓRIA'), findsOneWidget);
  });

  // Palpites é do torneio INTEIRO, como a Arena: tem que abrir mesmo para quem
  // não tem partida nenhuma nele — o cenário deste `_app()`.
  testWidgets('a aba Palpites abre a tela de palpites sem categoria em foco',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('PALPITES'));
    await tester.pumpAndSettle();

    expect(find.byType(TournamentPredictionsPage), findsOneWidget);
    // O toggle da própria tela: prova que veio o conteúdo, não a casca vazia.
    expect(find.text('Meus palpites'), findsOneWidget);
    expect(find.text('Ranking'), findsOneWidget);
    expect(find.textContaining('o grupo e a chave dela'), findsNothing);
  });

  // A tela de palpites tem scaffold próprio na rota `/palpites`. Dentro do
  // Focus ela entra `embedded`, senão viria com cabeçalho e botão de voltar
  // por cima da casca imersiva.
  testWidgets('a aba Palpites entra embutida, sem scaffold próprio',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('PALPITES'));
    await tester.pumpAndSettle();

    final page = tester.widget<TournamentPredictionsPage>(
      find.byType(TournamentPredictionsPage),
    );
    expect(page.embedded, isTrue);
    expect(page.tournamentId, 't1');
  });

  // Mesmo motivo do teste da seção Agora: com `extendBody: true` a nav flutua
  // por cima, e sem folga o botão "Salvar palpites" termina atrás do vidro.
  testWidgets('a aba Palpites deixa folga para a nav flutuante',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('PALPITES'));
    await tester.pumpAndSettle();

    final page = tester.widget<TournamentPredictionsPage>(
      find.byType(TournamentPredictionsPage),
    );

    expect(
      page.bottomPadding,
      greaterThanOrEqualTo(
        nexaBottomNavBarHeight(tester.element(find.byType(FocusShellPage))),
      ),
    );
  });
}
