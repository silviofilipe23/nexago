import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_booking_view_mode.dart';
import '../domain/arena_bookings_grouping.dart';
import '../domain/arena_bookings_providers.dart';
import '../domain/arena_bookings_ui_models.dart';
import '../domain/arena_manager_booking.dart';
import '../domain/arena_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_booking_card.dart';
import 'widgets/arena_bookings_header.dart';
import 'widgets/arena_bookings_insight_card.dart';
import 'widgets/arena_bookings_mode_chips.dart';
import 'widgets/arena_bookings_section_header.dart';
import 'widgets/arena_dashboard_tokens.dart';

class ArenaBookingsPage extends ConsumerWidget {
  const ArenaBookingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    final mode = ref.watch(bookingViewModeProvider);
    final insight = ref.watch(arenaBookingsTodayInsightProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
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
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    12,
                    ArenaDashboardTokens.horizontalPadding,
                    0,
                  ),
                  child: const FadeSlideIn(child: ArenaBookingsHeader()),
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: ArenaDashboardTokens.horizontalPadding,
                  ),
                  child: const ArenaBookingsModeChips(),
                ),
                const SizedBox(height: 12),
                Expanded(child: _BookingsBody(mode: mode, insight: insight)),
              ],
            );
          },
          loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }
}

class _BookingsBody extends ConsumerWidget {
  const _BookingsBody({
    required this.mode,
    required this.insight,
  });

  final BookingViewMode mode;
  final ArenaBookingsTodayInsight? insight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (mode) {
      case BookingViewMode.today:
        return _FlatList(
          async: ref.watch(arenaBookingsTodayProvider),
          insight: insight,
          emptyTitle: 'Nenhuma reserva hoje',
          emptyMessage: 'Não há reservas ativas para hoje.',
        );
      case BookingViewMode.tomorrow:
        return _FlatList(
          async: ref.watch(arenaBookingsTomorrowProvider),
          emptyTitle: 'Nenhuma reserva amanhã',
          emptyMessage: 'Não há reservas ativas para amanhã.',
        );
      case BookingViewMode.upcoming:
        return _GroupedList(
          async: ref.watch(arenaFutureBookingsGroupedProvider),
          emptyTitle: 'Nenhuma reserva futura',
          emptyMessage: 'Não há reservas após amanhã na amostra carregada.',
        );
      case BookingViewMode.past:
        return _GroupedList(
          async: ref.watch(arenaPastBookingsGroupedProvider),
          emptyTitle: 'Nenhuma reserva passada',
          emptyMessage: 'Não há reservas anteriores na amostra carregada.',
        );
    }
  }
}

class _FlatList extends StatelessWidget {
  const _FlatList({
    required this.async,
    required this.emptyTitle,
    required this.emptyMessage,
    this.insight,
  });

  final AsyncValue<List<ArenaManagerBooking>> async;
  final String emptyTitle;
  final String emptyMessage;
  final ArenaBookingsTodayInsight? insight;

  @override
  Widget build(BuildContext context) {
    return async.when(
      data: (bookings) {
        if (bookings.isEmpty && insight == null) {
          return ArenaEmptyState(
            title: emptyTitle,
            message: emptyMessage,
            icon: Icons.event_busy_outlined,
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            4,
            ArenaDashboardTokens.horizontalPadding,
            28,
          ),
          physics: const BouncingScrollPhysics(),
          itemCount: bookings.length + (insight != null ? 1 : 0),
          itemBuilder: (context, index) {
            if (insight != null && index == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: ArenaBookingsInsightCard(insight: insight!),
              );
            }
            final i = insight != null ? index - 1 : index;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FadeSlideIn(
                delay: Duration(milliseconds: 40 * i.clamp(0, 12)),
                child: ArenaBookingCard(booking: bookings[i]),
              ),
            );
          },
        );
      },
      loading: () => const ArenaLoadingState(label: 'Carregando reservas...'),
      error: (e, _) => ArenaErrorState(message: 'Erro ao carregar reservas.\n$e'),
    );
  }
}

class _GroupedList extends StatelessWidget {
  const _GroupedList({
    required this.async,
    required this.emptyTitle,
    required this.emptyMessage,
  });

  final AsyncValue<List<ArenaBookingDaySection>> async;
  final String emptyTitle;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    return async.when(
      data: (sections) {
        if (sections.isEmpty) {
          return ArenaEmptyState(
            title: emptyTitle,
            message: emptyMessage,
            icon: Icons.event_note_outlined,
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            4,
            ArenaDashboardTokens.horizontalPadding,
            28,
          ),
          physics: const BouncingScrollPhysics(),
          itemCount: _groupedItemCount(sections),
          itemBuilder: (context, index) {
            final flat = _groupedFlatIndex(sections, index);
            if (flat.isHeader) {
              return Padding(
                padding: EdgeInsets.only(top: flat.sectionIndex > 0 ? 16 : 0),
                child: ArenaBookingsSectionHeader(
                  title: flat.headerTitle!,
                  subtitle: flat.subtitle,
                ),
              );
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ArenaBookingCard(booking: flat.booking!),
            );
          },
        );
      },
      loading: () => const ArenaLoadingState(label: 'Carregando reservas...'),
      error: (e, _) => ArenaErrorState(message: 'Erro ao carregar reservas.\n$e'),
    );
  }
}

class _GroupedFlatIndex {
  const _GroupedFlatIndex.header(
    this.sectionIndex,
    this.headerTitle,
    this.subtitle,
  )   : booking = null,
        isHeader = true;

  const _GroupedFlatIndex.card(this.sectionIndex, this.booking)
      : headerTitle = null,
        subtitle = null,
        isHeader = false;

  final int sectionIndex;
  final bool isHeader;
  final String? headerTitle;
  final String? subtitle;
  final ArenaManagerBooking? booking;
}

int _groupedItemCount(List<ArenaBookingDaySection> sections) {
  var n = 0;
  for (final s in sections) {
    n += 1 + s.bookings.length;
  }
  return n;
}

_GroupedFlatIndex _groupedFlatIndex(List<ArenaBookingDaySection> sections, int index) {
  var i = index;
  for (var s = 0; s < sections.length; s++) {
    final sec = sections[s];
    if (i == 0) {
      return _GroupedFlatIndex.header(s, sec.title, sec.subtitle);
    }
    i -= 1;
    if (i < sec.bookings.length) {
      return _GroupedFlatIndex.card(s, sec.bookings[i]);
    }
    i -= sec.bookings.length;
  }
  return _GroupedFlatIndex.header(0, '', null);
}
