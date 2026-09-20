/// Planejamento do King of the Court no wizard do organizador.
///
/// Espelha `functions/src/koc-bracket-builders.ts`, que é a FONTE DA VERDADE —
/// a chave de verdade é gerada lá. Aqui a conta serve para responder, antes de
/// publicar, a pergunta que o organizador realmente tem: *cabe na minha reserva
/// de quadra?* Duração isolada não responde isso; o total de quadra responde.
library;

/// Limites do formato (iguais aos do backend).
const kocMinTeamsPerRound = 3;
const kocMaxTeamsPerRound = 5;

const kocDefaultTeamsPerCourt = 4;
const kocDefaultQualifiersPerRound = 2;

const kocDefaultRoundDurationSec = 900;
const kocMinRoundDurationSec = 300;
const kocMaxRoundDurationSec = 2400;

/// Abaixo disso a rodada fica rasa demais para valer como classificatória
/// (~25s por rally → menos de 24 trocas, ~12 por dupla). O wizard aceita, mas
/// avisa.
const kocShallowRoundDurationSec = 600;

/// Troca entre rodadas da mesma fase.
const kocChangeoverSec = 300;

/// Intervalo entre fases. Não é folga: é o descanso mínimo de quem se classifica
/// na última rodada da classificatória e entra na primeira semifinal.
const kocPhaseBreakSec = 900;

/// Teto de fases, igual ao do backend.
const _kocMaxPhases = 6;

/// Em quantas rodadas dividir [teamCount] duplas.
///
/// Corrige nas duas pontas: 5 duplas em quadras de 4 dariam rodadas de 3 e 2, e
/// uma rodada de 2 não é King of the Court. Devolve 0 quando o campo não fecha
/// uma rodada sequer.
int kocRoundCount(int teamCount, int teamsPerCourt) {
  if (teamCount < kocMinTeamsPerRound) return 0;
  final perCourt = teamsPerCourt.clamp(kocMinTeamsPerRound, kocMaxTeamsPerRound);

  var rounds = (teamCount / perCourt).ceil();
  if (rounds < 1) rounds = 1;
  while (rounds > 1 && teamCount ~/ rounds < kocMinTeamsPerRound) {
    rounds--;
  }
  while ((teamCount / rounds).ceil() > kocMaxTeamsPerRound) {
    rounds++;
  }
  return rounds;
}

/// Quantas rodadas cada fase terá, da classificatória à final.
///
/// Lista vazia = a configuração não fecha (campo pequeno demais, ou fase que não
/// reduz o campo porque classificam duplas demais).
List<int> kocRoundsPerPhase({
  required int teamCount,
  required int teamsPerCourt,
  required int qualifiersPerRound,
}) {
  final qualifiers = qualifiersPerRound < 1 ? 1 : qualifiersPerRound;
  final phases = <int>[];
  var fieldSize = teamCount;

  while (phases.length < _kocMaxPhases) {
    final rounds = kocRoundCount(fieldSize, teamsPerCourt);
    if (rounds == 0) return const [];
    phases.add(rounds);
    if (rounds == 1) return phases;

    final nextFieldSize = rounds * qualifiers;
    // Fase que não reduz o campo entraria em laço infinito na geração.
    if (nextFieldSize >= fieldSize) return const [];
    fieldSize = nextFieldSize;
  }
  return const [];
}

/// Estimativa do dia para a categoria KOTC.
class KingOfCourtSchedule {
  const KingOfCourtSchedule({
    required this.roundsPerPhase,
    required this.totalDuration,
    required this.courts,
  });

  /// Rodadas de cada fase, da classificatória à final.
  final List<int> roundsPerPhase;

  /// Tempo total de quadra, já com trocas e intervalos de fase.
  final Duration totalDuration;

  /// Quadras usadas em paralelo na estimativa.
  final int courts;

  int get totalRounds => roundsPerPhase.fold(0, (sum, r) => sum + r);

  int get phaseCount => roundsPerPhase.length;

  /// A configuração fecha uma chave publicável.
  bool get isValid => roundsPerPhase.isNotEmpty;

  /// "2h30" / "45min" — o número que responde se cabe na reserva da quadra.
  String get totalLabel {
    final hours = totalDuration.inHours;
    final minutes = totalDuration.inMinutes.remainder(60);
    if (hours == 0) return '${minutes}min';
    if (minutes == 0) return '${hours}h';
    return '${hours}h${minutes.toString().padLeft(2, '0')}';
  }
}

/// Monta a estimativa do dia.
///
/// [courts] é quantas quadras rodam em paralelo: com 4 quadras as 4 rodadas da
/// classificatória acontecem ao mesmo tempo; com 1, uma depois da outra — a
/// diferença entre uma etapa de 1h20 e uma de 3h40.
KingOfCourtSchedule kingOfCourtSchedule({
  required int teamCount,
  required int teamsPerCourt,
  required int qualifiersPerRound,
  required int roundDurationSec,
  int courts = 1,
}) {
  final roundsPerPhase = kocRoundsPerPhase(
    teamCount: teamCount,
    teamsPerCourt: teamsPerCourt,
    qualifiersPerRound: qualifiersPerRound,
  );
  if (roundsPerPhase.isEmpty) {
    return KingOfCourtSchedule(
      roundsPerPhase: const [],
      totalDuration: Duration.zero,
      courts: courts,
    );
  }

  final parallel = courts < 1 ? 1 : courts;
  final duration = roundDurationSec.clamp(
    kocMinRoundDurationSec,
    kocMaxRoundDurationSec,
  );

  var seconds = 0;
  for (var i = 0; i < roundsPerPhase.length; i++) {
    // Rodadas de uma fase rodam em ondas de `parallel` quadras.
    final waves = (roundsPerPhase[i] / parallel).ceil();
    seconds += waves * duration + (waves - 1) * kocChangeoverSec;
    if (i < roundsPerPhase.length - 1) seconds += kocPhaseBreakSec;
  }

  return KingOfCourtSchedule(
    roundsPerPhase: roundsPerPhase,
    totalDuration: Duration(seconds: seconds),
    courts: parallel,
  );
}

/// Config KOTC da categoria, como o wizard gravou.
///
/// Os nomes são os mesmos que `resolveKocConfig` lê no backend — é o que faz a
/// prévia da tela de gerar chave bater com a chave publicada.
class KingOfCourtConfig {
  const KingOfCourtConfig({
    this.teamsPerCourt = kocDefaultTeamsPerCourt,
    this.qualifiersPerRound = kocDefaultQualifiersPerRound,
    this.roundDurationSec = kocDefaultRoundDurationSec,
  });

  final int teamsPerCourt;
  final int qualifiersPerRound;
  final int roundDurationSec;

  Map<String, dynamic> toBracketConfig() => {
    'teamsPerCourt': teamsPerCourt,
    'qualifiersPerRound': qualifiersPerRound,
    'roundDurationSec': roundDurationSec,
  };
}

/// Lê a config do doc da categoria. Campo ausente ou inválido cai no padrão do
/// formato — o mesmo que o backend faz.
KingOfCourtConfig kingOfCourtConfigFromCategory(Map<String, dynamic>? category) {
  int read(String key, int fallback) {
    final value = category?[key];
    if (value is num && value > 0) return value.toInt();
    return fallback;
  }

  return KingOfCourtConfig(
    teamsPerCourt: read('teamsPerCourt', kocDefaultTeamsPerCourt),
    qualifiersPerRound: read('qualifiersPerRound', kocDefaultQualifiersPerRound),
    roundDurationSec: read('roundDurationSec', kocDefaultRoundDurationSec),
  );
}
