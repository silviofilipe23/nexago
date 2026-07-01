import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import 'widgets/organizer_match_validate_widgets.dart';
import '../../presentation/category_ops/widgets/organizer_team_dual_avatars.dart';

/// I4 — Súmula e audit log.
class OrganizerMatchSummaryPage extends ConsumerWidget {
  const OrganizerMatchSummaryPage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchAsync = ref.watch(organizerMatchByIdProvider((
      tournamentId: tournamentId,
      matchId: matchId,
    )));
    final auditAsync = ref.watch(organizerMatchAuditLogProvider(matchId));
    final enrichedMap = ref.watch(organizerMatchCardsByIdProvider(tournamentId));
    final categories =
        ref.watch(organizerTournamentDetailProvider(tournamentId)).valueOrNull?.categories ??
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
          final categoryLabel = MatchOpsLogic.categoryCompactLabel(
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
                child: _SummaryHeader(
                  match: match,
                  onBack: () => context.pop(),
                  onMore: null,
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _SummaryMatchCard(
                      match: match,
                      categoryLabel: categoryLabel,
                      teamA: teamA,
                      teamB: teamB,
                      setsWonA: counts.$1,
                      setsWonB: counts.$2,
                      sets: sets,
                    ),
                    const SizedBox(height: 24),
                    _SummaryHistorySection(auditAsync: auditAsync),
                  ],
                ),
              ),
              _SummaryBottomBar(
                onShare: () => Share.share(
                  'Súmula: ${match.teamsLabel} — ${match.scoreLabel}',
                ),
                onAdvance: () =>
                    context.go(organizerMatchCenterPath(tournamentId)),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({
    required this.match,
    required this.onBack,
    this.onMore,
  });

  final TournamentMatch match;
  final VoidCallback onBack;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    final court = match.courtName?.trim() ?? '';
    final supertitle =
        court.isNotEmpty ? 'SÚMULA DIGITAL · $court' : 'SÚMULA DIGITAL';
    final title = match.isCompleted
        ? 'Partida encerrada'
        : match.isInProgress
            ? 'Partida ao vivo'
            : 'Súmula';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SummaryIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    supertitle,
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    title,
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
          ),
          if (onMore != null)
            _SummaryIconButton(
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

class _SummaryMatchCard extends StatelessWidget {
  const _SummaryMatchCard({
    required this.match,
    required this.categoryLabel,
    required this.teamA,
    required this.teamB,
    required this.setsWonA,
    required this.setsWonB,
    required this.sets,
  });

  final TournamentMatch match;
  final String categoryLabel;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int setsWonA;
  final int setsWonB;
  final List sets;

  @override
  Widget build(BuildContext context) {
    final categoryMeta = validateCategoryMeta(
      match: match,
      categoryCompactLabel: categoryLabel,
    );
    final isValidated = match.reportStatus == 'validated';
    final durationMin = match.matchStartedAt != null && match.matchEndedAt != null
        ? match.matchEndedAt!.difference(match.matchStartedAt!).inMinutes
        : null;
    final totalPts = match.sets.fold<int>(0, (sum, s) => sum + s.a + s.b);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                categoryMeta,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              if (isValidated) const _ValidatedBadge(),
            ],
          ),
          const SizedBox(height: 14),
          _SummaryTeamRow(
            team: teamA,
            seed: liveTableTeamSeed(match, sideA: true),
            setsWon: setsWonA,
            isWinner: setsWonA > setsWonB,
          ),
          const SizedBox(height: 12),
          _SummaryTeamRow(
            team: teamB,
            seed: liveTableTeamSeed(match, sideA: false),
            setsWon: setsWonB,
            isWinner: setsWonB > setsWonA,
          ),
          if (match.sets.isNotEmpty) ...[
            const SizedBox(height: 14),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            const SizedBox(height: 12),
            ValidateResultSetStrip(sets: match.sets),
          ],
          if (durationMin != null || totalPts > 0) ...[
            const SizedBox(height: 14),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            const SizedBox(height: 12),
            _SummaryStatsRow(durationMin: durationMin, totalPts: totalPts),
          ],
        ],
      ),
    );
  }
}

class _ValidatedBadge extends StatelessWidget {
  const _ValidatedBadge();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.check_rounded, size: 12, color: AppColors.win),
        const SizedBox(width: 4),
        Text(
          'VALIDADA',
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w800,
            color: AppColors.win,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}

class _SummaryTeamRow extends StatelessWidget {
  const _SummaryTeamRow({
    required this.team,
    required this.setsWon,
    required this.isWinner,
    this.seed,
  });

  final LiveTableTeamData team;
  final int setsWon;
  final bool isWinner;
  final int? seed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        OrganizerTeamDualAvatars(
          player1: team.player1,
          player2: team.player2,
          avatarSize: 28,
          overlapRingColor: context.themeColors.surfaceCard,
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
                const SizedBox(width: 6),
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
        const SizedBox(width: 8),
        Text(
          '$setsWon',
          style: AppTypography.mono(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: isWinner ? AppColors.win : context.themeColors.onSurface,
            height: 1,
          ),
        ),
      ],
    );
  }
}

class _SummaryStatsRow extends StatelessWidget {
  const _SummaryStatsRow({this.durationMin, required this.totalPts});

  final int? durationMin;
  final int totalPts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (durationMin != null) ...[
          _StatCell(value: '$durationMin min', label: 'Duração'),
          if (totalPts > 0) const SizedBox(width: 24),
        ],
        if (totalPts > 0)
          _StatCell(value: '$totalPts', label: 'Total pts'),
      ],
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: AppTypography.mono(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _SummaryHistorySection extends StatelessWidget {
  const _SummaryHistorySection({required this.auditAsync});

  final AsyncValue<List<MatchAuditLogEntry>> auditAsync;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'HISTÓRICO DA SÚMULA',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 12),
        auditAsync.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text('$e'),
          data: (entries) {
            if (entries.isEmpty) {
              return Text(
                'Nenhum evento registrado.',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                ),
              );
            }
            return Column(
              children: [
                for (final entry in entries)
                  _AuditLogEntryTile(entry: entry),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _AuditLogEntryTile extends StatelessWidget {
  const _AuditLogEntryTile({required this.entry});

  final MatchAuditLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final style = _auditEntryStyle(entry.type);
    final label = _auditEntryLabel(entry);
    final subtitle = _auditEntrySubtitle(entry);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: style.color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(style.icon, size: 16, color: style.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryBottomBar extends StatelessWidget {
  const _SummaryBottomBar({
    required this.onShare,
    required this.onAdvance,
  });

  final VoidCallback onShare;
  final VoidCallback onAdvance;

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
              onPressed: onShare,
              icon: const Icon(Icons.share_rounded, size: 18),
              label: const Text('Compartilhar'),
              style: OutlinedButton.styleFrom(
                foregroundColor: context.themeColors.onSurface,
                side: BorderSide(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.28,
                  ),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: onAdvance,
                icon: const Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: Colors.black,
                ),
                label: const Text('Avançar'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
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

class _SummaryIconButton extends StatelessWidget {
  const _SummaryIconButton({required this.icon, required this.onPressed});

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
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

({IconData icon, Color color}) _auditEntryStyle(String type) {
  final t = type.toLowerCase();
  if (t.contains('validat') || t.contains('confirm')) {
    return (icon: Icons.check_rounded, color: AppColors.win);
  }
  if (t.contains('correct') || t.contains('edit') || t.contains('set_')) {
    return (icon: Icons.edit_rounded, color: AppColors.pending);
  }
  if (t.contains('report') || t.contains('result')) {
    return (icon: Icons.person_rounded, color: AppColors.brand);
  }
  return (icon: Icons.circle, color: AppColors.live);
}

String _auditEntryLabel(MatchAuditLogEntry entry) {
  switch (entry.type) {
    case 'match_started':
      return 'Partida iniciada';
    case 'result_reported':
    case 'score_reported':
      return 'Resultado reportado pela mesa';
    case 'score_correction':
    case 'set_corrected':
    case 'result_corrected':
      final setIdx = entry.meta['setIndex'];
      if (setIdx is int) {
        final newA = entry.meta['newA'];
        final newB = entry.meta['newB'];
        final oldA = entry.meta['oldA'];
        final oldB = entry.meta['oldB'];
        if (newA != null && newB != null && oldA != null && oldB != null) {
          return 'Set ${setIdx + 1} corrigido: $newA-$newB (era $oldA-$oldB)';
        }
      }
      return 'Resultado corrigido';
    case 'result_validated':
    case 'validate':
    case 'match_validated':
      return 'Resultado validado pelo organizador';
    case 'check_in':
      return 'Check-in realizado';
    case 'match_ended':
      return 'Partida encerrada';
    default:
      return entry.type;
  }
}

String _auditEntrySubtitle(MatchAuditLogEntry entry) {
  final local = entry.at.toLocal();
  final h = local.hour.toString().padLeft(2, '0');
  final m = local.minute.toString().padLeft(2, '0');
  final time = '$h:$m';
  final actorName =
      (entry.meta['actorName'] as String?)?.trim() ?? entry.byUid;
  final parts = <String>[];
  if (entry.byRole.isNotEmpty) parts.add(entry.byRole);
  if (actorName.isNotEmpty) parts.add(actorName);
  parts.add(time);
  return parts.join(' · ');
}
