import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Configuração de horários da agenda (disponibilidade padrão, dias, slots).
class ArenaAvailabilitySettingsPage extends ConsumerWidget {
  const ArenaAvailabilitySettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final managed = ref.watch(managedArenaIdProvider);
    final template = ref.watch(arenaSettingsTemplateProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
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

class _ArenaAvailabilityHeader extends StatelessWidget {
  const _ArenaAvailabilityHeader({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Material(
                color: AppColors.surfaceRaised,
                borderRadius: BorderRadius.circular(12),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onBack,
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(
                      Icons.arrow_back_rounded,
                      color: AppColors.onSurface,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  'Disponibilidade',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              const SizedBox(width: 44),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Defina quando a arena aparece na agenda. Vale pra todas as quadras.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              height: 1.45,
            ),
          ),
        ],
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

  void _onBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.arenaSettings);
    }
  }

  Future<void> _save() async {
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
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth > 560 ? 480.0 : double.infinity;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ArenaAvailabilityHeader(onBack: _onBack),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  20,
                  ArenaDashboardTokens.horizontalPadding,
                  24,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxW),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _AvailabilitySettingsSection(
                          sectionLabel: 'HORÁRIO PADRÃO',
                          subtitle:
                              'Base e tamanho de cada slot. Sempre em hora cheia.',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: _AvailabilityTimeField(
                                      label: 'ABERTURA',
                                      value: _fmtTime(_state.defaultOpen),
                                      onTap: () => _pickTime(
                                        initial: _state.defaultOpen,
                                        onPick: (t) => setState(
                                          () => _state = _state.copyWith(
                                            defaultOpen: t,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _AvailabilityTimeField(
                                      label: 'FECHAMENTO',
                                      value: _fmtTime(_state.defaultClose),
                                      onTap: () => _pickTime(
                                        initial: _state.defaultClose,
                                        onPick: (t) => setState(
                                          () => _state = _state.copyWith(
                                            defaultClose: t,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 20),
                              Text(
                                'DURAÇÃO DO SLOT',
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(
                                      color: AppColors.onSurfaceMuted,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.6,
                                      fontSize: 10,
                                    ),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  for (final m
                                      in CourtService.allowedSlotDurations) ...[
                                    Expanded(
                                      child: _SlotDurationOption(
                                        label: m == 30
                                            ? '30 min'
                                            : m == 60
                                                ? '1 hora'
                                                : '2 horas',
                                        selected:
                                            _state.slotDurationMinutes == m,
                                        onTap: () => setState(
                                          () => _state = _state.copyWith(
                                            slotDurationMinutes: m,
                                          ),
                                        ),
                                      ),
                                    ),
                                    if (m !=
                                        CourtService
                                            .allowedSlotDurations.last)
                                      const SizedBox(width: 8),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        _AvailabilitySettingsSection(
                          sectionLabel: 'DIAS DA SEMANA',
                          subtitle:
                              'Ajuste por dia ou deixe em branco pra usar o padrão.',
                          child: Column(
                            children: [
                              for (var i = 0; i < 7; i++) ...[
                                if (i > 0) const SizedBox(height: 10),
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
                                              : _state.perWeekday[i + 1]!
                                                  .open,
                                          close: closed
                                              ? null
                                              : _state.perWeekday[i + 1]!
                                                  .close,
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
                                    initial: _state.perWeekday[i + 1]!
                                            .close ??
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
                                        const ArenaDayScheduleConfig(
                                          closed: false,
                                        ),
                                      );
                                    });
                                  },
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          height: 52,
                          child: FilledButton(
                            onPressed: _busy ? null : _save,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.black,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: _busy
                                ? const SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.4,
                                      color: AppColors.black,
                                    ),
                                  )
                                : const Text(
                                    'Salvar alterações',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _AvailabilitySettingsSection extends StatelessWidget {
  const _AvailabilitySettingsSection({
    required this.sectionLabel,
    required this.subtitle,
    required this.child,
  });

  final String sectionLabel;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        color: AppColors.surfaceRaised,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              sectionLabel,
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                fontSize: 10,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
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
      color: AppColors.surfaceSheet,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          decoration: BoxDecoration(
            border: Border.all(
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Text(
                    label,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      fontSize: 9,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.schedule_rounded,
                    size: 16,
                    color: AppColors.brand.withValues(alpha: 0.95),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                value,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                  letterSpacing: 1,
                  height: 1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlotDurationOption extends StatelessWidget {
  const _SlotDurationOption({
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
      color: selected ? AppColors.brand : AppColors.surfaceSheet,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: selected
                ? null
                : Border.all(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.3),
                  ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (selected) ...[
                const Icon(
                  Icons.check_rounded,
                  size: 16,
                  color: AppColors.black,
                ),
                const SizedBox(width: 4),
              ],
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    color: selected ? AppColors.black : AppColors.onSurface,
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
    final statusLabel = config.closed ? 'FECHADO' : 'ABERTO';
    final statusColor =
        config.closed ? AppColors.brand : AppColors.onSurfaceMuted;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceSheet.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                ),
                Text(
                  statusLabel,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: statusColor,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    fontSize: 10,
                  ),
                ),
                const SizedBox(width: 8),
                Switch.adaptive(
                  value: config.closed,
                  activeTrackColor: AppColors.brand.withValues(alpha: 0.45),
                  activeThumbColor: AppColors.brand,
                  inactiveTrackColor:
                      AppColors.onSurfaceMuted.withValues(alpha: 0.25),
                  inactiveThumbColor: AppColors.onSurface,
                  onChanged: onClosedChanged,
                ),
              ],
            ),
            if (!config.closed) ...[
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: _WeekdayTimeField(
                      label: 'Abre',
                      value: formatTime(effectiveOpen),
                      onTap: onPickOpen,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _WeekdayTimeField(
                      label: 'Fecha',
                      value: formatTime(effectiveClose),
                      onTap: onPickClose,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _UseDefaultButton(onTap: onUseDefault),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeekdayTimeField extends StatelessWidget {
  const _WeekdayTimeField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceSheet,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                      fontSize: 11,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UseDefaultButton extends StatelessWidget {
  const _UseDefaultButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.55),
            ),
          ),
          child: Text(
            'USAR\nPADRÃO',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w800,
                  fontSize: 9,
                  height: 1.2,
                  letterSpacing: 0.3,
                ),
          ),
        ),
      ),
    );
  }
}
