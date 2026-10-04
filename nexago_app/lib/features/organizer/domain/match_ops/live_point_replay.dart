import '../../../tournaments/domain/tournament_match_point_event.dart';

/// Último ponto ainda não desfeito: replay da timeline casando cada
/// `undo-point` com o `point` mais recente. Espelho de `lastUndoablePoint` de
/// `live-match-repository.ts` — sem o replay, dois "desfazer" seguidos
/// mirariam o mesmo ponto.
TournamentMatchPointEvent? lastUndoablePoint(
  List<TournamentMatchPointEvent> events,
) {
  final stack = <TournamentMatchPointEvent>[];
  for (final e in events) {
    if (e.isPoint) {
      stack.add(e);
    } else if (e.isUndoPoint && stack.isNotEmpty) {
      stack.removeLast();
    }
  }
  return stack.isEmpty ? null : stack.last;
}
