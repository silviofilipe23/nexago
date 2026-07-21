import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

/// Grid de edição da galeria de fotos de destaque do perfil: fotos já
/// salvas (URL) + fotos recém-recortadas ainda não enviadas (bytes), com
/// botão de adicionar (respeitando [maxPhotos]) e remover por foto.
class EditProfileHighlightsGrid extends StatelessWidget {
  const EditProfileHighlightsGrid({
    super.key,
    required this.existingUrls,
    required this.pendingBytes,
    required this.maxPhotos,
    required this.onAdd,
    required this.onRemoveExisting,
    required this.onRemovePending,
  });

  final List<String> existingUrls;
  final List<Uint8List> pendingBytes;
  final int maxPhotos;
  final VoidCallback onAdd;
  final void Function(int index) onRemoveExisting;
  final void Function(int index) onRemovePending;

  @override
  Widget build(BuildContext context) {
    final total = existingUrls.length + pendingBytes.length;
    final canAdd = total < maxPhotos;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1,
          children: [
            for (var i = 0; i < existingUrls.length; i++)
              _PhotoTile(
                onRemove: () => onRemoveExisting(i),
                child: CachedNetworkImage(
                  imageUrl: existingUrls[i],
                  fit: BoxFit.cover,
                  placeholder: (_, __) => _Placeholder(),
                  errorWidget: (_, __, ___) => _Placeholder(),
                ),
              ),
            for (var i = 0; i < pendingBytes.length; i++)
              _PhotoTile(
                onRemove: () => onRemovePending(i),
                child: Image.memory(pendingBytes[i], fit: BoxFit.cover),
              ),
            if (canAdd) _AddTile(onTap: onAdd),
          ],
        ),
        SizedBox(height: 8),
        Text(
          '$total/$maxPhotos fotos · aparecem no seu perfil público',
          style: AppTypography.soraRegular(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _Placeholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ColoredBox(color: context.themeColors.surfaceRaised);
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.child, required this.onRemove});

  final Widget child;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Stack(
        fit: StackFit.expand,
        children: [
          child,
          Positioned(
            top: 4,
            right: 4,
            child: Material(
              color: Colors.black.withValues(alpha: 0.55),
              shape: const CircleBorder(),
              child: InkWell(
                onTap: onRemove,
                customBorder: const CircleBorder(),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(
                    Icons.close_rounded,
                    size: 16,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.4),
              width: 1.5,
            ),
          ),
          child: Icon(
            Icons.add_photo_alternate_outlined,
            color: AppColors.brand,
            size: 26,
          ),
        ),
      ),
    );
  }
}
