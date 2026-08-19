import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/text/safe_display_text.dart';

/// Avatar circular do atleta (foto ou iniciais com borda e sombra da marca).
class AthleteProfileAvatar extends StatelessWidget {
  const AthleteProfileAvatar({
    super.key,
    required this.size,
    required this.initials,
    this.imageUrl,
    this.displayLevel,
  });

  final double size;
  final String initials;
  final String? imageUrl;
  final int? displayLevel;

  static double slotSizeFor(double avatarSize) => avatarSize + 12;

  @override
  Widget build(BuildContext context) {
    final avatar = _AvatarCircle(
      size: size,
      initials: initials,
      imageUrl: imageUrl,
    );

    final level = displayLevel;
    if (level == null) return avatar;

    final slot = slotSizeFor(size);
    return SizedBox(
      width: slot,
      height: slot,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(left: 0, top: 0, child: avatar),
          Positioned(
            right: 2,
            bottom: 2,
            child: _LevelBadge(displayLevel: level),
          ),
        ],
      ),
    );
  }
}

class _LevelBadge extends StatelessWidget {
  const _LevelBadge({required this.displayLevel});

  final int displayLevel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.black, width: 2),
      ),
      child: Text(
        'LV $displayLevel',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.black,
              fontSize: 10,
              letterSpacing: 0.3,
            ),
      ),
    );
  }
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({
    required this.size,
    required this.initials,
    this.imageUrl,
  });

  final double size;
  final String initials;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.85),
          width: 2,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.35),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipOval(
        child: SizedBox(
          width: size,
          height: size,
          child: url != null && url.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: url,
                  width: size,
                  height: size,
                  fit: BoxFit.cover,
                  errorWidget: (context, url, error) =>
                      AthleteProfileAvatarInitials(
                    initials: initials,
                    size: size,
                  ),
                )
              : AthleteProfileAvatarInitials(
                  initials: initials,
                  size: size,
                ),
        ),
      ),
    );
  }
}

class AthleteProfileAvatarInitials extends StatelessWidget {
  const AthleteProfileAvatarInitials({
    super.key,
    required this.initials,
    this.size = 72,
  });

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brandHover,
            AppColors.brand,
            AppColors.brandPressed,
          ],
        ),
      ),
      child: Center(
        child: Text(
          sanitizeUtf16(initials),
          style: TextStyle(
            fontSize: size * 0.36,
            fontWeight: FontWeight.w900,
            color: AppColors.black,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }
}
