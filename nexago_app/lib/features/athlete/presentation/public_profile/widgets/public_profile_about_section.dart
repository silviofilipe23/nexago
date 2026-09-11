import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';

/// Seção "Sobre" do perfil público: a bio do atleta sob um título.
///
/// A bio morava solta no header, centralizada sob a identidade. Aqui ela ganha
/// rótulo (o leitor sabe o que está lendo) e alinhamento à esquerda, que é como
/// texto corrido se lê.
///
/// Sem card: é um bloco de leitura no fluxo da página, não um objeto destacado
/// dela.
///
/// Não renderiza nada quando a bio é vazia — mesmo critério das outras seções
/// do perfil, que não mostram placeholder para o que o atleta não preencheu.
class PublicProfileAboutSection extends StatelessWidget {
  const PublicProfileAboutSection({super.key, required this.bio});

  final String bio;

  @override
  Widget build(BuildContext context) {
    final text = bio.trim();
    if (text.isEmpty) return const SizedBox.shrink();

    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xl,
        AppSpacing.screenH,
        0,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sobre',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: AppSpacing.sm + 2),
          Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              height: 1.5,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
