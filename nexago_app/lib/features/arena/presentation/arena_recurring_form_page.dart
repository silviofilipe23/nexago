import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/recurring_booking_service.dart';
import '../domain/arena_plan.dart';
import '../domain/arena_recurring_created_args.dart';
import '../domain/arena_recurring_form_args.dart';
import '../domain/arena_recurring_providers.dart';
import '../domain/arena_schedule_providers.dart';
import 'plan/widgets/arena_plan_gate.dart';
import 'widgets/arena_async_state.dart';

/// Criação de horário fixo (mensalista): série semanal na mesma quadra,
/// materializada no servidor via `createArenaRecurringBooking`.
class ArenaRecurringFormPage extends ConsumerStatefulWidget {
  const ArenaRecurringFormPage({super.key, this.args});

  final ArenaRecurringFormArgs? args;

  @override
  ConsumerState<ArenaRecurringFormPage> createState() =>
      _ArenaRecurringFormPageState();
}

class _ArenaRecurringFormPageState
    extends ConsumerState<ArenaRecurringFormPage> {
  static const List<String> _weekdayShort = [
    'SEG',
    'TER',
    'QUA',
    'QUI',
    'SEX',
    'SÁB',
    'DOM',
  ];
  static const List<int> _durationOptions = [60, 120, 180];

  String? _courtId;
  int _weekday = DateTime.now().weekday;
  TimeOfDay _startTime = const TimeOfDay(hour: 18, minute: 0);
  int _durationMinutes = 60;
  DateTime _startDate = DateTime.now();
  DateTime? _endDate;
  final _nameController = TextEditingController();
  final _amountController = TextEditingController();
  bool _amountEdited = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final args = widget.args;
    if (args != null) {
      _courtId = args.courtId;
      if (args.weekday != null && args.weekday! >= 1 && args.weekday! <= 7) {
        _weekday = args.weekday!;
      }
      final start = _parseTime(args.startTime);
      if (start != null) _startTime = start;
      final end = _parseTime(args.endTime);
      if (start != null && end != null) {
        final minutes = _toMinutes(end) - _toMinutes(start);
        if (_durationOptions.contains(minutes)) _durationMinutes = minutes;
      }
      if (args.priceReais != null && args.priceReais! > 0) {
        _amountController.text = args.priceReais!.toStringAsFixed(2);
        _amountEdited = true;
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final managed = ref.watch(managedArenaIdProvider);
    final arenaId = managed.valueOrNull;
    final courts = arenaId != null
        ? ref.watch(courtsStreamProvider(arenaId)).valueOrNull ??
            const <ArenaCourt>[]
        : const <ArenaCourt>[];
    final selectedCourt = courts.where((c) => c.id == _courtId).firstOrNull ??
        courts.firstOrNull;
    final eyebrow = selectedCourt != null
        ? '${selectedCourt.name.toUpperCase()} · SEMANAL'
        : 'AGENDA · HORÁRIO FIXO';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ArenaRecurringFormHeader(
              eyebrow: eyebrow,
              onBack: () => context.pop(),
            ),
            Expanded(
              child: managed.when(
                data: (arenaId) {
                  if (arenaId == null || arenaId.isEmpty) {
                    return const ArenaEmptyState(
                      title: 'Arena não encontrada',
                      message:
                          'Nenhuma arena vinculada ao seu usuário como gestor.',
                      icon: Icons.store_mall_directory_outlined,
                    );
                  }
                  return _buildForm(context, arenaId);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando arena...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context, String arenaId) {
    final theme = Theme.of(context);
    final courtsAsync = ref.watch(courtsStreamProvider(arenaId));
    final courts = courtsAsync.valueOrNull ?? const <ArenaCourt>[];
    final selectedCourt = courts.where((c) => c.id == _courtId).firstOrNull ??
        courts.firstOrNull;
    if (selectedCourt != null && _courtId == null) {
      _courtId = selectedCourt.id;
    }
    _syncSuggestedAmount(selectedCourt);

    final canAdd = ref.watch(managedArenaCanAddRecurringBookingProvider);
    final maxSeries = ref.watch(managedArenaMaxRecurringBookingsProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text(
          'Reserva semanal recorrente na mesma quadra. As próximas semanas '
          'ficam reservadas automaticamente até você encerrar.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            height: 1.4,
          ),
        ),
        if (!canAdd && maxSeries != null) ...[
          SizedBox(height: 16),
          ArenaPlanReadOnlyBanner(
            message: 'Limite de $maxSeries horários fixos do plano atual '
                'atingido. Assine o Pro para criar mais.',
          ),
        ],
        SizedBox(height: 24),
        _sectionLabel(context, 'QUADRA'),
        SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: selectedCourt?.id,
          items: [
            for (final c in courts)
              DropdownMenuItem(value: c.id, child: Text(c.name)),
          ],
          onChanged: (v) => setState(() => _courtId = v),
          decoration: _inputDecoration(context),
          dropdownColor: context.themeColors.surfaceSheet,
          style: TextStyle(color: context.themeColors.onSurface),
        ),
        SizedBox(height: 20),
        _sectionLabel(context, 'DIA DA SEMANA'),
        SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var d = 1; d <= 7; d++)
              _SelectChip(
                label: _weekdayShort[d - 1],
                selected: _weekday == d,
                onTap: () => setState(() => _weekday = d),
              ),
          ],
        ),
        SizedBox(height: 20),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'INÍCIO'),
                  SizedBox(height: 8),
                  _PickerField(
                    label: _formatTimeOfDay(_startTime),
                    icon: Icons.schedule_rounded,
                    onTap: _pickStartTime,
                  ),
                ],
              ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'DURAÇÃO'),
                  SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final m in _durationOptions)
                        _SelectChip(
                          label: _durationLabel(m),
                          selected: _durationMinutes == m,
                          onTap: () => setState(() => _durationMinutes = m),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        SizedBox(height: 6),
        Text(
          'Toda ${_weekdayFull(_weekday)}, '
          '${_formatTimeOfDay(_startTime)} – $_endTimeLabel',
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.brand,
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: 20),
        _sectionLabel(context, 'MENSALISTA'),
        SizedBox(height: 8),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          style: TextStyle(color: context.themeColors.onSurface),
          decoration: _inputDecoration(
            context,
            hint: 'Nome de quem fica com o horário',
          ),
        ),
        SizedBox(height: 20),
        _sectionLabel(context, 'VALOR POR SEMANA (R\$)'),
        SizedBox(height: 8),
        TextField(
          controller: _amountController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => _amountEdited = true,
          style: TextStyle(color: context.themeColors.onSurface),
          decoration: _inputDecoration(context, hint: 'Ex: 120.00'),
        ),
        SizedBox(height: 6),
        Text(
          'Acerto direto com a arena (pagamento no local).',
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'COMEÇA EM'),
                  SizedBox(height: 8),
                  _PickerField(
                    label: DateFormat('dd/MM/yyyy').format(_startDate),
                    icon: Icons.event_rounded,
                    onTap: _pickStartDate,
                  ),
                ],
              ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionLabel(context, 'TERMINA EM (OPCIONAL)'),
                  SizedBox(height: 8),
                  _PickerField(
                    label: _endDate != null
                        ? DateFormat('dd/MM/yyyy').format(_endDate!)
                        : 'Sem data fim',
                    icon: _endDate != null
                        ? Icons.close_rounded
                        : Icons.event_repeat_rounded,
                    onTap: _pickEndDate,
                    onIconTap: _endDate != null
                        ? () => setState(() => _endDate = null)
                        : null,
                  ),
                ],
              ),
            ),
          ],
        ),
        SizedBox(height: 32),
        FilledButton(
          onPressed: _busy ? null : () => _submit(arenaId, selectedCourt),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: _busy
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(
                  'Criar horário fixo',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
        ),
      ],
    );
  }

  // --- Submissão -----------------------------------------------------------

  Future<void> _submit(String arenaId, ArenaCourt? court) async {
    final canAdd = ref.read(managedArenaCanAddRecurringBookingProvider);
    if (!canAdd) {
      final max = ref.read(managedArenaMaxRecurringBookingsProvider);
      await showArenaPlanUpsellSheet(
        context,
        capability: ArenaCapability.promocoes,
        icon: Icons.event_repeat_rounded,
        title: 'Limite de horários fixos atingido',
        description: 'O plano atual permite até $max horários fixos ativos. '
            'Assine o Pro para criar quantos precisar.',
      );
      return;
    }
    if (court == null) {
      showAppSnackBar(context, 'Cadastre uma quadra antes.', isError: true);
      return;
    }
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showAppSnackBar(context, 'Informe o nome do mensalista.', isError: true);
      return;
    }
    final amount = double.tryParse(_amountController.text.replaceAll(',', '.'));
    if (amount == null || amount <= 0) {
      showAppSnackBar(context, 'Informe um valor válido.', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      final result =
          await ref.read(recurringBookingServiceProvider).createSeries(
                arenaId: arenaId,
                courtId: court.id,
                weekday: _weekday,
                startTime: _formatTimeOfDay(_startTime),
                endTime: _endTimeLabel,
                amountReais: amount,
                customerName: name,
                startDate: _dateKey(_startDate),
                endDate: _endDate != null ? _dateKey(_endDate!) : null,
              );
      if (!mounted) return;
      if (result.skippedDates.isNotEmpty) {
        await _showSkippedDatesDialog(result.skippedDates);
      }
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.arenaRecurringCreated,
        extra: ArenaRecurringCreatedArgs(
          seriesId: result.seriesId,
          createdCount: result.createdDates.length,
          skippedCount: result.skippedDates.length,
          customerName: name,
          courtName: court.name,
          weekday: _weekday,
          startTime: _formatTimeOfDay(_startTime),
          endTime: _endTimeLabel,
        ),
      );
    } on RecurringBookingException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível criar o horário fixo: $e',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showSkippedDatesDialog(List<String> dates) {
    final labels = dates.map(_formatDateKey).join(', ');
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text('${dates.length} data(s) com conflito'),
        content: Text(
          'Estas datas já tinham reserva ou bloqueio e ficaram de fora do '
          'horário fixo: $labels.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Entendi'),
          ),
        ],
      ),
    );
  }

  // --- Pickers -------------------------------------------------------------

  Future<void> _pickStartTime() async {
    final picked =
        await showTimePicker(context: context, initialTime: _startTime);
    if (picked != null) setState(() => _startTime = picked);
  }

  Future<void> _pickStartDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate.isBefore(now) ? now : _startDate,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _startDate = picked);
  }

  Future<void> _pickEndDate() async {
    final base = _startDate.add(const Duration(days: 28));
    final picked = await showDatePicker(
      context: context,
      initialDate: _endDate ?? base,
      firstDate: _startDate,
      lastDate: _startDate.add(const Duration(days: 730)),
    );
    if (picked != null) setState(() => _endDate = picked);
  }

  // --- Helpers -------------------------------------------------------------

  void _syncSuggestedAmount(ArenaCourt? court) {
    if (_amountEdited || court == null) return;
    final hourly = court.basePricePerHourReais;
    if (hourly == null || hourly <= 0) return;
    final suggested = hourly * _durationMinutes / 60;
    final text = suggested.toStringAsFixed(2);
    if (_amountController.text != text) {
      _amountController.text = text;
    }
  }

  String get _endTimeLabel {
    final total = _toMinutes(_startTime) + _durationMinutes;
    final capped = total >= 24 * 60 ? 24 * 60 : total;
    if (capped == 24 * 60) return '00:00';
    final h = (capped ~/ 60).toString().padLeft(2, '0');
    final m = (capped % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  static int _toMinutes(TimeOfDay t) => t.hour * 60 + t.minute;

  static TimeOfDay? _parseTime(String? hhmm) {
    if (hhmm == null || !RegExp(r'^\d{2}:\d{2}').hasMatch(hhmm.trim())) {
      return null;
    }
    final parts = hhmm.trim().split(':');
    return TimeOfDay(
      hour: int.parse(parts[0]),
      minute: int.parse(parts[1].substring(0, 2)),
    );
  }

  static String _formatTimeOfDay(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:'
      '${t.minute.toString().padLeft(2, '0')}';

  static String _durationLabel(int minutes) => '${minutes ~/ 60}h';

  static String _weekdayFull(int weekday) {
    const labels = [
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
      'domingo',
    ];
    return (weekday >= 1 && weekday <= 7) ? labels[weekday - 1] : '';
  }

  static String _dateKey(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  static String _formatDateKey(String key) {
    final parts = key.split('-');
    if (parts.length != 3) return key;
    return '${parts[2]}/${parts[1]}';
  }

  Widget _sectionLabel(BuildContext context, String label) {
    return Text(
      label,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
    );
  }

  InputDecoration _inputDecoration(BuildContext context, {String? hint}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
      ),
      filled: true,
      fillColor: context.themeColors.surfaceRaised,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
    );
  }
}

class _SelectChip extends StatelessWidget {
  const _SelectChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: selected ? AppColors.black : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({
    required this.label,
    required this.icon,
    required this.onTap,
    this.onIconTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final VoidCallback? onIconTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: context.themeColors.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              GestureDetector(
                onTap: onIconTap,
                child: Icon(
                  icon,
                  size: 18,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ArenaRecurringFormHeader extends StatelessWidget {
  const _ArenaRecurringFormHeader({
    required this.eyebrow,
    required this.onBack,
  });

  final String eyebrow;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          _HeaderIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: onBack,
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  eyebrow,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Novo horário fixo',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

// Evita dependência de collection package.
extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
