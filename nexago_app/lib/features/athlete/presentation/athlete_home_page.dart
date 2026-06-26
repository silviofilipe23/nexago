import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_home_featured_logic.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/gamification_providers.dart';
import 'widgets/athlete_home/athlete_home_competitions_section.dart';
import 'widgets/athlete_home/athlete_home_daily_missions_section.dart';
import 'widgets/athlete_home/athlete_home_header.dart';
import 'widgets/athlete_home/athlete_home_next_booking_card.dart';
import 'widgets/athlete_home/athlete_home_quick_actions.dart';
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
        child: summaryAsync.when(
          loading: () => Padding(
            padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
          error: (_, __) => _ErrorState(),
          data: (summary) {
            final bookings = bookingsAsync.valueOrNull ?? [];
            final registrations = registrationsAsync.valueOrNull ?? [];
            final featured = resolveAthleteHomeFeatured(
              registrations: registrations,
              bookings: bookings,
            );
            final name =
                profile != null ? athleteDisplayName(profile) : 'Atleta';
            final unreadNotifications = ref.watch(
              athleteUnreadNotificationsCountProvider,
            );

            return CustomScrollView(
              controller: ref
                  .watch(athleteShellScrollRegistryProvider)
                  .controllerFor(0),
              slivers: [
                NexaFloatingHeaderSliver(
                  padding: const EdgeInsets.symmetric(
                    horizontal: athleteHomeHorizontalPadding,
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
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.only(bottom: 28),
                  sliver: SliverList.list(
                    children: [
                      SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: athleteHomeHorizontalPadding,
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
                                :final registration
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
                      // SizedBox(height: 8),
                      // AthleteHomeQuickActions(
                      //   actions: [
                      //     AthleteHomeQuickAction(
                      //       icon: Icons.add_rounded,
                      //       label: 'Reservar',
                      //       onTap: () => _goToTab(ref, athleteShellReservarTabIndex),
                      //       highlighted: true,
                      //     ),
                      //     AthleteHomeQuickAction(
                      //       icon: Icons.person_add_outlined,
                      //       label: 'Convidar',
                      //       onTap: () => openInviteFromHome(context, ref),
                      //     ),
                      //     AthleteHomeQuickAction(
                      //       icon: Icons.emoji_events_outlined,
                      //       label: 'Torneios',
                      //       onTap: () => _goToTab(ref, athleteShellCompeteTabIndex),
                      //     ),
                      //     // AthleteHomeQuickAction(
                      //     //   icon: Icons.sports_tennis_rounded,
                      //     //   label: 'Play Match',
                      //     //   onTap: () => showAppSnackBar(context, 'Em breve.'),
                      //     // ),
                      //   ],
                      // ),
                      SizedBox(height: 8),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: athleteHomeHorizontalPadding,
                        ),
                        child: PendingTournamentInviterInvitesSection(),
                      ),
                      SizedBox(height: 8),
                      const AthleteHomeCompetitionsSection(),
                      SizedBox(height: 8),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: athleteHomeHorizontalPadding,
                        ),
                        child: MyTournamentsHomeSection(),
                      ),
                      SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: athleteHomeHorizontalPadding,
                        ),
                        child: AthleteHomeDailyMissionsSection(
                          missions: missionsAsync.valueOrNull,
                          onViewAll: () =>
                              context.pushNamed(AppRouteNames.athleteQuest),
                          onMissionTap: (mission) =>
                              navigateForDailyMission(context, ref, mission),
                        ),
                      ),
                      // SizedBox(height: 24),
                      // AthleteHomeSlotsSection(
                      //   slots: mockAthleteHomeSlots(),
                      //   onViewAll: () => _goToTab(ref, athleteShellReservarTabIndex),
                      // ),
                      // SizedBox(height: 24),
                      // AthleteHomePlaysWithSection(
                      //   partners: mockAthleteHomePlayPartners(),
                      //   onInvite: () => showAppSnackBar(context, 'Em breve.'),
                      //   onPartnerAction: (_) => showAppSnackBar(context, 'Em breve.'),
                      // ),
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

class _ErrorState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Não foi possível carregar sua evolução.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
