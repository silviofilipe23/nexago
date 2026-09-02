import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Caixa de aviso do wizard — visual escuro com acento âmbar.
///
/// Com [expiresAt] e [totalWindow], vira o relógio de pagamento do protótipo:
/// rótulo "PAGUE EM …" (janela fixa do torneio), countdown mm:ss (tempo
/// restante até [expiresAt]) e barra de progresso. Sem prazo, mostra [child]
/// com ícone (dupla obrigatória, uniforme, etc.).
class RegistrationWizardNotice extends StatefulWidget {
  const RegistrationWizardNotice({
    super.key,
    this.child,
    this.icon = Icons.notifications_none_rounded,
    this.expiresAt,
    this.totalWindow,
  }) : assert(
         (expiresAt != null && totalWindow != null) ||
             (expiresAt == null && child != null),
       );

  final Widget? child;
  final IconData icon;

  /// Prazo absoluto da vaga reservada (`holdExpiresAt` no Firestore).
  final DateTime? expiresAt;

  /// Duração configurada no torneio — denominador da barra e do rótulo
  /// "PAGUE EM …". Não recalcular a partir do tempo restante no mount.
  final Duration? totalWindow;

  @override
  State<RegistrationWizardNotice> createState() =>
      _RegistrationWizardNoticeState();
}

class _RegistrationWizardNoticeState extends State<RegistrationWizardNotice> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.expiresAt != null) {
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = AppColors.pending;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: accent.withValues(alpha: 0.55)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: widget.expiresAt != null
            ? _CountdownBody(
                expiresAt: widget.expiresAt!,
                totalWindow: widget.totalWindow!,
                accent: accent,
                muted: colors.onSurfaceMuted,
              )
            : _InfoBody(
                icon: widget.icon,
                accent: accent,
                child: widget.child!,
              ),
      ),
    );
  }
}

class _InfoBody extends StatelessWidget {
  const _InfoBody({
    required this.icon,
    required this.accent,
    required this.child,
  });

  final IconData icon;
  final Color accent;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: accent),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: DefaultTextStyle.merge(
            style: Theme.of(context).textTheme.bodyMedium!.copyWith(
              color: context.themeColors.onSurface,
              height: 1.45,
            ),
            child: child,
          ),
        ),
      ],
    );
  }
}

class _CountdownBody extends StatelessWidget {
  const _CountdownBody({
    required this.expiresAt,
    required this.totalWindow,
    required this.accent,
    required this.muted,
  });

  final DateTime expiresAt;
  final Duration totalWindow;
  final Color accent;
  final Color muted;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final remaining = expiresAt.difference(now);
    final expired = remaining.inSeconds <= 0;
    final progress = totalWindow.inSeconds <= 0
        ? 0.0
        : expired
        ? 0.0
        : (remaining.inMilliseconds / totalWindow.inMilliseconds).clamp(
            0.0,
            1.0,
          );

    final headline = expired
        ? 'PRAZO ENCERRADO'
        : _headlineLabel(totalWindow);
    final clockLabel = expired
        ? '00:00'
        : _remainingClockLabel(remaining);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Icon(Icons.notifications_none_rounded, size: 20, color: accent),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                headline,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: accent,
                  letterSpacing: 0.6,
                ),
              ),
            ),
            Text(
              clockLabel,
              style: AppTypography.mono(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: accent,
                letterSpacing: 0.5,
                height: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        ClipRRect(
          borderRadius: AppRadii.pillAll,
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 4,
            backgroundColor: muted.withValues(alpha: 0.18),
            valueColor: AlwaysStoppedAnimation<Color>(accent),
          ),
        ),
      ],
    );
  }

  static String _headlineLabel(Duration totalWindow) {
    if (totalWindow.inHours >= 1) {
      final hours = totalWindow.inHours;
      return hours == 1 ? 'PAGUE EM 1 H' : 'PAGUE EM $hours H';
    }
    final minutes = totalWindow.inMinutes.clamp(1, 9999);
    return 'PAGUE EM $minutes MIN';
  }

  static String _remainingClockLabel(Duration remaining) {
    final totalSeconds = remaining.inSeconds.clamp(0, 99 * 3600 + 59 * 60 + 59);
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:'
        '${seconds.toString().padLeft(2, '0')}';
  }
}
