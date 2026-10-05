import 'package:flutter/material.dart';

import '../../../../../core/sports/sport_catalog.dart'
    show DecidingSet, SetsGamesProfile, SetsPointsProfile;
import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import 'organizer_form_widgets.dart';

/// "Sets e placar" da categoria (spec multiesporte, fase 2d2b): número de sets
/// e os campos do tipo de placar do esporte. Mesma regra do portal: o que
/// aparece é o que a categoria vai carimbar; mexer grava o perfil explícito.
class OrganizerCategoryScoringSection extends StatelessWidget {
  const OrganizerCategoryScoringSection({
    super.key,
    required this.category,
    required this.sport,
    required this.onChanged,
  });

  final TournamentCategoryDraft category;
  final TournamentSport sport;
  final ValueChanged<TournamentCategoryDraft> onChanged;

  static const _minTarget = 5;
  static const _maxTarget = 50;

  String _bestOfLabel(TournamentBestOf b) => switch (b) {
    TournamentBestOf.singleSet => 'Set único',
    TournamentBestOf.bestOf3 => 'MD3',
    TournamentBestOf.bestOf5 => 'MD5',
  };

  @override
  Widget build(BuildContext context) {
    final profile = categoryScoringView(category, sport);
    final multiSet = category.bestOf != TournamentBestOf.singleSet;
    final bestOfOptions = [
      TournamentBestOf.singleSet,
      TournamentBestOf.bestOf3,
      // MD5 só aparece quando a categoria já está nele (ainda não é operável).
      if (category.bestOf == TournamentBestOf.bestOf5) TournamentBestOf.bestOf5,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OrganizerSectionLabel('MELHOR DE'),
        const SizedBox(height: 8),
        OrganizerSegmentedControl<TournamentBestOf>(
          options: bestOfOptions,
          selected: category.bestOf,
          labelBuilder: _bestOfLabel,
          onSelected: (b) => onChanged(category.copyWith(bestOf: b)),
        ),
        const SizedBox(height: 16),
        switch (profile) {
          SetsPointsProfile() => Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const OrganizerSectionLabel('SET ATÉ'),
                    const SizedBox(height: 8),
                    KeyedSubtree(
                      key: const ValueKey('scoring-setTarget'),
                      child: OrganizerNumericStepper(
                        valueLabel: '${profile.setTarget}',
                        minReached: profile.setTarget <= _minTarget,
                        maxReached: profile.setTarget >= _maxTarget,
                        onDecrement: () {
                          final next = profile.setTarget - 1;
                          onChanged(
                            patchCategoryScoring(
                              category,
                              sport,
                              setTarget: next,
                              // O decisivo nunca passa do alvo do set.
                              decidingSetTarget:
                                  profile.decidingSetTarget > next
                                  ? next
                                  : null,
                            ),
                          );
                        },
                        onIncrement: () => onChanged(
                          patchCategoryScoring(
                            category,
                            sport,
                            setTarget: profile.setTarget + 1,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (multiSet) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const OrganizerSectionLabel('SET DECISIVO ATÉ'),
                      const SizedBox(height: 8),
                      KeyedSubtree(
                        key: const ValueKey('scoring-decidingSetTarget'),
                        child: OrganizerNumericStepper(
                          valueLabel: '${profile.decidingSetTarget}',
                          minReached: profile.decidingSetTarget <= _minTarget,
                          maxReached:
                              profile.decidingSetTarget >= profile.setTarget,
                          onDecrement: () => onChanged(
                            patchCategoryScoring(
                              category,
                              sport,
                              decidingSetTarget: profile.decidingSetTarget - 1,
                            ),
                          ),
                          onIncrement: () => onChanged(
                            patchCategoryScoring(
                              category,
                              sport,
                              decidingSetTarget: profile.decidingSetTarget + 1,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          SetsGamesProfile() => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              OrganizerToggleSettingRow(
                icon: Icons.sports_tennis_rounded,
                title: 'Sem vantagem',
                subtitle: 'No 40-40, o próximo ponto fecha o game.',
                value: profile.noAd,
                onChanged: (v) =>
                    onChanged(patchCategoryScoring(category, sport, noAd: v)),
              ),
              if (multiSet) ...[
                const SizedBox(height: 16),
                const OrganizerSectionLabel('SET DECISIVO'),
                const SizedBox(height: 8),
                OrganizerSegmentedControl<DecidingSet>(
                  options: const [DecidingSet.superTiebreak, DecidingSet.full],
                  selected: profile.decidingSet,
                  labelBuilder: (d) => d == DecidingSet.superTiebreak
                      ? 'Super tie-break'
                      : 'Set completo',
                  onSelected: (d) => onChanged(
                    patchCategoryScoring(category, sport, decidingSet: d),
                  ),
                ),
              ],
            ],
          ),
        },
      ],
    );
  }
}
