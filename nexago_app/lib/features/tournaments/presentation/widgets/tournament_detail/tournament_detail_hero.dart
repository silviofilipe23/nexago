import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';

/// Hero card on tournament detail: green-tinted surface, diagonal pattern,
/// metadata, divider, and three stat columns with vertical separators.
class TournamentDetailHero extends StatelessWidget {
  const TournamentDetailHero({
    super.key,
    required this.tournament,
    required this.stats,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;

  static const _horizontalMargin = 20.0;
  static const _radius = 24.0;
  static const _padding = 20.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final eyebrow = tournamentStageEyebrow(tournament);
    final dateLabel = tournamentDetailLongDate(tournament);
    final city = tournament.city.trim();
    final locationText = city.isEmpty
        ? tournament.location
        : '${tournament.location} • $city';

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        _horizontalMargin,
        4,
        _horizontalMargin,
        12,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_radius),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(_radius),
            border: Border.all(color: AppColors.win.withValues(alpha: 0.22)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _HeroTopSection(
                theme: theme,
                tournament: tournament,
                eyebrow: eyebrow,
                locationText: locationText,
                dateLabel: dateLabel,
              ),
              Divider(
                height: 1,
                thickness: 1,
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.2,
                ),
              ),
              _HeroStatsRow(theme: theme, stats: stats),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroTopSection extends StatelessWidget {
  const _HeroTopSection({
    required this.theme,
    required this.tournament,
    required this.eyebrow,
    required this.locationText,
    required this.dateLabel,
  });

  final ThemeData theme;
  final TournamentDetail tournament;
  final String eyebrow;
  final String locationText;
  final String dateLabel;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: _HeroCardBackground(coverUrl: tournament.imageUrl),
        ),
        Padding(
          padding: const EdgeInsets.all(TournamentDetailHero._padding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                ),
              ),
              SizedBox(height: 10),
              Text(
                tournament.name,
                style: theme.textTheme.headlineSmall?.copyWith(
                  color: context.themeColors.onSurface,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                  letterSpacing: -0.4,
                ),
              ),
              SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: _MetaItem(
                      icon: Icons.location_on_outlined,
                      label: locationText,
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: _MetaItem(
                      icon: Icons.calendar_today_outlined,
                      label: dateLabel,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MetaItem extends StatelessWidget {
  const _MetaItem({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textStyle = theme.textTheme.bodySmall?.copyWith(
      color: context.themeColors.onSurface.withValues(alpha: 0.88),
      fontWeight: FontWeight.w500,
      height: 1.35,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: context.themeColors.onSurfaceMuted),
        SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            style: textStyle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _HeroCardBackground extends StatelessWidget {
  const _HeroCardBackground({this.coverUrl});

  final String? coverUrl;

  @override
  Widget build(BuildContext context) {
    final hasCover = coverUrl != null && coverUrl!.trim().isNotEmpty;

    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.win.withValues(alpha: 0.28),
                const Color(0xFF0A120E),
                context.themeColors.surfaceCard,
              ],
              stops: const [0.0, 0.45, 1.0],
            ),
          ),
        ),
        const CustomPaint(painter: _HeroDiagonalLinesPainter()),
        if (hasCover)
          Positioned.fill(
            child: Image.network(
              coverUrl!,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
          ),
        if (hasCover)
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    AppColors.black.withValues(alpha: 0.35),
                    AppColors.black.withValues(alpha: 0.82),
                    const Color(0xFF0A120E).withValues(alpha: 0.95),
                  ],
                  stops: const [0.0, 0.55, 1.0],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _HeroDiagonalLinesPainter extends CustomPainter {
  const _HeroDiagonalLinesPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.win.withValues(alpha: 0.07)
      ..strokeWidth = 1;

    const spacing = 14.0;
    final extent = size.width + size.height;

    for (var offset = -extent; offset < extent; offset += spacing) {
      canvas.drawLine(
        Offset(offset, size.height),
        Offset(offset + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _HeroStatsRow extends StatelessWidget {
  const _HeroStatsRow({required this.theme, required this.stats});

  final ThemeData theme;
  final TournamentDetailStats stats;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF0A120E).withValues(alpha: 0.65),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          vertical: TournamentDetailHero._padding,
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _StatColumn(
                  theme: theme,
                  label: 'CATEGORIAS',
                  value: '${stats.categoryCount}',
                  subtext: _categoriesSubtext(stats),
                ),
              ),
              _StatVerticalDivider(),
              Expanded(
                child: _StatColumn(
                  theme: theme,
                  label: 'VAGAS',
                  value: '${stats.spotsTotal}',
                  subtext: _spotsSubtext(stats),
                ),
              ),
              _StatVerticalDivider(),
              Expanded(
                child: _StatColumn(
                  theme: theme,
                  label: 'PRÊMIO',
                  value: stats.prizeTotalLabel,
                  subtext: 'total em disputa',
                  compactValue: true,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatVerticalDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: VerticalDivider(
        width: 1,
        thickness: 1,
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.22),
      ),
    );
  }
}

String _categoriesSubtext(TournamentDetailStats stats) {
  if (stats.categoryCount == 0) return '—';
  return '${stats.openCategories} abertas';
}

String _spotsSubtext(TournamentDetailStats stats) {
  if (stats.spotsTotal == 0) return '— inscritas';
  return '${stats.spotsEnrolled} inscritas';
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({
    required this.theme,
    required this.label,
    required this.value,
    required this.subtext,
    this.compactValue = false,
  });

  final ThemeData theme;
  final String label;
  final String value;
  final String subtext;
  final bool compactValue;

  @override
  Widget build(BuildContext context) {
    final valueStyle = theme.textTheme.titleLarge?.copyWith(
      color: context.themeColors.onSurface,
      fontWeight: FontWeight.w800,
      letterSpacing: compactValue ? -0.3 : -0.5,
      height: 1.1,
      fontSize: compactValue ? 17 : 26,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              fontSize: 10,
            ),
          ),
          SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: valueStyle),
          ),
          SizedBox(height: 4),
          Text(
            subtext,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              fontSize: 10,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
