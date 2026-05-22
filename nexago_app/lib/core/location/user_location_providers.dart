import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/athlete/domain/athlete_profile_providers.dart';
import 'user_location_helpers.dart';
import 'user_location_service.dart';
import 'user_location_snapshot.dart';

final userLocationServiceProvider = Provider<UserLocationService>(
  (ref) => const UserLocationService(),
);

/// Localização para arenas próximas: prioriza cidade/UF do perfil; GPS só ordena.
final userLocationProvider =
    FutureProvider.autoDispose<UserLocationSnapshot>((ref) async {
  ref.watch(athleteProfileProvider);
  final profile = await ref.watch(athleteProfileProvider.future);
  final place = resolveAthletePlace(profile);
  final gps = await ref.read(userLocationServiceProvider).tryCurrentPosition();

  if (place.city.isNotEmpty || place.state.isNotEmpty) {
    return UserLocationSnapshot(
      source: UserLocationSource.profile,
      latitude: gps?.latitude,
      longitude: gps?.longitude,
      city: place.city,
      state: place.state,
    );
  }

  if (gps != null && gps.hasCoordinates) {
    return gps;
  }

  return const UserLocationSnapshot(source: UserLocationSource.none);
});
