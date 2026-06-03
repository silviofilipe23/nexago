import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_providers.dart';
import '../domain/arena_schedule_models.dart';
import '../domain/arena_slot_detail_args.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_schedule_block_sheet.dart';
import 'widgets/arena_schedule_date_picker_sheet.dart';
import 'widgets/arena_schedule_day_strip.dart';
import 'widgets/arena_schedule_filters.dart';
import 'widgets/arena_schedule_header.dart';
import 'widgets/arena_schedule_hour_group.dart';

class ArenaSchedulePage extends ConsumerWidget {
  const ArenaSchedulePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managedArena = ref.watch(managedArenaIdProvider);
    final groupsAsync = ref.watch(arenaScheduleGroupedSlotsProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: managedArena.when(
          data: (arenaId) {
            if (arenaId == null || arenaId.isEmpty) {
              return const ArenaEmptyState(
                title: 'Arena não encontrada',
                message: 'Nenhuma arena vinculada ao seu usuário como gestor.',
                icon: Icons.store_mall_directory_outlined,
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    12,
                    ArenaDashboardTokens.horizontalPadding,
                    0,
                  ),
                  child: FadeSlideIn(
                    child: ArenaScheduleHeader(
                      onOpenCalendar: () => _openCalendar(context, ref),
                    ),
                  ),
                ),
                SizedBox(height: 16),
                Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: ArenaDashboardTokens.horizontalPadding,
                  ),
                  child: ArenaScheduleDayStrip(),
                ),
                SizedBox(height: 16),
                Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: ArenaDashboardTokens.horizontalPadding,
                  ),
                  child: ArenaScheduleFilters(),
                ),
                SizedBox(height: 12),
                Expanded(
                  child: groupsAsync.when(
                    data: (groups) {
                      if (groups.isEmpty) {
                        return const ArenaEmptyState(
                          title: 'Agenda vazia',
                          message: 'Nenhum horário neste dia para os filtros atuais.',
                          icon: Icons.event_busy_outlined,
                        );
                      }
                      return ListView.builder(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(
                          ArenaDashboardTokens.horizontalPadding,
                          4,
                          ArenaDashboardTokens.horizontalPadding,
                          24,
                        ),
                        itemCount: groups.length,
                        itemBuilder: (context, index) {
                          final group = groups[index];
                          return FadeSlideIn(
                            duration: Duration(milliseconds: 380 + index * 40),
                            offsetY: 10,
                            child: ArenaScheduleHourGroupSection(
                              group: group,
                              onSlotTap: (row) => _openSlotDetail(
                                context,
                                row: row,
                              ),
                              onSlotLongPress: (row) => _openBlockSheet(
                                context,
                                ref,
                                arenaId: arenaId,
                                row: row,
                              ),
                            ),
                          );
                        },
                      );
                    },
                    loading: () => const ArenaLoadingState(
                      label: 'Buscando horários...',
                    ),
                    error: (e, _) => ArenaErrorState(
                      message: 'Erro ao carregar horários.\n$e',
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }

  Future<void> _openCalendar(BuildContext context, WidgetRef ref) async {
    final picked = await ArenaScheduleDatePickerSheet.show(context);
    if (picked != null) {
      ref.read(arenaScheduleSelectedDateProvider.notifier).state =
          arenaDateOnly(picked);
    }
  }

  void _openSlotDetail(
    BuildContext context, {
    required ArenaScheduleCourtRow row,
  }) {
    context.pushNamed(
      AppRouteNames.arenaSlotDetail,
      pathParameters: {'slotId': row.slot.id},
      extra: ArenaSlotDetailArgs(
        slot: row.slot,
        courtName: row.courtName,
      ),
    );
  }

  Future<void> _openBlockSheet(
    BuildContext context,
    WidgetRef ref, {
    required String arenaId,
    required ArenaScheduleCourtRow row,
  }) async {
    if (!row.slot.isAvailable) return;
    final ok = await ArenaScheduleBlockSheet.show(
      context,
      slot: row.slot,
      courtName: row.courtName,
    );
    if (ok && context.mounted) {
      showAppSnackBar(context, 'Horário bloqueado.');
    }
  }
}
