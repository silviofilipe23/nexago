import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_court.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_slot.dart';
import '../domain/arenas_providers.dart';
import '../domain/slots_providers.dart';
import '../domain/slots_query.dart';

/// Combina [date] (apenas ano/mês/dia) com [time] no formato `HH:mm`.
DateTime _combineDateAndTime(DateTime date, String time) {
  final t = time.trim();
  if (t.length < 4) {
    return DateTime(date.year, date.month, date.day);
  }
  final parts = t.split(':');
  final h = int.tryParse(parts[0]) ?? 0;
  final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
  return DateTime(date.year, date.month, date.day, h, m);
}

/// Instantâneo de término do slot no horário local.
///
/// Se `endTime` no mesmo dia não for depois de `startTime` (ex.: 23:00–00:00), o fim
/// assume o dia seguinte — evita tratar `00:00` como início do dia e marcar como
/// [Encerrado] à tarde.
DateTime _slotStartDateTime(ArenaSlot slot) {
  final d = DateTime(slot.date.year, slot.date.month, slot.date.day);
  return _combineDateAndTime(d, slot.startTime);
}

DateTime _slotEndDateTime(ArenaSlot slot) {
  final d = DateTime(slot.date.year, slot.date.month, slot.date.day);
  final start = _combineDateAndTime(d, slot.startTime);
  var end = _combineDateAndTime(d, slot.endTime);
  if (!end.isAfter(start)) {
    end = end.add(const Duration(days: 1));
  }
  return end;
}

/// Após [start] + esta duração, o slot deixa de poder ser alugado (ex.: 20:00 até 20:05).
const Duration _slotBookingCutoffAfterStart = Duration(minutes: 5);

DateTime _slotBookingCutoff(ArenaSlot slot) =>
    _slotStartDateTime(slot).add(_slotBookingCutoffAfterStart);

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
              onAction: () => context.pop(),
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
  static const _calendarDays = 21;

  late DateTime _selectedDay;
  /// Intervalo inclusivo na lista ordenada de slots (sempre índices consecutivos).
  int? _selStart;
  int? _selEnd;
  String? _selectedCourtId;
  bool _didApplyInitialSuggestedSlot = false;

  final GlobalKey _nextSlotKey = GlobalKey();
  final GlobalKey _selectedSlotKey = GlobalKey();
  Object? _lastAutoScrollToken;

  /// Lista vertical de slots: precisa de controller para aproximar scroll antes do
  /// item existir na árvore (ListView lazy não monta filhos fora da viewport).
  final ScrollController _slotListScrollController = ScrollController();

  static final _weekdayFmt = DateFormat('EEE', 'pt_BR');
  static final _monthDayFmt = DateFormat('d MMM', 'pt_BR');
  static final _priceFmt = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
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

  double _totalReaisForRange(List<ArenaSlot> slots, int s, int e) {
    double sum = 0;
    var missing = false;
    for (var i = s; i <= e; i++) {
      final p = slots[i].priceReais;
      if (p == null) {
        missing = true;
      } else {
        sum += p;
      }
    }
    if (missing) {
      return widget.arena.pricePerHourReais * (e - s + 1);
    }
    return sum;
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
    for (final c in courts) {
      if (c.id == courtId) {
        courtName = c.name;
        break;
      }
    }
    final total = _totalReaisForRange(slots, s, e);

    context.pushNamed(
      AppRouteNames.arenaBookingConfirm,
      pathParameters: {'arenaId': widget.arena.id},
      extra: ArenaBookingConfirmArgs(
        arenaId: widget.arena.id,
        arenaName: widget.arena.name,
        courtId: courtId,
        courtName: courtName,
        date: DateTime(first.date.year, first.date.month, first.date.day),
        startTime: first.startTime,
        endTime: last.endTime,
        amountReais: total,
      ),
    );
  }

  bool _isIndexSelected(int index) {
    final a = _selStart;
    final b = _selEnd;
    if (a == null || b == null) return false;
    return index >= a && index <= b;
  }

  bool _rangeStillValid(List<ArenaSlot> slots, int s, int e) {
    if (s < 0 || e >= slots.length || s > e) return false;
    for (var i = s; i <= e; i++) {
      if (_isPastSlot(slots[i])) return false;
      if (!slots[i].isSelectable) return false;
    }
    return true;
  }

  /// Hoje: fora da janela de aluguel (após início + 5 min) ou slot já terminou.
  bool _isPastSlot(ArenaSlot slot) {
    if (!_sameDay(_selectedDay, _dateOnly(DateTime.now()))) return false;
    final now = DateTime.now();
    if (!_slotBookingCutoff(slot).isAfter(now)) return true;
    return _slotEndDateTime(slot).isBefore(now);
  }

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

  void _applyInitialSuggestedSlotIfNeeded(String courtId, List<ArenaSlot> slots) {
    if (_didApplyInitialSuggestedSlot) return;
    final suggestedStart = widget.initialStartTime?.trim();
    if (suggestedStart == null || suggestedStart.isEmpty) {
      _didApplyInitialSuggestedSlot = true;
      return;
    }
    final suggestedCourt = widget.initialCourtId?.trim();
    if (suggestedCourt != null && suggestedCourt.isNotEmpty && suggestedCourt != courtId) {
      return;
    }

    final idx = slots.indexWhere((slot) => slot.startTime.trim() == suggestedStart);
    _didApplyInitialSuggestedSlot = true;
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

  String? _selectionSummary(List<ArenaSlot> slots) {
    final s = _selStart;
    final e = _selEnd;
    if (s == null || e == null || s > e || s < 0 || e >= slots.length) return null;
    if (!_rangeStillValid(slots, s, e)) return null;
    final first = slots[s];
    final last = slots[e];
    final n = e - s + 1;
    double? total;
    var hasNull = false;
    for (var i = s; i <= e; i++) {
      final p = slots[i].priceReais;
      if (p == null) {
        hasNull = true;
      } else {
        total = (total ?? 0) + p;
      }
    }
    final price = total != null ? '${hasNull ? '≥ ' : ''}${_priceFmt.format(total)}' : null;
    final range = '${first.startTime}–${last.endTime}';
    if (n == 1) {
      return price != null ? '$range · $price' : range;
    }
    return '$range · $n horários${price != null ? ' · $price' : ''}';
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
          fallbackPriceReais: widget.arena.pricePerHourReais,
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
      loading: () => const Scaffold(
        backgroundColor: AppColors.white,
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
        setState(() {
          _selStart = null;
          _selEnd = null;
        });
      });
    }

    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth > 640 ? 560.0 : constraints.maxWidth;
            return Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxW),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                      child: Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.arrow_back_rounded),
                            onPressed: () => context.pop(),
                          ),
                          Expanded(
                            child: Text(
                              'Escolha o horário',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.3,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          const SizedBox(width: 48),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.arena.name,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.arena.locationLabel,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Quadra',
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                              color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                            ),
                          ),
                          const SizedBox(height: 8),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: theme.colorScheme.outline.withValues(alpha: 0.25),
                              ),
                              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                isExpanded: true,
                                borderRadius: BorderRadius.circular(14),
                                padding: const EdgeInsets.symmetric(horizontal: 16),
                                value: courtId,
                                items: courts
                                    .map(
                                      (c) => DropdownMenuItem(
                                        value: c.id,
                                        child: Text(c.name),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (id) {
                                  if (id == null) return;
                                  setState(() {
                                    _selectedCourtId = id;
                                    _selStart = null;
                                    _selEnd = null;
                                    _lastAutoScrollToken = null;
                                  });
                                  WidgetsBinding.instance.addPostFrameCallback((_) {
                                    if (!mounted) return;
                                    if (_slotListScrollController.hasClients) {
                                      _slotListScrollController.jumpTo(0);
                                    }
                                  });
                                },
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        'DATA',
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _HorizontalDayStrip(
                      selectedDay: _selectedDay,
                      selectedDayHasSlots: !slotsLoading && slots.isNotEmpty,
                      daysCount: _calendarDays,
                      onSelect: (d) {
                        setState(() {
                          _selectedDay = d;
                          _selStart = null;
                          _selEnd = null;
                          _lastAutoScrollToken = null;
                        });
                        WidgetsBinding.instance.addPostFrameCallback((_) {
                          if (!mounted) return;
                          if (_slotListScrollController.hasClients) {
                            _slotListScrollController.jumpTo(0);
                          }
                        });
                      },
                      sameDay: _sameDay,
                      dateOnly: _dateOnly,
                      weekdayFmt: _weekdayFmt,
                    ),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Horários',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Toque em horários seguidos (um bloco contínuo).',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                                    height: 1.25,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            _monthDayFmt.format(_selectedDay),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: _buildSlotList(
                        context,
                        theme,
                        slots,
                        nextIdx,
                        slotsLoading: slotsLoading,
                      ),
                    ),
                    _ReserveBar(
                      enabled: !slotsLoading &&
                          _selStart != null &&
                          _selEnd != null &&
                          _rangeStillValid(slots, _selStart!, _selEnd!),
                      summaryLabel:
                          slotsLoading ? null : _selectionSummary(slots),
                      actionLabel: 'Continuar',
                      onPressed: () {
                        if (slotsLoading) return;
                        if (_selStart == null || _selEnd == null) return;
                        _goToConfirm(context, courts, courtId, slots);
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildSlotList(
    BuildContext context,
    ThemeData theme,
    List<ArenaSlot> slots,
    int? nextAvailableIndex, {
    bool slotsLoading = false,
  }) {
    if (slotsLoading) {
      return Center(
        child: SizedBox(
          width: 30,
          height: 30,
          child: CircularProgressIndicator(
            strokeWidth: 2.6,
            color: AppColors.brand.withValues(alpha: 0.85),
          ),
        ),
      );
    }

    if (slots.isEmpty) {
      return CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: AppEmptyView(
                icon: Icons.event_note_rounded,
                title: 'Nenhum horário neste dia',
                subtitle:
                    'Ajuste a grade da quadra no Firestore ou escolha outra data no calendário acima.',
              ),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      controller: _slotListScrollController,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      cacheExtent: 2200,
      itemCount: slots.length,
      separatorBuilder: (context, index) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final slot = slots[index];
        final isPast = _isPastSlot(slot);
        final selected = _isIndexSelected(index) && !isPast;
        final isNext = nextAvailableIndex == index;
        Widget tile = _SlotTile(
          slot: slot,
          selected: selected,
          isPast: isPast,
          isNext: isNext,
          priceLabel: slot.priceReais != null ? _priceFmt.format(slot.priceReais) : null,
          onTap: () => _onSlotTap(index, slots),
        );
        if (isNext) {
          tile = KeyedSubtree(key: _nextSlotKey, child: tile);
        }
        if (selected) {
          tile = KeyedSubtree(key: _selectedSlotKey, child: tile);
        }
        return staggeredFadeSlide(
          index: index,
          child: tile,
        );
      },
    );
  }
}

class _HorizontalDayStrip extends StatelessWidget {
  const _HorizontalDayStrip({
    required this.selectedDay,
    required this.selectedDayHasSlots,
    required this.daysCount,
    required this.onSelect,
    required this.sameDay,
    required this.dateOnly,
    required this.weekdayFmt,
  });

  final DateTime selectedDay;
  final bool selectedDayHasSlots;
  final int daysCount;
  final ValueChanged<DateTime> onSelect;
  final bool Function(DateTime a, DateTime b) sameDay;
  final DateTime Function(DateTime d) dateOnly;
  final DateFormat weekdayFmt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final today = dateOnly(DateTime.now());

    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: daysCount,
        separatorBuilder: (context, index) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final day = today.add(Duration(days: index));
          final d = dateOnly(day);
          final isSelected = sameDay(d, selectedDay);
          final hasSlots = isSelected && selectedDayHasSlots;
          final weekLabel = weekdayFmt.format(d).replaceAll('.', '');
          final dayNum = d.day.toString();

          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => onSelect(d),
              borderRadius: BorderRadius.circular(18),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                width: 72,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.brand
                        : theme.colorScheme.outline.withValues(alpha: 0.2),
                    width: isSelected ? 2 : 1,
                  ),
                  color: isSelected
                      ? AppColors.brand.withValues(alpha: 0.1)
                      : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: AppColors.brand.withValues(alpha: 0.18),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : null,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dayNum,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: hasSlots
                            ? const Color(0xFF43A047).withValues(alpha: 0.85)
                            : theme.colorScheme.outline.withValues(alpha: 0.25),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SlotTile extends StatelessWidget {
  const _SlotTile({
    required this.slot,
    required this.selected,
    required this.onTap,
    this.isPast = false,
    this.isNext = false,
    this.priceLabel,
  });

  final ArenaSlot slot;
  final bool selected;
  final bool isPast;
  final bool isNext;
  final VoidCallback onTap;
  final String? priceLabel;

  static const _greenBg = Color(0xFFE8F5E9);
  static const _greenFg = Color(0xFF1B5E20);
  static const _greyBg = Color(0xFFF1F1F1);
  static const _greyFg = Color(0xFF757575);
  static const _orangeBg = Color(0xFFFFF3E0);
  static const _orangeFg = Color(0xFFE65100);
  static const _orangeBorder = Color(0xFFFF9800);

  String _statusLabel() {
    if (isPast) return 'Encerrado';
    if (slot.isBooked) return 'Ocupado';
    if (slot.isBlocked) return 'Bloqueado';
    if (slot.isAvailable) return 'Disponível';
    return 'Indisponível';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unavailable = !slot.isAvailable;
    final blocked = slot.isBlocked;
    final greyed = unavailable || isPast;

    late Color bg;
    late Color fg;
    late Color border;
    var borderWidth = 1.0;

    if (selected && slot.isSelectable && !isPast) {
      bg = _orangeBg;
      fg = _orangeFg;
      border = _orangeBorder;
      borderWidth = isNext ? 2.8 : 2;
    } else if (greyed) {
      bg = _greyBg;
      fg = _greyFg;
      border = theme.colorScheme.outline.withValues(alpha: 0.15);
    } else {
      bg = _greenBg;
      fg = _greenFg;
      border = const Color(0xFFC8E6C9);
      if (isNext && !isPast) {
        border = AppColors.brand;
        borderWidth = 2.6;
      }
    }

    final card = Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: greyed ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: border, width: borderWidth),
            boxShadow: isNext && !isPast
                ? [
                    BoxShadow(
                      color: AppColors.brand.withValues(alpha: 0.22),
                      blurRadius: 14,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              Icon(
                isPast
                    ? Icons.history_rounded
                    : slot.isBooked
                        ? Icons.lock_outline_rounded
                        : blocked
                            ? Icons.block_rounded
                            : unavailable
                                ? Icons.block_rounded
                                : Icons.schedule_rounded,
                color: fg.withValues(alpha: 0.85),
                size: 26,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isNext && !isPast) ...[
                      Text(
                        '🔥 Próximo horário',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                    ],
                    Text(
                      '${slot.startTime} – ${slot.endTime}',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: fg,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_statusLabel()}${slot.isVirtual ? ' · grade' : ''}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: fg.withValues(alpha: 0.85),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (priceLabel != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        priceLabel!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: fg.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (selected && slot.isSelectable && !isPast)
                Icon(Icons.check_circle_rounded, color: _orangeFg, size: 26),
            ],
          ),
        ),
      ),
    );

    if (isPast) {
      return Opacity(
        opacity: 0.58,
        child: card,
      );
    }
    return card;
  }
}

class _ReserveBar extends StatelessWidget {
  const _ReserveBar({
    required this.enabled,
    required this.onPressed,
    this.summaryLabel,
    this.actionLabel = 'Continuar',
  });

  final bool enabled;
  final VoidCallback onPressed;
  final String? summaryLabel;
  final String actionLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      elevation: 16,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      color: AppColors.white,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (summaryLabel != null && summaryLabel!.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    summaryLabel!,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                      fontWeight: FontWeight.w600,
                      height: 1.25,
                    ),
                  ),
                ),
              ],
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: enabled ? onPressed : null,
                  style: FilledButton.styleFrom(
                    elevation: 0,
                    disabledBackgroundColor: theme.colorScheme.surfaceContainerHighest,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: Text(
                    actionLabel,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
