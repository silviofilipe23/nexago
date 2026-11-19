import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_booking_labels.dart';

/// O que o atleta reservou: capa da arena, data, horário, local e o atalho
/// para trocar o horário. O fundo é sempre escuro (gradiente da marca), então
/// o texto é branco e o laranja cru é legível nos dois temas.
class BookingConfirmHeroCard extends StatelessWidget {
  const BookingConfirmHeroCard({
    super.key,
    required this.dateKey,
    required this.timeRange,
    required this.arenaName,
    required this.courtName,
    this.courtSubtitle,
    this.sportLabel,
    this.durationLabel,
    this.coverUrl,
    this.onChangeTime,
  });

  static const changeTimeKey = Key('booking-confirm-change-time');
  static const coverKey = Key('booking-confirm-hero-cover');

  static const _coverHeight = 112.0;
  static const _gradientTop = Color(0xFF1A0F06);

  final String dateKey;
  final String timeRange;
  final String arenaName;
  final String courtName;
  final String? courtSubtitle;

  /// Esporte quando a quadra só tem um: vira texto aqui em vez de um
  /// seletor com uma opção só.
  final String? sportLabel;

  /// Duração compacta ("1h30"), ao lado da data.
  final String? durationLabel;

  /// Capa da arena (`coverUrl` do perfil). Sem ela, só o gradiente.
  final String? coverUrl;

  /// Volta para a grade de horários; `null` desliga o botão (reservando).
  final VoidCallback? onChangeTime;

  @override
  Widget build(BuildContext context) {
    final cover = coverUrl?.trim() ?? '';
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              _gradientTop, // rgb(26, 15, 6) 0%
              Color(0xFF2A1408), // rgb(42, 20, 8) 60%
              Color(0xFF050505), // rgb(5, 5, 5) 100%
            ],
            stops: [0.0, 0.6, 1.0],
          ),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (cover.isNotEmpty) _Cover(url: cover),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 8, 8),
              child: _Details(
                dateKey: dateKey,
                timeRange: timeRange,
                location: [
                  arenaName,
                  courtName,
                  if (sportLabel != null && sportLabel!.trim().isNotEmpty)
                    sportLabel!,
                ].join(' · '),
                durationLabel: durationLabel,
                onChangeTime: onChangeTime,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Faixa da capa. O texto nunca fica sobre a foto: ela só some no gradiente
/// do cartão, então a foto não decide o contraste.
class _Cover extends StatelessWidget {
  const _Cover({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    const fade = ColoredBox(color: BookingConfirmHeroCard._gradientTop);
    return SizedBox(
      key: BookingConfirmHeroCard.coverKey,
      height: BookingConfirmHeroCard._coverHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CachedNetworkImage(
            imageUrl: url,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 220),
            placeholder: (context, _) => fade,
            errorWidget: (context, _, __) => fade,
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [0.45, 1],
                colors: [
                  BookingConfirmHeroCard._gradientTop.withValues(alpha: 0),
                  BookingConfirmHeroCard._gradientTop,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({
    required this.dateKey,
    required this.timeRange,
    required this.location,
    required this.durationLabel,
    required this.onChangeTime,
  });

  final String dateKey;
  final String timeRange;
  final String location;
  final String? durationLabel;
  final VoidCallback? onChangeTime;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final duration = durationLabel?.trim() ?? '';
    final dateLine = [
      formatBookingDateHeaderUppercase(dateKey),
      if (duration.isNotEmpty) duration.toUpperCase(),
    ].join(' · ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Text(
            dateLine,
            style: AppTypography.mono(
              color: AppColors.brand,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          timeRange,
          style: AppTypography.mono(
            fontWeight: FontWeight.w900,
            fontSize: 36,
            color: Colors.white,
            letterSpacing: -0.5,
            height: 1.05,
          ),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.only(right: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_outlined,
                size: 18,
                color: AppColors.brand,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  location,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.82),
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            key: BookingConfirmHeroCard.changeTimeKey,
            onPressed: onChangeTime,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.brand,
              disabledForegroundColor: Colors.white.withValues(alpha: 0.4),
              visualDensity: VisualDensity.compact,
            ),
            icon: const Icon(Icons.edit_calendar_outlined, size: 18),
            label: const Text('Alterar horário'),
          ),
        ),
      ],
    );
  }
}
