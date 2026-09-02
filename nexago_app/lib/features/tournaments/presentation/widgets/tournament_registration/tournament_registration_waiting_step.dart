import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_registration_logic.dart';
import 'tournament_registration_dashed_border.dart';

class TournamentRegistrationWaitingStep extends StatelessWidget {
  const TournamentRegistrationWaitingStep({
    super.key,
    required this.partner,
    required this.athleteDisplayName,
    required this.athleteInitials,
    this.athleteAvatarUrl,
    this.onResendInvite,
    this.onGuaranteeSpot,
    this.guaranteeSpotLabel = 'Garantir vaga pagando o valor integral',
    this.onCancelRegistration,
    this.onContinueBrowsing,
    this.inviteAccepted = false,
    this.cancelLabel = 'Cancelar inscrição',
    this.partnerPendingSubtitle = 'Pendente',
    this.reservationHoursLabel = '24 horas',
    this.isLoading = false,
  });

  final TournamentRegistrationPartnerCandidate partner;
  final String athleteDisplayName;
  final String athleteInitials;
  final String? athleteAvatarUrl;
  final VoidCallback? onResendInvite;

  /// Ação secundária "garantir a vaga pagando o integral".
  ///
  /// Só faz sentido com reserva solo em aberto e ainda não paga; quem decide
  /// é a tela, e `null` (o default) tira o botão. Ela mora aqui porque, sem
  /// caminho nesta tela, o atleta que reservou sozinho e convidou alguém
  /// ficaria sem nenhuma forma de garantir a vaga enquanto espera.
  final VoidCallback? onGuaranteeSpot;
  final String guaranteeSpotLabel;

  final VoidCallback? onCancelRegistration;
  final VoidCallback? onContinueBrowsing;
  final bool inviteAccepted;

  /// Rótulo da ação destrutiva do rodapé.
  ///
  /// No wizard de inscrição ela cancela o CONVITE, não a inscrição — que nem
  /// existe enquanto o parceiro não aceita. O default preserva o texto antigo
  /// para qualquer uso em que haja mesmo uma inscrição a cancelar.
  final String cancelLabel;

  final String partnerPendingSubtitle;
  final String reservationHoursLabel;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final firstName = partner.name.split(' ').first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(child: _WaitingStatusOrb(confirmed: inviteAccepted)),
        SizedBox(height: 32),
        Center(
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: (inviteAccepted ? AppColors.win : AppColors.pending)
                      .withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: (inviteAccepted ? AppColors.win : AppColors.pending)
                        .withValues(alpha: 0.45),
                  ),
                ),
                child: Text(
                  inviteAccepted ? 'Parceiro confirmou' : 'Aguardando confirmação',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: inviteAccepted ? AppColors.win : AppColors.pending,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
              SizedBox(height: 14),
              Text(
                isLoading
                    ? 'Carregando dupla...'
                    : inviteAccepted
                        ? '$firstName aceitou!\nSigam para o pagamento.'
                        : '$firstName recebeu\nseu convite.',
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.1,
                  letterSpacing: -0.4,
                ),
              ),
              SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: isLoading
                    ? const _SkeletonLine(width: 260)
                    : Text.rich(
                        TextSpan(
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.5,
                            fontWeight: FontWeight.w500,
                          ),
                          children: [
                            const TextSpan(
                              text:
                                  'Avisamos pelo app e por celular. Sua vaga fica reservada por ',
                            ),
                            TextSpan(
                              text: reservationHoursLabel,
                              style: TextStyle(
                                color: AppColors.pending,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const TextSpan(text: '.'),
                          ],
                        ),
                        textAlign: TextAlign.center,
                      ),
              ),
            ],
          ),
        ),
        SizedBox(height: 32),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'SUA DUPLA',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.5),
                  letterSpacing: 1.4,
                ),
              ),
              SizedBox(height: 14),
              _DuoRow(
                initials: athleteInitials,
                name: athleteDisplayName,
                subtitle: 'Você · confirmado',
                confirmed: true,
                avatarUrl: athleteAvatarUrl,
                loading: isLoading,
              ),
              Divider(
                height: 24,
                color: Colors.white.withValues(alpha: 0.08),
              ),
              _DuoRow(
                initials: partner.initials,
                name: partner.name,
                subtitle: partnerPendingSubtitle,
                confirmed: inviteAccepted,
                dashedAvatar: !inviteAccepted,
                avatarUrl: partner.avatarUrl,
                loading: isLoading,
              ),
            ],
          ),
        ),
        SizedBox(height: 24),
        FilledButton(
          onPressed: isLoading ? null : onContinueBrowsing,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: Text(
            'Continuar no app',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        // Sem [onResendInvite] o botão sai da tela: um "Reenviar convite"
        // permanentemente cinza é pior que não oferecer a ação.
        if (!inviteAccepted && onResendInvite != null) ...[
          SizedBox(height: 10),
          OutlinedButton(
            onPressed: isLoading ? null : onResendInvite,
            style: OutlinedButton.styleFrom(
              foregroundColor: context.themeColors.onSurface,
              side: BorderSide(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
              ),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              'Reenviar convite',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
        if (onGuaranteeSpot != null) ...[
          SizedBox(height: 10),
          OutlinedButton(
            onPressed: isLoading ? null : onGuaranteeSpot,
            style: OutlinedButton.styleFrom(
              foregroundColor: context.themeColors.onSurface,
              side: BorderSide(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
              ),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              guaranteeSpotLabel,
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
        // Depois do aceite não há convite a cancelar, e a tela está de saída
        // para o pagamento: manter o botão só abriria uma janela de clique
        // sem efeito nenhum.
        if (!inviteAccepted)
          TextButton(
            onPressed: isLoading ? null : onCancelRegistration,
            child: Text(
              cancelLabel,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}

class _DuoRow extends StatelessWidget {
  const _DuoRow({
    required this.initials,
    required this.name,
    required this.subtitle,
    required this.confirmed,
    this.dashedAvatar = false,
    this.avatarUrl,
    this.loading = false,
  });

  final String initials;
  final String name;
  final String subtitle;
  final bool confirmed;
  final bool dashedAvatar;
  final String? avatarUrl;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final resolvedAvatarUrl = avatarUrl?.trim();
    final hasAvatar = resolvedAvatarUrl != null && resolvedAvatarUrl.isNotEmpty;
    Widget avatar;
    if (loading) {
      avatar = _SkeletonCircle(size: 40, dashed: dashedAvatar);
    } else if (dashedAvatar) {
      avatar = TournamentRegistrationDashedBorder(
        radius: 20,
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          child: hasAvatar
              ? ClipOval(
                  child: Image.network(
                    resolvedAvatarUrl,
                    width: 40,
                    height: 40,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => _AvatarInitials(
                      initials: initials,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                )
              : Text(
                  initials,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
        ),
      );
    } else {
      avatar = Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.brand, Color(0xFFCC0000)],
          ),
        ),
        child: hasAvatar
            ? ClipOval(
                child: Image.network(
                  resolvedAvatarUrl,
                  width: 40,
                  height: 40,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => _AvatarInitials(
                    initials: initials,
                    color: AppColors.white,
                  ),
                ),
              )
            : Text(
                initials,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.white,
                ),
              ),
      );
    }

    return Row(
      children: [
        avatar,
        SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (loading) ...[
                const _SkeletonLine(width: 132, height: 12),
                SizedBox(height: 6),
                const _SkeletonLine(width: 94, height: 10),
              ] else ...[
                Text(
                  name,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: dashedAvatar
                        ? context.themeColors.onSurfaceMuted
                        : context.themeColors.onSurface,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: dashedAvatar
                        ? AppColors.pending
                        : context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (confirmed && !loading)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.win.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              Icons.check_rounded,
              size: 16,
              color: AppColors.win,
            ),
          ),
      ],
    );
  }
}

class _WaitingStatusOrb extends StatelessWidget {
  const _WaitingStatusOrb({required this.confirmed});

  final bool confirmed;

  @override
  Widget build(BuildContext context) {
    if (confirmed) {
      return const _ConfirmedOrb();
    }
    return const _WaitingPulseOrb();
  }
}

class _ConfirmedOrb extends StatelessWidget {
  const _ConfirmedOrb();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      height: 160,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.win.withValues(alpha: 0.08),
            ),
          ),
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.win.withValues(alpha: 0.14),
            ),
          ),
          Container(
            width: 100,
            height: 100,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.win,
              boxShadow: [
                BoxShadow(
                  color: AppColors.win.withValues(alpha: 0.38),
                  blurRadius: 40,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Icon(
              Icons.check_rounded,
              size: 48,
              color: AppColors.black,
            ),
          ),
        ],
      ),
    );
  }
}

class _WaitingPulseOrb extends StatefulWidget {
  const _WaitingPulseOrb();

  @override
  State<_WaitingPulseOrb> createState() => _WaitingPulseOrbState();
}

class _WaitingPulseOrbState extends State<_WaitingPulseOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  late final Animation<double> _outerScale = Tween<double>(
    begin: 0.96,
    end: 1.05,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  late final Animation<double> _middleScale = Tween<double>(
    begin: 0.97,
    end: 1.03,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  late final Animation<double> _coreScale = Tween<double>(
    begin: 0.985,
    end: 1.02,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // "Reduzir movimento" do sistema desliga o pulso. Não basta ignorar o
    // valor: um controller em `repeat()` agenda frames para sempre — é o que
    // trava `pumpAndSettle` em qualquer teste que renderize esta tela.
    if (MediaQuery.disableAnimationsOf(context)) {
      if (_controller.isAnimating) _controller.stop();
      // Repouso do controller (0), não a ponta alta dos tweens (1): parar em
      // 1 deixaria o orbe 5% maior para sempre.
      _controller.value = 0;
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        return SizedBox(
          width: 160,
          height: 160,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Transform.scale(
                scale: _outerScale.value,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.pending.withValues(alpha: 0.08),
                  ),
                ),
              ),
              Transform.scale(
                scale: _middleScale.value,
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.pending.withValues(alpha: 0.14),
                  ),
                ),
              ),
              Transform.scale(
                scale: _coreScale.value,
                child: Container(
                  width: 100,
                  height: 100,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.pending,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.pending.withValues(alpha: 0.4),
                        blurRadius: 40,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: Icon(
                    Icons.schedule_rounded,
                    size: 44,
                    color: AppColors.black,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _AvatarInitials extends StatelessWidget {
  const _AvatarInitials({
    required this.initials,
    required this.color,
  });

  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Text(
      initials,
      style: AppTypography.mono(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: color,
      ),
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  const _SkeletonLine({required this.width, this.height = 12});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
    );
  }
}

class _SkeletonCircle extends StatelessWidget {
  const _SkeletonCircle({required this.size, this.dashed = false});

  final double size;
  final bool dashed;

  @override
  Widget build(BuildContext context) {
    final child = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.16),
      ),
    );
    if (!dashed) return child;
    return TournamentRegistrationDashedBorder(radius: size / 2, child: child);
  }
}
