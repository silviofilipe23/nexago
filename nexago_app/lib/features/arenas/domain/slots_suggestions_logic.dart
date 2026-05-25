import 'package:intl/intl.dart';

import '../../../core/location/user_location_snapshot.dart';
import 'arena_search_providers.dart';
import 'nearby_arenas_logic.dart';
import 'slots_page_logic.dart';
import 'slots_page_providers.dart';
import 'slots_suggestion_models.dart';

/// Título do banner de lotação (ex. `Sábado lotou.`).
String weekdayLotouLabel(DateTime day) {
  final raw = DateFormat('EEEE', 'pt_BR').format(day);
  if (raw.isEmpty) return 'Este dia lotou.';
  final label = raw[0].toUpperCase() + raw.substring(1);
  return '$label lotou.';
}

/// Subtítulo do banner quando o dia está lotado.
String fullyBookedBannerSubtitle({
  required String courtName,
  required int alternativeCount,
}) {
  if (alternativeCount <= 0) {
    return 'A $courtName não tem horários abertos neste dia.';
  }
  final alt = alternativeCount == 1 ? '1 alternativa' : '$alternativeCount alternativas';
  return 'A $courtName não tem horários abertos neste dia. '
      'Mas tem $alt a um toque.';
}

/// Subtítulo quando não há grade no Firestore.
String noScheduleBannerSubtitle(String courtName) {
  return 'Não há horários cadastrados para $courtName neste dia. '
      'Escolha outra data ou quadra.';
}

SlotsCourtSummary? pickAlternateCourtSummary({
  required List<SlotsCourtSummary> summaries,
  required String selectedCourtId,
}) {
  final candidates = summaries
      .where(
        (s) =>
            s.court.id != selectedCourtId &&
            s.hasFreeSlots &&
            !s.court.isMaintenance,
      )
      .toList(growable: false);
  if (candidates.isEmpty) return null;
  candidates.sort((a, b) => b.freeSlotsCount.compareTo(a.freeSlotsCount));
  return candidates.first;
}

DateTime? pickNextAvailableDayAfter({
  required List<SlotsCalendarDayStatus> calendar,
  required DateTime selectedDay,
}) {
  final anchor = slotDayOnly(selectedDay);
  for (final status in calendar) {
    final d = slotDayOnly(status.date);
    if (!d.isAfter(anchor)) continue;
    if (status.availability.hasAnyFree) return d;
  }
  return null;
}

String formatSuggestionDayLabel(DateTime day) {
  final raw = DateFormat('EEE, d MMM', 'pt_BR').format(day);
  if (raw.isEmpty) return '';
  return raw[0].toUpperCase() + raw.substring(1);
}

String formatWeekdayShort(DateTime day) {
  final raw = DateFormat('EEEE', 'pt_BR').format(day).toLowerCase();
  if (raw.isEmpty) return '';
  return raw;
}

List<RankedArenaSearchResult> rankNearbyArenaSuggestions({
  required List<ArenaSearchResult> results,
  required String excludeArenaId,
  required UserLocationSnapshot user,
  int limit = 3,
}) {
  final available = results
      .where(
        (r) =>
            r.arena.id != excludeArenaId &&
            r.hasAvailability &&
            r.selectedSlot != null,
      )
      .toList(growable: false);
  final ranked = rankAvailableArenasByProximity(
    available: available,
    user: user,
  );
  if (ranked.length <= limit) return ranked;
  return ranked.sublist(0, limit);
}

int countSuggestionAlternatives({
  SlotsCourtSummary? alternateCourt,
  DateTime? nextDay,
  int nearbyCount = 0,
}) {
  var n = 0;
  if (alternateCourt != null) n++;
  if (nextDay != null) n++;
  n += nearbyCount;
  return n;
}

List<SlotsSuggestion> mergeSmartSuggestions({
  SlotsSuggestion? alternateCourt,
  SlotsSuggestion? nextDay,
  List<SlotsSuggestion> nearby = const [],
}) {
  final out = <SlotsSuggestion>[];
  if (alternateCourt != null) out.add(alternateCourt);
  if (nextDay != null) out.add(nextDay);
  out.addAll(nearby);
  return out;
}
