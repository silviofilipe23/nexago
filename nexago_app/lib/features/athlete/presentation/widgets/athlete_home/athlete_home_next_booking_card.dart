import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/my_booking_item.dart';
import '../../../domain/athlete_booking_helpers.dart';

class AthleteHomeNextBookingCard extends StatelessWidget {
  const AthleteHomeNextBookingCard({
    super.key,
    this.booking,
    required this.onReserveTap,
    this.onBookingTap,
  });

  final MyBookingItem? booking;
  final VoidCallback onReserveTap;
  final VoidCallback? onBookingTap;

  @override
  Widget build(BuildContext context) {
    if (booking == null) {
      return AthleteHomeReserveCtaCard(onTap: onReserveTap);
    }
    return _FeaturedBookingCard(
      booking: booking!,
      onTap: onBookingTap,
    );
  }
}

class AthleteHomeReserveCtaCard extends StatelessWidget {
  const AthleteHomeReserveCtaCard({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.35),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Nenhuma reserva confirmada',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Reserve uma quadra e apareça aqui com countdown e detalhes.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: onTap,
                icon: const Icon(Icons.add_rounded, size: 20),
                label: const Text('Reservar quadra'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeaturedBookingCard extends StatelessWidget {
  const _FeaturedBookingCard({
    required this.booking,
    this.onTap,
  });

  final MyBookingItem booking;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final start = parseBookingStart(booking);
    final countdown = start != null
        ? formatCountdownLabel(now, start)
        : 'EM BREVE';
    final courtSuffix = booking.courtName != null && booking.courtName!.isNotEmpty
        ? ' · ${booking.courtName}'
        : '';
    final arenaLine = '${booking.arenaName}$courtSuffix';
    final partner = bookingPartnerLabel(booking);
    final scheduleLine = _scheduleLine(booking, start);
    final subtitle = partner != null
        ? '$scheduleLine · com $partner'
        : scheduleLine;

    return Material(
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFFFF8A4A),
                Color(0xFFFF6A1A),
                Color(0xFFE5560E),
              ],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppColors.black,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          countdown,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: AppColors.black.withValues(alpha: 0.75),
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.black.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'CONFIRMADA',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.black,
                          fontSize: 9,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  arenaLine,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.black,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.black.withValues(alpha: 0.7),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () =>
                            showAppSnackBar(context, 'Em breve.'),
                        icon: const Icon(Icons.location_on_outlined, size: 18),
                        label: const Text('Como chegar'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.black,
                          foregroundColor: AppColors.brand,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _IconAction(
                      icon: Icons.ios_share_rounded,
                      onTap: () => showAppSnackBar(context, 'Em breve.'),
                    ),
                    const SizedBox(width: 8),
                    _IconAction(
                      icon: Icons.more_horiz_rounded,
                      onTap: () => showAppSnackBar(context, 'Em breve.'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _scheduleLine(MyBookingItem booking, DateTime? start) {
    if (start == null) {
      return 'Hoje · ${booking.startTime}';
    }
    final now = DateTime.now();
    final isToday = start.year == now.year &&
        start.month == now.month &&
        start.day == now.day;
    if (isToday) {
      return 'Hoje · ${DateFormat('HH:mm', 'pt_BR').format(start)}';
    }
    return DateFormat("d MMM · HH:mm", 'pt_BR').format(start);
  }
}

class _IconAction extends StatelessWidget {
  const _IconAction({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.black.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: AppColors.white, size: 20),
        ),
      ),
    );
  }
}
