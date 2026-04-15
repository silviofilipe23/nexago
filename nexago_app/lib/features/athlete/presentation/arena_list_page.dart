import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../../arenas/domain/slots_query.dart';
import '../../arenas/presentation/widgets/arena_card.dart';
import '../domain/favorites_providers.dart';
import '../domain/gamification_providers.dart';
import 'favorite_success_page.dart';

/// Aba Reservar — lista de arenas para o atleta escolher e reservar horário.
class ArenaListPage extends ConsumerStatefulWidget {
  const ArenaListPage({super.key});

  @override
  ConsumerState<ArenaListPage> createState() => _ArenaListPageState();
}

class _ArenaListPageState extends ConsumerState<ArenaListPage> {
  static final DateFormat _dateFmt = DateFormat("EEE, dd 'de' MMM", 'pt_BR');
  late DateTime _selectedDate;
  late TimeOfDay _selectedTime;
  final Map<String, bool> _favoriteOverrides = <String, bool>{};
  final Set<String> _favoritePendingArenaIds = <String>{};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedDate = DateTime(now.year, now.month, now.day);
    final roundedMinute = now.minute >= 30 ? 30 : 0;
    _selectedTime = TimeOfDay(hour: now.hour, minute: roundedMinute);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final userId = ref.watch(authProvider).valueOrNull?.uid;
    final favoriteIdsAsync = ref.watch(favoriteArenaIdsProvider);
    final favoriteIds = favoriteIdsAsync.valueOrNull ?? const <String>[];
    final favoriteIdsSet = favoriteIds.toSet();
    final filters = ArenaSearchFilters(
      date: _selectedDate,
      requestedTime: _selectedTime,
    );
    final resultsAsync = ref.watch(arenaSearchResultsProvider(filters));

    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: resultsAsync.when(
        loading: () => const AppLoadingView(message: 'Carregando arenas...'),
        error: (e, _) => AppErrorView(
          title: 'Não foi possível carregar horários',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () => ref.invalidate(arenaSearchResultsProvider(filters)),
        ),
        data: (results) {
          final enriched = results
              .map(
                (r) => _ArenaDisplayItem(
                  result: r,
                  isFavorite: _favoriteOverrides[r.arena.id] ??
                      favoriteIdsSet.contains(r.arena.id),
                ),
              )
              .toList(growable: false)
            ..sort((a, b) {
              if (a.isFavorite != b.isFavorite) {
                return a.isFavorite ? -1 : 1;
              }
              return _compareResults(a.result, b.result);
            });

          return _ArenaBookingList(
            filters: filters,
            displayItems: enriched,
            onChangeDate: _pickDate,
            onChangeTime: _pickTime,
            onToggleFavorite: (arenaId, isFavorite) => _toggleFavorite(
              userId: userId,
              arenaId: arenaId,
              isFavorite: isFavorite,
            ),
            isFavoritePending: (arenaId) =>
                _favoritePendingArenaIds.contains(arenaId),
          );
        },
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1),
      locale: const Locale('pt', 'BR'),
    );
    if (picked == null) return;
    setState(
        () => _selectedDate = DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked == null) return;
    setState(() => _selectedTime = picked);
  }

  Future<void> _toggleFavorite({
    required String? userId,
    required String arenaId,
    required bool isFavorite,
  }) async {
    if (userId == null || userId.isEmpty) {
      showAppSnackBar(
        context,
        'Faça login para favoritar arenas.',
        isError: true,
      );
      return;
    }
    if (_favoritePendingArenaIds.contains(arenaId)) return;

    final next = !isFavorite;
    setState(() {
      _favoriteOverrides[arenaId] = next;
      _favoritePendingArenaIds.add(arenaId);
    });

    try {
      await ref.read(favoritesServiceProvider).toggleFavoriteArena(
            userId: userId,
            arenaId: arenaId,
            isFavorite: isFavorite,
          );
      if (!mounted) return;
      setState(() {
        _favoritePendingArenaIds.remove(arenaId);
        _favoriteOverrides.remove(arenaId);
      });
      if (next) {
        await ref.read(gamificationServiceProvider).onArenaFavorited(
              userId: userId,
              arenaId: arenaId,
            );
        if (!mounted) return;
        await FavoriteSuccessPage.show(context);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _favoritePendingArenaIds.remove(arenaId);
        _favoriteOverrides.remove(arenaId);
      });
      showAppSnackBar(
        context,
        'Não foi possível atualizar favoritos agora.',
        isError: true,
      );
    }
  }
}

@immutable
class ArenaSearchFilters {
  const ArenaSearchFilters({
    required this.date,
    required this.requestedTime,
  });

  final DateTime date;
  final TimeOfDay requestedTime;

  int get requestedMinutes => requestedTime.hour * 60 + requestedTime.minute;

  DateTime get dateOnly => DateTime(date.year, date.month, date.day);

  String get requestedTimeLabel {
    final hh = requestedTime.hour.toString().padLeft(2, '0');
    final mm = requestedTime.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ArenaSearchFilters &&
        other.dateOnly.year == dateOnly.year &&
        other.dateOnly.month == dateOnly.month &&
        other.dateOnly.day == dateOnly.day &&
        other.requestedMinutes == requestedMinutes;
  }

  @override
  int get hashCode => Object.hash(
      dateOnly.year, dateOnly.month, dateOnly.day, requestedMinutes);
}

class ArenaSearchResult {
  const ArenaSearchResult({
    required this.arena,
    required this.selectedSlot,
    required this.courtName,
    required this.isExactMatch,
    required this.minutesDistance,
  });

  final ArenaListItem arena;
  final ArenaSlot? selectedSlot;
  final String? courtName;
  final bool isExactMatch;
  final int? minutesDistance;

  bool get hasAvailability => selectedSlot != null;
}

class _ArenaDisplayItem {
  const _ArenaDisplayItem({
    required this.result,
    required this.isFavorite,
  });

  final ArenaSearchResult result;
  final bool isFavorite;
}

final arenaSearchResultsProvider = FutureProvider.autoDispose
    .family<List<ArenaSearchResult>, ArenaSearchFilters>(
  (ref, filters) async {
    final arenas = await ref.watch(arenasStreamProvider.future);
    final results = await Future.wait(
      arenas.map((arena) => _buildArenaResult(ref, filters, arena)),
    );
    results.sort(_compareResults);
    return results;
  },
);

Future<ArenaSearchResult> _buildArenaResult(
  Ref ref,
  ArenaSearchFilters filters,
  ArenaListItem arena,
) async {
  final courts = await ref.watch(courtsStreamProvider(arena.id).future);
  if (courts.isEmpty) {
    return ArenaSearchResult(
      arena: arena,
      selectedSlot: null,
      courtName: null,
      isExactMatch: false,
      minutesDistance: null,
    );
  }

  final allSlots = <({ArenaSlot slot, ArenaCourt court})>[];
  for (final court in courts) {
    final query = SlotsQuery(
      arenaId: arena.id,
      courtId: court.id,
      date: filters.dateOnly,
      fallbackPriceReais: arena.pricePerHourReais,
    );
    final slots = await ref.watch(slotsStreamProvider(query).future);
    for (final slot in slots) {
      if (!slot.isAvailable) continue;
      if (_isPastSlot(filters.dateOnly, slot.startTime)) continue;
      allSlots.add((slot: slot, court: court));
    }
  }

  if (allSlots.isEmpty) {
    return ArenaSearchResult(
      arena: arena,
      selectedSlot: null,
      courtName: null,
      isExactMatch: false,
      minutesDistance: null,
    );
  }

  ({ArenaSlot slot, ArenaCourt court})? exact;
  ({ArenaSlot slot, ArenaCourt court})? nearest;
  int? nearestDistance;
  int? nearestSignedDelta;
  final requested = filters.requestedMinutes;

  for (final entry in allSlots) {
    final startMinutes = _timeToMinutes(entry.slot.startTime);
    if (startMinutes == requested) {
      exact = entry;
      break;
    }

    final signedDelta = startMinutes - requested;
    final distance = signedDelta.abs();
    final replaceCurrent = nearestDistance == null ||
        distance < nearestDistance ||
        (distance == nearestDistance &&
            _preferSignedDelta(signedDelta, nearestSignedDelta));
    if (replaceCurrent) {
      nearest = entry;
      nearestDistance = distance;
      nearestSignedDelta = signedDelta;
    }
  }

  final picked = exact ?? nearest;
  return ArenaSearchResult(
    arena: arena,
    selectedSlot: picked?.slot,
    courtName: picked?.court.name,
    isExactMatch: exact != null,
    minutesDistance: exact != null ? 0 : nearestDistance,
  );
}

bool _preferSignedDelta(int candidate, int? current) {
  if (current == null) return true;
  if (candidate >= 0 && current < 0) return true;
  return false;
}

int _compareResults(ArenaSearchResult a, ArenaSearchResult b) {
  final aRank = a.isExactMatch ? 0 : (a.hasAvailability ? 1 : 2);
  final bRank = b.isExactMatch ? 0 : (b.hasAvailability ? 1 : 2);
  if (aRank != bRank) return aRank.compareTo(bRank);

  final aDist = a.minutesDistance ?? 99999;
  final bDist = b.minutesDistance ?? 99999;
  if (aDist != bDist) return aDist.compareTo(bDist);
  return a.arena.name.toLowerCase().compareTo(b.arena.name.toLowerCase());
}

bool _isPastSlot(DateTime selectedDate, String startTime) {
  final now = DateTime.now();
  final day = DateTime(selectedDate.year, selectedDate.month, selectedDate.day);
  final today = DateTime(now.year, now.month, now.day);
  if (day.isAfter(today)) return false;
  if (day.isBefore(today)) return true;
  final minutes = _timeToMinutes(startTime);
  final startAt =
      DateTime(day.year, day.month, day.day, minutes ~/ 60, minutes % 60);
  return startAt.isBefore(now);
}

int _timeToMinutes(String value) {
  final parts = value.split(':');
  final hh = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return hh * 60 + mm;
}

class _ArenaBookingList extends StatelessWidget {
  const _ArenaBookingList({
    required this.filters,
    required this.displayItems,
    required this.onChangeDate,
    required this.onChangeTime,
    required this.onToggleFavorite,
    required this.isFavoritePending,
  });

  final ArenaSearchFilters filters;
  final List<_ArenaDisplayItem> displayItems;
  final VoidCallback onChangeDate;
  final VoidCallback onChangeTime;
  final void Function(String arenaId, bool isFavorite) onToggleFavorite;
  final bool Function(String arenaId) isFavoritePending;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateLabel = _ArenaListPageState._dateFmt.format(filters.dateOnly);
    final timeLabel = filters.requestedTimeLabel;

    final favoriteItems =
        displayItems.where((x) => x.isFavorite).toList(growable: false);

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 10),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Buscar horários',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                    color: AppColors.black,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Selecione data e horário para encontrar o melhor slot em cada arena.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onChangeDate,
                        icon:
                            const Icon(Icons.calendar_today_rounded, size: 18),
                        label: Text(dateLabel),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onChangeTime,
                        icon: const Icon(Icons.schedule_rounded, size: 18),
                        label: Text(timeLabel),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (displayItems.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: AppEmptyView(
              icon: Icons.sports_volleyball_outlined,
              title: 'Nenhuma arena disponível',
              subtitle:
                  'Quando houver arenas cadastradas, elas aparecerão aqui.',
            ),
          )
        else ...[
          if (favoriteItems.isNotEmpty) ...[
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              sliver: SliverToBoxAdapter(
                child: Text(
                  'Suas arenas favoritas',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 132,
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  itemCount: favoriteItems.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    final item = favoriteItems[index];
                    return _FavoriteArenaMiniCard(
                      arena: item.result.arena,
                      onTap: () => _goToArenaDetail(context, item.result.arena),
                      isPending: isFavoritePending(item.result.arena.id),
                      onToggleFavorite: isFavoritePending(item.result.arena.id)
                          ? null
                          : () => onToggleFavorite(item.result.arena.id, true),
                    );
                  },
                ),
              ),
            ),
          ],
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
            sliver: SliverList.separated(
              itemCount: displayItems.length,
              separatorBuilder: (context, index) => const SizedBox(height: 20),
              itemBuilder: (context, index) {
                final item = displayItems[index];
                final result = item.result;
                return staggeredFadeSlide(
                  index: index,
                  child: _ArenaSearchCard(
                    result: result,
                    isFavorite: item.isFavorite,
                    isFavoritePending: isFavoritePending(result.arena.id),
                    onOpenArena: () => _goToArenaDetail(context, result.arena),
                    onToggleFavorite: isFavoritePending(result.arena.id)
                        ? null
                        : () =>
                            onToggleFavorite(result.arena.id, item.isFavorite),
                    onReserve: result.hasAvailability
                        ? () => _goToArenaSlots(
                              context,
                              arena: result.arena,
                              slot: result.selectedSlot,
                              date: filters.dateOnly,
                            )
                        : null,
                  ),
                );
              },
            ),
          ),
        ],
      ],
    );
  }
}

class _ArenaSearchCard extends StatelessWidget {
  const _ArenaSearchCard({
    required this.result,
    required this.isFavorite,
    required this.isFavoritePending,
    required this.onOpenArena,
    required this.onToggleFavorite,
    required this.onReserve,
  });

  final ArenaSearchResult result;
  final bool isFavorite;
  final bool isFavoritePending;
  final VoidCallback onOpenArena;
  final VoidCallback? onToggleFavorite;
  final VoidCallback? onReserve;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final slot = result.selectedSlot;
    final message = switch ((result.isExactMatch, slot != null)) {
      (true, true) => '🔥 ${slot!.startTime} disponível',
      (false, true) => 'Próximo: ${slot!.startTime}',
      _ => 'Sem disponibilidade no dia selecionado',
    };
    final messageColor = result.isExactMatch
        ? const Color(0xFF2E7D32)
        : (slot != null ? const Color(0xFFEF6C00) : AppColors.onSurfaceMuted);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaCard(
              arena: result.arena,
              onTap: onOpenArena,
              isFavorite: isFavorite,
              isFavoriteBusy: isFavoritePending,
              onToggleFavorite: onToggleFavorite,
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                message,
                style: theme.textTheme.titleSmall?.copyWith(
                  color: messageColor,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (result.courtName != null && result.courtName!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  result.courtName!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              height: 46,
              child: FilledButton(
                onPressed: onReserve,
                child: const Text('Reservar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FavoriteArenaMiniCard extends StatelessWidget {
  const _FavoriteArenaMiniCard({
    required this.arena,
    required this.onTap,
    required this.isPending,
    required this.onToggleFavorite,
  });

  final ArenaListItem arena;
  final VoidCallback onTap;
  final bool isPending;
  final VoidCallback? onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 220,
      child: Material(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            children: [
              Positioned.fill(
                child: Image.network(
                  arena.imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => ColoredBox(
                    color: theme.colorScheme.surfaceContainerHighest,
                  ),
                ),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.18),
                        Colors.black.withValues(alpha: 0.48),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Material(
                  color: Colors.black.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(999),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: onToggleFavorite,
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        transitionBuilder: (child, animation) => FadeTransition(
                          opacity: animation,
                          child: ScaleTransition(
                            scale: Tween<double>(begin: 0.86, end: 1)
                                .animate(animation),
                            child: child,
                          ),
                        ),
                        child: isPending
                            ? const SizedBox(
                                key: ValueKey<String>('mini_favorite_busy'),
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(
                                Icons.favorite,
                                key: ValueKey<String>('mini_favorite_icon'),
                                color: Color(0xFFE53935),
                                size: 20,
                              ),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Text(
                  arena.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
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

void _goToArenaDetail(BuildContext context, ArenaListItem arena) {
  context.pushNamed(
    AppRouteNames.arenaDetail,
    pathParameters: {'arenaId': arena.id},
    extra: arena,
  );
}

void _goToArenaSlots(
  BuildContext context, {
  required ArenaListItem arena,
  required ArenaSlot? slot,
  required DateTime date,
}) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  final dateKey = '$y-$m-$d';
  context.pushNamed(
    AppRouteNames.arenaSlots,
    pathParameters: {'arenaId': arena.id},
    queryParameters: <String, String>{
      if (slot?.courtId.trim().isNotEmpty == true)
        'courtId': slot!.courtId.trim(),
      if (slot?.startTime.trim().isNotEmpty == true)
        'startTime': slot!.startTime.trim(),
      'date': dateKey,
    },
    extra: arena,
  );
}
