// Testes dos KPIs e da série de evolução da Home do atleta.
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_dashboard_logic.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';

AthleteMatchHistoryItem makeMatch({
  required String id,
  required DateTime playedAt,
  bool win = true,
}) {
  return AthleteMatchHistoryItem(
    id: id,
    playedAt: playedAt,
    result: win ? AthleteMatchResult.win : AthleteMatchResult.loss,
    opponentLabel: 'Adversário',
    competitionLabel: 'Copa Teste',
    scoreDisplay: '2–1',
  );
}

GamificationSummary makeGamification({int streak = 0}) {
  return GamificationSummary(
    xp: 0,
    level: 0,
    streak: streak,
    totalGames: 0,
    lastGameDate: null,
    updatedAt: null,
  );
}

CompeteHubUserRanking makeRanking({
  int rank = 5,
  int points = 1200,
  int tournamentsCount = 4,
  bool isUnranked = false,
}) {
  return CompeteHubUserRanking(
    rank: rank,
    seasonLabel: 'TEMPORADA 2026',
    subtitle: 'Ranking geral',
    points: points,
    tournamentsCount: tournamentsCount,
    isUnranked: isUnranked,
  );
}

List<AthleteHomeKpi> buildKpis({
  List<AthleteMatchHistoryItem> matches = const [],
  int streak = 0,
  CompeteHubUserRanking? ranking,
  DateTime? now,
}) {
  return buildAthleteHomeKpis(
    matches: matches,
    gamification: makeGamification(streak: streak),
    ranking: ranking,
    now: now ?? DateTime(2026, 8, 15),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  group('monthKeyOf', () {
    test('chave ano*12+mês é contígua na virada de ano', () {
      expect(monthKeyOf(DateTime(2026, 1, 5)), 2026 * 12);
      expect(monthKeyOf(DateTime(2025, 12, 31)), 2026 * 12 - 1);
      expect(
        monthKeyOf(DateTime(2026, 1, 5)) - monthKeyOf(DateTime(2025, 12, 31)),
        1,
      );
    });
  });

  group('buildAthleteHomeKpis — Jogos no mês', () {
    test('conta só o mês corrente e compara com o anterior', () {
      final kpis = buildKpis(
        matches: [
          makeMatch(id: 'm1', playedAt: DateTime(2026, 8, 2)),
          makeMatch(id: 'm2', playedAt: DateTime(2026, 8, 10)),
          makeMatch(id: 'm3', playedAt: DateTime(2026, 8, 14)),
          makeMatch(id: 'm4', playedAt: DateTime(2026, 7, 20)),
          makeMatch(id: 'm5', playedAt: DateTime(2026, 6, 5)),
        ],
      );

      expect(kpis[0].label, 'Jogos no mês');
      expect(kpis[0].value, '3');
      expect(kpis[0].delta, '+2');
      expect(kpis[0].note, 'vs mês anterior');
      expect(kpis[0].tone, AthleteHomeKpiTone.green);
      expect(kpis[0].arrow, isTrue);
    });

    test('delta negativo fica laranja e sem prefixo +', () {
      final kpis = buildKpis(
        matches: [
          makeMatch(id: 'm1', playedAt: DateTime(2026, 8, 2)),
          makeMatch(id: 'm2', playedAt: DateTime(2026, 7, 3)),
          makeMatch(id: 'm3', playedAt: DateTime(2026, 7, 10)),
          makeMatch(id: 'm4', playedAt: DateTime(2026, 7, 25)),
        ],
      );

      expect(kpis[0].value, '1');
      expect(kpis[0].delta, '-2');
      expect(kpis[0].tone, AthleteHomeKpiTone.orange);
    });

    test('virada de ano compara janeiro com dezembro', () {
      final kpis = buildKpis(
        matches: [
          makeMatch(id: 'm1', playedAt: DateTime(2026, 1, 4)),
          makeMatch(id: 'm2', playedAt: DateTime(2026, 1, 8)),
          makeMatch(id: 'm3', playedAt: DateTime(2025, 12, 28)),
        ],
        now: DateTime(2026, 1, 10),
      );

      expect(kpis[0].value, '2');
      expect(kpis[0].delta, '+1');
      expect(kpis[0].tone, AthleteHomeKpiTone.green);
    });

    test('sem partidas: zero com delta +0 verde', () {
      final kpis = buildKpis();

      expect(kpis[0].value, '0');
      expect(kpis[0].delta, '+0');
      expect(kpis[0].tone, AthleteHomeKpiTone.green);
    });
  });

  group('buildAthleteHomeKpis — Vitórias', () {
    test('percentual arredondado e placar XV · YD', () {
      final kpis = buildKpis(
        matches: [
          makeMatch(id: 'm1', playedAt: DateTime(2026, 8, 2)),
          makeMatch(id: 'm2', playedAt: DateTime(2026, 8, 3)),
          makeMatch(id: 'm3', playedAt: DateTime(2026, 7, 4), win: false),
        ],
      );

      expect(kpis[1].label, 'Vitórias');
      expect(kpis[1].value, '67%');
      expect(kpis[1].delta, '2V · 1D');
      expect(kpis[1].note, 'partidas de torneio');
      expect(kpis[1].tone, AthleteHomeKpiTone.green);
    });

    test('sem partidas vira travessão', () {
      final kpis = buildKpis();

      expect(kpis[1].value, '—');
      expect(kpis[1].delta, '0V · 0D');
    });
  });

  group('buildAthleteHomeKpis — Sequência', () {
    test('singular pra 1 dia', () {
      final kpis = buildKpis(streak: 1);

      expect(kpis[2].label, 'Sequência');
      expect(kpis[2].value, '1 dia');
    });

    test('plural com chama e tom laranja', () {
      final kpis = buildKpis(streak: 3);

      expect(kpis[2].value, '3 dias');
      expect(kpis[2].delta, 'em jogo');
      expect(kpis[2].tone, AthleteHomeKpiTone.orange);
      expect(kpis[2].flame, isTrue);
    });
  });

  group('buildAthleteHomeKpis — Ranking', () {
    test('ranqueado mostra posição, pontos pt-BR e torneios', () {
      final kpis = buildKpis(ranking: makeRanking());

      expect(kpis[3].label, 'Ranking');
      expect(kpis[3].value, '#5');
      expect(kpis[3].delta, '1.200 pts');
      expect(kpis[3].note, '4 torneios');
    });

    test('um torneio no singular', () {
      final kpis = buildKpis(ranking: makeRanking(tournamentsCount: 1));

      expect(kpis[3].note, '1 torneio');
    });

    test('sem ranking (null) vira travessão com notas neutras', () {
      final kpis = buildKpis();

      expect(kpis[3].value, '—');
      expect(kpis[3].delta, 'sem pontos');
      expect(kpis[3].note, 'temporada');
    });

    test('isUnranked também vira travessão', () {
      final kpis = buildKpis(
        ranking: makeRanking(rank: 0, points: 0, isUnranked: true),
      );

      expect(kpis[3].value, '—');
      expect(kpis[3].delta, 'sem pontos');
      expect(kpis[3].note, 'temporada');
    });

    test('ranqueado sem pontos e sem torneios cai nos fallbacks', () {
      final kpis = buildKpis(
        ranking: makeRanking(points: 0, tournamentsCount: 0),
      );

      expect(kpis[3].value, '#5');
      expect(kpis[3].delta, 'sem pontos');
      expect(kpis[3].note, 'temporada');
    });
  });

  group('buildAthleteEvolutionSeries', () {
    final now = DateTime(2026, 8, 15);

    test('12 buckets com labels pt-BR capitalizados', () {
      final series = buildAthleteEvolutionSeries(matches: const [], now: now);

      expect(series.monthLabels, hasLength(12));
      expect(series.games, hasLength(12));
      expect(series.winRatePct, hasLength(12));
      expect(
        series.monthLabels,
        [
          'Set',
          'Out',
          'Nov',
          'Dez',
          'Jan',
          'Fev',
          'Mar',
          'Abr',
          'Mai',
          'Jun',
          'Jul',
          'Ago',
        ],
      );
    });

    test('partidas fora da janela de 12 meses são ignoradas', () {
      final series = buildAthleteEvolutionSeries(
        matches: [
          // Fora: 13 meses atrás e mês futuro.
          makeMatch(id: 'velha', playedAt: DateTime(2025, 8, 20)),
          makeMatch(id: 'futura', playedAt: DateTime(2026, 9, 1)),
          // Dentro: primeiro e último bucket.
          makeMatch(id: 'set25', playedAt: DateTime(2025, 9, 10)),
          makeMatch(id: 'ago26a', playedAt: DateTime(2026, 8, 1)),
          makeMatch(id: 'ago26b', playedAt: DateTime(2026, 8, 9)),
        ],
        now: now,
      );

      expect(series.games.first, 1);
      expect(series.games.last, 2);
      expect(series.games.reduce((a, b) => a + b), 3);
    });

    test('winRatePct 0 em mês sem jogos e arredondado quando há', () {
      final series = buildAthleteEvolutionSeries(
        matches: [
          makeMatch(id: 'a', playedAt: DateTime(2026, 8, 1)),
          makeMatch(id: 'b', playedAt: DateTime(2026, 8, 2)),
          makeMatch(id: 'c', playedAt: DateTime(2026, 8, 3), win: false),
        ],
        now: now,
      );

      expect(series.winRatePct.last, 67);
      // Julho não teve jogos: 0, sem divisão por zero.
      expect(series.winRatePct[10], 0);
      expect(series.winRatePct.take(11).every((pct) => pct == 0), isTrue);
    });
  });

  group('chartScale', () {
    test('folga de 15% no topo e 25% na base', () {
      final scale = chartScale([10, 20]);

      expect(scale.max, closeTo(23.0, 1e-9));
      expect(scale.min, closeTo(7.5, 1e-9));
    });

    test('lista vazia devolve 0..1', () {
      final scale = chartScale(const []);

      expect(scale.min, 0);
      expect(scale.max, 1);
    });

    test('série constante zero abre 1 de folga sem dividir por zero', () {
      final scale = chartScale([0, 0, 0]);

      expect(scale.min, 0);
      expect(scale.max, 1);
    });
  });

  group('chartNormalizedValues', () {
    test('devolve valores em [0,1] respeitando a escala', () {
      final values = chartNormalizedValues([10, 20]);

      expect(values, hasLength(2));
      expect(values.every((v) => v >= 0 && v <= 1), isTrue);
      expect(values[0], closeTo((10 - 7.5) / (23.0 - 7.5), 1e-9));
      expect(values[1], closeTo((20 - 7.5) / (23.0 - 7.5), 1e-9));
    });

    test('série toda zero normaliza pra base sem NaN', () {
      final values = chartNormalizedValues([0, 0]);

      expect(values, [0.0, 0.0]);
      expect(values.every((v) => !v.isNaN), isTrue);
    });
  });
}
