import 'dart:typed_data';

import 'organizer_profile_editor_logic.dart';

typedef OrganizerImageUpload = Future<String> Function(Uint8List jpegBytes);
typedef OrganizerProfilePersist =
    Future<void> Function(Map<String, Object> update);

/// Imagem escolhida e ainda não gravada no perfil.
class OrganizerPendingImage {
  OrganizerPendingImage(this.bytes);

  final Uint8List bytes;

  /// Já subiu ao Storage, mas o `update()` com a URL ainda não confirmou. Numa nova tentativa,
  /// grava esta URL sem subir de novo.
  String? uploadedUrl;
}

/// Estado de uma edição do perfil público, do snapshot aberto na tela até o save.
///
/// - [baseline] é o doc como estava quando a tela abriu (e, depois, como ficou a cada
///   gravação nossa). O payload compara o formulário com ele, NÃO com o último valor do stream:
///   uma edição feita no painel web num campo que a tela não tocou nunca é sobrescrita, e
///   mudança de fora não liga o "Salvar".
/// - Cada imagem é gravada logo depois de subir, num `update()` só dela. O arquivo no Storage
///   tem nome fixo (`organizer-logo.jpg`): subir e falhar depois deixaria a URL antiga (com o
///   token antigo) apontando para o arquivo novo — imagem quebrada. Gravando na hora, o pior
///   caso de uma falha no meio é a imagem nova já no ar e o resto ainda por salvar.
class OrganizerProfileSaveSession {
  OrganizerProfileSaveSession(this.baseline);

  OrganizerProfileSource baseline;
  OrganizerPendingImage? logo;
  OrganizerPendingImage? cover;
  bool removeCover = false;

  void pickLogo(Uint8List bytes) => logo = OrganizerPendingImage(bytes);

  void pickCover(Uint8List bytes) {
    cover = OrganizerPendingImage(bytes);
    removeCover = false;
  }

  void markCoverRemoved() {
    cover = null;
    removeCover = true;
  }

  /// Há capa na prévia (nova, ou a gravada e não removida).
  bool get hasCover =>
      cover != null || (baseline.coverUrl != null && !removeCover);

  /// Campos de texto/switch e a remoção da capa — sem as imagens novas.
  Map<String, Object> fieldsUpdate(OrganizerProfileForm form) =>
      buildOrganizerProfileUpdate(
        source: baseline,
        form: form,
        removeCover: removeCover,
      );

  bool isDirty(OrganizerProfileForm form) =>
      logo != null || cover != null || fieldsUpdate(form).isNotEmpty;

  /// Logo (sobe e grava), capa (sobe e grava), depois os campos. Lança no primeiro erro; o que
  /// já foi gravado fica no [baseline] e o que subiu sem gravar fica em `uploadedUrl`.
  Future<void> save(
    OrganizerProfileForm form, {
    required OrganizerImageUpload uploadLogo,
    required OrganizerImageUpload uploadCover,
    required OrganizerProfilePersist persist,
  }) async {
    final pendingLogo = logo;
    if (pendingLogo != null) {
      final url = pendingLogo.uploadedUrl ??= await uploadLogo(
        pendingLogo.bytes,
      );
      await _persist(persist, {'${kOrganizerProfileFieldPrefix}logoUrl': url});
      logo = null;
    }

    final pendingCover = cover;
    if (pendingCover != null) {
      final url = pendingCover.uploadedUrl ??= await uploadCover(
        pendingCover.bytes,
      );
      await _persist(persist, {'${kOrganizerProfileFieldPrefix}coverUrl': url});
      cover = null;
      removeCover = false;
    }

    final fields = fieldsUpdate(form);
    if (fields.isNotEmpty) await _persist(persist, fields);
    removeCover = false;
  }

  Future<void> _persist(
    OrganizerProfilePersist persist,
    Map<String, Object> update,
  ) async {
    await persist(update);
    baseline = applyOrganizerProfileUpdate(baseline, update);
  }
}
