import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../athlete_settings/athlete_settings_helpers.dart';

/// Capa + avatar sobreposto (protótipo Editar perfil).
class EditProfileMediaHeader extends StatelessWidget {
  const EditProfileMediaHeader({
    super.key,
    required this.name,
    required this.coverRemovedPending,
    required this.existingCoverUrl,
    required this.pickedCoverBytes,
    required this.onEditCover,
    required this.existingAvatarUrl,
    required this.pickedAvatarBytes,
    required this.onEditAvatar,
  });

  final String name;
  final bool coverRemovedPending;
  final String? existingCoverUrl;
  final Uint8List? pickedCoverBytes;
  final VoidCallback onEditCover;
  final String? existingAvatarUrl;
  final Uint8List? pickedAvatarBytes;
  final VoidCallback onEditAvatar;

  static const _coverHeight = 148.0;
  static const _avatarSize = 88.0;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          _CoverArea(
            height: _coverHeight,
            coverRemovedPending: coverRemovedPending,
            existingUrl: existingCoverUrl,
            pickedBytes: pickedCoverBytes,
            onEditCover: onEditCover,
          ),
          Positioned(
            left: 16,
            bottom: -_avatarSize / 2 + 8,
            child: _AvatarBadge(
              size: _avatarSize,
              name: name,
              existingUrl: existingAvatarUrl,
              pickedBytes: pickedAvatarBytes,
              onTap: onEditAvatar,
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverArea extends StatelessWidget {
  const _CoverArea({
    required this.height,
    required this.coverRemovedPending,
    required this.existingUrl,
    required this.pickedBytes,
    required this.onEditCover,
  });

  final double height;
  final bool coverRemovedPending;
  final String? existingUrl;
  final Uint8List? pickedBytes;
  final VoidCallback onEditCover;

  @override
  Widget build(BuildContext context) {
    Widget preview;
    if (coverRemovedPending) {
      preview = _defaultGradient();
    } else if (pickedBytes != null) {
      preview = Image.memory(pickedBytes!, fit: BoxFit.cover);
    } else if (existingUrl != null && existingUrl!.isNotEmpty) {
      preview = CachedNetworkImage(
        imageUrl: existingUrl!,
        fit: BoxFit.cover,
        placeholder: (_, __) => _defaultGradient(),
      );
    } else {
      preview = _defaultGradient();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            preview,
            Positioned(
              top: 12,
              right: 12,
              child: Material(
                color: Colors.black.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                  onTap: onEditCover,
                  borderRadius: BorderRadius.circular(10),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.edit_outlined,
                          size: 14,
                          color: AppColors.onSurface.withValues(alpha: 0.95),
                        ),
                        SizedBox(width: 6),
                        Text(
                          'EDITAR CAPA',
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurface,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: Material(
                color: Colors.transparent,
                child: InkWell(onTap: onEditCover),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _defaultGradient() {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3D1F0A), Color(0xFF1A0F08)],
        ),
      ),
      child: Align(
        alignment: Alignment.topRight,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Icon(
            Icons.landscape_outlined,
            size: 48,
            color: AppColors.brand.withValues(alpha: 0.25),
          ),
        ),
      ),
    );
  }
}

class _AvatarBadge extends StatelessWidget {
  const _AvatarBadge({
    required this.size,
    required this.name,
    required this.existingUrl,
    required this.pickedBytes,
    required this.onTap,
  });

  final double size;
  final String name;
  final String? existingUrl;
  final Uint8List? pickedBytes;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final initials = athleteInitialsFromName(name);

    Widget child;
    if (pickedBytes != null) {
      child = Image.memory(pickedBytes!, fit: BoxFit.cover);
    } else if (existingUrl != null && existingUrl!.isNotEmpty) {
      child = CachedNetworkImage(
        imageUrl: existingUrl!,
        fit: BoxFit.cover,
        placeholder: (_, __) => _initialsBox(initials),
      );
    } else {
      child = _initialsBox(initials);
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Ink(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.canvas, width: 3),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: ClipOval(child: child),
        ),
      ),
    );
  }

  Widget _initialsBox(String initials) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brand, Color(0xFFE85D04)],
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            color: AppColors.canvas,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }
}
