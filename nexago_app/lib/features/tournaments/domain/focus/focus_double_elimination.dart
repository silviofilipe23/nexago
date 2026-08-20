import '../tournament_match.dart';
import '../tournament_match_status.dart';

/// Em que chave o atleta está na dupla eliminação.
enum FocusBracketSide { winners, losers, eliminated }

/// A situação do atleta numa categoria de dupla eliminação.
class FocusDoubleEliminationStanding {
  const FocusDoubleEliminationStanding({
    required this.side,
    required this.lives,
    required this.lastLossPhase,
  });

  final FocusBracketSide side;

  /// 2 = invicto na chave dos vencedores; 1 = na repescagem, derrota elimina;
  /// 0 = eliminado.
  final int lives;

  /// "Quartas", "Oitavas" — a fase em que ele perdeu na chave dos vencedores.
  /// `null` enquanto invicto.
  final String? lastLossPhase;
}

/// Tipos que o gerador grava para a dupla eliminação
/// (`functions/src/category-bracket-builders.ts`).
const String kMatchTypeWinnersBracket = 'wb';
const String kMatchTypeLosersBracket = 'lb';

/// A sigla que o degrau do trilho carrega: WB, LB ou GF.
///
/// Existe porque WB e LB numeram rodadas por conta própria — "Rodada 2" sem a
/// chave não diz em qual das duas escadas o atleta está.
String? focusBracketBadgeOf(TournamentMatch m) {
  final type = m.matchType.trim().toLowerCase();
  if (type == kMatchTypeWinnersBracket) return 'WB';
  if (type == kMatchTypeLosersBracket) return 'LB';
  if (type == 'final' || type == 'grand final' || type == 'grand_final') {
    return 'GF';
  }
  return null;
}

bool _isMine(TournamentMatch m, Set<String> myTeamIds) =>
    myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId);

bool _isLoss(TournamentMatch m, Set<String> myTeamIds) {
  if (!TournamentMatchStatus.isCompleted(m.status)) return false;
  final winner = m.winnerId?.trim() ?? '';
  return winner.isNotEmpty && !myTeamIds.contains(winner);
}

/// Onde o atleta está e quantas vidas restam.
///
/// A contagem sai das DERROTAS, não da chave em que a próxima partida está: na
/// dupla eliminação o atleta cai para a repescagem no instante em que perde, e
/// a próxima partida dele pode ainda não ter sido gerada.
///
/// Uma derrota na chave dos vencedores custa uma vida e manda para a
/// repescagem — NÃO elimina. A segunda derrota (na repescagem) elimina. É
/// exatamente essa distinção que a tela precisa dizer sem ambiguidade: quem
/// acabou de perder a primeira ainda está no torneio.
FocusDoubleEliminationStanding focusDoubleEliminationStandingOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds, {
  String Function(TournamentMatch match)? phaseLabelOf,
}) {
  final mine = matches
      .where((m) =>
          m.categoryId == categoryId &&
          m.poolId.isEmpty &&
          !m.isGroupMatch &&
          _isMine(m, myTeamIds))
      .toList()
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));

  final losses = mine.where((m) => _isLoss(m, myTeamIds)).toList();

  if (losses.isEmpty) {
    return const FocusDoubleEliminationStanding(
      side: FocusBracketSide.winners,
      lives: 2,
      lastLossPhase: null,
    );
  }

  final first = losses.first;
  final phase = phaseLabelOf?.call(first);

  if (losses.length == 1) {
    return FocusDoubleEliminationStanding(
      side: FocusBracketSide.losers,
      lives: 1,
      lastLossPhase: phase,
    );
  }

  return FocusDoubleEliminationStanding(
    side: FocusBracketSide.eliminated,
    lives: 0,
    lastLossPhase: phase,
  );
}
