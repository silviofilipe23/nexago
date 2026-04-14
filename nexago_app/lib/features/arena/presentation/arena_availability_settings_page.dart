import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_providers.dart';
import 'widgets/arena_async_state.dart';

/// Configuração de horários da agenda (disponibilidade padrão, dias, slots).
class ArenaAvailabilitySettingsPage extends ConsumerWidget {
  const ArenaAvailabilitySettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final managed = ref.watch(managedArenaIdProvider);
    final template = ref.watch(arenaSettingsTemplateProvider);

    return AppScaffold(
      title: 'Disponibilidade',
      centerTitle: false,
      leading: IconButton(
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go(AppRoutes.arenaSettings);
          }
        },
      ),
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            skipLoadingOnReload: true,
            data: (arenaId) {
              if (arenaId == null || arenaId.isEmpty) {
                return ArenaEmptyState(
                  title: 'Arena não encontrada',
                  message:
                      'Nenhuma arena vinculada ao seu usuário como gestor de ${config.title}.',
                  icon: Icons.storefront_outlined,
                );
              }
              return template.when(
                skipLoadingOnReload: true,
                data: (initial) => _ArenaAvailabilityForm(
                  key: ValueKey<String>(arenaId),
                  arenaId: arenaId,
                  initialState: initial,
                ),
                loading: () => const ArenaLoadingState(
                  label: 'Carregando configurações...',
                ),
                error: (e, _) => ArenaErrorState(message: '$e'),
              );
            },
            loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

class _ArenaAvailabilityForm extends ConsumerStatefulWidget {
  const _ArenaAvailabilityForm({
    super.key,
    required this.arenaId,
    required this.initialState,
  });

  final String arenaId;
  final ArenaSettingsScheduleState initialState;

  @override
  ConsumerState<_ArenaAvailabilityForm> createState() =>
      _ArenaAvailabilityFormState();
}

class _ArenaAvailabilityFormState extends ConsumerState<_ArenaAvailabilityForm> {
  late ArenaSettingsScheduleState _state;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _state = widget.initialState.withWholeHoursOnly();
  }

  @override
  void didUpdateWidget(covariant _ArenaAvailabilityForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialState != widget.initialState) {
      _state = widget.initialState.withWholeHoursOnly();
    }
  }

  String _fmtTime(TimeOfDay t) {
    return '${t.hour.toString().padLeft(2, '0')}:'
        '${t.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _pickTime({
    required TimeOfDay initial,
    required ValueChanged<TimeOfDay> onPick,
  }) async {
    final t = await showTimePicker(
      context: context,
      initialTime: arenaScheduleWholeHour(initial),
      builder: (ctx, child) {
        return MediaQuery(
          data: MediaQuery.of(ctx).copyWith(alwaysUse24HourFormat: true),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
    if (t != null) onPick(arenaScheduleWholeHour(t));
  }

  Future<void> _generateSlots() async {
    if (!isValidArenaSettingsSchedule(_state)) {
      showAppSnackBar(
        context,
        'Abertura deve ser antes do fechamento (00:00 no fechamento = meia-noite do fim do dia, ex.: 23:00–00:00).',
        isError: true,
      );
      return;
    }
    setState(() => _busy = true);
    var leftForSuccessRoute = false;
    try {
      await ref.read(courtServiceProvider).generateSlots(
            arenaId: widget.arenaId,
            slotDurationMinutes: _state.slotDurationMinutes,
            availabilitySchedule: _state.toAvailabilityScheduleMap(),
          );
      if (!mounted) return;
      leftForSuccessRoute = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        context.pushReplacement(AppRoutes.arenaAvailabilitySlotsSuccess);
        ref.invalidate(arenaSettingsTemplateProvider);
      });
    } on CourtServiceException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Falha ao salvar: $e', isError: true);
    } finally {
      if (mounted && !leftForSuccessRoute) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.55);

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth > 560 ? 480.0 : double.infinity;
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, 8, 22, 36),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxW),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Defina quando a arena aparece na agenda. As alterações '
                    'valem para todas as quadras.',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: muted,
                      height: 1.45,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 28),
                  _AvailabilitySettingsSection(
                    title: 'Disponibilidade padrão',
                    subtitle:
                        'Horário base e tamanho de cada slot na grade (agenda). '
                        'Horários sempre em hora cheia (ex.: 08:00, 18:00).',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: _AvailabilityTimeField(
                                label: 'Abertura',
                                value: _fmtTime(_state.defaultOpen),
                                onTap: () => _pickTime(
                                  initial: _state.defaultOpen,
                                  onPick: (t) => setState(
                                    () => _state =
                                        _state.copyWith(defaultOpen: t),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _AvailabilityTimeField(
                                label: 'Fechamento',
                                value: _fmtTime(_state.defaultClose),
                                onTap: () => _pickTime(
                                  initial: _state.defaultClose,
                                  onPick: (t) => setState(
                                    () => _state =
                                        _state.copyWith(defaultClose: t),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 22),
                        Text(
                          'Duração do slot',
                          style: theme.textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: muted,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            for (final m in CourtService.allowedSlotDurations)
                              ChoiceChip(
                                label: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 4,
                                  ),
                                  child: Text(
                                    m == 30
                                        ? '30 min'
                                        : m == 60
                                            ? '1 hora'
                                            : '2 horas',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                selected: _state.slotDurationMinutes == m,
                                onSelected: (_) => setState(
                                  () => _state = _state.copyWith(
                                    slotDurationMinutes: m,
                                  ),
                                ),
                                selectedColor:
                                    AppColors.brand.withValues(alpha: 0.14),
                                checkmarkColor: AppColors.brand,
                                labelStyle: TextStyle(
                                  color: _state.slotDurationMinutes == m
                                      ? AppColors.brand
                                      : theme.colorScheme.onSurface,
                                ),
                                side: BorderSide(
                                  color: theme.colorScheme.outline
                                      .withValues(alpha: 0.2),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  _AvailabilitySettingsSection(
                    title: 'Dias da semana',
                    subtitle:
                        'Marque fechado ou ajuste horários por dia (usa o padrão acima quando em branco).',
                    child: Column(
                      children: [
                        for (var i = 0; i < 7; i++) ...[
                          if (i > 0) const SizedBox(height: 12),
                          _AvailabilityWeekdayRow(
                            label: kArenaSettingsWeekdayLabels[i],
                            config: _state.perWeekday[i + 1]!,
                            defaultOpen: _state.defaultOpen,
                            defaultClose: _state.defaultClose,
                            formatTime: _fmtTime,
                            onClosedChanged: (closed) {
                              setState(() {
                                _state = _state.updateWeekday(
                                  i + 1,
                                  ArenaDayScheduleConfig(
                                    closed: closed,
                                    open: closed
                                        ? null
                                        : _state.perWeekday[i + 1]!.open,
                                    close: closed
                                        ? null
                                        : _state.perWeekday[i + 1]!.close,
                                  ),
                                );
                              });
                            },
                            onPickOpen: () => _pickTime(
                              initial: _state.perWeekday[i + 1]!.open ??
                                  _state.defaultOpen,
                              onPick: (t) {
                                setState(() {
                                  _state = _state.updateWeekday(
                                    i + 1,
                                    _state.perWeekday[i + 1]!.copyWith(
                                      open: t,
                                      closed: false,
                                    ),
                                  );
                                });
                              },
                            ),
                            onPickClose: () => _pickTime(
                              initial: _state.perWeekday[i + 1]!.close ??
                                  _state.defaultClose,
                              onPick: (t) {
                                setState(() {
                                  _state = _state.updateWeekday(
                                    i + 1,
                                    _state.perWeekday[i + 1]!.copyWith(
                                      close: t,
                                      closed: false,
                                    ),
                                  );
                                });
                              },
                            ),
                            onUseDefault: () {
                              setState(() {
                                _state = _state.updateWeekday(
                                  i + 1,
                                  const ArenaDayScheduleConfig(closed: false),
                                );
                              });
                            },
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    height: 54,
                    child: FilledButton(
                      onPressed: _busy ? null : _generateSlots,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.4,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'Gerar horários',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _AvailabilitySettingsSection extends StatelessWidget {
  const _AvailabilitySettingsSection({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 20, 22, 22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            child,
          ],
        ),
      ),
    );
  }
}

class _AvailabilityTimeField extends StatelessWidget {
  const _AvailabilityTimeField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Text(
                    value,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.schedule_rounded,
                    color: theme.colorScheme.primary.withValues(alpha: 0.7),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AvailabilityWeekdayRow extends StatelessWidget {
  const _AvailabilityWeekdayRow({
    required this.label,
    required this.config,
    required this.defaultOpen,
    required this.defaultClose,
    required this.formatTime,
    required this.onClosedChanged,
    required this.onPickOpen,
    required this.onPickClose,
    required this.onUseDefault,
  });

  final String label;
  final ArenaDayScheduleConfig config;
  final TimeOfDay defaultOpen;
  final TimeOfDay defaultClose;
  final String Function(TimeOfDay) formatTime;
  final ValueChanged<bool> onClosedChanged;
  final VoidCallback onPickOpen;
  final VoidCallback onPickClose;
  final VoidCallback onUseDefault;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final effectiveOpen = config.open ?? defaultOpen;
    final effectiveClose = config.close ?? defaultClose;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  'Fechado',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 6),
                Switch.adaptive(
                  value: config.closed,
                  activeTrackColor: AppColors.brand.withValues(alpha: 0.35),
                  activeThumbColor: AppColors.brand,
                  onChanged: onClosedChanged,
                ),
              ],
            ),
            if (!config.closed) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onPickOpen,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        'Abre ${formatTime(effectiveOpen)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onPickClose,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        'Fecha ${formatTime(effectiveClose)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
              if (config.open != null || config.close != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: onUseDefault,
                    child: const Text('Usar padrão'),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
