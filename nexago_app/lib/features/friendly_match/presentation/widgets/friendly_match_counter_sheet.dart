import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Resultado da contraproposta montada na folha.
class FriendlyMatchCounterResult {
  const FriendlyMatchCounterResult({required this.scheduledAt, this.message});

  final DateTime scheduledAt;
  final String? message;
}

/// Folha "Sugerir outro horário" — padrão visual nexaGO (grab handle,
/// cantos 20, título w800). Devolve null se fechada sem enviar.
Future<FriendlyMatchCounterResult?> showFriendlyMatchCounterSheet(
  BuildContext context, {
  required DateTime initialTime,
}) {
  return showModalBottomSheet<FriendlyMatchCounterResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _CounterSheetBody(initialTime: initialTime),
  );
}

class _CounterSheetBody extends StatefulWidget {
  const _CounterSheetBody({required this.initialTime});

  final DateTime initialTime;

  @override
  State<_CounterSheetBody> createState() => _CounterSheetBodyState();
}

class _CounterSheetBodyState extends State<_CounterSheetBody> {
  late DateTime _scheduledAt = widget.initialTime;
  final _messageController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt.isAfter(now) ? _scheduledAt : now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt),
    );
    if (time == null) return;
    setState(() {
      _scheduledAt =
          DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final label = DateFormat("EEE, d 'de' MMMM • HH:mm", 'pt_BR')
        .format(_scheduledAt.toLocal());

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            20, 12, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Sugerir outro horário',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Só há uma rodada de contraproposta — capriche na sugestão.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: 16),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_rounded, color: AppColors.brand),
              title: Text(label,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600)),
              trailing: const Icon(Icons.edit_outlined, size: 18),
              onTap: _pickDateTime,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _messageController,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Mensagem (opcional)',
                hintText: 'Ex.: consigo só depois das 19h',
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.pop(
                context,
                FriendlyMatchCounterResult(
                  scheduledAt: _scheduledAt,
                  message: _messageController.text.trim().isEmpty
                      ? null
                      : _messageController.text.trim(),
                ),
              ),
              child: const Text('Enviar contraproposta'),
            ),
          ],
        ),
      ),
    );
  }
}
