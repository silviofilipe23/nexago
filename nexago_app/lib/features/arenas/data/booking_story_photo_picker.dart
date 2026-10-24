import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

/// De onde vem a foto de fundo do story.
enum BookingStoryPhotoSource { camera, gallery }

/// Foto de fundo da câmera ou da galeria; `null` quando o atleta desiste.
typedef BookingStoryPhotoPicker = Future<Uint8List?> Function(
  BookingStoryPhotoSource source,
);

final bookingStoryPhotoPickerProvider = Provider<BookingStoryPhotoPicker>((
  ref,
) {
  return (source) async {
    final file = await ImagePicker().pickImage(
      source: source == BookingStoryPhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      // Fundo 1080×1920: 1440 de largura cobre o recorte sem pesar na memória.
      maxWidth: 1440,
      maxHeight: 2560,
      imageQuality: 88,
      // Evita falhas do PHPicker ao pedir metadados completos (iOS).
      requestFullMetadata: false,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    return bytes.isEmpty ? null : bytes;
  };
});
