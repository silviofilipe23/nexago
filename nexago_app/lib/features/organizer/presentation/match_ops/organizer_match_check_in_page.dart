import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/data/nexago_artifacts_paths.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import '../../presentation/category_ops/widgets/organizer_team_dual_avatars.dart';

/// J1 — Check-in & W.O.
class OrganizerMatchCheckInPage extends ConsumerStatefulWidget {
  const OrganizerMatchCheckInPage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  ConsumerState<OrganizerMatchCheckInPage> createState() =>
      _OrganizerMatchCheckInPageState();
}

class _OrganizerMatchCheckInPageState
    extends ConsumerState<OrganizerMatchCheckInPage> {
  bool _releasingMatch = false;
  String? _updatingTeam;

  @override
  Widget build(BuildContext context) {
    final matchAsync = ref.watch(organizerMatchByIdProvider((
      tournamentId: widget.tournamentId,
      matchId: widget.matchId,
    )));
    final enrichedMap =
        ref.watch(organizerMatchCardsByIdProvider(widget.tournamentId));
    final config =
        ref.watch(organizerMatchOpsConfigProvider(widget.tournamentId)).valueOrNull;
    final categories = ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];
    final matchOpsState =
        ref.watch(organizerMatchOpsStateProvider(widget.tournamentId));

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

          final checkInA =
              MatchCheckInStatus.parse(match.checkInTeamAStatus) ??
                  MatchCheckInStatus.pending;
          final checkInB =
              MatchCheckInStatus.parse(match.checkInTeamBStatus) ??
                  MatchCheckInStatus.pending;
          final presentCount = [checkInA, checkInB]
              .where((s) => s == MatchCheckInStatus.present)
              .length;

          final upcomingRows = matchOpsState.callQueue
              .where((r) =>
                  r.match.id != match.id &&
                  (r.queueStatus == MatchQueueStatus.waiting ||
                      r.queueStatus == MatchQueueStatus.onDeck))
              .take(4)
              .toList();

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SafeArea(
                bottom: false,
                child: _CheckInHeader(
                  match: match,
                  categoryLabel: categoryLabel,
                  onBack: () => context.pop(),
              ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _ToleranceCard(
                      toleranceMin: config?.checkInToleranceMin ?? 15,
                      scheduleTime: match.scheduleTime,
                    ),
                    const SizedBox(height: 24),
                    _SectionHeader(
                      title: 'DUPLAS DA PARTIDA',
                      trailing: '$presentCount / 2 prontas',
                    ),
                    const SizedBox(height: 12),
                    _TeamCheckInCard(
                      team: teamA,
                      seed: liveTableTeamSeed(match, sideA: true),
                      checkInStatus: checkInA,
                      isUpdating: _updatingTeam == 'teamA',
                      onCheckIn: () => _setCheckIn(match.id, team: 'teamA'),
                      onWo: () => _declareWo(
                        match.id,
                        losingTeamKey: 'teamA',
                        winnerTeamId: match.teamBId,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _TeamCheckInCard(
                      team: teamB,
                      seed: liveTableTeamSeed(match, sideA: false),
                      checkInStatus: checkInB,
                      isUpdating: _updatingTeam == 'teamB',
                      onCheckIn: () => _setCheckIn(match.id, team: 'teamB'),
                      onWo: () => _declareWo(
                        match.id,
                        losingTeamKey: 'teamB',
                        winnerTeamId: match.teamAId,
                      ),
                    ),
                    if (upcomingRows.isNotEmpty) ...[
                      const SizedBox(height: 28),
                      const _SectionHeader(title: 'PRÓXIMAS CHAMADAS'),
                      const SizedBox(height: 12),
                      for (final row in upcomingRows)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _UpcomingCallRow(
                            match: row.match,
                            enriched: enrichedMap.valueOrNull?[row.match.id],
                            checkInA: row.checkInA,
                            checkInB: row.checkInB,
                          ),
                        ),
                    ],
                  ],
                ),
              ),
              _CheckInBottomBar(
                releasing: _releasingMatch,
                onDeclareWo: () => _showWoSheet(
                  match,
                  teamALabel: teamA.label,
                  teamBLabel: teamB.label,
                ),
                onRelease: () => _releaseMatch(match.id),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _setCheckIn(String matchId, {required String team}) async {
    if (_updatingTeam != null) return;
    setState(() => _updatingTeam = team);
    try {
      await FirebaseFirestore.instance
          .collection(NexagoArtifactsPaths.matchesCollection())
          .doc(matchId)
          .update({
        'checkIn.$team': {
          'status': 'present',
          'at': FieldValue.serverTimestamp(),
        },
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (mounted) showAppSnackBar(context, 'Check-in atualizado.');
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _updatingTeam = null);
    }
  }

  Future<void> _declareWo(
    String matchId, {
    required String losingTeamKey,
    required String winnerTeamId,
  }) async {
    if (_updatingTeam != null) return;
    setState(() => _updatingTeam = losingTeamKey);
    try {
      await ref
          .read(organizerMatchScheduleServiceProvider)
          .declareMatchWalkover(
            matchId: matchId,
            winnerTeamId: winnerTeamId,
          );
      if (mounted) showAppSnackBar(context, 'W.O. declarado.');
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _updatingTeam = null);
    }
  }

  Future<void> _releaseMatch(String matchId) async {
    if (_releasingMatch) return;
    setState(() => _releasingMatch = true);
    try {
      await ref
          .read(organizerMatchScheduleServiceProvider)
          .releaseMatchAfterCheckIn(matchId: matchId);
      if (mounted) {
        showAppSnackBar(context, 'Partida liberada.');
        context.pop();
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _releasingMatch = false);
    }
  }

  void _showWoSheet(
    TournamentMatch match, {
    required String teamALabel,
    required String teamBLabel,
  }) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Qual equipe não compareceu?',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _declareWo(
                    match.id,
                    losingTeamKey: 'teamA',
                    winnerTeamId: match.teamBId,
                  );
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side: BorderSide(
                    color: AppColors.live.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(teamALabel),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _declareWo(
                    match.id,
                    losingTeamKey: 'teamB',
                    winnerTeamId: match.teamAId,
                  );
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side: BorderSide(
                    color: AppColors.live.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(teamBLabel),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(
                  'Cancelar',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

class _CheckInHeader extends StatelessWidget {
  const _CheckInHeader({
    required this.match,
    required this.categoryLabel,
    required this.onBack,
  });

  final TournamentMatch match;
  final String categoryLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[];
    final category = categoryLabel.trim().toUpperCase();
    if (category.isNotEmpty) parts.add(category);
    final round = matchRoundLabel(match).toUpperCase();
    if (round.isNotEmpty) parts.add(round);
    if (match.scheduleTime != null) {
      final t = match.scheduleTime!.toLocal();
      final hh = t.hour.toString().padLeft(2, '0');
      final mm = t.minute.toString().padLeft(2, '0');
      parts.add('$hh:$mm');
    }
    final court = match.courtName?.trim() ?? '';
    if (court.isNotEmpty) parts.add(court);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CheckInIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (parts.isNotEmpty)
                    Text(
                      parts.join(' · '),
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                        letterSpacing: 0.8,
                      ),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    'Check-in da partida',
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
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

// ── Tolerance card ─────────────────────────────────────────────────────────────

class _ToleranceCard extends StatelessWidget {
  const _ToleranceCard({
    required this.toleranceMin,
    this.scheduleTime,
  });

  final int toleranceMin;
  final DateTime? scheduleTime;

  @override
  Widget build(BuildContext context) {
    final remaining = _remainingMinutes();
    final label = remaining != null
        ? 'Tolerância: $remaining min restantes'
        : 'Tolerância: $toleranceMin min';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.pending.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.schedule_rounded, size: 20, color: AppColors.pending),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppColors.pending,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Após $toleranceMin min sem comparecimento → W.O. automático',
                  style: AppTypography.mono(
                    fontSize: 10,
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

  int? _remainingMinutes() {
    if (scheduleTime == null) return null;
    final deadline = scheduleTime!.add(Duration(minutes: toleranceMin));
    final remaining = deadline.difference(DateTime.now()).inMinutes;
    return remaining > 0 ? remaining : null;
  }
}

// ── Section header ─────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        if (trailing != null) ...[
          const Spacer(),
          Text(
            trailing!,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.win,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ],
    );
  }
}

// ── Team check-in card ─────────────────────────────────────────────────────────

class _TeamCheckInCard extends StatelessWidget {
  const _TeamCheckInCard({
    required this.team,
    required this.checkInStatus,
    required this.onCheckIn,
    required this.onWo,
    this.seed,
    this.isUpdating = false,
  });

  final LiveTableTeamData team;
  final MatchCheckInStatus checkInStatus;
  final VoidCallback onCheckIn;
  final VoidCallback onWo;
  final int? seed;
  final bool isUpdating;

  @override
  Widget build(BuildContext context) {
    final isPresent = checkInStatus == MatchCheckInStatus.present;
    final isWo = checkInStatus == MatchCheckInStatus.wo;

    final borderColor = isPresent
        ? AppColors.win.withValues(alpha: 0.3)
        : isWo
            ? AppColors.live.withValues(alpha: 0.3)
            : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: [
          OrganizerTeamDualAvatars(
            player1: team.player1,
            player2: team.player2,
            avatarSize: 28,
            overlapRingColor: context.themeColors.surfaceCard,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
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
                const SizedBox(height: 3),
                Text(
                  _statusSubtitle(),
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (isUpdating)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else if (isPresent)
            _StatusPill(
              label: 'Presente',
              icon: Icons.check_rounded,
              color: AppColors.win,
            )
          else if (isWo)
            _StatusPill(
              label: 'W.O.',
              icon: Icons.close_rounded,
              color: AppColors.live,
            )
          else ...[
            FilledButton(
              onPressed: onCheckIn,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: Colors.black,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                textStyle: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
              child: const Text('Check-In'),
            ),
            const SizedBox(width: 8),
            _WoIconButton(onPressed: onWo),
          ],
        ],
      ),
    );
  }

  String _statusSubtitle() {
    if (checkInStatus == MatchCheckInStatus.present) return 'compareceu';
    if (checkInStatus == MatchCheckInStatus.wo) return 'não compareceu';
    return 'ainda não chegou';
  }
}

// ── Upcoming call row ──────────────────────────────────────────────────────────

class _UpcomingCallRow extends StatelessWidget {
  const _UpcomingCallRow({
    required this.match,
    required this.checkInA,
    required this.checkInB,
    this.enriched,
  });

  final TournamentMatch match;
  final TournamentMatchCardViewModel? enriched;
  final MatchCheckInStatus checkInA;
  final MatchCheckInStatus checkInB;

  @override
  Widget build(BuildContext context) {
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

    final anyWo = checkInA == MatchCheckInStatus.wo ||
        checkInB == MatchCheckInStatus.wo;
    final bothPresent = checkInA == MatchCheckInStatus.present &&
        checkInB == MatchCheckInStatus.present;
    final presentCount = [checkInA, checkInB]
        .where((s) => s == MatchCheckInStatus.present)
        .length;

    final metaParts = <String>[];
    final seedA = liveTableTeamSeed(match, sideA: true);
    if (seedA != null) metaParts.add('cabeça #$seedA');
    if (match.scheduleTime != null) {
      final t = match.scheduleTime!.toLocal();
      final hh = t.hour.toString().padLeft(2, '0');
      final mm = t.minute.toString().padLeft(2, '0');
      metaParts.add('$hh:$mm');
    }
    final court = match.courtName?.trim() ?? '';
    if (court.isNotEmpty) metaParts.add(court);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        children: [
          OrganizerTeamDualAvatars(
            player1: teamA.player1,
            player2: teamA.player2,
            avatarSize: 26,
            overlapRingColor: context.themeColors.surfaceCard,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${teamA.label} × ${teamB.label}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                if (metaParts.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    metaParts.join(' · '),
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (anyWo)
            _StatusPill(
              label: 'W.O.',
              icon: Icons.close_rounded,
              color: AppColors.live,
            )
          else if (bothPresent)
            _StatusPill(
              label: 'Pronto',
              icon: Icons.check_rounded,
              color: AppColors.win,
            )
          else if (presentCount > 0)
            _StatusPill(
              label: '$presentCount/2',
              icon: Icons.schedule_rounded,
              color: AppColors.pending,
            ),
        ],
      ),
    );
  }
}

// ── Bottom bar ────────────────────────────────────────────────────────────────

class _CheckInBottomBar extends StatelessWidget {
  const _CheckInBottomBar({
    required this.onDeclareWo,
    required this.onRelease,
    this.releasing = false,
  });

  final VoidCallback onDeclareWo;
  final VoidCallback onRelease;
  final bool releasing;

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
              onPressed: releasing ? null : onDeclareWo,
              icon: const Icon(Icons.flag_rounded, size: 18),
              label: const Text('Declarar W.O.'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.live,
                side: BorderSide(
                  color: AppColors.live.withValues(alpha: 0.4),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: releasing ? null : onRelease,
                icon: releasing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.black,
                        ),
                      )
                    : const Icon(
                        Icons.arrow_forward_rounded,
                        size: 18,
                        color: Colors.black,
                      ),
                label: Text(releasing ? 'Liberando…' : 'Liberar partida'),
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

// ── Shared small widgets ───────────────────────────────────────────────────────

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.icon,
    required this.color,
  });

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _WoIconButton extends StatelessWidget {
  const _WoIconButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: AppColors.live.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.live.withValues(alpha: 0.3)),
        ),
        child:
            const Icon(Icons.close_rounded, size: 16, color: AppColors.live),
      ),
    );
  }
}

class _CheckInIconButton extends StatelessWidget {
  const _CheckInIconButton({required this.icon, required this.onPressed});

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
