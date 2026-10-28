import 'package:cloud_firestore/cloud_firestore.dart';

/// Artes do Stories enviadas do painel web para o celular
/// (`users/{uid}/storyShares/{shareId}`, gravado pela callable
/// `sendStoriesToPhone` em `functions/src/organizer-stories-share.ts`).
///
/// O painel gera os PNGs 1080×1920 e sobe no Storage; aqui só se baixa e
/// compartilha, um story por vez e na ordem.
class OrganizerStoryShare {
  const OrganizerStoryShare({
    required this.id,
    required this.tournamentId,
    required this.tournamentName,
    required this.categoryName,
    required this.unitLabel,
    required this.pagePaths,
    this.link,
    this.expiresAt,
  });

  final String id;
  final String tournamentId;
  final String tournamentName;
  final String categoryName;

  /// "duplas", "equipes"… — o que a arte lista.
  final String unitLabel;

  /// Caminhos no Storage, na ordem dos stories ("1/2", "2/2"…).
  final List<String> pagePaths;

  /// Link de inscrição para a figurinha "Link" do Instagram; `null` quando as
  /// inscrições não estavam abertas (a arte sai sem o "Inscreva-se").
  final String? link;

  /// Depois disso o servidor apaga as imagens.
  final DateTime? expiresAt;

  int get pageCount => pagePaths.length;

  bool isExpiredAt(DateTime now) =>
      expiresAt != null && !now.isBefore(expiresAt!);

  /// `null` para doc ausente ou sem páginas — a tela trata como indisponível.
  static OrganizerStoryShare? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final paths = [
      for (final p in (data['pagePaths'] as List?) ?? const [])
        if (p is String && p.trim().isNotEmpty) p.trim(),
    ];
    if (paths.isEmpty) return null;
    String text(String key) => (data[key] as String?)?.trim() ?? '';
    final link = text('link');
    final expiresAt = data['expiresAt'];
    return OrganizerStoryShare(
      id: id,
      tournamentId: text('tournamentId'),
      tournamentName: text('tournamentName'),
      categoryName: text('categoryName'),
      unitLabel: text('unitLabel').isEmpty ? 'duplas' : text('unitLabel'),
      pagePaths: paths,
      link: link.isEmpty ? null : link,
      expiresAt: expiresAt is Timestamp ? expiresAt.toDate() : null,
    );
  }
}

/// Texto do botão principal: o próximo story a postar ou o fim.
String organizerStoryShareButtonLabel({
  required int pageCount,
  required int? nextPage,
}) {
  if (nextPage == null) return 'Concluir';
  if (pageCount <= 1) return 'Postar no story';
  return 'Postar story ${nextPage + 1}/$pageCount';
}

/// Passo a passo, como na confirmação do painel: o Instagram recebe uma imagem
/// por vez, e a figurinha do link só existe com inscrições abertas.
List<String> organizerStoryShareSteps(OrganizerStoryShare share) => [
      'Toque em “${organizerStoryShareButtonLabel(pageCount: share.pageCount, nextPage: 0)}” e escolha o Instagram',
      'No Instagram, escolha “Story”',
      if (share.link != null)
        'Toque em figurinhas, escolha “Link” e cole o link de inscrição — ele já vai copiado',
      if (share.pageCount > 1) 'Volte aqui e poste o próximo, na ordem',
    ];
