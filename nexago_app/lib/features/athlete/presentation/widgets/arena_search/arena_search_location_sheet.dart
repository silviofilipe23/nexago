import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/location/user_location_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';

Future<void> showArenaSearchLocationSheet({
  required BuildContext context,
  required WidgetRef ref,
  required String profileCity,
  required String profileState,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
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
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              SizedBox(height: 16),
              Text(
                'Localização',
                style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
              ),
              SizedBox(height: 8),
              if (profileCity.isNotEmpty || profileState.isNotEmpty)
                Text(
                  'Perfil: $profileCity${profileState.isNotEmpty ? ' · $profileState' : ''}',
                  style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                ),
              SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () async {
                  Navigator.pop(ctx);
                  showAppSnackBar(context, 'Atualizando localização…');
                  // Pedir antes de invalidar: sem permissão o provider só
                  // refaz a mesma conta e devolve o mesmo "não sei onde você
                  // está" — o botão prometeria algo que não entrega.
                  await ref
                      .read(userLocationServiceProvider)
                      .ensurePermission();
                  ref.invalidate(userLocationProvider);
                },
                icon: Icon(Icons.my_location_rounded),
                label: Text('Usar minha localização'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
