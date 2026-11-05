import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/nexa_skeleton.dart';
import '../../application/blog_providers.dart';
import '../../domain/blog_comment.dart';
import '../../domain/blog_logic.dart';
import '../../domain/blog_post.dart';
import 'blog_parts.dart';

/// Liga o botão "Ficou dúvida" (no card "Esse post te ajudou?") ao composer da
/// seção de comentários: põe o composer em modo dúvida, rola até ele e foca.
class BlogCommentComposerController {
  final kind = ValueNotifier<BlogCommentKind>(BlogCommentKind.comment);
  final focusNode = FocusNode();
  final anchorKey = GlobalKey();

  void askQuestion() {
    kind.value = BlogCommentKind.question;
    final ctx = anchorKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
        alignment: 0.2,
      );
    }
    focusNode.requestFocus();
  }

  void dispose() {
    kind.dispose();
    focusNode.dispose();
  }
}

/// "Comentários (N)": composer, os PRÓPRIOS pendentes/recusados no topo (só o
/// autor vê) e os aprovados, mais novos primeiro. Só com sessão (a rule de
/// leitura exige login). `N` é o `commentCount` do post (aprovados).
class BlogCommentsSection extends ConsumerStatefulWidget {
  const BlogCommentsSection({
    super.key,
    required this.post,
    required this.composer,
  });

  final BlogPost post;
  final BlogCommentComposerController composer;

  @override
  ConsumerState<BlogCommentsSection> createState() =>
      _BlogCommentsSectionState();
}

class _BlogCommentsSectionState extends ConsumerState<BlogCommentsSection> {
  int _limit = blogCommentsPageSize;

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(blogSessionUidProvider);
    if (uid.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    final postId = widget.post.id;
    final own = ref.watch(blogOwnCommentsProvider(postId)).valueOrNull;
    final approvedAsync = ref.watch(
      blogApprovedCommentsProvider((postId: postId, limit: _limit)),
    );
    final approved = approvedAsync.valueOrNull;
    final comments = mergeBlogComments(
      own: own ?? const [],
      approved: approved ?? const [],
    );
    final now = DateTime.now();

    return Padding(
      key: const Key('blog-comments'),
      // O respiro da seção mora aqui: sem sessão ela some sem deixar vão.
      padding: const EdgeInsets.only(top: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              'Comentários (${widget.post.commentCount})',
              style: AppTypography.soraRegular(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(height: 12),
          _Composer(postId: postId, controller: widget.composer),
          const SizedBox(height: 8),
          if (approved == null && approvedAsync.hasError)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                friendlyErrorMessage(
                  approvedAsync.error!,
                  action: 'Não foi possível carregar os comentários',
                  logReason: 'blog_comments',
                ),
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  color: colors.onSurfaceMuted,
                ),
              ),
            )
          else if (approved == null && comments.isEmpty)
            const NexaListSkeleton(
              count: 2,
              avatarSize: 34,
              padding: EdgeInsets.symmetric(vertical: 12),
            )
          else if (comments.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Ninguém comentou ainda. Seja o primeiro.',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  color: colors.onSurfaceMuted,
                ),
              ),
            )
          else ...[
            for (final c in comments)
              _CommentTile(
                comment: c,
                mine: c.uid == uid,
                now: now,
                onDelete: () => _delete(c),
              ),
            if (approved != null && approved.length >= _limit)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  key: const Key('blog-comments-more'),
                  onPressed: () =>
                      setState(() => _limit += blogCommentsPageSize),
                  child: Text(
                    'Ver mais comentários',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.brandText,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Future<void> _delete(BlogComment comment) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Apagar comentário?'),
        content: const Text('Ele sai do post e não dá para desfazer.'),
        actions: [
          TextButton(
            key: const Key('blog-comment-delete-keep'),
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Manter'),
          ),
          FilledButton(
            key: const Key('blog-comment-delete-confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: const Text('Apagar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref
          .read(blogCommentsControllerProvider)
          .delete(widget.post.id, comment.id);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível apagar',
          logReason: 'blog_comment_delete',
        ),
        isError: true,
      );
    }
  }
}

class _Composer extends ConsumerStatefulWidget {
  const _Composer({required this.postId, required this.controller});

  final String postId;
  final BlogCommentComposerController controller;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  final _text = TextEditingController();
  bool _sending = false;
  bool _sent = false;

  @override
  void initState() {
    super.initState();
    _text.addListener(_onChanged);
  }

  void _onChanged() {
    // Voltou a escrever: o "Recebemos!" sai.
    setState(() {
      if (_text.text.isNotEmpty) _sent = false;
    });
  }

  @override
  void dispose() {
    _text.removeListener(_onChanged);
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _text.text;
    if (!blogCommentTextValid(text) || _sending) return;
    final kind = widget.controller.kind.value;
    setState(() => _sending = true);
    try {
      await ref
          .read(blogCommentsControllerProvider)
          .post(widget.postId, text: text, kind: kind);
      if (!mounted) return;
      _text.clear();
      widget.controller.kind.value = BlogCommentKind.comment;
      widget.controller.focusNode.unfocus();
      setState(() => _sent = true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível enviar',
          logReason: 'blog_comment_post',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ValueListenableBuilder<BlogCommentKind>(
      key: widget.controller.anchorKey,
      valueListenable: widget.controller.kind,
      builder: (context, kind, _) {
        final question = kind == BlogCommentKind.question;
        final length = _text.text.trim().length;
        final canSend = blogCommentTextValid(_text.text) && !_sending;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (question)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    BlogPill(label: 'Dúvida', tone: colors.brandText),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'A equipe nexaGO responde aqui.',
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                    IconButton(
                      key: const Key('blog-composer-cancel-question'),
                      tooltip: 'Comentar em vez de perguntar',
                      visualDensity: VisualDensity.compact,
                      onPressed: () => widget.controller.kind.value =
                          BlogCommentKind.comment,
                      icon: Icon(
                        Icons.close_rounded,
                        size: 18,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            TextField(
              key: const Key('blog-comment-field'),
              controller: _text,
              focusNode: widget.controller.focusNode,
              minLines: 2,
              maxLines: 5,
              maxLength: blogCommentMaxLength,
              textCapitalization: TextCapitalization.sentences,
              buildCounter:
                  (
                    context, {
                    required currentLength,
                    required isFocused,
                    required maxLength,
                  }) => currentLength >= blogCommentCounterFrom
                  ? Text(
                      '$currentLength/$maxLength',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: currentLength >= (maxLength ?? 0)
                            ? colors.live
                            : colors.onSurfaceMuted,
                      ),
                    )
                  : null,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                height: 1.45,
                color: colors.onSurface,
              ),
              decoration: InputDecoration(
                hintText: question
                    ? 'Qual é a sua dúvida? A equipe responde aqui.'
                    : 'Escreva um comentário',
                hintStyle: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                  color: colors.onSurfaceMuted,
                ),
                filled: true,
                fillColor: colors.surfaceRaised,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                border: const OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(14)),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: const BorderRadius.all(Radius.circular(14)),
                  borderSide: BorderSide(
                    color: AppColors.brand.withValues(alpha: 0.5),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: _sent
                      ? Row(
                          key: const Key('blog-comment-sent'),
                          children: [
                            Icon(
                              Icons.check_circle_outline_rounded,
                              size: 16,
                              color: colors.win,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                'Recebemos! Aparece aqui depois que a equipe '
                                'aprovar.',
                                style: AppTypography.soraRegular(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                            ),
                          ],
                        )
                      : (length > 0 && length < blogCommentMinLength
                            ? Text(
                                'Escreva um pouco mais.',
                                style: AppTypography.soraRegular(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w400,
                                  color: colors.onSurfaceMuted,
                                ),
                              )
                            : const SizedBox.shrink()),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  key: const Key('blog-comment-send'),
                  onPressed: canSend ? _send : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: blogOnBrand,
                    disabledBackgroundColor: colors.onSurface.withValues(
                      alpha: 0.08,
                    ),
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                  ),
                  child: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: blogOnBrand,
                          ),
                        )
                      : Text(
                          question ? 'Enviar dúvida' : 'Comentar',
                          style: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: canSend
                                ? blogOnBrand
                                : colors.onSurfaceMuted,
                          ),
                        ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.mine,
    required this.now,
    required this.onDelete,
  });

  final BlogComment comment;
  final bool mine;
  final DateTime now;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final photo = comment.authorPhotoUrl;
    final initials = Text(
      blogAuthorInitials(comment.authorName),
      style: AppTypography.soraRegular(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: colors.brandText,
      ),
    );
    final badges = <Widget>[
      if (comment.isQuestion) BlogPill(label: 'Dúvida', tone: colors.brandText),
      if (comment.status == BlogCommentStatus.pending)
        BlogPill(label: 'Aguardando aprovação', tone: colors.pending),
      if (comment.status == BlogCommentStatus.rejected)
        BlogPill(label: 'Não aprovado', tone: colors.live),
    ];

    return Padding(
      key: Key('blog-comment-${comment.id}'),
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipOval(
            child: Container(
              width: 34,
              height: 34,
              color: AppColors.brand.withValues(alpha: 0.16),
              alignment: Alignment.center,
              child: photo == null
                  ? initials
                  : CachedNetworkImage(
                      imageUrl: photo,
                      width: 34,
                      height: 34,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => initials,
                      errorWidget: (_, _, _) => initials,
                    ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        comment.authorName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    Text(
                      ' · ${blogCommentAgo(comment.createdAt, now)}',
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                    const Spacer(),
                    if (mine)
                      SizedBox(
                        width: 32,
                        height: 28,
                        child: IconButton(
                          key: Key('blog-comment-delete-${comment.id}'),
                          tooltip: 'Apagar comentário',
                          padding: EdgeInsets.zero,
                          onPressed: onDelete,
                          icon: Icon(
                            Icons.delete_outline_rounded,
                            size: 18,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ),
                  ],
                ),
                if (badges.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(spacing: 6, runSpacing: 6, children: badges),
                ],
                const SizedBox(height: 6),
                Text(
                  comment.text,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                    height: 1.5,
                    color: colors.onSurface.withValues(alpha: 0.88),
                  ),
                ),
                if (comment.reply != null) ...[
                  const SizedBox(height: 10),
                  _TeamReply(reply: comment.reply!),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Resposta da equipe nexaGO", com a barra laranja à esquerda.
class _TeamReply extends StatelessWidget {
  const _TeamReply({required this.reply});

  final BlogCommentReply reply;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // Raio só à direita: o recorte faz o canto (borda de um lado só não
    // aceita borderRadius na decoração).
    return ClipRRect(
      borderRadius: const BorderRadius.horizontal(right: Radius.circular(12)),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          border: const Border(
            left: BorderSide(color: AppColors.brand, width: 3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Resposta da equipe nexaGO',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.brandText,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              reply.text,
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                fontWeight: FontWeight.w400,
                height: 1.5,
                color: colors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
