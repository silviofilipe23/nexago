/// Tipo de partida — espelho Dart de `functions/src/match-status.ts`.
///
/// A coleção `matches` é COMPARTILHADA: no mesmo torneio convivem categorias de
/// duelo (grupos, mata-mata, dupla eliminatória) e categorias King of the Court,
/// onde a unidade não é uma partida de dois lados e sim uma RODADA com 3 a 5
/// duplas e uma tabela de pontos (`docs/business-rules/king-of-court.md`).
///
/// Só o `matchType` separa as duas coisas, então todo consumidor que lê
/// `teamAId`/`teamBId` precisa passar por [TournamentMatchType.isDuel].
abstract final class TournamentMatchType {
  TournamentMatchType._();

  static const kocRound = 'koc_round';
  static const kocSemifinal = 'koc_semifinal';
  static const kocFinal = 'koc_final';

  /// Caixa baixa com `_` virando espaço — mesma normalização do backend.
  static String canonicalKey(String matchType) =>
      matchType.trim().toLowerCase().replaceAll('_', ' ');

  /// Rodada King of the Court.
  ///
  /// Testa o PREFIXO, não uma lista fechada, para que um tipo KOTC novo já
  /// nasça blindado em vez de vazar até alguém lembrar de atualizar esta linha.
  static bool isKingOfCourt(String matchType) =>
      canonicalKey(matchType).startsWith('koc ');

  /// Partida de duelo: dois lados e um vencedor.
  static bool isDuel(String matchType) => !isKingOfCourt(matchType);
}
