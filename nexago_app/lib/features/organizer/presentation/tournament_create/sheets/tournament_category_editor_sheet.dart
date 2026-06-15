import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../widgets/organizer_form_widgets.dart';

Future<void> showTournamentCategoryEditorSheet(
  BuildContext context,
  WidgetRef ref, {
  TournamentCategoryDraft? existing,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _CategoryEditorSheet(existing: existing),
  );
}

class _CategoryEditorSheet extends ConsumerStatefulWidget {
  const _CategoryEditorSheet({this.existing});

  final TournamentCategoryDraft? existing;

  @override
  ConsumerState<_CategoryEditorSheet> createState() =>
      _CategoryEditorSheetState();
}

class _CategoryEditorSheetState extends ConsumerState<_CategoryEditorSheet> {
  late TournamentCategoryDraft _category;
  late final TextEditingController _nameController;
  late final TextEditingController _priceController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(tournamentCreateDraftProvider);
    _category = widget.existing ??
        TournamentCategoryDraft(
          id: DateTime.now().microsecondsSinceEpoch.toString(),
          priceCents: draft.defaultPriceCents,
          useDefaultPrice: true,
          prizes: defaultCategoryPrizes(800000),
        );
    _nameController = TextEditingController(text: _category.name);
    _priceController = TextEditingController(
      text: formatCents(_category.priceCents).replaceAll(r'R$', '').trim(),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  void _save() {
    final name = _nameController.text.trim().isEmpty
        ? suggestCategoryName(_category)
        : _nameController.text.trim();
    final saved = _category.copyWith(
      name: name,
      dispute: TournamentCategoryDispute.dupla,
    );
    final notifier = ref.read(tournamentCreateWizardProvider.notifier);
    if (widget.existing != null) {
      notifier.updateCategory(saved);
    } else {
      notifier.addCategory(saved);
    }
    Navigator.of(context).pop();
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
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.existing == null ? 'Nova categoria' : 'Editar categoria',
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
            const SizedBox(height: 16),
            const OrganizerSectionLabel('NOME DA CATEGORIA'),
            const SizedBox(height: 8),
            OrganizerTextField(
              controller: _nameController,
              hintText: suggestCategoryName(_category),
            ),
            const SizedBox(height: 16),
            const OrganizerSectionLabel('GÊNERO'),
            const SizedBox(height: 8),
            OrganizerSegmentedControl(
              options: TournamentCategoryGender.values,
              selected: _category.gender,
              labelBuilder: categoryGenderLabel,
              onSelected: (value) =>
                  setState(() => _category = _category.copyWith(gender: value)),
            ),
            const SizedBox(height: 16),
            const OrganizerSectionLabel('DISPUTA'),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
                ),
              ),
              child: Row(
                children: [
                  Text(
                    categoryDisputeLabel(TournamentCategoryDispute.dupla),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const Spacer(),
                  Text(
                    'Por enquanto só duplas',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const OrganizerSectionLabel('FAIXA ETÁRIA'),
            const SizedBox(height: 8),
            OrganizerChipSelector(
              options: TournamentAgeBand.values,
              selected: _category.ageBand,
              labelBuilder: ageBandLabel,
              onSelected: (value) =>
                  setState(() => _category = _category.copyWith(ageBand: value)),
            ),
            const SizedBox(height: 16),
            const OrganizerSectionLabel('NÍVEL'),
            const SizedBox(height: 8),
            OrganizerChipSelector(
              options: TournamentSkillLevel.values,
              selected: _category.skillLevel,
              labelBuilder: skillLevelLabel,
              onSelected: (value) => setState(
                () => _category = _category.copyWith(skillLevel: value),
              ),
            ),
            const SizedBox(height: 20),
            const OrganizerSectionLabel('VAGAS & PREÇO'),
            const SizedBox(height: 12),
            OrganizerNumericStepper(
              valueLabel: spotsUnitLabel(_category.dispute, _category.spots),
              minReached: _category.spots <= 2,
              onDecrement: () => setState(
                () => _category = _category.copyWith(spots: _category.spots - 1),
              ),
              onIncrement: () => setState(
                () => _category = _category.copyWith(spots: _category.spots + 1),
              ),
            ),
            const SizedBox(height: 12),
            OrganizerToggleSettingRow(
              icon: Icons.account_balance_wallet_outlined,
              title: 'Usar preço padrão do torneio',
              subtitle:
                  '${formatCents(ref.read(tournamentCreateDraftProvider).defaultPriceCents)} por ${categoryDisputeShort(_category.dispute).toLowerCase()}',
              value: _category.useDefaultPrice,
              onChanged: (value) {
                final defaultPrice =
                    ref.read(tournamentCreateDraftProvider).defaultPriceCents;
                setState(
                  () => _category = _category.copyWith(
                    useDefaultPrice: value,
                    priceCents: value ? defaultPrice : _category.priceCents,
                  ),
                );
              },
            ),
            if (!_category.useDefaultPrice) ...[
              const SizedBox(height: 12),
              OrganizerTextField(
                controller: _priceController,
                hintText: '180',
                keyboardType: TextInputType.number,
                onChanged: (value) {
                  final parsed = int.tryParse(value.replaceAll(RegExp(r'[^0-9]'), ''));
                  if (parsed != null) {
                    setState(
                      () => _category =
                          _category.copyWith(priceCents: parsed * 100),
                    );
                  }
                },
              ),
            ],
            const SizedBox(height: 20),
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
                    Text('Salvar categoria', style: TextStyle(fontWeight: FontWeight.w800)),
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
