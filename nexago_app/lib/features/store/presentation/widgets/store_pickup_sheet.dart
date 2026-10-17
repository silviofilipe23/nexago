import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_models.dart';
import '../../domain/store_pickup.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Folha "Trocar" da arena de retirada: mais perto primeiro (quando há
/// coordenadas do atleta). Devolve o `arenaId` escolhido ou `null`.
Future<String?> showStorePickupSheet({
  required BuildContext context,
  required List<StorePickupArena> arenas,
  required String? currentArenaId,
  required int? readyHours,
  double? userLatitude,
  double? userLongitude,
}) {
  final sorted = sortStorePickupArenasByDistance(
    arenas,
    latitude: userLatitude,
    longitude: userLongitude,
  );
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
            child: Text(
              StoreCopy.pickupSheetTitle,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(
              StoreCopy.pickupSheetSubtitle(readyHours),
              style: AppTypography.bodyS.copyWith(
                color: StoreStyle.secondary(colors),
              ),
            ),
          ),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              padding: EdgeInsets.fromLTRB(
                12,
                0,
                12,
                16 + MediaQuery.paddingOf(sheetContext).bottom,
              ),
              itemCount: sorted.length,
              itemBuilder: (_, i) {
                final item = sorted[i];
                final arena = item.arena;
                final place = [
                  arena.address,
                  [arena.city, arena.state].where((s) => s.isNotEmpty).join('/'),
                ].where((s) => s.isNotEmpty).join(' · ');
                final selected = arena.arenaId == currentArenaId;
                final distance = item.distanceKm;
                return ListTile(
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppRadii.mdAll,
                  ),
                  selected: selected,
                  selectedTileColor: StoreStyle.surface(colors),
                  leading: Icon(
                    selected
                        ? Icons.check_circle_rounded
                        : Icons.place_outlined,
                    color: selected
                        ? AppColors.brand
                        : StoreStyle.secondary(colors),
                  ),
                  title: Text(
                    arena.name,
                    style: AppTypography.titleS.copyWith(
                      color: colors.onSurface,
                    ),
                  ),
                  subtitle: place.isEmpty
                      ? null
                      : Text(
                          place,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodyS.copyWith(
                            color: StoreStyle.tertiary(colors),
                          ),
                        ),
                  trailing: distance == null
                      ? null
                      : Text(
                          formatStoreDistance(distance),
                          style: AppTypography.monoMeta.copyWith(
                            color: StoreStyle.secondary(colors),
                          ),
                        ),
                  onTap: () => Navigator.pop(sheetContext, arena.arenaId),
                );
              },
            ),
          ),
        ],
      );
    },
  );
}
