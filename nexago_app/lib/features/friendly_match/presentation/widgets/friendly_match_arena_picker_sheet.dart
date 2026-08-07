import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../arenas/domain/arena_list_item.dart';
import '../../../arenas/domain/arenas_providers.dart';

/// Folha de busca de arena do catálogo para o local do jogo.
/// Devolve a arena escolhida ou null (o chamador cai no texto livre).
Future<ArenaListItem?> showFriendlyMatchArenaPickerSheet(BuildContext context) {
  return showModalBottomSheet<ArenaListItem>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => const _ArenaPickerBody(),
  );
}

class _ArenaPickerBody extends ConsumerStatefulWidget {
  const _ArenaPickerBody();

  @override
  ConsumerState<_ArenaPickerBody> createState() => _ArenaPickerBodyState();
}

class _ArenaPickerBodyState extends ConsumerState<_ArenaPickerBody> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final arenasAsync = ref.watch(partnerArenasStreamProvider);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            20, 12, 20, 12 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Escolher arena',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              autofocus: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search_rounded),
                hintText: 'Buscar por nome',
              ),
              onChanged: (value) => setState(() => _query = value.trim()),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 300,
              child: arenasAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => Center(
                  child: Text(
                    'Não foi possível carregar as arenas.',
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: colors.onSurfaceMuted),
                  ),
                ),
                data: (arenas) {
                  final lowered = _query.toLowerCase();
                  final filtered = arenas
                      .where((arena) =>
                          lowered.isEmpty ||
                          arena.name.toLowerCase().contains(lowered))
                      .toList();
                  if (filtered.isEmpty) {
                    return Center(
                      child: Text(
                        'Nenhuma arena encontrada.',
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: colors.onSurfaceMuted),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final arena = filtered[index];
                      return ListTile(
                        leading: const Icon(Icons.sports_volleyball_outlined),
                        title: Text(arena.name),
                        subtitle: Text(
                          arena.locationLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onTap: () => Navigator.pop(context, arena),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
