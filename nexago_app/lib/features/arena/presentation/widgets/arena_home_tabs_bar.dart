import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_home_tab.dart';

/// Abas Agora · Negócio · Clientes do Painel (sublinhado na escolhida).
class ArenaHomeTabsBar extends ConsumerWidget {
  const ArenaHomeTabsBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(arenaHomeTabProvider);
    final colors = context.themeColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: colors.onSurfaceMuted.withValues(alpha: 0.14),
          ),
        ),
      ),
      child: Row(
        children: [
          for (final tab in ArenaHomeTab.values)
            Padding(
              padding: const EdgeInsets.only(right: 22),
              child: _TabLabel(
                label: tab.label,
                selected: tab == current,
                onTap: () =>
                    ref.read(arenaHomeTabChoiceProvider.notifier).state = tab,
              ),
            ),
        ],
      ),
    );
  }
}

class _TabLabel extends StatelessWidget {
  const _TabLabel({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: selected ? AppColors.brand : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Text(
            label,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: selected ? colors.onSurface : colors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
