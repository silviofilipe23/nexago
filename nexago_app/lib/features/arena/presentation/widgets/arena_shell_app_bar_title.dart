import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../arenas/domain/arena_list_item.dart';
import '../../domain/arena_providers.dart';

/// Cabeçalho da AppBar: logo + nome da arena; toque abre o perfil.
class ArenaShellAppBarTitle extends ConsumerWidget {
  const ArenaShellAppBarTitle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.45);
    final arenaAsync = ref.watch(managedArenaDetailProvider);
    final id = ref.watch(managedArenaIdProvider).valueOrNull;
    final fallbackName = ref.watch(arenaModuleConfigProvider).title;

    final name = arenaAsync.maybeWhen(
      data: (a) => a?.name,
      orElse: () => null,
    );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: id == null || id.isEmpty
            ? null
            : () => context.pushNamed(AppRouteNames.arenaProfile),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _LogoThumb(arenaAsync: arenaAsync),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  name ?? fallbackName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
              if (id != null && id.isNotEmpty) ...[
                const SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 22,
                  color: muted,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LogoThumb extends StatelessWidget {
  const _LogoThumb({required this.arenaAsync});

  final AsyncValue<ArenaListItem?> arenaAsync;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final url = arenaAsync.maybeWhen(
      data: (a) => a?.logoUrl,
      orElse: () => null,
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: 36,
        height: 36,
        child: url != null && url.isNotEmpty
            ? Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _fallback(theme),
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return _fallback(theme);
                },
              )
            : _fallback(theme),
      ),
    );
  }

  Widget _fallback(ThemeData theme) {
    return ColoredBox(
      color: AppColors.brand.withValues(alpha: 0.12),
      child: Icon(
        Icons.stadium_rounded,
        size: 20,
        color: AppColors.brand.withValues(alpha: 0.85),
      ),
    );
  }
}
