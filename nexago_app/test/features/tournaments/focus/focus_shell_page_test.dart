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

Widget _app() {
  return ProviderScope(
    overrides: [
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament())),
      tournamentMatchCardsProvider('t1')
          .overrideWith((ref) => Stream.value(const [])),
      tournamentUserTeamIdsByCategoryProvider('t1')
          .overrideWith((ref) => Stream.value(const {})),
    ],
    child: const MaterialApp(
      home: FocusShellPage(tournamentId: 't1'),
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

  testWidgets('nav inferior traz as três seções e o cabeçalho tem o ×',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    // Rótulos em caixa alta: é o `uppercaseLabels` da nav do app.
    expect(find.text('AGORA'), findsOneWidget);
    expect(find.text('TRAJETÓRIA'), findsOneWidget);
    // Sem formato de dupla eliminação resolvido, a terceira aba é o Grupo.
    expect(find.text('GRUPO'), findsOneWidget);
    expect(find.text('CHAVE'), findsNothing);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    expect(find.text('FOCUS'), findsOneWidget);
  });

  testWidgets('trocar de seção mantém a casca e a nav', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('TRAJETÓRIA'));
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
      greaterThanOrEqualTo(nexaBottomNavBarHeight()),
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
        ],
        child: const MaterialApp(home: FocusShellPage(tournamentId: 't1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('CHAVE'), findsOneWidget);
    expect(find.text('GRUPO'), findsNothing);
    expect(find.text('FOCUS · DUPLA ELIMINATÓRIA'), findsOneWidget);
  });
}
