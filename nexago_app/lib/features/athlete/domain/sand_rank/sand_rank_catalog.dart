/// Elos ("sand rank") — escada de gamificação derivada 100% do XP.
///
/// Porte 1:1 de `functions/src/sand-rank-engine.ts`. Mantém os dois lados em
/// paridade — qualquer mudança de degrau precisa ser aplicada lá também.
///
/// Regra de manutenção da curva: thresholds NUNCA sobem e degraus nunca são
/// removidos (ninguém pode ser rebaixado); só é permitido baixar thresholds
/// ou adicionar elos acima do topo atual.
///
/// Não confundir com o nível técnico (habilidade/Glicko): o elo mede
/// engajamento, não habilidade.
library;

class SandRankStep {
  const SandRankStep({
    required this.trackIndex,
    required this.rankCode,
    required this.rankName,
    required this.division,
    required this.minXp,
  });

  /// Índice absoluto na trilha (0..15) — fonte de verdade p/ comparações.
  final int trackIndex;
  final String rankCode;

  /// Nome de exibição em PT-BR.
  final String rankName;

  /// 3 | 2 | 1; 0 = elo sem divisão (Lenda).
  final int division;

  /// XP cumulativo mínimo para alcançar o degrau.
  final int minXp;
}

const List<SandRankStep> sandRankTrack = [
  SandRankStep(trackIndex: 0, rankCode: 'INICIANTE', rankName: 'Iniciante', division: 3, minXp: 0),
  SandRankStep(trackIndex: 1, rankCode: 'INICIANTE', rankName: 'Iniciante', division: 2, minXp: 100),
  SandRankStep(trackIndex: 2, rankCode: 'INICIANTE', rankName: 'Iniciante', division: 1, minXp: 250),
  SandRankStep(trackIndex: 3, rankCode: 'COMPETIDOR', rankName: 'Competidor', division: 3, minXp: 450),
  SandRankStep(trackIndex: 4, rankCode: 'COMPETIDOR', rankName: 'Competidor', division: 2, minXp: 700),
  SandRankStep(trackIndex: 5, rankCode: 'COMPETIDOR', rankName: 'Competidor', division: 1, minXp: 1000),
  SandRankStep(trackIndex: 6, rankCode: 'DESAFIANTE', rankName: 'Desafiante', division: 3, minXp: 1400),
  SandRankStep(trackIndex: 7, rankCode: 'DESAFIANTE', rankName: 'Desafiante', division: 2, minXp: 1900),
  SandRankStep(trackIndex: 8, rankCode: 'DESAFIANTE', rankName: 'Desafiante', division: 1, minXp: 2500),
  SandRankStep(trackIndex: 9, rankCode: 'ELITE', rankName: 'Elite', division: 3, minXp: 3300),
  SandRankStep(trackIndex: 10, rankCode: 'ELITE', rankName: 'Elite', division: 2, minXp: 4200),
  SandRankStep(trackIndex: 11, rankCode: 'ELITE', rankName: 'Elite', division: 1, minXp: 5300),
  SandRankStep(trackIndex: 12, rankCode: 'MESTRE', rankName: 'Mestre', division: 3, minXp: 6600),
  SandRankStep(trackIndex: 13, rankCode: 'MESTRE', rankName: 'Mestre', division: 2, minXp: 8200),
  SandRankStep(trackIndex: 14, rankCode: 'MESTRE', rankName: 'Mestre', division: 1, minXp: 10000),
  SandRankStep(trackIndex: 15, rankCode: 'LENDA', rankName: 'Lenda', division: 0, minXp: 12500),
];

final int sandRankTopTrackIndex = sandRankTrack.last.trackIndex;

SandRankStep sandRankStepFromXp(int xp) {
  final safeXp = xp < 0 ? 0 : xp;
  var current = sandRankTrack.first;
  for (final step in sandRankTrack) {
    if (safeXp >= step.minXp) {
      current = step;
    } else {
      break;
    }
  }
  return current;
}

SandRankStep? sandRankStepByTrackIndex(int trackIndex) {
  if (trackIndex < 0 || trackIndex >= sandRankTrack.length) return null;
  return sandRankTrack[trackIndex];
}

String sandRankDivisionRoman(int division) {
  return switch (division) {
    3 => 'III',
    2 => 'II',
    1 => 'I',
    _ => '',
  };
}

String sandRankLabel(SandRankStep step) {
  final roman = sandRankDivisionRoman(step.division);
  return roman.isEmpty ? step.rankName : '${step.rankName} $roman';
}

/// Progresso do atleta dentro da trilha, derivado só do XP.
class SandRankProgress {
  const SandRankProgress({
    required this.current,
    required this.next,
    required this.xpIntoStep,
    required this.xpToNext,
    required this.progress,
  });

  final SandRankStep current;

  /// `null` quando o atleta é Lenda (topo da trilha).
  final SandRankStep? next;

  /// XP acumulado desde o início do degrau atual.
  final int xpIntoStep;

  /// XP restante até o próximo degrau (0 no topo).
  final int xpToNext;

  /// 0..1 dentro do degrau atual (1 no topo).
  final double progress;
}

SandRankProgress sandRankProgressFromXp(int xp) {
  final safeXp = xp < 0 ? 0 : xp;
  final current = sandRankStepFromXp(safeXp);
  final next = sandRankStepByTrackIndex(current.trackIndex + 1);
  final xpIntoStep = safeXp - current.minXp;
  if (next == null) {
    return SandRankProgress(
      current: current,
      next: null,
      xpIntoStep: xpIntoStep,
      xpToNext: 0,
      progress: 1,
    );
  }
  final stepSize = next.minXp - current.minXp;
  return SandRankProgress(
    current: current,
    next: next,
    xpIntoStep: xpIntoStep,
    xpToNext: next.minXp - safeXp,
    progress: stepSize <= 0 ? 1 : (xpIntoStep / stepSize).clamp(0, 1).toDouble(),
  );
}

/// Trilha de escudos mensais do perk Protetor de Sequência.
const int shieldTrackIndexOnePerMonth = 6; // Desafiante III
const int shieldTrackIndexTwoPerMonth = 12; // Mestre III

int shieldsPerMonthForTrackIndex(int highestTrackIndex) {
  if (highestTrackIndex >= shieldTrackIndexTwoPerMonth) return 2;
  if (highestTrackIndex >= shieldTrackIndexOnePerMonth) return 1;
  return 0;
}
