import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../data/arena_class_repository.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../../domain/aulas/arena_class_session.dart';

/// Abre a folha "Cancelar aula" (A4). Devolve o resultado da callable quando
/// a aula foi cancelada; `null` se o gestor desistiu.
Future<ArenaClassCancelResult?> showArenaClassCancelSheet(
  BuildContext context, {
  required ArenaClassSession session,
  required int studentCount,
  required int studentsWithAccount,
}) {
  return showModalBottomSheet<ArenaClassCancelResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
    ),
    builder: (_) => ArenaClassCancelSheet(
      session: session,
      studentCount: studentCount,
      studentsWithAccount: studentsWithAccount,
    ),
  );
}

/// Motivo + prévia do aviso. Na fase 1 não há crédito de reposição: cancelar
/// libera a quadra na agenda e manda push aos alunos com conta NexaGO.
class ArenaClassCancelSheet extends ConsumerStatefulWidget {
  const ArenaClassCancelSheet({
    super.key,
    required this.session,
    required this.studentCount,
    required this.studentsWithAccount,
  });

  final ArenaClassSession session;
  final int studentCount;
  final int studentsWithAccount;

  @override
  ConsumerState<ArenaClassCancelSheet> createState() =>
      _ArenaClassCancelSheetState();
}

class _ArenaClassCancelSheetState extends ConsumerState<ArenaClassCancelSheet> {
  ArenaClassCancelReason? _reason;
  final TextEditingController _note = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final result = await ref.read(arenaClassRepositoryProvider).cancelSession(
            sessionId: widget.session.id,
            reason: reason,
            note: _note.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Não foi possível cancelar. Tente novamente.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _when() {
    final s = widget.session;
    final today = arenaDateKey(arenaTodayDateOnly());
    final tomorrow = arenaDateKey(
      DateTime.now().add(const Duration(days: 1)),
    );
    final day = s.date == today
        ? 'hoje'
        : s.date == tomorrow
            ? 'amanhã'
            : s.date.length == 10
                ? '${s.date.substring(8, 10)}/${s.date.substring(5, 7)}'
                : s.date;
    final n = widget.studentCount;
    return '${s.className} · $day ${s.startTime} · $n aluno${n == 1 ? '' : 's'}';
  }

  /// Quem recebe o push e quem a arena precisa avisar por fora.
  String _whoGetsPush() {
    final total = widget.studentCount;
    final push = widget.studentsWithAccount;
    if (push == 0) {
      return 'Nenhum aluno desta turma tem conta NexaGO — avise-os por fora.';
    }
    if (push >= total) {
      return 'Todos os alunos têm conta NexaGO e recebem um push avisando.';
    }
    final others = total - push;
    return '${push == 1 ? 'O aluno' : 'Os $push alunos'} com conta NexaGO '
        '${push == 1 ? 'recebe' : 'recebem'} um push; '
        '${others == 1 ? 'o outro' : 'os outros $others'} você avisa por fora.';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final reason = _reason;
    final withAccount = widget.studentsWithAccount;
    final buttonLabel = withAccount > 0
        ? 'Cancelar e avisar $withAccount aluno${withAccount == 1 ? '' : 's'}'
        : 'Cancelar aula';

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurface.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Cancelar aula',
                        style: AppTypography.soraRegular(
                          fontSize: 18,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _when(),
                        style: TextStyle(
                          fontSize: 12.5,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Material(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(10),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: _sending ? null : () => Navigator.of(context).pop(),
                    child: SizedBox(
                      width: 32,
                      height: 32,
                      child: Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: colors.onSurfaceMuted,
                        semanticLabel: 'Fechar',
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const _Kicker('Motivo'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final r in ArenaClassCancelReason.values)
                  _ReasonChip(
                    label: r.label,
                    selected: r == reason,
                    onTap: _sending ? null : () => setState(() => _reason = r),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              enabled: !_sending,
              maxLength: 300,
              maxLines: 2,
              minLines: 1,
              textCapitalization: TextCapitalization.sentences,
              style: TextStyle(fontSize: 13.5, color: colors.onSurface),
              decoration: InputDecoration(
                hintText: 'Observação para o registro (opcional)',
                hintStyle: TextStyle(
                  fontSize: 13.5,
                  color: colors.onSurfaceMuted,
                ),
                counterText: '',
              ),
            ),
            const SizedBox(height: 14),
            const _Kicker('O que acontece'),
            const SizedBox(height: 8),
            _InfoBox(
              icon: Icons.event_available_rounded,
              child: Text(
                'A quadra é liberada na agenda na hora e volta para o '
                'aluguel. ${_whoGetsPush()}',
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.4,
                  color: colors.onSurface,
                ),
              ),
            ),
            if (reason != null && withAccount > 0) ...[
              const SizedBox(height: 8),
              _InfoBox(
                icon: reason == ArenaClassCancelReason.rain
                    ? Icons.water_drop_outlined
                    : Icons.notifications_none_rounded,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PRÉVIA DO AVISO · PUSH',
                      style: AppTypography.mono(
                        fontSize: 9.5,
                        color: colors.onSurfaceMuted,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Aula cancelada',
                      style: AppTypography.soraRegular(
                        fontSize: 12.5,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      arenaClassCancelPushBody(widget.session, reason),
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(
                  color: AppColors.live,
                  fontWeight: FontWeight.w600,
                  fontSize: 12.5,
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: FilledButton(
                onPressed: reason == null || _sending ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.live,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _sending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        reason == null ? 'Escolha o motivo' : buttonLabel,
                        style: AppTypography.soraRegular(fontSize: 15),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Kicker extends StatelessWidget {
  const _Kicker(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: AppTypography.mono(
        fontSize: 9.5,
        letterSpacing: 1.5,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _ReasonChip extends StatelessWidget {
  const _ReasonChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? AppColors.brand
            : colors.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: selected
                    ? Colors.transparent
                    : colors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
            // `Center(widthFactor: 1)`: centraliza na altura sem esticar o
            // chip até a largura do Wrap.
            child: Center(
              widthFactor: 1,
              child: Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.black : colors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  const _InfoBox({required this.icon, required this.child});

  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.12)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, size: 16, color: AppColors.brand),
          ),
          const SizedBox(width: 10),
          Expanded(child: child),
        ],
      ),
    );
  }
}
