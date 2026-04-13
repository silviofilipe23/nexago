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

/// Seleção de horários: quadras (`arenas/.../courts`) + `arenaSlots` por dia (YYYY-MM-DD).
class SlotsPage extends ConsumerWidget {
  const SlotsPage({
    super.key,
    required this.arenaId,
    this.initialArena,
  });

  final String arenaId;
  final ArenaListItem? initialArena;

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
        return FadeSlideIn(child: _SlotsScheduleView(arena: arena));
      },
      loading: () {
        if (initialArena != null) {
          return FadeSlideIn(child: _SlotsScheduleView(arena: initialArena!));
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
  const _SlotsScheduleView({required this.arena});

  final ArenaListItem arena;

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
    _selectedDay = _dateOnly(DateTime.now());
  }

  DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

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
      if (!slots[i].isSelectable) return false;
    }
    return true;
  }

  void _onSlotTap(int index, List<ArenaSlot> slots) {
    final slot = slots[index];
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

        final courtId = _selectedCourtId ?? courts.first.id;
        final query = SlotsQuery(
          arenaId: arenaId,
          courtId: courtId,
          date: _selectedDay,
          fallbackPriceReais: widget.arena.pricePerHourReais,
        );
        final slotsAsync = ref.watch(slotsStreamProvider(query));

        return slotsAsync.when(
          data: (slots) => FadeSlideIn(
            child: _buildMainScaffold(
              context,
              theme,
              courts,
              courtId,
              query,
              slots,
            ),
          ),
          loading: () => const Scaffold(
            backgroundColor: AppColors.white,
            body: AppLoadingView(message: 'Carregando horários…'),
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
    List<ArenaSlot> slots,
  ) {
    final s = _selStart;
    final e = _selEnd;
    if (s != null && e != null && !_rangeStillValid(slots, s, e)) {
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
                      selectedDayHasSlots: slots.isNotEmpty,
                      daysCount: _calendarDays,
                      onSelect: (d) {
                        setState(() {
                          _selectedDay = d;
                          _selStart = null;
                          _selEnd = null;
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
                      child: _buildSlotList(context, theme, slots),
                    ),
                    _ReserveBar(
                      enabled: _selStart != null &&
                          _selEnd != null &&
                          _rangeStillValid(slots, _selStart!, _selEnd!),
                      summaryLabel: _selectionSummary(slots),
                      actionLabel: 'Continuar',
                      onPressed: () {
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
  ) {
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
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      itemCount: slots.length,
      separatorBuilder: (context, index) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final slot = slots[index];
        final selected = _isIndexSelected(index);
        return staggeredFadeSlide(
          index: index,
          child: _SlotTile(
            slot: slot,
            selected: selected,
            priceLabel: slot.priceReais != null ? _priceFmt.format(slot.priceReais) : null,
            onTap: () => _onSlotTap(index, slots),
          ),
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
    this.priceLabel,
  });

  final ArenaSlot slot;
  final bool selected;
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
    final greyed = unavailable;

    late Color bg;
    late Color fg;
    late Color border;
    var borderWidth = 1.0;

    if (selected && slot.isSelectable) {
      bg = _orangeBg;
      fg = _orangeFg;
      border = _orangeBorder;
      borderWidth = 2;
    } else if (greyed) {
      bg = _greyBg;
      fg = _greyFg;
      border = theme.colorScheme.outline.withValues(alpha: 0.15);
    } else {
      bg = _greenBg;
      fg = _greenFg;
      border = const Color(0xFFC8E6C9);
    }

    return Material(
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
          ),
          child: Row(
            children: [
              Icon(
                slot.isBooked
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
              if (selected && slot.isSelectable)
                Icon(Icons.check_circle_rounded, color: _orangeFg, size: 26),
            ],
          ),
        ),
      ),
    );
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
