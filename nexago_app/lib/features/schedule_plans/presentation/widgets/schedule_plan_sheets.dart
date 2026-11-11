import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/formatting/app_date_format.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_skeleton.dart';
import '../../application/schedule_plans_providers.dart';
import '../../domain/schedule_plan_logic.dart';
import '../../domain/schedule_plan_models.dart';
import 'schedule_plan_ui.dart';

/// "Ter, 05/11 · 19:00 – 20:00".
String scheduleOccurrenceLabel(ScheduleOccurrence o) =>
    '${scheduleWeekdayShort(o.date.weekday)}, ${scheduleDayMonth(o.date)} · '
    '${o.startTime} – ${o.endTime}';

/// Qual data o atleta não vai (quando há mais de uma pela frente).
Future<ScheduleOccurrence?> pickScheduleOccurrence(
  BuildContext context,
  List<ScheduleOccurrence> options, {
  bool showCourt = true,
}) {
  return showScheduleSheet<ScheduleOccurrence>(
    context,
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      return SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              const ScheduleSheetHeader(
                title: 'Qual dia você não vai?',
                subtitle: 'O horário fica livre para a arena.',
              ),
              const SizedBox(height: 14),
              for (final o in options) ...[
                ScheduleCard(
                  key: ValueKey('schedule-skip-pick-${o.bookingId}'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  onTap: () => Navigator.of(sheetContext).pop(o),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          scheduleOccurrenceLabel(o),
                          style: AppTypography.mono(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      if (showCourt && o.courtName.isNotEmpty)
                        Text(
                          o.courtName,
                          style: TextStyle(
                            fontSize: 12,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ],
          ),
        ),
      );
    },
  );
}

/// Confirmação genérica em folha (o app não usa diálogo nativo).
Future<bool?> confirmScheduleAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  Widget? warning,
}) {
  return showScheduleSheet<bool>(
    context,
    builder: (sheetContext) => SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            ScheduleSheetHeader(title: title, subtitle: message),
            if (warning != null) ...[const SizedBox(height: 14), warning],
            const SizedBox(height: 18),
            SchedulePrimaryButton(
              key: const Key('schedule-confirm'),
              label: confirmLabel,
              icon: null,
              onPressed: () => Navigator.of(sheetContext).pop(true),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.of(sheetContext).pop(false),
              child: const Text('Voltar'),
            ),
          ],
        ),
      ),
    ),
  );
}

/// "Não vou nesta semana": avisa ANTES quando o aviso vem em cima da hora
/// (sem reposição) ou o plano não tem reposição.
Future<bool?> confirmScheduleSkip(
  BuildContext context, {
  required ScheduleOccurrence occurrence,
  required bool makeupEnabled,
  required bool lateNotice,
  required int noticeHours,
  required int validityDays,
}) {
  final when = scheduleOccurrenceLabel(occurrence);
  final Widget? warning;
  final String message;
  if (!makeupEnabled) {
    message = 'O horário de $when fica livre para a arena.';
    warning = const ScheduleBanner(
      icon: Icons.info_outline_rounded,
      title: 'Este plano não tem reposição',
      message: 'A data só é liberada, sem crédito para outro dia.',
      tone: AppColors.pending,
    );
  } else if (lateNotice) {
    message = 'O horário de $when fica livre para a arena.';
    warning = ScheduleBanner(
      key: const Key('schedule-skip-late-warning'),
      icon: Icons.warning_amber_rounded,
      title: 'Aviso em cima da hora',
      message: 'Faltam menos de ${noticeHours}h para o jogo: o horário é '
          'liberado sem reposição.',
      tone: AppColors.pending,
    );
  } else {
    message = 'O horário de $when fica livre e você ganha 1 reposição para '
        'usar em até $validityDays dias.';
    warning = null;
  }
  return confirmScheduleAction(
    context,
    title: 'Não vai nesta data?',
    message: message,
    confirmLabel: 'Não vou',
    warning: warning,
  );
}

/// "Usar reposição": crédito → data → horário livre numa quadra do plano.
/// Fecha com a mensagem de sucesso.
class ScheduleMakeupSheet extends ConsumerStatefulWidget {
  const ScheduleMakeupSheet({
    super.key,
    required this.credits,
    required this.validityDays,
    required this.now,
    this.arenaDefinesCourt = false,
  });

  /// Créditos usáveis, o que vence primeiro na frente.
  final List<ScheduleCredit> credits;
  final int validityDays;
  final DateTime now;

  /// A arena define a quadra: o atleta escolhe só o horário (o servidor manda
  /// uma opção por horário) e não vê quadra.
  final bool arenaDefinesCourt;

  @override
  ConsumerState<ScheduleMakeupSheet> createState() =>
      _ScheduleMakeupSheetState();
}

class _ScheduleMakeupSheetState extends ConsumerState<ScheduleMakeupSheet> {
  late ScheduleCredit _credit = widget.credits.first;
  DateTime? _date;
  List<ScheduleMakeupOption>? _options;
  ScheduleMakeupOption? _picked;
  bool _loading = false;
  bool _saving = false;
  String? _error;

  DateTime get _today =>
      DateTime(widget.now.year, widget.now.month, widget.now.day);

  DateTime get _lastDate {
    final expires = _credit.expiresOn;
    final fallback = _today.add(Duration(days: widget.validityDays));
    if (expires == null || expires.isBefore(_today)) return fallback;
    return expires;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? _today,
      firstDate: _today,
      lastDate: _lastDate,
      helpText: 'Dia da reposição',
      cancelText: 'Cancelar',
      confirmText: 'Ver horários',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date = picked;
      _options = null;
      _picked = null;
      _error = null;
      _loading = true;
    });
    try {
      final options = await ref
          .read(schedulePlansRepositoryProvider)
          .makeupOptions(creditId: _credit.id, date: calendarDateKey(picked));
      if (!mounted || _date != picked) return;
      setState(() {
        _options = options;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(
          e,
          action: 'Não foi possível buscar os horários',
          logReason: 'schedule_plan_makeup_options',
        );
      });
    }
  }

  Future<void> _confirm() async {
    final date = _date;
    final option = _picked;
    if (date == null || option == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(schedulePlansRepositoryProvider).useMakeup(
            creditId: _credit.id,
            date: calendarDateKey(date),
            courtId: option.courtId,
            startTime: option.startTime,
          );
      if (!mounted) return;
      Navigator.of(context).pop(
        'Reposição marcada: ${scheduleWeekdayShort(date.weekday)}, '
        '${scheduleDayMonth(date)} às ${option.startTime}'
        '${widget.arenaDefinesCourt ? '. A arena define a quadra.' : ' · ${option.courtName}.'}',
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = friendlyErrorMessage(
          e,
          action: 'Não foi possível marcar a reposição',
          logReason: 'schedule_plan_use_makeup',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final date = _date;
    final options = _options;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const ScheduleSheetHeader(
              title: 'Usar reposição',
              subtitle: 'Escolha um dia e um horário livre numa quadra do '
                  'plano.',
            ),
            if (widget.credits.length > 1) ...[
              const SizedBox(height: 14),
              const ScheduleKicker('Crédito'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final c in widget.credits)
                    ChoiceChip(
                      selected: c.id == _credit.id,
                      showCheckmark: false,
                      selectedColor: AppColors.brand,
                      label: Text(
                        c.expiresOn == null
                            ? 'Sem validade'
                            : 'Vence ${scheduleDayMonth(c.expiresOn!)}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: c.id == _credit.id
                              ? AppColors.black
                              : colors.onSurface,
                        ),
                      ),
                      onSelected: (_) => setState(() {
                        _credit = c;
                        _date = null;
                        _options = null;
                        _picked = null;
                      }),
                    ),
                ],
              ),
            ] else if (_credit.expiresOn != null) ...[
              const SizedBox(height: 8),
              Text(
                'Vale até ${scheduleDayMonth(_credit.expiresOn!)}.',
                style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
              ),
            ],
            const SizedBox(height: 14),
            const ScheduleKicker('Dia'),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('schedule-makeup-date'),
              onPressed: _saving ? null : _pickDate,
              icon: const Icon(Icons.calendar_today_rounded, size: 18),
              label: Text(
                date == null
                    ? 'Escolher dia'
                    : '${scheduleWeekdayLong(date.weekday)}, '
                        '${scheduleDayMonth(date)}',
              ),
            ),
            if (_loading) ...[
              const SizedBox(height: 14),
              for (var i = 0; i < 3; i++) ...[
                const NexaSkeleton(height: 46),
                const SizedBox(height: 6),
              ],
            ] else if (options != null) ...[
              const SizedBox(height: 14),
              const ScheduleKicker('Horário'),
              const SizedBox(height: 8),
              if (options.isEmpty)
                Text(
                  'Nenhum horário livre nesse dia. Tente outra data.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: colors.onSurfaceMuted,
                  ),
                )
              else
                for (final o in options) ...[
                  ScheduleCard(
                    selected: identical(o, _picked),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    onTap: () => setState(() => _picked = o),
                    child: Row(
                      children: [
                        Text(
                          '${o.startTime} – ${o.endTime}',
                          style: AppTypography.mono(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            widget.arenaDefinesCourt ? 'livre' : o.courtName,
                            textAlign: TextAlign.right,
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: colors.live,
                ),
              ),
            ],
            const SizedBox(height: 16),
            SchedulePrimaryButton(
              key: const Key('schedule-makeup-confirm'),
              label: 'Marcar reposição',
              icon: null,
              loading: _saving,
              onPressed: _picked == null ? null : _confirm,
            ),
          ],
        ),
      ),
    );
  }
}
