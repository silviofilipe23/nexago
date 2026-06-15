import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../league_create_navigation.dart';
import '../league_create_wizard_scaffold.dart';
import '../sheets/league_category_editor_sheet.dart';
import '../../tournament_create/widgets/organizer_category_cards.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueCreateCategoriesPage extends ConsumerWidget {
  const LeagueCreateCategoriesPage({super.key});

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleLeagueWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(leagueCreateDraftProvider);
    final canContinue = ref.watch(
      leagueCreateCanContinueProvider(LeagueCreateStep.categories),
    );

    return LeagueCreateWizardScaffold(
      step: LeagueCreateStep.categories,
      onBack: () {
        syncLeagueWizardStep(ref, LeagueCreateStep.season);
        Navigator.of(context).maybePop();
      },
      onClose: () => _handleClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final category in draft.categories) ...[
            OrganizerCategoryCard(
              category: category,
              formatLabel: '',
              extraBadge: 'Herdado',
              onEdit: () => showLeagueCategoryEditorSheet(
                context,
                ref,
                existing: category,
              ),
            ),
            const SizedBox(height: 12),
          ],
          OrganizerAddDashedCard(
            title: 'Adicionar categoria',
            subtitle: 'Gênero, idade, nível, vagas e preço padrão da liga',
            onTap: () => showLeagueCategoryEditorSheet(context, ref),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: draft.categories.isEmpty
            ? 'Continuar'
            : 'Continuar · ${draft.categories.length} categorias',
        enabled: canContinue,
        onPressed: () => goToNextLeagueCreateStep(
          context,
          ref,
          LeagueCreateStep.categories,
        ),
      ),
    );
  }
}
