import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../application/app_news_providers.dart';
import '../../domain/app_news_logic.dart';

/// Tile "Novidades" no grupo SOBRE dos ajustes do perfil, com quantas
/// funcionalidades da versão o atleta ainda não usou. Fica sempre no menu:
/// sem nada publicado para este build (ou ainda carregando), o toque abre a
/// tela vazia de Novidades.
class AppNewsSettingsTile extends ConsumerWidget {
  const AppNewsSettingsTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(appNewsProvider);
    final used = ref.watch(appNewsUsedProvider).valueOrNull ?? const {};
    final unused = view == null ? 0 : appNewsUnusedCount(view.current, used);
    return AthleteSettingsTile(
      icon: Icons.auto_awesome_outlined,
      title: 'Novidades',
      subtitle: view == null
          ? 'O que há de novo no app'
          : 'O que chegou na versão ${view.current.version}',
      variant: AthleteSettingsIconVariant.neutral,
      trailingBadge: unused > 0
          ? AthleteSettingsOrangeBadge(
              label: unused == 1 ? '1 nova' : '$unused novas',
            )
          : null,
      onTap: () => context.pushNamed(AppRouteNames.appNews),
      showDivider: true,
    );
  }
}
