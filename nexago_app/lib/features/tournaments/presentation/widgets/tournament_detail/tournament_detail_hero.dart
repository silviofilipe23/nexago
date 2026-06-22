import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_labels.dart';

/// Hero de conversão: capa imersiva, badges, título, meta, prêmio/inscrição e vagas.
class TournamentDetailHero extends StatelessWidget {
  const TournamentDetailHero({
    super.key,
    required this.tournament,
    required this.stats,
    required this.topInset,
    required this.toolbar,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final double topInset;
  final Widget toolbar;

  static const _horizontalMargin = 20.0;
  static const _coverContentHeight = 210.0;

  @override
  Widget build(BuildContext context) {
    final statusLabel = tournamentStatusLabelFromRaw(
      status: tournament.status,
      listingStatusRaw: tournament.listingStatusRaw,
    );
    final stageLabel = tournamentStageEyebrow(tournament);
    final dateLabel = tournamentDetailCompactDate(tournament);
    final city = tournament.city.trim();
    final locationText = city.isEmpty
        ? tournament.location
        : '${tournament.location} · $city';
    final urgencyBanner = tournamentRecentlyOpenedBanner(tournament, stats);
    final coverUrl = tournament.imageUrl?.trim();
    final hasCover = coverUrl != null && coverUrl.isNotEmpty;
    final onCover = Colors.white;
    final onCoverMuted = Colors.white.withValues(alpha: 0.72);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: topInset + _coverContentHeight,
          child: Stack(
            clipBehavior: Clip.none,
            fit: StackFit.expand,
            children: [
              Positioned(
                left: 0,
                right: 0,
                top: -topInset,
                bottom: 0,
                child: _HeroCoverBackground(
                  imageUrl: hasCover ? coverUrl : null,
                  featured: tournament.featured,
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(height: topInset),
                  toolbar,
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(
                        _horizontalMargin,
                        8,
                        _horizontalMargin,
                        16,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _StatusBadge(label: statusLabel),
                              if (stageLabel.isNotEmpty)
                                _StageBadge(
                                  label: stageLabel,
                                  onCover: hasCover,
                                ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Text(
                            tournament.name,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w900,
                                  color: hasCover
                                      ? onCover
                                      : context.themeColors.onSurface,
                                  letterSpacing: -0.5,
                                  height: 1.15,
                                ),
                          ),
                          const SizedBox(height: 10),
                          _MetaRow(
                            icon: Icons.location_on_outlined,
                            label: locationText,
                            iconColor: hasCover
                                ? onCoverMuted
                                : context.themeColors.onSurfaceMuted,
                            textColor: hasCover
                                ? onCover.withValues(alpha: 0.9)
                                : context.themeColors.onSurface.withValues(
                                    alpha: 0.88,
                                  ),
                          ),
                          const SizedBox(height: 6),
                          _MetaRow(
                            icon: Icons.calendar_today_outlined,
                            label: dateLabel,
                            iconColor: hasCover
                                ? onCoverMuted
                                : context.themeColors.onSurfaceMuted,
                            textColor: hasCover
                                ? onCover.withValues(alpha: 0.9)
                                : context.themeColors.onSurface.withValues(
                                    alpha: 0.88,
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            _horizontalMargin,
            0,
            _horizontalMargin,
            8,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _PrizeFeeCard(
                prizeLabel: stats.prizeTotalLabel,
                feeLabel: tournament.priceLabel,
              ),
              const SizedBox(height: 10),
              _SpotsCard(stats: stats, urgencyBanner: urgencyBanner),
            ],
          ),
        ),
      ],
    );
  }
}

class _HeroCoverBackground extends StatelessWidget {
  const _HeroCoverBackground({required this.imageUrl, required this.featured});

  final String? imageUrl;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    final canvas = context.themeColors.canvas;

    return Stack(
      fit: StackFit.expand,
      children: [
        if (imageUrl != null)
          CachedNetworkImage(
            imageUrl: imageUrl!,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 220),
            placeholder: (_, __) => _CoverPlaceholder(featured: featured),
            errorWidget: (_, __, ___) => _CoverPlaceholder(featured: featured),
          )
        else
          _CoverPlaceholder(featured: featured),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.black.withValues(alpha: 0.35),
                AppColors.black.withValues(alpha: 0.55),
                canvas.withValues(alpha: 0.92),
                canvas,
              ],
              stops: const [0.0, 0.45, 0.88, 1.0],
            ),
          ),
        ),
      ],
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder({required this.featured});

  final bool featured;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: featured
              ? [
                  AppColors.brand.withValues(alpha: 0.28),
                  const Color(0xFF141210),
                ]
              : [context.themeColors.surfaceCard, const Color(0xFF0A0A0A)],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.sports_volleyball_rounded,
          size: 56,
          color: featured
              ? AppColors.brand.withValues(alpha: 0.55)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.black.withValues(alpha: 0.42),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.55)),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.win,
        ),
      ),
    );
  }
}

class _StageBadge extends StatelessWidget {
  const _StageBadge({required this.label, required this.onCover});

  final String label;
  final bool onCover;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: onCover
            ? AppColors.black.withValues(alpha: 0.42)
            : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: onCover
              ? Colors.white.withValues(alpha: 0.22)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: onCover
              ? Colors.white.withValues(alpha: 0.88)
              : context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.icon,
    required this.label,
    required this.iconColor,
    required this.textColor,
  });

  final IconData icon;
  final String label;
  final Color iconColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: iconColor),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: textColor,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _PrizeFeeCard extends StatelessWidget {
  const _PrizeFeeCard({required this.prizeLabel, required this.feeLabel});

  final String prizeLabel;
  final String feeLabel;

  @override
  Widget build(BuildContext context) {
    final prizeAmount = _brlAmountFromLabel(prizeLabel);

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.22),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 13,
                child: ColoredBox(
                  color: AppColors.canvas,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _sectionLabel(context, 'PRÊMIO TOTAL'),
                        const SizedBox(height: 6),
                        if (prizeAmount != null) ...[
                          Text(
                            'R\$ $prizeAmount',
                            style: AppTypography.soraRegular(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: context.themeColors.onSurface,
                              height: 1.05,
                            ),
                          ),
                        ] else
                          Text(
                            prizeLabel,
                            style: AppTypography.soraRegular(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              Container(
                width: 1,
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.15,
                ),
              ),
              Expanded(
                flex: 7,
                child: ColoredBox(
                  color: AppColors.brand.withValues(alpha: 0.08),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _sectionLabel(context, 'INSCRIÇÃO'),
                        const SizedBox(height: 6),
                        Text(
                          feeLabel,
                          style: AppTypography.soraRegular(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: AppColors.brand,
                            height: 1.05,
                          ),
                        ),
                        Text(
                          'por dupla',
                          style: AppTypography.soraRegular(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _sectionLabel(BuildContext context, String label) {
    return Text(
      label,
      style: AppTypography.mono(
        fontSize: 10,
        fontWeight: FontWeight.w500,
        color: context.themeColors.onSurfaceMuted,
        letterSpacing: 0.6,
      ),
    );
  }

  static String? _brlAmountFromLabel(String label) {
    final trimmed = label.trim();
    if (trimmed.isEmpty || trimmed == '—') return null;
    final match = RegExp(r'^R\$\s*(.+)$').firstMatch(trimmed);
    return match?.group(1)?.trim();
  }
}

class _SpotsCard extends StatelessWidget {
  const _SpotsCard({required this.stats, this.urgencyBanner});

  final TournamentDetailStats stats;
  final String? urgencyBanner;

  @override
  Widget build(BuildContext context) {
    final progress = tournamentSpotsProgress(stats);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  tournamentSpotsRemainingLabel(stats),
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              Text(
                tournamentSpotsCounterLabel(stats),
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: context.themeColors.onSurfaceMuted.withValues(
                alpha: 0.12,
              ),
              color: AppColors.brand,
            ),
          ),
          if (urgencyBanner != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppColors.brand.withValues(alpha: 0.25),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.bolt_rounded, size: 16, color: AppColors.brand),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      urgencyBanner!,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.themeColors.onSurface,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
