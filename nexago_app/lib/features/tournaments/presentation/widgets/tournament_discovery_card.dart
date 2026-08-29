import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/tournament_category_spots.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_listing_status.dart';
import 'tournament_category_spots_section.dart';

/// Card de torneio com capa, status, vagas por categoria e CTA (hub Competir).
///
/// Torneio concluído troca vagas e preço pela contagem de inscritos: a inscrição já fechou,
/// e vaga livre e valor ali seriam convite para algo que não existe mais.
class TournamentDiscoveryCard extends StatelessWidget {
  const TournamentDiscoveryCard({
    super.key,
    required this.tournament,
    required this.onTap,
    this.registration,
    this.topLabel,
    this.imageHeight = 140,
    this.showCategorySpots = true,
    this.showFooter = true,
  });

  final DiscoveryTournament tournament;
  final VoidCallback onTap;
  final MyTournamentRegistration? registration;
  final String? topLabel;
  final double imageHeight;
  final bool showCategorySpots;
  final bool showFooter;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isEnrolled = registration != null;
    final registrationNotYetOpen = tournamentRegistrationNotYetOpen(
      tournament.registrationOpensAt,
    );
    final statusColor = isEnrolled
        ? AppColors.brand
        : tournamentStatusColor(tournament.status);
    final statusLabel = (isEnrolled
            ? 'Inscrito'
            : tournamentStatusLabelFromRaw(
                status: tournament.status,
                registrationNotYetOpen: registrationNotYetOpen,
              ))
        .toUpperCase();
    final fillRatio = tournament.spotsTotal > 0
        ? 1 - (tournament.spotsLeft / tournament.spotsTotal)
        : 0.0;
    final imageUrl = tournament.imageUrl?.trim();
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;

    final isFinished = isTournamentTerminal(tournament.status);
    final offers = tournament.categoryOffers;
    final hasCategoryOffers = offers.isNotEmpty;
    final showSpotsSection =
        showCategorySpots && hasCategoryOffers && !isFinished;
    final used = (tournament.spotsTotal - tournament.spotsLeft).clamp(
      0,
      999999,
    );
    final total = tournament.spotsTotal.clamp(0, 999999);
    final capacityLeftLabel = tournament.spotsLeft <= 0
        ? 'LOTADO'
        : total > 0
        ? '${(fillRatio.clamp(0, 1) * 100).round()}%'
        : '';

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: tournament.featured
                  ? AppColors.brand.withValues(alpha: 0.45)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: imageHeight,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _TournamentCoverImage(
                      imageUrl: hasImage ? imageUrl : null,
                      featured: tournament.featured,
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 56,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              AppColors.black.withValues(alpha: 0.55),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (tournament.featured)
                      Positioned(
                        top: 10,
                        left: 10,
                        child: _FeaturedBadge(theme: theme),
                      ),
                    Positioned(
                      right: 10,
                      top: 10,
                      child: _StatusChip(
                        label: statusLabel,
                        color: statusColor,
                        live:
                            !isEnrolled &&
                            (tournament.status ==
                                    TournamentListingStatus.live ||
                                tournament.liveMatchesNow > 0),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (topLabel ?? 'TORNEIO · 1 ETAPA').toUpperCase(),
                      style: AppTypography.mono(
                        fontSize: 11,
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.8,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      tournament.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                        letterSpacing: -0.35,
                        height: 1.15,
                      ),
                    ),
                    SizedBox(height: 8),
                    _TournamentMetaRow(
                      location: tournament.location,
                      city: tournament.city,
                      dateLabel: showSpotsSection
                          ? tournamentDiscoveryCardDateShort(tournament)
                          : tournament.dateLabel,
                    ),
                    if (isFinished) ...[
                      SizedBox(height: 14),
                      _CardDivider(),
                      SizedBox(height: 14),
                      _EnrolledEntriesLine(tournament: tournament),
                    ] else if (showSpotsSection) ...[
                      SizedBox(height: 14),
                      _CardDivider(),
                      SizedBox(height: 14),
                      TournamentCategorySpotsSection(
                        tournamentId: tournament.id,
                        offers: offers,
                        format: tournament.format,
                      ),
                    ] else ...[
                      if (tournament.categories.isNotEmpty) ...[
                        SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            ...tournament.categories.map(
                              (c) =>
                                  _MetaChip(label: tournamentCategoryLabel(c)),
                            ),
                            _MetaChip(
                              label: tournamentFormatLabel(tournament.format),
                            ),
                          ],
                        ),
                      ],
                      SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: fillRatio.clamp(0.0, 1.0),
                          minHeight: 8,
                          backgroundColor: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.18),
                          color: statusColor,
                        ),
                      ),
                      SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            total > 0 ? '$used/$total DUPLAS' : '',
                            style: AppTypography.mono(
                              color: statusColor,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.6,
                            ),
                          ),
                          Spacer(),
                          Text(
                            capacityLeftLabel,
                            style: AppTypography.mono(
                              color: context.themeColors.onSurfaceMuted,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (showFooter) ...[
                      SizedBox(height: 14),
                      _CardDivider(),
                      SizedBox(height: 14),
                      _TournamentCardFooter(
                        priceLabel: isFinished ? null : tournament.priceLabel,
                        ctaLabel: tournamentDiscoveryCardCtaLabel(
                          isEnrolled: isEnrolled,
                          status: tournament.status,
                          registrationNotYetOpen: registrationNotYetOpen,
                        ),
                        emphasizeCta:
                            isEnrolled ||
                            (canRegisterForTournament(tournament.status) &&
                                !registrationNotYetOpen),
                      ),
                    ],
                    if (tournament.liveMatchesNow > 0) ...[
                      SizedBox(height: 10),
                      Text(
                        '${tournament.liveMatchesNow} jogos ao vivo agora',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.live,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Contagem de inscritos do torneio concluído — o que fica no lugar de vagas e preço.
///
/// Lê a mesma contagem viva de `inscriptions` que a seção de vagas por categoria usa; sem
/// categorias cadastradas, cai no `enrolledCount` derivado do documento do torneio.
class _EnrolledEntriesLine extends ConsumerWidget {
  const _EnrolledEntriesLine({required this.tournament});

  final DiscoveryTournament tournament;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countsAsync = ref.watch(
      tournamentCategoryEnrollmentCountsProvider(tournament.id),
    );
    final enrolled = tournamentEnrolledEntries(
      offers: tournament.categoryOffers,
      counts: countsAsync.valueOrNull ?? const <String, int>{},
      countsResolved: countsAsync.hasValue,
      fallbackEnrolled: tournament.enrolledCount,
    );
    final muted = context.themeColors.onSurfaceMuted;

    return Row(
      children: [
        Icon(Icons.groups_outlined, size: 15, color: muted),
        SizedBox(width: 6),
        Expanded(
          child: Text(
            tournamentEnrolledEntriesLabel(enrolled, tournament.format),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              color: muted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _TournamentMetaRow extends StatelessWidget {
  const _TournamentMetaRow({
    required this.location,
    required this.city,
    required this.dateLabel,
  });

  final String location;
  final String city;
  final String dateLabel;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final iconStyle = IconThemeData(
      size: 14,
      color: muted.withValues(alpha: 0.85),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.location_on_outlined, color: iconStyle.color, size: 14),
            SizedBox(width: 6),
            Expanded(
              child: Text(
                '$location · $city',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: muted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 4),
        Row(
          children: [
            Icon(
              Icons.calendar_today_outlined,
              color: iconStyle.color,
              size: 14,
            ),
            SizedBox(width: 6),
            Text(
              dateLabel,
              style: AppTypography.soraRegular(
                fontSize: 13,
                color: muted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _CardDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    );
  }
}

class _TournamentCardFooter extends StatelessWidget {
  const _TournamentCardFooter({
    required this.priceLabel,
    required this.ctaLabel,
    required this.emphasizeCta,
  });

  /// `null` no torneio concluído — sobra o CTA, que leva ao resultado.
  final String? priceLabel;
  final String ctaLabel;
  final bool emphasizeCta;

  @override
  Widget build(BuildContext context) {
    final price = priceLabel;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (price == null)
          Spacer()
        else
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'A PARTIR DE',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  price,
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                    height: 1,
                    letterSpacing: -0.5,
                  ),
                ),
              ],
            ),
          ),
        SizedBox(width: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          decoration: BoxDecoration(
            color: emphasizeCta
                ? AppColors.brand
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
            borderRadius: AppRadii.mdAll,
          ),
          child: Text(
            ctaLabel,
            style: AppTypography.labelL.copyWith(
              color: emphasizeCta
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ],
    );
  }
}

class _TournamentCoverImage extends StatelessWidget {
  const _TournamentCoverImage({required this.imageUrl, required this.featured});

  final String? imageUrl;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    if (imageUrl != null) {
      return CachedNetworkImage(
        imageUrl: imageUrl!,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 220),
        placeholder: (_, __) => const _CoverPlaceholder(),
        errorWidget: (_, __, ___) => const _CoverPlaceholder(),
      );
    }
    return _CoverPlaceholder(featured: featured);
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder({this.featured = false});

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
                  AppColors.win.withValues(alpha: 0.22),
                  context.themeColors.surfaceCard,
                ]
              : [
                  context.themeColors.surfaceCard,
                  context.themeColors.surfaceRaised,
                ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.sports_volleyball_rounded,
          size: 48,
          color: featured
              ? AppColors.win.withValues(alpha: 0.7)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.45),
        ),
      ),
    );
  }
}

class _FeaturedBadge extends StatelessWidget {
  const _FeaturedBadge({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'DESTAQUE',
        style: theme.textTheme.labelSmall?.copyWith(
          color: AppColors.black,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.color,
    this.live = false,
  });

  final String label;
  final Color color;
  final bool live;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.7)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (live) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            SizedBox(width: 6),
          ],
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              color: color,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w700,
          color: context.themeColors.onSurface,
        ),
      ),
    );
  }
}
