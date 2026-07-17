import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../sheets/tournament_prize_editor_sheet.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_category_cards.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreatePrizesPage extends ConsumerStatefulWidget {
  const TournamentCreatePrizesPage({super.key});

  @override
  ConsumerState<TournamentCreatePrizesPage> createState() =>
      _TournamentCreatePrizesPageState();
}

class _TournamentCreatePrizesPageState
    extends ConsumerState<TournamentCreatePrizesPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncWizardStep(ref, TournamentCreateStep.prizes);
    });
  }

  Future<void> _handleClose() => handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue = ref.watch(
      tournamentCreateCanContinueProvider(TournamentCreateStep.prizes),
    );

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.prizes,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.registration);
        Navigator.of(context).maybePop();
      },
      onClose: _handleClose,
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
            const SizedBox(height: 16),
            Row(
              children: [
                const Expanded(
                  child: OrganizerSectionLabel('PREMIAÇÃO POR CATEGORIA'),
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
          ],
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () =>
            goToNextCreateStep(context, ref, TournamentCreateStep.prizes),
      ),
    );
  }
}
