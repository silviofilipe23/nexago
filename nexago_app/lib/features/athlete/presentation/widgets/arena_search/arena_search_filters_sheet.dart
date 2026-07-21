import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/arena_amenities.dart';
import '../../../../arenas/domain/arena_search_filters.dart';
import '../../../../arenas/domain/arena_search_metadata.dart';

const _surfaceOptions = ArenaSearchMetadata.surfaceOptions;

const _selectablePayments = [
  ArenaPaymentFilter.onsite,
  ArenaPaymentFilter.pix,
  ArenaPaymentFilter.card,
];

Future<ArenaSearchFilters?> showArenaSearchFiltersSheet({
  required BuildContext context,
  required ArenaSearchFilters initial,
  required int Function(ArenaSearchFilters draft) previewResultCount,
}) {
  return showModalBottomSheet<ArenaSearchFilters>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return _ArenaSearchFiltersSheet(
        initial: initial,
        previewResultCount: previewResultCount,
      );
    },
  );
}

class _ArenaSearchFiltersSheet extends StatefulWidget {
  const _ArenaSearchFiltersSheet({
    required this.initial,
    required this.previewResultCount,
  });

  final ArenaSearchFilters initial;
  final int Function(ArenaSearchFilters draft) previewResultCount;

  @override
  State<_ArenaSearchFiltersSheet> createState() =>
      _ArenaSearchFiltersSheetState();
}

class _ArenaSearchFiltersSheetState extends State<_ArenaSearchFiltersSheet> {
  late double _radiusKm;
  late bool _unlimitedRadius;
  late ArenaPriceBand _priceBand;
  late Set<String> _surfaces;
  late ArenaAmenities _amenities;
  late Set<ArenaPaymentFilter> _paymentMethods;
  late double _minScore;

  @override
  void initState() {
    super.initState();
    final f = widget.initial;
    _unlimitedRadius = !f.usesRadiusLimit;
    _radiusKm = f.usesRadiusLimit
        ? f.radiusKm.clamp(1.0, ArenaSearchFilters.maxRadiusKm)
        : ArenaSearchFilters.defaultRadiusKm;
    _priceBand = f.priceBand;
    _surfaces = Set<String>.from(f.surfaces);
    _amenities = f.requiredAmenities;
    _paymentMethods = Set<ArenaPaymentFilter>.from(f.paymentMethods);
    _minScore = f.minReputationScore.toDouble();
  }

  void _clear() {
    setState(() {
      _unlimitedRadius = false;
      _radiusKm = ArenaSearchFilters.defaultRadiusKm;
      _priceBand = ArenaPriceBand.any;
      _surfaces = {};
      _amenities = ArenaAmenities.empty;
      _paymentMethods = {};
      _minScore = 0;
    });
  }

  ArenaSearchFilters _draftFilters() {
    return widget.initial.copyWith(
      radiusKm: _unlimitedRadius
          ? ArenaSearchFilters.unlimitedRadiusKm
          : _radiusKm,
      priceBand: _priceBand,
      surfaces: _surfaces,
      requiredAmenities: _amenities,
      paymentMethods: _paymentMethods,
      minReputationScore: _minScore.round(),
    );
  }

  void _apply() {
    Navigator.pop(context, _draftFilters());
  }

  @override
  Widget build(BuildContext context) {
    final resultCount = widget.previewResultCount(_draftFilters());
    final theme = Theme.of(context);
    final bottom = MediaQuery.paddingOf(context).bottom;

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
              const _SheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
                child: Row(
                  children: [
                    Text(
                      'Filtros',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    Spacer(),
                    TextButton(
                      onPressed: _clear,
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.brand,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                      child: Text(
                        'Limpar',
                        style: TextStyle(fontWeight: FontWeight.w800),
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
                    const _SectionLabel(label: 'RAIO DE BUSCA'),
                    _RadiusSlider(
                      value: _radiusKm,
                      unlimited: _unlimitedRadius,
                      onUnlimitedChanged: (v) =>
                          setState(() => _unlimitedRadius = v),
                      onChanged: (v) => setState(() {
                        _unlimitedRadius = false;
                        _radiusKm = v;
                      }),
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'FAIXA DE PREÇO · POR HORA'),
                    _PriceBandRow(
                      selected: _priceBand,
                      onSelected: (b) => setState(() => _priceBand = b),
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'SUPERFÍCIE'),
                    _ChipWrap(
                      options: _surfaceOptions,
                      selected: _surfaces,
                      showCheckmark: true,
                      onToggle: (label) {
                        setState(() {
                          if (_surfaces.contains(label)) {
                            _surfaces.remove(label);
                          } else {
                            _surfaces.add(label);
                          }
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'COMODIDADES'),
                    _AmenityChips(
                      amenities: _amenities,
                      onChanged: (a) => setState(() => _amenities = a),
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'PAGAMENTO'),
                    _PaymentChips(
                      selected: _paymentMethods,
                      onToggle: (filter) {
                        setState(() {
                          if (_paymentMethods.contains(filter)) {
                            _paymentMethods.remove(filter);
                          } else {
                            _paymentMethods.add(filter);
                          }
                        });
                      },
                    ),
                    SizedBox(height: 20),
                    const _SectionLabel(label: 'SCORE NEXAGO MÍNIMO'),
                    _ScoreSlider(
                      value: _minScore,
                      onChanged: (v) => setState(() => _minScore = v),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: AppColors.surfaceRaised),
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
                    'Mostrar $resultCount arenas',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
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

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(999),
        ),
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
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: AppColors.onSurfaceMuted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

SliderThemeData _filterSliderTheme() {
  return SliderThemeData(
    trackHeight: 4,
    activeTrackColor: AppColors.brand,
    inactiveTrackColor: AppColors.surfaceRaised,
    thumbColor: AppColors.brand,
    overlayColor: AppColors.brand.withValues(alpha: 0.12),
    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 9),
  );
}

class _RadiusSlider extends StatelessWidget {
  const _RadiusSlider({
    required this.value,
    required this.unlimited,
    required this.onUnlimitedChanged,
    required this.onChanged,
  });

  final double value;
  final bool unlimited;
  final ValueChanged<bool> onUnlimitedChanged;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.labelSmall?.copyWith(
      color: AppColors.onSurfaceMuted,
      fontWeight: FontWeight.w600,
    );
    final sliderValue = unlimited
        ? ArenaSearchFilters.maxRadiusKm
        : value.clamp(1.0, ArenaSearchFilters.maxRadiusKm);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: unlimited,
          onChanged: onUnlimitedChanged,
          activeThumbColor: AppColors.brand,
          title: Text(
            'Sem limite de distância',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
        ),
        Row(
          children: [
            Text('1 km', style: muted),
            Spacer(),
            Text('${ArenaSearchFilters.maxRadiusKm.toInt()} km', style: muted),
          ],
        ),
        SliderTheme(
          data: _filterSliderTheme(),
          child: Slider(
            value: sliderValue,
            min: 1,
            max: ArenaSearchFilters.maxRadiusKm,
            divisions: 29,
            onChanged: unlimited ? null : onChanged,
          ),
        ),
        Text(
          unlimited ? 'Qualquer distância' : 'até ${value.round()} km',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.brand,
          ),
        ),
      ],
    );
  }
}

class _ScoreSlider extends StatelessWidget {
  const _ScoreSlider({required this.value, required this.onChanged});

  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.labelSmall?.copyWith(
      color: AppColors.onSurfaceMuted,
      fontWeight: FontWeight.w600,
    );
    final rounded = value.round();
    final valueLabel = rounded >= 80 ? '$rounded+' : '$rounded';

    return Column(
      children: [
        Row(
          children: [
            Text('0', style: muted),
            Spacer(),
            Text(
              valueLabel,
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
          ],
        ),
        SliderTheme(
          data: _filterSliderTheme(),
          child: Slider(
            value: value,
            min: 0,
            max: 100,
            divisions: 20,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}

class _ArenaFilterChip extends StatelessWidget {
  const _ArenaFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.showCheckmark = false,
  });

  final String label;
  final bool selected;
  final bool showCheckmark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textStyle = TextStyle(
      fontWeight: FontWeight.w700,
      fontSize: 13,
      color: selected ? AppColors.brand : AppColors.onSurface,
    );

    return Material(
      color: selected ? Colors.transparent : AppColors.surfaceRaised,
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
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showCheckmark && selected) ...[
                Icon(Icons.check_rounded, size: 16, color: AppColors.brand),
                SizedBox(width: 4),
              ],
              Text(label, style: textStyle),
            ],
          ),
        ),
      ),
    );
  }
}

class _PriceBandRow extends StatelessWidget {
  const _PriceBandRow({required this.selected, required this.onSelected});

  final ArenaPriceBand selected;
  final ValueChanged<ArenaPriceBand> onSelected;

  @override
  Widget build(BuildContext context) {
    const bands = [
      (ArenaPriceBand.upTo60, 'até R\$ 60'),
      (ArenaPriceBand.band60_100, 'R\$ 60-100'),
      (ArenaPriceBand.band100_150, 'R\$ 100-150'),
      (ArenaPriceBand.plus150, '150+'),
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: bands.map((entry) {
        final (band, label) = entry;
        final isSelected = selected == band;
        return _ArenaFilterChip(
          label: label,
          selected: isSelected,
          onTap: () => onSelected(isSelected ? ArenaPriceBand.any : band),
        );
      }).toList(),
    );
  }
}

class _ChipWrap extends StatelessWidget {
  const _ChipWrap({
    required this.options,
    required this.selected,
    required this.onToggle,
    this.showCheckmark = false,
  });

  final List<String> options;
  final Set<String> selected;
  final bool showCheckmark;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((label) {
        final isSelected = selected.contains(label);
        return _ArenaFilterChip(
          label: label,
          selected: isSelected,
          showCheckmark: showCheckmark,
          onTap: () => onToggle(label),
        );
      }).toList(),
    );
  }
}

class _AmenityChips extends StatelessWidget {
  const _AmenityChips({required this.amenities, required this.onChanged});

  final ArenaAmenities amenities;
  final ValueChanged<ArenaAmenities> onChanged;

  static const _items = [
    ('Coberta', 'coveredCourt'),
    ('Estacion.', 'parking'),
    ('Vestiário', 'lockerRoom'),
    ('Bar', 'bar'),
    ('Aluguel raquetes', 'racketRental'),
    ('Quadra acessível', 'hasAccessibleCourt'),
    ('Banheiro acessível', 'hasAccessibleBathroom'),
    ('Vaga PCD', 'hasPcdParking'),
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _items.map((entry) {
        final (label, key) = entry;
        final isSelected = switch (key) {
          'parking' => amenities.parking,
          'lockerRoom' => amenities.lockerRoom,
          'coveredCourt' => amenities.coveredCourt,
          'bar' => amenities.bar,
          'racketRental' => amenities.racketRental,
          'hasAccessibleCourt' => amenities.hasAccessibleCourt,
          'hasAccessibleBathroom' => amenities.hasAccessibleBathroom,
          _ => amenities.hasPcdParking,
        };
        return _ArenaFilterChip(
          label: label,
          selected: isSelected,
          onTap: () {
            switch (key) {
              case 'parking':
                onChanged(amenities.copyWith(parking: !amenities.parking));
              case 'lockerRoom':
                onChanged(
                  amenities.copyWith(lockerRoom: !amenities.lockerRoom),
                );
              case 'coveredCourt':
                onChanged(
                  amenities.copyWith(coveredCourt: !amenities.coveredCourt),
                );
              case 'bar':
                onChanged(amenities.copyWith(bar: !amenities.bar));
              case 'racketRental':
                onChanged(
                  amenities.copyWith(racketRental: !amenities.racketRental),
                );
              case 'hasAccessibleCourt':
                onChanged(
                  amenities.copyWith(
                    hasAccessibleCourt: !amenities.hasAccessibleCourt,
                  ),
                );
              case 'hasAccessibleBathroom':
                onChanged(
                  amenities.copyWith(
                    hasAccessibleBathroom: !amenities.hasAccessibleBathroom,
                  ),
                );
              default:
                onChanged(
                  amenities.copyWith(hasPcdParking: !amenities.hasPcdParking),
                );
            }
          },
        );
      }).toList(),
    );
  }
}

class _PaymentChips extends StatelessWidget {
  const _PaymentChips({required this.selected, required this.onToggle});

  final Set<ArenaPaymentFilter> selected;
  final ValueChanged<ArenaPaymentFilter> onToggle;

  static const _labels = {
    ArenaPaymentFilter.onsite: 'Pagar na arena',
    ArenaPaymentFilter.pix: 'PIX',
    ArenaPaymentFilter.card: 'Cartão',
  };

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _selectablePayments.map((filter) {
        final isSelected = selected.contains(filter);
        return _ArenaFilterChip(
          label: _labels[filter]!,
          selected: isSelected,
          onTap: () => onToggle(filter),
        );
      }).toList(),
    );
  }
}
