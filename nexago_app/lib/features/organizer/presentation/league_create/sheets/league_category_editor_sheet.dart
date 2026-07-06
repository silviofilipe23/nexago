import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_create/league_create_providers.dart';
import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../tournament_create/widgets/organizer_category_format_section.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

Future<void> showLeagueCategoryEditorSheet(
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
    builder: (context) => _LeagueCategoryEditorSheet(existing: existing),
  );
}

class _LeagueCategoryEditorSheet extends ConsumerStatefulWidget {
  const _LeagueCategoryEditorSheet({this.existing});

  final TournamentCategoryDraft? existing;

  @override
  ConsumerState<_LeagueCategoryEditorSheet> createState() =>
      _LeagueCategoryEditorSheetState();
}

class _LeagueCategoryEditorSheetState
    extends ConsumerState<_LeagueCategoryEditorSheet> {
  late TournamentCategoryDraft _category;
  late final TextEditingController _nameController;
  late final TextEditingController _priceController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(leagueCreateDraftProvider);
    _category =
        widget.existing ??
        TournamentCategoryDraft(
          id: DateTime.now().microsecondsSinceEpoch.toString(),
          priceCents: draft.defaultPriceCents,
          useDefaultPrice: true,
          dispute: TournamentCategoryDispute.dupla,
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
    final notifier = ref.read(leagueCreateWizardProvider.notifier);
    if (widget.existing != null) {
      notifier.updateCategory(saved);
    } else {
      notifier.addCategory(saved);
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueCreateDraftProvider);
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
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.3,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 32),
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.existing == null
                        ? 'Nova categoria'
                        : 'Editar categoria',
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
            const SizedBox(height: 8),
            Text(
              'Herdada por todas as etapas do circuito.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
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
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.15,
                  ),
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
                    'Fixo em duplas',
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
              horizontalScroll: true,
              options: TournamentAgeBand.values,
              selected: _category.ageBand,
              labelBuilder: ageBandLabel,
              onSelected: (value) => setState(
                () => _category = _category.copyWith(ageBand: value),
              ),
            ),
            const SizedBox(height: 16),
            const OrganizerSectionLabel('NÍVEL'),
            const SizedBox(height: 8),
            OrganizerChipSelector(
              horizontalScroll: true,
              // Escada conforme o esporte da liga (vôlei: 5 níveis).
              options: skillLevelOptionsForSport(
                ref.watch(leagueCreateDraftProvider).sport,
              ),
              selected: _category.skillLevel,
              labelBuilder: skillLevelLabel,
              onSelected: (value) => setState(
                () => _category = _category.copyWith(skillLevel: value),
              ),
            ),
            const SizedBox(height: 20),
            OrganizerCategoryFormatSection(
              bracketSystem: _category.bracketSystem,
              teamsPerGroup: _category.teamsPerGroup,
              qualifiersPerGroup: _category.qualifiersPerGroup,
              onBracketSystemChanged: (system) => setState(
                () => _category = _category.copyWith(bracketSystem: system),
              ),
              onTeamsPerGroupChanged: (value) {
                if (value < 2) return;
                setState(
                  () => _category = _category.copyWith(teamsPerGroup: value),
                );
              },
              onQualifiersPerGroupChanged: (value) {
                if (value < 1) return;
                setState(
                  () =>
                      _category = _category.copyWith(qualifiersPerGroup: value),
                );
              },
            ),
            const SizedBox(height: 20),
            const OrganizerSectionLabel('VAGAS & PREÇO'),
            const SizedBox(height: 12),
            OrganizerNumericStepper(
              valueLabel: spotsUnitLabel(_category.dispute, _category.spots),
              minReached: _category.spots <= 2,
              onDecrement: () => setState(
                () =>
                    _category = _category.copyWith(spots: _category.spots - 1),
              ),
              onIncrement: () => setState(
                () =>
                    _category = _category.copyWith(spots: _category.spots + 1),
              ),
            ),
            const SizedBox(height: 12),
            OrganizerToggleSettingRow(
              icon: Icons.account_balance_wallet_outlined,
              title: 'Usar preço padrão da liga',
              subtitle:
                  '${formatCents(draft.defaultPriceCents)} por ${categoryDisputeShort(_category.dispute).toLowerCase()}',
              value: _category.useDefaultPrice,
              onChanged: (value) {
                setState(
                  () => _category = _category.copyWith(
                    useDefaultPrice: value,
                    priceCents: value
                        ? draft.defaultPriceCents
                        : _category.priceCents,
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
                  final parsed = int.tryParse(
                    value.replaceAll(RegExp(r'[^0-9]'), ''),
                  );
                  if (parsed != null) {
                    setState(
                      () => _category = _category.copyWith(
                        priceCents: parsed * 100,
                      ),
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
                    Text(
                      'Salvar categoria',
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
