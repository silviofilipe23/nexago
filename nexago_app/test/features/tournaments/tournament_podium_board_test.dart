import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_listing_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_podium_logic.dart';

TournamentMatch _match({
  required String categoryId,
  required String matchType,
  String id = 'm1',
  String teamAId = 'a',
  String teamBId = 'b',
  String? teamADescription,
  String? teamBDescription,
  String? winnerId,
  String status = TournamentMatchStatus.completed,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: categoryId,
    round: 1,
    matchType: matchType,
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    winnerId: winnerId,
    teamADescription: teamADescription,
    teamBDescription: teamBDescription,
  );
}

TournamentCategoryOffer _category({
  required String id,
  required String name,
  List<TournamentCategoryPrize> prizes = const [],
}) {
  return TournamentCategoryOffer(
    id: id,
    name: name,
    entryFee: 0,
    prizes: prizes,
  );
}

void main() {
  group('tournamentPodiumsByCategory', () {
    test('keeps one entry per category, in the tournament order', () {
      final podiums = tournamentPodiumsByCategory(
        categories: [
          _category(id: 'c1', name: 'Masculino B'),
          _category(id: 'c2', name: 'Feminino A'),
        ],
        matches: const [],
      );

      expect(podiums.map((p) => p.categoryId), ['c1', 'c2']);
      expect(podiums.map((p) => p.categoryName), ['Masculino B', 'Feminino A']);
    });

    test('a category with no decided final has no places', () {
      final podiums = tournamentPodiumsByCategory(
        categories: [_category(id: 'c1', name: 'Masculino B')],
        matches: [
          _match(
            categoryId: 'c1',
            matchType: 'Final',
            status: TournamentMatchStatus.scheduled,
          ),
        ],
      );

      expect(podiums.single.isDecided, isFalse);
      expect(podiums.single.places, isEmpty);
    });

    test('resolves champion, runner-up and third place with team names', () {
      final podiums = tournamentPodiumsByCategory(
        categories: [_category(id: 'c1', name: 'Masculino B')],
        matches: [
          _match(
            id: 'final',
            categoryId: 'c1',
            matchType: 'Final',
            teamAId: 't1',
            teamBId: 't2',
            teamADescription: 'Ana & Bia',
            teamBDescription: 'Carla & Duda',
            winnerId: 't1',
          ),
          _match(
            id: 'third',
            categoryId: 'c1',
            matchType: 'Third Place',
            teamAId: 't3',
            teamBId: 't4',
            teamADescription: 'Eva & Fran',
            teamBDescription: 'Gabi & Hel',
            winnerId: 't3',
          ),
        ],
      );

      final places = podiums.single.places;
      expect(places.map((p) => p.place), [1, 2, 3]);
      expect(places.map((p) => p.teamId), ['t1', 't2', 't3']);
      expect(
        places.map((p) => p.teamName),
        ['Ana & Bia', 'Carla & Duda', 'Eva & Fran'],
      );
    });

    test('does not mix the finals of two categories', () {
      final podiums = tournamentPodiumsByCategory(
        categories: [
          _category(id: 'c1', name: 'Masculino B'),
          _category(id: 'c2', name: 'Feminino A'),
        ],
        matches: [
          _match(
            id: 'f1',
            categoryId: 'c1',
            matchType: 'Final',
            teamAId: 't1',
            teamBId: 't2',
            winnerId: 't1',
          ),
          _match(
            id: 'f2',
            categoryId: 'c2',
            matchType: 'Final',
            teamAId: 't9',
            teamBId: 't8',
            winnerId: 't9',
          ),
        ],
      );

      expect(podiums[0].places.first.teamId, 't1');
      expect(podiums[1].places.first.teamId, 't9');
    });

    test('falls back to the team id when the match carries no description', () {
      final podiums = tournamentPodiumsByCategory(
        categories: [_category(id: 'c1', name: 'Masculino B')],
        matches: [
          _match(
            categoryId: 'c1',
            matchType: 'Final',
            teamAId: 't1',
            teamBId: 't2',
            winnerId: 't1',
          ),
        ],
      );

      expect(podiums.single.places.first.teamName, 't1');
    });

    test('carries the configured prize of each place', () {
      final podiums = tournamentPodiumsByCategory(
        categories: [
          _category(
            id: 'c1',
            name: 'Masculino B',
            prizes: const [
              TournamentCategoryPrize(position: '1', value: 500),
              TournamentCategoryPrize(position: '2', value: 250),
            ],
          ),
        ],
        matches: [
          _match(
            categoryId: 'c1',
            matchType: 'Final',
            teamAId: 't1',
            teamBId: 't2',
            winnerId: 't1',
          ),
        ],
      );

      expect(podiums.single.places.map((p) => p.prizeValue), [500, 250]);
    });
  });

  group('tournamentPodiumAvailable', () {
    TournamentCategoryPodium decided() => const TournamentCategoryPodium(
          categoryId: 'c1',
          categoryName: 'Masculino B',
          places: [
            TournamentPodiumPlace(place: 1, teamId: 't1', teamName: 'Ana'),
            TournamentPodiumPlace(place: 2, teamId: 't2', teamName: 'Bia'),
          ],
        );

    TournamentCategoryPodium undecided() => const TournamentCategoryPodium(
          categoryId: 'c1',
          categoryName: 'Masculino B',
          places: [],
        );

    test('a terminal tournament shows the podium even with nothing decided',
        () {
      expect(
        tournamentPodiumAvailable(
          status: TournamentListingStatus.completed,
          podiums: [undecided()],
        ),
        isTrue,
      );
    });

    test('a decided final unlocks it before the organizer closes the event',
        () {
      expect(
        tournamentPodiumAvailable(
          status: TournamentListingStatus.live,
          podiums: [undecided(), decided()],
        ),
        isTrue,
      );
    });

    test('an ongoing tournament with no decided final stays hidden', () {
      expect(
        tournamentPodiumAvailable(
          status: TournamentListingStatus.live,
          podiums: [undecided()],
        ),
        isFalse,
      );
    });

    test('an open tournament with no categories stays hidden', () {
      expect(
        tournamentPodiumAvailable(
          status: TournamentListingStatus.open,
          podiums: const [],
        ),
        isFalse,
      );
    });

    test('a cancelled tournament is terminal but has no podium to show', () {
      expect(
        tournamentPodiumAvailable(
          status: TournamentListingStatus.ended,
          podiums: [undecided()],
          isCancelled: true,
        ),
        isFalse,
      );
    });

    test('a cancelled tournament still shows a final that was played', () {
      expect(
        tournamentPodiumAvailable(
          status: TournamentListingStatus.ended,
          podiums: [decided()],
          isCancelled: true,
        ),
        isTrue,
      );
    });
  });
}
