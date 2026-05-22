import 'package:geolocator/geolocator.dart';

import 'user_location_snapshot.dart';

/// Obtém coordenadas do dispositivo (quando permitido).
class UserLocationService {
  const UserLocationService();

  Future<UserLocationSnapshot?> tryCurrentPosition({
    Duration timeout = const Duration(seconds: 12),
  }) async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) return null;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: timeout,
        ),
      );
      return UserLocationSnapshot(
        source: UserLocationSource.gps,
        latitude: position.latitude,
        longitude: position.longitude,
      );
    } catch (_) {
      return null;
    }
  }
}
