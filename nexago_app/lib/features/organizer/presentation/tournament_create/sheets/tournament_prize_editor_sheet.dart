import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../widgets/organizer_form_widgets.dart';

Future<void> showTournamentPrizeEditorSheet(
  BuildContext context,
  WidgetRef ref, {
  required TournamentCategoryDraft category,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _PrizeEditorSheet(category: category),
  );
}

class _PrizeEditorSheet extends ConsumerStatefulWidget {
  const _PrizeEditorSheet({required this.category});

  final TournamentCategoryDraft category;

  @override
  ConsumerState<_PrizeEditorSheet> createState() => _PrizeEditorSheetState();
}

class _PrizeEditorSheetState extends ConsumerState<_PrizeEditorSheet> {
  late List<TournamentCategoryPrizeDraft> _prizes;
  late final TextEditingController _totalController;
  final List<TextEditingController> _rowControllers = [];

  /// Controllers de linhas removidas; descartados só no dispose para não
  /// invalidar um TextField que ainda está sendo desmontado no mesmo frame.
  final List<TextEditingController> _retiredControllers = [];
  var _applyToAll = false;

  @override
  void initState() {
    super.initState();
    _prizes = List<TournamentCategoryPrizeDraft>.from(widget.category.prizes);
    _totalController = TextEditingController(
      text: _reaisText(prizeListTotalCents(_prizes)),
    );
    for (final prize in _prizes) {
      _rowControllers.add(
        TextEditingController(text: _reaisText(prize.valueCents)),
      );
    }
  }

  String _reaisText(int cents) =>
      cents > 0 ? (cents / 100).round().toString() : '';

  int _parseReais(String value) =>
      int.tryParse(value.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  void _onTotalChanged(String value) {
    setState(() {
      _prizes = defaultCategoryPrizes(_parseReais(value) * 100);
      _syncRowControllers();
    });
  }

  void _syncRowControllers() {
    for (var i = 0; i < _prizes.length; i++) {
      final text = _reaisText(_prizes[i].valueCents);
      if (i < _rowControllers.length) {
        _rowControllers[i].text = text;
      } else {
        _rowControllers.add(TextEditingController(text: text));
      }
    }
    while (_rowControllers.length > _prizes.length) {
      _retiredControllers.add(_rowControllers.removeLast());
    }
  }

  void _onRowChanged(int index, String value) {
    setState(() {
      _prizes[index] =
          _prizes[index].copyWith(valueCents: _parseReais(value) * 100);
      _totalController.text = _reaisText(prizeListTotalCents(_prizes));
    });
  }

  void _addPlacement() {
    setState(() {
      _prizes = [..._prizes, nextPrizeDraft(_prizes)];
      _rowControllers.add(TextEditingController());
    });
  }

  void _removeLastPlacement() {
    setState(() {
      _prizes = _prizes.sublist(0, _prizes.length - 1);
      _retiredControllers.add(_rowControllers.removeLast());
      _totalController.text = _reaisText(prizeListTotalCents(_prizes));
    });
  }

  @override
  void dispose() {
    _totalController.dispose();
    for (final controller in _rowControllers) {
      controller.dispose();
    }
    for (final controller in _retiredControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _save() {
    ref.read(tournamentCreateWizardProvider.notifier).updateCategoryPrizes(
          widget.category.id,
          _prizes,
          applyToAll: _applyToAll,
        );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final name = widget.category.name.trim().isEmpty
        ? suggestCategoryName(widget.category)
        : widget.category.name.trim();

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'PREMIAÇÃO',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
            ),
            Text(
              name,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 16),
            const OrganizerSectionLabel('PREMIAÇÃO TOTAL DA CATEGORIA'),
            const SizedBox(height: 8),
            OrganizerTextField(
              controller: _totalController,
              hintText: 'R\$ 8.000',
              keyboardType: TextInputType.number,
              onChanged: _onTotalChanged,
            ),
            const SizedBox(height: 8),
            Text(
              'Sugerimos a divisão automaticamente — ajuste os valores por '
              'colocação. Alterar o total refaz a divisão.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
            const SizedBox(height: 20),
            const OrganizerSectionLabel('DISTRIBUIÇÃO'),
            const SizedBox(height: 12),
            for (var i = 0; i < _prizes.length; i++) ...[
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${_prizes[i].position}º',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _prizes[i].label ?? '${_prizes[i].position}º lugar',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  SizedBox(
                    width: 120,
                    child: OrganizerTextField(
                      controller: _rowControllers[i],
                      hintText: 'R\$ 0',
                      keyboardType: TextInputType.number,
                      onChanged: (value) => _onRowChanged(i, value),
                    ),
                  ),
                  if (i == _prizes.length - 1 && _prizes.length > 1)
                    IconButton(
                      onPressed: _removeLastPlacement,
                      icon: const Icon(Icons.remove_circle_outline, size: 20),
                      color: context.themeColors.onSurfaceMuted,
                      visualDensity: VisualDensity.compact,
                      tooltip: 'Remover colocação',
                    ),
                ],
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 4),
            OrganizerAddDashedCard(
              title: 'Adicionar colocação',
              subtitle: nextPrizeDraft(_prizes).label ?? '',
              onTap: _addPlacement,
            ),
            const SizedBox(height: 16),
            OrganizerToggleSettingRow(
              icon: Icons.copy_all_outlined,
              title: 'Aplicar a todas as categorias',
              subtitle: 'Usa esta mesma distribuição nas outras categorias.',
              value: _applyToAll,
              onChanged: (value) => setState(() => _applyToAll = value),
            ),
            const SizedBox(height: 16),
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
                    Text('Salvar premiação', style: TextStyle(fontWeight: FontWeight.w800)),
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
