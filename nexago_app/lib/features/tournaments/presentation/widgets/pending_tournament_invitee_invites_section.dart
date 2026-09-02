import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/profiles/users_repository.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_invite_announcer.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_partner_invite_ui_logic.dart';
import 'tournament_registration/tournament_registration_dashed_border.dart';

/// Cards na Home para convites de dupla/equipe RECEBIDOS ainda pendentes —
/// espelha o card "Convites de dupla" do painel web. É o par inverso de
/// `PendingTournamentInviterInvitesSection` (convites ENVIADOS, seção
/// "Inscrições em andamento"): aqui o atleta é quem precisa responder.
class PendingTournamentInviteeInvitesSection extends ConsumerWidget {
  const PendingTournamentInviteeInvitesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitesAsync = ref.watch(pendingTournamentPartnerInvitesProvider);

    return invitesAsync.when(
      data: (invites) {
        if (invites.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SectionHeader(count: invites.length),
            const SizedBox(height: 10),
            for (final invite in invites) ...[
              _InviteeInviteCard(invite: invite),
              const SizedBox(height: 8),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          'Convites de dupla',
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.brand,
            shape: BoxShape.circle,
          ),
          child: Text(
            '$count',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.black,
              height: 1,
            ),
          ),
        ),
      ],
    );
  }
}

class _InviteeInviteCard extends ConsumerStatefulWidget {
  const _InviteeInviteCard({required this.invite});

  final TournamentPartnerInvite invite;

  @override
  ConsumerState<_InviteeInviteCard> createState() => _InviteeInviteCardState();
}

class _InviteeInviteCardState extends ConsumerState<_InviteeInviteCard> {
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final invite = widget.invite;
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final now = DateTime.now();
    final title = _inviteeHomeCardTitle(invite);
    final ageLabel = inviteAgeLabel(
      invite.createdAt,
      now,
      hasCreatedAt: invite.hasCreatedAt,
    );
    final expiryLabel = inviteExpiryHomeLabel(invite.expiresAt, now);

    final tournament =
        ref.watch(tournamentDetailProvider(invite.tournamentId)).valueOrNull;
    final category = tournament?.categoryOffers
        .where((offer) => offer.id == invite.categoryId)
        .firstOrNull;
    final categoryParts =
        category != null ? partnerInviteHomeCategoryParts(category) : null;
    final dateLabel =
        tournament != null ? partnerInviteCompactDate(tournament) : null;

    final inviterPublicProfile =
        ref.watch(appUserPublicProfileProvider(invite.inviterUid)).valueOrNull;
    final inviterInitials = inviterPublicProfile != null
        ? appUserInitials(inviterPublicProfile)
        : inviteInitials(invite.inviterName);
    final inviterAvatarUrl = inviterPublicProfile?.profilePhotoUrl;

    final inviteeProfile = ref.watch(athleteProfileProvider).valueOrNull;
    final inviteeInitials = inviteeProfile != null
        ? athleteInitials(inviteeProfile)
        : inviteInitials(invite.inviteeName);

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () {
          context.pushNamed(
            AppRouteNames.tournamentPartnerInvite,
            pathParameters: {'inviteId': invite.id},
          );
        },
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.45),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const _PendingStatusBadge(),
                  const Spacer(),
                  if (ageLabel != null)
                    Text(
                      ageLabel,
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurfaceMuted,
                        letterSpacing: 0.3,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CompactInviteAvatars(
                    inviterInitials: inviterInitials,
                    inviterAvatarUrl: inviterAvatarUrl,
                    inviteeInitials: inviteeInitials,
                    inviteeAvatarUrl: inviteeProfile?.avatarUrl,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                            height: 1.25,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text.rich(
                          TextSpan(
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colors.onSurfaceMuted,
                              fontWeight: FontWeight.w500,
                              height: 1.35,
                            ),
                            children: [
                              const TextSpan(
                                text: 'Ele já confirmou a parte dele. ',
                              ),
                              TextSpan(
                                text: 'Falta só você',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: colors.onSurface,
                                ),
                              ),
                              TextSpan(
                                text: invite.isTeamInvite &&
                                        (invite.teamName?.trim().isNotEmpty ??
                                            false)
                                    ? ' pra equipe estar fechada.'
                                    : ' pra dupla estar fechada.',
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (categoryParts != null || dateLabel != null) ...[
                const SizedBox(height: 12),
                Divider(
                  height: 1,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (categoryParts != null)
                      Expanded(
                        child: _MetaChip(
                          icon: Icons.emoji_events_outlined,
                          child: Text.rich(
                            TextSpan(
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colors.onSurfaceMuted,
                                fontWeight: FontWeight.w500,
                              ),
                              children: [
                                if (categoryParts.genderShort.isNotEmpty)
                                  TextSpan(text: '${categoryParts.genderShort} '),
                                if (categoryParts.level.isNotEmpty)
                                  TextSpan(
                                    text: categoryParts.level,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      color: colors.onSurface,
                                    ),
                                  ),
                              ],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    if (dateLabel != null)
                      Expanded(
                        child: _MetaChip(
                          icon: Icons.calendar_today_outlined,
                          label: dateLabel,
                        ),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 10),
              Divider(
                height: 1,
                color: colors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  if (expiryLabel != null)
                    Expanded(
                      child: Row(
                        children: [
                          Icon(
                            Icons.timer_outlined,
                            size: 14,
                            color: AppColors.brand.withValues(alpha: 0.9),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              expiryLabel,
                              style: AppTypography.mono(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: AppColors.brand,
                                letterSpacing: 0.3,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    const Spacer(),
                  Text(
                    'Toque para visualizar',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: AppColors.brand,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingStatusBadge extends StatelessWidget {
  const _PendingStatusBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'CONVITE PENDENTE',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactInviteAvatars extends StatelessWidget {
  const _CompactInviteAvatars({
    required this.inviterInitials,
    this.inviterAvatarUrl,
    required this.inviteeInitials,
    this.inviteeAvatarUrl,
  });

  final String inviterInitials;
  final String? inviterAvatarUrl;
  final String inviteeInitials;
  final String? inviteeAvatarUrl;

  static const _size = 40.0;
  static const _overlap = 12.0;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SizedBox(
      width: _size * 2 - _overlap,
      height: _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: _size - _overlap,
            child: _InviteeAvatar(
              initials: inviteeInitials,
              avatarUrl: inviteeAvatarUrl,
              borderColor: colors.surfaceCard,
            ),
          ),
          Positioned(
            left: 0,
            child: _InviterAvatar(
              initials: inviterInitials,
              avatarUrl: inviterAvatarUrl,
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
          width: _CompactInviteAvatars._size,
          height: _CompactInviteAvatars._size,
          child: hasPhoto
              ? AthleteProfileAvatar(
                  size: _CompactInviteAvatars._size,
                  initials: _compactInitials(initials),
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
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
        ),
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
              border: Border.all(
                color: context.themeColors.surfaceCard,
                width: 1.5,
              ),
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 9,
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
    required this.borderColor,
  });

  final String initials;
  final String? avatarUrl;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final hasPhoto = avatarUrl != null && avatarUrl!.trim().isNotEmpty;
    final compact = _compactInitials(initials);

    return TournamentRegistrationDashedBorder(
      radius: _CompactInviteAvatars._size / 2,
      color: AppColors.brand.withValues(alpha: 0.55),
      child: Container(
        width: _CompactInviteAvatars._size,
        height: _CompactInviteAvatars._size,
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          shape: BoxShape.circle,
          border: Border.all(color: borderColor, width: 1.5),
        ),
        clipBehavior: Clip.antiAlias,
        child: hasPhoto
            ? AthleteProfileAvatar(
                size: _CompactInviteAvatars._size,
                initials: compact,
                imageUrl: avatarUrl,
              )
            : Center(
                child: Text(
                  compact,
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.icon,
    this.label,
    this.child,
  });

  final IconData icon;
  final String? label;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Row(
      children: [
        Icon(
          icon,
          size: 14,
          color: colors.onSurfaceMuted.withValues(alpha: 0.75),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: child ??
              Text(
                label ?? '',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                      fontWeight: FontWeight.w500,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
        ),
      ],
    );
  }
}

String _inviteeHomeCardTitle(TournamentPartnerInvite invite) {
  final who = invite.inviterName.trim().isEmpty
      ? 'Um atleta'
      : invite.inviterName.trim();
  final teamName = invite.teamName?.trim();
  if (invite.isTeamInvite && teamName != null && teamName.isNotEmpty) {
    return '$who te chamou pra equipe $teamName';
  }
  return '$who te chamou pra dupla';
}

String _compactInitials(String value) {
  final trimmed = value.trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}
