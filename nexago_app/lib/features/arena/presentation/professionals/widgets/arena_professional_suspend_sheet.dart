import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../../professor_links/domain/professor_link_rules.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../domain/professionals/arena_professionals_logic.dart';
import '../../../domain/professionals/arena_professionals_providers.dart';
import '../../../domain/professionals/arena_professionals_repository.dart';
import 'arena_professionals_ui.dart';

/// A5 · Suspender vínculo — motivo obrigatório (vai para o professor junto com
/// os detalhes); revoga as permissões sem apagar a configuração, que volta na
/// reativação. Devolve `true` quando suspendeu.
Future<bool> showArenaProfessorSuspendSheet(
  BuildContext context, {
  required ArenaProfessorLink link,
}) async {
  final done = await showProfessorLinksSheet<bool>(
    context,
    builder: (_) => ArenaProfessorSuspendSheet(link: link),
  );
  return done == true;
}

class ArenaProfessorSuspendSheet extends ConsumerStatefulWidget {
  const ArenaProfessorSuspendSheet({super.key, required this.link});

  final ArenaProfessorLink link;

  @override
  ConsumerState<ArenaProfessorSuspendSheet> createState() =>
      _ArenaProfessorSuspendSheetState();
}

class _ArenaProfessorSuspendSheetState
    extends ConsumerState<ArenaProfessorSuspendSheet> {
  final _details = TextEditingController();
  String? _reason;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    final reason = _reason;
    if (reason == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(arenaProfessionalsRepositoryProvider).suspend(
            linkId: widget.link.id,
            reason: reason,
            details: _details.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Não foi possível suspender o vínculo. Tente de novo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final link = widget.link;
    final first = arenaProfessorFirstName(link.professorName);
    return ProfessorLinksSheetBody(
      title: 'Suspender vínculo',
      subtitle: '${link.professorName} · ${professorLinkTypeLabel(link.type)}',
      children: [
        if (_error != null) ArenaProfessorErrorBanner(_error!),
        const ProfessorLinksKicker('Motivo'),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final reason in arenaProfessorSuspensionReasons)
              ArenaProfessorFilterChip(
                key: Key('arena-professor-suspend-reason-$reason'),
                label: reason,
                selected: _reason == reason,
                onTap: () {
                  if (!_busy) setState(() => _reason = reason);
                },
              ),
          ],
        ),
        const SizedBox(height: 2),
        const ProfessorLinksKicker('Detalhes (enviado ao professor)'),
        TextField(
          key: const Key('arena-professor-suspend-details'),
          controller: _details,
          enabled: !_busy,
          maxLength: 500,
          minLines: 2,
          maxLines: 4,
          textCapitalization: TextCapitalization.sentences,
          style: AppTypography.bodyM.copyWith(
            fontSize: 13,
            color: colors.onSurface,
          ),
          decoration: arenaProfessorInputDecoration(
            context,
            hint: 'Ex.: 3 reservas de setembro em aberto. Reativamos assim '
                'que forem quitadas.',
          ),
        ),
        const ProfessorLinksKicker('O que acontece'),
        _Effect(
          title: 'Permissões revogadas',
          text: 'As permissões deste vínculo deixam de valer e ele sai da '
              'página da arena',
        ),
        _Effect(
          title: 'Outras arenas',
          text: 'Os vínculos de $first com outras arenas não mudam',
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 52,
          width: double.infinity,
          child: FilledButton(
            key: const Key('arena-professor-suspend-confirm'),
            onPressed: _reason == null || _busy ? null : _confirm,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.live,
              foregroundColor: Colors.white,
              disabledBackgroundColor: AppColors.live.withValues(alpha: 0.3),
              disabledForegroundColor: Colors.white.withValues(alpha: 0.7),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    'Suspender e notificar',
                    style: AppTypography.labelL.copyWith(
                      fontSize: 14.5,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
        ProfessorLinksGhostButton(
          label: 'Cancelar',
          height: 46,
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}

class _Effect extends StatelessWidget {
  const _Effect({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(top: 7, right: 10),
          decoration: const BoxDecoration(
            color: AppColors.live,
            shape: BoxShape.circle,
          ),
        ),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: title,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                TextSpan(
                  text: ' · $text',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
