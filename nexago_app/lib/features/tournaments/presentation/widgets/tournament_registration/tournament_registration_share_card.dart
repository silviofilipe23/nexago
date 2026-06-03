import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../auth/widgets/auth_form_widgets.dart';

/// Card “instagramável” de inscrição confirmada (protótipo Sucesso).
class TournamentRegistrationShareCard extends StatelessWidget {
  const TournamentRegistrationShareCard({
    super.key,
    required this.tournamentName,
    required this.dateLabel,
    required this.categoryName,
    required this.slotLabel,
    required this.player1Name,
    required this.player2Name,
    required this.headlineLine1,
    required this.headlineLine2,
    this.player1AvatarUrl,
    this.player2AvatarUrl,
    required this.locationLine,
    required this.footerLabel,
  });

  final String headlineLine1;
  final String headlineLine2;
  final String tournamentName;
  final String dateLabel;
  final String categoryName;
  final String slotLabel;
  final String player1Name;
  final String player2Name;
  final String? player1AvatarUrl;
  final String? player2AvatarUrl;
  final String locationLine;
  final String footerLabel;

  @override
  Widget build(BuildContext context) {
    final playerLine = _formatPlayerLine(player1Name, player2Name);
    final initials1 = _initials(player1Name);
    final initials2 = _initials(player2Name);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.12),
            blurRadius: 40,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              children: [
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: const Alignment(0, -0.45),
                        radius: 1.05,
                        colors: [
                          AppColors.brand.withValues(alpha: 0.24),
                          AppColors.brand.withValues(alpha: 0.08),
                          Colors.transparent,
                        ],
                        stops: const [0.0, 0.42, 1.0],
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Image.asset(
                            kNexagoLogoAsset,
                            height: 40,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => _LogoFallback(),
                          ),
                          Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.brand,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              slotLabel.toUpperCase(),
                              style: AppTypography.mono(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: AppColors.black,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 28),
                      SizedBox(
                        height: 108,
                        width: double.infinity,
                        child: Stack(
                          alignment: Alignment.center,
                          clipBehavior: Clip.none,
                          children: [
                            Transform.translate(
                              offset: const Offset(-40, 0),
                              child: _PartnerAvatar(
                                initials: initials1,
                                avatarUrl: player1AvatarUrl,
                                size: 100,
                                backgroundColor: AppColors.brand,
                                borderColor: AppColors.onSurface,
                                borderWidth: 3,
                              ),
                            ),
                            Transform.translate(
                              offset: const Offset(40, 0),
                              child: _PartnerAvatar(
                                initials: initials2,
                                avatarUrl: player2AvatarUrl,
                                size: 100,
                                backgroundColor: AppColors.brandHover,
                                borderColor: AppColors.onSurface,
                                borderWidth: 3,
                                elevated: true,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: 20),
                      Text(
                        'DUPLA CONFIRMADA',
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brand,
                          letterSpacing: 1.2,
                        ),
                      ),
                      SizedBox(height: 10),
                      _ShareCardHeadline(
                        line1: headlineLine1,
                        line2: headlineLine2,
                      ),
                      SizedBox(height: 12),
                      Text(
                        playerLine,
                        textAlign: TextAlign.center,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const _TicketDivider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'TORNEIO',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: AppColors.onSurfaceMuted,
                      letterSpacing: 0.8,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    tournamentName,
                    style: AppTypography.soraRegular(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                      height: 1.15,
                    ),
                  ),
                  SizedBox(height: 18),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'QUANDO',
                              style: AppTypography.mono(
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                                color: AppColors.onSurfaceMuted,
                                letterSpacing: 0.8,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text(
                              dateLabel.isNotEmpty ? dateLabel : '—',
                              style: AppTypography.soraRegular(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'CATEGORIA',
                              style: AppTypography.mono(
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                                color: AppColors.onSurfaceMuted,
                                letterSpacing: 0.8,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text(
                              categoryName,
                              style: AppTypography.soraRegular(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (locationLine.isNotEmpty) ...[
                    SizedBox(height: 16),
                    Row(
                      children: [
                        Icon(
                          Icons.location_on_outlined,
                          size: 16,
                          color: AppColors.onSurfaceMuted.withValues(
                            alpha: 0.9,
                          ),
                        ),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            locationLine,
                            style: AppTypography.soraRegular(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppColors.onSurfaceMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  SizedBox(height: 18),
                  Center(
                    child: Text(
                      footerLabel,
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurfaceMuted.withValues(alpha: 0.65),
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatPlayerLine(String p1, String p2) {
    final a = p1.trim();
    final b = p2.trim();
    if (a.isEmpty && b.isEmpty) return '—';
    if (a.isEmpty) return b;
    if (b.isEmpty) return a;
    return '$a · $b';
  }

  static String _initials(String name) {
    final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.length >= 2
          ? parts.first.substring(0, 2).toUpperCase()
          : parts.first.toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _ShareCardHeadline extends StatelessWidget {
  const _ShareCardHeadline({required this.line1, required this.line2});

  final String line1;
  final String line2;

  static final TextStyle _style = AppTypography.soraRegular(
    fontSize: 34,
    fontWeight: FontWeight.w800,
    color: AppColors.onSurface,
    height: 1.15,
    letterSpacing: -0.8,
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(line1, textAlign: TextAlign.center, style: _style),
        Text(line2, textAlign: TextAlign.center, style: _style),
      ],
    );
  }
}

class _LogoFallback extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.brand,
            borderRadius: BorderRadius.circular(5),
          ),
          child: Text(
            'N',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.black,
            ),
          ),
        ),
        SizedBox(width: 6),
        Text(
          'nexago',
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
        ),
      ],
    );
  }
}

class _PartnerAvatar extends StatelessWidget {
  const _PartnerAvatar({
    required this.initials,
    required this.size,
    required this.backgroundColor,
    required this.borderColor,
    this.avatarUrl,
    this.borderWidth = 3,
    this.elevated = false,
  });

  final String initials;
  final String? avatarUrl;
  final double size;
  final Color backgroundColor;
  final Color borderColor;
  final double borderWidth;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final resolvedUrl = avatarUrl?.trim();
    final hasPhoto = resolvedUrl != null && resolvedUrl.isNotEmpty;
    final innerSize = size - (borderWidth * 2);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: borderColor, width: borderWidth),
        boxShadow: elevated
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.55),
                  blurRadius: 20,
                  spreadRadius: -2,
                  offset: const Offset(-8, 10),
                ),
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Padding(
        padding: EdgeInsets.all(borderWidth),
        child: ClipOval(
          child: hasPhoto
              ? CachedNetworkImage(
                  imageUrl: resolvedUrl,
                  width: innerSize,
                  height: innerSize,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => _InitialsFallback(
                    initials: initials,
                    size: innerSize,
                    backgroundColor: backgroundColor,
                  ),
                  errorWidget: (_, __, ___) => _InitialsFallback(
                    initials: initials,
                    size: innerSize,
                    backgroundColor: backgroundColor,
                  ),
                )
              : _InitialsFallback(
                  initials: initials,
                  size: innerSize,
                  backgroundColor: backgroundColor,
                ),
        ),
      ),
    );
  }
}

class _InitialsFallback extends StatelessWidget {
  const _InitialsFallback({
    required this.initials,
    required this.size,
    required this.backgroundColor,
  });

  final String initials;
  final double size;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      color: backgroundColor,
      child: Text(
        initials,
        style: AppTypography.mono(
          fontSize: size * 0.28,
          fontWeight: FontWeight.w800,
          color: AppColors.black,
          letterSpacing: -0.5,
        ),
      ),
    );
  }
}

class _TicketDivider extends StatelessWidget {
  const _TicketDivider();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 28,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _DashedLinePainter(
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.3),
              ),
            ),
          ),
          Positioned(left: -10, child: _TicketNotch()),
          Positioned(right: -10, child: _TicketNotch()),
        ],
      ),
    );
  }
}

class _TicketNotch extends StatelessWidget {
  const _TicketNotch();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: AppColors.canvas,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _DashedLinePainter extends CustomPainter {
  _DashedLinePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;
    const dashWidth = 6.0;
    const dashSpace = 5.0;
    double x = 24;
    final y = size.height / 2;
    while (x < size.width - 24) {
      canvas.drawLine(Offset(x, y), Offset(x + dashWidth, y), paint);
      x += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
