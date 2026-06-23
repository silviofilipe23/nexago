import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/location/br_locations_data.dart';
import '../../../../core/location/br_locations_provider.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'edit_profile/edit_profile_field_decorations.dart';

/// UF (dropdown) + cidade (campo com busca em lista IBGE).
class BrStateCityFields extends ConsumerStatefulWidget {
  const BrStateCityFields({
    super.key,
    required this.selectedState,
    required this.selectedCity,
    required this.onStateChanged,
    required this.onCityChanged,
    this.stateValidator,
    this.cityValidator,
    this.useEditProfileStyle = false,
    this.useOrganizerFormStyle = false,
  });

  final String? selectedState;
  final String? selectedCity;
  final ValueChanged<String?> onStateChanged;
  final ValueChanged<String?> onCityChanged;
  final FormFieldValidator<String>? stateValidator;
  final FormFieldValidator<String>? cityValidator;
  final bool useEditProfileStyle;
  final bool useOrganizerFormStyle;

  @override
  ConsumerState<BrStateCityFields> createState() => _BrStateCityFieldsState();
}

class _BrStateCityFieldsState extends ConsumerState<BrStateCityFields> {
  late final TextEditingController _cityCtrl;

  @override
  void initState() {
    super.initState();
    _cityCtrl = TextEditingController(text: widget.selectedCity ?? '');
  }

  @override
  void didUpdateWidget(BrStateCityFields oldWidget) {
    super.didUpdateWidget(oldWidget);
    final city = widget.selectedCity ?? '';
    if (city != _cityCtrl.text) {
      _cityCtrl.text = city;
    }
  }

  @override
  void dispose() {
    _cityCtrl.dispose();
    super.dispose();
  }

  InputDecoration _organizerFormDecoration(
    BuildContext context, {
    String? hintText,
    Widget? suffixIcon,
  }) {
    final borderColor =
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.15);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: borderColor),
    );

    return InputDecoration(
      hintText: hintText,
      filled: true,
      fillColor: context.themeColors.surfaceCard,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: border,
      enabledBorder: border,
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
      ),
      suffixIcon: suffixIcon,
    );
  }

  TextStyle? _organizerFieldTextStyle(BuildContext context) {
    return Theme.of(context).textTheme.bodyLarge?.copyWith(
          fontWeight: FontWeight.w600,
        );
  }

  Future<void> _openCitySearch(BrLocationsData data) async {
    final uf = widget.selectedState?.trim().toUpperCase();
    if (uf == null || uf.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Selecione o estado antes da cidade.'),
          backgroundColor: AppColors.pending,
        ),
      );
      return;
    }

    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _CitySearchSheet(
        data: data,
        uf: uf,
        initialQuery: _cityCtrl.text,
      ),
    );

    if (picked != null && picked.isNotEmpty) {
      _cityCtrl.text = picked;
      widget.onCityChanged(picked);
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final locationsAsync = ref.watch(brLocationsDataProvider);

    return locationsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.brand,
            ),
          ),
        ),
      ),
      error: (e, _) => Text(
        'Não foi possível carregar cidades: $e',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.live,
            ),
      ),
      data: (data) {
        final uf = widget.selectedState?.trim().toUpperCase();
        final stateItem = data.stateBySigla(uf);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              key: ValueKey<String>('uf_$uf'),
              initialValue: stateItem?.sigla,
              isExpanded: true,
              style: widget.useOrganizerFormStyle
                  ? _organizerFieldTextStyle(context)
                  : null,
              decoration: widget.useEditProfileStyle
                  ? editProfileInputDecoration(
                      context: context,
                      label: 'ESTADO',
                      required: true,
                    )
                  : widget.useOrganizerFormStyle
                      ? _organizerFormDecoration(context)
                      : const InputDecoration(
                          labelText: 'Estado',
                          border: OutlineInputBorder(),
                        ),
              hint: widget.useOrganizerFormStyle
                  ? Text(
                      'Selecione o estado',
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                    )
                  : null,
              items: BrLocationsData.states
                  .map(
                    (s) => DropdownMenuItem(
                      value: s.sigla,
                      child: Text(s.label),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                widget.onStateChanged(value);
                _cityCtrl.clear();
                widget.onCityChanged(null);
                setState(() {});
              },
              validator: widget.stateValidator ??
                  (v) {
                    if (v == null || v.isEmpty) return 'Selecione o estado';
                    return null;
                  },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _cityCtrl,
              readOnly: true,
              style: widget.useOrganizerFormStyle
                  ? _organizerFieldTextStyle(context)
                  : null,
              onTap: () => _openCitySearch(data),
              decoration: widget.useEditProfileStyle
                  ? editProfileInputDecoration(
                      context: context,
                      label: 'CIDADE',
                      required: true,
                      hintText:
                          uf == null ? 'Selecione o estado' : 'Buscar cidade',
                      prefixIcon: Icon(
                        Icons.location_on_outlined,
                        size: 20,
                        color: uf == null
                            ? context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.4)
                            : context.themeColors.onSurfaceMuted,
                      ),
                      suffixIcon: Icon(
                        Icons.search_rounded,
                        color: uf == null
                            ? context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.4)
                            : AppColors.brand,
                      ),
                    )
                  : widget.useOrganizerFormStyle
                      ? _organizerFormDecoration(
                          context,
                          hintText: uf == null
                              ? 'Selecione o estado'
                              : 'Buscar cidade',
                          suffixIcon: Icon(
                            Icons.search_rounded,
                            color: uf == null
                                ? context.themeColors.onSurfaceMuted
                                    .withValues(alpha: 0.4)
                                : AppColors.brand,
                          ),
                        )
                      : InputDecoration(
                          labelText: 'Cidade',
                          hintText: uf == null
                              ? 'Selecione o estado'
                              : 'Buscar cidade',
                          border: const OutlineInputBorder(),
                          suffixIcon: Icon(
                            Icons.search_rounded,
                            color: uf == null
                                ? context.themeColors.onSurfaceMuted
                                    .withValues(alpha: 0.4)
                                : AppColors.brand,
                          ),
                        ),
              validator: widget.cityValidator ??
                  (v) {
                    if (v == null || v.trim().isEmpty) {
                      return 'Selecione a cidade';
                    }
                    return null;
                  },
            ),
          ],
        );
      },
    );
  }
}

class _CitySearchSheet extends StatefulWidget {
  const _CitySearchSheet({
    required this.data,
    required this.uf,
    required this.initialQuery,
  });

  final BrLocationsData data;
  final String uf;
  final String initialQuery;

  @override
  State<_CitySearchSheet> createState() => _CitySearchSheetState();
}

class _CitySearchSheetState extends State<_CitySearchSheet> {
  late final TextEditingController _searchCtrl;
  late List<String> _results;

  @override
  void initState() {
    super.initState();
    _searchCtrl = TextEditingController(text: widget.initialQuery);
    _results = widget.data.searchCities(
      uf: widget.uf,
      query: widget.initialQuery,
    );
    _searchCtrl.addListener(_onQueryChanged);
  }

  void _onQueryChanged() {
    setState(() {
      _results = widget.data.searchCities(
        uf: widget.uf,
        query: _searchCtrl.text,
      );
    });
  }

  @override
  void dispose() {
    _searchCtrl.removeListener(_onQueryChanged);
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Cidade — ${widget.uf}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _searchCtrl,
            autofocus: true,
            decoration: InputDecoration(
              hintText: 'Digite para buscar',
              prefixIcon: const Icon(Icons.search_rounded),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.42,
            child: _results.isEmpty
                ? Center(
                    child: Text(
                      'Nenhuma cidade encontrada.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  )
                : ListView.separated(
                    itemCount: _results.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final city = _results[index];
                      return ListTile(
                        title: Text(city),
                        onTap: () => Navigator.of(context).pop(city),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
