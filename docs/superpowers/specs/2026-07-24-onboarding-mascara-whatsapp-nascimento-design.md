# Máscaras de WhatsApp e data de nascimento + calendário nativo no onboarding do atleta

**Data:** 2026-07-24
**Status:** Aprovado

## Contexto

No portal web do atleta (`frontend/projects/athlete`), o passo 4/4 do onboarding ("Perfil básico", `athlete-onboarding.component.html`) tem dois campos sem máscara:

- **WhatsApp**: renderizado pelo componente compartilhado `PhoneVerificationComponent` (`shared/phone-verification/phone-verification.component.ts`), usado tanto no onboarding (primeira verificação) quanto na tela de perfil (troca de número). O `<input type="tel">` só tem placeholder `(00) 00000-0000` — o valor digitado não é formatado, fica cru no signal `phone`.
- **Data de nascimento**: `<input type="text">` solto em `athlete-onboarding.component.html`, com placeholder `dd/mm/aaaa`, sem nenhuma formatação — o atleta precisa digitar as barras manualmente. Não existe opção de abrir um calendário; a validação (`onboarding-validators.ts`) só roda depois, no blur/submit.

O app Flutter (`nexago_app`) já resolve isso no onboarding equivalente com `TextInputFormatter`s escritos à mão (`BrPhoneInputFormatter`, `BrDateInputFormatter` em `onboarding_input_formatters.dart`) — sem depender de nenhuma lib de máscara (confirmado: não há `mask_text_input_formatter` nem equivalente em nenhum `pubspec.yaml`/`package.json` do monorepo). Esta spec porta o mesmo comportamento pro web, sem introduzir dependência nova.

## Objetivo

1. WhatsApp: formatar automaticamente enquanto o atleta digita, no formato `(00) 00000-0000` (ou `(00) 0000-0000` enquanto ainda não tem dígitos suficientes pro celular).
2. Data de nascimento: formatar automaticamente enquanto digita, no formato `dd/mm/aaaa` (barras automáticas).
3. Data de nascimento: adicionar um botão que abre o date picker nativo do navegador como atalho pra digitação manual.

## Decisões

1. **Sem lib nova.** Funções puras de formatação, mesmo padrão do Flutter (`TextInputFormatter` manual) e do resto do projeto (`onboarding-validators.ts` já é só funções puras). `mask_text_input_formatter`/`ngx-mask`/`imask` não entram.
2. **WhatsApp — mascarar dentro do `PhoneVerificationComponent`.** É o único lugar onde o campo existe (o onboarding só o consome via `<app-phone-verification>`). A formatação entra em `setPhone()`: a cada tecla, os dígitos são extraídos (`replace(/\D/g, '')`, máx. 11) e remontados como `(00) 00000-0000` (11 dígitos) ou `(00) 0000-0000` (10 dígitos, ainda digitando). Efeito colateral aceito e desejado: a tela de Perfil (troca de número) ganha a mesma máscara de graça, por reusar o componente.
   - **Cursor**: a cada `(input)`, o valor é reescrito via `[value]="phone()"`, o que reposiciona o cursor no fim da string. Aceitável pra um campo de digitação sequencial (ninguém edita telefone no meio) — mesma limitação que o Flutter tem hoje.
   - `isValidPhoneNumber`/`toE164BR`/`validatePhone` continuam operando sobre os dígitos (`replace(/\D/g, '')`), então não são afetados pela máscara.
3. **Data de nascimento — mascarar em `athlete-onboarding.component.ts`.** Nova função pura `formatBirthDateMask(raw: string): string` (colocada em `onboarding-validators.ts`, junto das outras funções de data), chamada no `(input)` do campo antes de `birthDateInput.set(...)`. Insere `/` nas posições 2 e 4, limita a 8 dígitos — mesma lógica do `BrDateInputFormatter` Flutter. Mesma observação de cursor-no-fim do item 2.
4. **Botão de calendário nativo.** Dentro do `nx-field-box` da data de nascimento, um `<button type="button">` com ícone de calendário — mesmo padrão visual/CSS já usado pro botão de mostrar/ocultar senha (`.nx-field-box button`, visto em `athlete-login.component.html`). O clique aciona um `<input type="date">` oculto (visualmente escondido via CSS, mas presente no DOM — não `display:none`, pra manter a chamada de `showPicker()` funcional em todo navegador):
   - Preferência por `input.showPicker()` (suportado em Chrome/Edge/Firefox recentes e Safari 16.4+); fallback `input.click()` para navegadores sem `showPicker`.
   - `min`/`max` do `<input type="date">` seguem as mesmas regras de `validateBirthDate`: `min="1900-01-01"`, `max` = hoje menos `MIN_AGE_YEARS` (13) anos, calculado no componente.
   - Ao `(change)` do input nativo, converte `YYYY-MM-DD` → `dd/mm/aaaa` e chama `birthDateInput.set(...)` (mesmo signal que o campo de texto usa), disparando a mesma validação já existente.
5. **Nenhuma mudança de validação ou de modelo de dados.** `validateBirthDate`, `validatePhone`, `birthDateBrToIso`, `normalizeBrMobile` continuam exatamente como estão — a máscara só afeta o que aparece no campo, não a lógica de validação/conversão (que já normaliza dígitos).

## Fora de escopo

- Não estamos tocando a tela de Perfil (`athlete-profile-settings.component`) além do efeito colateral automático do item 2 (componente compartilhado).
- Não estamos trocando o campo de data para `<input type="date">` puro — a digitação manual mascarada continua sendo o caminho principal, o calendário é só um atalho (decisão confirmada com o usuário).
- Não estamos portando essa máscara pros outros portais web (arena/organizer) nem pro Flutter — só o onboarding do atleta no web, que foi o pedido.
- Não estamos adicionando `ngx-mask` ou lib similar ao workspace.
