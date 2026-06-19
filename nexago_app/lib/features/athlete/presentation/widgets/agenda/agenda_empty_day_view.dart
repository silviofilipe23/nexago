import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../arenas/domain/arena_search_providers.dart';
import '../../../../arenas/presentation/arena_booking_navigation.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import 'agenda_empty_day_hero.dart';
import 'agenda_empty_rest_card.dart';

class AgendaEmptyDayView extends ConsumerWidget {
  const AgendaEmptyDayView({
    super.key,
    required this.selectedDay,
    required this.onDropInTap,
    required this.onRestDayTap,
  });

  final DateTime selectedDay;
  final VoidCallback onDropInTap;
  final VoidCallback onRestDayTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final nearbyAsync = ref.watch(myBookingsNearbyTodayProvider);
    final snapshot = nearbyAsync.valueOrNull;
    final nearbyCount = snapshot?.totalAvailableToday ?? 0;
    final proximityPhrase = snapshot?.proximityPhrase ?? 'perto de você';
    final dayLabel = formatAgendaEmptyDayLabel(selectedDay, now: now);
    final description =
        formatAgendaEmptyHeroDescription(nearbyCount, proximityPhrase);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AgendaEmptyDayHero(
            dayLabel: dayLabel,
            description: description,
            onReserveTap: () => openDiscoverReservarTab(context, ref: ref),
            onDropInTap: onDropInTap,
          ),
          const SizedBox(height: 20),
          AgendaEmptyRestCard(onTap: onRestDayTap),
        ],
      ),
    );
  }
}
