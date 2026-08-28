import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_stage_create/league_stage_create_draft.dart';
import '../../../domain/league_stage_create/league_stage_create_providers.dart';
import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../league_stage_create_navigation.dart';
import '../league_stage_create_wizard_scaffold.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueStageCreateCategoriesPage extends ConsumerStatefulWidget {
  const LeagueStageCreateCategoriesPage({super.key});

  @override
  ConsumerState<LeagueStageCreateCategoriesPage> createState() =>
      _LeagueStageCreateCategoriesPageState();
}

class _LeagueStageCreateCategoriesPageState
    extends ConsumerState<LeagueStageCreateCategoriesPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final leagueId = leagueIdFromRoute(context);
      if (leagueId.isEmpty) return;
      await ensureLeagueStageWizardLoaded(ref, leagueId);
      syncLeagueStageWizardStep(ref, LeagueStageCreateStep.categoriesRegistration);
    });
  }

  Future<void> _pickDate({required bool opens}) async {
    final draft = ref.read(leagueStageCreateDraftProvider);
    final initial = opens
        ? (draft.registrationOpensAt ?? DateTime.now())
        : (draft.registrationClosesAt ??
            draft.registrationOpensAt ??
            DateTime.now());
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (pickedDate == null) return;
    if (!context.mounted) return;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (pickedTime == null) return;
    final combined = DateTime(
      pickedDate.year,
      pickedDate.month,
      pickedDate.day,
      pickedTime.hour,
      pickedTime.minute,
    );
    final notifier = ref.read(leagueStageCreateWizardProvider.notifier);
    if (opens) {
      notifier.setRegistrationOpensAt(combined);
    } else {
      notifier.setRegistrationClosesAt(combined);
    }
  }

  TournamentCategoryDraft _toDisplayCategory(LeagueStageCategoryDraft category) {
    return TournamentCategoryDraft(
      id: category.categoryId,
      name: category.name,
      spots: category.spots,
      gender: category.gender,
      dispute: category.dispute,
      ageBand: category.ageBand,
      skillLevel: category.skillLevel,
      minLevel: category.minLevel,
      priceCents: category.priceCents,
      useDefaultPrice: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueStageCreateDraftProvider);
    final leagueId = leagueIdFromRoute(context);
    final canContinue = ref.watch(
      leagueStageCreateCanContinueProvider(
        LeagueStageCreateStep.categoriesRegistration,
      ),
    );

    return LeagueStageCreateWizardScaffold(
      step: LeagueStageCreateStep.categoriesRegistration,
      onBack: () {
        syncLeagueStageWizardStep(ref, LeagueStageCreateStep.location);
        Navigator.of(context).maybePop();
      },
      onClose: () => handleLeagueStageWizardClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('CATEGORIAS HERDADAS'),
          const SizedBox(height: 8),
          Text(
            'Desative categorias que não abrem nesta etapa.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.4,
                ),
          ),
          const SizedBox(height: 16),
          for (final category in draft.categories) ...[
            _InheritedCategoryCard(
              category: category,
              display: _toDisplayCategory(category),
              onToggle: (enabled) => ref
                  .read(leagueStageCreateWizardProvider.notifier)
                  .setCategoryEnabled(category.categoryId, enabled),
              onSpotsChanged: (spots) => ref
                  .read(leagueStageCreateWizardProvider.notifier)
                  .setCategorySpots(category.categoryId, spots),
            ),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 12),
          const OrganizerSectionLabel('INSCRIÇÕES'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OrganizerDateField(
                  label: 'ABREM EM',
                  value: formatShortDateTime(draft.registrationOpensAt),
                  onTap: () => _pickDate(opens: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OrganizerDateField(
                  label: 'FECHAM EM',
                  value: formatShortDateTime(draft.registrationClosesAt),
                  onTap: () => _pickDate(opens: false),
                ),
              ),
            ],
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: leagueId.isEmpty
            ? null
            : () => goToNextLeagueStageCreateStep(
                  context,
                  ref,
                  LeagueStageCreateStep.categoriesRegistration,
                  leagueId,
                ),
      ),
    );
  }
}

class _InheritedCategoryCard extends StatelessWidget {
  const _InheritedCategoryCard({
    required this.category,
    required this.display,
    required this.onToggle,
    required this.onSpotsChanged,
  });

  final LeagueStageCategoryDraft category;
  final TournamentCategoryDraft display;
  final ValueChanged<bool> onToggle;
  final ValueChanged<int> onSpotsChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: category.enabled
              ? AppColors.brand.withValues(alpha: 0.2)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.name.trim().isEmpty
                      ? suggestCategoryName(display)
                      : category.name.trim(),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: category.enabled
                            ? null
                            : context.themeColors.onSurfaceMuted,
                      ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Herdado',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              const SizedBox(width: 8),
              Switch.adaptive(
                value: category.enabled,
                onChanged: onToggle,
                activeColor: AppColors.brand,
              ),
            ],
          ),
          if (category.enabled) ...[
            const SizedBox(height: 14),
            const OrganizerSectionLabel('VAGAS NESTA ETAPA'),
            const SizedBox(height: 8),
            OrganizerNumericStepper(
              valueLabel: '${category.spots} vagas',
              minReached: category.spots <= 4,
              onDecrement: () => onSpotsChanged(category.spots - 2),
              onIncrement: () => onSpotsChanged(category.spots + 2),
            ),
          ],
        ],
      ),
    );
  }
}
