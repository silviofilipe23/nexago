import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../../arenas/domain/slots_query.dart';
import '../../arenas/presentation/widgets/arena_card.dart';

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
        data: (results) => _ArenaBookingList(
          filters: filters,
          results: results,
          onChangeDate: _pickDate,
          onChangeTime: _pickTime,
        ),
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
    setState(() => _selectedDate = DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked == null) return;
    setState(() => _selectedTime = picked);
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
  int get hashCode => Object.hash(dateOnly.year, dateOnly.month, dateOnly.day, requestedMinutes);
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

final arenaSearchResultsProvider =
    FutureProvider.autoDispose.family<List<ArenaSearchResult>, ArenaSearchFilters>(
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
        (distance == nearestDistance && _preferSignedDelta(signedDelta, nearestSignedDelta));
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
  final startAt = DateTime(day.year, day.month, day.day, minutes ~/ 60, minutes % 60);
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
    required this.results,
    required this.onChangeDate,
    required this.onChangeTime,
  });

  final ArenaSearchFilters filters;
  final List<ArenaSearchResult> results;
  final VoidCallback onChangeDate;
  final VoidCallback onChangeTime;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateLabel = _ArenaListPageState._dateFmt.format(filters.dateOnly);
    final timeLabel = filters.requestedTimeLabel;

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
                        icon: const Icon(Icons.calendar_today_rounded, size: 18),
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
        if (results.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: AppEmptyView(
              icon: Icons.sports_volleyball_outlined,
              title: 'Nenhuma arena disponível',
              subtitle: 'Quando houver arenas cadastradas, elas aparecerão aqui.',
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
            sliver: SliverList.separated(
              itemCount: results.length,
              separatorBuilder: (_, __) => const SizedBox(height: 20),
              itemBuilder: (context, index) {
                final result = results[index];
                return staggeredFadeSlide(
                  index: index,
                  child: _ArenaSearchCard(
                    result: result,
                    onOpenArena: () => _goToArenaDetail(context, result.arena),
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
    );
  }
}

class _ArenaSearchCard extends StatelessWidget {
  const _ArenaSearchCard({
    required this.result,
    required this.onOpenArena,
    required this.onReserve,
  });

  final ArenaSearchResult result;
  final VoidCallback onOpenArena;
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
            ArenaCard(arena: result.arena, onTap: onOpenArena),
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
      if (slot?.courtId.trim().isNotEmpty == true) 'courtId': slot!.courtId.trim(),
      if (slot?.startTime.trim().isNotEmpty == true) 'startTime': slot!.startTime.trim(),
      'date': dateKey,
    },
    extra: arena,
  );
}
