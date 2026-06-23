import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_profile_avatar.dart';

import '../tournament_registration/tournament_registration_dashed_border.dart';

class PartnerInviteHeroCard extends StatelessWidget {
  const PartnerInviteHeroCard({
    super.key,
    required this.inviterName,
    required this.inviterInitials,
    this.inviterAvatarUrl,
    required this.inviteeInitials,
    this.inviteeAvatarUrl,
  });

  final String inviterName;
  final String inviterInitials;
  final String? inviterAvatarUrl;
  final String inviteeInitials;
  final String? inviteeAvatarUrl;

  static const _avatarSize = 56.0;

  @override
  Widget build(BuildContext context) {
    final inviterFirst = inviterName.split(' ').firstWhere(
          (p) => p.trim().isNotEmpty,
          orElse: () => inviterName,
        );

    return Container(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.1),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 120,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppColors.brand.withValues(alpha: 0.18),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.brand.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: AppColors.brand.withValues(alpha: 0.35),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.notifications_active_outlined,
                            size: 13,
                            color: AppColors.brand,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'VOCÊ FOI CONVIDADO',
                            style: AppTypography.mono(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: AppColors.brand,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _AvatarColumn(
                        avatar: _InviterAvatar(
                          initials: inviterInitials,
                          avatarUrl: inviterAvatarUrl,
                        ),
                        name: inviterFirst,
                        status: 'CONFIRMADO',
                        statusColor: AppColors.win,
                      ),
                      const SizedBox(width: 10),
                      Container(
                        width: 28,
                        height: 28,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: context.themeColors.surfaceRaised,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.2),
                          ),
                        ),
                        child: Text(
                          '+',
                          style: AppTypography.soraRegular(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      _AvatarColumn(
                        avatar: _InviteeAvatar(
                          initials: inviteeInitials,
                          avatarUrl: inviteeAvatarUrl,
                        ),
                        name: 'Sua vaga',
                        status: 'A PREENCHER',
                        statusColor: AppColors.brand,
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: inviterFirst,
                          style: AppTypography.soraRegular(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: AppColors.brand,
                            height: 1.15,
                          ),
                        ),
                        TextSpan(
                          text: ' escolheu você para formar dupla',
                          style: AppTypography.soraRegular(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: context.themeColors.onSurface,
                            height: 1.15,
                          ),
                        ),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 10),
                  Text.rich(
                    TextSpan(
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.45,
                      ),
                      children: [
                        TextSpan(text: '$inviterFirst já confirmou a parte dele. '),
                        const TextSpan(
                          text: 'Falta só você',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const TextSpan(text: ' entrar para fechar a dupla.'),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarColumn extends StatelessWidget {
  const _AvatarColumn({
    required this.avatar,
    required this.name,
    required this.status,
    required this.statusColor,
  });

  final Widget avatar;
  final String name;
  final String status;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 88,
      child: Column(
        children: [
          avatar,
          const SizedBox(height: 8),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            status,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: statusColor,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _InviterAvatar extends StatelessWidget {
  const _InviterAvatar({
    required this.initials,
    this.avatarUrl,
  });

  final String initials;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final hasPhoto = avatarUrl != null && avatarUrl!.trim().isNotEmpty;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        SizedBox(
          width: PartnerInviteHeroCard._avatarSize,
          height: PartnerInviteHeroCard._avatarSize,
          child: hasPhoto
              ? AthleteProfileAvatar(
                  size: PartnerInviteHeroCard._avatarSize,
                  initials: initials,
                  imageUrl: avatarUrl,
                )
              : Container(
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.brand, Color(0xFFE85D04)],
                    ),
                  ),
                  child: Text(
                    _compactInitials(initials),
                    style: AppTypography.mono(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
        ),
        Positioned(
          right: 2,
          bottom: 2,
          child: Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
              border: Border.all(
                color: context.themeColors.surfaceCard,
                width: 2,
              ),
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 11,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }
}

class _InviteeAvatar extends StatelessWidget {
  const _InviteeAvatar({
    required this.initials,
    this.avatarUrl,
  });

  final String initials;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final hasPhoto = avatarUrl != null && avatarUrl!.trim().isNotEmpty;

    return SizedBox(
      width: PartnerInviteHeroCard._avatarSize,
      height: PartnerInviteHeroCard._avatarSize + 6,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.topCenter,
        children: [
          TournamentRegistrationDashedBorder(
            radius: PartnerInviteHeroCard._avatarSize / 2,
            color: AppColors.brand.withValues(alpha: 0.55),
            child: SizedBox(
              width: PartnerInviteHeroCard._avatarSize,
              height: PartnerInviteHeroCard._avatarSize,
              child: hasPhoto
                  ? AthleteProfileAvatar(
                      size: PartnerInviteHeroCard._avatarSize,
                      initials: initials,
                      imageUrl: avatarUrl,
                    )
                  : Center(
                      child: Text(
                        _compactInitials(initials),
                        style: AppTypography.mono(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: context.themeColors.surfaceCard,
                  width: 1.5,
                ),
              ),
              child: Text(
                'VOCÊ',
                style: AppTypography.mono(
                  fontSize: 8,
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _compactInitials(String value) {
  final trimmed = value.trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}
