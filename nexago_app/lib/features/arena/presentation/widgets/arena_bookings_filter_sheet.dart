import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_bookings_filter.dart';
import '../../domain/arena_bookings_providers.dart';
import '../../domain/arena_court_providers.dart';

/// Abre os filtros da aba Reservas. Cada toque aplica na hora (a lista atrás
/// da folha já muda).
Future<void> showArenaBookingsFilterSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    builder: (_) => const ArenaBookingsFilterSheet(),
  );
}

class ArenaBookingsFilterSheet extends ConsumerWidget {
  const ArenaBookingsFilterSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(arenaBookingsFilterProvider);
    final courts =
        ref.watch(arenaManagedCourtsProvider).valueOrNull ?? const [];
    final bookings =
        ref.watch(arenaManagerBookingsStreamProvider).valueOrNull ?? const [];
    final sports = bookings
        .map((b) => arenaBookingSportLabel(b.data))
        .whereType<String>()
        .toSet()
        .toList()
      ..sort();
    void set(ArenaBookingsFilter next) =>
        ref.read(arenaBookingsFilterProvider.notifier).state = next;

    Set<T> toggle<T>(Set<T> current, T value) => current.contains(value)
        ? ({...current}..remove(value))
        : {...current, value};

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Filtrar reservas',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
                if (!filter.isEmpty)
                  TextButton(
                    key: const Key('arena-bookings-filter-clear'),
                    onPressed: () => set(const ArenaBookingsFilter()),
                    child: const Text('Limpar'),
                  ),
              ],
            ),
            if (courts.isNotEmpty)
              _Group(
                title: 'Quadra',
                children: [
                  for (final c in courts)
                    _Chip(
                      label: c.name,
                      selected: filter.courtIds.contains(c.id),
                      onTap: () => set(
                        filter.copyWith(
                          courtIds: toggle(filter.courtIds, c.id),
                        ),
                      ),
                    ),
                ],
              ),
            _Group(
              title: 'Pagamento',
              children: [
                for (final p in ArenaPaymentFilter.values)
                  _Chip(
                    label: p.label,
                    selected: filter.payments.contains(p),
                    onTap: () => set(
                      filter.copyWith(payments: toggle(filter.payments, p)),
                    ),
                  ),
              ],
            ),
            _Group(
              title: 'Tipo',
              children: [
                for (final t in ArenaBookingTypeFilter.values)
                  _Chip(
                    label: t.label,
                    selected: filter.types.contains(t),
                    onTap: () => set(
                      filter.copyWith(types: toggle(filter.types, t)),
                    ),
                  ),
              ],
            ),
            if (sports.isNotEmpty)
              _Group(
                title: 'Esporte',
                children: [
                  for (final s in sports)
                    _Chip(
                      label: s,
                      selected: filter.sports.contains(s),
                      onTap: () => set(
                        filter.copyWith(sports: toggle(filter.sports, s)),
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Ver reservas'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: children),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      showCheckmark: false,
      labelStyle: TextStyle(
        fontWeight: FontWeight.w700,
        color: selected ? colors.brandText : colors.onSurface,
      ),
      backgroundColor: colors.surfaceRaised,
      selectedColor: AppColors.brand.withValues(alpha: 0.16),
      side: BorderSide(
        color: selected
            ? AppColors.brand
            : colors.onSurfaceMuted.withValues(alpha: 0.2),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    );
  }
}
