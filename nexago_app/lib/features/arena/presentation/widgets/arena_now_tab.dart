import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_bookings_providers.dart';
import '../../domain/arena_court_providers.dart';
import '../../domain/arena_dashboard_providers.dart';
import '../../domain/arena_home_tab.dart';
import '../../domain/arena_now.dart';
import '../../domain/arena_now_providers.dart';
import '../../domain/arena_staff_role.dart';
import 'arena_dashboard_insights_section.dart';
import 'arena_now_courts_strip.dart';
import 'arena_now_next_booking_card.dart';
import 'arena_now_tasks_card.dart';
import 'arena_now_today_card.dart';

/// Aba "Agora" do Painel: o que acontece nas quadras e o que pede ação.
class ArenaNowTab extends ConsumerWidget {
  const ArenaNowTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snapshot = ref.watch(arenaNowSnapshotProvider);
    return snapshot.when(
      data: (s) => _ArenaNowBody(snapshot: s),
      loading: () => const _ArenaNowSkeleton(),
      error: (e, _) => ArenaSectionError(
        message: friendlyErrorMessage(
          e,
          action: 'Não foi possível carregar a operação de agora',
          logReason: 'arena_painel:agora',
        ),
        onRetry: () {
          ref.invalidate(arenaManagerBookingsStreamProvider);
          ref.invalidate(arenaNowTodaySlotsProvider);
          ref.invalidate(arenaManagedCourtsProvider);
          ref.invalidate(arenaNowClockProvider);
        },
      ),
    );
  }
}

class _ArenaNowBody extends ConsumerWidget {
  const _ArenaNowBody({required this.snapshot});

  final ArenaNowSnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final readAgenda = ref.watch(arenaCanReadProvider(ArenaArea.agenda));
    final writeAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final writeCourts = ref.watch(arenaCanWriteProvider(ArenaArea.quadras));
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final summary = ref.watch(arenaDashboardSummaryProvider).valueOrNull;
    const gap = SizedBox(height: 16);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaNowNextBookingCard(
          booking: snapshot.nextBooking,
          now: snapshot.now,
          canOpen: readAgenda,
        ),
        gap,
        if (snapshot.courts.isEmpty)
          _NoCourts(canCreate: writeCourts)
        else
          ArenaNowCourtsStrip(
            courts: snapshot.courts,
            inUse: snapshot.courtsInUse,
            canReadAgenda: readAgenda,
            canWriteAgenda: writeAgenda,
          ),
        gap,
        ArenaNowTasksCard(
          tasks: snapshot.tasks,
          seesMoney: seesMoney,
          now: snapshot.now,
        ),
        gap,
        ArenaNowTodayCard(
          today: snapshot.today,
          seesMoney: seesMoney,
          onOpenBusiness: () =>
              ref.read(arenaHomeTabChoiceProvider.notifier).state =
                  ArenaHomeTab.business,
        ),
        if (summary != null) ...[
          gap,
          ArenaDashboardInsightsSection(
            summary: summary,
            includeMoney: seesMoney,
            showTitle: false,
            maxLines: 1,
          ),
        ],
      ],
    );
  }
}

class _NoCourts extends StatelessWidget {
  const _NoCourts({required this.canCreate});

  final bool canCreate;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Nenhuma quadra cadastrada',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Cadastre as quadras para abrir horários e receber reservas.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
            ),
          ),
          if (canCreate) ...[
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => context.go(AppRoutes.arenaCourts),
              child: const Text('Cadastrar quadras'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Estado de erro de uma seção do Painel, com "Tentar de novo".
class ArenaSectionError extends StatelessWidget {
  const ArenaSectionError({
    super.key,
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.cloud_off_rounded, color: colors.onSurfaceMuted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: colors.onSurface),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: onRetry,
            child: const Text('Tentar de novo'),
          ),
        ],
      ),
    );
  }
}

class _ArenaNowSkeleton extends StatelessWidget {
  const _ArenaNowSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NexaSkeleton(
          height: 128,
          radius: BorderRadius.all(Radius.circular(20)),
        ),
        SizedBox(height: 16),
        NexaSkeleton(width: 120, height: 16),
        SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: NexaSkeleton(
                height: 112,
                radius: BorderRadius.all(Radius.circular(16)),
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: NexaSkeleton(
                height: 112,
                radius: BorderRadius.all(Radius.circular(16)),
              ),
            ),
          ],
        ),
        SizedBox(height: 16),
        NexaSkeleton(
          height: 160,
          radius: BorderRadius.all(Radius.circular(16)),
        ),
      ],
    );
  }
}
