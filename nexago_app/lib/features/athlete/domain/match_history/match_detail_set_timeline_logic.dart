import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_point_action.dart';
import 'athlete_match_detail_models.dart';
import 'match_detail_momentum_logic.dart';

List<TournamentMatchPointAction> pointActionsForSet(
  List<TournamentMatchPointAction> actions,
  int setIndex,
) {
  return actions.where((a) => a.isPoint && a.setIndex == setIndex).toList();
}

List<MatchSetTimelineItem> enrichSetTimelineItems({
  required TournamentMatch match,
  required String perspectiveTeamId,
  required List<MatchSetTimelineItem> items,
  required bool isParticipantView,
  required String ourTeamLabel,
  required String opponentTeamLabel,
}) {
  if (items.isEmpty) return items;

  final ourIsSideA = match.teamAId.trim() == perspectiveTeamId.trim();
  final ourLabel = isParticipantView ? 'você' : ourTeamLabel;
  final opponentLabel = isParticipantView ? 'adversário' : opponentTeamLabel;

  return [
    for (var i = 0; i < items.length; i++)
      _enrichItem(
        item: items[i],
        setIndex: i,
        match: match,
        ourIsSideA: ourIsSideA,
        ourLabel: ourLabel,
        opponentLabel: opponentLabel,
        isParticipantView: isParticipantView,
      ),
  ];
}

MatchSetTimelineItem _enrichItem({
  required MatchSetTimelineItem item,
  required int setIndex,
  required TournamentMatch match,
  required bool ourIsSideA,
  required String ourLabel,
  required String opponentLabel,
  required bool isParticipantView,
}) {
  final actions = pointActionsForSet(match.lastActions, setIndex);
  if (actions.isEmpty) {
    return item;
  }

  return MatchSetTimelineItem(
    label: item.label,
    description: buildSetNarrative(
      actions: actions,
      ourIsSideA: ourIsSideA,
      ourLabel: ourLabel,
      opponentLabel: opponentLabel,
      setNumber: setIndex + 1,
      isParticipantView: isParticipantView,
    ),
    ourScore: item.ourScore,
    opponentScore: item.opponentScore,
    isWin: item.isWin,
  );
}
