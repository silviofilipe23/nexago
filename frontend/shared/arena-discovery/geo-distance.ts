/** Distância em linha reta entre duas coordenadas (km), fórmula de Haversine. Paridade com `haversineDistanceKm` (Flutter). */
export function haversineDistanceKm(params: {
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
}): number {
  const earthRadiusKm = 6371.0;
  const dLat = toRadians(params.lat2 - params.lat1);
  const dLon = toRadians(params.lon2 - params.lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(params.lat1)) *
      Math.cos(toRadians(params.lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export interface UserCoords {
  latitude: number;
  longitude: number;
}

export function kmFromUserToArena(
  arena: { lat: number | null; lng: number | null },
  user: UserCoords | null,
): number | null {
  if (!user || arena.lat == null || arena.lng == null) {
    return null;
  }
  return haversineDistanceKm({
    lat1: user.latitude,
    lon1: user.longitude,
    lat2: arena.lat,
    lon2: arena.lng,
  });
}
