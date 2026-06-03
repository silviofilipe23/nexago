import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Bottom sheet para editar início e fim da janela de silêncio.
Future<({String start, String end})?> showQuietHoursTimeSheet({
  required BuildContext context,
  required String initialStart,
  required String initialEnd,
}) {
  return showModalBottomSheet<({String start, String end})>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _QuietHoursTimeSheetBody(
      initialStart: initialStart,
      initialEnd: initialEnd,
    ),
  );
}

class _QuietHoursTimeSheetBody extends StatefulWidget {
  const _QuietHoursTimeSheetBody({
    required this.initialStart,
    required this.initialEnd,
  });

  final String initialStart;
  final String initialEnd;

  @override
  State<_QuietHoursTimeSheetBody> createState() =>
      _QuietHoursTimeSheetBodyState();
}

class _QuietHoursTimeSheetBodyState extends State<_QuietHoursTimeSheetBody> {
  late TimeOfDay _start;
  late TimeOfDay _end;

  @override
  void initState() {
    super.initState();
    _start = _parseTime(widget.initialStart) ?? const TimeOfDay(hour: 22, minute: 0);
    _end = _parseTime(widget.initialEnd) ?? const TimeOfDay(hour: 7, minute: 0);
  }

  static TimeOfDay? _parseTime(String raw) {
    final match = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(raw.trim());
    if (match == null) return null;
    final h = int.tryParse(match.group(1)!);
    final m = int.tryParse(match.group(2)!);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h.clamp(0, 23), minute: m.clamp(0, 59));
  }

  static String _formatTime(TimeOfDay t) {
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  Future<void> _pickStart() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _start,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: AppColors.brand,
                ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) setState(() => _start = picked);
  }

  Future<void> _pickEnd() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _end,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: AppColors.brand,
                ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) setState(() => _end = picked);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          16,
          20,
          16 + MediaQuery.paddingOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Janela de silêncio',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Neste período o nexaGO não envia notificações push.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            SizedBox(height: 20),
            _TimeRow(
              label: 'Início',
              timeLabel: _formatTime(_start),
              onTap: _pickStart,
            ),
            SizedBox(height: 12),
            _TimeRow(
              label: 'Fim',
              timeLabel: _formatTime(_end),
              onTap: _pickEnd,
            ),
            SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop((
                  start: _formatTime(_start),
                  end: _formatTime(_end),
                ));
              },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                'Salvar horários',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimeRow extends StatelessWidget {
  const _TimeRow({
    required this.label,
    required this.timeLabel,
    required this.onTap,
  });

  final String label;
  final String timeLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Text(
                label,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              Spacer(),
              Text(
                timeLabel,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              SizedBox(width: 8),
              Icon(
                Icons.schedule_rounded,
                size: 20,
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.85),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
