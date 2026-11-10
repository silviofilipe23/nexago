import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/professor_agenda_providers.dart';
import '../../infrastructure/professor_actions_repository.dart';
import '../../domain/professor_extend.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// Fim da aula depois de emendar nesta sessão do app (a Agenda recarrega por trás; a página
/// recebeu a aula pelo `extra` da rota e não relê).
final professorSessionExtendedEndProvider =
    StateProvider.autoDispose.family<String?, String>((ref, sessionId) => null);

/// Card "Emendar +1h" da aula (canvas "professor emenda a aula", 01–04): confirma, chama o
/// servidor e, sem vaga, explica que nada mudou.
class ProfessorExtendCard extends ConsumerStatefulWidget {
  const ProfessorExtendCard({
    super.key,
    required this.sessionId,
    required this.courtName,
    required this.endTime,
  });

  final String sessionId;
  final String courtName;

  /// Fim atual da aula.
  final String endTime;

  @override
  ConsumerState<ProfessorExtendCard> createState() => _ProfessorExtendCardState();
}

class _ProfessorExtendCardState extends ConsumerState<ProfessorExtendCard> {
  bool _busy = false;

  String get _court => widget.courtName.trim().isEmpty ? 'quadra' : widget.courtName.trim();

  Future<void> _extend() async {
    final newEnd = professorExtendedEnd(widget.endTime);
    if (_busy || newEnd == null) return;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _ConfirmSheet(court: _court, from: widget.endTime, to: newEnd),
    );
    if (ok != true || !mounted) return;
    HapticFeedback.selectionClick();
    setState(() => _busy = true);
    String? noVacancy;
    try {
      final result = await ref.read(professorActionsRepositoryProvider).extendSession(widget.sessionId);
      if (!mounted) return;
      ref.read(professorSessionExtendedEndProvider(widget.sessionId).notifier).state =
          result.endTime.isEmpty ? newEnd : result.endTime;
      ref.invalidate(professorAgendaSessionsProvider);
      showAppSnackBar(context, 'Aula emendada até ${result.endTime.isEmpty ? newEnd : result.endTime}');
    } on ProfessorNoVacancyException catch (e) {
      noVacancy = e.message;
    } catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          e is ProfessorStudentsException ? e.message : 'Não foi possível emendar a aula.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (noVacancy != null && mounted) {
      await showModalBottomSheet<void>(
        context: context,
        useSafeArea: true,
        showDragHandle: true,
        backgroundColor: context.themeColors.surfaceSheet,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (_) => _NoVacancySheet(from: widget.endTime, to: newEnd, message: noVacancy!),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final newEnd = professorExtendedEnd(widget.endTime) ?? widget.endTime;
    return Material(
      key: const Key('professor-session-extend'),
      color: AppColors.brand.withValues(alpha: 0.05),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.45)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: _busy ? null : _extend,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: _busy
                    ? const Padding(
                        padding: EdgeInsets.all(11),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(Icons.add_rounded, color: colors.brandText),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Emendar +1h',
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Até $newEnd na $_court — só se houver vaga nesse horário.',
                      style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Emendar',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: colors.brandText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Impact extends StatelessWidget {
  const _Impact({required this.title, required this.sub, required this.value});

  final String title;
  final String sub;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(sub, style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted)),
              ],
            ),
          ),
          Text(value, style: theme.textTheme.labelMedium?.copyWith(color: colors.brandText)),
        ],
      ),
    );
  }
}

class _ConfirmSheet extends StatelessWidget {
  const _ConfirmSheet({required this.court, required this.from, required this.to});

  final String court;
  final String from;
  final String to;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Emendar a aula até $to?',
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'A hora a mais ocupa a $court e desconta da capacidade do horário. '
            'Se não houver vaga, nada muda.',
            style: theme.textTheme.bodyMedium?.copyWith(color: context.themeColors.onSurfaceMuted),
          ),
          const SizedBox(height: 14),
          _Impact(title: court, sub: '$from – $to', value: '+1h'),
          const _Impact(
            title: 'Reserva provisória nessa hora',
            sub: 'vai para outra quadra livre',
            value: 'se houver',
          ),
          const SizedBox(height: 8),
          ProfessorLinksPrimaryButton(
            key: const Key('professor-extend-confirm'),
            label: 'Emendar até $to',
            onPressed: () => Navigator.of(context).pop(true),
          ),
          const SizedBox(height: 8),
          ProfessorLinksGhostButton(
            label: 'Voltar',
            height: 52,
            onPressed: () => Navigator.of(context).pop(false),
          ),
        ],
      ),
    );
  }
}

class _NoVacancySheet extends StatelessWidget {
  const _NoVacancySheet({required this.from, required this.to, required this.message});

  final String from;
  final String to;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Padding(
      key: const Key('professor-extend-no-vacancy'),
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
              ),
              child: Icon(Icons.warning_amber_rounded, color: colors.brandText),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Sem vaga das $from às $to',
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(message, style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurfaceMuted)),
          const SizedBox(height: 16),
          ProfessorLinksGhostButton(
            key: const Key('professor-extend-no-vacancy-ok'),
            label: 'Entendi',
            height: 52,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}
