import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../../tournaments/domain/tournament_match_display.dart';
import '../../../../tournaments/domain/tournament_match_set.dart';
import '../../../domain/match_ops/match_ops_models.dart';
import '../../../domain/match_ops/match_scoring_logic.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';
import 'organizer_match_live_table_widgets.dart';

class ValidatePageHeader extends StatelessWidget {
  const ValidatePageHeader({
    super.key,
    required this.onBack,
    this.onMore,
  });

  final VoidCallback onBack;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ValidateIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'VALIDAÇÃO DE RESULTADO',
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Confirmar placar',
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1.15,
                  ),
                ),
              ],
            ),
          ),
          if (onMore != null)
            _ValidateIconButton(
              icon: Icons.more_horiz_rounded,
              onPressed: onMore!,
            )
          else
            const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class ValidateReporterCard extends StatelessWidget {
  const ValidateReporterCard({
    super.key,
    required this.reporterName,
    required this.subtitle,
    required this.badgeLabel,
  });

  final String reporterName;
  final String subtitle;
  final String badgeLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppColors.brand.withValues(alpha: 0.45),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.person_outline_rounded,
                size: 20,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Reportado por $reporterName (atleta)',
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                badgeLabel,
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: Colors.black,
                  letterSpacing: 0.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ValidateScoreCard extends StatelessWidget {
  const ValidateScoreCard({
    super.key,
    required this.match,
    required this.categoryMeta,
    required this.teamA,
    required this.teamB,
    required this.setsWonA,
    required this.setsWonB,
    required this.sets,
  });

  final TournamentMatch match;
  final String categoryMeta;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int setsWonA;
  final int setsWonB;
  final List<TournamentMatchSet> sets;

  @override
  Widget build(BuildContext context) {
    final aWins = setsWonA > setsWonB;
    final bWins = setsWonB > setsWonA;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Column(
          children: [
            Text(
              categoryMeta,
              textAlign: TextAlign.center,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 14),
            _ValidateTeamRow(
              team: teamA,
              seed: liveTableTeamSeed(match, sideA: true),
              setsWon: setsWonA,
              setsWonIsWin: aWins,
            ),
            const SizedBox(height: 12),
            _ValidateTeamRow(
              team: teamB,
              seed: liveTableTeamSeed(match, sideA: false),
              setsWon: setsWonB,
              setsWonIsWin: bWins,
            ),
            const SizedBox(height: 14),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            const SizedBox(height: 12),
            ValidateResultSetStrip(sets: sets),
          ],
        ),
      ),
    );
  }
}

class _ValidateTeamRow extends StatelessWidget {
  const _ValidateTeamRow({
    required this.team,
    required this.setsWon,
    required this.setsWonIsWin,
    this.seed,
  });

  final LiveTableTeamData team;
  final int setsWon;
  final bool setsWonIsWin;
  final int? seed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        OrganizerTeamDualAvatars(
          player1: team.player1,
          player2: team.player2,
          avatarSize: 28,
          overlapRingColor: context.themeColors.surfaceRaised,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(
                  team.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              if (seed != null) ...[
                const SizedBox(width: 8),
                Text(
                  '#$seed',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ],
            ],
          ),
        ),
        Text(
          '$setsWon',
          style: AppTypography.mono(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: setsWonIsWin ? AppColors.win : context.themeColors.onSurface,
            height: 1,
          ),
        ),
      ],
    );
  }
}

class ValidateResultSetStrip extends StatelessWidget {
  const ValidateResultSetStrip({
    super.key,
    required this.sets,
    this.bestOf = MatchScoringLogic.defaultBestOf,
  });

  final List<TournamentMatchSet> sets;
  final int bestOf;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var index = 0; index < bestOf; index++) ...[
          if (index > 0) const SizedBox(width: 8),
          Expanded(
            child: _ValidateSetCard(
              index: index,
              set: index < sets.length ? sets[index] : null,
            ),
          ),
        ],
      ],
    );
  }
}

class _ValidateSetCard extends StatelessWidget {
  const _ValidateSetCard({required this.index, required this.set});

  final int index;
  final TournamentMatchSet? set;

  @override
  Widget build(BuildContext context) {
    final hasStarted = set != null && (set!.a > 0 || set!.b > 0);
    final scoreA = hasStarted ? set!.a : null;
    final scoreB = hasStarted ? set!.b : null;
    final aWins = hasStarted && scoreA! > scoreB!;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        children: [
          Text(
            'SET ${index + 1}',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          if (!hasStarted)
            Text(
              '– · –',
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$scoreA',
                  style: AppTypography.mono(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: aWins ? AppColors.win : context.themeColors.onSurface,
                  ),
                ),
                Text(
                  ' – ',
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                Text(
                  '$scoreB',
                  style: AppTypography.mono(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: !aWins && scoreB! > scoreA!
                        ? AppColors.win
                        : context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class ValidateTeamConfirmationRow extends StatelessWidget {
  const ValidateTeamConfirmationRow({
    super.key,
    required this.teamALabel,
    required this.teamBLabel,
    required this.teamAConfirmed,
    required this.teamBConfirmed,
  });

  final String teamALabel;
  final String teamBLabel;
  final bool teamAConfirmed;
  final bool teamBConfirmed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: _ValidateConfirmationCard(
              teamLabel: teamALabel,
              confirmed: teamAConfirmed,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _ValidateConfirmationCard(
              teamLabel: teamBLabel,
              confirmed: teamBConfirmed,
            ),
          ),
        ],
      ),
    );
  }
}

class _ValidateConfirmationCard extends StatelessWidget {
  const _ValidateConfirmationCard({
    required this.teamLabel,
    required this.confirmed,
  });

  final String teamLabel;
  final bool confirmed;

  @override
  Widget build(BuildContext context) {
    final statusColor =
        confirmed ? AppColors.win : context.themeColors.onSurfaceMuted;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          Icon(
            confirmed
                ? Icons.check_circle_rounded
                : Icons.schedule_rounded,
            size: 22,
            color: statusColor,
          ),
          const SizedBox(height: 8),
          Text(
            teamLabel,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            confirmed ? 'confirmou' : 'pendente',
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: statusColor,
            ),
          ),
        ],
      ),
    );
  }
}

class ValidateActionBar extends StatelessWidget {
  const ValidateActionBar({
    super.key,
    required this.onCorrect,
    required this.onValidate,
    this.validating = false,
  });

  final VoidCallback onCorrect;
  final VoidCallback onValidate;
  final bool validating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            OutlinedButton.icon(
              onPressed: validating ? null : onCorrect,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Corrigir'),
              style: OutlinedButton.styleFrom(
                foregroundColor: context.themeColors.onSurface,
                side: BorderSide(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.28,
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: validating ? null : onValidate,
                icon: validating
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.black,
                        ),
                      )
                    : const Icon(Icons.check_rounded, size: 20, color: Colors.black),
                label: Text(validating ? 'Validando…' : 'Validar resultado'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.win,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  textStyle: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ValidateIconButton extends StatelessWidget {
  const _ValidateIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 20, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

String validateCategoryMeta({
  required TournamentMatch match,
  required String categoryLabel,
}) {
  final parts = <String>[];
  final category = categoryLabel.trim().toUpperCase();
  final round = matchRoundLabel(match).toUpperCase();
  if (category.isNotEmpty) parts.add(category);
  if (round.isNotEmpty) parts.add(round);
  return parts.isNotEmpty ? parts.join(' · ') : 'PARTIDA';
}

String validateReporterName({
  required TournamentMatch match,
  TournamentMatchCardViewModel? enriched,
}) {
  if (match.teamAConfirmed && !match.teamBConfirmed) {
    return _firstNameFromTeamLabel(
      enriched?.teamA.displayName ?? match.teamADescription ?? '',
    );
  }
  if (match.teamBConfirmed && !match.teamAConfirmed) {
    return _firstNameFromTeamLabel(
      enriched?.teamB.displayName ?? match.teamBDescription ?? '',
    );
  }

  final fallback = enriched?.teamA.displayName ?? match.teamADescription ?? '';
  final name = _firstNameFromTeamLabel(fallback);
  return name.isNotEmpty ? name : 'Atleta';
}

String validateReporterSubtitle(TournamentMatch match) {
  final relative = _relativeTimeLabel(match.matchEndedAt);
  const wait = 'aguardando sua confirmação';
  if (relative.isNotEmpty) return '$relative · $wait';
  return wait;
}

String validateReportBadgeLabel(TournamentMatch match) {
  final status =
      MatchReportStatus.parse(match.reportStatus) ?? MatchReportStatus.pending;
  return switch (status) {
    MatchReportStatus.validated => 'VALIDADO',
    MatchReportStatus.pending => 'PENDENTE',
    MatchReportStatus.none => 'PENDENTE',
  };
}

String _firstNameFromTeamLabel(String label) {
  final trimmed = label.trim();
  if (trimmed.isEmpty) return '';
  final firstPlayer = trimmed.split('/').first.trim();
  if (firstPlayer.isEmpty) return '';
  return firstPlayer.split(RegExp(r'\s+')).first;
}

String _relativeTimeLabel(DateTime? at) {
  if (at == null) return '';
  final diff = DateTime.now().difference(at);
  if (diff.inMinutes < 1) return 'agora';
  if (diff.inMinutes < 60) return 'há ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'há ${diff.inHours} h';
  return 'há ${diff.inDays} d';
}
