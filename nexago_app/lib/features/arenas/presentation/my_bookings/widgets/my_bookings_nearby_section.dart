import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_search_providers.dart';
import '../../arena_booking_navigation.dart';
import 'my_bookings_nearby_arena_card.dart';

class MyBookingsNearbySection extends ConsumerWidget {
  const MyBookingsNearbySection({
    super.key,
    required this.sportLabel,
  });

  final String sportLabel;

  static const _cardGradients = <List<Color>>[
    [Color(0xFFC9A227), Color(0xFF6B4E0A)],
    [Color(0xFF3B6FD4), Color(0xFF1A2F5C)],
    [Color(0xFF2BD17E), Color(0xFF0E5A38)],
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final nearbyAsync = ref.watch(myBookingsNearbyTodayProvider);

    return nearbyAsync.when(
      data: (snapshot) {
        if (snapshot.topArenas.isEmpty) {
          return const SizedBox.shrink();
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${snapshot.sectionTitlePrefix} · $sportLabel',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                Text(
                  '${snapshot.totalAvailableToday} HOJE',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurfaceMuted,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            for (var i = 0; i < snapshot.topArenas.length; i++) ...[
              if (i > 0) const SizedBox(height: 12),
              MyBookingsNearbyArenaCard(
                result: snapshot.topArenas[i],
                kmDistance: i < snapshot.rankedArenas.length
                    ? snapshot.rankedArenas[i].kmDistance
                    : null,
                gradientColors: _cardGradients[i % _cardGradients.length],
                onTap: () => openArenaBookingSlots(
                  context,
                  arena: snapshot.topArenas[i].arena,
                  slot: snapshot.topArenas[i].selectedSlot,
                  date: snapshot.slotFilters.dateOnly,
                ),
              ),
            ],
          ],
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(
          'Não foi possível carregar arenas próximas.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
