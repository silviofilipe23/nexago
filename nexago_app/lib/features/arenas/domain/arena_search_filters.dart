import 'package:flutter/material.dart';

import 'arena_amenities.dart';

/// Parâmetros que disparam nova busca de slots no Firestore.
@immutable
class ArenaSearchSlotFilters {
  const ArenaSearchSlotFilters({
    required this.date,
    required this.requestedTime,
    this.flexibleTime = false,
  });

  final DateTime date;
  final TimeOfDay requestedTime;
  final bool flexibleTime;

  int get requestedMinutes => requestedTime.hour * 60 + requestedTime.minute;

  DateTime get dateOnly => DateTime(date.year, date.month, date.day);

  String get requestedTimeLabel {
    final hh = requestedTime.hour.toString().padLeft(2, '0');
    final mm = requestedTime.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ArenaSearchSlotFilters &&
        other.dateOnly == dateOnly &&
        other.requestedMinutes == requestedMinutes &&
        other.flexibleTime == flexibleTime;
  }

  @override
  int get hashCode => Object.hash(dateOnly, requestedMinutes, flexibleTime);
}

enum ArenaSportChip {
  all,
  beachTennis,
  tennis,
  padel,
  beachVolleyball,
  volleyball,
  football,
}

enum ArenaPriceBand { any, upTo60, band60_100, band100_150, plus150 }

enum ArenaPaymentFilter { any, pix, onsite, card }

enum ArenaSearchSortBy { distance, price, rating, score }

/// Estado completo da busca (UI + filtros client-side).
@immutable
class ArenaSearchFilters {
  const ArenaSearchFilters({
    required this.slot,
    this.query = '',
    this.sportChip = ArenaSportChip.all,
    this.radiusKm = defaultRadiusKm,
    this.priceBand = ArenaPriceBand.any,
    this.surfaces = const {},
    this.requiredAmenities = ArenaAmenities.empty,
    this.paymentMethods = const {},
    this.minReputationScore = 0,
    this.sortBy = ArenaSearchSortBy.distance,
    this.showOnlyFavorites = false,
  });

  final ArenaSearchSlotFilters slot;
  final String query;
  final ArenaSportChip sportChip;
  final double radiusKm;
  final ArenaPriceBand priceBand;
  final Set<String> surfaces;
  final ArenaAmenities requiredAmenities;
  /// Vazio = qualquer forma de pagamento. Valores: [pix], [onsite], [card].
  final Set<ArenaPaymentFilter> paymentMethods;
  final int minReputationScore;
  final ArenaSearchSortBy sortBy;
  final bool showOnlyFavorites;

  factory ArenaSearchFilters.defaults({DateTime? date, TimeOfDay? time}) {
    final now = DateTime.now();
    final d = date ?? DateTime(now.year, now.month, now.day);
    final t =
        time ?? TimeOfDay(hour: now.hour, minute: now.minute >= 30 ? 30 : 0);
    return ArenaSearchFilters(
      slot: ArenaSearchSlotFilters(date: d, requestedTime: t),
      sportChip: defaultSportChip,
      radiusKm: defaultRadiusKm,
    );
  }

  ArenaSearchFilters copyWith({
    ArenaSearchSlotFilters? slot,
    String? query,
    ArenaSportChip? sportChip,
    double? radiusKm,
    ArenaPriceBand? priceBand,
    Set<String>? surfaces,
    ArenaAmenities? requiredAmenities,
    Set<ArenaPaymentFilter>? paymentMethods,
    int? minReputationScore,
    ArenaSearchSortBy? sortBy,
    bool? showOnlyFavorites,
  }) {
    return ArenaSearchFilters(
      slot: slot ?? this.slot,
      query: query ?? this.query,
      sportChip: sportChip ?? this.sportChip,
      radiusKm: radiusKm ?? this.radiusKm,
      priceBand: priceBand ?? this.priceBand,
      surfaces: surfaces ?? this.surfaces,
      requiredAmenities: requiredAmenities ?? this.requiredAmenities,
      paymentMethods: paymentMethods ?? this.paymentMethods,
      minReputationScore: minReputationScore ?? this.minReputationScore,
      sortBy: sortBy ?? this.sortBy,
      showOnlyFavorites: showOnlyFavorites ?? this.showOnlyFavorites,
    );
  }

  static const double defaultRadiusKm = 30;
  static const double maxRadiusKm = 30;

  /// Acima disso o filtro de distância não é aplicado ("Ver todas").
  static const double unlimitedRadiusKm = 9999;

  static const ArenaSportChip defaultSportChip = ArenaSportChip.beachVolleyball;

  bool get usesRadiusLimit => radiusKm <= maxRadiusKm;

  /// Remove filtros client-side; mantém data/hora da busca.
  factory ArenaSearchFilters.showAll({required ArenaSearchSlotFilters slot}) {
    return ArenaSearchFilters(
      slot: slot,
      sportChip: ArenaSportChip.all,
      radiusKm: unlimitedRadiusKm,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ArenaSearchFilters &&
        other.slot == slot &&
        other.query == query &&
        other.sportChip == sportChip &&
        other.radiusKm == radiusKm &&
        other.priceBand == priceBand &&
        _setEquals(other.surfaces, surfaces) &&
        other.requiredAmenities == requiredAmenities &&
        _setEquals(other.paymentMethods, paymentMethods) &&
        other.minReputationScore == minReputationScore &&
        other.sortBy == sortBy &&
        other.showOnlyFavorites == showOnlyFavorites;
  }

  @override
  int get hashCode => Object.hash(
    slot,
    query,
    sportChip,
    radiusKm,
    priceBand,
    Object.hashAll(surfaces),
    requiredAmenities,
    Object.hashAll(paymentMethods),
    minReputationScore,
    sortBy,
    showOnlyFavorites,
  );
}

bool _setEquals<T>(Set<T> a, Set<T> b) {
  if (a.length != b.length) return false;
  for (final e in a) {
    if (!b.contains(e)) return false;
  }
  return true;
}

/// Compat: filtros antigos só com data/hora.
ArenaSearchSlotFilters legacySlotFiltersFrom({
  required DateTime date,
  required TimeOfDay requestedTime,
}) {
  return ArenaSearchSlotFilters(date: date, requestedTime: requestedTime);
}
