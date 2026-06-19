import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_bookings_providers.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import 'widgets/arena_comanda_stepper.dart';
import 'widgets/arena_comanda_wizard_scaffold.dart';

class ArenaComandaLinkBookingPage extends ConsumerStatefulWidget {
  const ArenaComandaLinkBookingPage({super.key});

  @override
  ConsumerState<ArenaComandaLinkBookingPage> createState() =>
      _ArenaComandaLinkBookingPageState();
}

class _ArenaComandaLinkBookingPageState
    extends ConsumerState<ArenaComandaLinkBookingPage> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(arenaComandaDraftProvider);
    final bookings =
        ref.watch(arenaBookingsTodayProvider).valueOrNull ?? const [];
    final query = _searchController.text.trim().toLowerCase();

    final activeNow = bookings
        .where((b) => isBookingActiveNow(b, DateTime.now()))
        .where((b) {
          if (query.isEmpty) return true;
          final haystack =
              '${b.courtName} ${bookingAthletesLabel(b)} ${ArenaBookingsGrouping.displayCode(b.id)}'
                  .toLowerCase();
          return haystack.contains(query);
        })
        .toList();

    final selected = draft.linkedBooking;
    final rentalCents =
        selected != null ? rentalCentsFromBooking(selected) : 0;
    final footerSummary = draft.linkWithoutBooking
        ? 'Sem vínculo'
        : selected != null
            ? '${selected.courtName} · locação'
            : 'Selecione uma reserva';

    return ArenaComandaWizardScaffold(
      stepLabel: 'NOVA COMANDA · PASSO 1 DE 3',
      title: 'Vincular reserva',
      currentStep: 0,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ArenaComandaStepper(currentStep: 0),
          const SizedBox(height: 20),
          TextField(
            controller: _searchController,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Buscar reserva, quadra ou atleta',
              prefixIcon: Icon(
                Icons.search_rounded,
                color: context.themeColors.onSurfaceMuted,
              ),
              filled: true,
              fillColor: context.themeColors.surfaceRaised,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'RESERVAS ATIVAS AGORA',
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 10),
          for (final booking in activeNow) ...[
            _BookingOptionCard(
              booking: booking,
              selected: selected?.id == booking.id,
              onTap: () {
                ref.read(arenaComandaDraftProvider.notifier).selectBooking(
                      booking,
                    );
              },
            ),
            const SizedBox(height: 10),
          ],
          if (activeNow.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Nenhuma reserva em andamento agora.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              ),
            ),
          _UnlinkedOptionCard(
            selected: draft.linkWithoutBooking,
            onTap: () {
              ref
                  .read(arenaComandaDraftProvider.notifier)
                  .selectWithoutBooking();
            },
          ),
        ],
      ),
      footer: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    footerSummary,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
                if (!draft.linkWithoutBooking && selected != null)
                  Text(
                    formatComandaReais(rentalCents),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                  ),
              ],
            ),
          ),
          ArenaComandaWizardContinueButton(
            label: '→ Continuar',
            enabled: draft.canContinueFromOrigin,
            onPressed: () {
              context.pushNamed(AppRouteNames.arenaComandaNewCustomer);
            },
          ),
        ],
      ),
    );
  }
}

class _BookingOptionCard extends StatelessWidget {
  const _BookingOptionCard({
    required this.booking,
    required this.selected,
    required this.onTap,
  });

  final ArenaManagerBooking booking;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final rentalCents = rentalCentsFromBooking(booking);
    final athletes = bookingAthletesLabel(booking);
    final timeRange = '${booking.startTime}–${booking.endTime}';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.brand.withValues(alpha: 0.15)
                      : context.themeColors.surfaceSheet,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.event_available_rounded,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            booking.courtName,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: context.themeColors.onSurface,
                                ),
                          ),
                        ),
                        Text(
                          timeRange,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$athletes · 2 atletas',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '+ ${formatComandaReais(rentalCents)} locação · ${ArenaBookingsGrouping.displayCode(booking.id)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.win,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                color: selected
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnlinkedOptionCard extends StatelessWidget {
  const _UnlinkedOptionCard({
    required this.selected,
    required this.onTap,
  });

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
              width: selected ? 1.5 : 1,
              strokeAlign: BorderSide.strokeAlignInside,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.add_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Abrir sem vínculo',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Comanda avulsa, sem locação atrelada',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                color: selected
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
