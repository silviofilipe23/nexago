import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:nexago_app/core/location/location_permission_status.dart';

void main() {
  group('resolveLocationPermissionStatus', () {
    test('permissão de uso com o serviço ligado é concedida', () {
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: true,
          permission: LocationPermission.whileInUse,
        ),
        LocationPermissionStatus.granted,
      );
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: true,
          permission: LocationPermission.always,
        ),
        LocationPermissionStatus.granted,
      );
    });

    test('no iOS "ainda não perguntei" chega como denied — dá para pedir', () {
      // O mapeamento nativo manda `kCLAuthorizationStatusNotDetermined` para o
      // índice 0, que é `LocationPermission.denied`.
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: true,
          permission: LocationPermission.denied,
        ),
        LocationPermissionStatus.denied,
      );
    });

    test('recusa definitiva não vira pedido, mesmo com o serviço ligado', () {
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: true,
          permission: LocationPermission.deniedForever,
        ),
        LocationPermissionStatus.deniedForever,
      );
    });

    test('recusa definitiva ganha do serviço desligado', () {
      // Só os Ajustes do app resolvem: ligar o GPS não devolve a permissão.
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: false,
          permission: LocationPermission.deniedForever,
        ),
        LocationPermissionStatus.deniedForever,
      );
    });

    test('serviço desligado vence a permissão concedida', () {
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: false,
          permission: LocationPermission.whileInUse,
        ),
        LocationPermissionStatus.serviceDisabled,
      );
    });

    test('serviço desligado vence o pedido pendente', () {
      // Pedir a permissão com o GPS desligado não adianta: a posição falha
      // depois. O caminho útil é ligar a localização do aparelho.
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: false,
          permission: LocationPermission.denied,
        ),
        LocationPermissionStatus.serviceDisabled,
      );
    });

    test('estado indeterminado (web) ainda dá para pedir', () {
      expect(
        resolveLocationPermissionStatus(
          serviceEnabled: true,
          permission: LocationPermission.unableToDetermine,
        ),
        LocationPermissionStatus.denied,
      );
    });
  });

  group('shouldRequestLocationPermission', () {
    test('só pede quando o sistema ainda mostra o diálogo', () {
      expect(
        shouldRequestLocationPermission(LocationPermissionStatus.denied),
        isTrue,
      );
    });

    test('não pede o que já está concedido', () {
      expect(
        shouldRequestLocationPermission(LocationPermissionStatus.granted),
        isFalse,
      );
    });

    test('não insiste onde o sistema não mostra mais nada', () {
      expect(
        shouldRequestLocationPermission(LocationPermissionStatus.deniedForever),
        isFalse,
      );
      expect(
        shouldRequestLocationPermission(
          LocationPermissionStatus.serviceDisabled,
        ),
        isFalse,
      );
    });
  });

  group('locationSettingsNudgeFor', () {
    test('recusa definitiva manda para os Ajustes do app', () {
      final nudge = locationSettingsNudgeFor(
        LocationPermissionStatus.deniedForever,
      );

      expect(nudge, isNotNull);
      expect(nudge!.opensAppSettings, isTrue);
      expect(nudge.message, isNotEmpty);
    });

    test('serviço desligado manda para os Ajustes de localização', () {
      // O GPS está desligado para todo o aparelho — a tela de permissão do
      // nexaGO não resolve nada aqui.
      final nudge = locationSettingsNudgeFor(
        LocationPermissionStatus.serviceDisabled,
      );

      expect(nudge, isNotNull);
      expect(nudge!.opensAppSettings, isFalse);
      expect(nudge.message, isNotEmpty);
    });

    test('as duas mensagens são diferentes: o caminho de volta é outro', () {
      expect(
        locationSettingsNudgeFor(LocationPermissionStatus.deniedForever)!
            .message,
        isNot(
          locationSettingsNudgeFor(LocationPermissionStatus.serviceDisabled)!
              .message,
        ),
      );
    });

    test('sem aviso quando está concedida', () {
      expect(
        locationSettingsNudgeFor(LocationPermissionStatus.granted),
        isNull,
      );
    });

    test('sem aviso enquanto o diálogo do sistema ainda pode aparecer', () {
      // Avisar aqui seria dizer "vá nos Ajustes" para quem só precisa tocar
      // em "Permitir" no diálogo que estamos prestes a mostrar.
      expect(locationSettingsNudgeFor(LocationPermissionStatus.denied), isNull);
    });
  });
}
