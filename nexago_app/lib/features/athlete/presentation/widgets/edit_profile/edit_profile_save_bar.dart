import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Rodapé fixo de "Editar perfil": o CTA de salvar fica sempre visível.
///
/// O formulário é longo (identidade, contato, bio, destaques, conta) e o botão
/// no fim da rolagem obrigava o atleta a percorrer a tela inteira só para
/// enviar uma alteração feita no topo.
class EditProfileSaveBar extends StatelessWidget {
  const EditProfileSaveBar({
    super.key,
    required this.saving,
    required this.onSave,
  });

  final bool saving;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(
          top: BorderSide(color: colors.outline.withValues(alpha: 0.25)),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
          child: Center(
            child: ConstrainedBox(
              // Mesma largura máxima do formulário: em tablet o CTA não estica
              // sozinho para fora da coluna de campos.
              constraints: const BoxConstraints(maxWidth: 420),
              child: SizedBox(
                height: 52,
                width: double.infinity,
                child: FilledButton(
                  onPressed: saving ? null : onSave,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: colors.canvas,
                    disabledBackgroundColor: colors.surfaceRaised,
                    disabledForegroundColor: colors.onSurfaceMuted,
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppRadii.lgAll,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (saving)
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: colors.onSurfaceMuted,
                          ),
                        )
                      else
                        const Icon(Icons.check_rounded),
                      const SizedBox(width: 10),
                      Text(
                        saving ? 'Salvando…' : 'Salvar alterações',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
