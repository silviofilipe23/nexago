import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateFormatPage extends ConsumerWidget {
  const TournamentCreateFormatPage({super.key});

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.format));
    final showGroups =
        draft.bracketSystem == TournamentBracketSystem.groupsThenKnockout ||
            draft.bracketSystem == TournamentBracketSystem.groupsWithRepechage;

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.format,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.categories);
        Navigator.of(context).maybePop();
      },
      onClose: () => _handleClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('SISTEMA DE DISPUTA'),
          const SizedBox(height: 12),
          for (final system in TournamentBracketSystem.values) ...[
            OrganizerRadioOptionCard(
              title: bracketSystemLabel(system),
              subtitle: bracketSystemDescription(system),
              selected: draft.bracketSystem == system,
              onTap: () => ref
                  .read(tournamentCreateWizardProvider.notifier)
                  .setBracketSystem(system),
            ),
            const SizedBox(height: 10),
          ],
          if (showGroups) ...[
            const SizedBox(height: 8),
            const OrganizerSectionLabel('CONFIGURAÇÃO DOS GRUPOS'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const OrganizerSectionLabel('DUPLAS POR GRUPO'),
                      const SizedBox(height: 8),
                      OrganizerNumericStepper(
                        valueLabel: '${draft.teamsPerGroup}',
                        minReached: draft.teamsPerGroup <= 2,
                        onDecrement: () => ref
                            .read(tournamentCreateWizardProvider.notifier)
                            .setTeamsPerGroup(draft.teamsPerGroup - 1),
                        onIncrement: () => ref
                            .read(tournamentCreateWizardProvider.notifier)
                            .setTeamsPerGroup(draft.teamsPerGroup + 1),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const OrganizerSectionLabel('CLASSIFICAM'),
                      const SizedBox(height: 8),
                      OrganizerNumericStepper(
                        valueLabel: '${draft.qualifiersPerGroup}',
                        minReached: draft.qualifiersPerGroup <= 1,
                        onDecrement: () => ref
                            .read(tournamentCreateWizardProvider.notifier)
                            .setQualifiersPerGroup(draft.qualifiersPerGroup - 1),
                        onIncrement: () => ref
                            .read(tournamentCreateWizardProvider.notifier)
                            .setQualifiersPerGroup(draft.qualifiersPerGroup + 1),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 20),
          const OrganizerSectionLabel('SETS'),
          const SizedBox(height: 8),
          const OrganizerSectionLabel('MELHOR DE'),
          const SizedBox(height: 8),
          OrganizerSegmentedControl(
            options: TournamentBestOf.values,
            selected: draft.bestOf,
            labelBuilder: bestOfLabel,
            onSelected: (value) =>
                ref.read(tournamentCreateWizardProvider.notifier).setBestOf(value),
          ),
          const SizedBox(height: 12),
          OrganizerToggleSettingRow(
            icon: Icons.flag_outlined,
            title: 'Final em MD5',
            subtitle: 'A decisão do título usa melhor de 5 sets.',
            value: draft.finalBestOf5,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setFinalBestOf5(value),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.format,
        ),
      ),
    );
  }
}
