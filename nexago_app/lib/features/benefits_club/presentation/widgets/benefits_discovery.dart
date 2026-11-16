import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' show MbxImage;

import '../../../../core/map/mapbox_config.dart';
import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arenas/domain/arena_map_pin.dart';
import '../../../arenas/presentation/widgets/arena_map/arena_map_style.dart';
import '../../../arenas/presentation/widgets/arena_map/arena_map_view.dart';
import '../../domain/benefits_club_logic.dart';
import '../../domain/partner.dart';
import 'benefits_club_parts.dart';
import 'partner_map_pins.dart';
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
///
/// Parceiro em [withImage] usa o pino com a logo/iniciais dele
/// ([partnerPinImageId]); o de [selectedId] fica em destaque.
List<ArenaMapPin> benefitsMapPins(
  List<Partner> partners, {
  Set<String> withImage = const {},
  String? selectedId,
}) => [
  for (final partner in partners)
    for (var i = 0; i < partner.locations.length; i++)
      ArenaMapPin(
        arenaId: '${partner.id}$_pinSeparator$i',
        latitude: partner.locations[i].latitude,
        longitude: partner.locations[i].longitude,
        kind: ArenaMapPinKind.available,
        iconImageId: withImage.contains(partner.id)
            ? partnerPinImageId(partner.id)
            : null,
        selected: partner.id == selectedId,
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
  final _controller = ArenaMapController();
  String? _selectedId;

  /// PNG do pino de cada parceiro (iniciais e, quando chegar, a logo).
  final Map<String, MbxImage> _images = {};

  /// A partir de que dado o pino de cada parceiro foi desenhado: muda a logo
  /// ou a cor, desenha de novo.
  final Map<String, String> _renderedFrom = {};

  /// Instância nova a cada imagem pronta: é o que faz o mapa registrar de novo.
  List<ArenaMapPinImage> _pinImages = const [];

  @override
  void initState() {
    super.initState();
    _renderPins();
  }

  @override
  void didUpdateWidget(covariant BenefitsPartnerMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.partners, widget.partners)) _renderPins();
  }

  /// Desenha as iniciais na hora e troca pela logo quando ela baixar. Um
  /// parceiro sem logo, ou com a logo falhando, fica nas iniciais.
  void _renderPins() {
    for (final partner in widget.partners) {
      final key = '${partner.logoUrl}|${partner.brandColor}|${partner.name}';
      if (_renderedFrom[partner.id] == key) continue;
      _renderedFrom[partner.id] = key;
      _renderPartner(partner, key);
    }
  }

  Future<void> _renderPartner(Partner partner, String key) async {
    final initials = await renderPartnerInitialsPin(partner);
    if (!mounted || _renderedFrom[partner.id] != key) return;
    _setImage(partner.id, initials);

    final logo = await loadPartnerLogoImage(partner.logoUrl);
    if (logo == null) return;
    final withLogo = await renderPartnerPinImage(
      brand: partnerBrandColor(partner),
      initials: partnerInitials(partner.name),
      logo: logo,
    );
    logo.dispose();
    if (!mounted || _renderedFrom[partner.id] != key) return;
    _setImage(partner.id, withLogo);
  }

  void _setImage(String partnerId, MbxImage image) {
    setState(() {
      _images[partnerId] = image;
      _pinImages = [
        for (final entry in _images.entries)
          ArenaMapPinImage(
            id: partnerPinImageId(entry.key),
            image: entry.value,
            scale: PartnerMapPin.scale,
          ),
      ];
    });
  }

  /// Volta a câmera para a pessoa (só existe com a localização liberada).
  void _recenter() {
    final center = widget.center;
    if (center == null) return;
    _controller.flyTo(center.latitude, center.longitude);
  }

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
              controller: _controller,
              pinImages: _pinImages,
              pins: benefitsMapPins(
                widget.partners,
                withImage: _images.keys.toSet(),
                selectedId: _selectedId,
              ),
              initialCenter: widget.center,
              showUserLocation: widget.showUserLocation,
              onPinTap: (pinId) =>
                  setState(() => _selectedId = partnerIdOfPin(pinId)),
            ),
          ),
          if (widget.center != null && widget.showUserLocation)
            Positioned(
              top: AppSpacing.md,
              right: AppSpacing.md,
              child: _MapRecenterButton(onTap: _recenter),
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

class _MapRecenterButton extends StatelessWidget {
  const _MapRecenterButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Tooltip(
      message: 'Centralizar na minha localização',
      child: Material(
        color: colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.mdAll,
          side: AppBorders.subtleSide(colors),
        ),
        child: InkWell(
          key: const Key('benefits-map-recenter'),
          borderRadius: AppRadii.mdAll,
          onTap: onTap,
          child: SizedBox(
            width: benefitsTapTarget,
            height: benefitsTapTarget,
            child: Icon(
              Icons.my_location_rounded,
              size: 19,
              color: colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

/// Card do parceiro tocado no mapa (artboard 09): logo, nome, selo do
/// benefício, distância e endereço, e o botão laranja que abre o parceiro.
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
      key: const Key('benefits-map-card'),
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.lgAll,
        side: AppBorders.subtleSide(colors),
      ),
      elevation: 8,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              PartnerLogo(
                partner: partner,
                size: 46,
                borderRadius: AppRadii.mdAll,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      partner.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.titleS.copyWith(
                        fontSize: 14.5,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (partner.benefitHighlight.isNotEmpty) ...[
                          BenefitHighlightBadge(partner.benefitHighlight),
                          const SizedBox(width: AppSpacing.sm),
                        ],
                        if (meta.isNotEmpty)
                          Flexible(
                            child: Text(
                              meta,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 12,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: AppRadii.mdAll,
                ),
                child: const Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: AppColors.canvas,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
