import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Seções de informação do perfil da arena: Sobre, Localização e contato, e
/// Antes de reservar (cancelamento e pagamento). Todas somem quando a arena
/// não informou nada.

/// Título de seção no padrão do perfil da arena ("Quadras", "Avaliações").
class ArenaDetailSectionTitle extends StatelessWidget {
  const ArenaDetailSectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              letterSpacing: -0.3,
            ),
      ),
    );
  }
}

/// "Sobre": a descrição da arena, recolhida em [collapsedLines] linhas com
/// "Ler mais" quando passa disso.
class ArenaDetailAboutSection extends StatefulWidget {
  const ArenaDetailAboutSection({super.key, required this.description});

  static const int collapsedLines = 4;

  final String description;

  @override
  State<ArenaDetailAboutSection> createState() =>
      _ArenaDetailAboutSectionState();
}

class _ArenaDetailAboutSectionState extends State<ArenaDetailAboutSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: colors.onSurfaceMuted,
          height: 1.5,
        );
    final text = widget.description.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ArenaDetailSectionTitle('Sobre'),
        const SizedBox(height: 8),
        LayoutBuilder(
          builder: (context, constraints) {
            final painter = TextPainter(
              text: TextSpan(text: text, style: style),
              maxLines: ArenaDetailAboutSection.collapsedLines,
              textDirection: Directionality.of(context),
              textScaler: MediaQuery.textScalerOf(context),
            )..layout(maxWidth: constraints.maxWidth);
            final overflows = painter.didExceedMaxLines;
            painter.dispose();

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedSize(
                  duration: const Duration(milliseconds: 220),
                  alignment: Alignment.topCenter,
                  child: Text(
                    text,
                    style: style,
                    maxLines: _expanded
                        ? null
                        : ArenaDetailAboutSection.collapsedLines,
                    overflow: _expanded ? null : TextOverflow.ellipsis,
                  ),
                ),
                if (overflows)
                  TextButton(
                    onPressed: () => setState(() => _expanded = !_expanded),
                    style: TextButton.styleFrom(
                      foregroundColor: colors.brandText,
                      padding: const EdgeInsets.only(top: 6),
                      minimumSize: const Size(0, 36),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      _expanded ? 'Ler menos' : 'Ler mais',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// "Localização e contato": endereço, rota no mapa e WhatsApp da arena.
class ArenaDetailLocationSection extends StatelessWidget {
  const ArenaDetailLocationSection({
    super.key,
    required this.address,
    this.onDirections,
    this.onWhatsApp,
  });

  /// Endereço já montado (ver `arenaFullAddress`); `null` = sem endereço.
  final String? address;
  final VoidCallback? onDirections;
  final VoidCallback? onWhatsApp;

  bool get hasContent =>
      address != null || onDirections != null || onWhatsApp != null;

  @override
  Widget build(BuildContext context) {
    if (!hasContent) return const SizedBox.shrink();
    final colors = context.themeColors;
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ArenaDetailSectionTitle('Localização e contato'),
        const SizedBox(height: 12),
        if (address != null)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Icon(
                  Icons.place_outlined,
                  size: 20,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SelectableText(
                  address!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        if (onDirections != null || onWhatsApp != null) ...[
          const SizedBox(height: 14),
          Row(
            children: [
              if (onDirections != null)
                Expanded(
                  child: _ContactButton(
                    icon: Icons.directions_outlined,
                    label: 'Como chegar',
                    onPressed: onDirections!,
                  ),
                ),
              if (onDirections != null && onWhatsApp != null)
                const SizedBox(width: 10),
              if (onWhatsApp != null)
                Expanded(
                  child: _ContactButton(
                    icon: Icons.chat_outlined,
                    label: 'WhatsApp',
                    onPressed: onWhatsApp!,
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _ContactButton extends StatelessWidget {
  const _ContactButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      style: OutlinedButton.styleFrom(
        foregroundColor: colors.onSurface,
        minimumSize: const Size.fromHeight(46),
        side: BorderSide(color: colors.outline.withValues(alpha: 0.6)),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }
}

/// Uma regra do bloco "Antes de reservar".
class ArenaDetailRule {
  const ArenaDetailRule({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;
}

/// "Antes de reservar": o que o atleta precisa saber antes de escolher o
/// horário (cancelamento e formas de pagamento), em vez de descobrir na
/// confirmação.
class ArenaDetailRulesSection extends StatelessWidget {
  const ArenaDetailRulesSection({super.key, required this.rules});

  final List<ArenaDetailRule> rules;

  @override
  Widget build(BuildContext context) {
    if (rules.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ArenaDetailSectionTitle('Antes de reservar'),
        const SizedBox(height: 12),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rules.length; i++) ...[
                if (i > 0)
                  Divider(
                    height: 1,
                    thickness: 1,
                    color: colors.outline.withValues(alpha: 0.35),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        rules[i].icon,
                        size: 20,
                        color: colors.onSurfaceMuted,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              rules[i].title,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              rules[i].subtitle,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colors.onSurfaceMuted,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
