import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/slots_providers.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_slot_detail_args.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_logout_button.dart';
import 'widgets/arena_schedule_day_strip.dart';

class ArenaSchedulePage extends ConsumerWidget {
  const ArenaSchedulePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final managedArena = ref.watch(managedArenaIdProvider);
    final selectedDate = ref.watch(arenaScheduleSelectedDateProvider);
    final theme = Theme.of(context);
    final dateTitle = DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(selectedDate);

    return AppScaffold(
      title: 'Agenda',
      actions: [
        IconButton(
          tooltip: 'Escolher data',
          icon: const Icon(Icons.calendar_month_outlined),
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: selectedDate,
              firstDate: DateTime.now().subtract(const Duration(days: 1)),
              lastDate: DateTime.now().add(const Duration(days: 365)),
            );
            if (picked != null) {
              ref.read(arenaScheduleSelectedDateProvider.notifier).state =
                  arenaDateOnly(picked);
            }
          },
        ),
        const ArenaLogoutButton(),
      ],
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 4),
              child: Text(
                config.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                _capitalize(dateTitle),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: ArenaScheduleDayStrip(),
            ),
            Expanded(
              child: managedArena.when(
                data: (arenaId) {
                  if (arenaId == null || arenaId.isEmpty) {
                    return const ArenaEmptyState(
                      title: 'Arena não encontrada',
                      message: 'Nenhuma arena vinculada ao seu usuário como gestor.',
                      icon: Icons.store_mall_directory_outlined,
                    );
                  }
                  return _ArenaScheduleBody(arenaId: arenaId);
                },
                loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }
}

class _ArenaScheduleBody extends ConsumerWidget {
  const _ArenaScheduleBody({required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courtsAsync = ref.watch(courtsStreamProvider(arenaId));
    final slotsAsync = ref.watch(arenaScheduleSlotsProvider);

    return courtsAsync.when(
      data: (courts) {
        final courtNames = {for (final c in courts) c.id: c.name};
        return slotsAsync.when(
          data: (slots) {
            if (slots.isEmpty) {
              return const ArenaEmptyState(
                title: 'Agenda vazia',
                message: 'Nenhum horário neste dia.',
                icon: Icons.event_busy_outlined,
              );
            }
            return ListView.separated(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
              itemCount: slots.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final slot = slots[index];
                final courtLabel = courtNames[slot.courtId] ?? slot.courtId;
                return staggeredFadeSlide(
                  index: index,
                  child: _ScheduleSlotTile(
                    slot: slot,
                    courtName: courtLabel,
                    onTap: () {
                      context.pushNamed(
                        AppRouteNames.arenaSlotDetail,
                        pathParameters: {'slotId': slot.id},
                        extra: ArenaSlotDetailArgs(
                          slot: slot,
                          courtName: courtLabel,
                        ),
                      );
                    },
                    onLongPress: () => _confirmBlock(
                      context,
                      ref,
                      slot: slot,
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const ArenaLoadingState(label: 'Buscando horários...'),
          error: (e, _) => ArenaErrorState(message: 'Erro ao carregar horários.\n$e'),
        );
      },
      loading: () => const ArenaLoadingState(label: 'Carregando quadras...'),
      error: (e, _) => ArenaErrorState(message: '$e'),
    );
  }
}

Future<void> _confirmBlock(
  BuildContext context,
  WidgetRef ref, {
  required ArenaSlot slot,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Bloquear horário?'),
      content: Text(
        '${slot.startTime} – ${slot.endTime}\n'
        'O horário ficará indisponível para reservas.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
          child: const Text('Bloquear'),
        ),
      ],
    ),
  );

  if (ok != true || !context.mounted) return;

  try {
    final service = ref.read(slotServiceProvider);
    if (slot.isVirtual) {
      await service.blockVirtualSlot(slot);
    } else {
      await service.blockSlot(slot.id);
    }
    if (!context.mounted) return;
    showAppSnackBar(context, 'Horário bloqueado.');
  } on SlotServiceException catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, e.message, isError: true);
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, 'Não foi possível bloquear: $e', isError: true);
  }
}

String _statusLabel(ArenaSlot slot) {
  if (slot.isBlocked) return 'Bloqueado';
  if (slot.isBooked) return 'Reservado';
  return 'Disponível';
}

class _ScheduleSlotTile extends StatelessWidget {
  const _ScheduleSlotTile({
    required this.slot,
    required this.courtName,
    required this.onTap,
    required this.onLongPress,
  });

  final ArenaSlot slot;
  final String courtName;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = _statusColor(slot);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.1),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 5,
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: const BorderRadius.horizontal(
                      left: Radius.circular(16),
                    ),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: Text(
                            '${slot.startTime}\n${slot.endTime}',
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              height: 1.25,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),
                        Expanded(
                          flex: 3,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                courtName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _statusLabel(slot),
                                style: theme.textTheme.labelLarge?.copyWith(
                                  color: accent.withValues(alpha: 0.95),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static Color _statusColor(ArenaSlot slot) {
    if (slot.isBlocked) {
      return const Color(0xFF9E9E9E);
    }
    if (slot.isBooked) {
      return const Color(0xFFE53935);
    }
    return const Color(0xFF2E7D32);
  }
}
