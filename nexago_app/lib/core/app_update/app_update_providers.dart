import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../firebase/firebase_providers.dart';
import 'app_update_config.dart';

/// Build number do binário instalado (o `+N` do pubspec / versionCode).
///
/// `0` quando não dá para ler — o gate trata isso como "não bloqueia".
final installedBuildNumberProvider = FutureProvider<int>((ref) async {
  try {
    final info = await PackageInfo.fromPlatform();
    return int.tryParse(info.buildNumber.trim()) ?? 0;
  } catch (_) {
    return 0;
  }
});

/// Versão mínima publicada no Firestore, já resolvida para a plataforma atual.
///
/// Fica em stream para permitir desbloquear ou endurecer o gate ao vivo, sem
/// esperar por um novo release.
final appUpdateConfigProvider = StreamProvider<AppUpdateConfig>((ref) {
  if (kIsWeb) return Stream.value(AppUpdateConfig.none);
  return ref
      .watch(firestoreProvider)
      .doc('appConfig/appVersion')
      .snapshots()
      .map((doc) => AppUpdateConfig.fromDoc(
            doc.data(),
            platform: defaultTargetPlatform,
          ));
});

/// Config em vigor, com fallback silencioso enquanto carrega ou em caso de erro.
final effectiveAppUpdateConfigProvider = Provider<AppUpdateConfig>((ref) {
  return ref.watch(appUpdateConfigProvider).valueOrNull ?? AppUpdateConfig.none;
});

/// `true` quando o app instalado está abaixo da versão mínima exigida.
final forcedUpdateRequiredProvider = Provider<bool>((ref) {
  final installed = ref.watch(installedBuildNumberProvider).valueOrNull ?? 0;
  return ref.watch(effectiveAppUpdateConfigProvider).blocks(installed);
});
