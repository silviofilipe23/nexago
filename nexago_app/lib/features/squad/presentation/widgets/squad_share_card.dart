import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import 'squad_ui.dart';

enum SquadShareFormat { story, tournament, qr }

/// Evento do card "Torneio": o que aparece e para onde o link leva.
class SquadShareEvent {
  const SquadShareEvent({
    required this.tournamentId,
    required this.name,
    required this.eyebrow,
    this.coverUrl,
  });

  final String tournamentId;
  final String name;

  /// "26 OUT · ARENA ERREJOTA".
  final String eyebrow;
  final String? coverUrl;
}

/// O card 9:16 que vira PNG (236×420 na tela, capturado em 3×). Sempre escuro:
/// é uma peça para story, não segue o tema do app.
class SquadShareCard extends StatelessWidget {
  const SquadShareCard({
    super.key,
    required this.format,
    required this.code,
    required this.offer,
    required this.qrLink,
    this.photoUrl,
    this.event,
  });

  static const Size size = Size(236, 420);

  final SquadShareFormat format;
  final String code;

  /// "10% OFF na 1ª inscrição".
  final String offer;

  /// Link do QR (com `&via=qr`).
  final String qrLink;
  final String? photoUrl;
  final SquadShareEvent? event;

  static const Color _bg = Color(0xFF050505);
  static const Color _fg = Color(0xFFF5F5F7);
  static const Color _mute = Color(0x9EF5F5F7);
  static const Color _dim = Color(0x66F5F5F7);

  @override
  Widget build(BuildContext context) {
    final photo = format == SquadShareFormat.tournament
        ? (photoUrl ?? event?.coverUrl)
        : photoUrl;
    return SizedBox.fromSize(
      size: size,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: ColoredBox(
          color: _bg,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (format != SquadShareFormat.qr) _Background(url: photo),
              if (format != SquadShareFormat.qr)
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0x33050505),
                        Color(0x00050505),
                        Color(0xEB050505),
                      ],
                      stops: [0, 0.3, 0.72],
                    ),
                  ),
                ),
              if (format == SquadShareFormat.qr) _qrBody() else _bottom(),
              // Por último: o fundo do QR cobre o card inteiro.
              const Positioned(
                left: 16,
                top: 16,
                child: SquadWordmark(size: 13, color: _fg),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bottom() {
    final tournament = format == SquadShareFormat.tournament && event != null;
    return Positioned(
      left: 16,
      right: 16,
      bottom: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            tournament ? event!.eyebrow : 'NEXAGO SQUAD',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: SquadStyle.mono(
              9,
              color: AppColors.brand,
            ).copyWith(letterSpacing: 1.3),
          ),
          const SizedBox(height: 6),
          Text(
            tournament ? event!.name : 'Jogue com o meu código',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: SquadStyle.display(24, color: _fg).copyWith(height: 1.05),
          ),
          const SizedBox(height: 6),
          Text(
            tournament
                ? 'Bora jogar comigo? Use meu código e ganhe $offer.'
                : 'Use meu código e ganhe $offer na NexaGO.',
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              color: _mute,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xB3050505),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0x1FF5F5F7)),
            ),
            child: Row(
              children: [
                _Qr(data: qrLink, size: 52),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CÓDIGO',
                        style: SquadStyle.mono(
                          8.5,
                          color: _dim,
                        ).copyWith(letterSpacing: 1.2),
                      ),
                      Text(
                        code,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: SquadStyle.mono(18, color: _fg),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '#publi · parceria NexaGO',
            style: SquadStyle.mono(8, color: _dim, weight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _qrBody() {
    return Positioned.fill(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0, -0.2),
            radius: 0.9,
            colors: [AppColors.brand.withValues(alpha: 0.28), _bg],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 56, 20, 16),
          child: Column(
            children: [
              const Spacer(),
              _Qr(data: qrLink, size: 172),
              const SizedBox(height: 16),
              Text(
                'CÓDIGO',
                style: SquadStyle.mono(
                  9,
                  color: _dim,
                ).copyWith(letterSpacing: 1.3),
              ),
              const SizedBox(height: 2),
              Text(code, style: SquadStyle.mono(26, color: _fg)),
              const SizedBox(height: 8),
              Text(
                'Aponte a câmera e ganhe $offer.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  color: _mute,
                ),
              ),
              const Spacer(),
              Text(
                '#publi · parceria NexaGO',
                style: SquadStyle.mono(8, color: _dim, weight: FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Qr extends StatelessWidget {
  const _Qr({required this.data, required this.size});

  final String data;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.08),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F4F5),
        borderRadius: BorderRadius.circular(size > 100 ? 18 : 10),
      ),
      child: QrImageView(
        data: data,
        padding: EdgeInsets.zero,
        backgroundColor: const Color(0xFFF4F4F5),
        eyeStyle: const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color: Color(0xFF0A0A0A),
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color: Color(0xFF0A0A0A),
        ),
      ),
    );
  }
}

/// Foto do atleta (ou capa do torneio); sem foto, a arte da marca.
class _Background extends StatelessWidget {
  const _Background({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final art = DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(-0.5, -0.6),
          radius: 1.3,
          colors: [
            AppColors.brand.withValues(alpha: 0.6),
            const Color(0xFF16120F),
          ],
        ),
      ),
    );
    final u = url;
    if (u == null || u.isEmpty) return art;
    return CachedNetworkImage(
      imageUrl: u,
      fit: BoxFit.cover,
      placeholder: (_, __) => art,
      errorWidget: (_, __, ___) => art,
    );
  }
}
