import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/benefits_club_premium_logic.dart';
import '../../domain/my_benefits.dart';
import 'benefits_club_parts.dart';
import 'partner_visuals.dart';

/// O que a carteirinha mostra; tudo vem do perfil e da conta, nada inventado.
class MemberCardData {
  const MemberCardData({
    required this.name,
    required this.code,
    this.photoUrl,
    this.memberSince,
    this.sportLevel = '',
    this.savings = BenefitSavings.none,
  });

  final String name;
  final String code;
  final String? photoUrl;

  /// Data de criação da conta; `null` = a linha "Membro desde" some.
  final DateTime? memberSince;

  /// "Beach Tennis · Intermediário 2"; vazio = o selo some.
  final String sportLevel;

  /// Só aparece com resgate confirmado pelo parceiro.
  final BenefitSavings savings;
}

/// Carteirinha do membro no topo do clube: nome, foto, "Membro desde",
/// nível no esporte principal, código e o botão do QR. A economia só aparece
/// com resgate confirmado.
class BenefitsMemberCard extends StatelessWidget {
  const BenefitsMemberCard({
    super.key,
    required this.data,
    required this.onShowQr,
  });

  static const Key cardKey = Key('benefits-member-card');
  static const Key savingsKey = Key('benefits-member-savings');
  static const Key qrButtonKey = Key('benefits-member-qr');

  final MemberCardData data;
  final VoidCallback onShowQr;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final since = data.memberSince;
    return Semantics(
      key: cardKey,
      container: true,
      label: 'Sua carteirinha de membro',
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: AppRadii.xlAll,
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.38)),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: const Alignment(0.2, 1),
            colors: [
              Color.alphaBlend(
                AppColors.brand.withValues(alpha: 0.14),
                colors.surfaceCard,
              ),
              colors.surfaceCard,
            ],
          ),
        ),
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                BenefitsEyebrow('Nexa · Membro', color: colors.brandText),
                const Spacer(),
                if (data.sportLevel.isNotEmpty)
                  Flexible(flex: 3, child: _LevelPill(data.sportLevel)),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                MemberAvatar(name: data.name, photoUrl: data.photoUrl),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        data.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      if (since != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          memberSinceLabel(since),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            if (data.savings.hasConfirmed) ...[
              const SizedBox(height: AppSpacing.md),
              Row(
                key: savingsKey,
                children: [
                  Expanded(
                    child: Text(
                      'Economia confirmada pelos parceiros',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ),
                  Text(
                    formatBRLFromCents(data.savings.totalDiscountCents),
                    style: AppTypography.mono(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.win,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            _DashedDivider(color: colors.onSurface.withValues(alpha: 0.16)),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const BenefitsEyebrow('Seu código'),
                      const SizedBox(height: 3),
                      Text(
                        data.code,
                        style: AppTypography.mono(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.8,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                FilledButton.icon(
                  key: qrButtonKey,
                  onPressed: onShowQr,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, benefitsTapTarget),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppRadii.mdAll,
                    ),
                  ),
                  icon: const Icon(Icons.qr_code_2_rounded, size: 18),
                  label: Text(
                    'Mostrar QR',
                    style: AppTypography.labelL.copyWith(fontSize: 13),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LevelPill extends StatelessWidget {
  const _LevelPill(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        height: 24,
        padding: const EdgeInsets.symmetric(horizontal: 9),
        decoration: BoxDecoration(
          color: colors.onSurface.withValues(alpha: 0.04),
          borderRadius: AppRadii.pillAll,
          border: Border.all(color: colors.onSurface.withValues(alpha: 0.14)),
        ),
        alignment: Alignment.center,
        child: Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.bodyS.copyWith(
            fontSize: benefitsMinFontSize,
            fontWeight: FontWeight.w600,
            color: colors.onSurface.withValues(alpha: 0.8),
          ),
        ),
      ),
    );
  }
}

class _DashedDivider extends StatelessWidget {
  const _DashedDivider({required this.color});

  final Color color;

  static const double _dash = 5;
  static const double _gap = 4;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final count = (constraints.maxWidth / (_dash + _gap)).floor();
      return Row(
        children: [
          for (var i = 0; i < count; i++) ...[
            Container(width: _dash, height: 1, color: color),
            if (i < count - 1) const SizedBox(width: _gap),
          ],
        ],
      );
    },
  );
}

/// Foto redonda com contorno laranja ou, sem foto, as iniciais.
class MemberAvatar extends StatelessWidget {
  const MemberAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.size = 52,
  });

  final String name;
  final String? photoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final initials = Center(
      child: Text(
        memberInitials(name),
        style: AppTypography.soraRegular(
          fontSize: size * 0.32,
          fontWeight: FontWeight.w800,
          color: colors.brandText,
        ),
      ),
    );
    final url = photoUrl;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Color.alphaBlend(
            AppColors.brand.withValues(alpha: 0.14),
            colors.surfaceRaised,
          ),
          border: Border.all(color: AppColors.brand, width: 2),
        ),
        child: url == null || url.isEmpty
            ? initials
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                memCacheWidth: (size * 3).round(),
                placeholder: (_, __) => initials,
                errorWidget: (_, __, ___) => initials,
              ),
      ),
    );
  }
}

/// Folha "Seu código de membro": QR do código, quem é e o "Copiar".
Future<void> showBenefitsQrSheet(
  BuildContext context, {
  required MemberCardData data,
  required VoidCallback onCopy,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  backgroundColor: context.themeColors.surfaceSheet,
  builder: (context) => _QrSheet(data: data, onCopy: onCopy),
);

class _QrSheet extends StatelessWidget {
  const _QrSheet({required this.data, required this.onCopy});

  static const double _qrSize = 220;

  final MemberCardData data;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final since = data.memberSince;
    final meta = [
      if (since != null) memberSinceLabel(since),
      if (data.sportLevel.isNotEmpty) data.sportLevel,
    ].join(' · ');
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                'Seu código de membro',
                style: AppTypography.titleM.copyWith(color: colors.onSurface),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Mostre no balcão do parceiro. O código é só seu.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                color: colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Center(
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: const BoxDecoration(
                  color: AppColors.white,
                  borderRadius: AppRadii.lgAll,
                ),
                child: QrImageView(
                  key: const Key('benefits-member-qr-image'),
                  data: data.code,
                  semanticsLabel: 'QR do código ${data.code}',
                  size: _qrSize,
                  padding: EdgeInsets.zero,
                  backgroundColor: AppColors.white,
                  eyeStyle: const QrEyeStyle(
                    eyeShape: QrEyeShape.square,
                    color: AppColors.black,
                  ),
                  dataModuleStyle: const QrDataModuleStyle(
                    dataModuleShape: QrDataModuleShape.square,
                    color: AppColors.black,
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                MemberAvatar(
                  name: data.name,
                  photoUrl: data.photoUrl,
                  size: 40,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        data.name,
                        style: AppTypography.titleS.copyWith(
                          color: colors.onSurface,
                        ),
                      ),
                      if (meta.isNotEmpty)
                        Text(
                          meta,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            BenefitCodeRow(
              label: 'Código',
              code: data.code,
              onCopy: onCopy,
              copyKey: const Key('benefits-qr-copy'),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  side: AppBorders.strongSide(colors),
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppRadii.mdAll,
                  ),
                ),
                child: Text(
                  'Fechar',
                  style: AppTypography.labelL.copyWith(color: colors.onSurface),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Linha do código com o botão "Copiar" (borda tracejada laranja do
/// desenho, aqui contínua).
class BenefitCodeRow extends StatelessWidget {
  const BenefitCodeRow({
    super.key,
    required this.label,
    required this.code,
    required this.onCopy,
    this.copyKey,
  });

  final String label;
  final String code;
  final VoidCallback onCopy;
  final Key? copyKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.06),
        borderRadius: AppRadii.lgAll,
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.6),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BenefitsEyebrow(label),
                const SizedBox(height: 2),
                SelectableText(
                  code,
                  style: AppTypography.mono(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.4,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          BenefitCopyButton(buttonKey: copyKey, onTap: onCopy),
        ],
      ),
    );
  }
}

/// Botão "Copiar" das caixas de código.
class BenefitCopyButton extends StatelessWidget {
  const BenefitCopyButton({
    super.key,
    required this.onTap,
    this.buttonKey,
    this.label = 'Copiar',
    this.icon = Icons.copy_rounded,
    this.busy = false,
  });

  final VoidCallback? onTap;
  final Key? buttonKey;
  final String label;
  final IconData icon;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.mdAll,
        side: AppBorders.strongSide(colors),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: buttonKey,
        onTap: busy ? null : onTap,
        child: Container(
          height: benefitsTapTarget,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          child: busy
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.onSurface,
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 16, color: colors.onSurface),
                    const SizedBox(width: 7),
                    Text(
                      label,
                      style: AppTypography.labelL.copyWith(
                        fontSize: 13,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
