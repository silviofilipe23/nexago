import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/features/ranking/data/ranking_repository.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_mapper.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

AppUserProfile _user({required String uid, required String fullName}) {
  return AppUserProfile(uid: uid, fullName: fullName);
}

/// Fake em memória: só os dois métodos que o mapper de equipes usa.
/// Qualquer outro acesso estoura via [noSuchMethod] — nada toca o Firestore.
class _FakeRankingRepository implements RankingRepository {
  _FakeRankingRepository({required this.rows, required this.teams});

  final List<TeamRankingRow> rows;
  final Map<String, RankingTeamPlayers> teams;

  @override
  Future<List<TeamRankingRow>> loadTeamRanking({int? year}) async => rows;

  @override
  Future<Map<String, RankingTeamPlayers>> loadTeamsMap(
    Iterable<String> teamIds,
  ) async {
    return {
      for (final id in teamIds)
        if (teams[id] != null) id: teams[id]!,
    };
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('RankingRepository.${invocation.memberName}');
}

class _FakeUsersRepository implements UsersRepository {
  @override
  Future<Map<String, AppUserProfile>> getUsersByIds(
    Iterable<String> uids,
  ) async {
    return const {};
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('UsersRepository.${invocation.memberName}');
}

void main() {
  group('teamDisplayName', () {
    test('uses team name when present', () {
      final name = teamDisplayName(
        team: const RankingTeamPlayers(teamId: 't1', teamName: 'Furacão'),
        player1: _user(uid: 'p1', fullName: 'Carlos Silva'),
        player2: _user(uid: 'p2', fullName: 'Carlos Mendes'),
      );
      expect(name, 'Furacão');
    });

    test('shows both first names with last-initial when they differ', () {
      final name = teamDisplayName(
        team: const RankingTeamPlayers(teamId: 't1'),
        player1: _user(uid: 'p1', fullName: 'Carlos Silva'),
        player2: _user(uid: 'p2', fullName: 'Carlos Mendes'),
      );
      expect(name, 'Carlos S. / Carlos M.');
    });

    test('falls back to full names when players share the same first name', () {
      final name = teamDisplayName(
        team: const RankingTeamPlayers(teamId: 't1'),
        player1: _user(uid: 'p1', fullName: 'Atleta Intermediário 20'),
        player2: _user(uid: 'p2', fullName: 'Atleta Open 24'),
      );
      expect(name, isNot(contains('Atleta / Atleta')));
      expect(name, contains('/'));
    });
  });

  group('buildTeamRankingListEntries', () {
    final rows = [
      const TeamRankingRow(
        rank: 1,
        teamId: 'legacy',
        totalPoints: 500,
        tournamentsCount: 3,
      ),
      const TeamRankingRow(
        rank: 2,
        teamId: 'trioF',
        totalPoints: 400,
        tournamentsCount: 2,
      ),
      const TeamRankingRow(
        rank: 3,
        teamId: 'trioM',
        totalPoints: 300,
        tournamentsCount: 2,
      ),
      const TeamRankingRow(
        rank: 4,
        teamId: 'ghost',
        totalPoints: 200,
        tournamentsCount: 1,
      ),
    ];
    // 'ghost' fica sem doc de equipe de propósito (formato desconhecido).
    final teams = <String, RankingTeamPlayers>{
      'legacy': const RankingTeamPlayers(
        teamId: 'legacy',
        player1Id: 'p1',
        player2Id: 'p2',
        gender: 'Masculino',
      ),
      'trioF': const RankingTeamPlayers(
        teamId: 'trioF',
        teamName: 'Trio F',
        gender: 'Feminino',
        teamSize: 3,
        memberUids: ['a', 'b', 'c'],
      ),
      'trioM': const RankingTeamPlayers(
        teamId: 'trioM',
        teamName: 'Trio M',
        gender: 'Masculino',
        memberUids: ['d', 'e', 'f'],
      ),
    };

    Future<List<RankingListEntry>> build(RankingPageFilter filter) {
      return buildTeamRankingListEntries(
        repo: _FakeRankingRepository(rows: rows, teams: teams),
        users: _FakeUsersRepository(),
        filter: filter,
        currentUid: null,
      );
    }

    test('formato all mantém todas as linhas, inclusive equipe sem doc',
        () async {
      final entries = await build(
        const RankingPageFilter(mode: RankingListMode.teams),
      );
      expect(
        entries.map((e) => e.entityId),
        ['legacy', 'trioF', 'trioM', 'ghost'],
      );
      expect(entries.map((e) => e.rank), [1, 2, 3, 4]);
    });

    test('filtro de formato renumera e esconde equipe sem doc', () async {
      final trios = await build(
        const RankingPageFilter(
          mode: RankingListMode.teams,
          format: RankingFormatFilter.trio,
        ),
      );
      expect(trios.map((e) => e.entityId), ['trioF', 'trioM']);
      expect(trios.map((e) => e.rank), [1, 2]);

      // Equipe sem doc não cai em "dupla" por padrão: só entra em all.
      final duplas = await build(
        const RankingPageFilter(
          mode: RankingListMode.teams,
          format: RankingFormatFilter.dupla,
        ),
      );
      expect(duplas.map((e) => e.entityId), ['legacy']);
      expect(duplas.single.rank, 1);
    });

    test('gênero e formato combinam (E lógico) e o recorte final renumera',
        () async {
      final entries = await build(
        const RankingPageFilter(
          mode: RankingListMode.teams,
          gender: RankingGenderFilter.male,
          format: RankingFormatFilter.trio,
        ),
      );
      expect(entries.map((e) => e.entityId), ['trioM']);
      expect(entries.single.rank, 1);
    });
  });
}
