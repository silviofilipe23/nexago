import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

Future<void> showLeagueStageEditorSheet(
  BuildContext context,
  WidgetRef ref, {
  required LeagueStageDraft stage,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _LeagueStageEditorSheet(stage: stage),
  );
}

class _LeagueStageEditorSheet extends ConsumerStatefulWidget {
  const _LeagueStageEditorSheet({required this.stage});

  final LeagueStageDraft stage;

  @override
  ConsumerState<_LeagueStageEditorSheet> createState() =>
      _LeagueStageEditorSheetState();
}

class _LeagueStageEditorSheetState
    extends ConsumerState<_LeagueStageEditorSheet> {
  late LeagueStageDraft _stage;
  late final TextEditingController _nameController;
  late final TextEditingController _locationController;

  bool get _isPending => _stage.status == LeagueStageStatus.pending;

  @override
  void initState() {
    super.initState();
    _stage = widget.stage;
    _nameController = TextEditingController(text: _stage.name);
    _locationController = TextEditingController(text: _stage.locationName);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _pickMonthLabel() async {
    final initial = _stage.startAt ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      helpText: 'Mês previsto da etapa',
    );
    if (picked == null) return;

    final label = DateFormat('MMM yyyy', 'pt_BR').format(picked);
    setState(() {
      _stage = _stage.copyWith(
        dateLabel: label,
        startAt: DateTime(picked.year, picked.month),
      );
    });
  }

  Future<void> _pickStartDate() async {
    final initial = _stage.startAt ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      helpText: 'Início da etapa',
    );
    if (picked == null) return;
    setState(() {
      _stage = _stage.copyWith(
        startAt: picked,
        dateLabel: _formatDateRange(picked, _stage.endAt),
      );
    });
  }

  Future<void> _pickEndDate() async {
    final initial = _stage.endAt ?? _stage.startAt ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: _stage.startAt ?? DateTime(2020),
      lastDate: DateTime(2035),
      helpText: 'Fim da etapa',
    );
    if (picked == null) return;
    setState(() {
      _stage = _stage.copyWith(
        endAt: picked,
        dateLabel: _formatDateRange(_stage.startAt, picked),
      );
    });
  }

  String _formatDateRange(DateTime? start, DateTime? end) {
    if (start == null) return '';
    final startFmt = DateFormat('d MMM', 'pt_BR').format(start);
    if (end == null) return startFmt;
    final endFmt = DateFormat('d MMM yyyy', 'pt_BR').format(end);
    return '$startFmt — $endFmt';
  }

  void _save() {
    final notifier = ref.read(leagueCreateWizardProvider.notifier);

    if (_isPending) {
      notifier.updateStage(
        _stage.copyWith(
          dateLabel: _stage.dateLabel,
        ),
      );
    } else {
      final name = _nameController.text.trim().isEmpty
          ? _stage.name
          : _nameController.text.trim();
      notifier.updateStage(
        _stage.copyWith(
          name: name,
          locationName: _locationController.text.trim(),
          status: LeagueStageStatus.defined,
        ),
      );
    }

    Navigator.of(context).pop();
  }

  void _markAsDefined() {
    setState(() {
      _stage = _stage.copyWith(status: LeagueStageStatus.defined);
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color:
                      context.themeColors.onSurfaceMuted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _stage.isGrandFinal ? 'Grande Final' : _stage.name,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            if (_isPending) ...[
              const SizedBox(height: 8),
              Text(
                'Etapa pendente — defina apenas o mês previsto por enquanto.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              ),
              const SizedBox(height: 16),
              OrganizerDateField(
                label: 'MÊS PREVISTO',
                value: _stage.dateLabel.isEmpty
                    ? 'Selecionar mês'
                    : _stage.dateLabel,
                onTap: _pickMonthLabel,
              ),
            ] else ...[
              const SizedBox(height: 16),
              const OrganizerSectionLabel('NOME DA ETAPA'),
              const SizedBox(height: 8),
              OrganizerTextField(
                controller: _nameController,
                hintText: _stage.name,
              ),
              const SizedBox(height: 16),
              const OrganizerSectionLabel('LOCAL'),
              const SizedBox(height: 8),
              OrganizerTextField(
                controller: _locationController,
                hintText: 'Arena ou cidade',
              ),
              const SizedBox(height: 16),
              OrganizerDateField(
                label: 'DATA DE INÍCIO',
                value: _stage.startAt != null
                    ? DateFormat('d MMM yyyy', 'pt_BR').format(_stage.startAt!)
                    : 'Selecionar data',
                onTap: _pickStartDate,
              ),
              const SizedBox(height: 16),
              OrganizerDateField(
                label: 'DATA DE FIM',
                value: _stage.endAt != null
                    ? DateFormat('d MMM yyyy', 'pt_BR').format(_stage.endAt!)
                    : 'Selecionar data',
                onTap: _pickEndDate,
              ),
            ],
            const SizedBox(height: 20),
            if (_isPending) ...[
              OutlinedButton(
                onPressed: _markAsDefined,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Definir etapa completa',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: 10),
            ],
            SizedBox(
              height: 52,
              child: FilledButton(
                onPressed: _save,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Salvar etapa',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    SizedBox(width: 8),
                    Icon(Icons.check_rounded, size: 18),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
