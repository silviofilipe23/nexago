import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_discover_logic.dart';
import '../../../domain/athlete_discover_models.dart';
import '../../../domain/athlete_firestore_codes.dart';
import '../../../domain/athlete_profile_options.dart';

const _ufOptions = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

Future<AthleteDiscoverFilters?> showAthleteDiscoverFiltersSheet({
  required BuildContext context,
  required AthleteDiscoverFilters initial,
  required int Function(AthleteDiscoverFilters draft) previewResultCount,
  required List<String> Function(String? stateUf) cityOptionsFor,
}) {
  return showModalBottomSheet<AthleteDiscoverFilters>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return _AthleteDiscoverFiltersSheet(
        initial: initial,
        previewResultCount: previewResultCount,
        cityOptionsFor: cityOptionsFor,
      );
    },
  );
}

class _AthleteDiscoverFiltersSheet extends StatefulWidget {
  const _AthleteDiscoverFiltersSheet({
    required this.initial,
    required this.previewResultCount,
    required this.cityOptionsFor,
  });

  final AthleteDiscoverFilters initial;
  final int Function(AthleteDiscoverFilters draft) previewResultCount;
  final List<String> Function(String? stateUf) cityOptionsFor;

  @override
  State<_AthleteDiscoverFiltersSheet> createState() =>
      _AthleteDiscoverFiltersSheetState();
}

class _AthleteDiscoverFiltersSheetState
    extends State<_AthleteDiscoverFiltersSheet> {
  String? _sportId;
  late Set<String> _levels;
  late AthleteDiscoverGenderFilter _gender;
  late bool _lookingForPartner;
  late bool _completeProfile;
  String? _stateUf;
  String? _city;

  static const _levelOptions = AthleteProfileOptions.levels;

  @override
  void initState() {
    super.initState();
    final f = widget.initial;
    _sportId = f.sportFirestoreId;
    _levels = Set<String>.from(f.levels);
    _gender = f.gender;
    _lookingForPartner = f.lookingForPartnerOnly;
    _completeProfile = f.completeProfileOnly;
    _stateUf = f.stateUf;
    _city = f.city;
  }

  void _clear() {
    setState(() {
      _sportId = null;
      _levels = {};
      _gender = AthleteDiscoverGenderFilter.all;
      _lookingForPartner = false;
      _completeProfile = false;
      _stateUf = null;
      _city = null;
    });
  }

  AthleteDiscoverFilters _draft() {
    return widget.initial.copyWith(
      sportFirestoreId: _sportId,
      levels: _levels,
      gender: _gender,
      lookingForPartnerOnly: _lookingForPartner,
      completeProfileOnly: _completeProfile,
      stateUf: _stateUf,
      city: _city,
    );
  }

  void _apply() => Navigator.pop(context, _draft());

  @override
  Widget build(BuildContext context) {
    final count = widget.previewResultCount(_draft());
    final theme = Theme.of(context);
    final bottom = MediaQuery.paddingOf(context).bottom;
    final sports = discoverSportFilterOptions();

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.88,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return Column(
            children: [
              SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.35,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
                child: Row(
                  children: [
                    Text(
                      'Filtros',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    Spacer(),
                    TextButton(
                      onPressed: _clear,
                      child: Text(
                        'Limpar',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.brand,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  children: [
                    const _SectionLabel(label: 'ESPORTE'),
                    _ChipWrap(
                      options: sports,
                      selectedLabel: _sportId == null
                          ? null
                          : AthleteFirestoreCodes.sportFirestoreToLabel(
                              _sportId!,
                            ),
                      onToggle: (label) {
                        setState(() {
                          final id = sportFirestoreIdForLabel(label);
                          _sportId = _sportId == id ? null : id;
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'NÍVEL'),
                    _ChipWrap(
                      options: _levelOptions,
                      multiSelected: _levels,
                      onToggle: (label) {
                        setState(() {
                          if (_levels.contains(label)) {
                            _levels.remove(label);
                          } else {
                            _levels.add(label);
                          }
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'GÊNERO'),
                    _ChipWrap(
                      options: const ['Todos', 'Masculino', 'Feminino'],
                      selectedLabel: switch (_gender) {
                        AthleteDiscoverGenderFilter.all => 'Todos',
                        AthleteDiscoverGenderFilter.male => 'Masculino',
                        AthleteDiscoverGenderFilter.female => 'Feminino',
                      },
                      onToggle: (label) {
                        setState(() {
                          _gender = switch (label) {
                            'Masculino' => AthleteDiscoverGenderFilter.male,
                            'Feminino' => AthleteDiscoverGenderFilter.female,
                            _ => AthleteDiscoverGenderFilter.all,
                          };
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'LOCALIZAÇÃO'),
                    _ChipWrap(
                      options: _ufOptions,
                      selectedLabel: _stateUf,
                      onToggle: (label) {
                        setState(() {
                          if (_stateUf == label) {
                            _stateUf = null;
                          } else {
                            _stateUf = label;
                          }
                          // Cidade pertence a uma UF: trocar de UF invalida.
                          _city = null;
                        });
                      },
                    ),
                    if (_stateUf != null) ...[
                      const SizedBox(height: 12),
                      Builder(
                        builder: (context) {
                          final cities = widget.cityOptionsFor(_stateUf);
                          if (cities.isEmpty) {
                            return Text(
                              'Nenhuma cidade no catálogo desta UF.',
                              style: AppTypography.mono(
                                fontSize: 11,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            );
                          }
                          return _ChipWrap(
                            options: cities,
                            selectedLabel: _city,
                            onToggle: (label) => setState(
                              () => _city = _city == label ? null : label,
                            ),
                          );
                        },
                      ),
                    ],
                    SizedBox(height: 20),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Procurando dupla'),
                      value: _lookingForPartner,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _lookingForPartner = v),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Perfil completo'),
                      value: _completeProfile,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _completeProfile = v),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: context.themeColors.surfaceRaised),
                  ),
                ),
                child: FilledButton(
                  onPressed: _apply,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(28),
                    ),
                  ),
                  child: Text(
                    'Ver $count atletas',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: context.themeColors.onSurfaceMuted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _ChipWrap extends StatelessWidget {
  const _ChipWrap({
    required this.options,
    required this.onToggle,
    this.selectedLabel,
    this.multiSelected = const {},
  });

  final List<String> options;
  final String? selectedLabel;
  final Set<String> multiSelected;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((label) {
        final selected = multiSelected.isNotEmpty
            ? multiSelected.contains(label)
            : selectedLabel == label;
        return _FilterChip(
          label: label,
          selected: selected,
          onTap: () => onToggle(label),
        );
      }).toList(),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
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
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.14)
                : context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? AppColors.brand : Colors.transparent,
              width: 1.5,
            ),
          ),
          child: AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: selected ? AppColors.brand : context.themeColors.onSurface,
            ),
            child: Text(label),
          ),
        ),
      ),
    );
  }
}
