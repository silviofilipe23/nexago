import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_status_views.dart';

/// Renderização padrão de um [AsyncValue]: skeleton no loading, erro com
/// retry e desvio de vazio — o wrapper que substitui `.when()` manual
/// nas telas da jornada.
class NexaAsyncView<T> extends StatelessWidget {
  const NexaAsyncView({
    super.key,
    required this.value,
    required this.data,
    this.skeleton,
    this.onRetry,
    this.emptyWhen,
    this.empty,
    this.loadingMessage,
    this.errorTitle = 'Algo deu errado',
    this.errorMessage = 'Não foi possível carregar. Tente novamente.',
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget? skeleton;
  final VoidCallback? onRetry;
  final bool Function(T data)? emptyWhen;
  final Widget? empty;
  final String? loadingMessage;
  final String errorTitle;
  final String errorMessage;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: (d) {
        if (emptyWhen?.call(d) ?? false) {
          return empty ?? const SizedBox.shrink();
        }
        return data(d);
      },
      loading: () => skeleton ?? AppLoadingView(message: loadingMessage),
      error: (error, _) {
        final retry = onRetry;
        if (retry != null) {
          return AppErrorView(
            title: errorTitle,
            message: errorMessage,
            onRetry: retry,
          );
        }
        return AppInlineErrorView(error: error);
      },
    );
  }
}
