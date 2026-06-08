import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_discover_logic.dart';
import '../../../domain/athlete_discover_models.dart';
import '../../../domain/athlete_firestore_codes.dart';

Future<AthleteDiscoverFilters?> showAthleteDiscoverFiltersSheet({
  required BuildContext context,
  required AthleteDiscoverFilters initial,
  required int Function(AthleteDiscoverFilters draft) previewResultCount,
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
      );
    },
  );
}

class _AthleteDiscoverFiltersSheet extends StatefulWidget {
  const _AthleteDiscoverFiltersSheet({
    required this.initial,
    required this.previewResultCount,
  });

  final AthleteDiscoverFilters initial;
  final int Function(AthleteDiscoverFilters draft) previewResultCount;

  @override
  State<_AthleteDiscoverFiltersSheet> createState() =>
      _AthleteDiscoverFiltersSheetState();
}

class _AthleteDiscoverFiltersSheetState
    extends State<_AthleteDiscoverFiltersSheet> {
  String? _sportId;
  late Set<String> _categories;
  late AthleteDiscoverGenderFilter _gender;
  AthleteDiscoverGameObjective? _objective;
  late double _distanceKm;
  late bool _unlimitedDistance;
  late bool _availableNow;
  late bool _lookingForPartner;
  late bool _completeProfile;

  static const _categoryOptions = ['Cat A', 'Cat B', 'Cat C', 'PRO'];

  @override
  void initState() {
    super.initState();
    final f = widget.initial;
    _sportId = f.sportFirestoreId;
    _categories = Set<String>.from(f.categories);
    _gender = f.gender;
    _objective = f.gameObjective;
    _distanceKm = f.maxDistanceKm.clamp(5, 100);
    _unlimitedDistance = f.unlimitedDistance;
    _availableNow = f.availableNowOnly;
    _lookingForPartner = f.lookingForPartnerOnly;
    _completeProfile = f.completeProfileOnly;
  }

  void _clear() {
    setState(() {
      _sportId = null;
      _categories = {};
      _gender = AthleteDiscoverGenderFilter.all;
      _objective = null;
      _distanceKm = 50;
      _unlimitedDistance = true;
      _availableNow = false;
      _lookingForPartner = false;
      _completeProfile = false;
    });
  }

  AthleteDiscoverFilters _draft() {
    return widget.initial.copyWith(
      sportFirestoreId: _sportId,
      categories: _categories,
      gender: _gender,
      gameObjective: _objective,
      maxDistanceKm: _distanceKm,
      unlimitedDistance: _unlimitedDistance,
      availableNowOnly: _availableNow,
      lookingForPartnerOnly: _lookingForPartner,
      completeProfileOnly: _completeProfile,
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
                    const _SectionLabel(label: 'CATEGORIA'),
                    _ChipWrap(
                      options: _categoryOptions,
                      multiSelected: _categories,
                      onToggle: (label) {
                        setState(() {
                          if (_categories.contains(label)) {
                            _categories.remove(label);
                          } else {
                            _categories.add(label);
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
                    const _SectionLabel(label: 'OBJETIVO DO JOGO'),
                    _ChipWrap(
                      options: const [
                        'Equilibrado',
                        'Treinar (menos intenso)',
                        'Evoluir (mais intenso)',
                      ],
                      selectedLabel: switch (_objective) {
                        AthleteDiscoverGameObjective.balanced => 'Equilibrado',
                        AthleteDiscoverGameObjective.trainDown =>
                          'Treinar (menos intenso)',
                        AthleteDiscoverGameObjective.trainUp =>
                          'Evoluir (mais intenso)',
                        null => null,
                      },
                      onToggle: (label) {
                        setState(() {
                          final next = switch (label) {
                            'Treinar (menos intenso)' =>
                              AthleteDiscoverGameObjective.trainDown,
                            'Evoluir (mais intenso)' =>
                              AthleteDiscoverGameObjective.trainUp,
                            'Equilibrado' =>
                              AthleteDiscoverGameObjective.balanced,
                            _ => null,
                          };
                          _objective = _objective == next ? null : next;
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'DISTÂNCIA'),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Sem limite de distância'),
                      value: _unlimitedDistance,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _unlimitedDistance = v),
                    ),
                    if (!_unlimitedDistance) ...[
                      Text(
                        'Até ${_distanceKm.round()} km (v1: mesma cidade)',
                        style: AppTypography.mono(
                          fontSize: 11,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                      Slider(
                        value: _distanceKm,
                        min: 5,
                        max: 100,
                        divisions: 19,
                        activeColor: AppColors.brand,
                        onChanged: (v) => setState(() => _distanceKm = v),
                      ),
                    ],
                    SizedBox(height: 12),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Disponíveis agora'),
                      subtitle: Text(
                        'Requer lastActiveAt no perfil',
                        style: TextStyle(fontSize: 11),
                      ),
                      value: _availableNow,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _availableNow = v),
                    ),
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
      color: selected ? Colors.transparent : context.themeColors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: selected ? AppColors.brand : Colors.transparent,
          width: 1.5,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: selected ? AppColors.brand : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}
