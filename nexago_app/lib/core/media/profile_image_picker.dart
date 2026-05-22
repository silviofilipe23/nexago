import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'profile_image_crop_config.dart';
import 'profile_image_crop_page.dart';

/// Resultado de seleção + recorte de imagem de perfil.
typedef ProfilePickedImage = ({Uint8List bytes, String contentType});

/// Abre a galeria e o editor de recorte; retorna `null` se cancelado.
Future<ProfilePickedImage?> pickProfileImage({
  required BuildContext context,
  required ProfileImageCropTarget target,
}) async {
  final picker = ImagePicker();
  final file = await picker.pickImage(source: ImageSource.gallery);
  if (file == null) return null;

  final bytes = await file.readAsBytes();
  if (!context.mounted) return null;

  final cropped = await Navigator.of(context).push<Uint8List>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (ctx) => ProfileImageCropPage(
        imageBytes: bytes,
        target: target,
      ),
    ),
  );

  if (cropped == null || cropped.isEmpty) return null;

  return (bytes: cropped, contentType: 'image/jpeg');
}
