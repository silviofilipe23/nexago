import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../athlete/domain/favorites_providers.dart';

class ArenaFollowersPage extends ConsumerWidget {
  const ArenaFollowersPage({
    super.key,
    required this.arenaId,
  });

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final followersAsync = ref.watch(arenaFollowersListProvider(arenaId));
    return Scaffold(
      appBar: AppBar(title: const Text('Atletas interessados')),
      body: followersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Nao foi possivel carregar seguidores.\n$e'),
          ),
        ),
        data: (followers) {
          if (followers.isEmpty) {
            return const Center(
              child: Text('Ainda nao ha seguidores para esta arena.'),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: followers.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final item = followers[index];
              final badge =
                  item.isNewFollower ? '⭐ Novo seguidor' : '🔥 Frequente';
              return Material(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => context.pushNamed(
                    AppRouteNames.athleteProfile,
                    queryParameters: {'userId': item.userId},
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        _FollowerAvatar(
                          name: item.name,
                          avatarUrl: item.avatarUrl,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.name,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                badge,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: item.isNewFollower
                                          ? const Color(0xFF6A1B9A)
                                          : const Color(0xFFE65100),
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _FollowerAvatar extends StatelessWidget {
  const _FollowerAvatar({
    required this.name,
    required this.avatarUrl,
  });

  final String name;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isNotEmpty ? name.trim().substring(0, 1) : '?';
    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: avatarUrl!,
          width: 46,
          height: 46,
          fit: BoxFit.cover,
          errorWidget: (context, error, stackTrace) =>
              _fallback(context, initial),
        ),
      );
    }
    return _fallback(context, initial);
  }

  Widget _fallback(BuildContext context, String initial) {
    return CircleAvatar(
      radius: 23,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Text(
        initial.toUpperCase(),
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
      ),
    );
  }
}
