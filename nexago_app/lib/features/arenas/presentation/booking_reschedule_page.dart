import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../weather/domain/weather_booking_rules.dart' show weatherBookingWindow;
import '../data/booking_reschedule_service.dart';
import '../domain/arena_court.dart';
import '../domain/arena_slot.dart';
import '../domain/arenas_providers.dart';
import '../domain/booking_reschedule.dart';
import '../domain/slots_page_providers.dart';
import '../domain/slots_providers.dart';
import '../domain/slots_query.dart';

/// Remarcar uma reserva avulsa: outro dia e/ou horário, mesma duração. O atleta fica na
/// mesma quadra; a arena pode trocar a quadra junto. Na reserva sem quadra definida (a
/// arena define a quadra) o horário vale se alguma quadra do esporte estiver livre — o
/// servidor escolhe a provisória. Fecha devolvendo o [BookingRescheduleResult].
class BookingReschedulePage extends ConsumerStatefulWidget {
  const BookingReschedulePage({
    super.key,
    required this.bookingId,
    required this.booking,
    required this.actor,
  });

  static const Key confirmKey = ValueKey('booking-reschedule-confirm');

  final String bookingId;
  final Map<String, dynamic> booking;
  final BookingRescheduleActor actor;

  /// Abre a tela; devolve o resultado quando remarcou.
  static Future<BookingRescheduleResult?> open(
    BuildContext context, {
    required String bookingId,
    required Map<String, dynamic> booking,
    required BookingRescheduleActor actor,
  }) {
    return Navigator.of(context).push<BookingRescheduleResult>(
      MaterialPageRoute(
        builder: (_) => BookingReschedulePage(
          bookingId: bookingId,
          booking: booking,
          actor: actor,
        ),
      ),
    );
  }

  @override
  ConsumerState<BookingReschedulePage> createState() =>
      _BookingReschedulePageState();
}

class _BookingReschedulePageState extends ConsumerState<BookingReschedulePage> {
  DateTime? _day;
  String? _courtId;
  String? _pickedStart;
  bool _submitting = false;

  String get _arenaId => (widget.booking['arenaId'] as String?)?.trim() ?? '';
  String get _currentCourtId =>
      (widget.booking['courtId'] as String?)?.trim() ?? '';
  bool get _floating => widget.booking['allocationStatus'] == 'unassigned';
  bool get _isArena => widget.actor == BookingRescheduleActor.arena;
  String get _currentDateKey {
    final raw = (widget.booking['date'] as String?)?.trim() ?? '';
    return raw.length >= 10 ? raw.substring(0, 10) : raw;
  }

  /// Quadras que podem receber a reserva: mesmo esporte, fora de manutenção.
  List<ArenaCourt> _eligibleCourts(List<ArenaCourt> courts) {
    final sport = (widget.booking['sport'] as String?)?.trim() ?? '';
    return [
      for (final c in courts)
        if (!c.isMaintenance &&
            (sport.isEmpty || c.sportTypes.isEmpty || c.sportTypes.contains(sport)))
          c,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = DateTime.now();
    final days = bookingRescheduleDays(now);
    final day = _day ?? days.first;
    final window = weatherBookingWindow(widget.booking);
    final durationMinutes = bookingDurationMinutes(widget.booking) ?? 60;
    final courts =
        ref.watch(courtsStreamProvider(_arenaId)).valueOrNull ?? const <ArenaCourt>[];
    final eligible = _eligibleCourts(courts);
    final courtId = _courtId ?? _currentCourtId;
    final shownCourts = _floating
        ? eligible
        : [for (final c in eligible) if (c.id == courtId) c];
    final fallbackPrice =
        ref.watch(arenaByIdProvider(_arenaId)).valueOrNull?.pricePerHourReais;

    var loading = false;
    var failed = false;
    final slotsByCourt = <List<ArenaSlot>>[];
    for (final c in shownCourts) {
      final async = ref.watch(slotsStreamProvider(SlotsQuery(
        arenaId: _arenaId,
        courtId: c.id,
        date: day,
        arenaFallbackPricePerHourReais: fallbackPrice,
      )));
      if (async.hasValue) {
        slotsByCourt.add(async.value!);
      } else if (async.hasError) {
        failed = true;
      } else {
        loading = true;
      }
    }
    final slotDuration = shownCourts.isEmpty
        ? 60
        : ref.watch(courtSlotDurationMinutesProvider(
            (arenaId: _arenaId, courtId: shownCourts.first.id)));
    final slotCount =
        (durationMinutes / (slotDuration > 0 ? slotDuration : 60)).ceil().clamp(1, 24);
    final options = buildBookingRescheduleOptions(
      slotsByCourt: slotsByCourt,
      slotCount: slotCount,
      day: day,
      now: now,
      bookingId: widget.bookingId,
      tablePriceReais: bookingTablePrice(widget.booking),
      currentDateKey: _currentDateKey,
      currentStartTime: (widget.booking['startTime'] as String?)?.trim() ?? '',
      sameCourt: _floating || courtId == _currentCourtId,
    );
    final picked = options
        .where((o) => o.startTime == _pickedStart && _selectable(o))
        .firstOrNull;

    final currentCourtName =
        (widget.booking['courtName'] as String?)?.trim() ?? 'Quadra';
    final currentLabel = window == null
        ? ''
        : '${bookingRescheduleWhenLabel(window.start, (widget.booking['startTime'] as String?) ?? '')}'
            '${_floating ? '' : ' · $currentCourtName'}';

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(title: const Text('Remarcar reserva')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          _CurrentCard(label: currentLabel),
          const SizedBox(height: 18),
          _Kicker('Dia'),
          const SizedBox(height: 10),
          SizedBox(
            height: 64,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: days.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) => _DayChip(
                day: days[i],
                selected: _sameDay(days[i], day),
                onTap: _submitting
                    ? null
                    : () => setState(() {
                          _day = days[i];
                          _pickedStart = null;
                        }),
              ),
            ),
          ),
          if (_isArena && !_floating && eligible.length > 1) ...[
            const SizedBox(height: 18),
            _Kicker('Quadra'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in eligible)
                  ChoiceChip(
                    label: Text(c.name),
                    selected: c.id == courtId,
                    onSelected: _submitting
                        ? null
                        : (_) => setState(() {
                              _courtId = c.id;
                              _pickedStart = null;
                            }),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 18),
          _Kicker('Horário · ${_durationLabel(durationMinutes)}'),
          const SizedBox(height: 10),
          if (loading && slotsByCourt.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (failed && slotsByCourt.isEmpty)
            Text('Não foi possível carregar os horários.',
                style: TextStyle(color: colors.onSurfaceMuted))
          else if (options.isEmpty)
            Text('Nenhum horário com essa duração neste dia.',
                style: TextStyle(color: colors.onSurfaceMuted))
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
                return _TimeCell(
                  option: o,
                  caption: _caption(o),
                  enabled: _selectable(o) && !_submitting,
                  selected: picked?.startTime == o.startTime,
                  onTap: () => setState(() => _pickedStart = o.startTime),
                );
              },
            ),
          const SizedBox(height: 14),
          Text(
            _isArena
                ? 'O valor da reserva não muda. Se o novo horário custar mais pela '
                    'tabela, acerte a diferença no balcão. O atleta é avisado.'
                : 'O valor da reserva não muda. Dá para remarcar uma vez, até '
                    '${BookingReschedulePolicy.athleteHoursBefore}h antes do horário. '
                    'Horários mais caros só com a arena.',
            style: TextStyle(fontSize: 12, height: 1.45, color: colors.onSurfaceMuted),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: FilledButton(
          key: BookingReschedulePage.confirmKey,
          onPressed: picked == null || _submitting
              ? null
              : () => _confirm(day, picked.startTime, courtId),
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
          ),
          child: _submitting
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(
                  picked == null
                      ? 'Escolha o novo horário'
                      : 'Remarcar para ${bookingRescheduleWhenLabel(day, picked.startTime)}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
        ),
      ),
    );
  }

  bool _selectable(BookingRescheduleOption o) =>
      o.available && (_isArena || !o.blockedForAthlete());

  String _caption(BookingRescheduleOption o) {
    if (!o.available) return 'Ocupado';
    final diff = o.priceDiffReais;
    if (!_isArena) return o.blockedForAthlete() ? 'Mais caro' : '';
    if (diff == null || diff.abs() < 0.01) return '';
    return diff > 0
        ? '+ ${formatBRL(diff)} tabela'
        : '− ${formatBRL(-diff)} tabela';
  }

  Future<void> _confirm(DateTime day, String startTime, String courtId) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await ref.read(bookingRescheduleServiceProvider).reschedule(
            bookingId: widget.bookingId,
            day: day,
            startTime: startTime,
            actor: widget.actor,
            courtId: _isArena && !_floating && courtId != _currentCourtId
                ? courtId
                : null,
          );
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } on BookingRescheduleException catch (e) {
      if (!mounted) return;
      if (e.slotTaken) setState(() => _pickedStart = null);
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível remarcar. Tente de novo.',
          isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  static String _durationLabel(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    if (m == 0) return '${h}h';
    return h == 0 ? '${m}min' : '${h}h${m.toString().padLeft(2, '0')}';
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

/// Mensagem de sucesso para o snackbar de quem abriu a tela.
String bookingRescheduledMessage(
  BookingRescheduleResult result, {
  required BookingRescheduleActor actor,
}) {
  final day = DateTime.tryParse(result.date);
  final when = day == null
      ? result.startTime
      : bookingRescheduleWhenLabel(day, result.startTime);
  final base = 'Reserva remarcada para $when.';
  if (actor != BookingRescheduleActor.arena) return base;
  final diff = result.tablePriceDiffReais;
  if (diff > 0.009) {
    return '$base Pela tabela, o novo horário custa ${formatBRL(diff)} a mais: '
        'acerte no balcão.';
  }
  return base;
}

class _Kicker extends StatelessWidget {
  const _Kicker(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.mono(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: context.themeColors.onSurfaceMuted,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _CurrentCard extends StatelessWidget {
  const _CurrentCard({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Icon(Icons.event_repeat_rounded, size: 16, color: colors.brandText),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                const TextSpan(text: 'Hoje: '),
                TextSpan(
                  text: label,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, color: colors.onSurface),
                ),
              ]),
              style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.day, required this.selected, required this.onTap});

  final DateTime day;
  final bool selected;
  final VoidCallback? onTap;

  static const _weekdays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

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
          width: 56,
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
                _weekdays[day.weekday - 1],
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

class _TimeCell extends StatelessWidget {
  const _TimeCell({
    required this.option,
    required this.caption,
    required this.enabled,
    required this.selected,
    required this.onTap,
  });

  final BookingRescheduleOption option;
  final String caption;
  final bool enabled;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Opacity(
      opacity: enabled ? 1 : 0.35,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.10)
            : colors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: enabled ? onTap : null,
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
                    decoration: option.available ? null : TextDecoration.lineThrough,
                  ),
                ),
                if (caption.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 10.5, color: colors.onSurfaceMuted),
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
