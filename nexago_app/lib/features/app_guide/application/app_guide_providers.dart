import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../home_banners/domain/home_banner.dart';
import '../../store/application/store_providers.dart';
import '../domain/app_guide.dart';
import '../infrastructure/firestore_app_guide_repository.dart';

final appGuideRepositoryProvider = Provider<AppGuideRepository>((ref) {
  return FirestoreAppGuideRepository(ref.watch(firestoreProvider));
});

final _appGuideUidProvider = Provider<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

final _appGuideRawProvider = StreamProvider.autoDispose<List<AppGuideCategory>>(
  (ref) {
    final uid = ref.watch(_appGuideUidProvider);
    if (uid.isEmpty) return Stream.value(const []);
    return ref.watch(appGuideRepositoryProvider).watchCategories();
  },
);

/// As categorias da Central de ajuda, sem os guias da Loja quando ela está
/// desligada (a aba não existe e o botão abriria a Comunidade). A Loja só é
/// assinada quando algum guia aponta para ela.
final appGuideProvider =
    Provider.autoDispose<AsyncValue<List<AppGuideCategory>>>((ref) {
      final raw = ref.watch(_appGuideRawProvider);
      final categories = raw.valueOrNull;
      if (categories == null) return raw;
      final needsStore = categories.any(
        (c) => c.topics.any((t) => t.destination == HomeBannerDestination.loja),
      );
      if (!needsStore || ref.watch(storeEnabledProvider)) return raw;
      final filtered = <AppGuideCategory>[];
      for (final c in categories) {
        final topics = [
          for (final t in c.topics)
            if (t.destination != HomeBannerDestination.loja) t,
        ];
        if (topics.isNotEmpty) {
          filtered.add(
            AppGuideCategory(id: c.id, title: c.title, topics: topics),
          );
        }
      }
      return AsyncData(filtered);
    });
