import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../domain/arena_schedule_providers.dart';
import 'widgets/arena_dashboard_tokens.dart';

class ArenaProfilePage extends ConsumerWidget {
  const ArenaProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arenaAsync = ref.watch(managedArenaDetailProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: arenaAsync.when(
        data: (arena) {
          if (arena == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Nenhuma arena vinculada ao seu usuário como gestor.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                ),
              ),
            );
          }
          return _ArenaProfileBody(arena: arena);
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.live,
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
    const logoSize = 88.0;
    const logoOverlap = 36.0;

    final description = arena.description?.trim().isNotEmpty == true
        ? arena.description!.trim()
        : 'Nenhuma descrição cadastrada.';
    final addressLines = _formatAddressLines(arena);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: headerH + logoOverlap,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  height: headerH,
                  child: _CoverHeader(
                    coverUrl: arena.coverUrl,
                    onEditCover: () =>
                        context.pushNamed(AppRouteNames.arenaProfileEdit),
                  ),
                ),
                Positioned(
                  left: ArenaDashboardTokens.horizontalPadding,
                  top: headerH - logoOverlap,
                  child: _LogoBadge(
                    logoUrl: arena.logoUrl,
                    name: arena.name,
                    size: logoSize,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              12,
              ArenaDashboardTokens.horizontalPadding,
              32,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  arena.name,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                const _PublicProfileStatus(),
                const SizedBox(height: 20),
                _ProfileCard(
                  child: _FollowersSection(arenaId: arena.id),
                ),
                const SizedBox(height: 14),
                _ProfileCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _ProfileSectionLabel(
                        icon: Icons.chat_bubble_outline_rounded,
                        label: 'DESCRIÇÃO',
                      ),
                      const SizedBox(height: 12),
                      Text(
                        description,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.onSurface,
                          fontWeight: FontWeight.w500,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                _ProfileCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _ProfileSectionLabel(
                        icon: Icons.place_outlined,
                        label: 'ENDEREÇO',
                      ),
                      const SizedBox(height: 12),
                      for (var i = 0; i < addressLines.length; i++) ...[
                        if (i > 0) const SizedBox(height: 4),
                        Text(
                          addressLines[i],
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppColors.onSurface,
                            fontWeight: FontWeight.w500,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: () =>
                        context.pushNamed(AppRouteNames.arenaProfileEdit),
                    icon: const Icon(
                      Icons.edit_outlined,
                      color: AppColors.black,
                      size: 20,
                    ),
                    label: const Text(
                      'Editar perfil',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.black,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

List<String> _formatAddressLines(ArenaListItem arena) {
  final lines = <String>[];
  final street = arena.addressLine?.trim();
  if (street != null && street.isNotEmpty) {
    final parts = street.split(RegExp(r'\n+'));
    lines.addAll(parts.map((p) => p.trim()).where((p) => p.isNotEmpty));
  }
  final city = arena.city?.trim();
  final state = arena.state?.trim();
  if (city != null && city.isNotEmpty) {
    final tail = state != null && state.isNotEmpty ? ' · $state' : '';
    lines.add('$city$tail');
  } else if (arena.locationLabel.trim().isNotEmpty &&
      arena.locationLabel != 'Local a confirmar') {
    lines.add(arena.locationLabel);
  }
  if (lines.isEmpty) {
    return const ['Endereço não informado'];
  }
  return lines;
}

class _CoverHeader extends StatelessWidget {
  const _CoverHeader({
    required this.coverUrl,
    required this.onEditCover,
  });

  final String? coverUrl;
  final VoidCallback onEditCover;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        _CoverImage(coverUrl: coverUrl),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.15),
                Colors.black.withValues(alpha: 0.55),
              ],
            ),
          ),
        ),
        SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 12, 12),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => context.pop(),
                  icon: const Icon(
                    Icons.arrow_back_rounded,
                    color: AppColors.onSurface,
                  ),
                ),
                const Spacer(),
                _EditCoverButton(onTap: onEditCover),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EditCoverButton extends StatelessWidget {
  const _EditCoverButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceRaised.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.image_outlined,
                size: 16,
                color: AppColors.onSurface.withValues(alpha: 0.9),
              ),
              const SizedBox(width: 6),
              Text(
                'EDITAR CAPA',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: AppColors.onSurface,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      fontSize: 10,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PublicProfileStatus extends StatelessWidget {
  const _PublicProfileStatus();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
            color: AppColors.win,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'PERFIL PÚBLICO ATIVO',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: AppColors.win,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                fontSize: 10,
              ),
        ),
      ],
    );
  }
}

class _FollowersSection extends ConsumerWidget {
  const _FollowersSection({required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final countAsync = ref.watch(arenaFollowersCountProvider(arenaId));
    final previewAsync = ref.watch(arenaFollowersPreviewProvider(arenaId));
    final insightsAsync = ref.watch(arenaFollowersInsightsProvider(arenaId));

    final count = countAsync.valueOrNull ?? 0;
    final preview = previewAsync.valueOrNull ?? const <ArenaFollowerItem>[];
    final growth = insightsAsync.valueOrNull?.growthLastWeek ?? 0;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _OverlappingFollowerAvatars(followers: preview),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$count seguidor${count == 1 ? '' : 'es'}',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '+$growth essa semana',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        _ViewAllFollowersButton(
          onTap: () => context.pushNamed(
            AppRouteNames.arenaFollowers,
            queryParameters: {'arenaId': arenaId},
          ),
        ),
      ],
    );
  }
}

class _ViewAllFollowersButton extends StatelessWidget {
  const _ViewAllFollowersButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceSheet,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.28),
            ),
          ),
          child: const Text(
            'Ver todos',
            style: TextStyle(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _OverlappingFollowerAvatars extends StatelessWidget {
  const _OverlappingFollowerAvatars({required this.followers});

  final List<ArenaFollowerItem> followers;

  static const _size = 40.0;
  static const _overlap = 24.0;
  static const _slotCount = 2;

  @override
  Widget build(BuildContext context) {
    final width = _size + (_slotCount - 1) * _overlap;

    return SizedBox(
      width: width,
      height: _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < _slotCount; i++)
            Positioned(
              left: i * _overlap,
              child: _FollowerAvatarSlot(
                follower: i < followers.length ? followers[i] : null,
                placeholderIndex: i,
              ),
            ),
        ],
      ),
    );
  }
}

class _FollowerAvatarSlot extends StatelessWidget {
  const _FollowerAvatarSlot({
    required this.follower,
    required this.placeholderIndex,
  });

  final ArenaFollowerItem? follower;
  final int placeholderIndex;

  @override
  Widget build(BuildContext context) {
    if (follower != null) {
      return _FollowerAvatar(follower: follower!);
    }
    return _PlaceholderFollowerAvatar(index: placeholderIndex);
  }
}

class _PlaceholderFollowerAvatar extends StatelessWidget {
  const _PlaceholderFollowerAvatar({required this.index});

  final int index;

  static const _gradients = [
    LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFFFFB347), Color(0xFFCC6B2E)],
    ),
    LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF5B9BD5), Color(0xFF1E3A5F)],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final gradient = _gradients[index % _gradients.length];

    return Container(
      width: _OverlappingFollowerAvatars._size,
      height: _OverlappingFollowerAvatars._size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: gradient,
        border: Border.all(
          color: AppColors.surfaceRaised,
          width: 2.5,
        ),
      ),
    );
  }
}

class _FollowerAvatar extends StatelessWidget {
  const _FollowerAvatar({required this.follower});

  final ArenaFollowerItem follower;

  @override
  Widget build(BuildContext context) {
    final hasUrl =
        follower.avatarUrl != null && follower.avatarUrl!.trim().isNotEmpty;

    const size = _OverlappingFollowerAvatars._size;

    return SizedBox(
      width: size,
      height: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.surfaceRaised, width: 2.5),
        ),
        child: ClipOval(
          child: SizedBox.expand(
            child: hasUrl
                ? CachedNetworkImage(
                    imageUrl: follower.avatarUrl!,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => const _AvatarSkeleton(),
                    errorWidget: (_, __, ___) => _initials(follower.name),
                  )
                : _initials(follower.name),
          ),
        ),
      ),
    );
  }

  Widget _initials(String name) {
    final letter =
        name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    return ColoredBox(
      color: AppColors.brand.withValues(alpha: 0.25),
      child: Center(
        child: Text(
          letter,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
        ),
      ),
    );
  }
}

class _ProfileSectionLabel extends StatelessWidget {
  const _ProfileSectionLabel({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.brand),
        const SizedBox(width: 8),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                fontSize: 10,
              ),
        ),
      ],
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        color: AppColors.surfaceRaised,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
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
    const fallback = _CoverSkeleton();

    if (coverUrl == null || coverUrl!.isEmpty) {
      return fallback;
    }
    return CachedNetworkImage(
      imageUrl: coverUrl!,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 280),
      placeholder: (_, __) => fallback,
      errorWidget: (_, __, ___) => fallback,
    );
  }
}

class _LogoBadge extends StatelessWidget {
  const _LogoBadge({
    required this.logoUrl,
    required this.name,
    required this.size,
  });

  final String? logoUrl;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final monogram = _arenaMonogram(name);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppColors.surfaceRaised,
          width: 3,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
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
              placeholder: (_, __) => _LogoGradient(monogram: monogram),
              errorWidget: (_, __, ___) => _LogoGradient(monogram: monogram),
            )
          : _LogoGradient(monogram: monogram),
    );
  }
}

String _arenaMonogram(String name) {
  final words =
      name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (words.length >= 2) {
    return words
        .take(3)
        .map((w) => w[0].toUpperCase())
        .join();
  }
  final t = name.trim();
  if (t.isEmpty) return '?';
  if (t.length <= 3) return t.toUpperCase();
  return t.substring(0, 3).toUpperCase();
}

class _LogoGradient extends StatelessWidget {
  const _LogoGradient({required this.monogram});

  final String monogram;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFFF8A4A),
            AppColors.brand,
            Color(0xFFE5560E),
          ],
        ),
      ),
      child: Center(
        child: Text(
          monogram,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            color: AppColors.black,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }
}

class _CoverSkeleton extends StatefulWidget {
  const _CoverSkeleton();

  @override
  State<_CoverSkeleton> createState() => _CoverSkeletonState();
}

class _CoverSkeletonState extends State<_CoverSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return ColoredBox(
          color: Color.lerp(
            AppColors.surfaceCard,
            AppColors.onSurfaceMuted.withValues(alpha: 0.2),
            t,
          )!,
        );
      },
    );
  }
}

class _AvatarSkeleton extends StatefulWidget {
  const _AvatarSkeleton();

  @override
  State<_AvatarSkeleton> createState() => _AvatarSkeletonState();
}

class _AvatarSkeletonState extends State<_AvatarSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return ColoredBox(
          color: Color.lerp(
            AppColors.surfaceSheet,
            AppColors.onSurfaceMuted.withValues(alpha: 0.28),
            t,
          )!,
        );
      },
    );
  }
}
