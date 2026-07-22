import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../athlete/domain/arena_review_providers.dart';
import '../../athlete/domain/arena_reputation.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../domain/arena_detail_providers.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_detail_logic.dart';
import '../domain/arenas_providers.dart';
import '../../athlete/domain/arena_review.dart';
import '../domain/nearby_arenas_logic.dart';
import 'arena_booking_navigation.dart';
import 'widgets/arena_detail/arena_detail_amenity_chips.dart';
import 'widgets/arena_detail/arena_detail_bottom_cta.dart';
import 'widgets/arena_detail/arena_detail_club_section.dart';
import 'widgets/arena_detail/arena_detail_court_card.dart';
import 'widgets/arena_detail/arena_detail_hero.dart';
import 'widgets/arena_detail/arena_detail_metrics_bar.dart';
import 'widgets/arena_detail/arena_detail_reviews_section.dart';

/// Detalhe da arena (protótipo NexaGO — dark-first).
class ArenaDetailPage extends ConsumerWidget {
  const ArenaDetailPage({
    super.key,
    required this.arenaId,
    this.initialArena,
    this.isBestPrice = false,
  });

  final String arenaId;
  final ArenaListItem? initialArena;
  final bool isBestPrice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncArena = ref.watch(arenaByIdProvider(arenaId));
    final reputationAsync = ref.watch(arenaReputationProvider(arenaId));
    final todayAsync = ref.watch(arenaDetailTodayCourtsProvider(arenaId));
    final reviewsAsync = ref.watch(arenaReviewsStreamProvider(arenaId));

    return asyncArena.when(
      data: (remote) {
        final arena = remote ?? initialArena;
        if (arena == null) {
          return Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: AppEmptyView(
              icon: Icons.search_off_rounded,
              title: 'Arena não encontrada',
              subtitle:
                  'Este link pode estar desatualizado ou a arena foi removida.',
              actionLabel: 'Voltar',
              onAction: () => context.pop(),
            ),
          );
        }
        return FadeSlideIn(
          child: _ArenaDetailBody(
            arena: arena,
            isBestPrice: isBestPrice,
            reputation: reputationAsync.valueOrNull,
            todaySummary: todayAsync.valueOrNull,
            todayLoading: todayAsync.isLoading,
            reviews: reviewsAsync.valueOrNull ?? const [],
            reviewsLoading: reviewsAsync.isLoading,
          ),
        );
      },
      loading: () {
        if (initialArena != null) {
          return FadeSlideIn(
            child: _ArenaDetailBody(
              arena: initialArena!,
              isBestPrice: isBestPrice,
              reputation: reputationAsync.valueOrNull,
              todaySummary: todayAsync.valueOrNull,
              todayLoading: todayAsync.isLoading,
              reviews: reviewsAsync.valueOrNull ?? const [],
              reviewsLoading: reviewsAsync.isLoading,
            ),
          );
        }
        return Scaffold(
          backgroundColor: context.themeColors.canvas,
          body: AppLoadingView(message: 'Carregando detalhes…'),
        );
      },
      error: (e, _) => Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: AppErrorView(
          title: 'Não foi possível carregar',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () => ref.invalidate(arenaByIdProvider(arenaId)),
        ),
      ),
    );
  }
}

class _ArenaDetailBody extends ConsumerStatefulWidget {
  const _ArenaDetailBody({
    required this.arena,
    required this.isBestPrice,
    required this.reputation,
    required this.todaySummary,
    required this.todayLoading,
    required this.reviews,
    required this.reviewsLoading,
  });

  final ArenaListItem arena;
  final bool isBestPrice;
  final ArenaReputation? reputation;
  final ArenaDetailTodaySummary? todaySummary;
  final bool todayLoading;
  final List<ArenaReview> reviews;
  final bool reviewsLoading;

  @override
  ConsumerState<_ArenaDetailBody> createState() => _ArenaDetailBodyState();
}

class _ArenaDetailBodyState extends ConsumerState<_ArenaDetailBody> {
  bool? _favoriteOverride;
  bool _favoritePending = false;

  static final _kmFormat = NumberFormat.decimalPattern('pt_BR');

  void _openSlots({String? courtId}) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    openArenaBookingSlots(
      context,
      arena: widget.arena,
      date: today,
      courtId: courtId,
    );
  }

  String _locationLine() {
    final arena = widget.arena;
    final city = arena.city?.trim() ?? '';
    final state = arena.state?.trim() ?? '';
    String base;
    if (city.isNotEmpty && state.isNotEmpty) {
      base = '$city, $state';
    } else if (city.isNotEmpty) {
      base = city;
    } else {
      base = arena.locationLabel;
    }

    final location = ref.watch(userLocationProvider).valueOrNull;
    final km = location != null
        ? kmFromUserToArena(arena, location)
        : null;
    if (km != null) {
      final kmLabel = _kmFormat.format(km);
      return '$base · $kmLabel km';
    }
    return base;
  }

  Future<void> _toggleFavorite() async {
    final userId = ref.read(authProvider).valueOrNull?.uid;
    if (userId == null || userId.isEmpty) {
      showAppSnackBar(context, 'Faça login para seguir arenas.', isError: true);
      return;
    }
    if (_favoritePending) return;

    final favoriteIds =
        ref.read(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];
    final isFavorite =
        _favoriteOverride ?? favoriteIds.contains(widget.arena.id);
    final next = !isFavorite;

    setState(() {
      _favoriteOverride = next;
      _favoritePending = true;
    });

    try {
      await ref.read(favoritesServiceProvider).toggleFavoriteArena(
            userId: userId,
            arenaId: widget.arena.id,
            isFavorite: isFavorite,
          );
      if (!mounted) return;
      setState(() {
        _favoritePending = false;
        _favoriteOverride = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _favoritePending = false;
        _favoriteOverride = null;
      });
      showAppSnackBar(
        context,
        'Não foi possível atualizar seguidores agora.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arena = widget.arena;
    final reputation = widget.reputation;
    final today = widget.todaySummary;
    final reviews = widget.reviews;

    final favoriteIds =
        ref.watch(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];
    final isFavorite =
        _favoriteOverride ?? favoriteIds.contains(arena.id);

    final score = reputation?.score ?? arena.reputationScore;
    final rating = reputation?.ratingAverage ?? arena.ratingAverage;
    final reviewsCount = reputation?.reviewsCount ?? arena.reviewsCount;
    final totalCourts = today?.totalActiveCourts ?? 0;
    final freeCourts = today?.freeCourtsToday ?? 0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Column(
        children: [
          Expanded(
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: ArenaDetailHero(
                    arenaId: arena.id,
                    coverUrl: arena.coverUrl,
                    isBestPrice: widget.isBestPrice,
                    isFavorite: isFavorite,
                    isFavoritePending: _favoritePending,
                    onBack: () => context.pop(),
                    onToggleFavorite: _toggleFavorite,
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      Text(
                        arena.name,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: context.themeColors.onSurface,
                          letterSpacing: -0.5,
                          height: 1.15,
                        ),
                      ),
                      SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.place_outlined,
                            size: 18,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                          SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _locationLine(),
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                fontWeight: FontWeight.w600,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 16),
                      ArenaDetailMetricsBar(
                        score: score,
                        rating: rating,
                        reviewsCount: reviewsCount,
                        totalCourts: totalCourts,
                        freeCourtsToday: freeCourts,
                      ),
                      if (arena.amenities.hasAny) ...[
                        SizedBox(height: 20),
                        ArenaDetailAmenityChips(amenities: arena.amenities),
                      ],
                      SizedBox(height: 24),
                      Text(
                        'Quadras',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                          letterSpacing: -0.3,
                        ),
                      ),
                      SizedBox(height: 12),
                      if (widget.todayLoading && today == null)
                        Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(
                            child: CircularProgressIndicator(
                              color: AppColors.brand,
                            ),
                          ),
                        )
                      else if (today == null || today.courts.isEmpty)
                        Text(
                          'Nenhuma quadra cadastrada ainda.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        )
                      else
                        ...[
                          for (var i = 0; i < today.courts.length; i++) ...[
                            if (i > 0) SizedBox(height: 10),
                            ArenaDetailCourtCard(
                              arena: arena,
                              summary: today.courts[i],
                              arenaFallbackPricePerHour: arena.pricePerHourReais,
                              onTap: () => _openSlots(
                                courtId: today.courts[i].court.id,
                              ),
                            ),
                          ],
                        ],
                      ArenaDetailClubSection(arenaId: arena.id),
                      SizedBox(height: 28),
                      if (widget.reviewsLoading && reviews.isEmpty)
                        Center(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator(
                              color: AppColors.brand,
                              strokeWidth: 2,
                            ),
                          ),
                        )
                      else
                        ArenaDetailReviewsSection(
                          reviews: reviews,
                          now: DateTime.now(),
                          onViewAll: reviews.isNotEmpty
                              ? () => context.pushNamed(
                                    AppRouteNames.arenaReviews,
                                    pathParameters: {'arenaId': arena.id},
                                    queryParameters: {
                                      'arenaName': arena.name,
                                      if (arena.city?.trim().isNotEmpty == true)
                                        'arenaCity': arena.city!.trim(),
                                    },
                                  )
                              : null,
                        ),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          ArenaDetailBottomCta(onPressed: () => _openSlots()),
        ],
      ),
    );
  }
}
