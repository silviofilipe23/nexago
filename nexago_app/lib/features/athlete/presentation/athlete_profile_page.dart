import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/navigation_helpers.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_skeleton.dart';
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
import 'widgets/gamification_feedback_sheet.dart';

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
      return NexaAsyncView<AthleteProfile?>(
        value: profileAsync,
        skeleton: const _AthleteProfileLoadingSkeleton(),
        errorTitle: 'Não foi possível carregar o perfil',
        onRetry: () => ref.invalidate(athleteProfileProvider),
        data: (doc) {
          final profile = doc ?? AthleteProfile.draft(user);
          return NexaAsyncView<List<MyBookingItem>>(
            value: bookingsAsync,
            skeleton: const _AthleteProfileLoadingSkeleton(),
            errorTitle: 'Não foi possível carregar reservas',
            onRetry: () => ref.invalidate(myBookingsStreamProvider),
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
          );
        },
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

  Future<void> _shareProfile(
    BuildContext context,
    WidgetRef ref,
    AthleteProfile profile,
  ) async {
    final name = athleteDisplayName(profile);
    final sport = profile.sport.trim().isNotEmpty ? profile.sport.trim() : 'esporte';
    await nexaShareText(
      context,
      'Confira meu perfil no NexaGO: $name — $sport',
    );
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    try {
      final feedback =
          await ref.read(gamificationServiceProvider).onProfileShared(userId: uid);
      ref.invalidate(achievementsScreenStateProvider);
      ref.invalidate(gamificationBadgesProvider);
      ref.invalidate(gamificationSummaryProvider);
      if (feedback != null && feedback.xpGained > 0 && context.mounted) {
        await showGamificationFeedbackSheet(context, feedback: feedback);
      }
    } catch (_) {
      // Nao bloqueia o compartilhamento quando a gamificacao falhar.
    }
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
      onBack: () => popOrGo(context, AppRoutes.discover),
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
      onOpenPartner: (userId) => context.pushNamed(
        AppRouteNames.athleteProfile,
        queryParameters: {'userId': userId},
      ),
    );
  }
}

int _countCompletedBookings(List<MyBookingItem> bookings) {
  return bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;
}

/// Skeleton de loading do perfil: avatar + linhas de nome + grid 2×2.
class _AthleteProfileLoadingSkeleton extends StatelessWidget {
  const _AthleteProfileLoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.xxl,
          AppSpacing.screenH,
          AppSpacing.screenH,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const NexaSkeleton.circle(size: 84),
                const SizedBox(width: AppSpacing.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      SizedBox(height: AppSpacing.xs),
                      NexaSkeleton(width: 160, height: 20),
                      SizedBox(height: AppSpacing.sm),
                      NexaSkeleton(width: 110, height: 14),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sectionGap),
            Row(
              children: [
                Expanded(
                  child: NexaSkeleton(height: 72, radius: AppRadii.mdAll),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: NexaSkeleton(height: 72, radius: AppRadii.mdAll),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: NexaSkeleton(height: 72, radius: AppRadii.mdAll),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: NexaSkeleton(height: 72, radius: AppRadii.mdAll),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

