import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../domain/center_enrollment_request.dart';

/// Arquivo do atestado escolhido no aparelho (ainda não enviado).
class PickedCertificate {
  const PickedCertificate({
    required this.bytes,
    required this.fileName,
    required this.contentType,
  });

  final Uint8List bytes;
  final String fileName;
  final String contentType;

  int get sizeBytes => bytes.length;
  bool get isPdf => contentType == 'application/pdf';
}

/// Câmera (foto do atestado) ou arquivo (PDF ou imagem).
enum CertificateSource { camera, file }

/// Escolhe o atestado; `null` = cancelou ou formato não aceito. Função para o
/// teste trocar.
typedef CertificatePicker = Future<PickedCertificate?> Function(
    CertificateSource source);

Future<PickedCertificate?> _pickFromDevice(CertificateSource source) async {
  if (source == CertificateSource.camera) {
    final file = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) return null;
    return PickedCertificate(
      bytes: bytes,
      fileName: 'atestado-foto.jpg',
      contentType: 'image/jpeg',
    );
  }
  final result = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'],
    withData: true,
  );
  final file = result?.files.singleOrNull;
  final bytes = file?.bytes;
  if (file == null || bytes == null || bytes.isEmpty) return null;
  final type = centerCertificateContentType(file.name);
  if (type == null) return null;
  return PickedCertificate(
    bytes: bytes,
    fileName: file.name,
    contentType: type,
  );
}

final centerCertificatePickerProvider = Provider<CertificatePicker>(
  (ref) => _pickFromDevice,
);
