import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_public_profile_models.dart';

class PublicProfileStatsRow extends StatelessWidget {
  const PublicProfileStatsRow({
    super.key,
    required this.followers,
    required this.following,
    this.mutualPartners = const [],
  });

  final int followers;
  final int following;
  final List<AthletePublicPartnerEntry> mutualPartners;

  @override
  Widget build(BuildContext context) {
    final showSocialProof = mutualPartners.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: context.themeColors.surfaceRaised),
            bottom: BorderSide(color: context.themeColors.surfaceRaised),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: _StatColumn(
                value: formatSocialCount(followers),
                label: 'SEGUIDORES',
              ),
            ),
            _Divider(),
            Expanded(
              child: _StatColumn(
                value: formatSocialCount(following),
                label: 'SEGUINDO',
              ),
            ),
            if (showSocialProof) ...[
              _Divider(),
              Expanded(
                flex: 3,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    _PartnerAvatarStack(
                      partners: mutualPartners.take(3).toList(),
                    ),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        '+${mutualPartners.length} jogam com você',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.25,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 40,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      color: context.themeColors.surfaceRaised,
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: AppTypography.soraRegular(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            height: 1,
          ),
        ),
        SizedBox(height: 4),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 8,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}

class _PartnerAvatarStack extends StatelessWidget {
  const _PartnerAvatarStack({required this.partners});

  final List<AthletePublicPartnerEntry> partners;

  @override
  Widget build(BuildContext context) {
    const size = 28.0;
    const overlap = 10.0;
    final width = size + (partners.length - 1) * (size - overlap);

    return SizedBox(
      width: width.clamp(size, size + 2 * (size - overlap)),
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < partners.length; i++)
            Positioned(
              left: i * (size - overlap),
              child: Container(
                width: size,
                height: size,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: context.themeColors.surfaceRaised,
                  border: Border.all(
                    color: context.themeColors.canvas,
                    width: 2,
                  ),
                ),
                child: Text(
                  partners[i].initials,
                  style: AppTypography.soraRegular(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
