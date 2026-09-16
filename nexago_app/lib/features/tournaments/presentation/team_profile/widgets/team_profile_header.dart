import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_display_name.dart';
import '../../../../athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/team_profile/team_public_profile_logic.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';

class TeamProfileHeader extends StatelessWidget {
  const TeamProfileHeader({
    super.key,
    required this.profile,
    required this.onBack,
  });

  static const coverHeight = 220.0;
  static const avatarSize = 96.0;
  static const avatarOverlap = 48.0;

  /// Capa + a parte do avatar que invade o corpo. O `Stack` precisa dessa
  /// altura, e não só a da capa: hit test não alcança filho pintado fora dos
  /// limites do pai, e a metade de baixo do avatar ficaria surda ao toque.
  static const _stackHeight = coverHeight - avatarOverlap + avatarSize;

  final TeamPublicProfile profile;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final displayName = teamProfileDisplayName(
      team: profile.team,
      player1: profile.player1,
      player2: profile.player2,
    );
    final sport = teamProfileSportLabel(profile.player1, profile.player2);
    // final together = formatTeamTogetherLabel(profile.team.createdAt);
    final tags = teamProfileTagLabels(
      profile.player1,
      profile.player2,
      roster: profile.loadedProfiles,
    );
    final subtitleParts = <String>[sport];
    // if (together.isNotEmpty) subtitleParts.add('juntos há $together');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: _stackHeight,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              SizedBox(
                height: coverHeight,
                width: double.infinity,
                child: _TeamCoverBackground(art: teamProfileCoverArt(profile)),
              ),
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                  child: Row(
                    children: [
                      _IconButton(
                        onTap: onBack,
                        icon: Icons.arrow_back_rounded,
                      ),
                    ],
                  ),
                ),
              ),
              if (profile.ranking.hasRank)
                Positioned(
                  top: MediaQuery.paddingOf(context).top + 56,
                  right: 20,
                  child: _RankingBadge(rank: profile.ranking.rank!),
                ),
              Positioned(
                left: 0,
                right: 0,
                top: coverHeight - avatarOverlap,
                child: Center(child: _TeamAvatars(profile: profile)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              Text(
                displayName,
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitleParts.join(' · '),
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              if (tags.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  alignment: WrapAlignment.center,
                  children: [for (final tag in tags) _TagChip(label: tag)],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Avatares do elenco inteiro, sobrepostos e centrados. A dupla mantém os dois
/// de sempre; trio pra cima encolhe o avatar para caber sem estourar a capa.
class _TeamAvatars extends StatelessWidget {
  const _TeamAvatars({required this.profile});

  final TeamPublicProfile profile;

  static double _avatarSizeFor(int count) => switch (count) {
        <= 2 => TeamProfileHeader.avatarSize * 0.82,
        3 => TeamProfileHeader.avatarSize * 0.68,
        4 => TeamProfileHeader.avatarSize * 0.60,
        _ => TeamProfileHeader.avatarSize * 0.54,
      };

  @override
  Widget build(BuildContext context) {
    final members = profile.members;
    if (members.isEmpty) return const SizedBox.shrink();

    final size = _avatarSizeFor(members.length);
    final step = size * 0.72;
    final width = size + step * (members.length - 1);
    final top = (TeamProfileHeader.avatarSize - size) / 2;

    // Uma galeria só para o elenco: tocar num avatar abre a foto daquele
    // atleta e o swipe segue para os companheiros. Quem não tem foto fica de
    // fora da lista — e por isso a posição na galeria não é a posição no
    // elenco.
    final photoUrls = <String>[];
    final galleryIndexes = <int?>[];
    for (final member in members) {
      final url = member.profile?.avatarUrl?.trim() ?? '';
      if (url.isEmpty) {
        // Avatar de iniciais não tem o que ampliar: não vira botão.
        galleryIndexes.add(null);
        continue;
      }
      galleryIndexes.add(photoUrls.length);
      photoUrls.add(url);
    }

    return SizedBox(
      width: width,
      height: TeamProfileHeader.avatarSize,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < members.length; i++)
            Positioned(
              left: step * i,
              top: top,
              child: _MemberAvatar(
                member: members[i],
                size: size,
                onTap: galleryIndexes[i] == null
                    ? null
                    : () => openProfilePhotoViewer(
                          context,
                          photoUrls: photoUrls,
                          initialIndex: galleryIndexes[i]!,
                        ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Avatar de um integrante — tocável só quando há foto para ampliar.
class _MemberAvatar extends StatelessWidget {
  const _MemberAvatar({
    required this.member,
    required this.size,
    this.onTap,
  });

  final TeamMemberEntry member;
  final double size;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final profile = member.profile;
    final avatar = AthleteProfileAvatar(
      size: size,
      initials: profile != null ? athleteInitials(profile) : '?',
      imageUrl: profile?.avatarUrl,
    );

    final tap = onTap;
    if (tap == null || profile == null) return avatar;

    return Semantics(
      button: true,
      label: 'Ampliar foto de ${athleteDisplayName(profile)}',
      child: InkWell(
        onTap: tap,
        customBorder: const CircleBorder(),
        child: avatar,
      ),
    );
  }
}

/// Capa: arte do esporte + elenco quando existe, fundo pintado quando não.
///
/// Sobre a arte vai um véu — o topo segura o botão de voltar e o selo de
/// ranking, e o pé dissolve no canvas para a foto não terminar num corte seco
/// contra o corpo da página.
class _TeamCoverBackground extends StatelessWidget {
  const _TeamCoverBackground({this.art});

  final String? art;

  @override
  Widget build(BuildContext context) {
    final asset = art;
    if (asset == null) return const _PaintedCover();

    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          asset,
          fit: BoxFit.cover,
          // Decorativa: quem carrega o significado é o nome da equipe, logo
          // abaixo.
          excludeFromSemantics: true,
          // Asset fora do bundle cai no fundo pintado em vez de quebrar a tela
          // com o ícone de imagem quebrada.
          errorBuilder: (_, __, ___) => const _PaintedCover(),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.45),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.35),
                context.themeColors.canvas,
              ],
              stops: const [0, 0.32, 0.74, 1],
            ),
          ),
        ),
      ],
    );
  }
}

class _PaintedCover extends StatelessWidget {
  const _PaintedCover();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.45),
            context.themeColors.canvas,
            AppColors.brand.withValues(alpha: 0.12),
          ],
        ),
      ),
      child: CustomPaint(
        painter: _CoverPatternPainter(
          color: AppColors.brand.withValues(alpha: 0.08),
        ),
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
            : [BoxShadow(color: metal.glow, blurRadius: 18, spreadRadius: 0.5)],
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
                  'RANKING EQUIPES',
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

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
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
      color: context.themeColors.surfaceCard.withValues(alpha: 0.75),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 20, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _CoverPatternPainter extends CustomPainter {
  const _CoverPatternPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    for (var i = 0; i < 8; i++) {
      canvas.drawCircle(
        Offset(size.width * 0.15 + size.width * 0.1 * i, size.height * 0.35),
        18 + i * 2,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
