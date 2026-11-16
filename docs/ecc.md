# ECC (Everything Claude Code) na Nexa

Fonte: https://github.com/affaan-m/ECC — commit de referência das regras: `d2ef268`.

## O que está ligado
- **Plugin** `ecc@ecc`, declarado em `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`).
  Na primeira abertura do projeto o Claude Code pede para confiar no marketplace; é só aceitar.
  Traz skills, agentes e comandos. Os que importam aqui: `flutter-reviewer`, `dart-build-resolver`,
  `dart-flutter-patterns`, `flutter-dart-code-review`, `angular-developer`, `typescript-patterns`.
- **Hooks** no perfil enxuto: `ECC_HOOK_PROFILE=minimal` e `ECC_SESSION_START_MAX_CHARS=4000`
  (também em `.claude/settings.json`, bloco `env`).
- **Regras** (plugins não distribuem regras), copiadas para `.claude/rules/ecc/`:
  `common` (carrega sempre), `dart`, `typescript` e `angular` (carregam só ao tocar arquivos do tipo).

## Convivência com o que já existia
Agentes e skills `nexago-*`, `.claude/docs/` e os comandos `review-daily`/`review-weekly` continuam como estão.
Em conflito, vale a regra de negócio da Nexa.

## Ajustes
- Mais hooks: `ECC_HOOK_PROFILE=standard` (ou `strict`). Desligar um: `ECC_DISABLED_HOOKS="id1,id2"`.
- Sem contexto no início da sessão: `ECC_SESSION_START_CONTEXT=off`.
- Para desligar tudo: tirar `ecc@ecc` de `enabledPlugins` e apagar `.claude/rules/ecc/`.

## Atualizar as regras
```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
for d in common dart typescript angular; do rm -rf .claude/rules/ecc/$d; cp -R /tmp/ecc/rules/$d .claude/rules/ecc/; done
```
Atualize o commit de referência acima.

## Regra de ouro
Um único caminho de instalação. Não rodar `install.sh`, `npx ecc-universal ... install` nem `/plugin install`
por cima: duplica skills e hooks. Se duplicar, `npx ecc-universal@2.2.3 doctor` e `repair`.
