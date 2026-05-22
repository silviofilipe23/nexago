import 'dart:typed_data';

import 'package:image/image.dart' as img;

import 'profile_image_crop_config.dart';

/// Redimensiona e exporta JPEG após o recorte.
Uint8List postProcessCroppedImage({
  required Uint8List croppedBytes,
  required ProfileImageCropTarget target,
}) {
  final decoded = img.decodeImage(croppedBytes);
  if (decoded == null) return croppedBytes;

  final maxW = target.maxOutputWidth;
  img.Image output = decoded;
  if (decoded.width > maxW) {
    output = img.copyResize(
      decoded,
      width: maxW,
      interpolation: img.Interpolation.linear,
    );
  }

  return Uint8List.fromList(img.encodeJpg(output, quality: 88));
}
