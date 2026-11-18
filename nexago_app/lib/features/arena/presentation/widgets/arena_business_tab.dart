import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';
import '../../data/arena_dashboard_insights.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_bookings_providers.dart';
import '../../domain/arena_business_providers.dart';
import '../../domain/arena_dashboard_providers.dart';
import '../../domain/arena_staff_role.dart';
import 'arena_cockpit_hero.dart';
import 'arena_cockpit_kpi_strip.dart';
import 'arena_dashboard_insights_section.dart';
import 'arena_dashboard_period_chips.dart';
import 'arena_idle_map_card.dart';
import 'arena_now_tab.dart';

/// Aba "Negócio" no modelo cockpit: o período vale para a tela inteira; um
/// destaque com o número principal, a curva e a meta do mês; três
/// indicadores com variação; onde sobra horário na semana; leituras do dia.
class ArenaBusinessTab extends ConsumerWidget {
  const ArenaBusinessTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cockpitAsync = ref.watch(arenaCockpitProvider);
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final summary = ref.watch(arenaDashboardSummaryProvider).valueOrNull;
    final hasIdleHole =
        ref.watch(arenaIdleMapProvider).valueOrNull?.hole != null;

    final Widget numbers = cockpitAsync.when(
      data: (cockpit) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ArenaCockpitHero(cockpit: cockpit),
          const SizedBox(height: 12),
          ArenaCockpitKpiStrip(cockpit: cockpit, seesMoney: seesMoney),
        ],
      ),
      loading: () => const Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NexaSkeleton(
            height: 210,
            radius: BorderRadius.all(Radius.circular(22)),
          ),
          SizedBox(height: 12),
          NexaSkeleton(
            height: 84,
            radius: BorderRadius.all(Radius.circular(16)),
          ),
        ],
      ),
      error: (e, _) => ArenaSectionError(
        message: friendlyErrorMessage(
          e,
          action: 'Não foi possível carregar os números',
          logReason: 'arena_painel:negocio',
        ),
        onRetry: () => ref.invalidate(arenaManagerBookingsStreamProvider),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ArenaDashboardPeriodChips(),
        const SizedBox(height: 16),
        numbers,
        const SizedBox(height: 20),
        const ArenaIdleMapCard(),
        if (summary != null) ...[
          const SizedBox(height: 20),
          ArenaDashboardInsightsSection(
            summary: summary,
            includeMoney: seesMoney,
            // O mapa já sugere a promoção do horário vazio: não repetir.
            exclude: hasIdleHole
                ? const {ArenaDashboardInsightKind.lowOccupancy}
                : const {},
          ),
        ],
      ],
    );
  }
}
