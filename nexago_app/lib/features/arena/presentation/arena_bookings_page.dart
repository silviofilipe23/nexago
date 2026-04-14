import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_providers.dart';
import 'widgets/arena_async_state.dart';

class ArenaBookingsPage extends ConsumerWidget {
  const ArenaBookingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    final mode = ref.watch(bookingViewModeProvider);
    final filterDate = ref.watch(arenaBookingsFilterDateProvider);
    final todayList = ref.watch(arenaBookingsFilteredProvider);
    final groupedFuture = ref.watch(arenaFutureBookingsGroupedProvider);

    final dateTitle =
        DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(filterDate);

    return AppScaffold(
      title: 'Reservas',
      centerTitle: false,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _ViewModeChips(
                mode: mode,
                onChanged: (m) =>
                    ref.read(bookingViewModeProvider.notifier).state = m,
              ),
            ),
            if (mode == BookingViewMode.today) ...[
              const SizedBox(height: 14),
              _DateFilterBar(
                label: _capitalize(dateTitle),
                onPickDate: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: filterDate,
                    firstDate:
                        DateTime.now().subtract(const Duration(days: 365)),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (picked != null) {
                    ref.read(arenaBookingsFilterDateProvider.notifier).state =
                        arenaDateOnly(picked);
                  }
                },
                onToday: () {
                  ref.read(arenaBookingsFilterDateProvider.notifier).state =
                      arenaTodayDateOnly();
                },
              ),
            ],
            const SizedBox(height: 8),
            Expanded(
              child: managed.when(
                data: (arenaId) {
                  if (arenaId == null || arenaId.isEmpty) {
                    return const ArenaEmptyState(
                      title: 'Arena não encontrada',
                      message:
                          'Nenhuma arena vinculada ao seu usuário como gestor.',
                      icon: Icons.store_mall_directory_outlined,
                    );
                  }
                  return switch (mode) {
                    BookingViewMode.today => todayList.when(
                        data: (bookings) {
                          if (bookings.isEmpty) {
                            return const ArenaEmptyState(
                              title: 'Nenhuma reserva neste dia',
                              message:
                                  'Escolha outra data ou aguarde novas reservas pelo app.',
                              icon: Icons.event_busy_outlined,
                            );
                          }
                          return ListView.separated(
                            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                            physics: const BouncingScrollPhysics(),
                            itemCount: bookings.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              return staggeredFadeSlide(
                                index: index,
                                child: _BookingCard(booking: bookings[index]),
                              );
                            },
                          );
                        },
                        loading: () => const ArenaLoadingState(
                            label: 'Carregando reservas...'),
                        error: (e, _) => ArenaErrorState(
                          message: 'Erro ao carregar reservas.\n$e',
                        ),
                      ),
                    BookingViewMode.upcoming => groupedFuture.when(
                        data: (sections) {
                          if (sections.isEmpty) {
                            return const ArenaEmptyState(
                              title: 'Nenhuma reserva futura',
                              message:
                                  'Não há reservas com data a partir de hoje na amostra carregada.',
                              icon: Icons.event_note_outlined,
                            );
                          }
                          return ListView.builder(
                            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                            physics: const BouncingScrollPhysics(),
                            itemCount: _flatItemCount(sections),
                            itemBuilder: (context, index) {
                              final flat = _flatIndex(sections, index);
                              if (flat.isHeader) {
                                return Padding(
                                  padding: EdgeInsets.only(
                                    top: flat.sectionIndex > 0 ? 20 : 0,
                                    bottom: 10,
                                  ),
                                  child: _DateSectionHeader(
                                      title: flat.headerTitle!),
                                );
                              }
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: staggeredFadeSlide(
                                  index: index,
                                  child: _BookingCard(booking: flat.booking!),
                                ),
                              );
                            },
                          );
                        },
                        loading: () => const ArenaLoadingState(
                            label: 'Carregando reservas...'),
                        error: (e, _) => ArenaErrorState(
                          message: 'Erro ao carregar reservas.\n$e',
                        ),
                      ),
                  };
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando arena...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }
}

class _FlatListIndex {
  const _FlatListIndex.header(this.sectionIndex, this.headerTitle)
      : booking = null,
        isHeader = true;

  const _FlatListIndex.card(this.sectionIndex, this.booking)
      : headerTitle = null,
        isHeader = false;

  final int sectionIndex;
  final bool isHeader;
  final String? headerTitle;
  final ArenaManagerBooking? booking;
}

int _flatItemCount(List<ArenaBookingDaySection> sections) {
  var n = 0;
  for (final s in sections) {
    n += 1 + s.bookings.length;
  }
  return n;
}

_FlatListIndex _flatIndex(List<ArenaBookingDaySection> sections, int index) {
  var i = index;
  for (var s = 0; s < sections.length; s++) {
    final sec = sections[s];
    if (i == 0) {
      return _FlatListIndex.header(s, sec.title);
    }
    i -= 1;
    if (i < sec.bookings.length) {
      return _FlatListIndex.card(s, sec.bookings[i]);
    }
    i -= sec.bookings.length;
  }
  return _FlatListIndex.header(0, '');
}

class _ViewModeChips extends StatelessWidget {
  const _ViewModeChips({
    required this.mode,
    required this.onChanged,
  });

  final BookingViewMode mode;
  final ValueChanged<BookingViewMode> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Wrap(
      spacing: 10,
      runSpacing: 8,
      children: [
        ChoiceChip(
          label: Text(BookingViewMode.today.label),
          selected: mode == BookingViewMode.today,
          onSelected: (_) => onChanged(BookingViewMode.today),
          selectedColor: AppColors.brand.withValues(alpha: 0.16),
          labelStyle: TextStyle(
            fontWeight: FontWeight.w700,
            color: mode == BookingViewMode.today
                ? AppColors.brand
                : theme.colorScheme.onSurface,
          ),
          side: BorderSide(
            color: theme.colorScheme.outline.withValues(
              alpha: mode == BookingViewMode.today ? 0.35 : 0.2,
            ),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        ChoiceChip(
          label: Text(BookingViewMode.upcoming.label),
          selected: mode == BookingViewMode.upcoming,
          onSelected: (_) => onChanged(BookingViewMode.upcoming),
          selectedColor: AppColors.brand.withValues(alpha: 0.16),
          labelStyle: TextStyle(
            fontWeight: FontWeight.w700,
            color: mode == BookingViewMode.upcoming
                ? AppColors.brand
                : theme.colorScheme.onSurface,
          ),
          side: BorderSide(
            color: theme.colorScheme.outline.withValues(
              alpha: mode == BookingViewMode.upcoming ? 0.35 : 0.2,
            ),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ],
    );
  }
}

class _DateSectionHeader extends StatelessWidget {
  const _DateSectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 4,
          height: 22,
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            title,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
        ),
      ],
    );
  }
}

class _DateFilterBar extends StatelessWidget {
  const _DateFilterBar({
    required this.label,
    required this.onPickDate,
    required this.onToday,
  });

  final String label;
  final VoidCallback onPickDate;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Material(
        color:
            theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onPickDate,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(
                  Icons.calendar_today_outlined,
                  size: 20,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Filtrar por data',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.55),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        label,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: onToday,
                  child: const Text('Hoje'),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BookingCard extends ConsumerWidget {
  const _BookingCard({required this.booking});

  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final nameAsync = ref.watch(athleteDisplayLabelProvider(booking.athleteId));
    final statusLabel = arenaBookingBusinessStatusLabel(booking.data);
    final paymentLabel = arenaBookingPaymentLabel(booking.data);

    final statusColor = _statusColor(statusLabel);

    return Material(
      color: theme.colorScheme.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          context.pushNamed(
            AppRouteNames.arenaBookingDetail,
            pathParameters: {'bookingId': booking.id},
            extra: booking,
          );
        },
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 4,
                    height: 52,
                    decoration: BoxDecoration(
                      color: statusColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        nameAsync.when(
                          data: (name) => Text(
                            name,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                          loading: () => Text(
                            'Carregando…',
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.45),
                            ),
                          ),
                          error: (_, __) => Text(
                            '—',
                            style: theme.textTheme.titleMedium,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${booking.startTime} – ${booking.endTime}',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: theme.colorScheme.primary,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _InfoChip(
                    icon: Icons.sports_tennis_outlined,
                    label: 'Quadra',
                    value: booking.courtName,
                  ),
                  _InfoChip(
                    icon: Icons.flag_outlined,
                    label: 'Status',
                    value: statusLabel,
                  ),
                  _InfoChip(
                    icon: Icons.payments_outlined,
                    label: 'Pagamento',
                    value: paymentLabel,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Color _statusColor(String statusLabel) {
    final s = statusLabel.toLowerCase();
    if (s.contains('cancel')) return const Color(0xFF9E9E9E);
    if (s.contains('ativa')) return const Color(0xFF2E7D32);
    return AppColors.brand;
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      constraints: const BoxConstraints(minWidth: 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon,
              size: 16,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.55)),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  value,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    height: 1.25,
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
