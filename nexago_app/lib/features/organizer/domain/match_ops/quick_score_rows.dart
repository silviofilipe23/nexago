import '../../../../core/sports/sport_catalog.dart'
    show QuickSetKind, ScoreSetValue, ScoringProfile, ScoringRules;
import '../../../tournaments/domain/tournament_match_set.dart';

/// Linha de set do lançamento rápido: o que mostrar e com que rótulo de alvo
/// (spec multiesporte, 2b1).
typedef QuickScoreRow = ({int index, QuickSetKind kind, String label});

/// Perfil efetivo da tela: o carimbado na partida com o formato escolhido;
/// sem carimbo, a regra histórica.
ScoringProfile quickScoreProfile(ScoringProfile? stamped, int bestOf) =>
    stamped == null
    ? ScoringRules.legacyProfile(bestOf)
    : ScoringRules.withBestOf(stamped, bestOf);

ScoreSetValue _value(TournamentMatchSet s) => ScoreSetValue(
  s.a,
  s.b,
  tb: s.tb == null ? null : ScoreSetValue(s.tb!.a, s.tb!.b),
);

List<QuickScoreRow> quickScoreRows(
  ScoringProfile profile,
  List<TournamentMatchSet> sets,
) => [
  for (var i = 0; i < sets.length; i++)
    (
      index: i,
      kind: ScoringRules.quickSetKind(profile, i, _value(sets[i])),
      label: ScoringRules.setTargetLabel(profile, i),
    ),
];

/// Sets prontos para envio: `tb` só onde a linha usa; super tie-break vira 1×0
/// do vencedor do tie-break.
List<TournamentMatchSet> quickScoreNormalized(
  ScoringProfile profile,
  List<TournamentMatchSet> sets,
) => [
  for (var i = 0; i < sets.length; i++)
    () {
      final n = ScoringRules.normalizeQuickSet(profile, i, _value(sets[i]));
      final tb = n.tb;
      return TournamentMatchSet(
        a: n.a,
        b: n.b,
        tb: tb == null ? null : (a: tb.a, b: tb.b),
      );
    }(),
];

/// Payload do callable `submitMatchResult`.
List<Map<String, Object>> quickScorePayload(
  ScoringProfile profile,
  List<TournamentMatchSet> sets,
) => [
  for (final s in quickScoreNormalized(profile, sets))
    {
      'a': s.a,
      'b': s.b,
      if (s.tb != null) 'tb': {'a': s.tb!.a, 'b': s.tb!.b},
    },
];

({int a, int b}) quickScoreWins(
  ScoringProfile profile,
  List<TournamentMatchSet> sets,
) => ScoringRules.setsWon([
  for (final s in quickScoreNormalized(profile, sets)) _value(s),
], profile);

String? quickScoreWinnerSide(
  ScoringProfile profile,
  List<TournamentMatchSet> sets,
) => ScoringRules.matchWinnerSide([
  for (final s in quickScoreNormalized(profile, sets)) _value(s),
], profile);
