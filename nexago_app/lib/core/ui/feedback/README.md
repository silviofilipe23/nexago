# Feedback Pages

Use **página de feedback** para conclusões de fluxo e erros finais. Use **snackbar** (`showAppSnackBar`) para validação inline, hints e ações rápidas em formulários.

## Quando usar cada um

| Página | Snackbar |
|--------|----------|
| Inscrição confirmada, PIX expirado, convite aceito/recusado | "Selecione o tamanho da regata" |
| Senha alterada, conta criada, chave publicada | "Copiado", "Uniforme salvo", "Em breve" |
| Erro irrecuperável de pagamento | Erro em sheet/modal com retry na mesma tela |

## Variantes

```dart
FeedbackPage.success(title: '...', description: '...');
FeedbackPage.error(title: '...');
FeedbackPage.alert(title: '...');
FeedbackPage.info(title: '...');
```

## Cores (design system)

- **Sucesso** → `AppColors.win`
- **Erro** → `AppColors.live`
- **Alerta** → `AppColors.pending`
- **Info** → `AppColors.brand`

## Navegação

```dart
await pushFeedbackPage(context, FeedbackPage.success(...));
goToFeedbackPage(context, page, backRoute: AppRoutes.discover);
```
