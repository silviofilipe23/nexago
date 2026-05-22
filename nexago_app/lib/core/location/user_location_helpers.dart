import '../../features/athlete/domain/athlete_profile.dart';
import 'br_locations_data.dart';
import 'user_location_snapshot.dart';

/// Cidade e UF normalizados a partir do perfil do atleta (campos separados ou legado).
({String city, String state}) resolveAthletePlace(AthleteProfile? profile) {
  if (profile == null) return (city: '', state: '');

  var city = profile.city.trim();
  var state = BrLocationsData.resolveStateSigla(profile.state);

  if (city.isNotEmpty) {
    final parsed = BrLocationsData.parseLegacyLocation(city);
    if (parsed.city.isNotEmpty &&
        (city.contains('·') || city.contains(',') || state.isEmpty)) {
      city = parsed.city;
    }
    if (state.isEmpty && parsed.state.isNotEmpty) {
      state = BrLocationsData.resolveStateSigla(parsed.state);
    }
  }

  return (city: city, state: state);
}

/// Mescla cidade/UF do perfil no snapshot (útil quando há GPS do simulador).
UserLocationSnapshot mergeAthletePlaceIntoSnapshot(
  UserLocationSnapshot base,
  AthleteProfile? profile,
) {
  final place = resolveAthletePlace(profile);
  if (place.city.isEmpty && place.state.isEmpty) return base;
  return UserLocationSnapshot(
    source: base.source,
    latitude: base.latitude,
    longitude: base.longitude,
    city: place.city,
    state: place.state,
  );
}
