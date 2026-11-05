import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/blog/domain/blog_embed_logic.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';

ArenaSlot _slot(
  String courtId,
  String start, {
  String status = 'available',
  DateTime? day,
}) {
  final h = int.parse(start.split(':').first);
  return ArenaSlot(
    id: '$courtId-$start',
    arenaId: 'a1',
    courtId: courtId,
    date: day ?? DateTime(2026, 11, 5),
    startTime: start,
    endTime: '${(h + 1).toString().padLeft(2, '0')}:00',
    rawStatus: status,
  );
}

void main() {
  group('parser', () {
    List<BlogBlock> parse(List<Object?> body) =>
        BlogPost.fromMap('p', {'title': 'Post', 'body': body})!.body;

    test('arena e ranking válidos', () {
      final body = parse([
        {'type': 'arena', 'arenaId': 'a1'},
        {
          'type': 'ranking',
          'sport': 'beachVolleyball',
          'mode': 'teams',
          'gender': 'feminino',
        },
      ]);
      expect((body[0] as BlogArenaEmbed).arenaId, 'a1');
      expect(
        body[1],
        const BlogRankingEmbed(
          sport: 'beachVolleyball',
          mode: BlogRankingMode.teams,
          gender: BlogRankingGender.feminino,
        ),
      );
    });

    test('modo ou gênero desconhecido, sem esporte ou sem arena: descarta', () {
      final body = parse([
        {'type': 'arena', 'arenaId': ' '},
        {'type': 'arena'},
        {
          'type': 'ranking',
          'sport': 'beachVolleyball',
          'mode': 'clubs',
          'gender': 'all',
        },
        {
          'type': 'ranking',
          'sport': 'beachVolleyball',
          'mode': 'athletes',
          'gender': 'outro',
        },
        {'type': 'ranking', 'sport': '', 'mode': 'athletes', 'gender': 'all'},
        {'type': 'ranking', 'mode': 'athletes', 'gender': 'all'},
      ]);
      expect(body, isEmpty);
    });
  });

  group('horários livres de hoje', () {
    final now = DateTime(2026, 11, 5, 14, 20);
    final today = DateTime(2026, 11, 5);
    const courts = [
      ArenaCourt(id: 'q1', name: 'Quadra 1'),
      ArenaCourt(id: 'q2', name: 'Quadra 2'),
      ArenaCourt(
        id: 'q3',
        name: 'Quadra 3',
        status: ArenaCourtStatus.maintenance,
      ),
    ];

    test('só livres e ainda reserváveis, sem repetir início, em ordem', () {
      final times = blogArenaFreeTimes(
        courts: courts,
        today: today,
        now: now,
        slotsByCourtId: {
          'q1': [
            _slot('q1', '13:00'), // já passou
            _slot('q1', '14:00'), // começou há 20 min: passou do corte
            _slot('q1', '16:00', status: 'booked'),
            _slot('q1', '18:00'),
          ],
          'q2': [_slot('q2', '15:00'), _slot('q2', '18:00')],
          'q3': [_slot('q3', '15:30')], // manutenção
        },
      );
      expect(times.map((t) => t.startTime), ['15:00', '18:00']);
      // 18:00 fica com a primeira quadra, na ordem das quadras.
      expect(times[1].courtId, 'q1');
    });

    test('no máximo 4', () {
      final times = blogArenaFreeTimes(
        courts: courts,
        today: today,
        now: now,
        slotsByCourtId: {
          'q1': [
            for (final h in ['15', '16', '17', '18', '19', '20'])
              _slot('q1', '$h:00'),
          ],
        },
      );
      expect(times.map((t) => t.startTime), [
        '15:00',
        '16:00',
        '17:00',
        '18:00',
      ]);
    });

    test('sem horário livre: lista vazia', () {
      expect(
        blogArenaFreeTimes(
          courts: courts,
          today: today,
          now: now,
          slotsByCourtId: const {},
        ),
        isEmpty,
      );
    });
  });

  group('recorte do ranking', () {
    test('esporte pelo código de perfil, modo e gênero da tela', () {
      final f = blogRankingFilter(
        const BlogRankingEmbed(
          sport: 'beachVolleyball',
          mode: BlogRankingMode.teams,
          gender: BlogRankingGender.misto,
        ),
        year: 2026,
      )!;
      expect(f.sport, 'VOLEI_PRAIA');
      expect(f.mode, RankingListMode.teams);
      expect(f.gender, RankingGenderFilter.mixed);
      expect(f.year, 2026);
      expect(f.level, RankingLevelFilter.all);
      expect(f.format, RankingFormatFilter.all);
    });

    test('gêneros', () {
      RankingGenderFilter g(BlogRankingGender gender) => blogRankingFilter(
        BlogRankingEmbed(
          sport: 'beachVolleyball',
          mode: BlogRankingMode.athletes,
          gender: gender,
        ),
        year: 2026,
      )!.gender;
      expect(g(BlogRankingGender.all), RankingGenderFilter.all);
      expect(g(BlogRankingGender.masculino), RankingGenderFilter.male);
      expect(g(BlogRankingGender.feminino), RankingGenderFilter.female);
    });

    test('esporte desconhecido: sem recorte (o bloco some)', () {
      expect(
        blogRankingFilter(
          const BlogRankingEmbed(
            sport: 'quadribol',
            mode: BlogRankingMode.athletes,
            gender: BlogRankingGender.all,
          ),
          year: 2026,
        ),
        isNull,
      );
    });
  });
}
