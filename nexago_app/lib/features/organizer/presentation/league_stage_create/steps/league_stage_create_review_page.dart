import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/league_create/league_create_logic.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../../../domain/league_stage_create/league_stage_create_draft.dart';
import '../../../domain/league_stage_create/league_stage_create_logic.dart';
import '../../../domain/league_stage_create/league_stage_create_providers.dart';
import '../league_stage_create_navigation.dart';
import '../league_stage_create_wizard_scaffold.dart';
import '../league_stage_published_page.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueStageCreateReviewPage extends ConsumerStatefulWidget {
  const LeagueStageCreateReviewPage({super.key});

  @override
  ConsumerState<LeagueStageCreateReviewPage> createState() =>
      _LeagueStageCreateReviewPageState();
}

class _LeagueStageCreateReviewPageState
    extends ConsumerState<LeagueStageCreateReviewPage> {
  var _submitting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final leagueId = leagueIdFromRoute(context);
      if (leagueId.isEmpty) return;
      await ensureLeagueStageWizardLoaded(ref, leagueId);
      syncLeagueStageWizardStep(ref, LeagueStageCreateStep.review);
    });
  }

  Future<void> _submit({required bool publish}) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final draft = ref.read(leagueStageCreateDraftProvider);
      final leagueId = leagueIdFromRoute(context);
      final result = await ref.read(organizerLeaguesRepositoryProvider).saveStage(
            draft: draft,
            publish: publish,
          );
      await ref.read(leagueStageCreateWizardProvider.notifier).clearSession();
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.organizerLeagueStagePublished,
        pathParameters: {'leagueId': leagueId},
        extra: LeagueStagePublishedArgs(
          leagueId: leagueId,
          tournamentId: result.tournamentId,
          stageName: draft.stage.name.trim(),
          leagueName: draft.leagueName.trim(),
          published: result.published,
        ),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao salvar etapa: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueStageCreateDraftProvider);
    final leagueId = leagueIdFromRoute(context);
    final canContinue = ref.watch(
      leagueStageCreateCanContinueProvider(LeagueStageCreateStep.review),
    );

    return LeagueStageCreateWizardScaffold(
      step: LeagueStageCreateStep.review,
      onBack: () {
        syncLeagueStageWizardStep(ref, LeagueStageCreateStep.categoriesRegistration);
        Navigator.of(context).maybePop();
      },
      onClose: () => handleLeagueStageWizardClose(context, ref),
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
                  draft.stage.name.trim(),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  reviewStageLeagueSummary(draft).toUpperCase(),
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
            icon: Icons.location_on_outlined,
            label: 'LOCAL E DATAS',
            value: reviewStageLocationSummary(draft),
            onEdit: () => goToLeagueStageCreateStep(
              context,
              ref,
              LeagueStageCreateStep.location,
              leagueId,
            ),
          ),
          _ReviewSection(
            icon: Icons.group_add_outlined,
            label: 'CATEGORIAS ATIVAS',
            value: reviewStageCategoriesSummary(draft),
            onEdit: () => goToLeagueStageCreateStep(
              context,
              ref,
              LeagueStageCreateStep.categoriesRegistration,
              leagueId,
            ),
          ),
          _ReviewSection(
            icon: Icons.event_available_outlined,
            label: 'INSCRIÇÕES',
            value: reviewStageRegistrationSummary(draft),
            onEdit: () => goToLeagueStageCreateStep(
              context,
              ref,
              LeagueStageCreateStep.categoriesRegistration,
              leagueId,
            ),
          ),
          _ReviewSection(
            icon: Icons.sports_score_outlined,
            label: 'FORMATO E RANKING',
            value:
                '${reviewStageFormatSummary(draft)} · ${leagueRankingTableLabel(draft.rankingTableId)}',
            onEdit: null,
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF22C55E).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFF22C55E).withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.notifications_active_outlined,
                  color: Color(0xFF22C55E),
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Duplas inscritas no circuito serão avisadas quando a etapa for publicada.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurface,
                          height: 1.45,
                        ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          OrganizerWizardContinueButton(
            label: 'Publicar etapa',
            enabled: canContinue,
            loading: _submitting,
            onPressed: () => _submit(publish: true),
          ),
          OrganizerSecondaryButton(
            label: 'Salvar rascunho',
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
  final VoidCallback? onEdit;

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
          if (onEdit != null)
            TextButton(
              onPressed: onEdit,
              child: const Text('Editar'),
            ),
        ],
      ),
    );
  }
}
