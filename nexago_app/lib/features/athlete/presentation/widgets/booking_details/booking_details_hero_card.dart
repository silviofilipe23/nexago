import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'booking_details_view_model.dart';

/// Hero da reserva — layout alinhado ao protótipo (badge, horário destacado, local, countdown).
class BookingDetailsHeroCard extends StatelessWidget {
  const BookingDetailsHeroCard({super.key, required this.model});

  final BookingDetailsHeroModel model;

  static const _cardRadius = 24.0;
  static const _timeFontSize = 36.0;

  @override
  Widget build(BuildContext context) {
    final badge = _badgeStyle(model.status);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(_cardRadius),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A0F06),
            Color(0xFF141210),
            Color(0xFF050505),
          ],
          stops: [0.0, 0.45, 1.0],
        ),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.18),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            top: -48,
            right: -28,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppColors.brand.withValues(alpha: 0.28),
                    AppColors.brand.withValues(alpha: 0.06),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.45, 1.0],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _StatusBadge(
                      label: model.statusBadgeLabel,
                      backgroundColor: badge.background,
                      borderColor: badge.border,
                      dotColor: badge.dot,
                      textColor: badge.text,
                    ),
                    const Spacer(),
                    Text(
                      model.displayCode,
                      style: AppTypography.mono(
                        fontSize: 11,
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(
                  model.dateEyebrow,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 10),
                _StylizedTimeRange(
                  timeRange: model.timeRange,
                  hourColor: Colors.white,
                  mutedColor: Colors.white.withValues(alpha: 0.42),
                ),
                const SizedBox(height: 12),
                _HeroLocationRow(locationLine: model.locationLine),
                const SizedBox(height: 16),
                _DashedDivider(
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                ),
                const SizedBox(height: 14),
                _HeroCountdownRow(
                  label: model.countdownLabel,
                  accentColor: model.countdownColor,
                  mutedColor: context.themeColors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.backgroundColor,
    required this.borderColor,
    required this.dotColor,
    required this.textColor,
  });

  final String label;
  final Color backgroundColor;
  final Color borderColor;
  final Color dotColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: dotColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: textColor,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }
}

class _StylizedTimeRange extends StatelessWidget {
  const _StylizedTimeRange({
    required this.timeRange,
    required this.hourColor,
    required this.mutedColor,
  });

  final String timeRange;
  final Color hourColor;
  final Color mutedColor;

  @override
  Widget build(BuildContext context) {
    final hourStyle = AppTypography.mono(
      fontSize: BookingDetailsHeroCard._timeFontSize,
      fontWeight: FontWeight.w900,
      color: hourColor,
      letterSpacing: -1,
      height: 1.05,
    );
    final mutedStyle = hourStyle.copyWith(color: mutedColor);

    final spans = <InlineSpan>[];
    final pattern = RegExp(r'(\d{2}):(\d{2})');
    var cursor = 0;
    for (final match in pattern.allMatches(timeRange)) {
      if (match.start > cursor) {
        spans.add(
          TextSpan(
            text: timeRange.substring(cursor, match.start),
            style: mutedStyle,
          ),
        );
      }
      spans.add(TextSpan(text: match.group(1), style: hourStyle));
      spans.add(TextSpan(text: ':${match.group(2)}', style: mutedStyle));
      cursor = match.end;
    }
    if (cursor < timeRange.length) {
      spans.add(
        TextSpan(
          text: timeRange.substring(cursor),
          style: mutedStyle,
        ),
      );
    }

    return Text.rich(
      TextSpan(children: spans),
      maxLines: 1,
    );
  }
}

class _HeroLocationRow extends StatelessWidget {
  const _HeroLocationRow({required this.locationLine});

  final String locationLine;

  @override
  Widget build(BuildContext context) {
    final parts = locationLine.split(' · ').map((p) => p.trim()).toList();
    final arena = parts.isNotEmpty ? parts.first : locationLine;
    final rest = parts.length > 1 ? parts.sublist(1).join(' · ') : '';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.location_on_outlined,
          size: 18,
          color: AppColors.brand,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text.rich(
            TextSpan(
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.88),
                height: 1.35,
              ),
              children: [
                TextSpan(
                  text: arena,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                if (rest.isNotEmpty)
                  TextSpan(
                    text: ' · $rest',
                    style: TextStyle(
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.55),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _HeroCountdownRow extends StatelessWidget {
  const _HeroCountdownRow({
    required this.label,
    required this.accentColor,
    required this.mutedColor,
  });

  final String label;
  final Color accentColor;
  final Color mutedColor;

  static const _prefix = 'Começa em ';

  @override
  Widget build(BuildContext context) {
    final hasSplit = label.startsWith(_prefix) && label.length > _prefix.length;
    final prefix = hasSplit ? _prefix : null;
    final highlight = hasSplit ? label.substring(_prefix.length) : label;

    return Row(
      children: [
        Icon(
          Icons.schedule_outlined,
          size: 16,
          color: AppColors.brand,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: hasSplit
              ? Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: prefix,
                        style: AppTypography.mono(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: mutedColor,
                        ),
                      ),
                      TextSpan(
                        text: highlight,
                        style: AppTypography.mono(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: accentColor,
                        ),
                      ),
                    ],
                  ),
                )
              : Text(
                  label,
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: accentColor,
                  ),
                ),
        ),
      ],
    );
  }
}

class _DashedDivider extends StatelessWidget {
  const _DashedDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const dashWidth = 5.0;
        const dashSpace = 4.0;
        final dashCount =
            (constraints.maxWidth / (dashWidth + dashSpace)).floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(dashCount, (_) {
            return SizedBox(
              width: dashWidth,
              height: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(color: color),
              ),
            );
          }),
        );
      },
    );
  }
}

class _BadgeStyle {
  const _BadgeStyle({
    required this.background,
    required this.border,
    required this.dot,
    required this.text,
  });

  final Color background;
  final Color border;
  final Color dot;
  final Color text;
}

_BadgeStyle _badgeStyle(BookingDetailsStatus status) {
  return switch (status) {
    BookingDetailsStatus.future => const _BadgeStyle(
        background: Color(0xFF1A3020),
        border: Color(0xFF2E7D32),
        dot: Color(0xFF4ADE80),
        text: Colors.white,
      ),
    BookingDetailsStatus.current => const _BadgeStyle(
        background: Color(0xFF3D2808),
        border: Color(0xFFEF6C00),
        dot: Color(0xFFFFB74D),
        text: Colors.white,
      ),
    BookingDetailsStatus.past => const _BadgeStyle(
        background: Color(0xFF1F1F23),
        border: Color(0xFF4B5563),
        dot: Color(0xFF9CA3AF),
        text: Color(0xFFE5E7EB),
      ),
    BookingDetailsStatus.canceled => const _BadgeStyle(
        background: Color(0xFF3B1010),
        border: Color(0xFFB91C1C),
        dot: Color(0xFFFCA5A5),
        text: Colors.white,
      ),
  };
}
