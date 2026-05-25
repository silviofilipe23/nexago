import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../data/mock_athlete_home_data.dart';
import '../domain/athlete_booking_helpers.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/gamification_providers.dart';
import 'widgets/athlete_home/athlete_home_daily_missions_section.dart';
import 'widgets/athlete_home/athlete_home_header.dart';
import 'widgets/athlete_home/athlete_home_next_booking_card.dart';
import 'widgets/athlete_home/athlete_home_plays_with_section.dart';
import 'widgets/athlete_home/athlete_home_quick_actions.dart';
import 'daily_mission_navigation.dart';
import 'widgets/athlete_home/athlete_home_slots_section.dart';
import '../../tournaments/presentation/widgets/my_tournaments_home_section.dart';

/// Aba Início do atleta (protótipo 01 — Hoje).
class AthleteHomePage extends ConsumerWidget {
  const AthleteHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final summaryAsync = ref.watch(gamificationSummaryProvider);
    final missionsAsync = ref.watch(dailyMissionsProvider);
    final bookingsAsync = ref.watch(myBookingsStreamProvider);

    return SafeArea(
      bottom: false,
      child: ColoredBox(
        color: AppColors.canvas,
        child: summaryAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
          error: (_, _) => _ErrorState(),
          data: (summary) {
          final bookings = bookingsAsync.valueOrNull ?? [];
          final nextBooking = findNextAthleteBooking(bookings);
          final name = profile?.name.trim().isNotEmpty == true
              ? profile!.name.trim()
              : 'Atleta';

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            children: [
              AthleteHomeHeader(
                displayName: name,
                summary: summary,
                onAvatarTap: () => _goToTab(ref, 4),
                onXpTap: () =>
                    context.pushNamed(AppRouteNames.athleteQuest),
              ),
              const SizedBox(height: 20),
              AthleteHomeNextBookingCard(
                booking: nextBooking,
                onReserveTap: () => _goToTab(ref, athleteShellReservarTabIndex),
                onBookingTap: nextBooking != null
                    ? () => context.pushNamed(AppRouteNames.myBookings)
                    : null,
              ),
              const SizedBox(height: 16),
              AthleteHomeQuickActions(
                actions: [
                  AthleteHomeQuickAction(
                    icon: Icons.add_rounded,
                    label: 'Reservar',
                    onTap: () => _goToTab(ref, athleteShellReservarTabIndex),
                    highlighted: true,
                  ),
                  AthleteHomeQuickAction(
                    icon: Icons.person_add_outlined,
                    label: 'Convidar',
                    onTap: () => openInviteFromHome(context, ref),
                  ),
                  AthleteHomeQuickAction(
                    icon: Icons.emoji_events_outlined,
                    label: 'Torneios',
                    onTap: () => _goToTab(ref, athleteShellCompeteTabIndex),
                  ),
                  AthleteHomeQuickAction(
                    icon: Icons.sports_tennis_rounded,
                    label: 'Drop-in',
                    onTap: () => showAppSnackBar(context, 'Em breve.'),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              AthleteHomeDailyMissionsSection(
                missions: missionsAsync.valueOrNull,
                onViewAll: () => context.pushNamed(AppRouteNames.athleteQuest),
                onMissionTap: (mission) =>
                    navigateForDailyMission(context, ref, mission),
              ),
              const SizedBox(height: 24),
              AthleteHomeSlotsSection(
                slots: mockAthleteHomeSlots(),
                onViewAll: () => _goToTab(ref, athleteShellReservarTabIndex),
              ),
              const SizedBox(height: 24),
              const MyTournamentsHomeSection(),
              const SizedBox(height: 24),
              AthleteHomePlaysWithSection(
                partners: mockAthleteHomePlayPartners(),
                onInvite: () => showAppSnackBar(context, 'Em breve.'),
                onPartnerAction: (_) =>
                    showAppSnackBar(context, 'Em breve.'),
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
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
