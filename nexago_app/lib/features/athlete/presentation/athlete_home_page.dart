import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_home_featured_logic.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/sand_rank/sand_rank_providers.dart';
import 'widgets/athlete_home/athlete_home_competitions_section.dart';
import 'widgets/athlete_home/athlete_home_daily_missions_section.dart';
import 'widgets/athlete_home/athlete_home_header.dart';
import 'widgets/athlete_home/athlete_home_next_booking_card.dart';
import 'daily_mission_navigation.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/presentation/widgets/my_tournaments_home_section.dart';
import '../../tournaments/presentation/widgets/pending_tournament_inviter_invites_section.dart';

/// Aba Início do atleta (protótipo 01 — Hoje).
class AthleteHomePage extends ConsumerWidget {
  const AthleteHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final summaryAsync = ref.watch(gamificationSummaryProvider);
    final missionsAsync = ref.watch(dailyMissionsProvider);
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    final registrationsAsync = ref.watch(myTournamentRegistrationsProvider);

    return SafeArea(
      top: false,
      bottom: false,
      child: ColoredBox(
        color: context.themeColors.canvas,
        child: NexaAsyncView(
          value: summaryAsync,
          onRetry: () => ref.invalidate(gamificationSummaryProvider),
          skeleton: Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              MediaQuery.paddingOf(context).top,
              AppSpacing.screenH,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                SizedBox(height: AppSpacing.lg),
                NexaSkeleton(width: 160, height: 20),
                SizedBox(height: AppSpacing.lg),
                NexaSkeleton(height: 148, radius: AppRadii.lgAll),
                SizedBox(height: AppSpacing.sectionGap),
                NexaSkeleton(width: 200, height: 16),
                SizedBox(height: AppSpacing.md),
                NexaSkeleton(height: 96, radius: AppRadii.lgAll),
              ],
            ),
          ),
          data: (summary) {
            final bookings = bookingsAsync.valueOrNull ?? [];
            final registrations = registrationsAsync.valueOrNull ?? [];
            final featured = resolveAthleteHomeFeatured(
              registrations: registrations,
              bookings: bookings,
            );
            final name = profile != null
                ? athleteDisplayName(profile)
                : 'Atleta';
            final unreadNotifications = ref.watch(
              athleteUnreadNotificationsCountProvider,
            );
            final bottomClearance =
                nexaBottomNavBarHeight() +
                MediaQuery.viewPaddingOf(context).bottom +
                16;

            return CustomScrollView(
              controller: ref
                  .watch(athleteShellScrollRegistryProvider)
                  .controllerFor(0),
              slivers: [
                NexaFloatingHeaderSliver(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenH,
                  ),
                  child: AthleteHomeHeader(
                    displayName: name,
                    avatarUrl: profile?.avatarUrl,
                    summary: summary,
                    onAvatarTap: () =>
                        context.pushNamed(AppRouteNames.athleteProfile),
                    onXpTap: () =>
                        context.pushNamed(AppRouteNames.athleteQuest),
                    unreadNotificationCount: unreadNotifications,
                    onNotificationsTap: () =>
                        context.pushNamed(AppRouteNames.athleteNotifications),
                    sandRankEnabled:
                        ref.watch(sandRankEnabledProvider).valueOrNull ?? false,
                    sandRankFrameId: ref
                        .watch(sandRankCosmeticsProvider)
                        .valueOrNull
                        ?.frameId,
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.only(bottom: bottomClearance),
                  sliver: SliverList.list(
                    children: [
                      SizedBox(height: AppSpacing.lg),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: AthleteHomeFeaturedCard(
                          featured: featured,
                          onReserveTap: () =>
                              _goToTab(ref, athleteShellReservarTabIndex),
                          onBookingTap: () =>
                              context.pushNamed(AppRouteNames.myBookings),
                          onTournamentTap: () {
                            final tournament = switch (featured) {
                              AthleteHomeFeaturedTournament(
                                :final registration,
                              ) =>
                                registration,
                              _ => null,
                            };
                            final id = tournament?.tournamentId.trim() ?? '';
                            if (id.isEmpty) return;
                            context.pushNamed(
                              AppRouteNames.tournamentDetail,
                              pathParameters: {'tournamentId': id},
                            );
                          },
                        ),
                      ),
                      SizedBox(height: AppSpacing.sectionGap),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: PendingTournamentInviterInvitesSection(),
                      ),
                      SizedBox(height: AppSpacing.sectionGap),
                      const AthleteHomeCompetitionsSection(),
                      SizedBox(height: AppSpacing.sectionGap),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: MyTournamentsHomeSection(),
                      ),
                      SizedBox(height: AppSpacing.sectionGap),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: AthleteHomeDailyMissionsSection(
                          missions: missionsAsync.valueOrNull,
                          onViewAll: () =>
                              context.pushNamed(AppRouteNames.athleteQuest),
                          onMissionTap: (mission) =>
                              navigateForDailyMission(context, ref, mission),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  void _goToTab(WidgetRef ref, int index) {
    ref.read(athleteShellTabIndexProvider.notifier).state = index;
  }
}
