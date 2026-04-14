import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_providers.dart';
import '../../core/layout/app_scaffold.dart';
import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/ui/app_status_views.dart';
import '../../core/ui/fade_slide_in.dart';
import '../arena/domain/arena_access_provider.dart';
import '../arenas/domain/arena_list_item.dart';
import '../arenas/domain/arenas_providers.dart';
import '../arenas/presentation/widgets/arena_card.dart';

/// Home de descoberta de quadras (estilo Airbnb): lista + cards a partir do Firestore.
class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    final arenasAsync = ref.watch(arenasStreamProvider);
    final arenaPanelAsync = ref.watch(arenaPanelAccessProvider);

    return AppScaffold(
      title: 'Descobrir',
      actions: [
        ...arenaPanelAsync.maybeWhen(
          data: (allowed) => allowed
              ? [
                  IconButton(
                    tooltip: 'Painel da arena',
                    onPressed: () => context.push(AppRoutes.arenaDashboard),
                    icon: const Icon(Icons.admin_panel_settings_outlined),
                  ),
                ]
              : <Widget>[],
          orElse: () => <Widget>[],
        ),
        IconButton(
          tooltip: 'Meu perfil',
          onPressed: () => context.pushNamed(AppRouteNames.athleteProfile),
          icon: const Icon(Icons.person_outline_rounded),
        ),
        IconButton(
          tooltip: 'Minhas reservas',
          onPressed: () => context.pushNamed(AppRouteNames.myBookings),
          icon: const Icon(Icons.event_note_rounded),
        ),
        IconButton(
          tooltip: 'Sair',
          onPressed: () async {
            await ref.read(authServiceProvider).signOut();
          },
          icon: const Icon(Icons.logout_rounded),
        ),
      ],
      body: SafeArea(
        child: arenasAsync.when(
          data: (arenas) => _FadeInArenaList(
            key: ValueKey(arenas.length),
            arenas: arenas,
            userEmail: user?.email,
          ),
          loading: () => const AppLoadingView(message: 'Carregando quadras…'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar',
            message:
                'Verifique sua conexão e tente de novo.\n${e.toString().replaceFirst('Exception: ', '')}',
            onRetry: () => ref.invalidate(arenasStreamProvider),
          ),
        ),
      ),
    );
  }
}

class _FadeInArenaList extends StatefulWidget {
  const _FadeInArenaList({
    super.key,
    required this.arenas,
    this.userEmail,
  });

  final List<ArenaListItem> arenas;
  final String? userEmail;

  @override
  State<_FadeInArenaList> createState() => _FadeInArenaListState();
}

class _FadeInArenaListState extends State<_FadeInArenaList>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _fade = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return FadeTransition(
      opacity: _fade,
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Quadras perto de você',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.4,
                      color: AppColors.black,
                    ),
                  ),
                  if (widget.userEmail != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      widget.userEmail!,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (widget.arenas.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: AppEmptyView(
                icon: Icons.sports_volleyball_outlined,
                title: 'Nenhuma arena ainda',
                subtitle:
                    'Quando houver arenas cadastradas no Firestore, elas aparecerão aqui para você reservar.',
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
              sliver: SliverList.separated(
                itemCount: widget.arenas.length,
                separatorBuilder: (context, index) => const SizedBox(height: 20),
                itemBuilder: (context, index) {
                  final arena = widget.arenas[index];
                  return staggeredFadeSlide(
                    index: index,
                    child: ArenaCard(
                      arena: arena,
                      onTap: () => context.pushNamed(
                        AppRouteNames.arenaDetail,
                        pathParameters: {'arenaId': arena.id},
                        extra: arena,
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
