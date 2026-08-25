import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_match_card.dart';
import 'package:nexago_app/features/tournaments/presentation/public_match_live_page.dart';

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
    liveMatchesNow: 1,
    categoryOffers: const [
      TournamentCategoryOffer(id: 'cat-a', name: 'Misto B', entryFee: 90),
    ],
  );
}

TournamentMatchCardViewModel _liveCard() {
  const teamA = TournamentMatchCardTeamViewModel(
    displayName: 'Ana & Bia',
    players: [
      TournamentMatchCardPlayerViewModel(
        initials: 'AB',
        avatarColor: Color(0xFF00FF88),
      ),
    ],
  );
  const teamB = TournamentMatchCardTeamViewModel(
    displayName: 'Carla & Duda',
    players: [
      TournamentMatchCardPlayerViewModel(
        initials: 'CD',
        avatarColor: Color(0xFFFF0088),
      ),
    ],
  );
  return const TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'cat-a',
      round: 1,
      matchType: 'WB',
      poolId: '',
      teamAId: 'team-a',
      teamBId: 'team-b',
      status: 'In Progress',
      resultA: '1',
      resultB: '0',
      isGroupMatch: false,
      matchNumber: 3,
      courtName: '3',
    ),
    teamA: teamA,
    teamB: teamB,
  );
}

Widget _app() {
  return ProviderScope(
    overrides: [
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament())),
      organizerMatchCardsByIdProvider('t1')
          .overrideWith((ref) => Stream.value({'m1': _liveCard()})),
    ],
    child: MaterialApp(
      // O ponto do "ao vivo" pulsa em laço infinito; este é o mesmo caminho
      // que o aparelho com "reduzir movimento" percorre.
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: const PublicMatchLivePage(tournamentId: 't1', matchId: 'm1'),
      ),
    ),
  );
}

void main() {
  testWidgets(
    'mostra o nome do torneio, o card de partida compartilhado e as duplas',
    (tester) async {
      await tester.pumpWidget(_app());
      await tester.pumpAndSettle();

      expect(find.text('Copa Teste'), findsOneWidget);
      expect(find.byType(FocusMatchCard), findsOneWidget);
      expect(find.textContaining('MISTO B'), findsOneWidget);
      expect(find.text('Ana & Bia'), findsOneWidget);
      expect(find.text('Carla & Duda'), findsOneWidget);
    },
  );
}
