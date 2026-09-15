import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../domain/tournament_cover_art.dart';

/// Capa do torneio em três degraus: foto do organizador, arte do esporte,
/// gradiente da tela.
///
/// O gradiente entra por `placeholder` porque cada tela pinta o seu — o card de
/// descoberta destaca o `featured`, o herói do detalhe encaixa no scrim. O que
/// é comum é a ORDEM, não o desenho.
///
/// Capa que não carrega cai na arte do esporte, não direto no gradiente: URL
/// podre do Storage deixa de virar buraco na tela. Já ENQUANTO carrega quem
/// aparece é o gradiente — a arte ali daria um flash de foto genérica trocando
/// pela capa certa.
class TournamentCoverImage extends StatelessWidget {
  const TournamentCoverImage({
    super.key,
    required this.coverUrl,
    required this.sport,
    required this.placeholder,
    this.fit = BoxFit.cover,
    this.memCacheWidth,
    this.memCacheHeight,
  });

  /// Capa enviada pelo organizador (`coverUrl`/`imageUrl` no Firestore).
  final String? coverUrl;

  /// `tournaments/{id}.sport` — código do `TournamentSport`.
  final String? sport;

  /// Último recurso, quando o esporte não tem arte.
  final WidgetBuilder placeholder;

  final BoxFit fit;

  /// Decodifica a capa só no tamanho exibido. Sem isso uma foto de câmera é
  /// decodificada em resolução cheia pra caber num tile pequeno, custando
  /// memória e frames a cada tile que entra em cena.
  final int? memCacheWidth;
  final int? memCacheHeight;

  @override
  Widget build(BuildContext context) {
    final url = coverUrl?.trim();
    if (url == null || url.isEmpty) return _fallback(context);

    return CachedNetworkImage(
      imageUrl: url,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 220),
      memCacheWidth: memCacheWidth,
      memCacheHeight: memCacheHeight,
      placeholder: (context, _) => placeholder(context),
      errorWidget: (context, _, __) => _fallback(context),
    );
  }

  Widget _fallback(BuildContext context) {
    final asset = TournamentCoverArt.assetFor(sport);
    if (asset == null) return placeholder(context);
    return Image.asset(
      asset,
      fit: fit,
      errorBuilder: (context, _, __) => placeholder(context),
    );
  }
}
