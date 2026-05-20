import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';
class ArenaBookingDetailHeader extends StatelessWidget {
  const ArenaBookingDetailHeader({
    super.key,
    required this.booking,
    required this.bookingId,
    required this.courtName,
    required this.statusLabel,
    required this.athleteName,
  });

  final ArenaManagerBooking booking;
  final String bookingId;
  final String courtName;
  final String statusLabel;
  final String athleteName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = DateTime.tryParse(
      booking.dateKey.length >= 10 ? booking.dateKey.substring(0, 10) : '',
    );
    final weekday = d != null
        ? DateFormat('EEEE', 'pt_BR').format(d).toUpperCase()
        : '';
    final relative = d != null ? _relativeLabel(d, booking) : null;
    final participants =
        (booking.data['confirmedParticipants'] as num?)?.toInt() ?? 1;
    final statusBadge = statusLabel.toUpperCase();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Reserva · ${ArenaBookingsGrouping.displayCode(bookingId)}',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: AppColors.surfaceCard,
                    border: Border.all(
                      color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: -48,
                right: -36,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppColors.win.withValues(alpha: 0.2),
                        AppColors.win.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            '$weekday · ${courtName.toUpperCase()}',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: AppColors.onSurfaceMuted,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                              height: 1.3,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        _StatusPill(label: statusBadge),
                      ],
                    ),
                    const SizedBox(height: 20),
                    _LargeTimeRange(
                      start: booking.startTime,
                      end: booking.endTime,
                    ),
                    if (relative != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        relative,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                          height: 1.3,
                        ),
                      ),
                    ],
                    if (participants >= 2) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Dupla · $participants atletas',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String? _relativeLabel(DateTime date, ArenaManagerBooking booking) {
    final startParts = booking.startTime.split(':');
    final h = int.tryParse(startParts.first) ?? 0;
    final m = startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
    final start = DateTime(date.year, date.month, date.day, h, m);
    final diff = start.difference(DateTime.now());
    final long = DateFormat("d 'de' MMMM", 'pt_BR').format(date);
    if (diff.isNegative) return '$long · em andamento';
    if (diff.inHours < 48) {
      final hrs = diff.inHours;
      final min = diff.inMinutes % 60;
      if (hrs > 0 && min > 0) return '$long · em ${hrs}h ${min}min';
      if (hrs > 0) return '$long · em ${hrs}h';
      if (min > 0) return '$long · em ${min}min';
      return '$long · agora';
    }
    return long;
  }
}

class _LargeTimeRange extends StatelessWidget {
  const _LargeTimeRange({required this.start, required this.end});

  final String start;
  final String end;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sp = start.split(':');
    final ep = end.split(':');
    final startH = sp.first.padLeft(2, '0');
    final startM = sp.length > 1 ? sp[1].padLeft(2, '0') : '00';
    final endH = ep.first.padLeft(2, '0');
    final endM = ep.length > 1 ? ep[1].padLeft(2, '0') : '00';

    TextStyle hourStyle() => theme.textTheme.displaySmall!.copyWith(
          fontWeight: FontWeight.w800,
          height: 1,
          color: AppColors.onSurface,
          letterSpacing: -0.5,
        );

    TextStyle minuteStyle() => theme.textTheme.headlineMedium!.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurfaceMuted,
          height: 1,
        );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(startH, style: hourStyle()),
        Text(':$startM', style: minuteStyle()),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
          child: Text(
            '-',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ),
        Text(endH, style: hourStyle()),
        Text(':$endM', style: minuteStyle()),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.win,
              fontWeight: FontWeight.w800,
              fontSize: 11,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
