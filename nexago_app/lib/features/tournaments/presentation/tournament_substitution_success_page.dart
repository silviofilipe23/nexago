import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_borders.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_card.dart';
import '../domain/substitution_journey_logic.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_registration_providers.dart';

/// Sucesso da substituição — troca a tela de acompanhamento (`pushReplacement`)
/// quando o convite vira `accepted`. Sem rota própria: chega por argumento de
/// construtor (`invite`/`registration`), não por path — nada além desta
/// navegação leva pra cá.
class TournamentSubstitutionSuccessPage extends StatelessWidget {
  const TournamentSubstitutionSuccessPage({
    super.key,
    required this.invite,
    required this.registration,
  });

  final TournamentPartnerInvite invite;
  final MyTournamentRegistration? registration;

  bool get _isTeam =>
      (registration?.teamSize ?? (invite.isTeamInvite ? 3 : 2)) >= 3;
  String get _unitWord => _isTeam ? 'equipe' : 'dupla';
  String get _unitWordCap => _isTeam ? 'Equipe' : 'Dupla';

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tournamentName = registration?.tournamentName ?? 'Torneio';
    final categoryName = registration?.category?.name ?? invite.categoryId;
    final outName = invite.replacedName ?? 'Atleta';
    final inName = invite.inviteeName;
    final inFirst = _firstNameOf(inName);
    final isPaid = registration?.isPaid ?? false;
    final entryFee = registration?.category?.entryFee;
    final reasonLabel =
        invite.reason != null ? substitutionReasonLabels[invite.reason] : null;
    final categoryLevel = registration?.category?.level.trim() ?? '';
    final inSubtitle = categoryLevel.isNotEmpty
        ? 'Nível $categoryLevel · dentro da categoria'
        : 'dentro da categoria';
    final inscriptionLabel = isPaid
        ? 'confirmada'
        : (registration?.statusLabel.toLowerCase() ?? 'confirmada');

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('$_unitWordCap atualizada'),
            Text(
              '$tournamentName · $categoryName',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.lg,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        children: [
          _SuccessHeroCard(
            invite: invite,
            registration: registration,
            inName: inName,
            inFirst: inFirst,
            unitWord: _unitWord,
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _MiniCard(label: 'INSCRIÇÃO', value: inscriptionLabel),
              ),
              if (isPaid) ...[
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _MiniCard(
                    label: 'PAGAMENTO',
                    value: formatBRL(entryFee ?? 0),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          NexaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SummaryRow(
                  icon: Icons.person_outline_rounded,
                  iconColor: colors.onSurfaceMuted,
                  title: '$outName saiu da $_unitWord',
                  subtitle: reasonLabel != null
                      ? 'Motivo: $reasonLabel · registrado com o organizador'
                      : null,
                ),
                Divider(
                  height: AppSpacing.xl,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
                _SummaryRow(
                  icon: Icons.check_rounded,
                  iconColor: AppColors.win,
                  title: '$inName entrou',
                  subtitle: inSubtitle,
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          _TournamentCard(
            tournamentName: tournamentName,
            categoryName: categoryName,
            dateLabel: registration?.dateLabel,
            locationLine: registration?.locationLine,
          ),
          const SizedBox(height: AppSpacing.xl),
          SizedBox(
            height: 52,
            child: FilledButton(
              onPressed: () => context.pushReplacementNamed(
                AppRouteNames.tournamentRegistrationDetail,
                pathParameters: {
                  'tournamentId': invite.tournamentId,
                  'registrationId': invite.attachRegistrationId ??
                      registration?.registrationId ??
                      '',
                },
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                shape: RoundedRectangleBorder(borderRadius: AppRadii.lgAll),
              ),
              child: const Text(
                'Ver inscrição →',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessHeroCard extends ConsumerWidget {
  const _SuccessHeroCard({
    required this.invite,
    required this.registration,
    required this.inName,
    required this.inFirst,
    required this.unitWord,
  });

  final TournamentPartnerInvite invite;
  final MyTournamentRegistration? registration;
  final String inName;
  final String inFirst;
  final String unitWord;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final outName = invite.replacedName ?? 'Atleta';

    final profileUids = <String>{
      ...?registration?.participantUids,
      if ((invite.replacedUid ?? '').isNotEmpty) invite.replacedUid!,
      if (invite.inviteeUid.isNotEmpty) invite.inviteeUid,
    }.toList()
      ..sort();
    final profiles =
        ref.watch(registrationRosterProfilesProvider(profileUids)).valueOrNull ??
            const <String, AppUserProfile>{};
    final authUser = ref.watch(authProvider).valueOrNull;
    final outProfile = _profileForSubstitutionAthlete(
      profiles: profiles,
      uid: invite.replacedUid,
      name: outName,
    );
    final inProfile = _profileForSubstitutionAthlete(
      profiles: profiles,
      uid: invite.inviteeUid,
      name: inName,
    );
    final outUid = (invite.replacedUid ?? '').trim();
    final inUid = invite.inviteeUid.trim();

    return NexaCard(
      side: BorderSide(color: AppColors.win.withValues(alpha: 0.4)),
      color: AppColors.win.withValues(alpha: 0.08),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _SuccessSwapAvatar(
                initials: outProfile != null
                    ? appUserInitials(outProfile)
                    : _initialsFor(outName),
                imageUrl: _substitutionAthletePhotoUrl(
                  profile: outProfile,
                  uid: outUid,
                  authUser: authUser,
                ),
                role: _SuccessSwapAvatarRole.outgoing,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: Icon(
                  Icons.arrow_forward_rounded,
                  size: 22,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.7),
                ),
              ),
              _SuccessSwapAvatar(
                initials: inProfile != null
                    ? appUserInitials(inProfile)
                    : _initialsFor(inName),
                imageUrl: _substitutionAthletePhotoUrl(
                  profile: inProfile,
                  uid: inUid,
                  authUser: authUser,
                ),
                role: _SuccessSwapAvatarRole.incoming,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '$inName é sua nova $unitWord',
            textAlign: TextAlign.center,
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 4),
          Text(
            '$inFirst aceitou seu convite.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

enum _SuccessSwapAvatarRole { outgoing, incoming }

class _SuccessSwapAvatar extends StatelessWidget {
  const _SuccessSwapAvatar({
    required this.initials,
    required this.role,
    this.imageUrl,
  });

  final String initials;
  final String? imageUrl;
  final _SuccessSwapAvatarRole role;

  static const _size = 56.0;
  static const _outFallback = [Color(0xFF2B3A4A), Color(0xFF1A2430)];
  static const _inFallback = [Color(0xFFB86A2B), Color(0xFF8A4A1E)];

  Color get _borderColor => switch (role) {
        _SuccessSwapAvatarRole.outgoing =>
          AppColors.live.withValues(alpha: 0.85),
        _SuccessSwapAvatarRole.incoming => AppColors.win,
      };

  List<Color> get _fallbackColors => switch (role) {
        _SuccessSwapAvatarRole.outgoing => _outFallback,
        _SuccessSwapAvatarRole.incoming => _inFallback,
      };

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    final badgeSize = _size * 0.34;
    final isIncoming = role == _SuccessSwapAvatarRole.incoming;

    return SizedBox(
      width: _size + 4,
      height: _size + 4,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (isIncoming)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.win.withValues(alpha: 0.35),
                      blurRadius: 18,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
            ),
          Container(
            width: _size,
            height: _size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: _borderColor, width: 2),
            ),
            child: ClipOval(
              child: SizedBox(
                width: _size,
                height: _size,
                child: url != null && url.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: url,
                        width: _size,
                        height: _size,
                        fit: BoxFit.cover,
                        placeholder: (context, url) => _SuccessSwapInitialsFallback(
                          initials: initials,
                          size: _size,
                          colors: _fallbackColors,
                        ),
                        errorWidget: (context, url, error) =>
                            _SuccessSwapInitialsFallback(
                          initials: initials,
                          size: _size,
                          colors: _fallbackColors,
                        ),
                      )
                    : _SuccessSwapInitialsFallback(
                        initials: initials,
                        size: _size,
                        colors: _fallbackColors,
                      ),
              ),
            ),
          ),
          Positioned(
            right: -2,
            bottom: -2,
            child: role == _SuccessSwapAvatarRole.outgoing
                ? Container(
                    width: badgeSize,
                    height: badgeSize,
                    decoration: BoxDecoration(
                      color: AppColors.live,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.black, width: 2),
                    ),
                    child: Icon(
                      Icons.close_rounded,
                      size: badgeSize * 0.62,
                      color: AppColors.white,
                    ),
                  )
                : Container(
                    width: badgeSize,
                    height: badgeSize,
                    decoration: BoxDecoration(
                      color: AppColors.win,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.black, width: 2),
                    ),
                    child: Icon(
                      Icons.check_rounded,
                      size: badgeSize * 0.62,
                      color: AppColors.black,
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _SuccessSwapInitialsFallback extends StatelessWidget {
  const _SuccessSwapInitialsFallback({
    required this.initials,
    required this.size,
    required this.colors,
  });

  final String initials;
  final double size;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
        child: Center(
          child: Text(
            initials,
            style: AppTypography.soraRegular(
              fontSize: size * 0.32,
              fontWeight: FontWeight.w700,
              color: AppColors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniCard extends StatelessWidget {
  const _MiniCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    this.subtitle,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: AppRadii.mdAll,
            border: Border.fromBorderSide(AppBorders.subtleSide(colors)),
          ),
          child: Icon(icon, size: 18, color: iconColor),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.titleS.copyWith(color: colors.onSurface),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: AppTypography.bodyS
                      .copyWith(color: colors.onSurfaceMuted),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _TournamentCard extends StatelessWidget {
  const _TournamentCard({
    required this.tournamentName,
    required this.categoryName,
    this.dateLabel,
    this.locationLine,
  });

  final String tournamentName;
  final String categoryName;
  final String? dateLabel;
  final String? locationLine;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final date = dateLabel ?? '';
    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            tournamentName,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 2),
          Text(
            date.isNotEmpty ? '$categoryName · $date' : categoryName,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
          if ((locationLine ?? '').isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              locationLine!,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ],
      ),
    );
  }
}

String _firstNameOf(String fullName) {
  final trimmed = fullName.trim();
  if (trimmed.isEmpty) return 'Atleta';
  return trimmed.split(RegExp(r'\s+')).first;
}

AppUserProfile? _profileForSubstitutionAthlete({
  required Map<String, AppUserProfile> profiles,
  required String? uid,
  required String name,
}) {
  final trimmedUid = uid?.trim() ?? '';
  if (trimmedUid.isNotEmpty) {
    final byUid = profiles[trimmedUid];
    if (byUid != null) return byUid;
  }

  final target = name.trim().toLowerCase();
  if (target.isEmpty) return null;
  for (final profile in profiles.values) {
    if (appUserDisplayName(profile).trim().toLowerCase() == target) {
      return profile;
    }
    final nickname = profile.nickname?.trim().toLowerCase();
    if (nickname != null && nickname.isNotEmpty && nickname == target) {
      return profile;
    }
  }
  return null;
}

String? _substitutionAthletePhotoUrl({
  required AppUserProfile? profile,
  required String uid,
  required User? authUser,
}) {
  final fromProfile = appUserProfilePhotoUrl(profile);
  if (fromProfile != null) return fromProfile;

  if (uid.isNotEmpty && authUser?.uid == uid) {
    final authPhoto = authUser?.photoURL?.trim();
    if (authPhoto != null && authPhoto.isNotEmpty) return authPhoto;
  }
  return null;
}

String _initialsFor(String fullName) {
  final parts =
      fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    final p = parts.first;
    return p.length >= 2 ? p.substring(0, 2).toUpperCase() : p.toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
