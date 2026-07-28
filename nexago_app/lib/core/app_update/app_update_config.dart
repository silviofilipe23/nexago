import 'package:flutter/foundation.dart';

/// Versão mínima exigida por plataforma — doc `appConfig/appVersion`.
///
/// Formato esperado no Firestore:
/// ```
/// appConfig/appVersion {
///   android: { minBuildNumber: 101, storeUrl: '...', title: '...', message: '...' },
///   ios:     { minBuildNumber: 0,   storeUrl: '...' }
/// }
/// ```
///
/// **Fail-open por contrato**: doc ausente, leitura negada ou campo malformado
/// resultam em [minBuildNumber] `0`, que nunca bloqueia. Um erro aqui trancaria
/// a base instalada inteira, então o default seguro é sempre "deixa passar".
@immutable
class AppUpdateConfig {
  const AppUpdateConfig({
    this.minBuildNumber = 0,
    this.storeUrl,
    this.title,
    this.message,
  });

  /// Build number mínimo aceito. Abaixo dele o app fica bloqueado.
  final int minBuildNumber;

  /// Link da loja. Quando nulo, o gate usa o fallback da plataforma.
  final String? storeUrl;

  /// Textos opcionais para ajustar a comunicação sem publicar nova versão.
  final String? title;
  final String? message;

  static const AppUpdateConfig none = AppUpdateConfig();

  /// Lê o bloco da plataforma atual dentro do doc.
  static AppUpdateConfig fromDoc(
    Map<String, dynamic>? data, {
    required TargetPlatform platform,
  }) {
    if (data == null) return none;
    final key = switch (platform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => null,
    };
    if (key == null) return none;
    final raw = data[key];
    if (raw is! Map) return none;

    return AppUpdateConfig(
      minBuildNumber: _nonNegativeInt(raw['minBuildNumber']),
      storeUrl: _nonEmptyString(raw['storeUrl']),
      title: _nonEmptyString(raw['title']),
      message: _nonEmptyString(raw['message']),
    );
  }

  /// `true` quando a build instalada é anterior à mínima exigida.
  ///
  /// [installedBuildNumber] `<= 0` significa que não conseguimos ler a versão
  /// do binário — nesse caso não bloqueamos.
  bool blocks(int installedBuildNumber) =>
      installedBuildNumber > 0 && installedBuildNumber < minBuildNumber;
}

int _nonNegativeInt(Object? raw) {
  if (raw is num && raw.isFinite && raw >= 0) return raw.toInt();
  if (raw is String) {
    final parsed = int.tryParse(raw.trim());
    if (parsed != null && parsed >= 0) return parsed;
  }
  return 0;
}

String? _nonEmptyString(Object? raw) {
  if (raw is! String) return null;
  final trimmed = raw.trim();
  return trimmed.isEmpty ? null : trimmed;
}
