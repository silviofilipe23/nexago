import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../athlete/domain/athlete_profile_providers.dart';
import '../../../domain/arena_booking_confirm_args.dart';
import '../../../domain/arena_court.dart';
import '../../../domain/arena_detail_agenda_logic.dart';
import '../../../domain/arena_detail_providers.dart';
import '../../../domain/arena_list_item.dart';
import '../../../domain/arena_peak_rule.dart';
import '../../../domain/arena_slot.dart';
import '../../../domain/arena_sport_codes.dart';
import '../../../domain/slot_vacancy_alert.dart';
import '../../../domain/slot_vacancy_alerts_provider.dart';
import '../../../domain/slots_page_logic.dart';
import '../../../domain/slots_providers.dart';
import '../../arena_booking_navigation.dart';
import '../slots/slots_vacancy_topic_prompt.dart';
import 'arena_detail_agenda_section.dart';
import 'arena_detail_bottom_cta.dart';

/// O que a agenda conta para a página: o dia aberto e o horário escolhido
/// (`null` = nenhum), que vira a barra "Reservar".
class ArenaDetailAgendaReport {
  const ArenaDetailAgendaReport({required this.day, this.selection});

  final DateTime day;
  final ArenaDetailBookingSelection? selection;
}

/// Agenda do perfil da arena: carrega os horários de todas as quadras para a
/// faixa de dias, guarda dia/esporte/duração/horário escolhidos e leva o
/// horário à confirmação (ou à grade, quando a regra de pico pede mais tempo).
class ArenaDetailAgenda extends ConsumerStatefulWidget {
  const ArenaDetailAgenda({
    super.key,
    required this.arena,
    required this.onReport,
    this.horizontalPadding = 20,
    this.clock = DateTime.now,
  });

  /// Dias da faixa: os mesmos 21 da grade de horários. Igual ao horário de
  /// funcionamento do perfil, para os dois lerem a mesma grade.
  static const int stripDays = kArenaDetailGridDays;

  final ArenaListItem arena;
  final ValueChanged<ArenaDetailAgendaReport> onReport;
  final double horizontalPadding;

  /// Relógio da agenda (os testes fixam o "agora").
  final DateTime Function() clock;

  @override
  ConsumerState<ArenaDetailAgenda> createState() => _ArenaDetailAgendaState();
}

class _ArenaDetailAgendaState extends ConsumerState<ArenaDetailAgenda> {
  static final _dayFmt = DateFormat('EEE, d MMM', 'pt_BR');

  late DateTime _day = slotDayOnly(widget.clock());
  String? _sport;
  int? _duration;
  String? _start;
  bool _notifyLoading = false;
  String? _lastReportKey;

  void _update(VoidCallback change) => setState(change);

  void _selectDay(DateTime day) => _update(() {
        _day = slotDayOnly(day);
        _start = null;
      });

  void _toggleTime(AgendaTime time) => _update(() {
        _start = _start == time.startTime ? null : time.startTime;
      });

  // ---- reservar ----

  void _reserve(AgendaView view, AgendaTime time, List<ArenaSlot> daySlots) {
    final arena = widget.arena;
    final price = time.priceReais;
    if (price == null || price <= 0) {
      showAppSnackBar(
        context,
        'Este horário ainda não tem preço. Escolha outro ou fale com a arena.',
        isError: true,
      );
      return;
    }

    if (view.isCapacity) {
      final sport = view.sport;
      if (sport == null) return;
      _pushConfirm(ArenaBookingConfirmArgs(
        arenaId: arena.id,
        arenaName: arena.name,
        courtId: '',
        courtName: '',
        courtSubtitle: courtSportLabel(sport),
        date: _day,
        startTime: time.startTime,
        endTime: time.endTime,
        amountReais: price,
        selectedSlotStartTimes: time.slotStartTimes,
        capacity: true,
        sport: sport,
      ));
      return;
    }

    final court = _courtById(view.candidates, time.courtId);
    if (court == null) return;
    final courtSlots = [
      for (final s in daySlots)
        if (s.courtId == court.id) s,
    ];
    final rules = ref.read(arenaPeakRulesProvider(arena.id)).valueOrNull ??
        const <ArenaPeakRule>[];
    final needsPeakFlow = agendaNeedsPeakFlow(
      rules: rules,
      courtId: court.id,
      courtSlots: courtSlots,
      day: _day,
      slotStartTimes: time.slotStartTimes,
      slotDurationMinutes: court.slotDurationMinutes,
      now: widget.clock(),
    );
    if (needsPeakFlow) {
      // A grade explica a regra e oferece a duração mínima.
      openArenaBookingSlots(
        context,
        arena: arena,
        date: _day,
        courtId: court.id,
        slot: _slotAt(courtSlots, time.startTime),
      );
      return;
    }

    final sports = court.sportTypesLabel.trim();
    _pushConfirm(ArenaBookingConfirmArgs(
      arenaId: arena.id,
      arenaName: arena.name,
      courtId: court.id,
      courtName: court.name,
      courtSubtitle: sports.isEmpty || sports == '—' ? null : sports,
      date: _day,
      startTime: time.startTime,
      endTime: time.endTime,
      amountReais: price,
      selectedSlotStartTimes: time.slotStartTimes,
    ));
  }

  void _pushConfirm(ArenaBookingConfirmArgs args) {
    context.pushNamed(
      AppRouteNames.arenaBookingConfirm,
      pathParameters: {'arenaId': widget.arena.id},
      extra: args,
    );
  }

  static ArenaCourt? _courtById(List<ArenaCourt> courts, String? id) {
    for (final c in courts) {
      if (c.id == id) return c;
    }
    return null;
  }

  static ArenaSlot? _slotAt(List<ArenaSlot> slots, String startTime) {
    for (final s in slots) {
      if (s.startTime.trim().startsWith(startTime)) return s;
    }
    return null;
  }

  void _openFullGrid(AgendaView? view) {
    openArenaBookingSlots(
      context,
      arena: widget.arena,
      date: _day,
      sport: (view?.isCapacity ?? false) ? view?.sport : null,
    );
  }

  // ---- avise-me ----

  List<SlotVacancyAlertKey> _alertKeys(AgendaView view) => [
        for (final c in view.candidates)
          SlotVacancyAlertKey(
            arenaId: widget.arena.id,
            courtId: c.id,
            date: _day,
          ),
      ];

  /// Dia lotado: um alerta por quadra da agenda (o aviso de vaga é por
  /// quadra). Desligar tira todos.
  Future<void> _toggleNotify(AgendaView view, bool active) async {
    final user = ref.read(authServiceProvider).currentUser;
    if (user == null) {
      showAppSnackBar(context, 'Entre na conta para ativar alertas.');
      return;
    }
    final service = ref.read(slotVacancyAlertServiceProvider);
    final keys = _alertKeys(view);
    final courtNames = {for (final c in view.candidates) c.id: c.name};
    setState(() => _notifyLoading = true);
    try {
      if (active) {
        for (final key in keys) {
          await service.unsubscribe(userId: user.uid, key: key);
        }
        if (mounted) showAppSnackBar(context, 'Aviso desativado.');
        return;
      }
      await promptAvailableSlotsTopicIfOff(context, ref);
      for (final key in keys) {
        await service.subscribe(
          userId: user.uid,
          key: key,
          arenaName: widget.arena.name,
          courtName: courtNames[key.courtId] ?? 'Quadra',
        );
      }
      if (mounted) {
        showAppSnackBar(context, 'Avisamos você se abrir vaga neste dia.');
      }
    } on Exception {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível salvar o aviso. Tente de novo.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _notifyLoading = false);
    }
  }

  // ---- relatório para a página ----

  ArenaDetailBookingSelection? _selectionFor(
    AgendaView view,
    AgendaTime? time,
    List<ArenaSlot> daySlots,
  ) {
    if (time == null) return null;
    final where = view.isCapacity
        ? 'A arena define a quadra'
        : (_courtById(view.candidates, time.courtId)?.name ?? 'Quadra');
    final price = time.priceReais;
    return ArenaDetailBookingSelection(
      title: '${time.startTime}–${time.endTime}',
      subtitle: [
        _dayFmt.format(_day).replaceAll('.', ''),
        where,
        if (price != null) formatBRLWhole(price),
      ].join(' · '),
      onReserve: () => _reserve(view, time, daySlots),
    );
  }

  void _report(DateTime day, ArenaDetailBookingSelection? selection) {
    final key = '${day.toIso8601String()}|${selection?.title}|'
        '${selection?.subtitle}';
    if (key == _lastReportKey) return;
    _lastReportKey = key;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onReport(ArenaDetailAgendaReport(day: day, selection: selection));
    });
  }

  @override
  Widget build(BuildContext context) {
    final arena = widget.arena;
    final now = widget.clock();
    final stripStart = computeSlotsDayStripStart(
      today: now,
      selectedDay: _day,
      daysCount: ArenaDetailAgenda.stripDays,
    );
    final courts = ref.watch(courtsStreamProvider(arena.id)).valueOrNull;
    final rangeSlots = ref
        .watch(arenaRangeSlotsProvider((
          arenaId: arena.id,
          from: stripStart,
          days: ArenaDetailAgenda.stripDays,
        )))
        .valueOrNull;
    // Mantém as regras de pico carregadas para a hora de reservar.
    ref.watch(arenaPeakRulesProvider(arena.id));
    final primarySport = ref.watch(
      athleteProfileProvider.select(
        (p) => p.valueOrNull?.primarySportFirestoreId,
      ),
    );

    final view = (courts == null || rangeSlots == null)
        ? null
        : buildAgendaView(
            allocation: arena.bookingAllocation,
            courts: courts,
            daySlots: rangeSlots,
            day: _day,
            now: now,
            sportChoice: _sport,
            durationChoice: _duration,
            primarySport: primarySport,
          );
    final statuses = view == null || rangeSlots == null
        ? null
        : agendaCalendarStatuses(
            rangeSlots: rangeSlots,
            candidateIds: {for (final c in view.candidates) c.id},
            startDay: stripStart,
            days: ArenaDetailAgenda.stripDays,
            now: now,
          );
    final dayState = view?.dayState;
    final nextOpen = statuses == null || dayState == AgendaDayState.open
        ? null
        : nextOpenDay(statuses, after: _day);

    var notifyActive = false;
    if (view != null && dayState == AgendaDayState.full) {
      for (final key in _alertKeys(view)) {
        if (ref.watch(slotVacancyAlertActiveProvider(key)).valueOrNull ==
            true) {
          notifyActive = true;
        }
      }
    }

    final selected = view?.freeTimeAt(_start);
    _report(
      _day,
      view == null ? null : _selectionFor(view, selected, rangeSlots ?? []),
    );

    return ArenaDetailAgendaSection(
      view: view,
      stripStart: stripStart,
      stripDays: ArenaDetailAgenda.stripDays,
      selectedDay: _day,
      calendar: statuses,
      selectedStart: selected?.startTime,
      horizontalPadding: widget.horizontalPadding,
      onDaySelected: _selectDay,
      onSportSelected: (sport) => _update(() {
        _sport = sport;
        _start = null;
      }),
      onDurationSelected: (minutes) => _update(() {
        _duration = minutes;
        _start = null;
      }),
      onTimeTapped: _toggleTime,
      onOpenFullGrid: () => _openFullGrid(view),
      nextOpenDay: nextOpen,
      notifyActive: notifyActive,
      notifyLoading: _notifyLoading,
      onNotifyToggle: view == null || view.candidates.isEmpty
          ? null
          : () => _toggleNotify(view, notifyActive),
    );
  }
}
