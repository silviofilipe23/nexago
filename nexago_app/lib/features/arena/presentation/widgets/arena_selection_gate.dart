import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../arenas/domain/arena_list_item.dart';
import '../../domain/arena_providers.dart';

/// Bloqueia o painel até o gestor escolher uma arena quando há mais de uma.
class ArenaSelectionGate extends ConsumerWidget {
  const ArenaSelectionGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final need = ref.watch(needsArenaSelectionProvider);
    if (!need) return const SizedBox.shrink();

    final briefAsync = ref.watch(managedArenasBriefProvider);
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.surface,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.stadium_rounded,
                size: 56,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 16),
              Text(
                'Escolha uma arena',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Você gerencia mais de um local. Selecione qual deseja administrar agora.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.45,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              Expanded(
                child: briefAsync.when(
                  data: (arenas) => _ArenaList(
                    arenas: arenas,
                    onPick: (id) {
                      ref.read(currentArenaIdProvider.notifier).selectArena(id);
                    },
                  ),
                  loading: () => const Center(
                    child: CircularProgressIndicator(),
                  ),
                  error: (e, _) => Center(
                    child: Text(
                      'Não foi possível carregar as arenas.\n$e',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ArenaList extends StatelessWidget {
  const _ArenaList({
    required this.arenas,
    required this.onPick,
  });

  final List<ArenaListItem> arenas;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (arenas.isEmpty) {
      return Center(
        child: Text(
          'Nenhuma arena encontrada. Verifique permissões ou contate o suporte.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge,
        ),
      );
    }
    return ListView.separated(
      itemCount: arenas.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final a = arenas[i];
        return Material(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => onPick(a.id),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      a.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.brand,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
