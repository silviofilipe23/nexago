import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/king_of_court_plan.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/organizer_category_generate_koc_page.dart';

/// O que o card da tela de gerar rodadas KOTC promete antes de publicar.
///
/// A tela tinha DERRUBADO a duração por rodada quando a categoria tem plano de
/// fases: o número único de antes mentia para planos com fases de durações
/// diferentes (a final costuma ser mais longa), e a saída foi não mostrar
/// nada. O total continuava certo, mas o organizador que alongou a final
/// perdia a única confirmação de que ela ficou mesmo mais longa.
KingOfCourtPhase phase({
  required List<int> bracketSizes,
  int roundsPerBracket = 1,
  int qualifiersPerRound = 1,
  int durationSec = 900,
}) => KingOfCourtPhase(
  bracketSizes: bracketSizes,
  roundsPerBracket: roundsPerBracket,
  qualifiersPerRound: qualifiersPerRound,
  durationSec: durationSec,
);

void main() {
  group('kocGeneratePlanBody · plano com fases de durações diferentes', () {
    final phases = [
      phase(bracketSizes: [5, 5], roundsPerBracket: 3, durationSec: 900),
      phase(bracketSizes: [6], roundsPerBracket: 4, durationSec: 900),
      phase(bracketSizes: [4], qualifiersPerRound: 0, durationSec: 1200),
    ];
    final schedule = kingOfCourtScheduleFromPhases(phases, courts: 1);
    final config = KingOfCourtConfig(maxTeamsPerRound: 6, phases: phases);
    final body = kocGeneratePlanBody(teamCount: 10, schedule: schedule, config: config);

    test('mostra a duração de CADA fase, alinhada com as rodadas por fase', () {
      expect(body, contains('Duração por fase: 15min → 15min → 20min.'));
    });

    test('a lista de durações tem uma entrada por fase, na mesma ordem das rodadas', () {
      expect(body, contains('(6 rodadas → 4 rodadas → 1 rodada)'));
      // Mesmo número de setas nas duas listas: é o que faz o organizador
      // conseguir ler uma sobre a outra.
      final rodadas = '6 rodadas → 4 rodadas → 1 rodada'.split('→').length;
      final duracoes = '15min → 15min → 20min'.split('→').length;
      expect(duracoes, rodadas);
    });

    test('a final mais longa aparece — é a informação que a tela tinha perdido', () {
      expect(body, contains('20min'));
    });

    test('não cita um número único de minutos: seria mentira para as outras fases', () {
      expect(body, isNot(contains('rodadas de 15 min')));
      expect(body, isNot(contains('rodadas de 20 min')));
    });

    test('mantém o total corrigido e o resto da frase', () {
      expect(body, startsWith('10 duplas · 11 rodadas em uma quadra'));
      expect(body, contains('já com trocas e intervalos'));
      expect(body, endsWith('A tabela da última rodada define o pódio.'));
    });
  });

  group('kocGeneratePlanBody · plano com todas as fases na mesma duração', () {
    final phases = [
      phase(bracketSizes: [4, 4], roundsPerBracket: 1, qualifiersPerRound: 2, durationSec: 900),
      phase(bracketSizes: [4], qualifiersPerRound: 0, durationSec: 900),
    ];
    final schedule = kingOfCourtScheduleFromPhases(phases, courts: 1);

    test('um número só, sem repetir o mesmo valor em fila', () {
      final body = kocGeneratePlanBody(
        teamCount: 8,
        schedule: schedule,
        config: KingOfCourtConfig(maxTeamsPerRound: 6, phases: phases),
      );
      expect(body, contains('rodadas de 15 min em uma quadra'));
      expect(body, isNot(contains('Duração por fase')));
      expect(body, isNot(contains('15min → 15min')));
    });

    test('a duração vem do PLANO, não do padrão da categoria', () {
      // Categoria com padrão de 10 min e plano congelado em 15: o honesto é o
      // do plano, que é o que a chave publicada vai usar.
      final body = kocGeneratePlanBody(
        teamCount: 8,
        schedule: schedule,
        config: KingOfCourtConfig(
          roundDurationSec: 600,
          maxTeamsPerRound: 6,
          phases: phases,
        ),
      );
      expect(body, contains('rodadas de 15 min'));
      expect(body, isNot(contains('rodadas de 10 min')));
    });
  });

  group('kocGeneratePlanBody · sem plano, nada muda', () {
    test('categoria sem plano continua com a frase e o número de antes', () {
      const config = KingOfCourtConfig(
        teamsPerCourt: 4,
        qualifiersPerRound: 2,
        roundDurationSec: 900,
      );
      final schedule = kingOfCourtSchedule(
        teamCount: 16,
        teamsPerCourt: config.teamsPerCourt,
        qualifiersPerRound: config.qualifiersPerRound,
        roundDurationSec: config.roundDurationSec,
      );
      final body = kocGeneratePlanBody(teamCount: 16, schedule: schedule, config: config);
      expect(body, contains('rodadas de 15 min em uma quadra'));
      expect(body, isNot(contains('Duração por fase')));
    });
  });

  group('kocGeneratePlanBody · os avisos continuam na frente da prévia', () {
    test('campo abaixo do piso do formato', () {
      final body = kocGeneratePlanBody(
        teamCount: 2,
        schedule: kingOfCourtSchedule(
          teamCount: 2,
          teamsPerCourt: 4,
          qualifiersPerRound: 2,
          roundDurationSec: 900,
        ),
        config: const KingOfCourtConfig(),
      );
      expect(body, contains('pelo menos 3'));
      expect(body, isNot(contains('Duração por fase')));
    });

    test('config que não reduz o campo', () {
      final schedule = kingOfCourtSchedule(
        teamCount: 16,
        teamsPerCourt: 4,
        qualifiersPerRound: 4,
        roundDurationSec: 900,
      );
      expect(schedule.isValid, isFalse, reason: 'pré-condição: a config não pode fechar');
      final body = kocGeneratePlanBody(
        teamCount: 16,
        schedule: schedule,
        config: const KingOfCourtConfig(qualifiersPerRound: 4),
      );
      expect(body, contains('não reduzem o campo'));
    });
  });
}
