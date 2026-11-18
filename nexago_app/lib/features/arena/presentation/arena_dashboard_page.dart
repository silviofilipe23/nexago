import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/layout/nexa_page_header.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_home_tab.dart';
import '../domain/arena_shell_providers.dart';
import 'plan/widgets/arena_plan_status_banner.dart';
import 'widgets/arena_business_tab.dart';
import 'widgets/arena_clients_tab.dart';
import 'widgets/arena_dashboard_header.dart';
import 'widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_home_new_action_button.dart';
import 'widgets/arena_home_tabs_bar.dart';
import 'widgets/arena_now_tab.dart';

/// Painel da arena: abas Agora (operação), Negócio (números) e Clientes.
///
/// Cada aba carrega e falha sozinha — um stream lento ou com erro não
/// esconde as outras. A aba inicial depende do cargo (`arenaHomeTabProvider`).
class ArenaDashboardPage extends ConsumerWidget {
  const ArenaDashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(arenaHomeTabProvider);
    final hideFloatingHeader =
        ref.watch(arenaShellFloatingHeaderSuppressedProvider) > 0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      floatingActionButton: Padding(
        padding: EdgeInsets.only(
          bottom: ArenaDashboardTokens.shellFabLift(context),
        ),
        child: const ArenaHomeNewActionButton(),
      ),
      body: SafeArea(
        bottom: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth > 720 ? 640.0 : double.infinity;
            Widget constrained(Widget child) => Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxW),
                    child: child,
                  ),
                );

            final content = CustomScrollView(
              controller:
                  ref.watch(arenaShellScrollRegistryProvider).controllerFor(0),
              key: const PageStorageKey<String>('arena-dashboard-scroll'),
              physics: ArenaDashboardTokens.shellScrollPhysics,
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    0,
                    ArenaDashboardTokens.horizontalPadding,
                    ArenaDashboardTokens.shellFabScrollBottomPadding(context),
                  ),
                  sliver: SliverToBoxAdapter(
                    child: constrained(
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const ArenaHomeTabsBar(),
                          // Margem própria só em cima: fica abaixo das abas.
                          const ArenaPlanStatusBanner(),
                          const SizedBox(height: 18),
                          FadeSlideIn(
                            key: ValueKey(tab),
                            duration: const Duration(milliseconds: 320),
                            offsetY: 10,
                            child: switch (tab) {
                              ArenaHomeTab.now => const ArenaNowTab(),
                              ArenaHomeTab.business =>
                                const ArenaBusinessTab(),
                              ArenaHomeTab.clients => const ArenaClientsTab(),
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );

            if (hideFloatingHeader) return content;
            return NexaPageHeader(
              padding: const EdgeInsets.symmetric(
                horizontal: ArenaDashboardTokens.horizontalPadding,
              ),
              header: constrained(
                const FadeSlideIn(
                  duration: Duration(milliseconds: 420),
                  offsetY: 14,
                  child: ArenaDashboardHeader(),
                ),
              ),
              child: content,
            );
          },
        ),
      ),
    );
  }
}
