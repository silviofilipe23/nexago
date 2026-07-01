import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/data/nexago_artifacts_paths.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import 'widgets/organizer_schedule_time_widgets.dart';
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
  bool _assigningCourt = false;
  String? _updatingTeam;
  String? _selectedCourtId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      bootstrapOrganizerTournamentCourts(ref, widget.tournamentId);
    });
  }

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

          final courts = matchOpsState.courts;
          final opsConfig =
              config ?? matchOpsState.config;
          final effectiveCourtId = _effectiveCourtId(match);
          final hasCourt = _hasCourt(match);
          final checkInComplete =
              MatchOpsLogic.canReleaseAfterCheckIn(checkInA, checkInB);
          final canRelease = MatchOpsLogic.canReleaseAfterCheckInWithCourt(
            checkInA,
            checkInB,
            hasCourt: hasCourt,
          );
          final courtLabel = _courtDisplayLabel(
            courtId: effectiveCourtId,
            courts: courts,
            match: match,
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SafeArea(
                bottom: false,
                child: _CheckInHeader(
                  match: match,
                  categoryMeta: MatchOpsLogic.matchCardCategoryMeta(
                    match: match,
                    categoryId: match.categoryId,
                    categories: categories,
                  ),
                  courtLabel: courtLabel,
                  onBack: () => context.pop(),
              ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _ToleranceCard(
                      toleranceMin: opsConfig.checkInToleranceMin,
                      scheduleTime: match.scheduleTime,
                    ),
                    const SizedBox(height: 20),
                    _CourtAssignmentSection(
                      courts: courts,
                      selectedCourtId: effectiveCourtId,
                      assigning: _assigningCourt,
                      onCourtSelected: (courtId) => _assignCourt(
                        match: match,
                        courtId: courtId,
                        config: opsConfig,
                      ),
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
                      onUndo: () => _undoCheckIn(match.id, team: 'teamA'),
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
                      onUndo: () => _undoCheckIn(match.id, team: 'teamB'),
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
                checkInComplete: checkInComplete,
                hasCourt: hasCourt,
                canRelease: canRelease,
                onRelease: () => _releaseMatch(match),
              ),
            ],
          );
        },
      ),
    );
  }

  String _effectiveCourtId(TournamentMatch match) {
    final fromMatch = match.courtId.trim();
    if (fromMatch.isNotEmpty) return fromMatch;
    return _selectedCourtId?.trim() ?? '';
  }

  bool _hasCourt(TournamentMatch match) {
    if (MatchOpsLogic.matchHasCourt(match)) return true;
    return _effectiveCourtId(match).isNotEmpty;
  }

  String _courtDisplayLabel({
    required String courtId,
    required List<TournamentCourt> courts,
    required TournamentMatch match,
  }) {
    final id = courtId.trim();
    if (id.isEmpty) {
      return match.courtName?.trim() ?? '';
    }
    for (final court in courts) {
      if (court.id == id) {
        return court.name.trim().isNotEmpty ? court.name.trim() : court.id;
      }
    }
    return id;
  }

  Future<void> _assignCourt({
    required TournamentMatch match,
    required String courtId,
    required TournamentMatchOpsConfig config,
  }) async {
    if (_assigningCourt) return;
    final trimmed = courtId.trim();
    if (trimmed.isEmpty) return;

    setState(() {
      _assigningCourt = true;
      _selectedCourtId = trimmed;
    });
    try {
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final durationMin = config.defaultMatchDurationMin;
      final dayKey = config.activeDayKey.isNotEmpty
          ? config.activeDayKey
          : ScheduleLogic.dayKeyFromDate(nexagoEventNow());
      final start = match.scheduleTime ?? nexagoEventNow();
      final end = match.scheduleEndTime ??
          start.add(Duration(minutes: durationMin));

      if (match.scheduleTime != null) {
        await service.rescheduleMatch(
          matchId: match.id,
          courtId: trimmed,
          scheduleTime: start,
          scheduleEndTime: end,
          dayKey: match.dayKey.isNotEmpty ? match.dayKey : dayKey,
        );
      } else {
        await service.scheduleMatch(
          matchId: match.id,
          courtId: trimmed,
          scheduleTime: start,
          scheduleEndTime: end,
          dayKey: dayKey,
        );
      }
      if (mounted) showAppSnackBar(context, 'Quadra definida.');
    } catch (e) {
      if (mounted) {
        setState(() {
          _selectedCourtId =
              match.courtId.isNotEmpty ? match.courtId : null;
        });
        showAppSnackBar(context, _friendlyScheduleError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _assigningCourt = false);
    }
  }

  String _friendlyScheduleError(Object error) {
    if (error is FirebaseFunctionsException) {
      if (error.code == 'failed-precondition' &&
          (error.message?.trim().isNotEmpty ?? false)) {
        return error.message!.trim();
      }
    }
    return 'Erro: $error';
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

  Future<void> _undoCheckIn(String matchId, {required String team}) async {
    if (_updatingTeam != null) return;
    setState(() => _updatingTeam = team);
    try {
      await FirebaseFirestore.instance
          .collection(NexagoArtifactsPaths.matchesCollection())
          .doc(matchId)
          .update({
        'checkIn.$team': {
          'status': 'pending',
          'at': FieldValue.serverTimestamp(),
        },
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (mounted) showAppSnackBar(context, 'Check-in desfeito.');
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

  Future<void> _releaseMatch(TournamentMatch match) async {
    if (_releasingMatch) return;
    final courtId = _effectiveCourtId(match);
    if (courtId.isEmpty) return;

    setState(() => _releasingMatch = true);
    try {
      await ref.read(organizerMatchScheduleServiceProvider).callMatchToCourt(
            matchId: match.id,
            courtId: courtId,
          );
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

}

// ── Header ────────────────────────────────────────────────────────────────────

class _CheckInHeader extends StatelessWidget {
  const _CheckInHeader({
    required this.match,
    required this.categoryMeta,
    required this.courtLabel,
    required this.onBack,
  });

  final TournamentMatch match;
  final String categoryMeta;
  final String courtLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[];
    final meta = categoryMeta.trim();
    if (meta.isNotEmpty) parts.add(meta);
    if (match.scheduleTime != null) {
      final t = toNexagoEventLocal(match.scheduleTime!);
      final hh = t.hour.toString().padLeft(2, '0');
      final mm = t.minute.toString().padLeft(2, '0');
      parts.add('$hh:$mm');
    }
    final court = courtLabel.trim().isNotEmpty
        ? courtLabel.trim()
        : (match.courtName?.trim() ?? '');
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

// ── Court assignment ───────────────────────────────────────────────────────────

class _CourtAssignmentSection extends StatelessWidget {
  const _CourtAssignmentSection({
    required this.courts,
    required this.selectedCourtId,
    required this.onCourtSelected,
    this.assigning = false,
  });

  final List<TournamentCourt> courts;
  final String selectedCourtId;
  final ValueChanged<String> onCourtSelected;
  final bool assigning;

  @override
  Widget build(BuildContext context) {
    if (courts.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Text(
          'Configure quadras no torneio para liberar a partida.',
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      );
    }

    return Stack(
      children: [
        ScheduleTimeCourtPicker(
          courts: courts,
          selectedCourtId: selectedCourtId,
          onCourtSelected: assigning ? (_) {} : onCourtSelected,
        ),
        if (assigning)
          const Positioned(
            right: 16,
            top: 20,
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
      ],
    );
  }
}

// ── Tolerance card ─────────────────────────────────────────────────────────────

class _ToleranceCard extends StatefulWidget {
  const _ToleranceCard({
    required this.toleranceMin,
    this.scheduleTime,
  });

  final int toleranceMin;
  final DateTime? scheduleTime;

  @override
  State<_ToleranceCard> createState() => _ToleranceCardState();
}

class _ToleranceCardState extends State<_ToleranceCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    if (widget.scheduleTime != null) {
      // Atualiza a contagem ao vivo (granularidade de minutos → 20s basta).
      _ticker = Timer.periodic(const Duration(seconds: 20), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final schedule = widget.scheduleTime;
    final remaining = schedule != null
        ? schedule
            .add(Duration(minutes: widget.toleranceMin))
            .difference(nexagoEventNow())
        : null;
    final expired = remaining != null && remaining.inSeconds <= 0;

    final String label;
    if (schedule == null) {
      label = 'Tolerância: ${widget.toleranceMin} min';
    } else if (expired) {
      label = 'Prazo de tolerância esgotado';
    } else if (remaining!.inMinutes >= 1) {
      label = 'Tolerância: ${remaining.inMinutes} min restantes';
    } else {
      label = 'Tolerância: menos de 1 min';
    }

    final accent = expired ? AppColors.live : AppColors.pending;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.28)),
      ),
      child: Row(
        children: [
          Icon(
            expired ? Icons.flag_rounded : Icons.schedule_rounded,
            size: 20,
            color: accent,
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
                    fontWeight: FontWeight.w800,
                    color: accent,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  expired
                      ? 'Sem comparecimento? Você já pode declarar W.O.'
                      : 'Após ${widget.toleranceMin} min sem comparecimento → W.O.',
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
    this.onUndo,
    this.seed,
    this.isUpdating = false,
  });

  final LiveTableTeamData team;
  final MatchCheckInStatus checkInStatus;
  final VoidCallback onCheckIn;
  final VoidCallback onWo;

  /// Reverte um check-in "Presente" feito por engano.
  final VoidCallback? onUndo;
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
            InkWell(
              onTap: onUndo,
              borderRadius: BorderRadius.circular(999),
              child: _StatusPill(
                label: onUndo != null ? 'Presente · desfazer' : 'Presente',
                icon: Icons.check_rounded,
                color: AppColors.win,
              ),
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
      final t = toNexagoEventLocal(match.scheduleTime!);
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
    required this.onRelease,
    this.releasing = false,
    this.checkInComplete = false,
    this.hasCourt = false,
    this.canRelease = false,
  });

  final VoidCallback onRelease;
  final bool releasing;
  final bool checkInComplete;
  final bool hasCourt;

  /// Check-in completo e quadra definida.
  final bool canRelease;

  String get _label {
    if (releasing) return 'Liberando…';
    if (canRelease) return 'Liberar partida';
    if (checkInComplete && !hasCourt) return 'Defina a quadra';
    return 'Aguardando check-in';
  }

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
            Expanded(
              child: FilledButton.icon(
                onPressed: (releasing || !canRelease) ? null : onRelease,
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
                label: Text(_label),
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
