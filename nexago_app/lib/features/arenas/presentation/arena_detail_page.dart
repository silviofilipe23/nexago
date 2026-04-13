import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_list_item.dart';
import '../domain/arenas_providers.dart';
import 'widgets/arena_header_image.dart';
import 'widgets/arena_logo.dart';

/// Detalhe da arena: carrossel, Hero da capa, conteúdo estilo Airbnb e CTA para horários.
class ArenaDetailPage extends ConsumerWidget {
  const ArenaDetailPage({
    super.key,
    required this.arenaId,
    this.initialArena,
  });

  final String arenaId;
  final ArenaListItem? initialArena;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 0,
  );

  static String formatPrice(double v) => _currency.format(v);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncArena = ref.watch(arenaByIdProvider(arenaId));

    return asyncArena.when(
      data: (remote) {
        final arena = remote ?? initialArena;
        if (arena == null) {
          return AppScaffold(
            title: 'Arena',
            body: AppEmptyView(
              icon: Icons.search_off_rounded,
              title: 'Arena não encontrada',
              subtitle: 'Este link pode estar desatualizado ou a arena foi removida.',
              actionLabel: 'Voltar',
              onAction: () => context.pop(),
            ),
          );
        }
        return FadeSlideIn(child: _ArenaDetailBody(arena: arena));
      },
      loading: () {
        if (initialArena != null) {
          return FadeSlideIn(child: _ArenaDetailBody(arena: initialArena!));
        }
        return AppScaffold(
          title: '',
          body: const AppLoadingView(message: 'Carregando detalhes…'),
        );
      },
      error: (e, _) => AppScaffold(
        title: 'Arena',
        body: AppErrorView(
          title: 'Não foi possível carregar',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () => ref.invalidate(arenaByIdProvider(arenaId)),
        ),
      ),
    );
  }
}

class _ArenaDetailBody extends StatefulWidget {
  const _ArenaDetailBody({required this.arena});

  final ArenaListItem arena;

  @override
  State<_ArenaDetailBody> createState() => _ArenaDetailBodyState();
}

class _ArenaDetailBodyState extends State<_ArenaDetailBody> {
  static const double _coverHeight = 292;

  void _openSlots() {
    context.pushNamed(
      AppRouteNames.arenaSlots,
      pathParameters: {'arenaId': widget.arena.id},
      extra: widget.arena,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arena = widget.arena;
    final descriptionText = arena.description?.trim();
    final hasDescription = descriptionText != null && descriptionText.isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.white,
      body: Column(
        children: [
          Expanded(
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ArenaHeaderImage(
                        arenaId: arena.id,
                        coverUrl: arena.coverUrl,
                        height: _coverHeight,
                      ),
                      Positioned(
                        top: MediaQuery.paddingOf(context).top + 8,
                        left: 8,
                        child: Material(
                          color: Colors.white.withValues(alpha: 0.92),
                          shape: const CircleBorder(),
                          clipBehavior: Clip.antiAlias,
                          child: IconButton(
                            icon: const Icon(Icons.arrow_back_rounded),
                            onPressed: () => context.pop(),
                            tooltip: 'Voltar',
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: -42,
                        left: 28,
                        child: ArenaLogo(logoUrl: arena.logoUrl, size: 86),
                      ),
                    ],
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(28, 56, 28, 120),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      Text(
                        arena.name,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.5,
                          height: 1.15,
                          color: AppColors.black,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(
                              Icons.place_outlined,
                              size: 22,
                              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              arena.locationLabel,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w500,
                                color: theme.colorScheme.onSurface.withValues(alpha: 0.72),
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 40),
                      Text(
                        'Sobre o espaço',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        hasDescription
                            ? descriptionText
                            : 'Esta arena ainda não possui uma descrição detalhada. Entre em contato para mais informações.',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          height: 1.65,
                          fontSize: 16,
                          color: theme.colorScheme.onSurface.withValues(alpha: hasDescription ? 0.82 : 0.55),
                        ),
                      ),
                      const SizedBox(height: 40),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 22),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: theme.colorScheme.outline.withValues(alpha: 0.08),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Preço por hora',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  ArenaDetailPage.formatPrice(arena.pricePerHourReais),
                                  style: theme.textTheme.headlineSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: theme.colorScheme.primary,
                                    letterSpacing: -0.5,
                                  ),
                                ),
                              ],
                            ),
                            Icon(
                              Icons.schedule_rounded,
                              size: 36,
                              color: theme.colorScheme.primary.withValues(alpha: 0.35),
                            ),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          Material(
            elevation: 12,
            shadowColor: Colors.black.withValues(alpha: 0.12),
            color: AppColors.white,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _openSlots,
                    style: FilledButton.styleFrom(
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Ver horários',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
