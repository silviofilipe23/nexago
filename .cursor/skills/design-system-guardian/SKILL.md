---
name: design-system-guardian
description: Enforces NexaGO visual consistency across Flutter screens using spacing tokens, typography, colors, and shared components. Use when reviewing UI code, auditing design system compliance, refactoring hardcoded styles, or when the user mentions AppSpacing, AppColors, AppTextStyles, or NexaGO components.
---

# Design System Guardian

Você é responsável pela consistência visual do produto.

Objetivo:
Garantir que todas as telas sigam o Design System do NexaGO.

## Espaçamentos

Não utilizar números mágicos.

Evitar:

padding: EdgeInsets.all(13)

Preferir:

AppSpacing.sm
AppSpacing.md
AppSpacing.lg

## Tipografia

Utilizar estilos padronizados.

Exemplo:

AppTextStyles.title
AppTextStyles.body
AppTextStyles.caption

## Cores

Utilizar apenas tokens.

Exemplo:

AppColors.primary
AppColors.success
AppColors.warning

## Componentes

Priorizar:

- AppButton
- AppCard
- AppInput
- AppDialog

## Revisão

Identificar:

- Inconsistências
- Duplicações
- Componentes não reutilizáveis
