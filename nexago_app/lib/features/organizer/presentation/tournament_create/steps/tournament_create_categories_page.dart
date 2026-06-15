import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../sheets/tournament_category_editor_sheet.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_category_cards.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateCategoriesPage extends ConsumerWidget {
  const TournamentCreateCategoriesPage({super.key});

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.categories));

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.categories,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.location);
        Navigator.of(context).maybePop();
      },
      onClose: () => _handleClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final category in draft.categories) ...[
            OrganizerCategoryCard(
              category: category,
              formatLabel: categoryFormatCardLabel(category),
              onEdit: () => showTournamentCategoryEditorSheet(
                context,
                ref,
                existing: category,
              ),
            ),
            const SizedBox(height: 12),
          ],
          OrganizerAddDashedCard(
            title: 'Adicionar categoria',
            subtitle: 'Gênero, idade, nível, vagas e preço',
            onTap: () => showTournamentCategoryEditorSheet(context, ref),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: draft.categories.isEmpty
            ? 'Continuar'
            : 'Continuar · ${draft.categories.length} categorias',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.categories,
        ),
      ),
    );
  }
}
