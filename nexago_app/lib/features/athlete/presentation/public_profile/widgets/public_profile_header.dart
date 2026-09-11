import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile.dart';
import '../../../domain/athlete_public_profile_models.dart';
import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../../domain/sand_rank/sand_rank_models.dart';
import '../../sand_rank/widgets/sand_rank_avatar_frame.dart';
import '../../sand_rank/widgets/sand_rank_badge.dart';
import '../../sand_rank/widgets/sand_rank_emblem.dart';
import '../../widgets/athlete_profile_avatar.dart';

/// Hero do perfil público: capa, avatar centralizado, identidade e tags.
class PublicProfileHeader extends StatelessWidget {
  const PublicProfileHeader({
    super.key,
    required this.profile,
    required this.ranking,
    required this.onBack,
    this.sandRank,
    this.sandRankTitleId,
    this.sandRankFrameId,
  });

  static const coverHeight = 240.0;
  static const avatarSize = 104.0;

  /// Avatar do topo: menor que [avatarSize] porque agora divide a linha com a
  /// identidade e o badge de ranking, dentro da capa.
  static const heroAvatarSize = 76.0;
  static const avatarOverlap = 52.0;
  static const _avatarEmblemOverflow = 12.0;

  final AthleteProfile profile;
  final AthletePublicRankingSnapshot ranking;
  final VoidCallback onBack;

  /// Elo público do atleta (badge sob o nome); `null` oculta o badge.
  final PublicSandRank? sandRank;
  final String? sandRankTitleId;

  /// Moldura equipada — anel ao redor do avatar central.
  final String? sandRankFrameId;

  @override
  Widget build(BuildContext context) {
    final name = athleteDisplayName(profile);
    final secondaryName = athleteSecondaryLine(profile);
    final handle = athletePublicHandle(profile);
    final ageLabel = athleteAgeCategoryLabel(profile.birthDate);
    final genderLabel = athleteGenderShortLabel(profile.gender);
    final location = athleteLocationLabel(profile);
    final sports = buildPublicSportEntries(profile);
    final coverUrl = profile.coverPhotoUrl?.trim() ?? '';
    final hasCoverPhoto = coverUrl.isNotEmpty;
    final bio = profile.bio?.trim() ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            SizedBox(
              height: coverHeight,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (hasCoverPhoto)
                    CachedNetworkImage(
                      imageUrl: coverUrl,
                      fit: BoxFit.cover,
                      fadeInDuration: const Duration(milliseconds: 280),
                      placeholder: (_, __) => const _CoverPhotoSkeleton(),
                      errorWidget: (_, __, ___) =>
                          const _DefaultCoverBackground(),
                    )
                  else
                    const _DefaultCoverBackground(),
                  // O véu escurece o PÉ da capa, que agora é a cama do nome e
                  // do handle. Sem ele o texto cairia sobre a foto crua.
                  //
                  // O último passo é a COR DO FUNDO da página, não preto: a
                  // capa dissolve no canvas em vez de terminar num corte seco,
                  // e no tema claro não cria uma faixa preta contra um fundo
                  // claro.
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.35),
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.55),
                          context.themeColors.canvas.withValues(alpha: 0.92),
                          context.themeColors.canvas,
                        ],
                        stops: const [0, 0.30, 0.62, 0.88, 1],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                child: Row(
                  children: [
                    _IconButton(onTap: onBack, icon: Icons.arrow_back_rounded),
                  ],
                ),
              ),
            ),
            // Identidade ancorada no pé da capa: avatar, nome/handle e o badge
            // de ranking na mesma linha.
            Positioned(
              left: 20,
              right: 20,
              bottom: 16,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _PublicProfileAvatar(
                    profile: profile,
                    sandRank: sandRank,
                    sandRankFrameId: sandRankFrameId,
                    size: heroAvatarSize,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          // Branco fixo: o texto está sobre a foto, e
                          // `onSurface` escureceria e sumiria no tema claro.
                          style: AppTypography.soraRegular(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: AppColors.white,
                            letterSpacing: -0.6,
                            height: 1.1,
                          ),
                        ),
                        if (secondaryName != null)
                          Text(
                            secondaryName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppColors.white.withValues(alpha: 0.74),
                            ),
                          ),
                        if (handle != null)
                          Text(
                            handle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppColors.white.withValues(alpha: 0.74),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (ranking.hasRank) ...[
                    const SizedBox(width: 10),
                    _RankingBadge(rank: ranking.rank!),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              if (sandRank != null) ...[
                SizedBox(height: 10),
                SandRankBadge(
                  rank: sandRank,
                  equippedTitleId: sandRankTitleId,
                ),
              ],
              SizedBox(height: 10),
              _InfoRow(
                ageLabel: ageLabel,
                genderLabel: genderLabel,
                location: location,
              ),
              if (bio.isNotEmpty) ...[
                SizedBox(height: 12),
                Text(
                  bio,
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurface.withValues(
                      alpha: 0.88,
                    ),
                    height: 1.45,
                  ),
                ),
              ],
              if (sports.isNotEmpty) ...[
                SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    for (var i = 0; i < sports.length && i < 3; i++)
                      _SportChip(
                        label: sports[i].label,
                        primary: sports[i].isPrimary,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _PublicProfileAvatar extends StatelessWidget {
  const _PublicProfileAvatar({
    required this.profile,
    required this.sandRank,
    required this.sandRankFrameId,
    this.size = PublicProfileHeader.avatarSize,
  });

  final double size;

  final AthleteProfile profile;
  final PublicSandRank? sandRank;
  final String? sandRankFrameId;

  @override
  Widget build(BuildContext context) {
    final rank = sandRank;
    final step =
        rank != null ? sandRankStepByTrackIndex(rank.trackIndex) : null;

    return SizedBox(
      width: size + PublicProfileHeader._avatarEmblemOverflow,
      height: size + PublicProfileHeader._avatarEmblemOverflow,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            top: 0,
            child: SandRankAvatarFrame(
              frameId: sandRankFrameId,
              size: size,
              child: AthleteProfileAvatar(
                size: size,
                initials: athleteInitials(profile),
                imageUrl: profile.avatarUrl,
              ),
            ),
          ),
          if (step != null)
            Positioned(
              right: 0,
              bottom: 0,
              child: Tooltip(
                message: 'Elo ${sandRankLabel(step)}',
                child: SandRankEmblem(
                  rankCode: step.rankCode,
                  division: step.division,
                  size: SandRankEmblemSize.badge,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _RankingBadge extends StatelessWidget {
  const _RankingBadge({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    final metal = _RankingBadgeMetal.of(rank);
    const radius = BorderRadius.all(Radius.circular(14));
    final fill = metal?.fill ?? AppColors.white.withValues(alpha: 0.14);
    final border = metal?.border ?? AppColors.white.withValues(alpha: 0.28);
    final labelColor = metal?.label ?? AppColors.white.withValues(alpha: 0.72);
    final valueColor = metal?.value ?? AppColors.white;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: metal == null
            ? null
            : [
                BoxShadow(
                  color: metal.glow,
                  blurRadius: 18,
                  spreadRadius: 0.5,
                ),
              ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            decoration: BoxDecoration(
              borderRadius: radius,
              gradient: metal?.sheen,
              color: metal == null ? fill : null,
              border: Border.all(color: border, width: metal == null ? 1 : 1.2),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'RANKING BR',
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: labelColor,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '#$rank',
                  style: AppTypography.soraRegular(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: valueColor,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Paleta luminosa do pódio no badge de ranking (1 ouro · 2 prata · 3 bronze).
class _RankingBadgeMetal {
  const _RankingBadgeMetal({
    required this.fill,
    required this.border,
    required this.label,
    required this.value,
    required this.glow,
    required this.sheen,
  });

  final Color fill;
  final Color border;
  final Color label;
  final Color value;
  final Color glow;
  final LinearGradient sheen;

  static _RankingBadgeMetal? of(int rank) {
    switch (rank) {
      case 1:
        return _RankingBadgeMetal(
          fill: const Color(0xFFFFD700).withValues(alpha: 0.28),
          border: const Color(0xFFFFE566).withValues(alpha: 0.85),
          label: const Color(0xFFFFF1B0),
          value: const Color(0xFFFFF8D6),
          glow: const Color(0xFFFFD700).withValues(alpha: 0.55),
          sheen: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFFFFF6C8).withValues(alpha: 0.42),
              const Color(0xFFFFD700).withValues(alpha: 0.22),
              const Color(0xFFFFB800).withValues(alpha: 0.30),
            ],
          ),
        );
      case 2:
        return _RankingBadgeMetal(
          fill: const Color(0xFFE8ECF4).withValues(alpha: 0.28),
          border: const Color(0xFFF5F7FA).withValues(alpha: 0.88),
          label: const Color(0xFFE9EDF5),
          value: const Color(0xFFF8FAFC),
          glow: const Color(0xFFD7DCE6).withValues(alpha: 0.55),
          sheen: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFFFFFFFF).withValues(alpha: 0.48),
              const Color(0xFFD8DEE8).withValues(alpha: 0.22),
              const Color(0xFFB8C0CE).withValues(alpha: 0.32),
            ],
          ),
        );
      case 3:
        return _RankingBadgeMetal(
          fill: const Color(0xFFE8A05A).withValues(alpha: 0.30),
          border: const Color(0xFFFFC08A).withValues(alpha: 0.85),
          label: const Color(0xFFFFD7B0),
          value: const Color(0xFFFFE6CC),
          glow: const Color(0xFFD08A5A).withValues(alpha: 0.55),
          sheen: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFFFFD9B0).withValues(alpha: 0.44),
              const Color(0xFFD08A5A).withValues(alpha: 0.24),
              const Color(0xFFB86A3A).withValues(alpha: 0.32),
            ],
          ),
        );
      default:
        return null;
    }
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.ageLabel,
    required this.genderLabel,
    required this.location,
  });

  final String ageLabel;
  final String genderLabel;
  final String location;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[];
    if (ageLabel.isNotEmpty) parts.add(ageLabel);
    if (genderLabel.isNotEmpty) parts.add(genderLabel);

    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 8,
      runSpacing: 4,
      children: [
        if (parts.isNotEmpty)
          Text(
            parts.join(' · '),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
              letterSpacing: 0.3,
            ),
          ),
        if (location.isNotEmpty)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.location_on_outlined,
                size: 14,
                color: context.themeColors.onSurfaceMuted,
              ),
              SizedBox(width: 2),
              Text(
                location,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _SportChip extends StatelessWidget {
  const _SportChip({required this.label, required this.primary});

  final String label;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: primary ? AppColors.brand : context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        border: primary
            ? null
            : Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: primary ? AppColors.black : context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  const _IconButton({required this.onTap, required this.icon});

  final VoidCallback onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard.withValues(alpha: 0.9),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, color: context.themeColors.onSurface, size: 20),
        ),
      ),
    );
  }
}

class _CoverPhotoSkeleton extends StatefulWidget {
  const _CoverPhotoSkeleton();

  @override
  State<_CoverPhotoSkeleton> createState() => _CoverPhotoSkeletonState();
}

class _CoverPhotoSkeletonState extends State<_CoverPhotoSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return ColoredBox(
          color: Color.lerp(
            context.themeColors.surfaceCard,
            context.themeColors.onSurfaceMuted.withValues(alpha: 0.22),
            t,
          )!,
        );
      },
    );
  }
}

class _DefaultCoverBackground extends StatelessWidget {
  const _DefaultCoverBackground();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.14),
            context.themeColors.canvas,
            context.themeColors.canvas,
          ],
        ),
      ),
      child: CustomPaint(
        painter: _CoverLinesPainter(
          color: AppColors.brand.withValues(alpha: 0.07),
        ),
      ),
    );
  }
}

class _CoverLinesPainter extends CustomPainter {
  _CoverLinesPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var i = -3; i < 10; i++) {
      canvas.drawLine(
        Offset(size.width * 0.08 * i, 0),
        Offset(size.width * 0.18 + size.width * 0.08 * i, size.height),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
