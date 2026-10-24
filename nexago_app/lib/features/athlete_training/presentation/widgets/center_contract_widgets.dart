import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/center_contract.dart';

/// Peças dos contratos do CT (protótipo `ct-contratos.jsx`), usadas pelo app
/// do aluno (K6–K9) e pela gestão (K5).

/// Cor do tom da etiqueta (crua: o texto passa por `readableTone`).
Color contractToneColor(ContractTone tone, AppThemeColors colors) =>
    switch (tone) {
      ContractTone.yellow => AppColors.pending,
      ContractTone.orange => AppColors.brand,
      ContractTone.green => AppColors.win,
      ContractTone.red => AppColors.live,
      ContractTone.dim => ProfessorLinksStyle.dim(colors),
    };

/// Etiqueta da situação ("Assinado", "Aberto · não assinado"…).
class ContractStateTag extends StatelessWidget {
  const ContractStateTag(this.state, {super.key, this.label});

  final ContractState state;

  /// Troca o rótulo padrão (ex.: "Pendente" no app do aluno).
  final String? label;

  @override
  Widget build(BuildContext context) => ArenaClassTag(
        label: label ?? contractStateLabel(state),
        color: contractToneColor(contractStateTone(state), context.themeColors),
      );
}

/// Linha de documento: ícone na cor da situação, título, linha de apoio e a
/// etiqueta à direita.
class ContractDocRow extends StatelessWidget {
  const ContractDocRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.color,
    this.trailing,
    this.onTap,
    this.first = false,
  });

  final String title;
  final String subtitle;
  final Color color;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors))),
        ),
        child: Row(
          children: [
            Icon(
              Icons.description_outlined,
              size: 19,
              color: colors.readableTone(color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (onTap != null) ...[
              const SizedBox(width: 6),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Bloco de linhas de documento dentro de um card.
class ContractDocList extends StatelessWidget {
  const ContractDocList({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ProfessorLinksCard(
        padding: EdgeInsets.zero,
        child: Column(children: children),
      );
}

/// Card de destaque laranja (contrato para assinar / pendente).
class ContractHighlightCard extends StatelessWidget {
  const ContractHighlightCard({super.key, required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              stops: const [0, 0.62],
              colors: [
                AppColors.brand.withValues(alpha: 0.16),
                colors.surfaceCard,
              ],
            ),
          ),
          padding: const EdgeInsets.all(15),
          child: child,
        ),
      ),
    );
  }
}

/// "O essencial" do contrato de matrícula.
class ContractEssentialsCard extends StatelessWidget {
  const ContractEssentialsCard({super.key, required this.rows});

  final List<({String label, String value})> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('contract-essentials'),
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ProfessorLinksKicker('O essencial'),
          const SizedBox(height: 4),
          for (final (i, r) in rows.indexed)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(
                        top:
                            BorderSide(color: ProfessorLinksStyle.line(colors)),
                      ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.label,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      r.value,
                      textAlign: TextAlign.right,
                      style: ProfessorLinksStyle.display(
                        12.5,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Folha do contrato: papel claro (#F5F3EE) nos dois temas, com o texto
/// congelado (`# ` = título, linha em branco = parágrafo) e, quando assinado,
/// as assinaturas no pé.
class ContractPaper extends StatelessWidget {
  const ContractPaper({
    super.key,
    required this.title,
    required this.meta,
    required this.body,
    this.signatures = const [],
  });

  static const Color paper = Color(0xFFF5F3EE);
  static const Color ink = Color(0xFF0A0A0A);
  static const Color text = Color(0xFF2A2A2A);
  static const Color faint = Color(0xFF666666);

  final String title;

  /// Linha mono do cabeçalho: "CTR-2026-0418 · v3".
  final String meta;
  final String body;

  /// (nome, linha de apoio) de cada assinatura.
  final List<(String, String)> signatures;

  @override
  Widget build(BuildContext context) {
    final blocks = parseContractBody(body);
    return Container(
      key: const Key('contract-paper'),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
      decoration: BoxDecoration(
        color: paper,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: ProfessorLinksStyle.display(14, color: ink),
          ),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              meta.toUpperCase(),
              style: ProfessorLinksStyle.mono(
                9,
                weight: FontWeight.w500,
                color: faint,
              ),
            ),
          ],
          const SizedBox(height: 12),
          const Divider(height: 1, color: Color(0x1F000000)),
          const SizedBox(height: 6),
          if (blocks.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text(
                'O texto deste documento não veio. Fale com o centro.',
                style: AppTypography.bodyS.copyWith(color: text),
              ),
            ),
          for (final b in blocks)
            if (b.isHeading)
              Padding(
                padding: const EdgeInsets.only(top: 10, bottom: 4),
                child: Text(
                  b.text,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w700,
                    color: ink,
                  ),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  b.text,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    height: 1.6,
                    color: text,
                  ),
                ),
              ),
          if (signatures.isNotEmpty) ...[
            const SizedBox(height: 6),
            const Divider(height: 1, color: Color(0x1F000000)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 18,
              runSpacing: 12,
              children: [
                for (final (name, sub) in signatures)
                  SizedBox(
                    width: 138,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: ProfessorLinksStyle.display(
                            12,
                            weight: FontWeight.w700,
                            color: ink,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          sub,
                          style: ProfessorLinksStyle.mono(
                            9,
                            weight: FontWeight.w500,
                            color: faint,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}
