import '../../../tournaments/domain/tournament_match_serving_players.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'match_scoring_logic.dart';

/// QUAL ATLETA da dupla está sacando — o andar de baixo do `servingTeamId`.
///
/// Espelha `serving-player.ts`: as três mesas (app, organizador e portal do atleta) precisam
/// virar o sacador do mesmo jeito, porque o mesário opera pelas três e o telão lê o resultado.
abstract final class MatchServingPlayerLogic {
  MatchServingPlayerLogic._();

  /// `'A'`/`'B'` do time informado; `null` quando o id está vazio ou não é de nenhum dos lados.
  static String? sideOfTeam({
    required String teamId,
    required String teamAId,
    required String teamBId,
  }) {
    final id = teamId.trim();
    if (id.isEmpty) return null;
    if (id == teamAId.trim()) return 'A';
    if (id == teamBId.trim()) return 'B';
    return null;
  }

  /// A posição de quem está sacando AGORA — derivada do lado que está com o saque.
  static int servingPlayerSlot({
    required MatchServingPlayers slots,
    required String servingTeamId,
    required String teamAId,
    required String teamBId,
  }) {
    final side = sideOfTeam(
      teamId: servingTeamId,
      teamAId: teamAId,
      teamBId: teamBId,
    );
    return side == null ? 0 : slots.slotForSide(side);
  }

  /// Quem saca pela dupla depois de mexer no placar.
  ///
  /// Regra do vôlei de praia: dentro do set a dupla mantém a ORDEM de saque declarada, então
  /// quando o saque volta pra ela quem vai à linha é o PARCEIRO de quem sacou por último.
  /// Enquanto a mesma dupla segue sacando, continua o mesmo atleta. Na virada de set tudo zera
  /// — a ordem é declarada de novo a cada set, igual ao `servingTeamId`, que também volta a `''`.
  ///
  /// A dupla ainda em `0` não vira nada: ela nunca sacou neste set, e é [needsServingPlayer]
  /// que vai perguntar ao mesário quem abre.
  static MatchServingPlayers slotsAfterScore({
    required MatchServingPlayers slots,
    required String previousServingTeamId,
    required String nextServingTeamId,
    required String teamAId,
    required String teamBId,
  }) {
    final previous = previousServingTeamId.trim();
    final next = nextServingTeamId.trim();

    if (next.isEmpty) return MatchServingPlayers.none;
    if (previous.isEmpty || previous == next) return slots;

    final side = sideOfTeam(teamId: next, teamAId: teamAId, teamBId: teamBId);
    if (side == null) return slots;
    final current = slots.slotForSide(side);
    if (current == 0) return slots;
    return slots.withSide(side, current == 1 ? 2 : 1);
  }

  /// Desfazer NÃO devolve a ordem de saque: o evento da timeline guarda o placar, não quem
  /// estava com o saque antes do rally, e o `servingTeamId` do desfazer já é uma reconstrução
  /// aproximada (ver [MatchScoringLogic.undoPoint]). Então aqui só se mantém o que estava — e a
  /// mesa tem "Trocar sacador" pro mesário acertar na mão.
  ///
  /// A única coisa que o desfazer resolve sozinho é a volta pra um set já fechado: sem dupla no
  /// saque não existe atleta no saque, e a ordem do próximo set é declarada do zero.
  static MatchServingPlayers slotsAfterUndo({
    required MatchServingPlayers slots,
    required String nextServingTeamId,
  }) {
    if (nextServingTeamId.trim().isEmpty) return MatchServingPlayers.none;
    return slots;
  }

  /// Troca o sacador da dupla que está com o saque (ação manual da mesa). Sem dupla no saque,
  /// ou com a dupla ainda sem ordem declarada, não há o que trocar.
  static MatchServingPlayers swappedSlots({
    required MatchServingPlayers slots,
    required String servingTeamId,
    required String teamAId,
    required String teamBId,
  }) {
    final side = sideOfTeam(
      teamId: servingTeamId,
      teamAId: teamAId,
      teamBId: teamBId,
    );
    if (side == null) return slots;
    final current = slots.slotForSide(side);
    if (current == 0) return slots;
    return slots.withSide(side, current == 1 ? 2 : 1);
  }

  /// A mesa precisa perguntar QUAL ATLETA está sacando?
  ///
  /// Só depois de a DUPLA estar definida: enquanto [MatchScoringLogic.needsStartingServe] é
  /// verdade a faixa da vez é a do time, e duas perguntas juntas na mesma mesa viram ruído.
  /// Fora disso vale sempre que a dupla no saque ainda não declarou a ordem dela neste set —
  /// inclusive com a partida já ao vivo, porque a dupla que ainda não tinha sacado estreia no
  /// meio do set.
  static bool needsServingPlayer({
    required String servingTeamId,
    required int servingPlayerSlot,
    required String status,
    required String teamAId,
    required String teamBId,
  }) {
    if (MatchScoringLogic.needsStartingServe(
      servingTeamId: servingTeamId,
      status: status,
      teamAId: teamAId,
      teamBId: teamBId,
    )) {
      return false;
    }
    if (TournamentMatchStatus.isCompleted(status) ||
        TournamentMatchStatus.isCanceled(status)) {
      return false;
    }
    if (teamAId.trim().isEmpty || teamBId.trim().isEmpty) return false;
    if (servingTeamId.trim().isEmpty) return false;
    return servingPlayerSlot != 1 && servingPlayerSlot != 2;
  }
}
