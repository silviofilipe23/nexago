import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class PublicProfileActionRow extends StatelessWidget {
  const PublicProfileActionRow({
    super.key,
    required this.isFollowing,
    required this.isSelf,
    required this.followLoading,
    required this.onFollow,
    required this.onInvite,
    required this.onShare,
  });

  final bool isFollowing;
  final bool isSelf;
  final bool followLoading;
  final VoidCallback onFollow;
  final VoidCallback onInvite;
  final VoidCallback onShare;

  static const _height = 48.0;
  static const _radius = BorderRadius.all(Radius.circular(999));

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(
            flex: 11,
            child: isSelf
                ? _PrimaryPillButton(label: 'Editar perfil', onTap: onInvite)
                : isFollowing
                ? _SecondaryPillButton(
                    label: 'Seguindo',
                    onTap: onFollow,
                    loading: followLoading,
                  )
                : _PrimaryPillButton(
                    label: 'Seguir',
                    onTap: onFollow,
                    loading: followLoading,
                  ),
          ),
          SizedBox(width: 8),
          // Expanded(
          //   flex: 7,
          //   child: _SecondaryPillButton(
          //     label: 'Convidar',
          //     icon: Icons.bolt_rounded,
          //     onTap: onInvite,
          //   ),
          // ),
          // SizedBox(width: 8),
          _SharePillButton(onTap: onShare),
        ],
      ),
    );
  }
}

class _PrimaryPillButton extends StatelessWidget {
  const _PrimaryPillButton({
    required this.label,
    required this.onTap,
    this.loading = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.brand,
      borderRadius: PublicProfileActionRow._radius,
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: PublicProfileActionRow._radius,
        child: SizedBox(
          height: PublicProfileActionRow._height,
          child: Center(
            child: loading
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.black,
                    ),
                  )
                : Text(
                    label,
                    style: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.black,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _SecondaryPillButton extends StatelessWidget {
  const _SecondaryPillButton({
    required this.label,
    required this.onTap,
    this.icon,
    this.loading = false,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: PublicProfileActionRow._radius,
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: PublicProfileActionRow._radius,
        child: Container(
          height: PublicProfileActionRow._height,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: PublicProfileActionRow._radius,
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: loading
              ? Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.brand,
                    ),
                  ),
                )
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (icon != null) ...[
                      Icon(
                        icon,
                        size: 16,
                        color: context.themeColors.onSurface,
                      ),
                      SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _SharePillButton extends StatelessWidget {
  const _SharePillButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: PublicProfileActionRow._radius,
      child: InkWell(
        onTap: onTap,
        borderRadius: PublicProfileActionRow._radius,
        child: Container(
          width: PublicProfileActionRow._height,
          height: PublicProfileActionRow._height,
          decoration: BoxDecoration(
            borderRadius: PublicProfileActionRow._radius,
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Icon(
            Icons.ios_share_rounded,
            color: context.themeColors.onSurface,
            size: 20,
          ),
        ),
      ),
    );
  }
}
