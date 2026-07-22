import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/layout/nexa_floating_header.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_club_admin_providers.dart';
import '../domain/arena_recurring_providers.dart';
import '../domain/arena_bookings_grouping.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_shell_providers.dart';
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

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: managed.when(
          data: (arenaId) {
            if (arenaId == null || arenaId.isEmpty) {
              return const ArenaEmptyState(
                title: 'Arena não encontrada',
                message: 'Nenhuma arena vinculada ao seu usuário como gestor.',
                icon: Icons.store_mall_directory_outlined,
              );
            }
            return const _BookingsScrollBody();
          },
          loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }
}

class _BookingsScrollBody extends ConsumerWidget {
  const _BookingsScrollBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(bookingViewModeProvider);
    final insight = ref.watch(arenaBookingsTodayInsightProvider);

    return CustomScrollView(
      controller:
          ref.watch(arenaShellScrollRegistryProvider).controllerFor(3),
      key: const PageStorageKey<String>('arena-bookings-scroll'),
      physics: ArenaDashboardTokens.shellScrollPhysics,
      slivers: [
        NexaFloatingHeaderSliver(
          topGap: 8,
          padding: const EdgeInsets.symmetric(
            horizontal: ArenaDashboardTokens.horizontalPadding,
          ),
          child: const FadeSlideIn(
            duration: Duration(milliseconds: 420),
            offsetY: 14,
            child: ArenaBookingsHeader(),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              16,
              ArenaDashboardTokens.horizontalPadding,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ArenaBookingsModeChips(),
                const SizedBox(height: 10),
                const _RecurringEntryRow(),
                const SizedBox(height: 8),
                const _ClubsEntryRow(),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
        ..._BookingsBody.sliversFor(
          ref: ref,
          mode: mode,
          insight: insight,
          bottomPadding: ArenaDashboardTokens.shellScrollBottomPadding(context),
        ),
      ],
    );
  }
}

/// Atalho para a gestão de horários fixos (mensalistas).
class _RecurringEntryRow extends ConsumerWidget {
  const _RecurringEntryRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count =
        ref.watch(arenaActiveRecurringSeriesProvider).valueOrNull?.length;

    return Material(
      color: AppColors.brand.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(AppRouteNames.arenaRecurring),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              const Icon(
                Icons.event_repeat_rounded,
                color: AppColors.brand,
                size: 18,
              ),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Horários fixos (mensalistas)',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              if (count != null && count > 0)
                Text(
                  '$count ativo${count > 1 ? 's' : ''}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.brand,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Atalho para a gestão do Clubinho (jogo aberto com lista pública).
class _ClubsEntryRow extends ConsumerWidget {
  const _ClubsEntryRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clubs = ref.watch(managedArenaClubsProvider).valueOrNull;
    final activeCount = clubs?.where((c) => c.isActive).length;

    return Material(
      color: AppColors.brand.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(AppRouteNames.arenaClubs),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              const Icon(
                Icons.groups_rounded,
                color: AppColors.brand,
                size: 18,
              ),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Clubinho (jogo aberto)',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              if (activeCount != null && activeCount > 0)
                Text(
                  '$activeCount ativo${activeCount > 1 ? 's' : ''}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.brand,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BookingsBody {
  const _BookingsBody._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required BookingViewMode mode,
    required ArenaBookingsTodayInsight? insight,
    required double bottomPadding,
  }) {
    switch (mode) {
      case BookingViewMode.today:
        return _FlatList.sliversFor(
          async: ref.watch(arenaBookingsTodayProvider),
          insight: insight,
          emptyTitle: 'Nenhuma reserva hoje',
          emptyMessage: 'Não há reservas ativas para hoje.',
          bottomPadding: bottomPadding,
        );
      case BookingViewMode.tomorrow:
        return _FlatList.sliversFor(
          async: ref.watch(arenaBookingsTomorrowProvider),
          emptyTitle: 'Nenhuma reserva amanhã',
          emptyMessage: 'Não há reservas ativas para amanhã.',
          bottomPadding: bottomPadding,
        );
      case BookingViewMode.upcoming:
        return _GroupedList.sliversFor(
          async: ref.watch(arenaFutureBookingsGroupedProvider),
          emptyTitle: 'Nenhuma reserva futura',
          emptyMessage: 'Não há reservas após amanhã na amostra carregada.',
          bottomPadding: bottomPadding,
        );
      case BookingViewMode.past:
        return _GroupedList.sliversFor(
          async: ref.watch(arenaPastBookingsGroupedProvider),
          emptyTitle: 'Nenhuma reserva passada',
          emptyMessage: 'Não há reservas anteriores na amostra carregada.',
          bottomPadding: bottomPadding,
        );
    }
  }
}

class _FlatList {
  const _FlatList._();

  static List<Widget> sliversFor({
    required AsyncValue<List<ArenaManagerBooking>> async,
    required String emptyTitle,
    required String emptyMessage,
    required double bottomPadding,
    ArenaBookingsTodayInsight? insight,
  }) {
    return async.when(
      data: (bookings) {
        if (bookings.isEmpty && insight == null) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: emptyTitle,
                message: emptyMessage,
                icon: Icons.event_busy_outlined,
              ),
            ),
          ];
        }
        final itemCount = bookings.length + (insight != null ? 1 : 0);
        return [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              4,
              ArenaDashboardTokens.horizontalPadding,
              bottomPadding,
            ),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  if (insight != null && index == 0) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: ArenaBookingsInsightCard(insight: insight),
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
                childCount: itemCount,
              ),
            ),
          ),
        ];
      },
      loading: () => [
        const SliverFillRemaining(
          hasScrollBody: false,
          child: ArenaLoadingState(label: 'Carregando reservas...'),
        ),
      ],
      error: (e, _) => [
        SliverFillRemaining(
          hasScrollBody: false,
          child: ArenaErrorState(message: 'Erro ao carregar reservas.\n$e'),
        ),
      ],
    );
  }
}

class _GroupedList {
  const _GroupedList._();

  static List<Widget> sliversFor({
    required AsyncValue<List<ArenaBookingDaySection>> async,
    required String emptyTitle,
    required String emptyMessage,
    required double bottomPadding,
  }) {
    return async.when(
      data: (sections) {
        if (sections.isEmpty) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: emptyTitle,
                message: emptyMessage,
                icon: Icons.event_note_outlined,
              ),
            ),
          ];
        }
        final itemCount = _groupedItemCount(sections);
        return [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              4,
              ArenaDashboardTokens.horizontalPadding,
              bottomPadding,
            ),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final flat = _groupedFlatIndex(sections, index);
                  if (flat.isHeader) {
                    return Padding(
                      padding:
                          EdgeInsets.only(top: flat.sectionIndex > 0 ? 16 : 0),
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
                childCount: itemCount,
              ),
            ),
          ),
        ];
      },
      loading: () => [
        const SliverFillRemaining(
          hasScrollBody: false,
          child: ArenaLoadingState(label: 'Carregando reservas...'),
        ),
      ],
      error: (e, _) => [
        SliverFillRemaining(
          hasScrollBody: false,
          child: ArenaErrorState(message: 'Erro ao carregar reservas.\n$e'),
        ),
      ],
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

_GroupedFlatIndex _groupedFlatIndex(
  List<ArenaBookingDaySection> sections,
  int index,
) {
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
