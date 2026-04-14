import 'dart:io';

import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

/// Encapsula [LocalAuthentication] para Face ID / Touch ID / impressão digital.
class BiometricService {
  BiometricService({LocalAuthentication? localAuth})
      : _auth = localAuth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// Dispositivo com hardware/suporte a biometria (pode ainda não estar configurado).
  Future<bool> isDeviceSupported() => _auth.isDeviceSupported();

  /// Há biometrias cadastradas no sistema.
  Future<bool> hasEnrolledBiometrics() async {
    final types = await _auth.getAvailableBiometrics();
    return types.isNotEmpty;
  }

  /// Rótulo amigável para UI (Face ID vs impressão digital).
  Future<String> primaryMethodLabel() async {
    if (Platform.isIOS) {
      final types = await _auth.getAvailableBiometrics();
      if (types.contains(BiometricType.face)) return 'Face ID';
      if (types.contains(BiometricType.iris)) return 'Iris';
      if (types.contains(BiometricType.fingerprint)) return 'Touch ID';
    }
    if (Platform.isAndroid) {
      return 'biometria';
    }
    return 'biometria';
  }

  /// Solicita autenticação biométrica (ou credencial do dispositivo no Android, se permitido).
  ///
  /// Retorna `false` se o usuário cancelar, falhar ou ocorrer erro.
  Future<bool> authenticate({
    required String localizedReason,
    bool biometricOnly = true,
  }) async {
    try {
      final ok = await _auth.authenticate(
        localizedReason: localizedReason,
        options: AuthenticationOptions(
          biometricOnly: biometricOnly,
          stickyAuth: true,
          sensitiveTransaction: false,
        ),
      );
      return ok;
    } on PlatformException {
      return false;
    }
  }
}
