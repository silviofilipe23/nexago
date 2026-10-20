import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_page_header.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_professor_link.dart';
import '../../domain/professor_link_rules.dart';

/// Peças do desenho dos vínculos (protótipo `vc-atoms.jsx` / `vc-prof.jsx`).
/// Tons derivados do tema: secundário 62%, terciário 40%, linha 8%.
abstract final class ProfessorLinksStyle {
  ProfessorLinksStyle._();

  /// Azul do convite e do "Independente".
  static const Color blue = Color(0xFF5B9BFF);

  /// Texto/ícone sobre o laranja da marca.
  static const Color onBrand = Color(0xFF0A0A0A);

  static Color mute(AppThemeColors c) => c.onSurface.withValues(alpha: 0.62);
  static Color dim(AppThemeColors c) => c.onSurface.withValues(alpha: 0.40);
  static Color soft(AppThemeColors c) => c.onSurface.withValues(alpha: 0.05);
  static Color line(AppThemeColors c) => c.onSurface.withValues(alpha: 0.08);
  static Color line2(AppThemeColors c) => c.onSurface.withValues(alpha: 0.14);

  static Color toneColor(ProfessorLinkTone tone, AppThemeColors c) =>
      switch (tone) {
        ProfessorLinkTone.invited => blue,
        ProfessorLinkTone.pending => AppColors.pending,
        ProfessorLinkTone.active => AppColors.win,
        ProfessorLinkTone.danger => AppColors.live,
        ProfessorLinkTone.muted => c.onSurface.withValues(alpha: 0.5),
      };

  static Color statusColor(ArenaProfessorLinkStatus status, AppThemeColors c) =>
      toneColor(professorLinkStatusTone(status), c);

  static TextStyle display(double size, {Color? color, FontWeight? weight}) =>
      AppTypography.soraRegular(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w800,
        letterSpacing: -size * 0.02,
        height: 1.2,
        color: color,
      );

  static TextStyle mono(double size, {Color? color, FontWeight? weight}) =>
      AppTypography.mono(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w700,
        color: color,
      );
}

/// Voltar das telas da feature. Aberta pelo push (`router.go`, sem pilha),
/// cai em Minhas arenas — ou na home, quando já é a lista.
void professorLinksBack(BuildContext context, {bool isList = false}) {
  if (GoRouter.maybeOf(context) == null) {
    Navigator.of(context).maybePop();
    return;
  }
  popOrGo(context, isList ? AppRoutes.home : AppRoutes.professorArenas);
}

/// Tela interna: header fixo (voltar + título + subtítulo mono) e o corpo.
/// Sem tab bar — as rotas ficam fora do shell.
class ProfessorLinksScaffold extends StatelessWidget {
  const ProfessorLinksScaffold({
    super.key,
    required this.title,
    required this.body,
    this.subtitle,
    this.trailing,
    this.onBack,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget body;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Row(
          children: [
            ProfessorLinksRoundButton(
              icon: Icons.arrow_back_rounded,
              semanticLabel: 'Voltar',
              onTap: onBack ?? () => professorLinksBack(context),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      22,
                      color: colors.onSurface,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.mono(
                        10.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ).copyWith(letterSpacing: 0.8),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 12), trailing!],
          ],
        ),
        child: body,
      ),
    );
  }
}

/// Botão redondo de 44px (voltar, fechar, "+").
class ProfessorLinksRoundButton extends StatelessWidget {
  const ProfessorLinksRoundButton({
    super.key,
    required this.icon,
    required this.onTap,
    required this.semanticLabel,
    this.filled = false,
    this.size = 44,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final String semanticLabel;
  final bool filled;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: filled ? AppColors.brand : ProfessorLinksStyle.soft(colors),
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox.square(
            dimension: size,
            child: Icon(
              icon,
              size: size * 0.45,
              color: filled ? ProfessorLinksStyle.onBrand : colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

/// Marca da arena: logo, ou as iniciais no degradê laranja → azul.
class ProfessorArenaMark extends StatelessWidget {
  const ProfessorArenaMark({
    super.key,
    required this.name,
    this.logoUrl,
    this.size = 44,
  });

  final String name;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initials = DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFF8A4A), Color(0xFF2260B8)],
        ),
      ),
      child: Center(
        child: Text(
          professorArenaInitials(name),
          style: ProfessorLinksStyle.display(
            size * 0.3,
            color: Colors.white,
          ).copyWith(letterSpacing: 0),
        ),
      ),
    );
    final url = logoUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.3),
      child: SizedBox.square(
        dimension: size,
        child: url == null || url.isEmpty
            ? initials
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                placeholder: (_, __) => initials,
                errorWidget: (_, __, ___) => initials,
              ),
      ),
    );
  }
}

/// Selo do tipo ("EQUIPE DA ARENA" laranja / "INDEPENDENTE" azul).
class ProfessorLinkTypeTag extends StatelessWidget {
  const ProfessorLinkTypeTag(this.type, {super.key, this.small = false});

  final ArenaProfessorLinkType type;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final color = type == ArenaProfessorLinkType.arenaStaff
        ? AppColors.brandHover
        : ProfessorLinksStyle.blue;
    final background = type == ArenaProfessorLinkType.arenaStaff
        ? AppColors.brand.withValues(alpha: 0.12)
        : ProfessorLinksStyle.blue.withValues(alpha: 0.12);
    return Container(
      height: small ? 20 : 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      // `widthFactor: 1`: o selo abraça o texto mesmo dentro de Column.
      child: Center(
        widthFactor: 1,
        child: Text(
          professorLinkTypeLabel(type).toUpperCase(),
          maxLines: 1,
          style: ProfessorLinksStyle.mono(
            small ? 8.5 : 9.5,
            color: color,
          ).copyWith(letterSpacing: 1),
        ),
      ),
    );
  }
}

/// Ponto colorido + rótulo do status do lado do professor.
class ProfessorLinkStatusLabel extends StatelessWidget {
  const ProfessorLinkStatusLabel(this.status, {super.key, this.small = false});

  final ArenaProfessorLinkStatus status;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final color = ProfessorLinksStyle.statusColor(status, context.themeColors);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            professorLinkStatusLabel(status),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.mono(small ? 10 : 10.5, color: color),
          ),
        ),
      ],
    );
  }
}

/// Rótulo em caixa alta (mono, 10px).
class ProfessorLinksKicker extends StatelessWidget {
  const ProfessorLinksKicker(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.eyebrow.copyWith(
        color: color ?? ProfessorLinksStyle.dim(context.themeColors),
      ),
    );
  }
}

/// Card do desenho: raio 18, borda fina.
class ProfessorLinksCard extends StatelessWidget {
  const ProfessorLinksCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.borderColor,
    this.backgroundColor,
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? borderColor;
  final Color? backgroundColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: borderColor ?? ProfessorLinksStyle.line(colors)),
    );
    return Material(
      color: backgroundColor ?? colors.surfaceCard,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Lista das três permissões com check/x (configuradas ou efetivas).
class ProfessorPermissionList extends StatelessWidget {
  const ProfessorPermissionList({
    super.key,
    required this.permissions,
    this.dense = false,
  });

  final ArenaProfessorPermissions permissions;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        for (var i = 0; i < professorPermissionCatalog.length; i++)
          _PermissionRow(
            info: professorPermissionCatalog[i],
            on: permissions.valueOf(professorPermissionCatalog[i].key),
            dense: dense,
            divider: i > 0,
            colors: colors,
          ),
      ],
    );
  }
}

class _PermissionRow extends StatelessWidget {
  const _PermissionRow({
    required this.info,
    required this.on,
    required this.dense,
    required this.divider,
    required this.colors,
  });

  final ProfessorPermissionInfo info;
  final bool on;
  final bool dense;
  final bool divider;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('professor-permission-${info.key.wire}-${on ? 'on' : 'off'}'),
      padding: EdgeInsets.symmetric(vertical: dense ? 10 : 12),
      decoration: BoxDecoration(
        border: divider
            ? Border(top: BorderSide(color: ProfessorLinksStyle.line(colors)))
            : null,
      ),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: on
                  ? AppColors.win.withValues(alpha: 0.14)
                  : ProfessorLinksStyle.soft(colors),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: on
                    ? AppColors.win.withValues(alpha: 0.4)
                    : ProfessorLinksStyle.line(colors),
              ),
            ),
            child: Icon(
              on ? Icons.check_rounded : Icons.close_rounded,
              size: on ? 13 : 12,
              color: on ? AppColors.win : ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  info.title,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w600,
                    color:
                        on ? colors.onSurface : ProfessorLinksStyle.dim(colors),
                  ),
                ),
                if (!dense) ...[
                  const SizedBox(height: 2),
                  Text(
                    info.description,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum ProfessorLinksNoteTone { neutral, blue, yellow, red }

/// Nota com a barrinha colorida à esquerda.
class ProfessorLinksNote extends StatelessWidget {
  const ProfessorLinksNote(
    this.text, {
    super.key,
    this.tone = ProfessorLinksNoteTone.neutral,
  });

  final String text;
  final ProfessorLinksNoteTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bar = switch (tone) {
      ProfessorLinksNoteTone.blue => ProfessorLinksStyle.blue,
      ProfessorLinksNoteTone.yellow => AppColors.pending,
      ProfessorLinksNoteTone.red => AppColors.live,
      ProfessorLinksNoteTone.neutral => ProfessorLinksStyle.dim(colors),
    };
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 13, 11),
      decoration: BoxDecoration(
        color: ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 3,
              decoration: BoxDecoration(
                color: bar,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: AppTypography.bodyS.copyWith(
                  color: ProfessorLinksStyle.mute(colors),
                  height: 1.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Botão principal laranja.
class ProfessorLinksPrimaryButton extends StatelessWidget {
  const ProfessorLinksPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.height = 52,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: ProfessorLinksStyle.onBrand,
          disabledBackgroundColor: Color.alphaBlend(
            AppColors.brand.withValues(alpha: 0.4),
            context.themeColors.canvas,
          ),
          disabledForegroundColor: ProfessorLinksStyle.onBrand.withValues(
            alpha: 0.7,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: AppTypography.labelL.copyWith(fontSize: 14.5),
        ),
        child: loading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: ProfessorLinksStyle.onBrand,
                ),
              )
            : Text(label, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

/// Botão "fantasma" (fundo suave + borda); [color] pinta o rótulo (vermelho
/// para encerrar/cancelar).
class ProfessorLinksGhostButton extends StatelessWidget {
  const ProfessorLinksGhostButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.color,
    this.loading = false,
    this.height = 48,
  });

  final String label;
  final VoidCallback? onPressed;
  final Color? color;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = color ?? colors.onSurface;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: fg,
          backgroundColor: ProfessorLinksStyle.soft(colors),
          side: BorderSide(color: ProfessorLinksStyle.line2(colors)),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: AppTypography.labelL.copyWith(fontSize: 13.5),
        ),
        child: loading
            ? SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2.2, color: fg),
              )
            : Text(label, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

class ProfessorLinkTimelineEntry {
  const ProfessorLinkTimelineEntry({required this.title, required this.meta});

  final String title;
  final String meta;
}

/// Linha do tempo do histórico: o mais recente em laranja, no topo.
class ProfessorLinkTimeline extends StatelessWidget {
  const ProfessorLinkTimeline({super.key, required this.entries});

  final List<ProfessorLinkTimelineEntry> entries;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        for (var i = 0; i < entries.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 12,
                  child: Column(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        margin: const EdgeInsets.only(top: 4),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color:
                              i == 0 ? AppColors.brand : colors.surfaceRaised,
                          border: Border.all(
                            color: i == 0
                                ? AppColors.brand
                                : ProfessorLinksStyle.line2(colors),
                            width: 2,
                          ),
                        ),
                      ),
                      if (i < entries.length - 1)
                        Expanded(
                          child: Container(
                            width: 1,
                            color: ProfessorLinksStyle.line2(colors),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entries[i].title,
                          style: ProfessorLinksStyle.display(
                            13,
                            weight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          entries[i].meta,
                          style: ProfessorLinksStyle.mono(
                            10,
                            weight: FontWeight.w600,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Folha da feature: rolável e com teto de 85% da tela — sem
/// `isScrollControlled` o Flutter trava a folha em 9/16 e o conteúdo estoura.
Future<T?> showProfessorLinksSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
}) {
  final colors = context.themeColors;
  return showModalBottomSheet<T>(
    context: context,
    // Acima da barra de abas do modo Professor (a aba tem navegador próprio).
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: colors.surfaceSheet,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: builder,
  );
}

/// Corpo padrão da folha: alça, título, subtítulo e o conteúdo rolável (o
/// teclado empurra o conteúdo para cima).
class ProfessorLinksSheetBody extends StatelessWidget {
  const ProfessorLinksSheetBody({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 6),
              decoration: BoxDecoration(
                color: ProfessorLinksStyle.line2(colors),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: ProfessorLinksStyle.display(
                      19,
                      color: colors.onSurface,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle!,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  for (var i = 0; i < children.length; i++) ...[
                    if (i > 0) const SizedBox(height: 12),
                    children[i],
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
