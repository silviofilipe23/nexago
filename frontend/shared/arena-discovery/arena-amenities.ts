/** Comodidades da arena (`arenas/{id}.amenities` no Firestore). Paridade com `ArenaAmenities` (Flutter). */
export interface ArenaAmenities {
  parking: boolean;
  lockerRoom: boolean;
  coveredCourt: boolean;
  bar: boolean;
  racketRental: boolean;
  hasAccessibleCourt: boolean;
  hasAccessibleBathroom: boolean;
  hasPcdParking: boolean;
}

export const ARENA_AMENITIES_EMPTY: ArenaAmenities = {
  parking: false,
  lockerRoom: false,
  coveredCourt: false,
  bar: false,
  racketRental: false,
  hasAccessibleCourt: false,
  hasAccessibleBathroom: false,
  hasPcdParking: false,
};

export function amenitiesHasAny(a: ArenaAmenities): boolean {
  return (
    a.parking ||
    a.lockerRoom ||
    a.coveredCourt ||
    a.bar ||
    a.racketRental ||
    a.hasAccessibleCourt ||
    a.hasAccessibleBathroom ||
    a.hasPcdParking
  );
}

/** Cada `true` em `required` exige que `actual` também tenha a comodidade. */
export function amenitiesMatchesRequirements(
  actual: ArenaAmenities,
  required: ArenaAmenities,
): boolean {
  if (required.parking && !actual.parking) return false;
  if (required.lockerRoom && !actual.lockerRoom) return false;
  if (required.coveredCourt && !actual.coveredCourt) return false;
  if (required.bar && !actual.bar) return false;
  if (required.racketRental && !actual.racketRental) return false;
  if (required.hasAccessibleCourt && !actual.hasAccessibleCourt) return false;
  if (required.hasAccessibleBathroom && !actual.hasAccessibleBathroom) return false;
  if (required.hasPcdParking && !actual.hasPcdParking) return false;
  return true;
}

function readBool(map: Record<string, unknown>, key: string, aliases: readonly string[]): boolean {
  for (const k of [key, ...aliases]) {
    const v = map[k];
    if (typeof v === 'boolean') return v;
  }
  return false;
}

export function amenitiesFromFirestore(raw: unknown): ArenaAmenities {
  if (raw == null || typeof raw !== 'object') {
    return ARENA_AMENITIES_EMPTY;
  }
  const map = raw as Record<string, unknown>;
  return {
    parking: readBool(map, 'parking', ['estacionamento', 'hasParking']),
    lockerRoom: readBool(map, 'lockerRoom', ['locker_room', 'vestiario', 'vestiário']),
    coveredCourt: readBool(map, 'coveredCourt', ['covered_court', 'coberta', 'indoor', 'covered']),
    bar: readBool(map, 'bar', ['hasBar']),
    racketRental: readBool(map, 'racketRental', ['racket_rental', 'aluguel_raquetes']),
    hasAccessibleCourt: readBool(map, 'hasAccessibleCourt', ['quadra_acessivel', 'accessible_court']),
    hasAccessibleBathroom: readBool(map, 'hasAccessibleBathroom', ['banheiro_acessivel', 'accessible_bathroom']),
    hasPcdParking: readBool(map, 'hasPcdParking', ['vaga_pcd', 'pcd_parking']),
  };
}
