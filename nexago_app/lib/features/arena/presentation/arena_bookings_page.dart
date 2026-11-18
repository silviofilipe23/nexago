import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/layout/nexa_page_header.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_access_providers.dart';
import '../domain/arena_booking_day_timeline.dart';
import '../domain/arena_bookings_day_providers.dart';
import '../domain/arena_bookings_filter.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_shell_providers.dart';
import '../domain/arena_staff_role.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_booking_card.dart';
import 'widgets/arena_bookings_day_strip.dart';
import 'widgets/arena_bookings_day_timeline.dart';
import 'widgets/arena_bookings_header.dart';
import 'widgets/arena_bookings_insight_card.dart';
import 'widgets/arena_bookings_section_header.dart';
import 'widgets/arena_bookings_shortcuts.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Aba Reservas do gestor (modelo A, "Linha do dia"): faixa de 7 dias, linha
/// do dia com horários livres, busca e filtros, atalhos de Aulas, Horários
/// fixos e Clubinho, e "Nova reserva" para quem escreve na agenda.
class ArenaBookingsPage extends ConsumerWidget {
  const ArenaBookingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final hasArena = managed.valueOrNull?.isNotEmpty ?? false;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      floatingActionButton: canWrite && hasArena
          ? Padding(
              padding: EdgeInsets.only(
                bottom: ArenaDashboardTokens.shellFabLift(context),
              ),
              child: const _NewBookingButton(),
            )
          : null,
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
          error: (e, _) => ArenaErrorState(
            message: friendlyErrorMessage(
              e,
              action: 'Não foi possível carregar a arena',
              logReason: 'arena_bookings:arena',
            ),
            onRetry: () => ref.invalidate(managedArenaIdProvider),
          ),
        ),
      ),
    );
  }
}

/// "Nova reserva": abre a agenda no dia aberto aqui, onde o gestor escolhe
/// quadra e horário (mesmo caminho do "+" do Painel).
class _NewBookingButton extends ConsumerWidget {
  const _NewBookingButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FloatingActionButton.extended(
      key: const Key('arena-bookings-new'),
      heroTag: 'arena-bookings-new',
      onPressed: () {
        openArenaScheduleOn(ref, ref.read(arenaBookingsSelectedDayProvider));
        context.go(AppRoutes.arenaSchedule);
      },
      backgroundColor: AppColors.brand,
      foregroundColor: AppColors.black,
      elevation: 2,
      icon: const Icon(Icons.add_rounded),
      label: const Text(
        'Nova reserva',
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _BookingsScrollBody extends ConsumerWidget {
  const _BookingsScrollBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final searching = ref.watch(arenaBookingsSearchProvider) != null;
    final results = ref.watch(arenaBookingsSearchResultsProvider);
    final bottomPadding = canWrite
        ? ArenaDashboardTokens.shellFabScrollBottomPadding(context)
        : ArenaDashboardTokens.shellScrollBottomPadding(context);

    return NexaPageHeader(
      topGap: 8,
      padding: const EdgeInsets.symmetric(
        horizontal: ArenaDashboardTokens.horizontalPadding,
      ),
      header: const FadeSlideIn(
        duration: Duration(milliseconds: 420),
        offsetY: 14,
        child: ArenaBookingsHeader(),
      ),
      child: CustomScrollView(
        controller:
            ref.watch(arenaShellScrollRegistryProvider).controllerFor(3),
        key: const PageStorageKey<String>('arena-bookings-scroll'),
        physics: ArenaDashboardTokens.shellScrollPhysics,
        slivers: [
          SliverPadding(
            padding: _listPadding(0, top: 14),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (searching) ...[
                    const ArenaBookingsSearchField(),
                    const SizedBox(height: 12),
                  ],
                  if (results == null) ...[
                    const ArenaBookingsShortcuts(),
                    const SizedBox(height: 12),
                    const ArenaBookingsDayStrip(),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ),
          ),
          if (results != null)
            ..._SearchResults.sliversFor(
              ref: ref,
              async: results,
              bottomPadding: bottomPadding,
            )
          else
            ..._DayTimeline.sliversFor(ref: ref, bottomPadding: bottomPadding),
        ],
      ),
    );
  }
}

EdgeInsets _listPadding(double bottom, {double top = 4}) => EdgeInsets.fromLTRB(
      ArenaDashboardTokens.horizontalPadding,
      top,
      ArenaDashboardTokens.horizontalPadding,
      bottom,
    );

List<Widget> _loadingSlivers() => const [
      SliverFillRemaining(
        hasScrollBody: false,
        child: ArenaLoadingState(label: 'Carregando reservas...'),
      ),
    ];

List<Widget> _errorSlivers(Object e) => [
      SliverFillRemaining(
        hasScrollBody: false,
        child: ArenaErrorState(message: _loadErrorMessage(e)),
      ),
    ];

/// Dia aberto: resumo, aviso de dia vazio (hoje) e a linha do dia.
class _DayTimeline {
  const _DayTimeline._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required double bottomPadding,
  }) {
    final async = ref.watch(arenaBookingsDayTimelineProvider);
    final summary = ref.watch(arenaBookingsDaySummaryProvider);
    final day = ref.watch(arenaBookingsSelectedDayProvider);
    final isToday = arenaDateKey(day) == arenaDateKey(arenaTodayDateOnly());
    final insight =
        isToday ? ref.watch(arenaBookingsTodayInsightProvider) : null;
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final filter = ref.watch(arenaBookingsFilterProvider);

    return async.when(
      data: (entries) {
        final hasItems = entries.any((e) => e is! ArenaTimelineNowEntry);
        final now = entries
            .whereType<ArenaTimelineNowEntry>()
            .map((e) => e.now)
            .firstOrNull;
        return [
          SliverPadding(
            padding: _listPadding(0, top: 0),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (summary != null) ...[
                    ArenaBookingsDayStats(
                      summary: summary,
                      seesMoney: seesMoney,
                      isToday: isToday,
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (insight != null && filter.isEmpty) ...[
                    ArenaBookingsInsightCard(insight: insight),
                    const SizedBox(height: 14),
                  ],
                ],
              ),
            ),
          ),
          if (!hasItems)
            SliverFillRemaining(
              hasScrollBody: false,
              child: filter.isEmpty
                  ? ArenaEmptyState(
                      title: isToday
                          ? 'Nenhuma reserva hoje'
                          : 'Nenhuma reserva neste dia',
                      message:
                          'Quando alguém reservar, a reserva aparece aqui.',
                      icon: Icons.event_busy_outlined,
                    )
                  : const _FilteredEmpty(),
            )
          else
            SliverPadding(
              padding: _listPadding(bottomPadding, top: 0),
              sliver: ArenaBookingsDayTimelineSliver(
                entries: entries,
                now: now ?? DateTime.now(),
              ),
            ),
        ];
      },
      loading: _loadingSlivers,
      error: (e, _) => _errorSlivers(e),
    );
  }
}

/// Filtro sem resultado: diz por quê e oferece limpar.
class _FilteredEmpty extends ConsumerWidget {
  const _FilteredEmpty();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ArenaEmptyState(
      title: 'Nenhuma reserva com esses filtros',
      message: 'Tire um filtro para ver mais reservas.',
      icon: Icons.filter_alt_off_outlined,
      action: OutlinedButton(
        key: const Key('arena-bookings-clear-filters'),
        onPressed: () => ref.read(arenaBookingsFilterProvider.notifier).state =
            const ArenaBookingsFilter(),
        child: const Text('Limpar filtros'),
      ),
    );
  }
}

/// Resultado da busca, agrupado por dia.
class _SearchResults {
  const _SearchResults._();

  static List<Widget> sliversFor({
    required WidgetRef ref,
    required AsyncValue<List<ArenaBookingDaySection>> async,
    required double bottomPadding,
  }) {
    return async.when(
      data: (sections) {
        if (sections.isEmpty) {
          return const [
            SliverFillRemaining(
              hasScrollBody: false,
              child: ArenaEmptyState(
                title: 'Nenhuma reserva encontrada',
                message: 'A busca olha os últimos 30 dias e os próximos 60. '
                    'Confira o nome ou o código da reserva.',
                icon: Icons.search_off_rounded,
              ),
            ),
          ];
        }
        final rows = <Widget>[
          for (var s = 0; s < sections.length; s++) ...[
            Padding(
              padding: EdgeInsets.only(top: s > 0 ? 16 : 0),
              child: ArenaBookingsSectionHeader(title: sections[s].title),
            ),
            for (final b in sections[s].bookings)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ArenaBookingCard(booking: b),
              ),
          ],
        ];
        return [
          SliverPadding(
            padding: _listPadding(bottomPadding),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => rows[index],
                childCount: rows.length,
              ),
            ),
          ),
        ];
      },
      loading: _loadingSlivers,
      error: (e, _) => _errorSlivers(e),
    );
  }
}

String _loadErrorMessage(Object error) => friendlyErrorMessage(
      error,
      action: 'Não foi possível carregar as reservas',
      logReason: 'arena_bookings:list',
    );
