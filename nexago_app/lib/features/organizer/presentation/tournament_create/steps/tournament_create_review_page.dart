import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';
import '../tournament_published_page.dart';

class TournamentCreateReviewPage extends ConsumerStatefulWidget {
  const TournamentCreateReviewPage({super.key});

  @override
  ConsumerState<TournamentCreateReviewPage> createState() =>
      _TournamentCreateReviewPageState();
}

class _TournamentCreateReviewPageState
    extends ConsumerState<TournamentCreateReviewPage> {
  var _submitting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncWizardStep(ref, TournamentCreateStep.review);
    });
  }

  Future<void> _handleClose() => handleWizardClose(context, ref);

  Future<void> _submit({required bool publish}) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final draft = ref.read(tournamentCreateDraftProvider);
      final step = ref.read(tournamentCreateCurrentStepProvider);
      final result = await ref
          .read(organizerTournamentsRepositoryProvider)
          .saveTournament(
            draft: draft,
            publish: publish,
            wizardStep: step,
          );
      await ref.read(tournamentCreateWizardProvider.notifier).clearSession(
            deleteRemoteDraft: false,
          );
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.organizerTournamentPublished,
        extra: TournamentPublishedArgs(
          tournamentId: result.tournamentId,
          name: draft.name.trim(),
          published: result.published,
        ),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao salvar torneio: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.review));

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.review,
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                colors: [
                  AppColors.brand.withValues(alpha: 0.18),
                  context.themeColors.surfaceCard,
                ],
              ),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  draft.name.trim(),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${draft.locationName.toUpperCase()} · ${formatShortDate(draft.startAt)}-${formatShortDate(draft.endAt)}'
                      .toUpperCase(),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _ReviewSection(
            icon: Icons.sports_volleyball_outlined,
            label: 'ESPORTE',
            value: reviewSportSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.identity,
            ),
          ),
          _ReviewSection(
            icon: Icons.location_on_outlined,
            label: 'LOCAL & DATAS',
            value: reviewLocationSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.location,
            ),
          ),
          _ReviewSection(
            icon: Icons.group_add_outlined,
            label: 'CATEGORIAS & FORMATO',
            value: reviewCategoriesDetailSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.categories,
            ),
          ),
          _ReviewSection(
            icon: Icons.confirmation_number_outlined,
            label: 'INSCRIÇÕES',
            value: reviewRegistrationSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.registration,
            ),
          ),
          _ReviewSection(
            icon: Icons.card_giftcard_outlined,
            label: 'PREMIAÇÃO',
            value: reviewPrizesSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.prizes,
            ),
          ),
          _ReviewSection(
            icon: Icons.checkroom_outlined,
            label: 'UNIFORME',
            value: reviewUniformSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.rules,
            ),
          ),
          _ReviewSection(
            icon: Icons.emoji_events_outlined,
            label: 'RANKING',
            value: reviewRankingSummary(draft),
            onEdit: () => goToCreateStep(
              context,
              ref,
              TournamentCreateStep.rules,
            ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('VISIBILIDADE'),
          const SizedBox(height: 12),
          for (final visibility in TournamentVisibility.values) ...[
            OrganizerRadioOptionCard(
              title: visibilityLabel(visibility),
              subtitle: visibilityDescription(visibility),
              selected: draft.visibility == visibility,
              onTap: () => ref
                  .read(tournamentCreateWizardProvider.notifier)
                  .setVisibility(visibility),
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          OrganizerWizardContinueButton(
            label: 'Publicar torneio',
            enabled: canContinue,
            loading: _submitting,
            onPressed: () => _submit(publish: true),
          ),
          OrganizerSecondaryButton(
            label: 'Salvar como rascunho',
            loading: _submitting,
            onPressed: canContinue ? () => _submit(publish: false) : null,
          ),
        ],
      ),
    );
  }
}

class _ReviewSection extends StatelessWidget {
  const _ReviewSection({
    required this.icon,
    required this.label,
    required this.value,
    required this.onEdit,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.brand, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.4,
                      ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onEdit,
            child: const Text('Editar'),
          ),
        ],
      ),
    );
  }
}
