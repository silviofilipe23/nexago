import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_uniforms/tournament_uniforms_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_uniforms/tournament_uniforms_models.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/app_user_profile.dart';

OrganizerInscriptionWithTeam _inscription({
  required String registrationId,
  required String categoryId,
  String p1 = 'u1',
  String p2 = 'u2',
  String? sizeTopPlayer1,
  String? sizeTopPlayer2,
  int? jerseyNumberPlayer1,
  int? jerseyNumberPlayer2,
  bool waitlist = false,
}) {
  return (
    registrationId: registrationId,
    inscription: {
      'categoryId': categoryId,
      if (waitlist) 'waitlist': true,
      if (sizeTopPlayer1 != null) 'sizeTopPlayer1': sizeTopPlayer1,
      if (sizeTopPlayer2 != null) 'sizeTopPlayer2': sizeTopPlayer2,
      if (jerseyNumberPlayer1 != null) 'jerseyNumberPlayer1': jerseyNumberPlayer1,
      if (jerseyNumberPlayer2 != null) 'jerseyNumberPlayer2': jerseyNumberPlayer2,
    },
    team: {
      'player1Id': p1,
      'player2Id': p2,
    },
  );
}

List<OrganizerUniformCategoryConfig> _kitConfigs() => [
      const OrganizerUniformCategoryConfig(
        categoryId: 'sub19m',
        name: 'Sub 19 M',
        uniformType: 'top_only',
        uniformNumberOnShirt: true,
      ),
      const OrganizerUniformCategoryConfig(
        categoryId: 'fem',
        name: 'Feminino',
        uniformType: 'none',
      ),
    ];

Map<String, AppUserProfile> _profiles() => {
      'u1': const AppUserProfile(uid: 'u1', fullName: 'Ana Silva'),
      'u2': const AppUserProfile(uid: 'u2', fullName: 'Enzo Lima'),
      'u3': const AppUserProfile(uid: 'u3', fullName: 'Bruno Costa'),
    };

void main() {
  group('flattenInscriptionsToUniformRows', () {
    test('creates one row per player with uniform category', () {
      final rows = flattenInscriptionsToUniformRows(
        inscriptions: [
          _inscription(
            registrationId: 'r1',
            categoryId: 'sub19m',
            sizeTopPlayer1: 'M',
            jerseyNumberPlayer1: 7,
            sizeTopPlayer2: 'G',
            jerseyNumberPlayer2: 12,
          ),
        ],
        categoryConfigs: _kitConfigs(),
        profilesByUid: _profiles(),
      );
      expect(rows.length, 2);
      expect(rows[0].athleteName, 'Ana Silva');
      expect(rows[0].sizeTop, 'M');
      expect(rows[0].jerseyNumber, 7);
      expect(rows[0].partnerShortName, 'c/ Enzo L.');
      expect(rows[1].athleteName, 'Enzo Lima');
      expect(rows[1].isComplete, isTrue);
    });

    test('ignores waitlist and categories without kit', () {
      final rows = flattenInscriptionsToUniformRows(
        inscriptions: [
          _inscription(
            registrationId: 'r1',
            categoryId: 'sub19m',
            waitlist: true,
          ),
          _inscription(
            registrationId: 'r2',
            categoryId: 'fem',
            p1: 'u3',
            p2: '',
          ),
        ],
        categoryConfigs: _kitConfigs(),
        profilesByUid: _profiles(),
      );
      expect(rows, isEmpty);
    });

    test('skips player without id', () {
      final rows = flattenInscriptionsToUniformRows(
        inscriptions: [
          _inscription(
            registrationId: 'r1',
            categoryId: 'sub19m',
            p1: 'u1',
            p2: '',
            sizeTopPlayer1: 'P',
            jerseyNumberPlayer1: 3,
          ),
        ],
        categoryConfigs: _kitConfigs(),
        profilesByUid: _profiles(),
      );
      expect(rows.length, 1);
      expect(rows.single.athleteUid, 'u1');
    });
  });

  group('isUniformRowComplete', () {
    test('requires jersey number when configured', () {
      const config = OrganizerUniformCategoryConfig(
        categoryId: 'c',
        name: 'Cat',
        uniformType: 'top_only',
        uniformNumberOnShirt: true,
      );
      expect(
        isUniformRowComplete(
          config: config,
          sizeTop: 'M',
          jerseyNumber: null,
        ),
        isFalse,
      );
      expect(
        isUniformRowComplete(
          config: config,
          sizeTop: 'M',
          jerseyNumber: 10,
        ),
        isTrue,
      );
    });

    test('complete with size only when number not required', () {
      const config = OrganizerUniformCategoryConfig(
        categoryId: 'c',
        name: 'Cat',
        uniformType: 'top',
        uniformNumberOnShirt: false,
      );
      expect(
        isUniformRowComplete(
          config: config,
          sizeTop: 'GG',
          jerseyNumber: null,
        ),
        isTrue,
      );
    });
  });

  group('buildUniformsSummary', () {
    test('aggregates by size and pending counts', () {
      final rows = [
        const OrganizerUniformAthleteRow(
          athleteUid: '1',
          athleteName: 'A',
          initials: 'A',
          categoryId: 'c',
          categoryLabel: 'Cat',
          partnerShortName: '',
          sizeTop: 'M',
          isComplete: true,
        ),
        const OrganizerUniformAthleteRow(
          athleteUid: '2',
          athleteName: 'B',
          initials: 'B',
          categoryId: 'c',
          categoryLabel: 'Cat',
          partnerShortName: '',
          sizeTop: 'M',
          isComplete: true,
        ),
        const OrganizerUniformAthleteRow(
          athleteUid: '3',
          athleteName: 'C',
          initials: 'C',
          categoryId: 'c',
          categoryLabel: 'Cat',
          partnerShortName: '',
          isComplete: false,
        ),
      ];
      final summary = buildUniformsSummary(rows);
      expect(summary.totalAthletes, 3);
      expect(summary.confirmedCount, 2);
      expect(summary.pendingCount, 1);
      expect(summary.countBySize['M'], 2);
      expect(summary.pendingWithoutSize, 1);
    });
  });

  group('filterUniformRows', () {
    final rows = [
      const OrganizerUniformAthleteRow(
        athleteUid: '1',
        athleteName: 'A',
        initials: 'A',
        categoryId: 'sub19m',
        categoryLabel: 'Sub 19 M',
        partnerShortName: '',
        sizeTop: 'M',
        isComplete: true,
      ),
      const OrganizerUniformAthleteRow(
        athleteUid: '2',
        athleteName: 'B',
        initials: 'B',
        categoryId: 'sub19m',
        categoryLabel: 'Sub 19 M',
        partnerShortName: '',
        sizeTop: 'G',
        isComplete: true,
      ),
      const OrganizerUniformAthleteRow(
        athleteUid: '3',
        athleteName: 'C',
        initials: 'C',
        categoryId: 'fem',
        categoryLabel: 'Fem',
        partnerShortName: '',
        isComplete: false,
      ),
    ];

    test('filters by size M', () {
      final filtered = filterUniformRows(rows, sizeTop: 'M');
      expect(filtered.length, 1);
      expect(filtered.single.athleteUid, '1');
    });

    test('filters pending only', () {
      final filtered = filterUniformRows(rows, pendingOnly: true);
      expect(filtered.length, 1);
      expect(filtered.single.athleteUid, '3');
    });

    test('filters by category', () {
      final filtered = filterUniformRows(rows, categoryId: 'sub19m');
      expect(filtered.length, 2);
    });
  });

  group('buildUniformsExportCsv', () {
    test('includes header totals and athlete rows', () {
      final summary = const OrganizerUniformsSummary(
        totalAthletes: 1,
        confirmedCount: 1,
        pendingCount: 0,
        countBySize: {'M': 1},
        sizeOrder: ['M'],
      );
      final rows = [
        const OrganizerUniformAthleteRow(
          athleteUid: '1',
          athleteName: 'Ana Silva',
          initials: 'AS',
          categoryId: 'c',
          categoryLabel: 'Sub 19 M',
          partnerShortName: 'c/ Enzo L.',
          sizeTop: 'M',
          jerseyNumber: 7,
          isComplete: true,
        ),
      ];
      final csv = buildUniformsExportCsv(
        summary: summary,
        rows: rows,
        tournamentName: 'Copa Teste',
      );
      expect(csv, contains('Torneio,Copa Teste'));
      expect(csv, contains('Resumo por tamanho'));
      expect(csv, contains('M,1'));
      expect(csv, contains('Nome,Categoria,Parceiro,Tamanho,Numero,Status'));
      expect(csv, contains('"Ana Silva","Sub 19 M"'));
      expect(csv, contains('Confirmado'));
    });
  });

  group('tournamentUniformEnabled', () {
    test('true when uniformRequired flag set', () {
      expect(
        tournamentUniformEnabled(
          tournament: {'uniformRequired': true},
          categoryConfigs: const [],
        ),
        isTrue,
      );
    });

    test('true when any category requires uniform', () {
      expect(
        tournamentUniformEnabled(
          tournament: const {},
          categoryConfigs: [
            const OrganizerUniformCategoryConfig(
              categoryId: 'c',
              name: 'Cat',
              uniformType: 'full',
            ),
          ],
        ),
        isTrue,
      );
    });
  });
}
