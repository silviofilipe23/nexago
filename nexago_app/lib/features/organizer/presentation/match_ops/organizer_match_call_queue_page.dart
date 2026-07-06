import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_models.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_card.dart';

/// G2 — Fila de chamada.
class OrganizerMatchCallQueuePage extends ConsumerStatefulWidget {
  const OrganizerMatchCallQueuePage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<OrganizerMatchCallQueuePage> createState() =>
      _OrganizerMatchCallQueuePageState();
}

class _OrganizerMatchCallQueuePageState
    extends ConsumerState<OrganizerMatchCallQueuePage> {
  String? _callingMatchId;

  Future<void> _callMatch({
    required OrganizerMatchRow row,
    required List<TournamentCourt> courts,
  }) async {
    if (_callingMatchId != null) return;
    setState(() => _callingMatchId = row.match.id);
    try {
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final courtId = row.match.courtId.isNotEmpty
          ? row.match.courtId
          : courts.firstOrNull?.id ?? 'Q1';
      await service.callMatchToCourt(matchId: row.match.id, courtId: courtId);
      if (mounted) {
        showAppSnackBar(context, 'Partida chamada para a quadra.');
      }
    } catch (e) {
      if (mounted) {
        showAppErrorSnackBar(context, e);
      }
    } finally {
      if (mounted) setState(() => _callingMatchId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(
      organizerMatchOpsStateProvider(widget.tournamentId),
    );
    final detail = ref.watch(
      organizerTournamentDetailProvider(widget.tournamentId),
    );

    final tournamentName = detail.valueOrNull?.summary?.name ?? 'Torneio';
    final dayKey = state.config.activeDayKey.trim();
    final dayLabel = dayKey.isNotEmpty ? dayKey.toUpperCase() : 'DIA 1';
    final eyebrow = '$tournamentName · $dayLabel';

    final onDeck = state.callQueue
        .where((r) => r.queueStatus == MatchQueueStatus.onDeck)
        .toList();
    final waiting = state.callQueue
        .where((r) => r.queueStatus != MatchQueueStatus.onDeck)
        .toList();
    final pendingCheckIn = state.callQueue
        .where((r) => r.hasCheckInPending)
        .length;

    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CallQueueHeader(
            eyebrow: eyebrow,
            pendingCheckIn: pendingCheckIn,
            onBack: () => context.pop(),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.only(bottom: bottomInset + 16),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: OrganizerCourtKpiRow(kpis: state.courtKpis),
                ),
                if (state.callQueue.isEmpty)
                  const _CallQueueEmptyState()
                else ...[
                  if (onDeck.isNotEmpty) ...[
                    _CallQueueSectionHeader(
                      title: 'PRÓXIMA A CHAMAR',
                      trailing: '${onDeck.length}',
                    ),
                    for (final row in onDeck)
                      _buildMatchCard(row: row, courts: state.courts),
                  ],
                  if (waiting.isNotEmpty) ...[
                    _CallQueueSectionHeader(
                      title: 'NA FILA',
                      trailing: '${waiting.length}',
                    ),
                    for (final row in waiting)
                      _buildMatchCard(row: row, courts: state.courts),
                  ],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMatchCard({
    required OrganizerMatchRow row,
    required List<TournamentCourt> courts,
  }) {
    return OrganizerMatchCard(
      row: row,
      onTap: () => context.push(
        organizerMatchCheckInPath(widget.tournamentId, row.match.id),
      ),
      trailing: _CallQueueMatchActions(
        row: row,
        calling: _callingMatchId == row.match.id,
        onCheckIn: () => context.push(
          organizerMatchCheckInPath(widget.tournamentId, row.match.id),
        ),
        onCall: () => _callMatch(row: row, courts: courts),
      ),
    );
  }
}

class _CallQueueHeader extends StatelessWidget {
  const _CallQueueHeader({
    required this.eyebrow,
    required this.pendingCheckIn,
    required this.onBack,
  });

  final String eyebrow;
  final int pendingCheckIn;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.viewPaddingOf(context).top;

    return ColoredBox(
      color: context.themeColors.canvas,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, topInset + 4, 16, 8),
        child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _HeaderIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.5,
                  ),
                ),
                Text(
                  'Fila de chamada',
                  style: AppTypography.soraRegular(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          if (pendingCheckIn > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.pending.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppColors.pending.withValues(alpha: 0.28),
                ),
              ),
              child: Text(
                '$pendingCheckIn check-in',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.pending,
                ),
              ),
            ),
          ],
        ],
        ),
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _CallQueueSectionHeader extends StatelessWidget {
  const _CallQueueSectionHeader({required this.title, required this.trailing});

  final String title;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.8,
              ),
            ),
          ),
          Text(
            trailing,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _CallQueueMatchActions extends StatelessWidget {
  const _CallQueueMatchActions({
    required this.row,
    required this.calling,
    required this.onCheckIn,
    required this.onCall,
  });

  final OrganizerMatchRow row;
  final bool calling;
  final VoidCallback onCheckIn;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) {
    final needsCheckIn = row.hasCheckInPending;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (needsCheckIn)
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.pending.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.pending.withValues(alpha: 0.28),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.schedule_rounded,
                    size: 12,
                    color: AppColors.pending,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Check-in pendente',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: AppColors.pending,
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (needsCheckIn) const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: needsCheckIn
              ? OutlinedButton(
                  onPressed: onCheckIn,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: context.themeColors.onSurface,
                    backgroundColor: context.themeColors.surfaceRaised,
                    side: BorderSide(
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.18,
                      ),
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    textStyle: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  child: const Text('Fazer check-in'),
                )
              : FilledButton(
                  onPressed: calling ? null : onCall,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    minimumSize: const Size.fromHeight(44),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    textStyle: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  child: calling
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.black,
                          ),
                        )
                      : const Text('Chamar para quadra'),
                ),
        ),
      ],
    );
  }
}

class _CallQueueEmptyState extends StatelessWidget {
  const _CallQueueEmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 32, 32, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.format_list_bulleted_rounded,
            size: 44,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.45),
          ),
          const SizedBox(height: 14),
          Text(
            'Nenhuma partida na fila',
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Partidas agendadas aparecem aqui quando estiverem prontas para entrar em quadra.',
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: context.themeColors.onSurfaceMuted,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}
