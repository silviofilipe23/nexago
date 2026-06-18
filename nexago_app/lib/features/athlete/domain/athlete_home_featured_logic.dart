import '../../arenas/domain/my_booking_item.dart';
import '../../tournaments/domain/my_tournaments_logic.dart';
import '../../tournaments/domain/tournament_discovery_models.dart';
import '../../tournaments/domain/tournament_listing_status.dart';
import 'athlete_booking_helpers.dart';

/// Conteúdo em destaque na Home do atleta (torneio ou reserva).
sealed class AthleteHomeFeatured {
  const AthleteHomeFeatured();
}

class AthleteHomeFeaturedTournament extends AthleteHomeFeatured {
  const AthleteHomeFeaturedTournament(this.registration);

  final MyTournamentRegistration registration;
}

class AthleteHomeFeaturedBooking extends AthleteHomeFeatured {
  const AthleteHomeFeaturedBooking(this.booking);

  final MyBookingItem booking;
}

/// Escolhe torneio ou reserva que acontece mais cedo a partir de [now].
AthleteHomeFeatured? resolveAthleteHomeFeatured({
  required List<MyTournamentRegistration> registrations,
  required List<MyBookingItem> bookings,
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();

  MyTournamentRegistration? bestTournament;
  DateTime? bestTournamentInstant;

  for (final registration in registrations) {
    final instant = tournamentFeaturedInstant(registration, now: clock);
    if (instant == null) continue;
    if (bestTournamentInstant == null ||
        instant.isBefore(bestTournamentInstant)) {
      bestTournamentInstant = instant;
      bestTournament = registration;
    }
  }

  final nextBooking = findNextAthleteBooking(bookings, now: clock);
  final bookingInstant =
      nextBooking != null ? parseBookingStart(nextBooking) : null;

  if (bestTournament == null && bookingInstant == null) return null;
  if (bestTournament == null) {
    return AthleteHomeFeaturedBooking(nextBooking!);
  }
  if (bookingInstant == null ||
      bookingInstant.isAfter(bestTournamentInstant!)) {
    return AthleteHomeFeaturedTournament(bestTournament);
  }
  return AthleteHomeFeaturedBooking(nextBooking!);
}

/// Instante de referência do torneio para ordenação (ativo hoje → agora).
DateTime? tournamentFeaturedInstant(
  MyTournamentRegistration registration, {
  required DateTime now,
}) {
  final status = registration.listingStatus;
  if (status != null && isTournamentTerminal(status)) return null;

  final start = registration.startDate;
  if (start == null) return null;

  if (start.isAfter(now)) {
    return start;
  }

  if (registrationShowsAsLiveToday(registration)) {
    return now;
  }

  return null;
}
