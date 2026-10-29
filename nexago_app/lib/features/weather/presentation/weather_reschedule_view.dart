import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_date_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_page_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../../arenas/domain/slots_query.dart';
import '../application/weather_providers.dart';
import '../domain/weather_models.dart';
import '../domain/weather_reschedule.dart';
import '../infrastructure/weather_service.dart';
import 'weather_ui.dart';
import 'widgets/weather_choice_widgets.dart';

/// A3 — "Novo horário": sempre na quadra da reserva original, dias de hoje
/// até `rescheduleUntil` e os horários livres com a mesma duração da reserva.
/// A grade reaproveita `slotsStreamProvider` (preços e disponibilidade do fluxo
/// de reserva).
class WeatherRescheduleView extends ConsumerStatefulWidget {
  const WeatherRescheduleView({
    super.key,
    required this.bookingId,
    required this.booking,
    required this.release,
    required this.arenaId,
    required this.arenaName,
    required this.originalCourtId,
    required this.originalCourtName,
    required this.originalStart,
    required this.onBack,
    required this.onDone,
  });

  static const Key confirmKey = ValueKey('weather-reschedule-confirm');

  final String bookingId;
  final Map<String, dynamic> booking;
  final WeatherRelease release;
  final String arenaId;
  final String arenaName;
  final String originalCourtId;
  final String originalCourtName;
  final DateTime originalStart;
  final VoidCallback onBack;
  final void Function(WeatherChoiceResult result, WeatherReschedulePick pick)
      onDone;

  @override
  ConsumerState<WeatherRescheduleView> createState() =>
      _WeatherRescheduleViewState();
}

class _WeatherRescheduleViewState extends ConsumerState<WeatherRescheduleView> {
  DateTime? _day;
  String? _pickedStart;
  bool _submitting = false;

  static final _monthFmt = DateFormat('MMMM', 'pt_BR');

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = DateTime.now();
    final courtId = widget.originalCourtId;
    final courtName = widget.originalCourtName;
    final slotDuration = ref.watch(
      courtSlotDurationMinutesProvider(
          (arenaId: widget.arenaId, courtId: courtId)),
    );
    final slotCount = weatherRescheduleSlotCount(
      booking: widget.booking,
      slotDurationMinutes: slotDuration,
    );
    final until = widget.release.rescheduleUntilDate;
    final days = weatherRescheduleDays(now: now, until: until);
    final day = _day != null && days.any((d) => sameDay(d, _day!))
        ? _day!
        : (days.isEmpty ? null : days.first);

    final fallbackPrice = ref
        .watch(arenaByIdProvider(widget.arenaId))
        .valueOrNull
        ?.pricePerHourReais;
    final query = day == null
        ? null
        : SlotsQuery(
            arenaId: widget.arenaId,
            courtId: courtId,
            date: day,
            arenaFallbackPricePerHourReais: fallbackPrice,
          );
    final slotsAsync =
        query == null ? null : ref.watch(slotsStreamProvider(query));
    final options = day == null || slotsAsync?.valueOrNull == null
        ? const <WeatherRescheduleOption>[]
        : buildWeatherRescheduleOptions(
            slots: slotsAsync!.valueOrNull!,
            slotCount: slotCount,
            day: day,
            now: now,
            creditableReais: widget.release.creditableReais,
          );
    final picked = options
        .where((o) => o.available && o.startTime == _pickedStart)
        .firstOrNull;

    final w = WeatherCopy.weekdayShort(widget.originalStart);
    final originalLabel =
        '${w.isEmpty ? w : w[0].toUpperCase() + w.substring(1)} '
        '${widget.originalStart.day} · ${WeatherCopy.time(widget.originalStart)}';

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: const Text('Novo horário'),
        leading: BackButton(onPressed: _submitting ? null : widget.onBack),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: colors.onSurface.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
            ),
            child: Row(
              children: [
                Icon(Icons.swap_horiz_rounded,
                    size: 16, color: colors.brandText),
                const SizedBox(width: 10),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(text: 'Remarcando '),
                        TextSpan(
                          text: originalLabel,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        TextSpan(text: ' · ${widget.originalCourtName}'),
                      ],
                    ),
                    style:
                        TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (days.isEmpty)
            Text(
              'O prazo para remarcar acabou. Volte e guarde o valor como crédito.',
              style: TextStyle(color: colors.onSurfaceMuted, height: 1.45),
            )
          else ...[
            WeatherKicker(
              '${_capitalize(_monthFmt.format(day!))}'
              '${until == null ? '' : ' · até ${WeatherCopy.dayShortMonth(until)}'}',
            ),
            const SizedBox(height: 10),
            // Cinco dias à vista, como no design; o resto rola de lado.
            LayoutBuilder(
              builder: (context, constraints) {
                final cell = (constraints.maxWidth - 4 * 8) / 5;
                return SizedBox(
                  height: 64,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: days.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, i) => _DayCell(
                      day: days[i],
                      width: cell,
                      selected: sameDay(days[i], day),
                      onTap: _submitting
                          ? null
                          : () => setState(() {
                                _day = days[i];
                                _pickedStart = null;
                              }),
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),
            WeatherKicker(
              '$courtName · ${_capitalize(WeatherCopy.weekdayShort(day))} '
              '${day.day.toString().padLeft(2, '0')}',
            ),
            const SizedBox(height: 10),
            if (slotsAsync == null ||
                slotsAsync.isLoading && !slotsAsync.hasValue)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (slotsAsync.hasError && !slotsAsync.hasValue)
              Text(
                'Não foi possível carregar os horários.',
                style: TextStyle(color: colors.onSurfaceMuted),
              )
            else if (options.isEmpty)
              Text(
                'Nenhum horário com essa duração neste dia.',
                style: TextStyle(color: colors.onSurfaceMuted),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: EdgeInsets.zero,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisExtent: 64,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: options.length,
                itemBuilder: (context, i) {
                  final o = options[i];
                  return _SlotCell(
                    option: o,
                    selected: picked?.startTime == o.startTime,
                    onTap: !o.available || _submitting
                        ? null
                        : () => setState(() => _pickedStart = o.startTime),
                  );
                },
              ),
            const SizedBox(height: 14),
            Text(
              picked != null &&
                      picked.delta.kind == WeatherRescheduleDeltaKind.leftover
                  ? 'A diferença de ${WeatherCopy.money(picked.delta.amountReais)} '
                      'vira crédito na ${widget.arenaName}.'
                  : 'Horários mais caros cobram só a diferença, paga na arena.',
              style: TextStyle(
                  fontSize: 12, height: 1.45, color: colors.onSurfaceMuted),
            ),
          ],
        ],
      ),
      bottomNavigationBar: WeatherBottomBar(
        ctaKey: WeatherRescheduleView.confirmKey,
        amountCaption: 'A pagar na arena',
        amountLabel: WeatherCopy.money(picked?.delta.dueOnsiteReais ?? 0),
        ctaLabel: 'Confirmar remarcação',
        loading: _submitting,
        onCta: picked == null || day == null
            ? null
            : () => _confirm(
                  WeatherReschedulePick(
                    courtId: courtId,
                    courtName: courtName,
                    dateKey: calendarDateKey(day),
                    startTime: picked.startTime,
                    endTime: picked.endTime,
                    selectedSlotStartTimes: picked.slotStartTimes,
                  ),
                  query!,
                ),
      ),
    );
  }

  Future<void> _confirm(WeatherReschedulePick pick, SlotsQuery query) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await ref.read(weatherServiceProvider).chooseOption(
            bookingId: widget.bookingId,
            choice: WeatherChoice.reschedule,
            reschedule: pick,
          );
      if (!mounted) return;
      widget.onDone(result, pick);
    } on WeatherException catch (e) {
      if (!mounted) return;
      if (e.isSlotTaken) {
        setState(() => _pickedStart = null);
        ref.invalidate(slotsStreamProvider(query));
      }
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível remarcar. Tente de novo.',
          isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  static bool sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.width,
    required this.selected,
    required this.onTap,
  });

  final DateTime day;
  final double width;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected ? AppColors.black : colors.onSurface;
    return Material(
      color: selected ? AppColors.brand : colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: width,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? Colors.transparent
                  : colors.onSurface.withValues(alpha: 0.08),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                WeatherCopy.weekdayShort(day).toUpperCase(),
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: fg.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                day.day.toString().padLeft(2, '0'),
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlotCell extends StatelessWidget {
  const _SlotCell(
      {required this.option, required this.selected, required this.onTap});

  final WeatherRescheduleOption option;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final busy = !option.available;
    final delta = option.delta;
    final (String caption, Color captionColor) = busy
        ? ('Ocupado', colors.onSurfaceMuted)
        : switch (delta.kind) {
            WeatherRescheduleDeltaKind.same => (
                'Mesmo valor',
                colors.onSurfaceMuted
              ),
            WeatherRescheduleDeltaKind.extra => (
                '+ ${WeatherCopy.money(delta.amountReais)}',
                colors.pending,
              ),
            WeatherRescheduleDeltaKind.leftover => (
                '− ${WeatherCopy.money(delta.amountReais)} vira crédito',
                colors.win,
              ),
            WeatherRescheduleDeltaKind.unknown => ('', colors.onSurfaceMuted),
          };
    return Opacity(
      opacity: busy ? 0.35 : 1,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.10)
            : colors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? AppColors.brand
                    : colors.onSurface.withValues(alpha: 0.08),
                width: 1.5,
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  option.startTime,
                  style: AppTypography.mono(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: selected ? colors.brandText : colors.onSurface,
                  ).copyWith(
                    decoration: busy ? TextDecoration.lineThrough : null,
                  ),
                ),
                if (caption.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  // "− R$ 15,00 vira crédito" quebra em duas linhas.
                  Text(
                    caption,
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10.5,
                      height: 1.2,
                      color: captionColor,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
