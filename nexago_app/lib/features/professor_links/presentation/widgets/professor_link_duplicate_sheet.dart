import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/professor_links_providers.dart';
import '../../domain/professor_link_rules.dart';
import 'professor_links_ui.dart';

/// M5 — o pedido esbarrou num vínculo em aberto com a arena. Devolve `true`
/// quando a pessoa quer ver o pedido/convite/vínculo atual.
Future<bool> showProfessorLinkDuplicateSheet(
  BuildContext context, {
  required ProfessorLinkDuplicate duplicate,
  required String arenaName,
  String? arenaLogoUrl,
}) async {
  final open = await showProfessorLinksSheet<bool>(
    context,
    builder: (_) => ProfessorLinkDuplicateSheet(
      duplicate: duplicate,
      arenaName: arenaName,
      arenaLogoUrl: arenaLogoUrl,
    ),
  );
  return open == true;
}

class ProfessorLinkDuplicateSheet extends ConsumerWidget {
  const ProfessorLinkDuplicateSheet({
    super.key,
    required this.duplicate,
    required this.arenaName,
    this.arenaLogoUrl,
  });

  final ProfessorLinkDuplicate duplicate;
  final String arenaName;
  final String? arenaLogoUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = ref.watch(professorLinksClockProvider)();
    // O vínculo atual ao vivo (tipo e data); sem ele, o status dos `details`.
    final link = ref.watch(professorLinkProvider(duplicate.linkId)).valueOrNull;
    final status = link == null
        ? duplicate.status
        : effectiveProfessorLinkStatus(link, now);
    final dateLine = link == null ? null : professorLinkDateLine(link, now);
    final detail = link == null
        ? null
        : [
            professorLinkTypeLabel(link.type),
            if (dateLine != null)
              '${dateLine[0].toLowerCase()}${dateLine.substring(1)}',
          ].join(' · ');
    return ProfessorLinksSheetBody(
      title: duplicate.title,
      subtitle: arenaName,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: ProfessorLinksStyle.soft(colors),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: ProfessorLinksStyle.line(colors)),
          ),
          child: Row(
            children: [
              ProfessorArenaMark(
                name: link?.arenaName ?? arenaName,
                logoUrl: link?.arenaLogoUrl ?? arenaLogoUrl,
                size: 38,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ProfessorLinkStatusLabel(status, small: true),
                    if (detail != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        detail,
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
        ),
        Text(
          duplicate.body,
          style: AppTypography.bodyM.copyWith(
            fontSize: 12.5,
            color: ProfessorLinksStyle.mute(colors),
            height: 1.5,
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-duplicate-open'),
          label: duplicate.primaryLabel,
          onPressed: () => Navigator.of(context).pop(true),
        ),
        ProfessorLinksGhostButton(
          key: const Key('professor-duplicate-close'),
          label: 'Fechar',
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}
