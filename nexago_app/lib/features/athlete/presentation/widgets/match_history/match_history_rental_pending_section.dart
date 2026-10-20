import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/booking_result_record.dart';
import '../../../../arenas/domain/booking_story.dart';

/// Topo da aba Partidas: placares de aluguel que ainda não contam — para
/// confirmar (adversário), aguardando ou contestados (quem lançou).
class MatchHistoryRentalPendingSection extends StatelessWidget {
  const MatchHistoryRentalPendingSection({
    super.key,
    required this.results,
    required this.uid,
    required this.onOpen,
  });

  final List<SavedBookingResult> results;
  final String uid;
  final ValueChanged<SavedBookingResult> onOpen;

  @override
  Widget build(BuildContext context) {
    if (results.isEmpty) return const SizedBox.shrink();
    final toConfirm = results.where((r) => r.awaitsResponseFrom(uid)).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Header(
          summary:
              toConfirm == 0 ? 'AINDA NÃO CONTAM' : '$toConfirm PARA CONFIRMAR',
        ),
        for (final r in results)
          _PendingTile(
            key: Key('history-rental-pending-${r.bookingId}'),
            saved: r,
            uid: uid,
            onTap: () => onOpen(r),
          ),
        const SizedBox(height: 8),
      ],
    );
  }
}

/// Mesmo desenho do cabeçalho do mês, com o título cedendo espaço ao resumo.
class _Header extends StatelessWidget {
  const _Header({required this.summary});

  final String summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 10),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 18,
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Placares de aluguel',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            summary,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _PendingTile extends StatelessWidget {
  const _PendingTile({
    super.key,
    required this.saved,
    required this.uid,
    required this.onTap,
  });

  final SavedBookingResult saved;
  final String uid;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final actionable = saved.awaitsResponseFrom(uid);
    final (icon, tint) = switch (saved.status) {
      BookingResultStatus.disputed => (
          Icons.report_gmailerrorred_rounded,
          AppColors.live
        ),
      _ when actionable => (Icons.how_to_reg_rounded, AppColors.brand),
      _ => (Icons.schedule_rounded, AppColors.pending),
    };
    final story = bookingStoryDataFrom(
      arenaName: saved.arenaName,
      courtName: '',
      dateKey: saved.dateKey,
      startTime: saved.startTime,
      endTime: saved.endTime,
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: actionable
                    ? AppColors.brand.withValues(alpha: 0.45)
                    : colors.surfaceRaised,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: tint.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 18, color: tint),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        bookingResultAttentionTitle(saved, uid),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${bookingResultScoreLine(saved.result)} · '
                        '${saved.arenaName} · ${story.dateLabel}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  Icons.chevron_right_rounded,
                  color: colors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
