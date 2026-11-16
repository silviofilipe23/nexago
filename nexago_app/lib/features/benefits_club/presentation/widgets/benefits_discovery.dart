import 'package:flutter/material.dart';

import '../../../../core/map/mapbox_config.dart';
import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arenas/domain/arena_map_pin.dart';
import '../../../arenas/presentation/widgets/arena_map/arena_map_view.dart';
import '../../domain/partner.dart';
import 'benefits_club_parts.dart';
import 'partner_visuals.dart';

/// Busca do clube (nome, categoria, benefício; sem acento).
class BenefitsSearchField extends StatelessWidget {
  const BenefitsSearchField({
    super.key,
    required this.controller,
    required this.onChanged,
  });

  static const Key fieldKey = Key('benefits-search');

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return TextField(
      key: fieldKey,
      controller: controller,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      style: AppTypography.bodyM.copyWith(color: colors.onSurface),
      decoration: InputDecoration(
        hintText: 'Buscar parceiro ou categoria',
        prefixIcon: Icon(Icons.search_rounded, color: colors.onSurfaceMuted),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Limpar busca',
                icon: Icon(Icons.close_rounded, color: colors.onSurfaceMuted),
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              ),
        filled: true,
        fillColor: colors.surfaceCard,
        isDense: true,
        constraints: const BoxConstraints(minHeight: benefitsTapTarget),
        border: OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: AppBorders.subtleSide(colors),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: AppBorders.subtleSide(colors),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: BorderSide(color: AppColors.brand),
        ),
      ),
    );
  }
}

/// Lista ou mapa.
enum BenefitsView { list, map }

/// Lista|Mapa (só com mapa disponível) e o "Perto de você" (só com a
/// localização já liberada).
class BenefitsViewControls extends StatelessWidget {
  const BenefitsViewControls({
    super.key,
    required this.view,
    required this.onView,
    required this.showMapToggle,
    required this.nearAvailable,
    required this.near,
    required this.onNear,
  });

  final BenefitsView view;
  final ValueChanged<BenefitsView> onView;
  final bool showMapToggle;
  final bool nearAvailable;
  final bool near;
  final ValueChanged<bool> onNear;

  @override
  Widget build(BuildContext context) {
    if (!showMapToggle && !nearAvailable) return const SizedBox.shrink();
    return Row(
      children: [
        if (showMapToggle) _Segmented(view: view, onView: onView),
        const Spacer(),
        if (nearAvailable)
          _NearChip(selected: near, onTap: () => onNear(!near)),
      ],
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({required this.view, required this.onView});

  final BenefitsView view;
  final ValueChanged<BenefitsView> onView;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget option(BenefitsView value, IconData icon, String label) {
      final on = view == value;
      return Semantics(
        button: true,
        selected: on,
        child: InkWell(
          key: Key('benefits-view-${value.name}'),
          borderRadius: AppRadii.smAll,
          onTap: () => onView(value),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: on ? colors.surfaceSheet : Colors.transparent,
              borderRadius: AppRadii.smAll,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 15,
                  color: on ? colors.onSurface : colors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: AppTypography.labelL.copyWith(
                    fontSize: 12.5,
                    color: on ? colors.onSurface : colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.mdAll,
        border: AppBorders.subtle(colors),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          option(BenefitsView.list, Icons.view_list_rounded, 'Lista'),
          option(BenefitsView.map, Icons.map_outlined, 'Mapa'),
        ],
      ),
    );
  }
}

class _NearChip extends StatelessWidget {
  const _NearChip({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        key: const Key('benefits-near'),
        borderRadius: AppRadii.pillAll,
        onTap: onTap,
        child: Container(
          height: benefitsTapTarget,
          alignment: Alignment.center,
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.12)
                  : colors.surfaceCard,
              borderRadius: AppRadii.pillAll,
              border: Border.all(
                color: selected
                    ? AppColors.brand
                    : colors.onSurfaceMuted.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.near_me_outlined,
                  size: 15,
                  color: selected ? colors.brandText : colors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Text(
                  'Perto de você',
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: selected ? colors.brandText : colors.onSurfaceMuted,
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

/// O mapa só existe com token do Mapbox e com parceiro que tem unidade.
bool benefitsMapAvailable(List<Partner> partners) =>
    isMapboxConfigured && partners.any((p) => p.locations.isNotEmpty);

const String _pinSeparator = '#';

/// Pinos das unidades; o id do pino é `<partnerId>#<índice da unidade>`.
List<ArenaMapPin> benefitsMapPins(List<Partner> partners) => [
  for (final partner in partners)
    for (var i = 0; i < partner.locations.length; i++)
      ArenaMapPin(
        arenaId: '${partner.id}$_pinSeparator$i',
        latitude: partner.locations[i].latitude,
        longitude: partner.locations[i].longitude,
        kind: ArenaMapPinKind.available,
      ),
];

/// Id do parceiro dono do pino.
String partnerIdOfPin(String pinId) {
  final cut = pinId.lastIndexOf(_pinSeparator);
  return cut < 0 ? pinId : pinId.substring(0, cut);
}

/// Mapa dos parceiros (o mesmo mapa da busca de arenas) com o card do
/// parceiro tocado por cima.
class BenefitsPartnerMap extends StatefulWidget {
  const BenefitsPartnerMap({
    super.key,
    required this.partners,
    required this.onOpenPartner,
    this.center,
    this.distanceOf,
    this.showUserLocation = false,
  });

  final List<Partner> partners;
  final ValueChanged<Partner> onOpenPartner;
  final ({double latitude, double longitude})? center;
  final String? Function(Partner partner)? distanceOf;

  /// Só `true` com a permissão já concedida (o Mapbox pediria sozinho).
  final bool showUserLocation;

  @override
  State<BenefitsPartnerMap> createState() => _BenefitsPartnerMapState();
}

class _BenefitsPartnerMapState extends State<BenefitsPartnerMap> {
  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final selected = widget.partners
        .where((p) => p.id == _selectedId)
        .firstOrNull;
    return ClipRRect(
      borderRadius: AppRadii.xlAll,
      child: Stack(
        children: [
          Positioned.fill(
            child: ArenaMapView(
              pins: benefitsMapPins(widget.partners),
              initialCenter: widget.center,
              showUserLocation: widget.showUserLocation,
              onPinTap: (pinId) =>
                  setState(() => _selectedId = partnerIdOfPin(pinId)),
            ),
          ),
          if (selected != null)
            Positioned(
              left: AppSpacing.md,
              right: AppSpacing.md,
              bottom: AppSpacing.md,
              child: _MapPartnerCard(
                partner: selected,
                distance: widget.distanceOf?.call(selected),
                onTap: () => widget.onOpenPartner(selected),
              ),
            ),
        ],
      ),
    );
  }
}

class _MapPartnerCard extends StatelessWidget {
  const _MapPartnerCard({
    required this.partner,
    required this.onTap,
    this.distance,
  });

  final Partner partner;
  final VoidCallback onTap;
  final String? distance;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final address = partner.locations.firstOrNull?.address ?? '';
    final km = distance;
    final meta = [?km, if (address.isNotEmpty) address].join(' · ');
    return Material(
      color: colors.surfaceSheet,
      borderRadius: AppRadii.lgAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              PartnerLogo(
                partner: partner,
                size: 40,
                borderRadius: AppRadii.mdAll,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      partner.name,
                      style: AppTypography.titleS.copyWith(
                        fontSize: 14,
                        color: colors.onSurface,
                      ),
                    ),
                    if (meta.isNotEmpty)
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                  ],
                ),
              ),
              if (partner.benefitHighlight.isNotEmpty)
                BenefitHighlightBadge(partner.benefitHighlight),
              const SizedBox(width: AppSpacing.sm),
              Icon(Icons.arrow_forward_rounded, color: colors.onSurface),
            ],
          ),
        ),
      ),
    );
  }
}
