# Campos editáveis no perfil do atleta (apelido + estado/cidade)

**Data:** 2026-07-23
**Status:** Aprovado

## Contexto

A tela de perfil do atleta (`frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`) só permite editar nome completo, cidade+UF (como um único `<input>` de texto livre, ex. "Goiânia, GO", separado por vírgula com `splitCityState`/`joinCityState`) e bio. Dois problemas:

1. **Apelido não é editável.** É capturado uma vez no onboarding e gravado em `users/{uid}.nickname` (fonte canônica — confirmado em `data/my-athlete-profile-repository.ts`, e replicado sem PII em `public_profiles` por Cloud Function existente), mas a tela de perfil nunca lê nem escreve esse campo.
2. **Cidade/UF em texto livre não valida nada** — o atleta pode digitar qualquer string, com erro de digitação, UF inexistente, ou cidade que não existe. Sem padronização, isso não é confiável para uso downstream.

O telefone já é editável separadamente (card "Segurança", fluxo de verificação por SMS implementado em 2026-07-23 numa feature anterior) — fica como está, fora do escopo desta mudança.

**Reaproveitamento**: o portal do organizador já resolveu exatamente o problema #2 para os wizards de torneio/liga/etapa (`docs/superpowers/specs/2026-07-20-organizer-wizard-estado-cidade-design.md`, implementado em `frontend/projects/organizer/src/app/shared/br-locations/`) — UF em `<select>` nativo + cidade em `<select>` dependente da UF, carregando um JSON de municípios do IBGE (~84KB, o mesmo dataset que o app Flutter usa em `nexago_app/assets/data/br_municipalities_by_uf.json`) via `fetch()` nativo, cacheado num signal. Esta spec porta esse mesmo padrão (serviço + asset + spec de teste) para o projeto `athlete`, em vez de reinventar.

## Objetivo

1. Adicionar campo "Apelido" (opcional) ao formulário de edição do perfil, lendo/escrevendo `users/{uid}.nickname`.
2. Trocar o campo único de cidade/UF por dois `<select>`: Estado (27 UFs) → Cidade (dependente da UF escolhida, lista do IBGE).
3. Não alterar onde/como telefone é editado.

## Decisões

1. **Estado/cidade: portar `BrLocationsService` do organizador, não reinventar.** Mesmo código (`br-locations.model.ts` com as 27 UFs, `br-locations.service.ts` com `states`/`citiesFor(uf)`/`loaded`/`ready`), mesmo teste (`br-locations.service.spec.ts`), para `frontend/projects/athlete/src/app/shared/br-locations/`. Asset copiado para `frontend/projects/athlete/public/data/br-municipalities-by-uf.json` (idêntico ao do organizador — mesmos dados do IBGE).
2. **UI: dois `<select>` nativos**, seguindo o mesmo padrão do organizador — select de Cidade desabilitado até uma UF ser escolhida (placeholder "Selecione o estado" / "Carregando…" enquanto `br-locations.loaded()` é `false`); trocar a UF sempre limpa a cidade selecionada.
3. **Dados legados (cidade/UF já salvos como texto livre):** ao abrir "Editar", tenta casar o `city`/`state` salvos com uma opção da lista carregada (comparação normalizada — sem diferenciar maiúscula/minúscula/acentos não é necessário já que os dados vêm do mesmo texto exato salvo anteriormente por outro fluxo que já usa nomes "corretos" na maioria dos casos; comparação direta case-insensitive é suficiente). Se não bater com nenhuma cidade da UF (dado antigo divergente), os selects abrem vazios — o atleta escolhe de novo. Sem migração de dados nem tentativa de "adivinhar" a cidade certa.
4. **Nenhuma mudança de modelo de dados.** `users/{uid}.city`/`.state` e `athlete_profiles/{uid}.city`/`.state` continuam strings simples (nome da cidade, sigla da UF) — só muda a origem do valor (escolhido, não digitado). `users/{uid}.nickname` já existe como campo, só passa a ser editável por essa tela também (mesma escrita que o onboarding já faz).
5. **`splitCityState`/`joinCityState` em `profile-format.ts`:** `joinCityState` continua em uso (exibição em modo leitura, `cityStateLabel`). `splitCityState` fica sem uso depois da mudança (só existia para parsear o campo de texto livre) — remover junto, evitando código morto.

## Fluxo de dados

- `loadRemoteProfile()`: passa a ler `nickname` de `users/{uid}` (mesmo padrão de `phoneNumber`/`phoneVerified`, já lidos de lá). `city`/`state` continuam vindo de `athlete_profiles` com fallback pra `users`, sem mudança de leitura — só a UI de edição muda.
- `startEdit()`: além dos campos já resetados, popula `state`/`city` do form tentando casar com uma opção válida da UF/cidade atual (ver Decisão 3), e `nickname`.
- `save()`: grava `nickname` em `users/{uid}` (junto de `fullName`/`city`/`state`/`roles`, no mesmo `setDoc`) e continua gravando `city`/`state` em ambos os documentos como hoje. `athlete_profiles` não precisa de `nickname` (não é lido de lá em lugar nenhum).

## Fora de escopo

- Não estamos tocando o card "Segurança"/telefone.
- Não estamos criando uma lib compartilhada entre portais para `BrLocationsService` — cada portal porta sua própria cópia (mesmo padrão de duplicação tolerada já usado no projeto, ver decisão equivalente na spec de verificação de telefone).
- Não estamos adicionando upload/edição de foto de perfil nesta tela (fora do pedido).
