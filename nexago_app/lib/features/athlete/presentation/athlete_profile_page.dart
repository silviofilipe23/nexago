import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_booking_helpers.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/achievements/achievement_providers.dart';
import '../domain/gamification_models.dart';
import '../domain/gamification_providers.dart';
import '../domain/profile_completion_providers.dart';
import 'public_profile/athlete_public_profile_page.dart';
import 'widgets/athlete_profile_main_view.dart';

/// Perfil do atleta.
///
/// Se [embedded] for true (ex.: aba do shell), não usa [Scaffold] próprio —
/// o pai fornece o layout; o conteúdo usa [context.themeColors.canvas].
class AthleteProfilePage extends ConsumerWidget {
  const AthleteProfilePage({
    super.key,
    this.embedded = false,
    this.viewedUserId,
  });

  final bool embedded;
  final String? viewedUserId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    final viewed = viewedUserId?.trim();

    Widget bodyNotSignedIn(BuildContext ctx) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Faça login para ver seu perfil.',
            textAlign: TextAlign.center,
            style: Theme.of(ctx).textTheme.bodyLarge?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
        ),
      );
    }

    if (viewed != null && viewed.isNotEmpty) {
      final page = AthletePublicProfilePage(userId: viewed);
      if (embedded) {
        return ColoredBox(color: context.themeColors.canvas, child: page);
      }
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: page,
      );
    }

    final profileAsync = ref.watch(athleteProfileProvider);
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    final gamificationSummaryAsync = ref.watch(gamificationSummaryProvider);
    final badgesAsync = ref.watch(gamificationBadgesProvider);

    Widget bodyContent() {
      if (user == null) return bodyNotSignedIn(context);
      return profileAsync.when(
        data: (doc) {
          final profile = doc ?? AthleteProfile.draft(user);
          return bookingsAsync.when(
            data: (bookings) => _AthleteProfileBody(
              embedded: embedded,
              profile: profile,
              email: user.email,
              totalBookings: _countCompletedBookings(bookings),
              nextBooking: findNextAthleteBooking(bookings),
              gamificationSummary: gamificationSummaryAsync.valueOrNull ??
                  GamificationSummary.initial(),
              badges: badgesAsync.valueOrNull ?? const <UserBadgeProgress>[],
              readOnly: false,
              onEdit: () => context.pushNamed(AppRouteNames.athleteProfileEdit),
              onOpenAgenda: () => context.pushNamed(AppRouteNames.myBookings),
              onOpenSettings: () =>
                  context.pushNamed(AppRouteNames.athleteSettings),
            ),
            loading: () => Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Não foi possível carregar reservas.\n$e',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppColors.live,
                      ),
                ),
              ),
            ),
          );
        },
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.live,
                  ),
            ),
          ),
        ),
      );
    }

    if (embedded) {
      return ColoredBox(
        color: context.themeColors.canvas,
        child: bodyContent(),
      );
    }

    if (user == null) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: bodyNotSignedIn(context),
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: bodyContent(),
    );
  }
}

void _showBriefAlert(
  BuildContext context,
  String title,
  String message,
) {
  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: context.themeColors.surfaceSheet,
      title: Text(
        title,
        style: TextStyle(color: context.themeColors.onSurface),
      ),
      content: Text(
        message,
        style: TextStyle(color: context.themeColors.onSurfaceMuted),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(
            'OK',
            style: TextStyle(
              color: AppColors.brand,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class _AthleteProfileBody extends ConsumerWidget {
  const _AthleteProfileBody({
    required this.embedded,
    required this.profile,
    required this.email,
    required this.totalBookings,
    required this.nextBooking,
    required this.gamificationSummary,
    required this.badges,
    this.readOnly = false,
    required this.onEdit,
    required this.onOpenAgenda,
    required this.onOpenSettings,
  });

  final bool embedded;
  final AthleteProfile profile;
  final String? email;
  final int totalBookings;
  final MyBookingItem? nextBooking;
  final GamificationSummary gamificationSummary;
  final List<UserBadgeProgress> badges;
  final bool readOnly;
  final VoidCallback onEdit;
  final VoidCallback onOpenAgenda;
  final VoidCallback onOpenSettings;

  void _comingSoon(BuildContext context, String title) {
    _showBriefAlert(
      context,
      'Em breve',
      '$title estará disponível em breve.',
    );
  }

  Future<void> _shareProfile(
    BuildContext context,
    WidgetRef ref,
    AthleteProfile profile,
  ) async {
    final name = athleteDisplayName(profile);
    final sport = profile.sport.trim().isNotEmpty ? profile.sport.trim() : 'esporte';
    await Share.share(
      'Confira meu perfil no NexaGO: $name — $sport',
    );
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    await ref.read(gamificationServiceProvider).onProfileShared(userId: uid);
    ref.invalidate(achievementsScreenStateProvider);
    ref.invalidate(gamificationBadgesProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final completion =
        readOnly ? null : ref.watch(profileCompletionStateProvider);
    final achievementsState =
        readOnly ? null : ref.watch(achievementsScreenStateProvider);

    return AthleteProfileMainView(
      profile: profile,
      embedded: embedded,
      readOnly: readOnly,
      totalBookings: totalBookings,
      nextBooking: nextBooking,
      gamificationSummary: gamificationSummary,
      badges: badges,
      achievementsState: achievementsState,
      profileCompletion: completion,
      onBack: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(AppRoutes.discover);
        }
      },
      onEdit: onEdit,
      onShare: readOnly ? () {} : () => _shareProfile(context, ref, profile),
      onOpenSettings: readOnly ? null : onOpenSettings,
      showSettingsBadge: !profile.onboardingCompleted,
      onCompleteProfile: () =>
          context.pushNamed(AppRouteNames.athleteCompleteProfile),
      onOpenAgenda: onOpenAgenda,
      onOpenAchievements: readOnly
          ? () {}
          : () => context.pushNamed(AppRouteNames.athleteAchievements),
      onOpenMatchHistory: readOnly
          ? null
          : () => context.pushNamed(AppRouteNames.athleteMatchHistory),
      onOpenPlaysWith: () => _comingSoon(context, 'Parceiros de jogo'),
    );
  }
}

class _PrivateProfileBlockedView extends StatelessWidget {
  const _PrivateProfileBlockedView({required this.embedded});

  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final body = Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.visibility_off_outlined,
              size: 48,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
            ),
            SizedBox(height: 16),
            Text(
              'Este perfil é privado',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'O atleta limitou a visibilidade do perfil.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );

    if (embedded) {
      return ColoredBox(color: context.themeColors.canvas, child: body);
    }
    return body;
  }
}

int _countCompletedBookings(List<MyBookingItem> bookings) {
  return bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;
}

