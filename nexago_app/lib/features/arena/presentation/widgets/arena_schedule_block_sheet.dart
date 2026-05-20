import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/arena_slot.dart';
import '../../../arenas/domain/arena_slot_block_reason.dart';
import '../../domain/arena_schedule_providers.dart';

/// Bottom sheet para bloquear horário com motivo e nota.
class ArenaScheduleBlockSheet extends ConsumerStatefulWidget {
  const ArenaScheduleBlockSheet({
    super.key,
    required this.slot,
    required this.courtName,
  });

  final ArenaSlot slot;
  final String courtName;

  static Future<bool> show(
    BuildContext context, {
    required ArenaSlot slot,
    required String courtName,
  }) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => ArenaScheduleBlockSheet(
        slot: slot,
        courtName: courtName,
      ),
    );
    return result == true;
  }

  @override
  ConsumerState<ArenaScheduleBlockSheet> createState() =>
      _ArenaScheduleBlockSheetState();
}

class _ArenaScheduleBlockSheetState extends ConsumerState<ArenaScheduleBlockSheet> {
  ArenaSlotBlockReason _reason = ArenaSlotBlockReason.manutencao;
  final _noteController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateLabel = DateFormat('EEE, d \'de\' MMMM', 'pt_BR')
        .format(widget.slot.date)
        .toUpperCase()
        .replaceAll('.', '');
    final timeRange = '${widget.slot.startTime} — ${widget.slot.endTime}';

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: 20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '$dateLabel · ${widget.courtName.toUpperCase()}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              timeRange,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Bloquear horário',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Esse slot some da agenda pública. Ninguém consegue reservar.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'MOTIVO',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in ArenaSlotBlockReason.values)
                  _ReasonChip(
                    label: r.displayLabel,
                    selected: _reason == r,
                    onTap: () => setState(() => _reason = r),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                'Repetir todo ${_weekdayLabel(widget.slot.date)}',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              subtitle: Text(
                'bloqueio recorrente até desligar',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
              value: false,
              onChanged: (_) {
                showAppSnackBar(context, 'Bloqueio recorrente em breve.');
              },
            ),
            const SizedBox(height: 8),
            Text(
              'NOTA (OPCIONAL)',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _noteController,
              maxLines: 2,
              style: const TextStyle(color: AppColors.onSurface),
              decoration: InputDecoration(
                hintText: 'Ex: troca da rede + limpeza geral',
                hintStyle: TextStyle(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.7),
                ),
                filled: true,
                fillColor: AppColors.surfaceRaised,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _confirm,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Bloquear horário'),
            ),
          ],
        ),
      ),
    );
  }

  String _weekdayLabel(DateTime d) {
    return DateFormat('EEEE', 'pt_BR').format(d);
  }

  Future<void> _confirm() async {
    setState(() => _busy = true);
    try {
      final service = ref.read(slotServiceProvider);
      final note = _noteController.text.trim();
      if (widget.slot.isVirtual) {
        await service.blockVirtualSlot(
          widget.slot,
          blockReason: _reason,
          blockNote: note.isEmpty ? null : note,
        );
      } else {
        await service.blockSlot(
          widget.slot.id,
          blockReason: _reason,
          blockNote: note.isEmpty ? null : note,
        );
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _ReasonChip extends StatelessWidget {
  const _ReasonChip({
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
      color: selected ? AppColors.brand : AppColors.surfaceRaised,
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
              color: selected ? AppColors.black : AppColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}
