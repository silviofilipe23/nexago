import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_update/app_update_providers.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../home_banners/domain/home_banner.dart';
import '../../store/application/store_providers.dart';
import '../domain/app_news.dart';
import '../domain/app_news_logic.dart';
import '../infrastructure/firestore_app_news_repository.dart';
import '../infrastructure/shared_prefs_app_news_local_store.dart';

final appNewsRepositoryProvider = Provider<AppNewsRepository>((ref) {
  return FirestoreAppNewsRepository(ref.watch(firestoreProvider));
});

final appNewsLocalStoreProvider = Provider<AppNewsLocalStore>((ref) {
  return SharedPrefsAppNewsLocalStore();
});

final _appNewsUidProvider = Provider<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// As versões publicadas, da mais nova para a mais antiga. Deslogado =
/// nenhuma (a rule de `appConfig` exige sessão).
final appNewsReleasesProvider =
    StreamProvider.autoDispose<List<AppNewsRelease>>((ref) {
      final uid = ref.watch(_appNewsUidProvider);
      if (uid.isEmpty) return Stream.value(const []);
      return ref.watch(appNewsRepositoryProvider).watchReleases();
    });

/// O que a tela de Novidades mostra para o build instalado, ou `null`
/// (carregando ou nada publicado). A Loja só é assinada quando alguma
/// funcionalidade aponta para ela.
final appNewsProvider = Provider.autoDispose<AppNewsView?>((ref) {
  final releases = ref.watch(appNewsReleasesProvider).valueOrNull;
  final build = ref.watch(installedBuildNumberProvider).valueOrNull;
  if (releases == null || releases.isEmpty || build == null) return null;
  final needsStore = releases.any(
    (r) => r.features.any((f) => f.destination == HomeBannerDestination.loja),
  );
  final storeOn = needsStore && ref.watch(storeEnabledProvider);
  return appNewsForBuild(
    releases,
    build,
    destinationAvailable: (d) => d != HomeBannerDestination.loja || storeOn,
  );
});

/// Ids das funcionalidades que o atleta já abriu pelo botão ("Já usou").
final appNewsUsedProvider =
    AsyncNotifierProvider<AppNewsUsedNotifier, Set<String>>(
      AppNewsUsedNotifier.new,
    );

class AppNewsUsedNotifier extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() {
    final uid = ref.watch(_appNewsUidProvider);
    if (uid.isEmpty) return Future.value(const {});
    return ref.watch(appNewsLocalStoreProvider).usedFeatures(uid);
  }

  Future<void> markUsed(String featureId) async {
    final uid = ref.read(_appNewsUidProvider);
    if (uid.isEmpty) return;
    final used = await future;
    if (used.contains(featureId)) return;
    state = AsyncData({...used, featureId});
    unawaited(ref.read(appNewsLocalStoreProvider).markUsed(uid, featureId));
  }
}

/// A última versão cujos stories o atleta viu neste aparelho.
final appNewsStoriesSeenProvider = FutureProvider.autoDispose<String?>((ref) {
  final uid = ref.watch(_appNewsUidProvider);
  if (uid.isEmpty) return Future.value();
  return ref.watch(appNewsLocalStoreProvider).storiesSeenVersion(uid);
});

/// Os stories que esperam o atleta, ou `null`. Espera tudo carregar: sem o
/// "já viu" ou o "já usou", os stories abririam de novo.
final appNewsPendingStoriesProvider = Provider.autoDispose<AppNewsStories?>((
  ref,
) {
  final view = ref.watch(appNewsProvider);
  if (view == null) return null;
  final seen = ref.watch(appNewsStoriesSeenProvider);
  final used = ref.watch(appNewsUsedProvider).valueOrNull;
  if (!seen.hasValue || used == null) return null;
  return pendingAppNewsStories(
    release: view.current,
    seenVersion: seen.value,
    used: used,
    accountCreatedAt: ref
        .watch(authProvider)
        .valueOrNull
        ?.metadata
        .creationTime,
  );
});

/// Grava que o atleta viu os stories da versão — antes de abrir, para que
/// fechar o app no meio não os traga de volta.
Future<void> markAppNewsStoriesSeen(WidgetRef ref, String version) async {
  final uid = ref.read(_appNewsUidProvider);
  if (uid.isEmpty) return;
  await ref.read(appNewsLocalStoreProvider).markStoriesSeen(uid, version);
  ref.invalidate(appNewsStoriesSeenProvider);
}
