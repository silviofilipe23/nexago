import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../ui/app_snackbar.dart';
import 'profile_image_crop_config.dart';
import 'profile_image_crop_page.dart';

/// Resultado de seleção + recorte de imagem de perfil.
typedef ProfilePickedImage = ({Uint8List bytes, String contentType});

const _iosPickFailedMessage =
    'Não foi possível carregar esta foto. Tente outra imagem '
    '(por exemplo, salva no dispositivo ou tirada com a câmera).';

/// Abre a galeria e o editor de recorte; retorna `null` se cancelado.
Future<ProfilePickedImage?> pickProfileImage({
  required BuildContext context,
  required ProfileImageCropTarget target,
}) async {
  final picker = ImagePicker();
  final maxWidth = target.maxOutputWidth.toDouble();

  XFile? file;
  try {
    file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: maxWidth,
      imageQuality: 88,
      // Evita falhas do PHPicker ao pedir metadados completos (iOS).
      requestFullMetadata: false,
    );
  } on PlatformException catch (e) {
    if (context.mounted) {
      final message = _messageForPickError(e);
      showAppSnackBar(context, message, isError: true);
    }
    return null;
  } catch (_) {
    if (context.mounted) {
      showAppSnackBar(context, _iosPickFailedMessage, isError: true);
    }
    return null;
  }

  if (file == null) return null;

  Uint8List bytes;
  try {
    bytes = await file.readAsBytes();
  } on PlatformException catch (e) {
    if (context.mounted) {
      showAppSnackBar(context, _messageForPickError(e), isError: true);
    }
    return null;
  } catch (_) {
    if (context.mounted) {
      showAppSnackBar(context, _iosPickFailedMessage, isError: true);
    }
    return null;
  }

  if (bytes.isEmpty) {
    if (context.mounted) {
      showAppSnackBar(context, _iosPickFailedMessage, isError: true);
    }
    return null;
  }

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

String _messageForPickError(PlatformException e) {
  if (e.code == 'invalid_image' ||
      (e.message?.contains('public.jpeg') ?? false) ||
      (e.message?.contains('NSItemProvider') ?? false)) {
    return _iosPickFailedMessage;
  }
  final detail = e.message?.trim();
  if (detail != null && detail.isNotEmpty) {
    return 'Não foi possível selecionar a foto. $detail';
  }
  return _iosPickFailedMessage;
}
