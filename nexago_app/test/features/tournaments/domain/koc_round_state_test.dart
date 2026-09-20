import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/koc/koc_round_state.dart';

/// Leitura da rodada KOTC a partir do doc de `matches`.
///
/// O ponto sensível é o relógio: `endsAtMs` é derivado NO SERVIDOR e o cliente
/// só conta para trás. Se esta classe recalculasse prazo, mesa, telão e app
/// mostrariam tempos diferentes na mesma quadra.
void main() {
  const t0 = 1700000000000;
  final now = DateTime.fromMillisecondsSinceEpoch(t0);

  Map<String, dynamic> doc({
    Map<String, dynamic>? state,
    Map<String, dynamic>? clock,
    List<dynamic>? standings,
    int qualifiers = 2,
  }) {
    return {
      'kocTeamIds': ['A', 'B', 'C', 'D'],
      'kocConfig': {'qualifiersPerRound': qualifiers, 'durationSec': 900},
      if (state != null) 'kocState': state,
      if (clock != null) 'kocClock': clock,
      if (standings != null) 'kocStandings': standings,
    };
  }

  group('kocRoundStateFromMap', () {
    test('lê elenco, trono, fila e pontos', () {
      final round = kocRoundStateFromMap(
        doc(
          state: {
            'kingTeamId': 'A',
            'challengerTeamId': 'C',
            'queue': ['D', 'B'],
            'points': {'A': 2, 'B': 0, 'C': 1, 'D': 0},
            'rallies': 3,
            'servingTeamId': 'C',
          },
        ),
      );
      expect(round.teamIds, ['A', 'B', 'C', 'D']);
      expect(round.kingTeamId, 'A');
      expect(round.queue, ['D', 'B']);
      expect(round.pointsOf('A'), 2);
      expect(round.rallies, 3);
    });

    test('rodada sem relógio é rodada que não começou', () {
      expect(kocRoundStateFromMap(doc()).hasStarted, isFalse);
    });

    test('campo corrompido vira vazio, não exceção', () {
      // A mesa não pode ficar sem tela por um campo torto.
      final round = kocRoundStateFromMap({
        'kocTeamIds': ['A', '', 42, 'B'],
        'kocState': 'lixo',
        'kocClock': [1, 2],
        'kocStandings': 'lixo',
      });
      expect(round.teamIds, ['A', 'B']);
      expect(round.kingTeamId, '');
      expect(round.clock, isNull);
      expect(round.standings, isEmpty);
    });

    test('lê a tabela final ordenada por colocação', () {
      final round = kocRoundStateFromMap(
        doc(
          standings: [
            {'teamId': 'D', 'place': 2, 'points': 1, 'crowns': 1},
            {'teamId': 'A', 'place': 1, 'points': 2, 'crowns': 1},
          ],
        ),
      );
      expect(round.standings.map((s) => s.teamId), ['A', 'D']);
    });
  });

  group('KocClock', () {
    test('conta para trás até endsAtMs, sem recalcular prazo', () {
      final round = kocRoundStateFromMap(
        doc(clock: {'endsAtMs': t0 + 900000, 'durationSec': 900}),
      );
      expect(round.clock!.remainingSec(now), 900);
      expect(
        round.clock!.remainingSec(
          DateTime.fromMillisecondsSinceEpoch(t0 + 600000),
        ),
        300,
      );
    });

    test('não passa de zero', () {
      final round = kocRoundStateFromMap(
        doc(clock: {'endsAtMs': t0, 'durationSec': 900}),
      );
      expect(
        round.clock!.remainingSec(
          DateTime.fromMillisecondsSinceEpoch(t0 + 60000),
        ),
        0,
      );
      expect(round.clock!.isExpired(now), isTrue);
    });

    test('em pausa o tempo congela onde parou', () {
      final round = kocRoundStateFromMap(
        doc(
          clock: {
            'endsAtMs': t0 + 900000,
            'durationSec': 900,
            'pausedAtMs': t0 + 300000,
          },
        ),
      );
      expect(round.clock!.isPaused, isTrue);
      // Dez minutos de mundo real depois, ainda faltam 600s.
      expect(
        round.clock!.remainingSec(
          DateTime.fromMillisecondsSinceEpoch(t0 + 900000),
        ),
        600,
      );
    });

    test('formata o que a mesa lê de relance', () {
      final round = kocRoundStateFromMap(
        doc(clock: {'endsAtMs': t0 + 725000, 'durationSec': 900}),
      );
      expect(round.clock!.remainingLabel(now), '12:05');
    });
  });

  group('tabela ao vivo', () {
    KocRoundState withPoints(Map<String, dynamic> points, {int qualifiers = 2}) {
      return kocRoundStateFromMap(
        doc(
          qualifiers: qualifiers,
          state: {
            'kingTeamId': 'A',
            'challengerTeamId': 'B',
            'queue': ['C', 'D'],
            'points': points,
            'rallies': 4,
          },
        ),
      );
    }

    test('ordena por pontos, com a semeadura desempatando', () {
      final round = withPoints({'A': 1, 'B': 3, 'C': 1, 'D': 0});
      expect(round.liveOrder, ['B', 'A', 'C', 'D']);
    });

    test('aponta quem está empatado em pontos', () {
      final round = withPoints({'A': 1, 'B': 3, 'C': 1, 'D': 0});
      expect(round.tiedWith('A'), ['C']);
      expect(round.tiedWith('B'), isEmpty);
    });

    test('acusa o empate que atravessa o corte', () {
      // A e C empatam em 1 disputando a 2ª vaga: bola de ouro devida.
      expect(withPoints({'A': 1, 'B': 3, 'C': 1, 'D': 0}).hasQualifyingTie, isTrue);
    });

    test('empate abaixo do corte não é bola de ouro', () {
      // C e D empatam em 0 por 3º e 4º: não muda quem classifica.
      expect(withPoints({'A': 2, 'B': 3, 'C': 0, 'D': 0}).hasQualifyingTie, isFalse);
    });

    test('sem corte a decidir, não há empate a resolver', () {
      final round = withPoints({'A': 0, 'B': 0, 'C': 0, 'D': 0}, qualifiers: 4);
      expect(round.hasQualifyingTie, isFalse);
    });
  });
}
