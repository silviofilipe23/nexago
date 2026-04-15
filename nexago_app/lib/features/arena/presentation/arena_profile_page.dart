import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../domain/arena_schedule_providers.dart';

class ArenaProfilePage extends ConsumerWidget {
  const ArenaProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaAsync = ref.watch(managedArenaDetailProvider);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Perfil da arena'),
      ),
      body: arenaAsync.when(
        data: (arena) {
          if (arena == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Nenhuma arena vinculada ao seu usuário como gestor.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            );
          }
          return _ArenaProfileBody(arena: arena);
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ArenaProfileBody extends StatelessWidget {
  const _ArenaProfileBody({required this.arena});

  final ArenaListItem arena;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const headerH = 200.0;
    const logoR = 48.0;

    final address = arena.addressLine?.trim().isNotEmpty == true
        ? arena.addressLine!.trim()
        : arena.locationLabel;
    final phone =
        arena.phone?.trim().isNotEmpty == true ? arena.phone!.trim() : '—';
    final description = arena.description?.trim().isNotEmpty == true
        ? arena.description!.trim()
        : 'Nenhuma descrição cadastrada.';

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: headerH,
            child: Stack(
              clipBehavior: Clip.none,
              fit: StackFit.expand,
              children: [
                _CoverImage(coverUrl: arena.coverUrl),
                Positioned(
                  left: 22,
                  bottom: -logoR + 12,
                  child: _LogoBadge(logoUrl: arena.logoUrl, name: arena.name),
                ),
              ],
            ),
          ),
          SizedBox(height: logoR + 8),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 8),
            child: Text(
              arena.name,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _InfoCard(
                  child: _FollowersSection(arenaId: arena.id),
                ),
                const SizedBox(height: 14),
                _InfoCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SectionTitle(theme: theme, label: 'Descrição'),
                      const SizedBox(height: 10),
                      Text(
                        description,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          height: 1.45,
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.82),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                _InfoCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SectionTitle(theme: theme, label: 'Endereço'),
                      const SizedBox(height: 10),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.place_outlined,
                            size: 20,
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.75),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              address,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                _InfoCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SectionTitle(theme: theme, label: 'Telefone'),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Icon(
                            Icons.phone_outlined,
                            size: 20,
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.75),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              phone,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  height: 52,
                  child: FilledButton(
                    onPressed: () {
                      context.pushNamed(AppRouteNames.arenaProfileEdit);
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text(
                      'Editar perfil',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FollowersSection extends ConsumerWidget {
  const _FollowersSection({required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countAsync = ref.watch(arenaFollowersCountProvider(arenaId));
    final previewAsync = ref.watch(arenaFollowersPreviewProvider(arenaId));
    final theme = Theme.of(context);

    final count = countAsync.valueOrNull ?? 0;
    final preview = previewAsync.valueOrNull ?? const <ArenaFollowerItem>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '❤️ $count seguidores',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 10),
        if (preview.isEmpty)
          Text(
            'Quando atletas seguirem sua arena, eles aparecerao aqui.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: preview
                .map((f) => Tooltip(
                      message: f.name,
                      child: CircleAvatar(
                        radius: 18,
                        backgroundImage:
                            (f.avatarUrl != null && f.avatarUrl!.isNotEmpty)
                                ? CachedNetworkImageProvider(f.avatarUrl!)
                                : null,
                        child: (f.avatarUrl == null || f.avatarUrl!.isEmpty)
                            ? Text(
                                f.name.isNotEmpty
                                    ? f.name.substring(0, 1).toUpperCase()
                                    : '?',
                              )
                            : null,
                      ),
                    ))
                .toList(growable: false),
          ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton(
            onPressed: () => context.pushNamed(
              AppRouteNames.arenaFollowers,
              queryParameters: {'arenaId': arenaId},
            ),
            child: const Text('Ver todos'),
          ),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.theme, required this.label});

  final ThemeData theme;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: theme.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.2,
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
        child: child,
      ),
    );
  }
}

class _CoverImage extends StatelessWidget {
  const _CoverImage({required this.coverUrl});

  final String? coverUrl;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fallback = ColoredBox(
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
      child: Icon(
        Icons.image_outlined,
        size: 48,
        color: theme.colorScheme.onSurface.withValues(alpha: 0.25),
      ),
    );

    if (coverUrl == null || coverUrl!.isEmpty) {
      return fallback;
    }
    return CachedNetworkImage(
      imageUrl: coverUrl!,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 280),
      placeholder: (context, url) => fallback,
      errorWidget: (context, error, stackTrace) => fallback,
    );
  }
}

class _LogoBadge extends StatelessWidget {
  const _LogoBadge({required this.logoUrl, required this.name});

  final String? logoUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: theme.colorScheme.surface,
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
          width: 3,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: logoUrl != null && logoUrl!.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: logoUrl!,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 220),
              errorWidget: (context, error, stackTrace) => _logoFallback(theme),
            )
          : _logoFallback(theme),
    );
  }

  Widget _logoFallback(ThemeData theme) {
    return ColoredBox(
      color: AppColors.brand.withValues(alpha: 0.12),
      child: Center(
        child: Text(
          name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.brand,
          ),
        ),
      ),
    );
  }
}
