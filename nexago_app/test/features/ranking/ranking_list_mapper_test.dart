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
  _FakeRankingRepository({
    this.rows = const [],
    this.teams = const {},
    this.athleteRows = const [],
  });

  final List<TeamRankingRow> rows;
  final Map<String, RankingTeamPlayers> teams;
  final List<AthleteRankingRow> athleteRows;
  final calls = <String>[];

  @override
  Future<List<TeamRankingRow>> loadTeamRankingForSport(
    String sportCode, {
    int? year,
  }) async {
    calls.add('teams:$sportCode:$year');
    return rows;
  }

  @override
  Future<List<AthleteRankingRow>> loadAthleteRankingForSport(
    String sportCode, {
    int? year,
  }) async {
    calls.add('athletes:$sportCode:$year');
    return athleteRows;
  }

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
  _FakeUsersRepository([this.profiles = const {}]);

  final Map<String, AppUserProfile> profiles;

  @override
  Future<Map<String, AppUserProfile>> getUsersByIds(
    Iterable<String> uids,
  ) async {
    return {
      for (final uid in uids)
        if (profiles[uid] != null) uid: profiles[uid]!,
    };
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
        sportCode: 'VOLEI_PRAIA',
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

  group('ranking por esporte (3b2)', () {
    test('lê o esporte e a temporada pedidos', () async {
      final repo = _FakeRankingRepository();
      await buildTeamRankingListEntries(
        repo: repo,
        users: _FakeUsersRepository(),
        filter: const RankingPageFilter(
          mode: RankingListMode.teams,
          year: 2026,
        ),
        sportCode: 'BEACH_TENNIS',
        currentUid: null,
      );
      await buildAthleteRankingListEntries(
        repo: repo,
        users: _FakeUsersRepository(),
        filter: const RankingPageFilter(),
        sportCode: 'FUTEVOLEI',
        currentUid: null,
      );
      expect(repo.calls, ['teams:BEACH_TENNIS:2026', 'athletes:FUTEVOLEI:null']);
    });

    test('nível do atleta é o do esporte do ranking (filtro e rótulo)',
        () async {
      final repo = _FakeRankingRepository(
        athleteRows: const [
          AthleteRankingRow(
            rank: 1,
            athleteId: 'a1',
            totalPoints: 800,
            tournamentsCount: 2,
          ),
        ],
      );
      final users = _FakeUsersRepository({
        'a1': const AppUserProfile(
          uid: 'a1',
          fullName: 'Ana Souza',
          primarySportFirestoreId: 'VOLEI_PRAIA',
          levelsBySportFirestore: {
            'VOLEI_PRAIA': 'iniciante_1',
            'BEACH_TENNIS': 'open',
          },
        ),
      });
      final open = await buildAthleteRankingListEntries(
        repo: repo,
        users: users,
        filter: const RankingPageFilter(level: RankingLevelFilter.open),
        sportCode: 'BEACH_TENNIS',
        currentUid: null,
      );
      expect(open.single.entityId, 'a1');
      expect(open.single.subtitle, startsWith('OPEN'));
    });
  });
}
