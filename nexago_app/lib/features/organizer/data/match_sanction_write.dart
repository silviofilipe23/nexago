import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_sanction.dart';
import '../../tournaments/domain/tournament_match_serving_players.dart';
import 'match_point_write.dart';

/// Lança um cartão na súmula.
///
/// O amarelo só registra: grava em `sanctions[]` e vira um evento `sanction` na timeline.
///
/// O vermelho é penalidade: o adversário ganha o ponto (e o saque). O ponto sai do MESMO
/// [buildPointWrite] da marcação normal — placar, virada de set, fim de partida e saque —, e o
/// cartão viaja no próprio evento `point` (`penalty: true`), então o "desfazer" da mesa segue
/// tirando o ponto sem conhecer cartão. O cartão em si só sai pela remoção explícita
/// ([buildSanctionRemovalWrite]).
///
/// Devolve `null` quando a partida já encerrou (mesma guarda do ponto, sobre o doc FRESCO da
/// transação). [sanctionId] vem de fora para a transação poder repetir sem gerar outro id.
MatchPointWrite? buildSanctionWrite(
  TournamentMatch match, {
  required String sanctionId,
  required MatchSanctionCard card,
  required String side,
  required int playerSlot,
  required String playerName,
  String reason = '',
  MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
}) {
  if (match.isCompleted || match.isCanceled) return null;
  final cardSide = side.toUpperCase();
  if (cardSide != 'A' && cardSide != 'B') return null;

  final setIndex = (match.currentSetIndex ?? 0).clamp(0, match.bestOf - 1);
  final current = match.sets.length > setIndex ? match.sets[setIndex] : null;
  final sanction = MatchSanction(
    id: sanctionId,
    card: card,
    side: cardSide,
    playerSlot: playerSlot,
    playerName: playerName,
    setIndex: setIndex,
    scoreA: current?.a ?? 0,
    scoreB: current?.b ?? 0,
    reason: reason.trim(),
  );
  final sanctions = [
    ...match.sanctions.map((s) => s.toMap()),
    sanction.toMap(),
  ];

  if (card == MatchSanctionCard.yellow) {
    return MatchPointWrite(
      matchUpdate: {'sanctions': sanctions},
      pointEvent: {
        'type': 'sanction',
        'side': cardSide,
        'setIndex': setIndex,
        'scoreA': sanction.scoreA,
        'scoreB': sanction.scoreB,
        'card': card.wire,
        'playerSlot': playerSlot,
        'sanctionId': sanctionId,
      },
      result: (
        sets: match.sets,
        currentSetIndex: match.currentSetIndex ?? 0,
        winnerId: null,
        servingTeamId: match.servingTeamId,
      ),
      setIndex: setIndex,
    );
  }

  final opponent = cardSide == 'A' ? 'B' : 'A';
  final point = buildPointWrite(match, opponent, rosterSizes: rosterSizes);
  if (point == null) return null;
  return MatchPointWrite(
    matchUpdate: {...point.matchUpdate, 'sanctions': sanctions},
    pointEvent: {
      ...point.pointEvent,
      'penalty': true,
      'card': card.wire,
      'cardSide': cardSide,
      'playerSlot': playerSlot,
      'sanctionId': sanctionId,
    },
    result: point.result,
    setIndex: point.setIndex,
  );
}

/// Tira um cartão lançado por engano. Não mexe no placar: o ponto de um vermelho se desfaz
/// pelo "desfazer" normal. Devolve `null` se o cartão já não está no doc.
MatchPointWrite? buildSanctionRemovalWrite(
  TournamentMatch match,
  String sanctionId,
) {
  final removed = match.sanctions.where((s) => s.id == sanctionId).firstOrNull;
  if (removed == null) return null;

  final setIndex = (match.currentSetIndex ?? 0).clamp(0, match.bestOf - 1);
  final current = match.sets.length > setIndex ? match.sets[setIndex] : null;
  return MatchPointWrite(
    matchUpdate: {
      'sanctions': [
        for (final s in match.sanctions)
          if (s.id != sanctionId) s.toMap(),
      ],
    },
    pointEvent: {
      'type': 'sanction-removed',
      'side': removed.side,
      'setIndex': setIndex,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
      'card': removed.card.wire,
      'playerSlot': removed.playerSlot,
      'sanctionId': sanctionId,
    },
    result: (
      sets: match.sets,
      currentSetIndex: match.currentSetIndex ?? 0,
      winnerId: null,
      servingTeamId: match.servingTeamId,
    ),
    setIndex: setIndex,
  );
}
