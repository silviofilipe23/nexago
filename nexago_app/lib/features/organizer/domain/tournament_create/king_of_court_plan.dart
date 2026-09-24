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

/// Uma fase do plano, como o servidor a congelou na rodada.
///
/// O app não PLANEJA nada: quem propõe e edita é o portal. Aqui só se lê, para
/// a tela de gerar chave não prometer um formato diferente do que vai sair.
class KingOfCourtPhase {
  const KingOfCourtPhase({
    required this.bracketSizes,
    required this.roundsPerBracket,
    required this.qualifiersPerRound,
    required this.durationSec,
  });

  final List<int> bracketSizes;
  final int roundsPerBracket;

  /// 0 só na final: ali ninguém classifica, a tabela é o pódio.
  final int qualifiersPerRound;
  final int durationSec;

  int get fieldSize => bracketSizes.fold(0, (a, b) => a + b);
  int get roundCount => bracketSizes.length * roundsPerBracket;
}

/// Lê o plano gravado no Firestore. Sujeira derruba o plano INTEIRO: sem ele o
/// app mostra o formato antigo, que é honesto; com ele meio lido, mentiria.
List<KingOfCourtPhase>? kingOfCourtPhasesFrom(dynamic raw) {
  if (raw is! List || raw.isEmpty) return null;
  final out = <KingOfCourtPhase>[];
  for (final item in raw) {
    if (item is! Map) return null;
    final sizesRaw = item['bracketSizes'];
    if (sizesRaw is! List || sizesRaw.isEmpty) return null;
    final sizes = <int>[];
    for (final n in sizesRaw) {
      if (n is! num || n < 1) return null;
      sizes.add(n.toInt());
    }
    final rounds = item['roundsPerBracket'];
    final qualifiers = item['qualifiersPerRound'];
    final duration = item['durationSec'];
    if (rounds is! num || rounds < 1) return null;
    if (qualifiers is! num || qualifiers < 0) return null;
    if (duration is! num || duration <= 0) return null;
    out.add(KingOfCourtPhase(
      bracketSizes: sizes,
      roundsPerBracket: rounds.toInt(),
      qualifiersPerRound: qualifiers.toInt(),
      durationSec: duration.toInt(),
    ));
  }
  return out;
}

/// Estimativa do dia a partir do PLANO da categoria — mesma conta que
/// `kocPlanTotals` faz no portal (`koc-phase-plan.ts`), pareada campo a campo,
/// para as duas telas nunca mostrarem tempos diferentes para o mesmo plano.
///
/// [courts] é quantas CHAVES rodam em paralelo, não quantas baterias: as
/// baterias de uma chave são sequenciais na mesma quadra — o paralelismo vem
/// de ter mais de uma chave jogando ao mesmo tempo em quadras diferentes.
KingOfCourtSchedule kingOfCourtScheduleFromPhases(
  List<KingOfCourtPhase> phases, {
  int courts = 1,
}) {
  final parallel = courts < 1 ? 1 : courts;
  final roundsPerPhase = <int>[];
  var seconds = 0;
  for (var i = 0; i < phases.length; i++) {
    final phase = phases[i];
    final waves =
        (phase.bracketSizes.length / parallel).ceil() * phase.roundsPerBracket;
    roundsPerPhase.add(phase.roundCount);
    seconds +=
        waves * phase.durationSec + (waves > 0 ? waves - 1 : 0) * kocChangeoverSec;
    if (i < phases.length - 1) seconds += kocPhaseBreakSec;
  }
  return KingOfCourtSchedule(
    roundsPerPhase: roundsPerPhase,
    totalDuration: Duration(seconds: seconds),
    courts: parallel,
  );
}

/// Teto de quem não escolheu — o de antes do plano de fases.
const int kocLegacyMaxTeamsPerRound = 5;

/// Teto duro do formato, mesmo com plano: acima disso a rodada deixa de ser
/// King of the Court.
const int kocHardMaxTeamsPerRound = 6;

/// Config KOTC da categoria, como o wizard gravou.
///
/// Os nomes são os mesmos que `resolveKocConfig` lê no backend — é o que faz a
/// prévia da tela de gerar chave bater com a chave publicada.
class KingOfCourtConfig {
  const KingOfCourtConfig({
    this.teamsPerCourt = kocDefaultTeamsPerCourt,
    this.qualifiersPerRound = kocDefaultQualifiersPerRound,
    this.roundDurationSec = kocDefaultRoundDurationSec,
    this.maxTeamsPerRound = kocLegacyMaxTeamsPerRound,
    this.phases,
  });

  final int teamsPerCourt;
  final int qualifiersPerRound;
  final int roundDurationSec;
  final int maxTeamsPerRound;

  /// Plano explícito da categoria. Não vai no `bracketConfig`: o servidor lê o
  /// plano do doc da categoria, e mandar daqui sobrescreveria o que o portal
  /// salvou com a tabela.
  final List<KingOfCourtPhase>? phases;

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
    maxTeamsPerRound: () {
      final raw = category?['kocMaxTeamsPerRound'] ?? category?['maxTeamsPerRound'];
      if (raw is! num || raw <= 0) return kocLegacyMaxTeamsPerRound;
      return raw.toInt().clamp(kocMinTeamsPerRound, kocHardMaxTeamsPerRound);
    }(),
    phases: kingOfCourtPhasesFrom(
      category?['kocPhases'] ?? category?['phases'],
    ),
  );
}
