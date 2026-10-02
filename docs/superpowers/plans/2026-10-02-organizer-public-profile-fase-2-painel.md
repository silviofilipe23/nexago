# Perfil público do organizador — Fase 2 (painel web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card "Perfil público" em `/painel/config` do portal do organizador, editando `bio`, `coverUrl` e `publicWhatsapp` dentro de `users/{uid}.organizerProfile`.

**Architecture:** Modelo e montagem do payload em módulo puro (`organizer-public-profile.ts`), sem Angular nem I/O. O card novo grava só os três campos por caminho pontilhado (`updateDoc`). O card "Perfil" continua com `setDoc(merge)` do mapa, e o modelo `OrganizerProfile` que ele grava NÃO ganha os campos novos (lição [[campo-congelado-derruba-o-save-inteiro]]: cópia velha reenviada sobrescreve valor novo). A capa é redimensionada no cliente (canvas, 1600 px de largura, JPEG) e só sobe no Salvar.

**Tech Stack:** Angular 20 zoneless, signals, Reactive Forms, Firebase JS SDK (Firestore + Storage), Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md`, seção "Edição pelo organizador".

## Global Constraints

- Worktree: `WT=/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/organizador-perfil-fase-2-painel`, branch `claude/organizador-perfil-fase-2-painel`. Nada fora de `$WT`.
- Comandos Angular só de `$WT/frontend` (`cd $WT/frontend && ...` em cada comando).
- Spec isolado: `npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/<arquivo>.spec.ts'` e conferir a contagem.
- Build: `npx ng build organizer --configuration production`; "Output location" tem de conter `worktrees/`.
- Campos gravados (contrato com a fase 1): `organizerProfile.bio` (string, trim, ≤ 280), `organizerProfile.coverUrl` (URL do Storage, ou `deleteField()` ao remover), `organizerProfile.publicWhatsapp` (boolean).
- Storage da capa: `profiles/{uid}/organizer-cover.jpg` (rule `profiles/{userId}/{fileName}` já libera o dono).
- Sem `confirm()` nativo; erros em português.

## Decisões

- **Upload da capa só no Salvar.** O card "Perfil" sobe a logo na hora da escolha. Para a capa isso quebraria o "Cancelar": o caminho é fixo, e reenviar o arquivo troca o token da URL de download, então a URL gravada no doc deixaria de abrir. A prévia usa `URL.createObjectURL` do blob já redimensionado.
- **Switch sem telefone grava `false`.** Sem telefone de contato o switch aparece desligado e desabilitado; o payload grava o que a tela mostra (`publicWhatsapp && hasContactPhone`).
- **Costura de teste:** `OrganizerPublicProfileGateway` (`providedIn: 'root'`) embrulha redimensionar/subir/salvar, e o spec do card troca por um dublê. As outras telas importam o repositório como função de módulo, o que não dá para trocar no TestBed ([[organizer-spec-tela-sem-seam-de-di]]).
- **Link público:** `environment.athleteAppUrl` + `/organizadores/{uid}` (constante já usada pelos links de inscrição).

---

### Task 1: Módulo puro + redimensionamento

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/organizer-public-profile.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/organizer-public-profile.spec.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/image-resize.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/image-resize.spec.ts`

**Interfaces (produz):**
- `ORGANIZER_BIO_MAX = 280`, `ORGANIZER_COVER_MAX_BYTES = 5 MB`, `ORGANIZER_COVER_MAX_WIDTH = 1600`
- `interface OrganizerPublicProfileSettings { bio: string; coverUrl: string | null; publicWhatsapp: boolean }`
- `DEFAULT_ORGANIZER_PUBLIC_PROFILE`
- `parseOrganizerPublicProfile(organizerProfile: Record<string, unknown>): OrganizerPublicProfileSettings`
- `normalizeOrganizerBio(raw: string): string` — trim + corte em 280 sem partir par substituto
- `hasUsableContactPhone(phone: string): boolean` — 10+ dígitos
- `type OrganizerPublicProfilePatch` (as três chaves pontilhadas)
- `buildOrganizerPublicProfilePatch(draft, { hasContactPhone }): OrganizerPublicProfilePatch`
- `validateCoverFile(file: { type: string; size: number }): string | null`
- `organizerPublicProfileUrl(athleteBaseUrl: string, uid: string): string`
- `scaleToMaxWidth(width, height, maxWidth): { width; height }` e `resizeImageToJpeg(file, maxWidth, quality?): Promise<Blob>`

**Testes:** bio com trim e corte em 280; capa removida → `deleteField()`; payload com exatamente as três chaves; sem telefone → `publicWhatsapp: false`; parse de doc vazio/inválido; validação de tipo e de 5 MB; URL sem barra dupla; conta de escala (maior, menor, igual, arredondamento, mínimo 1); ida e volta real no canvas (3200×800 PNG → 1600×400 JPEG).

- [ ] Escrever specs, ver falhar, implementar, ver passar, commit.

### Task 2: Modelo de settings e repositório

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/organizer-settings.model.ts` (`OrganizerSettings.publicProfile`)
- Modify: `frontend/projects/organizer/src/app/painel/data/organizer-settings.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/data/organizer-settings-repository.ts` (`saveOrganizerPublicProfile(uid, patch)` com `updateDoc`; `uploadOrganizerCover(uid, blob)`)

**Testes:** `publicProfile` lido do mesmo mapa `organizerProfile`; `profile` (o que o card "Perfil" grava) continua com as seis chaves de antes, sem `bio`/`coverUrl`/`publicWhatsapp`.

- [ ] Spec, implementação, commit.

### Task 3: Card "Perfil público"

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/ui/toggle-row.component.ts` (input `disabled`, retrocompatível)
- Create: `frontend/projects/organizer/src/app/painel/config/perfil-publico.gateway.ts`
- Create: `frontend/projects/organizer/src/app/painel/config/perfil-publico-card.component.ts`
- Create: `frontend/projects/organizer/src/app/painel/config/perfil-publico-card.component.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/config/config.component.ts` (card logo depois do "Perfil")

**Inputs do card:** `uid`, `publicProfile: OrganizerPublicProfileSettings`, `contactPhone: string`, `loading`.

**Testes (TestBed zoneless + dublê do gateway):** leitura mostra bio e link `https://atleta.nexago.com.br/organizadores/{uid}` em nova aba; sem telefone o switch fica desabilitado com a dica e o clique não liga; com telefone liga; contador `N/280` e `maxlength`; salvar manda o patch exato; remover capa manda `deleteField()`; capa nova passa por redimensionar → subir → patch com a URL nova; arquivo > 5 MB é recusado sem redimensionar; falha ao salvar mostra erro em português e mantém a edição.

- [ ] Spec, implementação, commit.

### Task 4: Verificação

- [ ] Specs novos + `config/` + `data/` verdes; build de produção verde (Output location em `worktrees/`).
- [ ] QA visual com rota `__qa-perfil-publico` temporária (desktop e ~390 px); remover rota e componente; `git status` e `git diff --stat` limpos.
