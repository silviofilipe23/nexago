import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_logic.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../league_create_navigation.dart';
import '../league_create_wizard_scaffold.dart';
import '../league_published_page.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueCreateReviewPage extends ConsumerStatefulWidget {
  const LeagueCreateReviewPage({super.key});

  @override
  ConsumerState<LeagueCreateReviewPage> createState() =>
      _LeagueCreateReviewPageState();
}

class _LeagueCreateReviewPageState extends ConsumerState<LeagueCreateReviewPage> {
  var _submitting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncLeagueWizardStep(ref, LeagueCreateStep.review);
    });
  }

  Future<void> _handleClose() => handleLeagueWizardClose(context, ref);

  Future<void> _submit({required bool publish}) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final draft = ref.read(leagueCreateDraftProvider);
      final step = ref.read(leagueCreateCurrentStepProvider);
      final result = await ref.read(organizerLeaguesRepositoryProvider).saveLeague(
            draft: draft,
            publish: publish,
            wizardStep: step,
          );
      await ref.read(leagueCreateWizardProvider.notifier).clearSession();
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.organizerLeaguePublished,
        extra: LeaguePublishedArgs(
          leagueId: result.leagueId,
          name: draft.name.trim(),
          published: result.published,
        ),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao salvar liga: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueCreateDraftProvider);
    final canContinue =
        ref.watch(leagueCreateCanContinueProvider(LeagueCreateStep.review));

    final locationLine = [
      if (draft.organizationName.trim().isNotEmpty) draft.organizationName.trim(),
      if (draft.city.trim().isNotEmpty) draft.city.trim(),
      if (draft.state.trim().isNotEmpty) draft.state.trim(),
    ].join(' · ');

    return LeagueCreateWizardScaffold(
      step: LeagueCreateStep.review,
      onBack: () {
        syncLeagueWizardStep(ref, LeagueCreateStep.stages);
        Navigator.of(context).maybePop();
      },
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
                if (locationLine.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    locationLine.toUpperCase(),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                  ),
                ],
                const SizedBox(height: 4),
                Text(
                  '${sportLabel(draft.sport).toUpperCase()} · '
                          '${formatLeagueShortSeasonRange(draft.seasonStartAt, draft.seasonEndAt)}'
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
            label: 'IDENTIDADE',
            value: draft.name.trim(),
            onEdit: () => goToLeagueCreateStep(
              context,
              ref,
              LeagueCreateStep.identity,
            ),
          ),
          _ReviewSection(
            icon: Icons.calendar_month_outlined,
            label: 'TEMPORADA',
            value: reviewLeagueSeasonSummary(draft),
            onEdit: () => goToLeagueCreateStep(
              context,
              ref,
              LeagueCreateStep.season,
            ),
          ),
          _ReviewSection(
            icon: Icons.group_add_outlined,
            label: 'CATEGORIAS',
            value: reviewLeagueCategoriesSummary(draft),
            onEdit: () => goToLeagueCreateStep(
              context,
              ref,
              LeagueCreateStep.categories,
            ),
          ),
          _ReviewSection(
            icon: Icons.leaderboard_outlined,
            label: 'RANKING',
            value: reviewLeagueRankingSummary(draft),
            onEdit: () => goToLeagueCreateStep(
              context,
              ref,
              LeagueCreateStep.ranking,
            ),
          ),
          _ReviewSection(
            icon: Icons.emoji_events_outlined,
            label: 'GRANDE FINAL',
            value: reviewLeagueGrandFinalSummary(draft),
            onEdit: () => goToLeagueCreateStep(
              context,
              ref,
              LeagueCreateStep.ranking,
            ),
          ),
          _ReviewSection(
            icon: Icons.flag_outlined,
            label: 'ETAPAS',
            value: reviewLeagueStagesSummary(draft),
            onEdit: () => goToLeagueCreateStep(
              context,
              ref,
              LeagueCreateStep.stages,
            ),
          ),
        ],
      ),
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          OrganizerWizardContinueButton(
            label: 'Publicar circuito',
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
