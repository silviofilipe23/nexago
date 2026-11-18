import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_now.dart';
import '../../domain/arena_slot_detail_args.dart';
import 'arena_now_booking_label.dart';

/// Faixa horizontal com o estado de cada quadra neste instante.
class ArenaNowCourtsStrip extends StatelessWidget {
  const ArenaNowCourtsStrip({
    super.key,
    required this.courts,
    required this.inUse,
    required this.canReadAgenda,
    required this.canWriteAgenda,
  });

  final List<ArenaCourtNow> courts;
  final int inUse;
  final bool canReadAgenda;

  /// Só quem escreve a agenda vê "Encaixar" na quadra livre.
  final bool canWriteAgenda;

  static const double _tileWidth = 150;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Quadras',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ),
            Text(
              '$inUse de ${courts.length} em uso',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: courts.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) => SizedBox(
              width: _tileWidth,
              child: _CourtTile(
                court: courts[i],
                onTap: _tapFor(context, courts[i]),
                showFit: canWriteAgenda,
              ),
            ),
          ),
        ),
      ],
    );
  }

  VoidCallback? _tapFor(BuildContext context, ArenaCourtNow court) {
    if (!canReadAgenda) return null;
    final booking = court.booking;
    if (booking != null) return () => openArenaNowBooking(context, booking);
    final slot = court.slot;
    if (slot != null && canWriteAgenda) {
      return () => context.pushNamed(
        AppRouteNames.arenaSlotDetail,
        pathParameters: {'slotId': slot.id},
        extra: ArenaSlotDetailArgs(slot: slot, courtName: court.courtName),
      );
    }
    return () => context.go(AppRoutes.arenaSchedule);
  }
}

class _CourtTile extends StatelessWidget {
  const _CourtTile({
    required this.court,
    required this.onTap,
    required this.showFit,
  });

  final ArenaCourtNow court;
  final VoidCallback? onTap;
  final bool showFit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final free = court.state == ArenaCourtNowState.free;
    final (status, tone) = switch (court.state) {
      ArenaCourtNowState.inPlay => ('EM JOGO', colors.win),
      ArenaCourtNowState.classSession => ('AULA', colors.win),
      ArenaCourtNowState.blocked => ('BLOQUEADA', colors.onSurfaceMuted),
      ArenaCourtNowState.free => ('LIVRE', colors.brandText),
    };
    final small = theme.textTheme.labelSmall?.copyWith(
      color: colors.onSurfaceMuted,
      fontWeight: FontWeight.w600,
    );

    return Material(
      color: free ? Colors.transparent : colors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: free
                ? Border.all(color: AppColors.brand.withValues(alpha: 0.45))
                : null,
          ),
          child: Opacity(
            opacity: court.state == ArenaCourtNowState.blocked ? 0.6 : 1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        court.courtName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    Text(
                      status,
                      style: TextStyle(
                        color: tone,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                ..._body(context, small),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _body(BuildContext context, TextStyle? small) {
    final colors = context.themeColors;
    final strong = Theme.of(context).textTheme.bodySmall?.copyWith(
      fontWeight: FontWeight.w700,
      color: colors.onSurface,
    );
    final booking = court.booking;
    if (booking != null) {
      return [
        ArenaNowBookingWho(booking: booking, style: strong),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: LinearProgressIndicator(
            value: court.progress,
            minHeight: 4,
            color: colors.win,
            backgroundColor: colors.onSurfaceMuted.withValues(alpha: 0.18),
          ),
        ),
        const SizedBox(height: 4),
        Text('até ${court.until}', style: small),
      ];
    }
    if (court.state == ArenaCourtNowState.blocked) {
      return [
        Text(
          court.until == null ? 'Manutenção' : 'até ${court.until}',
          style: strong,
        ),
      ];
    }
    return [
      Text(
        court.until == null ? 'Livre o resto do dia' : 'até ${court.until}',
        style: strong,
      ),
      if (showFit) ...[
        const SizedBox(height: 4),
        Text(
          '+ Encaixar reserva',
          style: small?.copyWith(
            color: colors.brandText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ];
  }
}
