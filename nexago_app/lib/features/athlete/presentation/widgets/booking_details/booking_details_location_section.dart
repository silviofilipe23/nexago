import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/location/geo_distance.dart';
import '../../../../../core/location/user_location_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../arenas/domain/arena_list_item.dart';
import 'booking_details_section_card.dart';
import 'booking_details_view_model.dart';

class BookingDetailsLocationSection extends ConsumerWidget {
  const BookingDetailsLocationSection({
    super.key,
    required this.arena,
    required this.address,
    required this.onOpenMaps,
  });

  final ArenaListItem? arena;
  final String address;
  final VoidCallback? onOpenMaps;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final locationAsync = ref.watch(userLocationProvider);
    final distanceLabel = locationAsync.maybeWhen(
      data: (user) => _distanceLabel(arena, user.latitude, user.longitude),
      orElse: () => null,
    );

    return BookingDetailsSectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Localização',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: onOpenMaps,
                  style: TextButton.styleFrom(
                    foregroundColor: onOpenMaps != null
                        ? AppColors.brand
                        : AppColors.brand.withValues(alpha: 0.4),
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Ver no mapa'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _MapPlaceholder(distanceLabel: distanceLabel),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Text(
              address,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurface,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String? _distanceLabel(ArenaListItem? arena, double? userLat, double? userLng) {
    final lat = arena?.latitude;
    final lng = arena?.longitude;
    if (lat == null || lng == null || userLat == null || userLng == null) {
      return null;
    }
    final km = haversineDistanceKm(
      lat1: userLat,
      lon1: userLng,
      lat2: lat,
      lon2: lng,
    );
    return formatDistanceKmLabel(km);
  }
}

class _MapPlaceholder extends StatelessWidget {
  const _MapPlaceholder({this.distanceLabel});

  final String? distanceLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 140,
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  context.themeColors.surfaceRaised,
                  context.themeColors.surfaceCard,
                  const Color(0xFF1A1510),
                ],
              ),
            ),
          ),
          CustomPaint(painter: _MapGridPainter()),
          Center(
            child: Icon(
              Icons.location_on_rounded,
              size: 36,
              color: AppColors.brand.withValues(alpha: 0.85),
            ),
          ),
          if (distanceLabel != null)
            Positioned(
              top: 12,
              left: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  distanceLabel!,
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MapGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.04)
      ..strokeWidth = 1;
    const step = 28.0;
    for (var x = 0.0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
