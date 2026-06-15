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
  var _applyToAll = false;

  @override
  void initState() {
    super.initState();
    _prizes = List<TournamentCategoryPrizeDraft>.from(widget.category.prizes);
    if (_prizes.isEmpty) {
      _prizes = defaultCategoryPrizes(800000);
    }
    final total = _prizes.fold<int>(0, (sum, p) => sum + p.valueCents);
    _totalController = TextEditingController(text: formatCents(total));
  }

  @override
  void dispose() {
    _totalController.dispose();
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
            ),
            const SizedBox(height: 8),
            Text(
              'Deve bater com a soma das colocações.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
            const SizedBox(height: 20),
            const OrganizerSectionLabel('DISTRIBUIÇÃO'),
            const SizedBox(height: 12),
            for (final prize in _prizes) ...[
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
                      '${prize.position}º',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      prize.label ?? '${prize.position}º lugar',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  Text(
                    formatCents(prize.valueCents),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 8),
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
