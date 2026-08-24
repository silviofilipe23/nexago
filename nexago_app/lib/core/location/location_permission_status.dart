import 'package:geolocator/geolocator.dart';

/// O que separa o app das coordenadas do aparelho.
enum LocationPermissionStatus {
  /// Dá para ler a posição agora.
  granted,

  /// Falta pedir — o sistema ainda mostra o diálogo.
  denied,

  /// O sistema não mostra mais o diálogo. Só os Ajustes do app resolvem.
  deniedForever,

  /// A localização do aparelho está desligada, para todos os apps.
  serviceDisabled,
}

/// Traduz o par (serviço ligado?, permissão) do Geolocator.
///
/// Cuidado com o iOS: "ainda não perguntei" e "o atleta recusou" chegam aqui
/// como [LocationPermission.denied] e [LocationPermission.deniedForever] —
/// o mapeamento nativo manda `notDetermined` para o primeiro índice e `denied`
/// para o segundo. Na prática é o que queremos: no iOS a recusa já cai direto
/// no caso que só os Ajustes resolvem, sem um segundo diálogo que não viria.
///
/// A ordem das perguntas importa. A recusa definitiva vem antes do serviço
/// desligado porque ligar o GPS não devolve a permissão; e o serviço desligado
/// vem antes do pedido pendente porque pedir com o GPS desligado só adia a
/// falha para a hora de ler a posição.
LocationPermissionStatus resolveLocationPermissionStatus({
  required bool serviceEnabled,
  required LocationPermission permission,
}) {
  if (permission == LocationPermission.deniedForever) {
    return LocationPermissionStatus.deniedForever;
  }
  if (!serviceEnabled) return LocationPermissionStatus.serviceDisabled;

  final granted = permission == LocationPermission.whileInUse ||
      permission == LocationPermission.always;
  return granted
      ? LocationPermissionStatus.granted
      : LocationPermissionStatus.denied;
}

/// Se vale disparar o diálogo do sistema.
///
/// Só quando ele realmente aparece. Chamar `requestPermission` nos outros casos
/// devolve o mesmo estado na hora, sem nada na tela — o atleta ficaria olhando
/// para um mapa que não se move e sem entender por quê.
bool shouldRequestLocationPermission(LocationPermissionStatus status) {
  return status == LocationPermissionStatus.denied;
}

/// O aviso que a tela mostra quando não há mais diálogo para pedir.
class LocationSettingsNudge {
  const LocationSettingsNudge({
    required this.message,
    required this.opensAppSettings,
  });

  final String message;

  /// `true` abre os Ajustes do nexaGO (falta a permissão); `false`, os de
  /// localização do aparelho (o GPS está desligado para todo mundo).
  final bool opensAppSettings;
}

/// Devolve nulo quando não há o que avisar: ou já está concedida, ou o diálogo
/// do sistema ainda vai aparecer — e mandar para os Ajustes quem só precisa
/// tocar em "Permitir" é empurrar o atleta para o caminho mais longo.
LocationSettingsNudge? locationSettingsNudgeFor(
  LocationPermissionStatus status,
) {
  return switch (status) {
    LocationPermissionStatus.deniedForever => const LocationSettingsNudge(
        message: 'Ative a localização para ver as arenas perto de você.',
        opensAppSettings: true,
      ),
    LocationPermissionStatus.serviceDisabled => const LocationSettingsNudge(
        message: 'A localização do aparelho está desligada.',
        opensAppSettings: false,
      ),
    LocationPermissionStatus.granted || LocationPermissionStatus.denied => null,
  };
}
