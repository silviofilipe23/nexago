import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../sheets/tournament_category_editor_sheet.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_category_cards.dart';
import '../widgets/organizer_form_widgets.dart';

Future<void> _confirmRemoveCategory(
  BuildContext context,
  WidgetRef ref,
  TournamentCategoryDraft category,
) async {
  final name = category.name.trim().isEmpty
      ? suggestCategoryName(category)
      : category.name.trim();
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Remover categoria?'),
      content: Text(
        'A categoria "$name" será removida do rascunho do torneio.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancelar'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(foregroundColor: AppColors.live),
          child: const Text('Remover'),
        ),
      ],
    ),
  );
  if (confirmed != true) return;

  ref.read(tournamentCreateWizardProvider.notifier).removeCategory(category.id);
}

class TournamentCreateCategoriesPage extends ConsumerWidget {
  const TournamentCreateCategoriesPage({super.key});

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue = ref.watch(
      tournamentCreateCanContinueProvider(TournamentCreateStep.categories),
    );

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
              onRemove: () => _confirmRemoveCategory(context, ref, category),
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
            : 'Continuar · ${draft.categories.length} ${draft.categories.length == 1 ? 'Categoria' : 'Categorias'}',
        enabled: canContinue,
        onPressed: () =>
            goToNextCreateStep(context, ref, TournamentCreateStep.categories),
      ),
    );
  }
}
