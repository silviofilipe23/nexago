import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_discover_logic.dart';
import '../../../../athlete/domain/athlete_firestore_codes.dart';
import '../../../domain/team_discover_logic.dart';
import '../../../domain/team_discover_models.dart';

Future<TeamDiscoverFilters?> showTeamDiscoverFiltersSheet({
  required BuildContext context,
  required TeamDiscoverFilters initial,
  required int Function(TeamDiscoverFilters draft) previewResultCount,
}) {
  return showModalBottomSheet<TeamDiscoverFilters>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return _TeamDiscoverFiltersSheet(
        initial: initial,
        previewResultCount: previewResultCount,
      );
    },
  );
}

class _TeamDiscoverFiltersSheet extends StatefulWidget {
  const _TeamDiscoverFiltersSheet({
    required this.initial,
    required this.previewResultCount,
  });

  final TeamDiscoverFilters initial;
  final int Function(TeamDiscoverFilters draft) previewResultCount;

  @override
  State<_TeamDiscoverFiltersSheet> createState() =>
      _TeamDiscoverFiltersSheetState();
}

class _TeamDiscoverFiltersSheetState extends State<_TeamDiscoverFiltersSheet> {
  String? _sportId;
  late TeamDiscoverGenderFilter _gender;
  late TeamDiscoverPartnershipFilter _partnership;
  late double _distanceKm;
  late bool _unlimitedDistance;
  late bool _availableNow;
  late bool _trendingOnly;
  late bool _sameRankingRange;

  @override
  void initState() {
    super.initState();
    final f = widget.initial;
    _sportId = f.sportFirestoreId;
    _gender = f.gender;
    _partnership = f.partnership;
    _distanceKm = f.maxDistanceKm.clamp(5, 100);
    _unlimitedDistance = f.unlimitedDistance;
    _availableNow = f.availableNowOnly;
    _trendingOnly = f.trendingOnly;
    _sameRankingRange = f.sameRankingRangeOnly;
  }

  void _clear() {
    setState(() {
      _sportId = null;
      _gender = TeamDiscoverGenderFilter.all;
      _partnership = TeamDiscoverPartnershipFilter.all;
      _distanceKm = 50;
      _unlimitedDistance = true;
      _availableNow = false;
      _trendingOnly = false;
      _sameRankingRange = false;
    });
  }

  TeamDiscoverFilters _draft() {
    return widget.initial.copyWith(
      sportFirestoreId: _sportId,
      gender: _gender,
      partnership: _partnership,
      maxDistanceKm: _distanceKm,
      unlimitedDistance: _unlimitedDistance,
      availableNowOnly: _availableNow,
      trendingOnly: _trendingOnly,
      sameRankingRangeOnly: _sameRankingRange,
    );
  }

  void _apply() => Navigator.pop(context, _draft());

  @override
  Widget build(BuildContext context) {
    final count = widget.previewResultCount(_draft());
    final theme = Theme.of(context);
    final bottom = MediaQuery.paddingOf(context).bottom;
    final sports = teamDiscoverSportFilterOptions();

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
                    const _SectionLabel(label: 'GÊNERO DA DUPLA'),
                    _ChipWrap(
                      options: const [
                        'Todos',
                        'Masculino',
                        'Feminino',
                        'Misto',
                      ],
                      selectedLabel: switch (_gender) {
                        TeamDiscoverGenderFilter.all => 'Todos',
                        TeamDiscoverGenderFilter.male => 'Masculino',
                        TeamDiscoverGenderFilter.female => 'Feminino',
                        TeamDiscoverGenderFilter.mixed => 'Misto',
                      },
                      onToggle: (label) {
                        setState(() {
                          _gender = switch (label) {
                            'Masculino' => TeamDiscoverGenderFilter.male,
                            'Feminino' => TeamDiscoverGenderFilter.female,
                            'Misto' => TeamDiscoverGenderFilter.mixed,
                            _ => TeamDiscoverGenderFilter.all,
                          };
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'STATUS DA PARCERIA'),
                    _ChipWrap(
                      options: const ['Todos', 'Ativa', 'Procura dupla'],
                      selectedLabel: switch (_partnership) {
                        TeamDiscoverPartnershipFilter.all => 'Todos',
                        TeamDiscoverPartnershipFilter.active => 'Ativa',
                        TeamDiscoverPartnershipFilter.lookingForPartner =>
                          'Procura dupla',
                      },
                      onToggle: (label) {
                        setState(() {
                          _partnership = switch (label) {
                            'Ativa' => TeamDiscoverPartnershipFilter.active,
                            'Procura dupla' =>
                              TeamDiscoverPartnershipFilter.lookingForPartner,
                            _ => TeamDiscoverPartnershipFilter.all,
                          };
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
                        'Algum atleta online nos últimos 15 min',
                        style: TextStyle(fontSize: 11),
                      ),
                      value: _availableNow,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _availableNow = v),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Em alta'),
                      subtitle: Text(
                        'Ordena por pontos de ranking',
                        style: TextStyle(fontSize: 11),
                      ),
                      value: _trendingOnly,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _trendingOnly = v),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Faixa de ranking similar'),
                      subtitle: Text(
                        'Compara com a dupla do seu perfil',
                        style: TextStyle(fontSize: 11),
                      ),
                      value: _sameRankingRange,
                      activeThumbColor: AppColors.brand,
                      onChanged: (v) => setState(() => _sameRankingRange = v),
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
                    'Ver $count duplas',
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
  });

  final List<String> options;
  final String? selectedLabel;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((label) {
        final selected = selectedLabel == label;
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
