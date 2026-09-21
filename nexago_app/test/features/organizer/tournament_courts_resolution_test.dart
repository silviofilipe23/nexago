import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_logic.dart';

/// Quadras reais gravadas em `tournaments/{id}.courts` (2 quadras, nomes
/// customizados) — o formato dos torneios de produção.
List<Map<String, dynamic>> _twoRealCourts() => [
      {'id': 'c-areia-1', 'name': 'Areia 1', 'order': 1},
      {'id': 'c-areia-2', 'name': 'Areia 2', 'order': 2},
    ];

void main() {
  group('resolveTournamentCourts — courtsCount ausente vs. informado', () {
    test('courtsCount ausente preserva as quadras reais gravadas', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: null,
        courtsRaw: _twoRealCourts(),
      );

      expect(courts, hasLength(2));
      expect(courts.map((c) => c.id), ['c-areia-1', 'c-areia-2']);
      expect(courts.map((c) => c.name), ['Areia 1', 'Areia 2']);
    });

    test('courtsCount informado continua mandando quando discorda da lista',
        () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: 4,
        courtsRaw: _twoRealCourts(),
      );

      expect(courts, hasLength(4));
      expect(courts.map((c) => c.id), ['Q1', 'Q2', 'Q3', 'Q4']);
    });

    test('sem lista e sem contador cai no piso de 1 quadra', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: null,
        courtsRaw: null,
      );

      expect(courts, hasLength(1));
      expect(courts.single.id, 'Q1');
    });

    test('lista só com entradas inválidas e sem contador cai no piso de 1', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: null,
        courtsRaw: [
          {'id': '', 'name': 'sem id', 'order': 1},
          'lixo',
        ],
      );

      expect(courts, hasLength(1));
      expect(courts.single.id, 'Q1');
    });

    test('courtsCount 0 explícito ainda garante 1 quadra', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: 0,
        courtsRaw: null,
      );

      expect(courts, hasLength(1));
      expect(courts.single.id, 'Q1');
    });

    test('courtsCount informado igual ao tamanho preserva nomes customizados',
        () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: 2,
        courtsRaw: _twoRealCourts(),
      );

      expect(courts.map((c) => c.name), ['Areia 1', 'Areia 2']);
    });
  });

  group('courtsNeedSync — não destruir a lista real no Firestore', () {
    test('courtsCount ausente com quadras reais não regrava nada', () {
      expect(
        MatchOpsLogic.courtsNeedSync(
          courtsCount: null,
          courtsRaw: _twoRealCourts(),
        ),
        isFalse,
      );
    });

    test('courtsCount informado discordante ainda sincroniza', () {
      expect(
        MatchOpsLogic.courtsNeedSync(
          courtsCount: 4,
          courtsRaw: _twoRealCourts(),
        ),
        isTrue,
      );
    });

    test('sem lista gravada sincroniza', () {
      expect(
        MatchOpsLogic.courtsNeedSync(courtsCount: 2, courtsRaw: null),
        isTrue,
      );
      expect(
        MatchOpsLogic.courtsNeedSync(courtsCount: null, courtsRaw: const []),
        isTrue,
      );
    });

    test('lista já batendo com o contador informado não regrava', () {
      expect(
        MatchOpsLogic.courtsNeedSync(
          courtsCount: 2,
          courtsRaw: _twoRealCourts(),
        ),
        isFalse,
      );
    });
  });
}
