import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_category_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

TournamentMatch _match({
  required String id,
  required String categoryId,
  String teamAId = 'meu-time',
  String teamBId = 'outro',
  String status = 'Scheduled',
  int matchNumber = 0,
  DateTime? endedAt,
  DateTime? scheduleTime,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: categoryId,
    round: 1,
    matchType: 'WB',
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    matchEndedAt: endedAt,
    scheduleTime: scheduleTime,
  );
}

String? _resolve({
  String? next,
  List<TournamentMatch> matches = const [],
  Set<String> teamIds = const {'meu-time'},
  List<String> registered = const [],
}) {
  return resolveFocusCategoryId(
    nextMatchCategoryId: next,
    matches: matches,
    athleteTeamIds: teamIds,
    registeredCategoryIdsInOfferOrder: registered,
  );
}

void main() {
  group('resolveFocusCategoryId', () {
    test('a próxima partida manda, e nem olha o resto', () {
      expect(
        _resolve(
          next: 'cat-next',
          matches: [_match(id: 'm1', categoryId: 'cat-outra')],
          registered: const ['cat-inscrito'],
        ),
        'cat-next',
      );
    });

    test('sem próxima partida HOJE, cai na partida por jogar de outro dia', () {
      // `pickAthleteNextMatch` descarta partida de outro dia; a escada não.
      expect(
        _resolve(
          matches: [
            _match(id: 'm1', categoryId: 'cat-b', matchNumber: 5),
            _match(id: 'm2', categoryId: 'cat-a', matchNumber: 2),
          ],
          registered: const ['cat-z'],
        ),
        'cat-a',
      );
    });

    test('eliminado: cai na ÚLTIMA partida jogada', () {
      final d = DateTime(2026, 8, 21, 9);
      expect(
        _resolve(
          matches: [
            _match(
              id: 'm1',
              categoryId: 'cat-a',
              status: 'Completed',
              endedAt: d,
            ),
            _match(
              id: 'm2',
              categoryId: 'cat-b',
              status: 'Completed',
              endedAt: d.add(const Duration(hours: 2)),
            ),
          ],
        ),
        'cat-b',
      );
    });

    test('partida por jogar vence partida já jogada', () {
      // O Focus olha para frente: estar vivo em `cat-a` importa mais do que
      // ter encerrado a campanha em `cat-b`.
      expect(
        _resolve(
          matches: [
            _match(
              id: 'm1',
              categoryId: 'cat-b',
              status: 'Completed',
              endedAt: DateTime(2026, 8, 21, 9),
            ),
            _match(id: 'm2', categoryId: 'cat-a', matchNumber: 9),
          ],
        ),
        'cat-a',
      );
    });

    test('chave ainda não sorteada: cai na inscrição, na ordem das ofertas',
        () {
      expect(
        _resolve(matches: const [], registered: const ['cat-a', 'cat-b']),
        'cat-a',
      );
    });

    test('partida de outro atleta não conta', () {
      // O recorte é por time do atleta — sem isso a categoria em foco viria
      // da campanha de um estranho.
      expect(
        _resolve(
          matches: [
            _match(
              id: 'm1',
              categoryId: 'cat-alheia',
              teamAId: 'x',
              teamBId: 'y',
            ),
          ],
          registered: const ['cat-minha'],
        ),
        'cat-minha',
      );
    });

    test('sem partida e sem inscrição não inventa categoria', () {
      expect(_resolve(), isNull);
    });

    test('id em branco não passa por categoria', () {
      expect(_resolve(next: '   ', registered: const ['cat-a']), 'cat-a');
    });
  });
}
