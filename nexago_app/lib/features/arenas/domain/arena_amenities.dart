/// Comodidades da arena (`arenas/{id}.amenities` no Firestore).
class ArenaAmenities {
  const ArenaAmenities({
    this.parking = false,
    this.lockerRoom = false,
    this.coveredCourt = false,
    this.bar = false,
    this.racketRental = false,
  });

  final bool parking;
  final bool lockerRoom;
  final bool coveredCourt;
  final bool bar;
  final bool racketRental;

  static const ArenaAmenities empty = ArenaAmenities();

  bool get hasAny =>
      parking || lockerRoom || coveredCourt || bar || racketRental;

  /// Requisitos de filtro: cada `true` exige que a arena tenha a comodidade.
  bool matchesRequirements(ArenaAmenities required) {
    if (required.parking && !parking) return false;
    if (required.lockerRoom && !lockerRoom) return false;
    if (required.coveredCourt && !coveredCourt) return false;
    if (required.bar && !bar) return false;
    if (required.racketRental && !racketRental) return false;
    return true;
  }

  factory ArenaAmenities.fromMap(Map<String, dynamic>? map) {
    if (map == null || map.isEmpty) return empty;

    bool read(String key, List<String> aliases) {
      for (final k in [key, ...aliases]) {
        final v = map[k];
        if (v is bool) return v;
      }
      return false;
    }

    return ArenaAmenities(
      parking: read('parking', ['estacionamento', 'hasParking']),
      lockerRoom: read('lockerRoom', ['locker_room', 'vestiario', 'vestiário']),
      coveredCourt: read('coveredCourt', [
        'covered_court',
        'coberta',
        'indoor',
        'covered',
      ]),
      bar: read('bar', ['hasBar']),
      racketRental: read('racketRental', [
        'racket_rental',
        'aluguel_raquetes',
        'racketRental',
      ]),
    );
  }

  Map<String, dynamic> toFirestoreMap() => {
        'parking': parking,
        'lockerRoom': lockerRoom,
        'coveredCourt': coveredCourt,
        'bar': bar,
        'racketRental': racketRental,
      };

  ArenaAmenities copyWith({
    bool? parking,
    bool? lockerRoom,
    bool? coveredCourt,
    bool? bar,
    bool? racketRental,
  }) {
    return ArenaAmenities(
      parking: parking ?? this.parking,
      lockerRoom: lockerRoom ?? this.lockerRoom,
      coveredCourt: coveredCourt ?? this.coveredCourt,
      bar: bar ?? this.bar,
      racketRental: racketRental ?? this.racketRental,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ArenaAmenities &&
        other.parking == parking &&
        other.lockerRoom == lockerRoom &&
        other.coveredCourt == coveredCourt &&
        other.bar == bar &&
        other.racketRental == racketRental;
  }

  @override
  int get hashCode => Object.hash(
        parking,
        lockerRoom,
        coveredCourt,
        bar,
        racketRental,
      );
}
