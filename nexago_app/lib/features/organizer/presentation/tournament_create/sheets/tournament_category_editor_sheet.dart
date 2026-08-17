import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../widgets/organizer_category_format_section.dart';
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
  late final TextEditingController _ageMinController;
  late final TextEditingController _ageMaxController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(tournamentCreateDraftProvider);
    _category =
        widget.existing ??
        TournamentCategoryDraft(
          id: DateTime.now().microsecondsSinceEpoch.toString(),
          priceCents: draft.defaultPriceCents,
          useDefaultPrice: true,
        );
    _nameController = TextEditingController(text: _category.name);
    _priceController = TextEditingController(
      text: formatCents(_category.priceCents).replaceAll(r'R$', '').trim(),
    );
    _ageMinController = TextEditingController(
      text: _category.ageMinYears?.toString() ?? '',
    );
    _ageMaxController = TextEditingController(
      text: _category.ageMaxYears?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _priceController.dispose();
    _ageMinController.dispose();
    _ageMaxController.dispose();
    super.dispose();
  }

  void _save() {
    final name = _nameController.text.trim().isEmpty
        ? suggestCategoryName(_category)
        : _nameController.text.trim();
    // A disputa carregada é preservada: o editor do app não oferece o seletor,
    // mas uma categoria trio/quarteto/quinteto criada no portal não pode ser
    // rebaixada para dupla ao reeditar qualquer outro campo.
    final saved = _category.copyWith(name: name);
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
    final media = MediaQuery.of(context);
    final bottom = media.viewInsets.bottom;
    final maxHeight = media.size.height - media.padding.top - 12;

    return SafeArea(
      bottom: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
          child: SingleChildScrollView(
            clipBehavior: Clip.none,
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
                  onSelected: (value) => setState(
                    () => _category = _category.copyWith(gender: value),
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
                const SizedBox(height: 12),
                _AgeRestrictionSection(
                  category: _category,
                  minController: _ageMinController,
                  maxController: _ageMaxController,
                  onReferenceChanged: (ref) => setState(
                    () => _category = _category.copyWith(ageReference: ref),
                  ),
                  onCustomToggled: (enabled) => setState(
                    () => _category =
                        _category.copyWith(ageCustomEnabled: enabled),
                  ),
                  onMinChanged: (value) => setState(
                    () => _category = _category.copyWith(
                      ageMinYears: value,
                      clearAgeMinYears: value == null,
                    ),
                  ),
                  onMaxChanged: (value) => setState(
                    () => _category = _category.copyWith(
                      ageMaxYears: value,
                      clearAgeMaxYears: value == null,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const OrganizerSectionLabel('NÍVEL'),
                const SizedBox(height: 8),
                OrganizerChipSelector(
                  horizontalScroll: true,
                  // Escada única de 7 níveis para todos os esportes.
                  options: skillLevelOptionsForSport(
                    ref.watch(tournamentCreateDraftProvider).sport,
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
                      () =>
                          _category = _category.copyWith(teamsPerGroup: value),
                    );
                  },
                  onQualifiersPerGroupChanged: (value) {
                    if (value < 1) return;
                    setState(
                      () => _category = _category.copyWith(
                        qualifiersPerGroup: value,
                      ),
                    );
                  },
                ),
                const SizedBox(height: 20),
                const OrganizerSectionLabel('VAGAS & PREÇO'),
                const SizedBox(height: 12),
                OrganizerNumericStepper(
                  valueLabel: spotsUnitLabel(
                    _category.dispute,
                    _category.spots,
                  ),
                  minReached: _category.spots <= 2,
                  onDecrement: () => setState(
                    () => _category = _category.copyWith(
                      spots: _category.spots - 1,
                    ),
                  ),
                  onIncrement: () => setState(
                    () => _category = _category.copyWith(
                      spots: _category.spots + 1,
                    ),
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
                    final defaultPrice = ref
                        .read(tournamentCreateDraftProvider)
                        .defaultPriceCents;
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
        ),
      ),
    );
  }
}

/// Referência da idade + restrição personalizada (mín/máx/faixa).
class _AgeRestrictionSection extends StatelessWidget {
  const _AgeRestrictionSection({
    required this.category,
    required this.minController,
    required this.maxController,
    required this.onReferenceChanged,
    required this.onCustomToggled,
    required this.onMinChanged,
    required this.onMaxChanged,
  });

  final TournamentCategoryDraft category;
  final TextEditingController minController;
  final TextEditingController maxController;
  final ValueChanged<TournamentAgeReference> onReferenceChanged;
  final ValueChanged<bool> onCustomToggled;
  final ValueChanged<int?> onMinChanged;
  final ValueChanged<int?> onMaxChanged;

  int? _parseAge(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    return digits.isEmpty ? null : int.tryParse(digits);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OrganizerSectionLabel('REFERÊNCIA DA IDADE'),
        const SizedBox(height: 8),
        DropdownButtonFormField<TournamentAgeReference>(
          initialValue: category.ageReference,
          isExpanded: true,
          decoration: InputDecoration(
            filled: true,
            fillColor: context.themeColors.surfaceCard,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color:
                    context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
          ),
          items: [
            for (final ref in TournamentAgeReference.values)
              DropdownMenuItem(value: ref, child: Text(ageReferenceLabel(ref))),
          ],
          onChanged: (value) {
            if (value != null) onReferenceChanged(value);
          },
        ),
        const SizedBox(height: 8),
        OrganizerToggleSettingRow(
          icon: Icons.tune_rounded,
          title: 'Personalizar restrição de idade',
          subtitle: 'Defina idade mínima, máxima ou faixa (sobrepõe o preset).',
          value: category.ageCustomEnabled,
          onChanged: onCustomToggled,
        ),
        if (category.ageCustomEnabled) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const OrganizerSectionLabel('IDADE MÍNIMA'),
                    const SizedBox(height: 8),
                    OrganizerTextField(
                      controller: minController,
                      hintText: 'ex.: 18',
                      keyboardType: TextInputType.number,
                      onChanged: (v) => onMinChanged(_parseAge(v)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const OrganizerSectionLabel('IDADE MÁXIMA'),
                    const SizedBox(height: 8),
                    OrganizerTextField(
                      controller: maxController,
                      hintText: 'ex.: 35',
                      keyboardType: TextInputType.number,
                      onChanged: (v) => onMaxChanged(_parseAge(v)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
