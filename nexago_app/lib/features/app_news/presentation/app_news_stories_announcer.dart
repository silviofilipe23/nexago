import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../application/app_news_providers.dart';
import '../domain/app_news.dart';
import '../domain/app_news_logic.dart';
import 'app_news_navigation.dart';

/// Abre os stories das novidades na primeira abertura depois de atualizar
/// ([appNewsPendingStoriesProvider] diz quando). Mesmo desenho do
/// `FocusDayAnnouncer`: só abre com a casca do atleta à vista — por cima de
/// uma inscrição, um convite ou a folha de missão, espera ela sair.
///
/// "Viu" é gravado antes de abrir: fechar o app no meio não traz os stories
/// de volta.
class AppNewsStoriesAnnouncer extends ConsumerStatefulWidget {
  const AppNewsStoriesAnnouncer({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppNewsStoriesAnnouncer> createState() =>
      _AppNewsStoriesAnnouncerState();
}

class _AppNewsStoriesAnnouncerState
    extends ConsumerState<AppNewsStoriesAnnouncer> {
  bool _opening = false;

  void _maybeOpen(AppNewsStories? stories) {
    if (_opening || !mounted || stories == null) return;
    _opening = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || ModalRoute.of(context)?.isCurrent != true) {
        _opening = false;
        return;
      }
      await markAppNewsStoriesSeen(ref, stories.release.version);
      if (!mounted) return;
      final feature = await context.pushNamed<AppNewsFeature>(
        AppRouteNames.appNewsStories,
        extra: stories,
      );
      if (!mounted) return;
      _opening = false;
      if (feature != null) await openAppNewsFeature(context, ref, feature);
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AppNewsStories?>(
      appNewsPendingStoriesProvider,
      (previous, next) => _maybeOpen(next),
    );
    final pending = ref.watch(appNewsPendingStoriesProvider);

    // Assina a rota corrente: quando a rota de cima sai, este build roda de
    // novo e é a segunda chance dos stories que perderam a vez.
    final shellIsCurrent = ModalRoute.isCurrentOf(context) ?? false;
    if (shellIsCurrent) _maybeOpen(pending);

    return widget.child;
  }
}
