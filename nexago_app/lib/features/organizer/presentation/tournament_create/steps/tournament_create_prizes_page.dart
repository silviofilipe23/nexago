import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../sheets/tournament_prize_editor_sheet.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_category_cards.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreatePrizesPage extends ConsumerWidget {
  const TournamentCreatePrizesPage({super.key});

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.prizes));

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.prizes,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.registration);
        Navigator.of(context).maybePop();
      },
      onClose: () => _handleClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OrganizerToggleSettingRow(
            icon: Icons.card_giftcard_outlined,
            title: 'Premiação em dinheiro',
            subtitle: 'Desligue para premiar só com troféus/brindes.',
            value: draft.cashPrizesEnabled,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setCashPrizesEnabled(value),
          ),
          if (draft.cashPrizesEnabled) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                const Expanded(
                  child: OrganizerSectionLabel('POR CATEGORIA'),
                ),
                Text(
                  '${formatCents(draft.totalPrizeCents)} no total',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: AppColors.win,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            for (final category in draft.categories) ...[
              OrganizerPrizeCategoryCard(
                category: category,
                onEdit: () => showTournamentPrizeEditorSheet(
                  context,
                  ref,
                  category: category,
                ),
              ),
              const SizedBox(height: 12),
            ],
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
              ),
              child: Text.rich(
                TextSpan(
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.45,
                      ),
                  children: const [
                    TextSpan(
                      text:
                          'Premiações diferentes por categoria. Para repetir uma, use ',
                    ),
                    TextSpan(
                      text: '"aplicar a todas"',
                      style: TextStyle(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    TextSpan(text: ' dentro do editor.'),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.prizes,
        ),
      ),
    );
  }
}
