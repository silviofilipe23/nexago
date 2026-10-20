import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/search/search_keywords.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../domain/professionals/arena_professionals_logic.dart';
import '../../../domain/professionals/arena_professionals_providers.dart';
import '../../../domain/professionals/arena_professionals_repository.dart';
import 'arena_professionals_ui.dart';

/// A2 · Convidar professor. Só conta NexaGO existente (busca no perfil
/// público, a mesma das Aulas); o vínculo nasce `INVITED` e nada vale antes do
/// aceite. Devolve o nome do convidado quando o convite saiu.
Future<String?> showArenaProfessorInviteSheet(
  BuildContext context, {
  required String arenaId,
}) =>
    showProfessorLinksSheet<String>(
      context,
      builder: (_) => ArenaProfessorInviteSheet(arenaId: arenaId),
    );

class ArenaProfessorInviteSheet extends ConsumerStatefulWidget {
  const ArenaProfessorInviteSheet({super.key, required this.arenaId});

  final String arenaId;

  @override
  ConsumerState<ArenaProfessorInviteSheet> createState() =>
      _ArenaProfessorInviteSheetState();
}

class _ArenaProfessorInviteSheetState
    extends ConsumerState<ArenaProfessorInviteSheet> {
  final _term = TextEditingController();
  final _message = TextEditingController();
  Timer? _debounce;
  Timer? _copiedTimer;
  int _seq = 0;

  List<ArenaProfessorCandidate> _results = const [];
  bool _searching = false;
  String? _searchError;
  ArenaProfessorCandidate? _picked;
  ArenaProfessorLinkType _type = ArenaProfessorLinkType.arenaStaff;
  ArenaProfessorPermissions _permissions =
      defaultArenaProfessorPermissions(ArenaProfessorLinkType.arenaStaff);
  bool _sending = false;
  bool _copied = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _copiedTimer?.cancel();
    _term.dispose();
    _message.dispose();
    super.dispose();
  }

  void _onTerm(String value) {
    _debounce?.cancel();
    setState(() {
      _picked = null;
      _searchError = null;
    });
    if (!isSearchTermLongEnough(value)) {
      _seq++;
      setState(() {
        _results = const [];
        _searching = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  Future<void> _search(String term) async {
    final seq = ++_seq;
    setState(() => _searching = true);
    try {
      final found = await ref
          .read(arenaProfessionalsRepositoryProvider)
          .searchAccounts(term);
      if (!mounted || seq != _seq) return;
      setState(() {
        _results = found;
        _searching = false;
      });
    } catch (_) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _results = const [];
        _searching = false;
        _searchError = 'Não foi possível buscar agora. Tente novamente.';
      });
    }
  }

  /// Trocar o tipo volta a proposta para o padrão dele.
  void _setType(ArenaProfessorLinkType type) {
    if (type == _type) return;
    setState(() {
      _type = type;
      _permissions = defaultArenaProfessorPermissions(type);
    });
  }

  Future<void> _copyLink() async {
    await Clipboard.setData(
      ClipboardData(text: arenaProfessorRequestPageUrl(widget.arenaId)),
    );
    if (!mounted) return;
    _copiedTimer?.cancel();
    setState(() => _copied = true);
    _copiedTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Future<void> _send() async {
    final picked = _picked;
    if (picked == null || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(arenaProfessionalsRepositoryProvider).invite(
            arenaId: widget.arenaId,
            professorUserId: picked.uid,
            type: _type,
            permissions: arenaProfessorPermissionsToSend(_permissions, _type),
            message: _message.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(picked.name);
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Não foi possível enviar o convite. Tente de novo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = ref.watch(arenaProfessionalsClockProvider)();
    // Ao vivo: se o escolhido pediu vínculo com a folha aberta, trava o envio.
    final links =
        ref.watch(arenaProfessionalLinksProvider(widget.arenaId)).valueOrNull ??
            const <ArenaProfessorLink>[];
    final picked = _picked;
    final canSend = picked != null &&
        arenaProfessorAccountState(links, picked.uid, now) ==
            ArenaProfessorAccountState.available;
    final term = _term.text;

    return ProfessorLinksSheetBody(
      title: 'Convidar professor',
      subtitle: 'O vínculo só fica ativo depois que o professor aceitar.',
      children: [
        const ProfessorLinksKicker('1 · Professor'),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const Key('arena-professor-invite-search'),
              controller: _term,
              enabled: !_sending,
              onChanged: _onTerm,
              textInputAction: TextInputAction.search,
              style: AppTypography.bodyM.copyWith(
                fontSize: 13.5,
                color: colors.onSurface,
              ),
              decoration: arenaProfessorInputDecoration(
                context,
                hint: 'Buscar conta NexaGO pelo nome ou apelido',
                icon: Icons.search_rounded,
              ),
            ),
            if (_searching) ...[
              const SizedBox(height: 6),
              const LinearProgressIndicator(
                minHeight: 2,
                color: AppColors.brand,
              ),
            ],
            if (_searchError != null) ...[
              const SizedBox(height: 8),
              Text(
                _searchError!,
                style: AppTypography.bodyS.copyWith(color: colors.live),
              ),
            ] else if (isSearchTermLongEnough(term) &&
                !_searching &&
                _results.isEmpty &&
                _debounce?.isActive != true) ...[
              const SizedBox(height: 8),
              Text(
                'Nenhuma conta encontrada com esse nome.',
                style: AppTypography.bodyS.copyWith(
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
            for (final candidate in _results) ...[
              const SizedBox(height: 6),
              _CandidateRow(
                candidate: candidate,
                state: arenaProfessorAccountState(links, candidate.uid, now),
                selected: candidate.uid == picked?.uid,
                onTap:
                    _sending ? null : () => setState(() => _picked = candidate),
              ),
            ],
            const SizedBox(height: 8),
            _NoAccountBox(copied: _copied, onCopy: _copyLink),
          ],
        ),
        const SizedBox(height: 2),
        const ProfessorLinksKicker('2 · Tipo de vínculo'),
        for (final type in ArenaProfessorLinkType.values)
          ArenaProfessorTypeOption(
            type: type,
            selected: _type == type,
            onTap: _sending ? null : () => _setType(type),
          ),
        const SizedBox(height: 2),
        const ProfessorLinksKicker('3 · Permissões propostas'),
        ArenaProfessorPermissionToggles(
          type: _type,
          permissions: _permissions,
          dense: true,
          onChanged: _sending
              ? null
              : (key, value) => setState(
                    () => _permissions =
                        arenaProfessorPermissionsWith(_permissions, key, value),
                  ),
        ),
        const SizedBox(height: 2),
        const ProfessorLinksKicker('Mensagem (opcional)'),
        TextField(
          key: const Key('arena-professor-invite-message'),
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
          decoration: arenaProfessorInputDecoration(
            context,
            hint: 'Ex.: queremos você nas turmas de sábado de manhã',
          ),
        ),
        const ProfessorLinksNote(
          'O convite expira em $arenaProfessorInviteTtlDays dias. Nenhuma '
          'permissão é liberada antes do aceite.',
          tone: ProfessorLinksNoteTone.blue,
        ),
        if (_error != null) ArenaProfessorErrorBanner(_error!),
        ProfessorLinksPrimaryButton(
          key: const Key('arena-professor-invite-send'),
          label: 'Enviar convite',
          loading: _sending,
          onPressed: canSend ? _send : null,
        ),
      ],
    );
  }
}

class _CandidateRow extends StatelessWidget {
  const _CandidateRow({
    required this.candidate,
    required this.state,
    required this.selected,
    required this.onTap,
  });

  final ArenaProfessorCandidate candidate;
  final ArenaProfessorAccountState state;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final blocked = arenaProfessorAccountStateLabel(state);
    final row = Material(
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
        key: Key('arena-professor-candidate-${candidate.uid}'),
        onTap: blocked == null ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 9, 12, 9),
          child: Row(
            children: [
              ArenaProfessorAvatar(
                name: candidate.name,
                photoUrl: candidate.photoUrl,
                size: 34,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      candidate.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    if (blocked != null || candidate.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        blocked ?? candidate.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.mono(
                          10,
                          weight: FontWeight.w600,
                          color: blocked != null
                              ? ProfessorLinksStyle.blue
                              : ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (selected)
                const Icon(
                  Icons.check_rounded,
                  size: 18,
                  color: AppColors.brand,
                ),
            ],
          ),
        ),
      ),
    );
    return blocked == null ? row : Opacity(opacity: 0.55, child: row);
  }
}

/// "Não tem conta na NexaGO?": o professor cria a conta e pede o vínculo pela
/// página da arena — o pedido aparece aqui para aprovar.
class _NoAccountBox extends StatelessWidget {
  const _NoAccountBox({required this.copied, required this.onCopy});

  final bool copied;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ProfessorLinksStyle.line2(colors)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Não tem conta na NexaGO?',
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'O professor cria a conta no app e pede o vínculo pela '
                  'página da arena.',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    height: 1.4,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            key: const Key('arena-professor-copy-link'),
            onPressed: onCopy,
            style: TextButton.styleFrom(foregroundColor: AppColors.brand),
            child: Text(copied ? 'Copiado' : 'Copiar link'),
          ),
        ],
      ),
    );
  }
}
