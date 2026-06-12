import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_court.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_slot.dart';
import '../domain/court_pricing.dart';
import '../../../core/auth/auth_providers.dart';
import '../../athlete/domain/athlete_notification_preferences_providers.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/slot_vacancy_alert.dart';
import '../domain/slot_vacancy_alerts_provider.dart';
import '../domain/slots_page_logic.dart';
import '../domain/slots_page_providers.dart';
import '../domain/slots_suggestion_models.dart';
import '../domain/slots_suggestions_logic.dart';
import '../domain/slots_suggestions_providers.dart';
import '../domain/arenas_providers.dart';
import '../domain/slots_providers.dart';
import '../domain/slots_query.dart';
import 'widgets/slots/slots_all_suggestions_sheet.dart';
import 'widgets/slots/slots_bottom_bar.dart';
import 'widgets/slots/slots_fully_booked_body.dart';
import 'widgets/slots/slots_court_carousel.dart';
import 'widgets/slots/slots_day_strip.dart';
import 'widgets/slots/slots_list_section.dart';
import 'widgets/slots/slots_page_header.dart';

/// Seleção de horários: quadras (`arenas/.../courts`) + `arenaSlots` por dia (YYYY-MM-DD).
class SlotsPage extends ConsumerWidget {
  const SlotsPage({
    super.key,
    required this.arenaId,
    this.initialArena,
    this.initialDate,
    this.initialCourtId,
    this.initialStartTime,
  });

  final String arenaId;
  final ArenaListItem? initialArena;
  final DateTime? initialDate;
  final String? initialCourtId;
  final String? initialStartTime;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncArena = ref.watch(arenaByIdProvider(arenaId));

    return asyncArena.when(
      data: (remote) {
        final arena = remote ?? initialArena;
        if (arena == null) {
          return AppScaffold(
            title: 'Horários',
            body: AppEmptyView(
              icon: Icons.event_busy_rounded,
              title: 'Arena não encontrada',
              subtitle: 'Volte e escolha uma arena na lista.',
              actionLabel: 'Voltar',
              onAction: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.discover);
                }
              },
            ),
          );
        }
        return FadeSlideIn(
          child: _SlotsScheduleView(
            arena: arena,
            initialDate: initialDate,
            initialCourtId: initialCourtId,
            initialStartTime: initialStartTime,
          ),
        );
      },
      loading: () {
        if (initialArena != null) {
          return FadeSlideIn(
            child: _SlotsScheduleView(
              arena: initialArena!,
              initialDate: initialDate,
              initialCourtId: initialCourtId,
              initialStartTime: initialStartTime,
            ),
          );
        }
        return AppScaffold(
          title: 'Horários',
          body: const AppLoadingView(message: 'Carregando arena…'),
        );
      },
      error: (e, _) => AppScaffold(
        title: 'Horários',
        body: AppErrorView(
          title: 'Algo deu errado',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () => ref.invalidate(arenaByIdProvider(arenaId)),
        ),
      ),
    );
  }
}

class _SlotsScheduleView extends ConsumerStatefulWidget {
  const _SlotsScheduleView({
    required this.arena,
    this.initialDate,
    this.initialCourtId,
    this.initialStartTime,
  });

  final ArenaListItem arena;
  final DateTime? initialDate;
  final String? initialCourtId;
  final String? initialStartTime;

  @override
  ConsumerState<_SlotsScheduleView> createState() => _SlotsScheduleViewState();
}

class _SlotsScheduleViewState extends ConsumerState<_SlotsScheduleView> {
  void _handleBack() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(
      AppRoutes.arenaDetail.replaceAll(':arenaId', widget.arena.id),
      extra: widget.arena,
    );
  }

  static const _calendarDays = 21;

  late DateTime _selectedDay;

  /// Intervalo inclusivo na lista ordenada de slots (sempre índices consecutivos).
  int? _selStart;
  int? _selEnd;
  String? _selectedCourtId;
  SlotPeriodFilter _periodFilter = SlotPeriodFilter.all;
  int? _selectedDurationMinutes;
  bool _didApplyInitialSuggestedSlot = false;
  String? _pendingApplyStartTime;
  bool _notifyLoading = false;

  final GlobalKey _nextSlotKey = GlobalKey();
  final GlobalKey _selectedSlotKey = GlobalKey();
  Object? _lastAutoScrollToken;

  /// Lista vertical de slots: precisa de controller para aproximar scroll antes do
  /// item existir na árvore (ListView lazy não monta filhos fora da viewport).
  final ScrollController _slotListScrollController = ScrollController();

  static final _metaDateFmt = DateFormat('EEE, d MMM', 'pt_BR');
  static final _priceFmt = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _selectedDay = _dateOnly(widget.initialDate ?? DateTime.now());
    final initialCourt = widget.initialCourtId?.trim();
    if (initialCourt != null && initialCourt.isNotEmpty) {
      _selectedCourtId = initialCourt;
    }
  }

  @override
  void dispose() {
    _slotListScrollController.dispose();
    super.dispose();
  }

  DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _resolveCourtId(List<ArenaCourt> courts) {
    final selected = _selectedCourtId?.trim();
    if (selected != null && selected.isNotEmpty) {
      for (final c in courts) {
        if (c.id == selected) return selected;
      }
    }

    final suggested = widget.initialCourtId?.trim();
    if (suggested != null && suggested.isNotEmpty) {
      for (final c in courts) {
        if (c.id == suggested) {
          if (_selectedCourtId != suggested) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              setState(() => _selectedCourtId = suggested);
            });
          }
          return suggested;
        }
      }
    }

    return courts.first.id;
  }

  void _goToConfirm(
    BuildContext context,
    List<ArenaCourt> courts,
    String courtId,
    List<ArenaSlot> slots,
  ) {
    final s = _selStart;
    final e = _selEnd;
    if (s == null || e == null || s > e || s < 0 || e >= slots.length) return;
    final first = slots[s];
    final last = slots[e];
    var courtName = 'Quadra';
    String? courtSubtitle;
    for (final c in courts) {
      if (c.id == courtId) {
        courtName = c.name;
        final label = c.sportTypesLabel.trim();
        if (label.isNotEmpty && label != '—') {
          courtSubtitle = label;
        }
        break;
      }
    }
    final total = totalPriceForRange(slots, s, e);
    if (total == null || total <= 0) {
      showAppSnackBar(
        context,
        'Configure o preço da quadra antes de reservar.',
        isError: true,
      );
      return;
    }

    final selectedStarts = <String>[
      for (var i = s; i <= e; i++) slots[i].startTime.trim(),
    ];

    context.pushNamed(
      AppRouteNames.arenaBookingConfirm,
      pathParameters: {'arenaId': widget.arena.id},
      extra: ArenaBookingConfirmArgs(
        arenaId: widget.arena.id,
        arenaName: widget.arena.name,
        courtId: courtId,
        courtName: courtName,
        courtSubtitle: courtSubtitle,
        date: DateTime(first.date.year, first.date.month, first.date.day),
        startTime: first.startTime,
        endTime: last.endTime,
        amountReais: total,
        selectedSlotStartTimes: selectedStarts,
      ),
    );
  }

  bool _isIndexSelected(int index) {
    final a = _selStart;
    final b = _selEnd;
    if (a == null || b == null) return false;
    return index >= a && index <= b;
  }

  bool _isSelectionAnchorIndex(int index) {
    final b = _selEnd;
    if (b == null) return false;
    return index == b;
  }

  bool _rangeStillValid(List<ArenaSlot> slots, int s, int e) {
    if (s < 0 || e >= slots.length || s > e) return false;
    final now = DateTime.now();
    for (var i = s; i <= e; i++) {
      final slot = slots[i];
      if (isPastBookableSlot(selectedDay: _selectedDay, slot: slot, now: now)) {
        return false;
      }
      if (!slot.isSelectable) return false;
    }
    return true;
  }

  bool _isPastSlot(ArenaSlot slot) => isPastBookableSlot(
    selectedDay: _selectedDay,
    slot: slot,
    now: DateTime.now(),
  );

  void _onSlotTap(int index, List<ArenaSlot> slots) {
    final slot = slots[index];
    if (_isPastSlot(slot)) return;
    if (!slot.isSelectable) return;

    setState(() {
      final s = _selStart;
      final e = _selEnd;
      if (s == null || e == null) {
        _selStart = index;
        _selEnd = index;
        return;
      }

      if (index >= s && index <= e) {
        if (index == s) {
          _selStart = null;
          _selEnd = null;
        } else {
          _selEnd = index - 1;
        }
        return;
      }

      if (index == s - 1) {
        _selStart = index;
        return;
      }
      if (index == e + 1) {
        _selEnd = index;
        return;
      }

      _selStart = index;
      _selEnd = index;
    });
  }

  /// Primeiro índice ainda alugável (vide [_isPastSlot]).
  int? _nextAvailableIndex(List<ArenaSlot> slots) {
    for (var i = 0; i < slots.length; i++) {
      final s = slots[i];
      if (_isPastSlot(s)) continue;
      if (!s.isAvailable) continue;
      return i;
    }
    return null;
  }

  /// Altura aproximada: tile + [SizedBox] separador (10). Usada só para `jumpTo`
  /// aproximado e forçar o sliver a materializar o índice alvo.
  static const _approxSlotListItemExtent = 118.0;

  void _scrollToSlotIndex(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_slotListScrollController.hasClients) return;
      final selectedCtx = _selectedSlotKey.currentContext;
      if (selectedCtx != null) {
        Scrollable.ensureVisible(
          selectedCtx,
          alignment: 0.08,
          duration: const Duration(milliseconds: 360),
          curve: Curves.easeOutCubic,
        );
        return;
      }
      final position = _slotListScrollController.position;
      final raw = index * (_approxSlotListItemExtent + 10);
      // Mantém o item selecionado visível com folga superior.
      // Sem esse ajuste, a aproximação por altura pode passar do alvo.
      final target = (raw - 120).clamp(0.0, position.maxScrollExtent);
      _slotListScrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _applyInitialSuggestedSlotIfNeeded(
    String courtId,
    List<ArenaSlot> slots,
  ) {
    final pending = _pendingApplyStartTime?.trim();
    if (pending != null && pending.isNotEmpty) {
      _applyStartTimeSelection(courtId, slots, pending);
      _pendingApplyStartTime = null;
      return;
    }

    if (_didApplyInitialSuggestedSlot) return;
    final suggestedStart = widget.initialStartTime?.trim();
    if (suggestedStart == null || suggestedStart.isEmpty) {
      _didApplyInitialSuggestedSlot = true;
      return;
    }
    final suggestedCourt = widget.initialCourtId?.trim();
    if (suggestedCourt != null &&
        suggestedCourt.isNotEmpty &&
        suggestedCourt != courtId) {
      return;
    }

    _didApplyInitialSuggestedSlot = true;
    _applyStartTimeSelection(courtId, slots, suggestedStart);
  }

  void _applyStartTimeSelection(
    String courtId,
    List<ArenaSlot> slots,
    String startTime,
  ) {
    final idx = slots.indexWhere((slot) => slot.startTime.trim() == startTime);
    if (idx < 0) return;
    final target = slots[idx];
    if (_isPastSlot(target) || !target.isSelectable) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        _selStart = idx;
        _selEnd = idx;
      });
      _scrollToSlotIndex(idx);
    });
  }

  void _onSuggestionAction(SlotsSuggestion suggestion) {
    switch (suggestion.kind) {
      case SlotsSuggestionKind.alternateCourt:
        setState(() {
          if (suggestion.courtId != null) {
            _selectedCourtId = suggestion.courtId;
          }
          if (suggestion.date != null) {
            _selectedDay = _dateOnly(suggestion.date!);
          }
          _pendingApplyStartTime = suggestion.startTime;
          _clearSelection();
          _didApplyInitialSuggestedSlot = false;
        });
        break;
      case SlotsSuggestionKind.nextDay:
        if (suggestion.date == null) return;
        setState(() {
          _selectedDay = _dateOnly(suggestion.date!);
          _pendingApplyStartTime = suggestion.startTime;
          _clearSelection();
          _didApplyInitialSuggestedSlot = false;
        });
        break;
      case SlotsSuggestionKind.nearbyArena:
        final arena = suggestion.arena;
        final arenaId = suggestion.arenaId;
        if (arena == null || arenaId == null || arenaId.isEmpty) return;
        final date = suggestion.date ?? _selectedDay;
        final params = <String, String>{
          'date': SlotVacancyAlert.dateKeyFrom(date),
        };
        final cid = suggestion.courtId?.trim();
        if (cid != null && cid.isNotEmpty) params['courtId'] = cid;
        final st = suggestion.startTime?.trim();
        if (st != null && st.isNotEmpty) params['startTime'] = st;
        context.pushNamed(
          AppRouteNames.arenaSlots,
          pathParameters: {'arenaId': arenaId},
          extra: arena,
          queryParameters: params,
        );
        return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_slotListScrollController.hasClients) {
        _slotListScrollController.jumpTo(0);
      }
    });
  }

  Future<void> _openAllSuggestionsSheet(
    List<SlotsSuggestion> suggestions,
  ) async {
    await showSlotsAllSuggestionsSheet(
      context: context,
      suggestions: suggestions,
      onSuggestionAction: _onSuggestionAction,
    );
  }

  Future<void> _toggleVacancyAlert({
    required String courtId,
    required String courtName,
  }) async {
    final user = ref.read(authServiceProvider).currentUser;
    if (user == null) {
      showAppSnackBar(context, 'Entre na conta para ativar alertas.');
      return;
    }

    final key = SlotVacancyAlertKey(
      arenaId: widget.arena.id,
      courtId: courtId,
      date: _selectedDay,
    );
    final service = ref.read(slotVacancyAlertServiceProvider);
    final active =
        ref.read(slotVacancyAlertActiveProvider(key)).valueOrNull ?? false;

    setState(() => _notifyLoading = true);
    try {
      if (active) {
        await service.unsubscribe(userId: user.uid, key: key);
        if (mounted) {
          showAppSnackBar(context, 'Alerta desativado.');
        }
        return;
      }

      final profile = ref.read(athleteProfileProvider).valueOrNull;
      if (profile != null &&
          !profile.notificationPreferences.topics.availableSlots) {
        final enable = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: context.themeColors.surfaceSheet,
            title: Text('Ativar notificações de vagas?'),
            content: Text(
              'Para avisar quando liberar, ative o tópico '
              '"Horários disponíveis" nas suas preferências.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text('Agora não'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text('Ativar'),
              ),
            ],
          ),
        );
        if (enable == true) {
          ref
              .read(athleteNotificationPreferencesProvider.notifier)
              .setTopic(availableSlots: true);
          await ref
              .read(athleteNotificationPreferencesProvider.notifier)
              .saveNow();
        }
      }

      await service.subscribe(
        userId: user.uid,
        key: key,
        arenaName: widget.arena.name,
        courtName: courtName,
      );
      if (mounted) {
        showAppSnackBar(
          context,
          'Você será avisado se abrir vaga nesta quadra.',
        );
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível salvar o alerta. Tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _notifyLoading = false);
    }
  }

  void _ensureNextSlotVisible(int nextIdx) {
    void scrollIfReady() {
      final ctx = _nextSlotKey.currentContext;
      if (ctx == null || !mounted) return;
      Scrollable.ensureVisible(
        ctx,
        alignment: 0.22,
        duration: const Duration(milliseconds: 380),
        curve: Curves.easeOutCubic,
      );
    }

    void jumpRoughThenEnsure() {
      final sc = _slotListScrollController;
      if (!sc.hasClients || !mounted) return;
      final pos = sc.position;
      final max = pos.maxScrollExtent;
      final raw = nextIdx * (_approxSlotListItemExtent + 10);
      final target = max > 0 ? raw.clamp(0.0, max) : raw;
      sc.jumpTo(target);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        scrollIfReady();
        if (_nextSlotKey.currentContext == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            scrollIfReady();
          });
        }
      });
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_nextSlotKey.currentContext != null) {
        scrollIfReady();
        return;
      }
      if (!_slotListScrollController.hasClients) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          jumpRoughThenEnsure();
        });
        return;
      }
      jumpRoughThenEnsure();
    });
  }

  void _scheduleScrollToNextIfNeeded(
    String courtId,
    List<ArenaSlot> slots,
    int? nextIdx,
  ) {
    if (nextIdx == null) return;
    final token = Object.hash(
      courtId,
      _selectedDay.year,
      _selectedDay.month,
      _selectedDay.day,
      nextIdx,
      slots.isNotEmpty ? slots[nextIdx].id : '',
    );
    if (_lastAutoScrollToken == token) return;
    _lastAutoScrollToken = token;
    _ensureNextSlotVisible(nextIdx);
  }

  void _clearSelection() {
    _selStart = null;
    _selEnd = null;
    _selectedDurationMinutes = null;
    _lastAutoScrollToken = null;
  }

  void _applyDurationMinutes(
    int minutes,
    List<ArenaSlot> slots,
    int slotDurationMinutes,
  ) {
    final range = selectRangeForDuration(
      slots: slots,
      durationMinutes: minutes,
      slotDurationMinutes: slotDurationMinutes,
      selectedDay: _selectedDay,
      anchorIndex: _selStart ?? _nextAvailableIndex(slots),
    );
    if (range == null) return;
    setState(() {
      _selStart = range.start;
      _selEnd = range.end;
      _selectedDurationMinutes = minutes;
    });
    _scrollToSlotIndex(range.end);
  }

  ({String? meta, String? total}) _bottomBarLabels(
    List<ArenaSlot> slots,
    int slotDurationMinutes,
  ) {
    final s = _selStart;
    final e = _selEnd;
    if (s == null || e == null || !_rangeStillValid(slots, s, e)) {
      return (meta: null, total: null);
    }
    final n = e - s + 1;
    final durationLabel = formatSelectionDurationLabel(n, slotDurationMinutes);
    final meta = '$durationLabel · ${_metaDateFmt.format(_selectedDay)}';
    final totalVal = totalPriceForRange(slots, s, e);
    final total = totalVal != null ? _priceFmt.format(totalVal) : null;
    return (meta: meta, total: total);
  }

  String _courtName(List<ArenaCourt> courts, String courtId) {
    for (final c in courts) {
      if (c.id == courtId) return c.name;
    }
    return 'Quadra';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaId = widget.arena.id;
    final courtsAsync = ref.watch(courtsStreamProvider(arenaId));

    return courtsAsync.when(
      data: (courts) {
        if (courts.isEmpty) {
          return AppScaffold(
            title: 'Horários',
            body: AppEmptyView(
              icon: Icons.sports_tennis_rounded,
              title: 'Nenhuma quadra cadastrada',
              subtitle:
                  'Cadastre quadras em arenas/$arenaId/courts no Firestore para ver horários.',
            ),
          );
        }

        final courtId = _resolveCourtId(courts);
        final query = SlotsQuery(
          arenaId: arenaId,
          courtId: courtId,
          date: _selectedDay,
          arenaFallbackPricePerHourReais: widget.arena.pricePerHourReais,
        );
        final slotsAsync = ref.watch(slotsStreamProvider(query));

        // Um único FadeSlideIn: troca de quadra só atualiza a lista (evita tela cheia
        // alternando com o scaffold e o piscar do fade).
        return FadeSlideIn(
          child: slotsAsync.when(
            data: (slots) => _buildMainScaffold(
              context,
              theme,
              courts,
              courtId,
              query,
              slots,
              slotsLoading: false,
            ),
            loading: () => _buildMainScaffold(
              context,
              theme,
              courts,
              courtId,
              query,
              const [],
              slotsLoading: true,
            ),
            error: (e, _) => AppScaffold(
              title: 'Horários',
              body: AppErrorView(
                title: 'Não foi possível carregar os horários',
                message:
                    '${e.toString().replaceFirst('Exception: ', '')}\n\nSe o Firestore pedir índice, crie-o para a coleção arenaSlots.',
                onRetry: () {
                  showAppSnackBar(context, 'Atualizando…');
                  ref.invalidate(slotsStreamProvider(query));
                },
              ),
            ),
          ),
        );
      },
      loading: () => Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: AppLoadingView(message: 'Carregando quadras…'),
      ),
      error: (e, _) => AppScaffold(
        title: 'Horários',
        body: AppErrorView(
          title: 'Erro ao carregar quadras',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () {
            showAppSnackBar(context, 'Tentando novamente…');
            ref.invalidate(courtsStreamProvider(arenaId));
          },
        ),
      ),
    );
  }

  Widget _buildMainScaffold(
    BuildContext context,
    ThemeData theme,
    List<ArenaCourt> courts,
    String courtId,
    SlotsQuery query,
    List<ArenaSlot> slots, {
    bool slotsLoading = false,
  }) {
    final arenaId = widget.arena.id;
    if (!slotsLoading) {
      _applyInitialSuggestedSlotIfNeeded(courtId, slots);
    }
    final nextIdx = slotsLoading ? null : _nextAvailableIndex(slots);
    if (!slotsLoading && _selStart == null && _selEnd == null) {
      _scheduleScrollToNextIfNeeded(courtId, slots, nextIdx);
    }
    final s = _selStart;
    final e = _selEnd;
    if (!slotsLoading &&
        s != null &&
        e != null &&
        !_rangeStillValid(slots, s, e)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _clearSelection());
      });
    }

    final court = courts.firstWhere(
      (c) => c.id == courtId,
      orElse: () => courts.first,
    );
    final slotDurationMinutes = ref.watch(
      courtSlotDurationMinutesProvider((arenaId: arenaId, courtId: courtId)),
    );
    final hourly = CourtPricing.resolveHourlyBase(
      court: court,
      arenaFallbackPerHourReais: widget.arena.pricePerHourReais,
    );
    final durationOptions = buildDurationOptions(
      hourlyPrice: hourly,
      slotDurationMinutes: slotDurationMinutes,
    );
    final periodCountsMap = periodCounts(slots, _selectedDay);
    final popularIdx = slotsLoading
        ? null
        : mostPopularSlotIndex(slots, _selectedDay);
    final lastIdx = slotsLoading
        ? null
        : lastAvailableSlotIndex(slots, _selectedDay);
    final barLabels = _bottomBarLabels(slots, slotDurationMinutes);
    final canContinue =
        !slotsLoading &&
        _selStart != null &&
        _selEnd != null &&
        _rangeStillValid(slots, _selStart!, _selEnd!);

    final stripStart = computeSlotsDayStripStart(
      today: DateTime.now(),
      selectedDay: _selectedDay,
      daysCount: _calendarDays,
    );
    final calParams = SlotsCalendarParams(
      arenaId: arenaId,
      courtId: courtId,
      startDay: stripStart,
      daysCount: _calendarDays,
      arenaFallbackPricePerHour: widget.arena.pricePerHourReais,
    );
    final calendarAsync = ref.watch(
      slotsCalendarAvailabilityProvider(calParams),
    );
    final summariesAsync = ref.watch(
      slotsCourtDaySummaryProvider((
        arenaId: arenaId,
        date: _selectedDay,
        arena: widget.arena,
      )),
    );

    final showFullyBookedBody =
        !slotsLoading && shouldShowSlotsFullyBookedBody(slots, _selectedDay);
    final freeCount = slotsLoading
        ? 0
        : countFreeSlotsForDay(slots, _selectedDay);
    final showPeriodEmptyOnly =
        !slotsLoading &&
        !showFullyBookedBody &&
        _periodFilter != SlotPeriodFilter.all &&
        freeCount > 0 &&
        filterSlotsByPeriod(slots, _periodFilter).where((s) {
          return s.isAvailable &&
              !isPastBookableSlot(
                selectedDay: _selectedDay,
                slot: s,
                now: DateTime.now(),
              );
        }).isEmpty;

    final suggestionsParams = SlotsSuggestionsParams(
      arena: widget.arena,
      courtId: courtId,
      courtName: court.name,
      selectedDay: _selectedDay,
      enabled: showFullyBookedBody,
    );
    final suggestionsAsync = ref.watch(
      slotsSmartSuggestionsProvider(suggestionsParams),
    );

    final bannerTitle = isDayWithoutSchedule(slots)
        ? 'Sem horários neste dia'
        : weekdayLotouLabel(_selectedDay);
    final bannerSubtitle = isDayWithoutSchedule(slots)
        ? noScheduleBannerSubtitle(court.name)
        : fullyBookedBannerSubtitle(
            courtName: court.name,
            alternativeCount: suggestionsAsync.valueOrNull?.length ?? 0,
          );
    final weekdayNotify = formatWeekdayShort(_selectedDay);

    void jumpListToTop() {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (_slotListScrollController.hasClients) {
          _slotListScrollController.jumpTo(0);
        }
      });
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth > 640
                ? 560.0
                : constraints.maxWidth;
            return Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxW),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SlotsPageHeader(
                      title:
                          '${widget.arena.name} · ${_courtName(courts, courtId)}',
                      onBack: _handleBack,
                    ),
                    SlotsDayStrip(
                      startDay: stripStart,
                      selectedDay: _selectedDay,
                      daysCount: _calendarDays,
                      calendarDays: calendarAsync.valueOrNull,
                      onSelect: (d) {
                        setState(() {
                          _selectedDay = d;
                          _clearSelection();
                        });
                        jumpListToTop();
                      },
                      sameDay: _sameDay,
                      dateOnly: _dateOnly,
                    ),
                    SizedBox(height: 8),
                    SlotsCourtCarousel(
                      arena: widget.arena,
                      summaries: summariesAsync.valueOrNull ?? const [],
                      selectedCourtId: courtId,
                      loading: summariesAsync.isLoading,
                      onSelected: (id) {
                        if (id == courtId) return;
                        setState(() {
                          _selectedCourtId = id;
                          _clearSelection();
                        });
                        jumpListToTop();
                      },
                    ),
                    // if (!showFullyBookedBody) ...[
                    //   SizedBox(height: 8),
                    //   SlotsPeriodChips(
                    //     selected: _periodFilter,
                    //     counts: periodCountsMap,
                    //     onSelected: (p) => setState(() => _periodFilter = p),
                    //   ),
                    //   SizedBox(height: 8),
                    // ],
                    SizedBox(height: 8),
                    Expanded(
                      child: showFullyBookedBody
                          ? SlotsFullyBookedBody(
                              bannerTitle: bannerTitle,
                              bannerSubtitle: bannerSubtitle,
                              suggestionsParams: suggestionsParams,
                              courtName: court.name,
                              weekdayLabel: weekdayNotify,
                              onSuggestionAction: _onSuggestionAction,
                              onSeeAllSuggestions: () {
                                final list =
                                    suggestionsAsync.valueOrNull ?? const [];
                                _openAllSuggestionsSheet(list);
                              },
                              onNotifyToggle: () => _toggleVacancyAlert(
                                courtId: courtId,
                                courtName: court.name,
                              ),
                              notifyLoading: _notifyLoading,
                            )
                          : SlotsListSection(
                              slots: slots,
                              periodFilter: _periodFilter,
                              selectedDay: _selectedDay,
                              scrollController: _slotListScrollController,
                              isIndexSelected: _isIndexSelected,
                              isSelectionAnchor: _isSelectionAnchorIndex,
                              onSlotTap: (i) => _onSlotTap(i, slots),
                              priceLabelFor: (slot) => slot.priceReais != null
                                  ? _priceFmt.format(slot.priceReais)
                                  : null,
                              mostPopularIndex: popularIdx,
                              lastAvailableIndex: lastIdx,
                              nextAvailableIndex: nextIdx,
                              nextSlotKey: _nextSlotKey,
                              selectedSlotKey: _selectedSlotKey,
                              slotsLoading: slotsLoading,
                              periodEmptyOnly: showPeriodEmptyOnly,
                            ),
                    ),
                    if (!showFullyBookedBody) ...[
                      // SlotsDurationPicker(
                      //   options: durationOptions,
                      //   selectedMinutes: _selectedDurationMinutes,
                      //   onSelected: (minutes) => _applyDurationMinutes(
                      //     minutes,
                      //     slots,
                      //     slotDurationMinutes,
                      //   ),
                      // ),
                      SlotsBottomBar(
                        enabled: canContinue,
                        metaLabel: slotsLoading ? null : barLabels.meta,
                        totalLabel: slotsLoading ? null : barLabels.total,
                        onPressed: () {
                          if (slotsLoading) return;
                          if (_selStart == null || _selEnd == null) return;
                          _goToConfirm(context, courts, courtId, slots);
                        },
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
