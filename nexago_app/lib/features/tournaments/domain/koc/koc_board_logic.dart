import '../tournament_match.dart';

/// Qual rodada da categoria o telão deve exibir.
///
/// Numa quadra só, as rodadas da etapa acontecem em sequência, então existe no
/// máximo uma valendo por vez. A precedência responde ao que o público na beira
/// da quadra precisa ver:
///
/// 1. **Em andamento** — o que está acontecendo ganha de tudo.
/// 2. **Próxima a entrar** — entre rodadas, mostra quem sobe, não o resultado
///    de quem acabou de sair; é a informação acionável para quem espera.
/// 3. **Última concluída** — no fim da etapa, o telão fica na tabela da final
///    em vez de apagar.
///
/// Rodada cancelada nunca é escolhida: ela não vai acontecer.
String? kocBoardRoundId(
  List<TournamentMatch> matches,
  String categoryId,
) {
  final id = categoryId.trim();
  if (id.isEmpty) return null;

  final rounds =
      matches.where((m) => m.isKingOfCourt && m.categoryId == id).toList()
        ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  if (rounds.isEmpty) return null;

  for (final round in rounds) {
    if (round.isInProgress) return round.id;
  }
  for (final round in rounds) {
    if (!round.isCompleted && !round.isCanceled) return round.id;
  }
  final completed = rounds.where((r) => r.isCompleted).toList();
  if (completed.isNotEmpty) return completed.last.id;
  return null;
}
