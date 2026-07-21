/// Comodidades da arena (`arenas/{id}.amenities` no Firestore).
class ArenaAmenities {
  const ArenaAmenities({
    this.parking = false,
    this.lockerRoom = false,
    this.coveredCourt = false,
    this.bar = false,
    this.racketRental = false,
    this.hasAccessibleCourt = false,
    this.hasAccessibleBathroom = false,
    this.hasPcdParking = false,
  });

  final bool parking;
  final bool lockerRoom;
  final bool coveredCourt;
  final bool bar;
  final bool racketRental;
  final bool hasAccessibleCourt;
  final bool hasAccessibleBathroom;
  final bool hasPcdParking;

  static const ArenaAmenities empty = ArenaAmenities();

  bool get hasAny =>
      parking ||
      lockerRoom ||
      coveredCourt ||
      bar ||
      racketRental ||
      hasAccessibleCourt ||
      hasAccessibleBathroom ||
      hasPcdParking;

  /// Requisitos de filtro: cada `true` exige que a arena tenha a comodidade.
  bool matchesRequirements(ArenaAmenities required) {
    if (required.parking && !parking) return false;
    if (required.lockerRoom && !lockerRoom) return false;
    if (required.coveredCourt && !coveredCourt) return false;
    if (required.bar && !bar) return false;
    if (required.racketRental && !racketRental) return false;
    if (required.hasAccessibleCourt && !hasAccessibleCourt) return false;
    if (required.hasAccessibleBathroom && !hasAccessibleBathroom) {
      return false;
    }
    if (required.hasPcdParking && !hasPcdParking) return false;
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
      hasAccessibleCourt: read('hasAccessibleCourt', [
        'quadra_acessivel',
        'accessible_court',
      ]),
      hasAccessibleBathroom: read('hasAccessibleBathroom', [
        'banheiro_acessivel',
        'accessible_bathroom',
      ]),
      hasPcdParking: read('hasPcdParking', [
        'vaga_pcd',
        'pcd_parking',
      ]),
    );
  }

  Map<String, dynamic> toFirestoreMap() => {
        'parking': parking,
        'lockerRoom': lockerRoom,
        'coveredCourt': coveredCourt,
        'bar': bar,
        'racketRental': racketRental,
        'hasAccessibleCourt': hasAccessibleCourt,
        'hasAccessibleBathroom': hasAccessibleBathroom,
        'hasPcdParking': hasPcdParking,
      };

  ArenaAmenities copyWith({
    bool? parking,
    bool? lockerRoom,
    bool? coveredCourt,
    bool? bar,
    bool? racketRental,
    bool? hasAccessibleCourt,
    bool? hasAccessibleBathroom,
    bool? hasPcdParking,
  }) {
    return ArenaAmenities(
      parking: parking ?? this.parking,
      lockerRoom: lockerRoom ?? this.lockerRoom,
      coveredCourt: coveredCourt ?? this.coveredCourt,
      bar: bar ?? this.bar,
      racketRental: racketRental ?? this.racketRental,
      hasAccessibleCourt: hasAccessibleCourt ?? this.hasAccessibleCourt,
      hasAccessibleBathroom:
          hasAccessibleBathroom ?? this.hasAccessibleBathroom,
      hasPcdParking: hasPcdParking ?? this.hasPcdParking,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ArenaAmenities &&
        other.parking == parking &&
        other.lockerRoom == lockerRoom &&
        other.coveredCourt == coveredCourt &&
        other.bar == bar &&
        other.racketRental == racketRental &&
        other.hasAccessibleCourt == hasAccessibleCourt &&
        other.hasAccessibleBathroom == hasAccessibleBathroom &&
        other.hasPcdParking == hasPcdParking;
  }

  @override
  int get hashCode => Object.hash(
        parking,
        lockerRoom,
        coveredCourt,
        bar,
        racketRental,
        hasAccessibleCourt,
        hasAccessibleBathroom,
        hasPcdParking,
      );
}
