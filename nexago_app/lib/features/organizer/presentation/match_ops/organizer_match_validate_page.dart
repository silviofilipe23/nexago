import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';

import '../../domain/match_ops/match_ops_logic.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import 'widgets/organizer_match_validate_widgets.dart';

/// I3 — Validar reporte.
class OrganizerMatchValidatePage extends ConsumerStatefulWidget {
  const OrganizerMatchValidatePage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  ConsumerState<OrganizerMatchValidatePage> createState() =>
      _OrganizerMatchValidatePageState();
}

class _OrganizerMatchValidatePageState
    extends ConsumerState<OrganizerMatchValidatePage> {
  bool _validating = false;

  @override
  Widget build(BuildContext context) {
    final matchAsync = ref.watch(
      organizerMatchByIdProvider((
        tournamentId: widget.tournamentId,
        matchId: widget.matchId,
      )),
    );
    final enrichedMap = ref.watch(
      organizerMatchCardsByIdProvider(widget.tournamentId),
    );
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: matchAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (match) {
          if (match == null) {
            return const Center(child: Text('Partida não encontrada'));
          }

          final enriched = enrichedMap.valueOrNull?[match.id];
          final categoryLabel = MatchOpsLogic.categoryDisplayLabel(
            categoryId: match.categoryId,
            categories: categories,
          );
          final sets = setsForMatch(match);
          final counts = setsWonCountForMatch(match);
          final teamA = liveTableTeamData(
            match: match,
            sideA: true,
            enrichedTeam: enriched?.teamA,
          );
          final teamB = liveTableTeamData(
            match: match,
            sideA: false,
            enrichedTeam: enriched?.teamB,
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SafeArea(
                bottom: false,
                child: ValidatePageHeader(
                  onBack: () => context.pop(),
                  onMore: () => context.push(
                    organizerMatchSummaryPath(
                      widget.tournamentId,
                      widget.matchId,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 16),
                  children: [
                    // ValidateReporterCard(
                    //   reporterName: validateReporterName(
                    //     match: match,
                    //     enriched: enriched,
                    //   ),
                    //   subtitle: validateReporterSubtitle(match),
                    //   badgeLabel: validateReportBadgeLabel(match),
                    // ),
                    // const SizedBox(height: 16),
                    ValidateScoreCard(
                      match: match,
                      categoryMeta: validateCategoryMeta(
                        match: match,
                        categoryLabel: categoryLabel,
                      ),
                      teamA: teamA,
                      teamB: teamB,
                      setsWonA: counts.$1,
                      setsWonB: counts.$2,
                      sets: sets,
                    ),
                    // const SizedBox(height: 16),
                    // ValidateTeamConfirmationRow(
                    //   teamALabel: teamA.label,
                    //   teamBLabel: teamB.label,
                    //   teamAConfirmed: match.teamAConfirmed,
                    //   teamBConfirmed: match.teamBConfirmed,
                    // ),
                  ],
                ),
              ),
              ValidateActionBar(
                validating: _validating,
                onCorrect: () => context.push(
                  organizerMatchQuickScorePath(
                    widget.tournamentId,
                    widget.matchId,
                  ),
                ),
                onValidate: () => _validate(match.id),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _validate(String matchId) async {
    if (_validating) return;
    setState(() => _validating = true);
    try {
      await ref
          .read(organizerMatchScheduleServiceProvider)
          .validateMatchResult(matchId: matchId);
      if (!mounted) return;
      await pushSuccessFeedback(
        context,
        title: 'Resultado validado',
        description: 'O placar foi confirmado e a chave foi atualizada.',
        primaryAction: FeedbackAction(
          label: 'Ver partida',
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
      if (!mounted) return;
      context.pushReplacement(
        organizerMatchSummaryPath(widget.tournamentId, matchId),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro: $e');
      }
    } finally {
      if (mounted) setState(() => _validating = false);
    }
  }
}
