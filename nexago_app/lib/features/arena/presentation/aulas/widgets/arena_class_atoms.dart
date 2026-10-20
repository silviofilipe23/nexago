import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import '../../../domain/aulas/arena_class.dart';

/// Azul do tipo "Dupla" no protótipo (não existe token equivalente).
const Color _duplaBlue = Color(0xFF5B9BFF);

/// `#RRGGBB` do professor → cor; inválido cai no laranja da marca.
Color arenaClassTeacherColor(String hex) {
  final clean = hex.replaceFirst('#', '').trim();
  final value = int.tryParse(clean, radix: 16);
  if (clean.length != 6 || value == null) return AppColors.brand;
  return Color(0xFF000000 | value);
}

/// Etiqueta do tipo da aula (TURMA, PARTICULAR, DUPLA, EXPERIMENTAL).
class ArenaClassTypeTag extends StatelessWidget {
  const ArenaClassTypeTag({super.key, required this.type});

  final ArenaClassType type;

  @override
  Widget build(BuildContext context) {
    final color = switch (type) {
      ArenaClassType.turma => context.themeColors.onSurface,
      ArenaClassType.particular => AppColors.brandHover,
      ArenaClassType.dupla => _duplaBlue,
      ArenaClassType.experimental => AppColors.pending,
    };
    return ArenaClassTag(
      label: type.label,
      color: color,
      background: type == ArenaClassType.turma
          ? context.themeColors.onSurface.withValues(alpha: 0.06)
          : color.withValues(alpha: 0.12),
    );
  }
}

/// Etiqueta mono em caixa alta (tipo, status).
class ArenaClassTag extends StatelessWidget {
  const ArenaClassTag({
    super.key,
    required this.label,
    required this.color,
    this.background,
  });

  final String label;
  final Color color;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 18,
      padding: const EdgeInsets.symmetric(horizontal: 7),
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Center(
        widthFactor: 1,
        child: Text(
          label.toUpperCase(),
          style: AppTypography.mono(
            color: context.themeColors.readableTone(color),
            fontSize: 8.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.9,
          ),
        ),
      ),
    );
  }
}

/// Bolinha com a cor do professor.
class ArenaClassTeacherDot extends StatelessWidget {
  const ArenaClassTeacherDot({super.key, required this.color, this.size = 7});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

/// Avatar redondo: foto do atleta ou iniciais na cor de destaque.
///
/// Com [zoomName], o avatar COM foto vira botão e abre a foto inteira para a
/// arena conferir quem é a pessoa ([zoomRole] e [zoomMeta] saem junto do
/// nome). Sem foto não há o que ampliar: as iniciais seguem sem toque. Dentro
/// de uma linha tocável, o toque no avatar abre a foto e não a linha.
class ArenaClassAvatar extends StatelessWidget {
  const ArenaClassAvatar({
    super.key,
    required this.initials,
    this.photoUrl,
    this.size = 38,
    this.color = AppColors.brand,
    this.zoomName,
    this.zoomRole = 'Aluno',
    this.zoomMeta,
  });

  final String initials;
  final String? photoUrl;
  final double size;
  final Color color;
  final String? zoomName;
  final String zoomRole;
  final String? zoomMeta;

  @override
  Widget build(BuildContext context) {
    final trimmed = photoUrl?.trim() ?? '';
    final url = trimmed.isEmpty ? null : trimmed;
    final name = zoomName?.trim() ?? '';
    final avatar = _avatar(url, context.themeColors.readableTone(color));
    if (url == null || name.isEmpty) return avatar;
    // Nó próprio: sem ele o rótulo se funde com o nome ao lado e o leitor
    // de tela (e o toque pela semântica) cai fora da foto.
    return Semantics(
      container: true,
      button: true,
      label: 'Ver foto de $name',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => openProfilePhotoViewer(
          context,
          photoUrls: [url],
          name: name,
          role: zoomRole,
          meta: zoomMeta,
        ),
        child: avatar,
      ),
    );
  }

  /// [ink]: as iniciais no tom legível do tema; o disco fica no cru.
  Widget _avatar(String? url, Color ink) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color.withValues(alpha: 0.33)),
      ),
      child: url != null
          ? Image.network(
              url,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _initials(ink),
            )
          : _initials(ink),
    );
  }

  Widget _initials(Color ink) => Text(
        initials,
        style: AppTypography.soraRegular(
          fontSize: size * 0.34,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
      );
}

/// Cabeçalho das telas de Aulas: voltar + eyebrow + título (+ ação à direita).
class ArenaClassHeader extends StatelessWidget {
  const ArenaClassHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.onBack,
    this.subtitle,
    this.trailing,
    this.large = false,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;
  final VoidCallback onBack;
  final Widget? trailing;

  /// Título grande à esquerda (tela raiz) em vez de centralizado (detalhe).
  final bool large;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final titleStyle = Theme.of(context).textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w800,
          color: colors.onSurface,
          letterSpacing: large ? -0.5 : -0.2,
          fontSize: large ? 26 : 17,
          height: 1.1,
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 8),
      child: Row(
        crossAxisAlignment:
            large ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: [
          Material(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              child: SizedBox(
                width: 44,
                height: 44,
                child: Icon(
                  Icons.arrow_back_rounded,
                  color: colors.onSurface,
                  semanticLabel: 'Voltar',
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  large ? CrossAxisAlignment.start : CrossAxisAlignment.center,
              children: [
                Text(
                  eyebrow,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    fontSize: 10.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: titleStyle,
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      color: colors.onSurfaceMuted,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          trailing ?? const SizedBox(width: 44),
        ],
      ),
    );
  }
}

/// Controle segmentado (Hoje | Turmas | Alunos | Professores).
class ArenaClassSegmented<T> extends StatelessWidget {
  const ArenaClassSegmented({
    super.key,
    required this.items,
    required this.selected,
    required this.onChanged,
  });

  final List<(T, String)> items;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(13),
        border:
            Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          for (final (value, label) in items)
            Expanded(
              child: Semantics(
                selected: value == selected,
                button: true,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(value),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: value == selected
                          ? colors.surfaceSheet
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    // 4 abas em 375 pt: "Professores" encolhe em vez de cortar.
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        label,
                        maxLines: 1,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: value == selected
                              ? colors.onSurface
                              : colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
