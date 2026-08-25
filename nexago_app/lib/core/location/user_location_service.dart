import 'package:geolocator/geolocator.dart';

import 'location_permission_status.dart';
import 'user_location_snapshot.dart';

/// Obtém coordenadas do dispositivo (quando permitido).
///
/// Pedir a permissão e usar a permissão são coisas separadas aqui de propósito.
/// O diálogo do sistema interrompe o atleta, então ele tem que nascer de uma
/// tela onde a localização é o assunto — nunca de um provider resolvendo no
/// boot, atrás de uma tela que não tem nada a ver com isso.
class UserLocationService {
  const UserLocationService();

  /// Como está a permissão agora, sem pedir nada ao atleta.
  Future<LocationPermissionStatus> checkStatus() async {
    return resolveLocationPermissionStatus(
      serviceEnabled: await Geolocator.isLocationServiceEnabled(),
      permission: await Geolocator.checkPermission(),
    );
  }

  /// Pede a permissão quando ainda dá para pedir, e devolve o que ficou.
  ///
  /// Quem chama é a tela, ao ser aberta. Nos casos em que o sistema não mostra
  /// mais o diálogo, sai calado com o estado atual — cabe à tela oferecer o
  /// caminho dos Ajustes.
  Future<LocationPermissionStatus> ensurePermission() async {
    final status = await checkStatus();
    if (!shouldRequestLocationPermission(status)) return status;

    await Geolocator.requestPermission();
    return checkStatus();
  }

  /// Coordenadas do aparelho — só com a permissão JÁ concedida.
  ///
  /// Não pede nada: quem pede é [ensurePermission]. Sem essa separação, todo
  /// provider que quisesse ordenar arenas por distância disparava o diálogo do
  /// sistema como efeito colateral.
  Future<UserLocationSnapshot?> tryCurrentPosition({
    Duration timeout = const Duration(seconds: 12),
  }) async {
    if (await checkStatus() != LocationPermissionStatus.granted) return null;

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

  /// Abre os Ajustes para o atleta desfazer o que só de lá se desfaz.
  Future<void> openSettings({required bool app}) async {
    if (app) {
      await Geolocator.openAppSettings();
      return;
    }
    await Geolocator.openLocationSettings();
  }
}
