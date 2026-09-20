import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/king_of_court_plan.dart';

/// Espelho Dart de `functions/src/koc-bracket-builders.ts`.
///
/// Se as duas contas divergirem, o organizador vê uma estimativa no wizard e
/// publica outra chave — por isso os casos aqui são os MESMOS do teste do
/// backend (`koc-bracket-builders.test.ts`).
void main() {
  group('kocRoundCount', () {
    test('divide pelo número de duplas por quadra quando fecha', () {
      expect(kocRoundCount(16, 4), 4);
      expect(kocRoundCount(8, 4), 2);
      expect(kocRoundCount(12, 4), 3);
    });

    test('junta em vez de deixar rodada com menos de 3 duplas', () {
      expect(kocRoundCount(5, 4), 1);
      expect(kocRoundCount(7, 4), 2);
    });

    test('mantém as rodadas entre 3 e 5 duplas em qualquer campo', () {
      for (var n = 3; n <= 40; n++) {
        for (final perCourt in [3, 4, 5]) {
          final rounds = kocRoundCount(n, perCourt);
          final maior = (n / rounds).ceil();
          final menor = n ~/ rounds;
          expect(maior, lessThanOrEqualTo(kocMaxTeamsPerRound), reason: '$n/$perCourt');
          expect(menor, greaterThanOrEqualTo(kocMinTeamsPerRound), reason: '$n/$perCourt');
        }
      }
    });

    test('devolve 0 quando o campo não fecha uma rodada', () {
      expect(kocRoundCount(2, 4), 0);
    });
  });

  group('kocRoundsPerPhase', () {
    test('16 duplas fecham em 4 → 2 → 1', () {
      expect(
        kocRoundsPerPhase(teamCount: 16, teamsPerCourt: 4, qualifiersPerRound: 2),
        [4, 2, 1],
      );
    });

    test('8 duplas fecham em 2 fases', () {
      expect(
        kocRoundsPerPhase(teamCount: 8, teamsPerCourt: 4, qualifiersPerRound: 2),
        [2, 1],
      );
    });

    test('campo que cabe numa rodada é a própria final', () {
      expect(
        kocRoundsPerPhase(teamCount: 4, teamsPerCourt: 4, qualifiersPerRound: 2),
        [1],
      );
    });

    test('recusa configuração que não reduz o campo entre as fases', () {
      // 4 classificadas em quadras de 4: a fase inteira passa, e a geração
      // entraria em laço. O wizard precisa avisar antes.
      expect(
        kocRoundsPerPhase(teamCount: 16, teamsPerCourt: 4, qualifiersPerRound: 4),
        isEmpty,
      );
    });

    test('recusa campo menor que uma rodada', () {
      expect(
        kocRoundsPerPhase(teamCount: 2, teamsPerCourt: 4, qualifiersPerRound: 2),
        isEmpty,
      );
    });
  });

  group('kingOfCourtSchedule', () {
    KingOfCourtSchedule schedule16({int courts = 1, int durationSec = 900}) {
      return kingOfCourtSchedule(
        teamCount: 16,
        teamsPerCourt: 4,
        qualifiersPerRound: 2,
        roundDurationSec: durationSec,
        courts: courts,
      );
    }

    test('a 1ª etapa: 16 duplas numa quadra dão 7 rodadas e 2h35', () {
      final s = schedule16();
      expect(s.totalRounds, 7);
      expect(s.phaseCount, 3);
      expect(s.totalLabel, '2h35');
    });

    test('é o paralelismo, não a duração, que domina o dia', () {
      expect(schedule16(courts: 2).totalLabel, '1h35');
      expect(schedule16(courts: 4).totalLabel, '1h15');
    });

    test('duração da rodada move o total de forma previsível', () {
      expect(schedule16(durationSec: 600).totalLabel, '2h');
      expect(schedule16(durationSec: 1200).totalLabel, '3h10');
    });

    test('prende a duração nos limites do formato', () {
      // Valor absurdo não pode virar uma estimativa absurda no wizard.
      expect(schedule16(durationSec: 30).totalLabel, schedule16(durationSec: kocMinRoundDurationSec).totalLabel);
      expect(schedule16(durationSec: 99999).totalLabel, schedule16(durationSec: kocMaxRoundDurationSec).totalLabel);
    });

    test('configuração inválida não produz estimativa', () {
      final s = kingOfCourtSchedule(
        teamCount: 16,
        teamsPerCourt: 4,
        qualifiersPerRound: 4,
        roundDurationSec: 900,
      );
      expect(s.isValid, isFalse);
      expect(s.totalDuration, Duration.zero);
    });
  });

  group('kingOfCourtConfigFromCategory', () {
    test('lê o que o wizard gravou', () {
      final config = kingOfCourtConfigFromCategory({
        'teamsPerCourt': 5,
        'qualifiersPerRound': 1,
        'roundDurationSec': 1200,
      });
      expect(config.teamsPerCourt, 5);
      expect(config.qualifiersPerRound, 1);
      expect(config.roundDurationSec, 1200);
    });

    test('cai nos padrões do formato quando falta campo', () {
      final config = kingOfCourtConfigFromCategory(null);
      expect(config.teamsPerCourt, kocDefaultTeamsPerCourt);
      expect(config.qualifiersPerRound, kocDefaultQualifiersPerRound);
      expect(config.roundDurationSec, kocDefaultRoundDurationSec);
    });

    test('ignora valor inválido em vez de propagar lixo', () {
      final config = kingOfCourtConfigFromCategory({
        'teamsPerCourt': 0,
        'qualifiersPerRound': 'x',
        'roundDurationSec': -5,
      });
      expect(config.teamsPerCourt, kocDefaultTeamsPerCourt);
      expect(config.qualifiersPerRound, kocDefaultQualifiersPerRound);
      expect(config.roundDurationSec, kocDefaultRoundDurationSec);
    });

    test('os nomes dos campos são os que o backend lê', () {
      // `resolveKocConfig` em organizer-category-ops.ts lê exatamente estes.
      expect(
        const KingOfCourtConfig().toBracketConfig().keys.toSet(),
        {'teamsPerCourt', 'qualifiersPerRound', 'roundDurationSec'},
      );
    });
  });
}
