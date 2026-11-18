import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_booking_card_pills.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_bookings_filter.dart';
import '../../domain/arena_bookings_providers.dart';
import '../../domain/arena_court_providers.dart';
import '../../domain/arena_date_utils.dart';
import 'arena_booking_card.dart';

/// Altura máxima da folha (o resto da tela continua à mostra).
const double _maxSheetHeightFactor = 0.85;

/// Abre os filtros da aba Reservas. Cada toque aplica na hora (a lista atrás
/// da folha já muda); "Ver reservas" só fecha a folha.
Future<void> showArenaBookingsFilterSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    builder: (_) => const ArenaBookingsFilterSheet(),
  );
}

/// Folha "Filtrar reservas": título e contexto fixos no topo, grupos de chips
/// rolando no meio e o botão com a contagem ao vivo fixo no rodapé.
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
    final count = ref.watch(arenaBookingsFilteredCountProvider);
    final day = ref.watch(arenaBookingsSelectedDayProvider);

    void set(ArenaBookingsFilter next) =>
        ref.read(arenaBookingsFilterProvider.notifier).state = next;

    Set<T> toggle<T>(Set<T> current, T value) => current.contains(value)
        ? ({...current}..remove(value))
        : {...current, value};

    final maxHeight = MediaQuery.sizeOf(context).height * _maxSheetHeightFactor;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(
              scope: arenaBookingsFilterScopeLabel(day, arenaTodayDateOnly()),
              canClear: !filter.isEmpty,
              onClear: () => set(const ArenaBookingsFilter()),
            ),
            Flexible(
              child: SingleChildScrollView(
                key: const Key('arena-bookings-filter-groups'),
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
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
                            icon: arenaPillIcon(_paymentKind(p)),
                            selected: filter.payments.contains(p),
                            onTap: () => set(
                              filter.copyWith(
                                payments: toggle(filter.payments, p),
                              ),
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
                            icon: _typeIcon(t),
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
                                filter.copyWith(
                                  sports: toggle(filter.sports, s),
                                ),
                              ),
                            ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            _Footer(
              count: count,
              hidesFreeSlots: !filter.onlyCourts,
              onDone: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

/// Mesmo ícone do selo do card para o mesmo estado.
ArenaPillKind _paymentKind(ArenaPaymentFilter p) => switch (p) {
      ArenaPaymentFilter.paid => ArenaPillKind.paid,
      ArenaPaymentFilter.due => ArenaPillKind.deposit,
      ArenaPaymentFilter.awaitingOnline => ArenaPillKind.awaitingPayment,
    };

/// "Avulsa" não tem selo no card: ganha o ícone de reserva.
IconData _typeIcon(ArenaBookingTypeFilter t) => switch (t) {
      ArenaBookingTypeFilter.single => Icons.event_available_rounded,
      ArenaBookingTypeFilter.recurring =>
        arenaPillIcon(ArenaPillKind.recurring),
      ArenaBookingTypeFilter.classBlock =>
        arenaPillIcon(ArenaPillKind.classBlock),
      ArenaBookingTypeFilter.professor =>
        arenaPillIcon(ArenaPillKind.professor),
    };

/// Título, "Limpar" (sempre no lugar, apagado sem filtro) e o contexto.
class _Header extends StatelessWidget {
  const _Header({
    required this.scope,
    required this.canClear,
    required this.onClear,
  });

  final String scope;
  final bool canClear;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 8, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Filtrar reservas',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  scope,
                  key: const Key('arena-bookings-filter-scope'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            key: const Key('arena-bookings-filter-clear'),
            onPressed: canClear ? onClear : null,
            style: TextButton.styleFrom(
              foregroundColor: colors.brandText,
              disabledForegroundColor:
                  colors.onSurfaceMuted.withValues(alpha: 0.55),
              textStyle: const TextStyle(
                fontFamily: AppTypography.fontFamily,
                fontSize: 14,
                fontWeight: FontWeight.w800,
              ),
            ),
            child: const Text('Limpar'),
          ),
        ],
      ),
    );
  }
}

/// Rodapé fixo: avisos e o botão com a contagem. O botão só fecha a folha.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.count,
    required this.hidesFreeSlots,
    required this.onDone,
  });

  final int? count;
  final bool hidesFreeSlots;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final empty = count == 0;
    final note = TextStyle(fontSize: 12, color: colors.onSurfaceMuted);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: colors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (hidesFreeSlots)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Icon(
                      Icons.visibility_off_outlined,
                      size: 14,
                      color: colors.onSurfaceMuted,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Horários livres ficam ocultos com este filtro.',
                        key: const Key('arena-bookings-filter-free-note'),
                        style: note,
                      ),
                    ),
                  ],
                ),
              ),
            if (empty)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  'Nenhuma reserva com esses filtros',
                  key: const Key('arena-bookings-filter-empty'),
                  style: note.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
            const SizedBox(height: 4),
            FilledButton(
              key: const Key('arena-bookings-filter-done'),
              onPressed: onDone,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(48),
                textStyle: const TextStyle(
                  fontFamily: AppTypography.fontFamily,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              child: Text(arenaBookingsFilterDoneLabel(count)),
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
      padding: const EdgeInsets.only(top: 14),
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
          const SizedBox(height: 2),
          // A área de toque de 48 px de cada chip já separa as linhas.
          Wrap(spacing: 8, children: children),
        ],
      ),
    );
  }
}

/// Altura visível do chip (a área de toque continua com 48 px).
const double _chipHeight = 36;

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// Ícone do selo do card; marcado, o tique entra no lugar dele.
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final ink = selected ? colors.brandText : colors.onSurface;
    final glyph = icon;
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      // Marcado também pelo tique, não só pela cor.
      showCheckmark: true,
      checkmarkColor: colors.brandText,
      // Marcado, o tique ocupa o lugar do ícone (os dois juntos se
      // sobrepõem).
      avatar: glyph == null || selected
          ? null
          : Icon(glyph, size: 16, color: colors.onSurfaceMuted),
      avatarBoxConstraints: const BoxConstraints.tightFor(
        width: 18,
        height: 18,
      ),
      labelStyle: TextStyle(
        fontFamily: AppTypography.fontFamily,
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      labelPadding: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      visualDensity: const VisualDensity(vertical: -2),
      materialTapTargetSize: MaterialTapTargetSize.padded,
      backgroundColor: colors.surfaceRaised,
      selectedColor: AppColors.brand.withValues(alpha: 0.16),
      side: BorderSide(
        color: selected
            ? AppColors.brand
            : colors.onSurfaceMuted.withValues(alpha: 0.2),
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(_chipHeight / 2),
      ),
    );
  }
}
