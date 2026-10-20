import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/professor_links_providers.dart';
import '../../domain/arena_professor_link.dart';
import '../../domain/professor_link_rules.dart';
import '../../domain/professor_links_repository.dart';
import 'professor_link_duplicate_sheet.dart';
import 'professor_links_ui.dart';

/// M3 — pedir vínculo a uma arena (página da arena ou vínculo fechado).
///
/// Enviado → "Solicitação enviada" (M4). Vínculo em aberto com a arena →
/// "Você já tem um pedido aqui" (M5), que leva ao vínculo atual. Outros erros
/// ficam na própria folha, com a copy do servidor.
Future<void> startProfessorLinkRequest(
  BuildContext context, {
  required String arenaId,
  required String arenaName,
  String? arenaLogoUrl,
}) async {
  final outcome = await showProfessorLinksSheet<Object>(
    context,
    builder: (_) => ProfessorLinkRequestSheet(
      arenaId: arenaId,
      arenaName: arenaName,
    ),
  );
  if (!context.mounted || outcome == null) return;
  if (outcome is ProfessorLinkResult) {
    if (outcome.linkId.isEmpty) {
      context.pushNamed(AppRouteNames.professorArenas);
      return;
    }
    context.pushNamed(
      AppRouteNames.professorLinkRequestSent,
      pathParameters: {'linkId': outcome.linkId},
    );
    return;
  }
  if (outcome is ProfessorLinkDuplicate) {
    final open = await showProfessorLinkDuplicateSheet(
      context,
      duplicate: outcome,
      arenaName: arenaName,
      arenaLogoUrl: arenaLogoUrl,
    );
    if (!open || !context.mounted) return;
    context.pushNamed(
      AppRouteNames.professorArenaLink,
      pathParameters: {'linkId': outcome.linkId},
    );
  }
}

/// Fecha com o [ProfessorLinkResult] do envio ou com o
/// [ProfessorLinkDuplicate] do vínculo que já existe.
class ProfessorLinkRequestSheet extends ConsumerStatefulWidget {
  const ProfessorLinkRequestSheet({
    super.key,
    required this.arenaId,
    required this.arenaName,
  });

  final String arenaId;
  final String arenaName;

  @override
  ConsumerState<ProfessorLinkRequestSheet> createState() =>
      _ProfessorLinkRequestSheetState();
}

class _ProfessorLinkRequestSheetState
    extends ConsumerState<ProfessorLinkRequestSheet> {
  final _message = TextEditingController();
  ArenaProfessorLinkType? _type;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final type = _type;
    if (type == null) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      final result =
          await ref.read(professorLinksRepositoryProvider).requestLink(
                arenaId: widget.arenaId,
                type: type,
                message: _message.text,
              );
      if (!mounted) return;
      navigator.pop(result);
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      final duplicate = e.duplicate;
      if (duplicate != null) {
        navigator.pop(duplicate);
        return;
      }
      setState(() {
        _sending = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Não foi possível enviar agora. Tente de novo em instantes.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksSheetBody(
      title: 'Solicitar vínculo',
      subtitle: widget.arenaName,
      children: [
        const ProfessorLinksKicker('Como você quer atuar'),
        for (final type in ArenaProfessorLinkType.values)
          _TypeOption(
            type: type,
            selected: _type == type,
            onTap: _sending ? null : () => setState(() => _type = type),
          ),
        const SizedBox(height: 2),
        const ProfessorLinksKicker('Mensagem para a arena'),
        TextField(
          key: const Key('professor-request-message'),
          controller: _message,
          enabled: !_sending,
          maxLength: 500,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          style: AppTypography.bodyM.copyWith(
            fontSize: 13,
            color: colors.onSurface,
          ),
          decoration: InputDecoration(
            hintText:
                'Opcional. Ex.: tenho alunos particulares e queria reservar '
                'aos sábados de manhã.',
            hintMaxLines: 2,
            hintStyle: AppTypography.bodyS.copyWith(
              color: ProfessorLinksStyle.dim(colors),
            ),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.brand),
            ),
          ),
        ),
        const ProfessorLinksNote(
          'Até a aprovação você não pode reservar quadras nem aparecer no '
          'perfil da arena.',
          tone: ProfessorLinksNoteTone.yellow,
        ),
        if (_error != null)
          Text(
            _error!,
            key: const Key('professor-request-error'),
            style: AppTypography.bodyS.copyWith(color: colors.live),
          ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-request-submit'),
          label: 'Enviar solicitação',
          loading: _sending,
          onPressed: _type == null ? null : _send,
        ),
      ],
    );
  }
}

class _TypeOption extends StatelessWidget {
  const _TypeOption({
    required this.type,
    required this.selected,
    required this.onTap,
  });

  final ArenaProfessorLinkType type;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.10)
            : ProfessorLinksStyle.soft(colors),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.45)
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('professor-request-type-${type.wire}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected
                          ? AppColors.brand
                          : ProfessorLinksStyle.line2(colors),
                      width: 1.5,
                    ),
                  ),
                  child: selected
                      ? Center(
                          child: Container(
                            width: 10,
                            height: 10,
                            decoration: const BoxDecoration(
                              color: AppColors.brand,
                              shape: BoxShape.circle,
                            ),
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        professorLinkTypeLabel(type),
                        style: ProfessorLinksStyle.display(
                          13.5,
                          weight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        professorLinkTypeDescription(type),
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
