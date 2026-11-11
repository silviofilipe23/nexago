import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_court.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_slot.dart';
import '../domain/arena_sport_codes.dart';
import '../domain/capacity_slots_logic.dart';
import '../domain/slots_page_logic.dart';
import '../domain/slots_providers.dart';
import 'widgets/slots/slots_bottom_bar.dart';
import 'widgets/slots/slots_day_strip.dart';
import 'widgets/slots/slots_page_header.dart';

/// `arenaSlots` de todas as quadras da arena no dia (um listener só).
final arenaDaySlotsProvider = StreamProvider.autoDispose
    .family<List<ArenaSlot>, ({String arenaId, DateTime day})>((ref, params) {
  return ref
      .watch(slotsRepositoryProvider)
      .watchArenaDaySlotsMerged(arenaId: params.arenaId, date: params.day);
});

/// Escolha de horário numa arena "a arena define a quadra": esporte + dia + horário + duração,
/// sem quadra. Ver `docs/product/reservas-por-capacidade.md` e o canvas (página do atleta).
class CapacitySlotsView extends ConsumerStatefulWidget {
  const CapacitySlotsView({
    super.key,
    required this.arena,
    this.initialDate,
    this.onBack,
    this.onChooseCourt,
    this.initialSport,
  });

  final ArenaListItem arena;

  /// Esporte já escolhido (ex.: linha do esporte no perfil da arena). Fora dos reserváveis, vale
  /// o padrão (principal do atleta ou o primeiro).
  final String? initialSport;
  final DateTime? initialDate;
  final VoidCallback? onBack;

  /// Modo misto (`allowCourtChoice`): o atleta prefere escolher a quadra.
  final VoidCallback? onChooseCourt;

  @override
  ConsumerState<CapacitySlotsView> createState() => _CapacitySlotsViewState();
}

class _CapacitySlotsViewState extends ConsumerState<CapacitySlotsView> {
  static const _calendarDays = 21;
  static final _metaDateFmt = DateFormat('EEE, d MMM', 'pt_BR');

  late DateTime _selectedDay;
  String? _sport;
  int? _durationMinutes;
  String? _selectedStart;

  @override
  void initState() {
    super.initState();
    _selectedDay = slotDayOnly(widget.initialDate ?? DateTime.now());
    _sport = bookingSportCode(widget.initialSport);
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  void _back() {
    if (widget.onBack != null) {
      widget.onBack!();
    } else if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.discover);
    }
  }

  void _goToConfirm(String sport, CapacityTime time, double price) {
    context.pushNamed(
      AppRouteNames.arenaBookingConfirm,
      pathParameters: {'arenaId': widget.arena.id},
      extra: ArenaBookingConfirmArgs(
        arenaId: widget.arena.id,
        arenaName: widget.arena.name,
        courtId: '',
        courtName: '',
        courtSubtitle: courtSportLabel(sport),
        date: _selectedDay,
        startTime: time.startTime,
        endTime: time.endTime,
        amountReais: price,
        selectedSlotStartTimes: time.slotStartTimes,
        capacity: true,
        sport: sport,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final arena = widget.arena;
    final allocation = arena.bookingAllocation;
    final courtsAsync = ref.watch(courtsStreamProvider(arena.id));
    final slotsAsync = ref.watch(arenaDaySlotsProvider((arenaId: arena.id, day: _selectedDay)));
    final courts = courtsAsync.valueOrNull ?? const <ArenaCourt>[];
    final primarySport = ref.watch(
      athleteProfileProvider.select((p) => p.valueOrNull?.primarySportFirestoreId),
    );
    // O principal do atleta vem na frente e já selecionado.
    final sports = capacitySportsForAthlete(capacitySports(allocation, courts), primarySport);
    final sport = (_sport != null && sports.contains(_sport)) ? _sport : (sports.isNotEmpty ? sports.first : null);
    final candidates = sport == null ? const <ArenaCourt>[] : capacityCandidateCourts(allocation, courts, sport);
    final durations = capacityDurationOptions(candidates);
    final duration = (_durationMinutes != null && durations.contains(_durationMinutes))
        ? _durationMinutes!
        : (durations.isNotEmpty ? durations.first : 60);
    final loading = courtsAsync.isLoading || slotsAsync.isLoading;
    final times = loading || sport == null
        ? const <CapacityTime>[]
        : buildCapacityTimes(
            daySlots: slotsAsync.valueOrNull ?? const [],
            candidates: candidates,
            durationMinutes: duration,
            day: _selectedDay,
            now: DateTime.now(),
          );
    CapacityTime? selected;
    for (final t in times) {
      if (t.startTime == _selectedStart && !t.isFull) selected = t;
    }
    final price = sport == null ? null : capacityPriceFor(allocation, sport, duration);
    final stripStart = computeSlotsDayStripStart(
      today: DateTime.now(),
      selectedDay: _selectedDay,
      daysCount: _calendarDays,
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SlotsPageHeader(title: arena.name, onBack: _back, coverUrl: arena.coverUrl),
                SlotsDayStrip(
                  startDay: stripStart,
                  selectedDay: _selectedDay,
                  daysCount: _calendarDays,
                  calendarDays: null,
                  onSelect: (d) => setState(() {
                    _selectedDay = d;
                    _selectedStart = null;
                  }),
                  sameDay: _sameDay,
                  dateOnly: slotDayOnly,
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                    children: [
                      if (sports.isNotEmpty) ...[
                        _SectionLabel('Esporte'),
                        // Todos numa linha só, rolando para o lado (sem quebrar em várias linhas).
                        SingleChildScrollView(
                          key: const Key('capacity-sports'),
                          scrollDirection: Axis.horizontal,
                          clipBehavior: Clip.none,
                          child: Row(
                            children: [
                              for (final (i, s) in sports.indexed) ...[
                                if (i > 0) const SizedBox(width: 8),
                                ChoiceChip(
                                  label: Text(courtSportLabel(s)),
                                  selected: s == sport,
                                  onSelected: (_) => setState(() {
                                    _sport = s;
                                    _selectedStart = null;
                                  }),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      const _CapacityNote(),
                      if (widget.onChooseCourt != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: widget.onChooseCourt,
                            child: const Text('Prefiro escolher a quadra'),
                          ),
                        ),
                      const SizedBox(height: 12),
                      if (durations.length > 1) ...[
                        _SectionLabel('Duração'),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final m in durations)
                              ChoiceChip(
                                label: Text(formatSelectionDurationLabel(1, m)),
                                selected: m == duration,
                                onSelected: (_) => setState(() {
                                  _durationMinutes = m;
                                  _selectedStart = null;
                                }),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (loading)
                        const Padding(
                          padding: EdgeInsets.only(top: 32),
                          child: AppLoadingView(message: 'Carregando horários…'),
                        )
                      else if (sport == null)
                        const _EmptyLine('A arena ainda não abriu horários para reserva.')
                      else if (times.isEmpty)
                        const _EmptyLine('Sem horários neste dia. Escolha outro dia.')
                      else
                        for (final t in times) ...[
                          CapacityTimeTile(
                            time: t,
                            priceLabel: price != null ? formatBRLWhole(price) : null,
                            selected: t.startTime == selected?.startTime,
                            onTap: t.isFull ? null : () => setState(() => _selectedStart = t.startTime),
                          ),
                          const SizedBox(height: 10),
                        ],
                    ],
                  ),
                ),
                SlotsBottomBar(
                  enabled: selected != null && price != null && sport != null,
                  metaLabel: selected == null
                      ? null
                      : '${formatSelectionDurationLabel(1, duration)} · ${_metaDateFmt.format(_selectedDay)}',
                  totalLabel: selected == null || price == null ? null : formatBRLWhole(price),
                  onPressed: () {
                    if (selected == null || price == null || sport == null) return;
                    _goToConfirm(sport, selected, price);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
      ),
    );
  }
}

class _CapacityNote extends StatelessWidget {
  const _CapacityNote();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: context.themeColors.brandText),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'Você reserva o '),
                  TextSpan(
                    text: 'horário',
                    style: TextStyle(fontWeight: FontWeight.w800, color: context.themeColors.onSurface),
                  ),
                  const TextSpan(text: '. A equipe da arena indica a quadra quando você chegar.'),
                ],
              ),
              style: theme.textTheme.bodySmall?.copyWith(color: context.themeColors.onSurfaceMuted, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 32),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.themeColors.onSurfaceMuted),
      ),
    );
  }
}

/// Horário da grade por horário: preço, quantas quadras livres, "Últimas vagas", "Lotado".
class CapacityTimeTile extends StatelessWidget {
  const CapacityTimeTile({
    super.key,
    required this.time,
    required this.selected,
    required this.onTap,
    this.priceLabel,
  });

  final CapacityTime time;
  final bool selected;
  final VoidCallback? onTap;
  final String? priceLabel;

  static String freeLabel(CapacityTime t) {
    if (t.isFull) return 'todas as quadras ocupadas';
    return t.freeCourts == 1 ? '1 quadra livre' : '${t.freeCourts} quadras livres';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final full = time.isFull;
    final last = time.isLastSpots;
    final accent = selected ? AppColors.brand : (last ? colors.pending : colors.win);
    final kicker = selected ? 'SELECIONADO' : (last ? 'ÚLTIMAS VAGAS' : null);
    final detail = [if (priceLabel != null) priceLabel!, freeLabel(time)].join(' · ');

    return Opacity(
      opacity: full ? 0.45 : 1,
      child: Material(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? AppColors.brand : colors.surfaceRaised,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.schedule_rounded, color: full ? colors.onSurfaceMuted : accent, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (kicker != null && !full) ...[
                        Text(
                          kicker,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: selected ? AppColors.brand : colors.pending,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.4,
                          ),
                        ),
                        const SizedBox(height: 4),
                      ],
                      Text(
                        '${time.startTime} - ${time.endTime}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: full ? colors.onSurfaceMuted : colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        detail,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: colors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (selected)
                  const Icon(Icons.check_circle_rounded, color: AppColors.brand, size: 24)
                else if (full)
                  Text(
                    'LOTADO',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colors.onSurfaceMuted,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
