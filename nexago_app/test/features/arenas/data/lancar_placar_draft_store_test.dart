import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/lancar_placar_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_json.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _result = BookingResult(
  teams: [
    ResultTeam(
      id: 0,
      customName: 'Os Brabos',
      players: [
        ResultPlayer(id: 'u1', name: 'Maria', avatarUrl: 'https://x/m.jpg')
      ],
    ),
    ResultTeam(id: 1, players: [ResultPlayer(id: 'u2', name: 'Enzo')]),
  ],
  games: [
    ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 18),
    ResultGame(teamA: 1, teamB: 0, scoreA: 21, scoreB: 15),
  ],
);

void main() {
  test('JSON do placar ida e volta mantém times, nomes, fotos e jogos', () {
    final back = bookingResultFromJson(bookingResultToJson(_result));
    expect(back.teams.first.customName, 'Os Brabos');
    expect(back.teams.first.players.single.avatarUrl, 'https://x/m.jpg');
    expect(
      [for (final g in back.games) (g.teamA, g.teamB, g.scoreA, g.scoreB)],
      [(0, 1, 21, 18), (1, 0, 21, 15)],
    );
  });

  test('jogo de time inexistente é descartado', () {
    final json = bookingResultToJson(_result);
    (json['games'] as List).add({'a': 0, 'b': 9, 'sa': 1, 'sb': 2});
    expect(bookingResultFromJson(json).games.length, 2);
  });

  group('SharedPrefsLancarPlacarDraftStore', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('guarda, lê e apaga por reserva', () async {
      final store = SharedPrefsLancarPlacarDraftStore();
      await store.save(
        'b1',
        const LancarPlacarDraft(result: _result, baseVersion: 2),
      );
      final draft = await store.load('b1');
      expect(draft?.baseVersion, 2);
      expect(draft?.result.games.length, 2);
      expect(await store.load('b2'), isNull);
      await store.clear('b1');
      expect(await store.load('b1'), isNull);
    });

    test('sem reserva não guarda nada', () async {
      final store = SharedPrefsLancarPlacarDraftStore();
      await store.save(
          ' ', const LancarPlacarDraft(result: _result, baseVersion: 0));
      expect(await store.load(' '), isNull);
    });

    test('rascunho com mais de 7 dias é descartado', () async {
      var now = DateTime(2026, 11, 1);
      final store = SharedPrefsLancarPlacarDraftStore(clock: () => now);
      await store.save(
        'b1',
        const LancarPlacarDraft(result: _result, baseVersion: 0),
      );
      now = now.add(const Duration(days: 8));
      expect(await store.load('b1'), isNull);
    });
  });

  test('só retoma o rascunho feito sobre o placar que está no servidor', () {
    const draft = LancarPlacarDraft(result: _result, baseVersion: 1);
    expect(lancarDraftToResume(draft, savedVersion: 1), same(_result));
    expect(lancarDraftToResume(draft, savedVersion: 2), isNull);
    expect(lancarDraftToResume(null, savedVersion: 0), isNull);
  });
}
