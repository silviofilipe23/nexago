# Projeto

NexaGO é um ecossistema para gestão esportiva.

Objetivos:

- Escalabilidade
- Alta performance
- Excelente UX
- Arquitetura limpa
- Código de fácil manutenção

Stack

Flutter
Dart
Firebase
Firestore
Cloud Functions
FCM

Arquitetura

Feature First

Cada feature possui:

- presentation
- application
- domain
- infrastructure

Princípios

Nunca gerar código complexo sem necessidade.

Sempre priorizar:

- simplicidade
- legibilidade
- escalabilidade
- baixo acoplamento
- alta coesão

Nunca quebrar regras de negócio.

Sempre preservar retrocompatibilidade.
ECC (Everything Claude Code)

Instalado no escopo do projeto, versionado. Detalhes em `docs/ecc.md`.

- Plugin `ecc@ecc` ligado em `.claude/settings.json`; hooks no perfil `minimal`.
- Regras em `.claude/rules/ecc/`: `common` (sempre), `dart`, `typescript`, `angular` (só nos arquivos do tipo).
- Regra de negócio da Nexa (`nexago-*`, `.claude/docs/`) vence qualquer regra genérica do ECC.
- Não instalar o ECC por outro caminho (manual, `install.sh`, `/plugin install`): duplica skills e hooks.
