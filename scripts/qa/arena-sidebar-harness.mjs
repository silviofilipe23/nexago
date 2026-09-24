#!/usr/bin/env node
// Gera um harness estático (HTML + CSS) que espelha a marcação e o CSS REAIS
// do shell do painel da arena (`panel-shell.component.ts` + `drawer.component.ts`
// + o CSS global compilado), para medir geometria de verdade no navegador --
// sem subir o Angular nem fazer login (o arena não tem rota de QA).
//
// Uso:
//   npx ng build arena --configuration development   # gera dist/arena/browser/styles.css
//   node scripts/qa/arena-sidebar-harness.mjs <dir-de-saída>
//
// O que o harness reproduz, com fidelidade ao componente real:
//   - o CSS do shell e do drawer, extraídos do `styles:` de cada componente
//     (não reescritos à mão -- o script LÊ o arquivo fonte a cada geração);
//   - o CSS global compilado (`dist/arena/browser/styles.css`), que é onde
//     moram os tokens de densidade (--ar-nav-item-h) e a escada de
//     largura/altura/toque (`_breakpoints.scss` via `styles.scss`);
//   - a árvore de navegação REAL: Início solto + 5 cabeçalhos de grupo, com
//     um grupo aberto por vez (nunca 21 itens chapados) -- extraída de
//     `panel-nav.model.ts`, não copiada à mão;
//   - a matriz de acesso do cargo `recepcao`, extraída de `arena-roles.model.ts`
//     (o cargo `dono` mapeia para `isOwner()`, que enxerga tudo).
//
// O que o harness NÃO tenta reproduzir (fora de escopo desta task -- ver
// "Não coberto" em docs/qa/arena-responsivo-passe-medido.md):
//   - autenticação, dados reais de Firestore, roteamento de verdade;
//   - o conteúdo de `<ng-content>` (as 38 telas do painel);
//   - os ícones reais (SVGs viram caixas do mesmo tamanho -- a geometria não
//     depende do path do ícone, só da caixa).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('uso: node scripts/qa/arena-sidebar-harness.mjs <dir-de-saída>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/qa/arena-sidebar-harness.mjs -> raiz do worktree é dois níveis acima.
const repoRoot = path.resolve(__dirname, '../..');

const arenaSrc = path.join(repoRoot, 'frontend/projects/arena/src');
const shellPath = path.join(arenaSrc, 'app/painel/ui/panel-shell.component.ts');
const drawerPath = path.join(arenaSrc, 'app/painel/ui/drawer.component.ts');
const navModelPath = path.join(arenaSrc, 'app/painel/ui/panel-nav.model.ts');
const rolesModelPath = path.join(arenaSrc, 'app/painel/data/arena-roles.model.ts');
const globalCssPath = path.join(repoRoot, 'dist/arena/browser/styles.css');

for (const [label, p] of [
  ['panel-shell.component.ts', shellPath],
  ['drawer.component.ts', drawerPath],
  ['panel-nav.model.ts', navModelPath],
  ['arena-roles.model.ts', rolesModelPath],
]) {
  if (!existsSync(p)) {
    console.error(`arquivo fonte não encontrado (${label}): ${p}`);
    process.exit(1);
  }
}

if (!existsSync(globalCssPath)) {
  console.error(
    `CSS global compilado não encontrado: ${globalCssPath}\n` +
      'Rode primeiro: npx ng build arena --configuration development (a partir de frontend/)',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Extração de CSS: `styles: \`...\`` dentro do decorator @Component. As duas
// fontes não têm backtick dentro do CSS, então o marcador de fechamento
// "`,\n})" é seguro e único.
// ---------------------------------------------------------------------------
function extractComponentStyles(source, label) {
  const startMarker = 'styles: `';
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`"styles:" não encontrado em ${label}`);
  const cssStart = startIdx + startMarker.length;
  const endIdx = source.indexOf('`,\n})', cssStart);
  if (endIdx === -1) throw new Error(`fechamento do styles não encontrado em ${label}`);
  return source.slice(cssStart, endIdx);
}

const shellSource = readFileSync(shellPath, 'utf8');
const drawerSource = readFileSync(drawerPath, 'utf8');
const navModelSource = readFileSync(navModelPath, 'utf8');
const rolesModelSource = readFileSync(rolesModelPath, 'utf8');
const globalCss = readFileSync(globalCssPath, 'utf8');

const shellCssRaw = extractComponentStyles(shellSource, 'panel-shell.component.ts');
const drawerCssRaw = extractComponentStyles(drawerSource, 'drawer.component.ts');

// `:host` não existe em HTML puro. Troca textual para um seletor de id no
// elemento raiz do harness -- só muda o SELETOR, nunca o valor de nenhuma
// declaração. `:host(.compact)` -> `#host.compact`; `:host` solto -> `#host`.
function hostToId(css) {
  return css.replace(/:host\(([^)]*)\)/g, '#host$1').replace(/:host\b/g, '#host');
}

const shellCss = hostToId(shellCssRaw);
const drawerCss = hostToId(drawerCssRaw);

// ---------------------------------------------------------------------------
// Extração de dados: NAV_ITEMS real de panel-nav.model.ts (não copiado à mão).
// ---------------------------------------------------------------------------
function extractNavItems(source) {
  // Linhas comentadas fora primeiro: um item desativado com `//` continua casando
  // com a regex abaixo, e o harness passaria a medir um item que nunca renderiza
  // -- a asserção 2 procuraria no DOM um id que não existe. Aconteceu de verdade
  // com 'torneios', desativado na main enquanto este arquivo dizia extrair 21.
  const active = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  const itemRe =
    /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*icon:\s*'([^']+)',\s*route:\s*'([^']+)',\s*badge:\s*(null|\d+),\s*area:\s*(null|'[^']*'),\s*group:\s*(null|'[^']*')\s*\}/g;
  const items = [];
  let m;
  while ((m = itemRe.exec(active)) !== null) {
    items.push({
      id: m[1],
      label: m[2],
      icon: m[3],
      route: m[4],
      badge: m[5] === 'null' ? null : Number(m[5]),
      area: m[6] === 'null' ? null : m[6].slice(1, -1),
      group: m[7] === 'null' ? null : m[7].slice(1, -1),
    });
  }
  return items;
}

function extractGroupLabels(source) {
  const blockStart = source.indexOf('ARENA_NAV_GROUP_LABEL');
  const blockEnd = source.indexOf('};', blockStart);
  const block = source.slice(blockStart, blockEnd);
  const labelRe = /(\w+):\s*'([^']+)'/g;
  const labels = {};
  let m;
  while ((m = labelRe.exec(block)) !== null) labels[m[1]] = m[2];
  return labels;
}

function extractGroupOrder(source) {
  const m = source.match(/ARENA_NAV_GROUPS\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('ARENA_NAV_GROUPS não encontrado em panel-nav.model.ts');
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

const navItems = extractNavItems(navModelSource);
const groupLabel = extractGroupLabels(navModelSource);
const groupOrder = extractGroupOrder(navModelSource);

if (navItems.length === 0) {
  throw new Error('nenhum item extraído de NAV_ITEMS -- a regex de extração ficou desalinhada com panel-nav.model.ts');
}

// ---------------------------------------------------------------------------
// Extração da matriz de acesso do cargo `recepcao` (arena-roles.model.ts).
// `dono` (gestor/isOwner) enxerga tudo -- não precisa de matriz.
// ---------------------------------------------------------------------------
function extractAreasForRole(source, constName, role) {
  const blockStart = source.indexOf(constName);
  if (blockStart === -1) throw new Error(`${constName} não encontrado em arena-roles.model.ts`);
  const blockEnd = source.indexOf('};', blockStart);
  const block = source.slice(blockStart, blockEnd);
  const re = new RegExp(role + ':\\s*\\[([^\\]]*)\\]');
  const m = block.match(re);
  if (!m) throw new Error(`cargo '${role}' não encontrado em ${constName}`);
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

const recepcaoWrite = extractAreasForRole(rolesModelSource, 'ARENA_WRITE_AREAS', 'recepcao');
const recepcaoReadOnly = extractAreasForRole(rolesModelSource, 'ARENA_READ_ONLY_AREAS', 'recepcao');
const recepcaoAreas = Array.from(new Set([...recepcaoWrite, ...recepcaoReadOnly]));

// ---------------------------------------------------------------------------
// Monta shell.css: tokens/global (compilado) + CSS real do shell + do drawer.
// ---------------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });

const shellCssOut = [
  '/* ===== CSS global compilado (dist/arena/browser/styles.css) ===== */',
  '/* Gerado por: npx ng build arena --configuration development */',
  globalCss,
  '',
  '/* ===== CSS real de panel-shell.component.ts (styles:), extraído ===== */',
  '/* :host -> #host (troca textual de seletor, nenhum valor mudou) */',
  shellCss,
  '',
  '/* ===== CSS real de drawer.component.ts (styles:), extraído ===== */',
  drawerCss,
  '',
  '/* ===== Reset mínimo do harness (não existe em nenhum componente real) ===== */',
  '* { box-sizing: border-box; }',
  'html, body { margin: 0; }',
  'body { background: var(--nx-bg); color: var(--nx-text); font-family: var(--nx-font-ui); }',
  '',
  '/* Desliga toda animação/transição (drawer.component.ts anima a entrada',
  '   do painel via @keyframes -- ar-drawer-in/ar-drawer-in-left, 240ms). Só',
  '   encurtar animation-duration NÃO resolve: o relógio da animação é',
  '   movido a frame renderizado, não a tempo de parede, e o motor de',
  '   preview usado para medir não entrega frame de forma confiável (rAF',
  '   perto de zero enquanto a página não está em foco/pintando) -- mesmo',
  '   com 0.01ms de duração, a animação fica presa no frame inicial',
  '   (transform: translateX(-100%), painel inteiro fora da tela) até um',
  '   screenshot forçar um paint real. animation:none tira a animação do',
  '   jogo de vez -- o elemento só usa o estilo BASE (sem transform nenhum),',
  '   que já é o estado final correto, sem depender de nenhum frame. O app',
  '   real já neutraliza animação para prefers-reduced-motion (ver',
  '   styles.scss); aqui fica incondicional, porque o harness só precisa do',
  '   estado final da geometria, nunca da transição visual.',
  '*, *::before, *::after { animation: none !important; transition: none !important; }',
].join('\n');

writeFileSync(path.join(outDir, 'shell.css'), shellCssOut);

// ---------------------------------------------------------------------------
// Dados de navegação injetados no HTML (JSON real, extraído na hora).
// ---------------------------------------------------------------------------
const navData = {
  generatedAt: new Date().toISOString(),
  navItems,
  groupOrder,
  groupLabel,
  recepcaoAreas,
};

const navDataJson = JSON.stringify(navData, null, 2);

// ---------------------------------------------------------------------------
// harness.js: lógica cliente. String concatenation (sem template literals)
// de propósito -- este arquivo inteiro vive dentro de um template literal do
// gerador, e não pode conter backtick.
// ---------------------------------------------------------------------------
const harnessJs = `
(function () {
  'use strict';

  var DATA = window.__ARENA_NAV_DATA__;

  var state = {
    role: 'dono',            // 'dono' | 'recepcao'
    openGroup: null,         // null (fallback p/ rota ativa) | 'none' | nome do grupo
    multiArena: true,        // pior caso: soma a linha "Trocar arena"
    drawerOpen: false,
    activeId: 'inicio',
  };

  function canSee(item, role) {
    if (item.area === null) return true;
    if (item.area === 'owner') return role === 'dono';
    if (role === 'dono') return true;
    return DATA.recepcaoAreas.indexOf(item.area) !== -1;
  }

  // Porta 1:1 de buildNavSections() em panel-nav.model.ts: agrupa
  // preservando a ordem de NAV_ITEMS e descarta seção vazia para o cargo.
  function buildNavSections(items, canSeeFn) {
    var sections = [];
    var byGroup = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!canSeeFn(item)) continue;
      var key = item.group === null ? '__null__' : item.group;
      var section = byGroup[key];
      if (!section) {
        section = { group: item.group, label: item.group === null ? '' : DATA.groupLabel[item.group], items: [] };
        byGroup[key] = section;
        sections.push(section);
      }
      section.items.push(item);
    }
    return sections;
  }

  var BOTTOM_PREFERENCE = ['inicio', 'agenda', 'reservas', 'comandas', 'estoque', 'financeiro'];

  function bottomItems(items, canSeeFn) {
    var visiveis = items.filter(canSeeFn);
    var ordenado = [];
    for (var i = 0; i < BOTTOM_PREFERENCE.length; i++) {
      var id = BOTTOM_PREFERENCE[i];
      var found = null;
      for (var j = 0; j < visiveis.length; j++) {
        if (visiveis[j].id === id) { found = visiveis[j]; break; }
      }
      if (found) ordenado.push(found);
    }
    return ordenado.slice(0, 4);
  }

  // Porta 1:1 de isOpen() em panel-shell.component.ts (3 estados: fallback
  // pela rota ativa / 'none' fechado de propósito / grupo explícito).
  function isOpen(group) {
    if (state.openGroup === 'none') return false;
    if (state.openGroup !== null) return state.openGroup === group;
    var active = null;
    for (var i = 0; i < DATA.navItems.length; i++) {
      if (DATA.navItems[i].id === state.activeId) { active = DATA.navItems[i]; break; }
    }
    return !!active && active.group === group;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Ícone-placeholder: caixa do mesmo tamanho do <ar-icon [size]>. A
  // geometria depende só da caixa, nunca do path do SVG.
  function iconSvg(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"></rect></svg>';
  }

  function navItemHtml(item) {
    var active = state.activeId === item.id;
    var cls = 'nav-item' + (active ? ' active' : '');
    var badge = item.badge ? '<span class="badge">' + esc(item.badge) + '</span>' : '';
    var current = active ? ' aria-current="page"' : '';
    return '<a class="' + cls + '" data-nav-id="' + item.id + '" href="#' + item.id + '"' + current + '>' +
      iconSvg(17) + '<span>' + esc(item.label) + '</span>' + badge + '</a>';
  }

  function navTreeHtml() {
    var canSeeFn = function (it) { return canSee(it, state.role); };
    var sections = buildNavSections(DATA.navItems, canSeeFn);
    var sectionsHtml = '';
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (section.group === null) {
        for (var j = 0; j < section.items.length; j++) sectionsHtml += navItemHtml(section.items[j]);
      } else {
        var open = isOpen(section.group);
        sectionsHtml += '<button type="button" class="nav-group-head" data-group="' + section.group +
          '" aria-expanded="' + (open ? 'true' : 'false') + '"><span>' + esc(section.label) + '</span>' + iconSvg(12) + '</button>';
        if (open) for (var k = 0; k < section.items.length; k++) sectionsHtml += navItemHtml(section.items[k]);
      }
    }
    var roleLabel = state.role === 'dono' ? 'Dono' : 'Recep\\u00e7\\u00e3o';
    var html = '';
    html += '<div class="brand"><div class="mark" style="width:32px;height:32px;border-radius:8px;background:#2a2a2e"></div>';
    html += '<div class="wordmark"><div class="name">nexa<span>GO</span></div><div class="tag">Arena</div></div></div>';
    html += '<a class="switcher" href="#perfil"><div class="switcher-avatar" aria-hidden="true">AQ</div>';
    html += '<div class="switcher-body"><div class="switcher-name">Arena QA \\u2014 ' + roleLabel + '</div></div>' + iconSvg(13) + '</a>';
    if (state.multiArena) {
      html += '<a class="switch-arena-link" href="#trocar">' + iconSvg(12) + 'Trocar arena</a>';
    }
    html += '<nav class="nav" id="navEl">' + sectionsHtml + '</nav>';
    html += '<div class="spacer"></div>';
    html += '<div class="nav-item disabled" title="Em breve">' + iconSvg(17) + '<span>Configura\\u00e7\\u00f5es</span></div>';
    html += '<a class="user-row" href="#perfil"><div class="avatar" aria-hidden="true">SD</div>';
    html += '<div class="who"><div class="who-name">silvio.dionizio23@gmail.com</div><div class="who-role">Gestor</div></div></a>';
    return html;
  }

  function computeViewportFlags() {
    var cs = getComputedStyle(document.documentElement);
    var md = parseInt(cs.getPropertyValue('--ar-bp-md'), 10) || 900;
    var sm = parseInt(cs.getPropertyValue('--ar-bp-sm'), 10) || 720;
    return { isCompact: window.innerWidth <= md, isPhone: window.innerWidth <= sm };
  }

  var hostEl, topbarEl, sidebarEl, drawerScrimEl, drawerPanelEl, bottomNavEl;

  function renderTopbar() {
    topbarEl.innerHTML =
      '<button type="button" class="nav-trigger" data-nav-trigger aria-label="Abrir menu de navega\\u00e7\\u00e3o" aria-expanded="' +
      (state.drawerOpen ? 'true' : 'false') + '">' + iconSvg(18) + '</button>' +
      '<div class="topbar-name">Arena QA</div>' +
      '<a class="topbar-avatar" href="#perfil" title="Ver perfil">SD</a>';
  }

  function renderBottomNav() {
    var canSeeFn = function (it) { return canSee(it, state.role); };
    var items = bottomItems(DATA.navItems, canSeeFn);
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var active = state.activeId === it.id;
      html += '<a class="bottom-slot' + (active ? ' active' : '') + '" data-bottom-slot data-nav-id="' + it.id + '" href="#' + it.id +
        '"' + (active ? ' aria-current="page"' : '') + '>' + iconSvg(19) + '<span>' + esc(it.label) + '</span></a>';
    }
    html += '<button type="button" class="bottom-slot" data-bottom-slot data-more="true">' + iconSvg(19) + '<span>Mais</span></button>';
    bottomNavEl.innerHTML = html;
  }

  // O atributo hidden sozinho NÃO basta aqui: .topbar/.sidebar/.bottom-nav/
  // .scrim (CSS real, extraído do shell/drawer) declaram o próprio display
  // (flex/flex/grid/flex) -- regra de autor, mesma especificidade do UA
  // stylesheet [hidden]{display:none}, e origem de autor sempre ganha da
  // origem UA (a ordem no cascade não decide isso). Resultado: el.hidden =
  // true não escondia NADA -- os quatro contêineres continuavam ocupando
  // layout e pintando por cima uns dos outros mesmo "escondidos", inclusive
  // o drawer aberto permanentemente sobre a topbar. Estilo inline sempre
  // ganha de regra de classe (curto de !important), então força aqui.
  function setVisible(el, show) {
    el.hidden = !show;
    el.style.display = show ? '' : 'none';
  }

  function render() {
    var flags = computeViewportFlags();
    hostEl.classList.toggle('compact', flags.isCompact);
    hostEl.classList.toggle('phone', flags.isPhone);

    setVisible(topbarEl, flags.isCompact);
    setVisible(sidebarEl, !flags.isCompact);
    setVisible(bottomNavEl, flags.isPhone);
    setVisible(drawerScrimEl, flags.isCompact && state.drawerOpen);

    var tree = navTreeHtml();
    if (flags.isCompact) {
      drawerPanelEl.innerHTML = state.drawerOpen ? tree : '';
      sidebarEl.innerHTML = '';
    } else {
      sidebarEl.innerHTML = tree;
      drawerPanelEl.innerHTML = '';
    }

    if (flags.isCompact) renderTopbar(); else topbarEl.innerHTML = '';
    if (flags.isPhone) renderBottomNav(); else bottomNavEl.innerHTML = '';

    // Força reflow síncrono (leitura de offsetHeight sempre invalida o
    // layout cacheado e recalcula na hora). Sem isto, medido ao vivo que o
    // motor deste preview deixa o keyframe do drawer.component.ts preso no
    // frame inicial (transform: translateX(+-100%), painel inteiro fora da
    // tela) mesmo com animation:none !important no reset do harness --
    // nem o screenshot manual bastava sozinho em todo caso testado. Ler
    // offsetHeight (dispara layout de verdade, ao contrário de só chamar
    // getComputedStyle) resolveu de forma reproduzível nos testes -- ver
    // Nota de metodologia no procedimento.
    void hostEl.offsetHeight;

    return flags;
  }

  // ---- interacao (delegada em #host, mais o scrim do drawer) ----
  function onHostClick(ev) {
    var trigger = ev.target.closest('[data-nav-trigger]');
    if (trigger) { state.drawerOpen = true; render(); return; }

    var groupBtn = ev.target.closest('.nav-group-head');
    if (groupBtn) {
      var g = groupBtn.getAttribute('data-group');
      state.openGroup = isOpen(g) ? 'none' : g;
      render();
      return;
    }

    var navLink = ev.target.closest('.nav-item[data-nav-id], .bottom-slot[data-nav-id]');
    if (navLink) {
      ev.preventDefault();
      state.activeId = navLink.getAttribute('data-nav-id');
      state.drawerOpen = false;
      render();
      return;
    }

    var moreBtn = ev.target.closest('.bottom-slot[data-more]');
    if (moreBtn) { state.drawerOpen = true; render(); return; }
  }

  function wireStaticUi() {
    hostEl.addEventListener('click', onHostClick);
    drawerScrimEl.addEventListener('click', function (ev) {
      if (ev.target === drawerScrimEl) { state.drawerOpen = false; render(); }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.drawerOpen) { state.drawerOpen = false; render(); }
    });

    var roleSel = document.getElementById('qaRole');
    roleSel.addEventListener('change', function () {
      state.role = roleSel.value;
      state.openGroup = null;
      state.activeId = 'inicio';
      render();
    });

    var multi = document.getElementById('qaMultiArena');
    multi.addEventListener('change', function () { state.multiArena = multi.checked; render(); });

    document.getElementById('qaOpenDrawer').addEventListener('click', function () {
      state.drawerOpen = true; render();
    });
    document.getElementById('qaCloseAll').addEventListener('click', function () {
      state.openGroup = 'none'; render();
    });

    document.getElementById('qaRunSweep').addEventListener('click', function () {
      var out = document.getElementById('qaOutput');
      out.textContent = JSON.stringify(fullReport(), null, 2);
    });
  }

  // ---------------------------------------------------------------------
  // Medição. Tudo em pixels reais (getBoundingClientRect / getComputedStyle),
  // nunca deduzido a partir do CSS-fonte.
  // ---------------------------------------------------------------------
  function describe(el) {
    // getAttribute('class'), não .className -- em elemento SVG .className é
    // um SVGAnimatedString, não uma string (quebraria o .split abaixo).
    var withId = el.closest('[data-nav-id]');
    if (withId) return (withId.getAttribute('class') || '').split(' ')[0] + '#' + withId.getAttribute('data-nav-id');
    var withGroup = el.closest('[data-group]');
    if (withGroup) return 'nav-group-head#' + withGroup.getAttribute('data-group');
    var cls = el.getAttribute && el.getAttribute('class');
    if (cls) return cls.split(' ')[0];
    if (el.id) return '#' + el.id;
    return el.tagName ? el.tagName.toLowerCase() : String(el);
  }

  function edgeGap(r1, r2) {
    var dx = Math.max(r2.left - r1.right, r1.left - r2.right, 0);
    var dy = Math.max(r2.top - r1.bottom, r1.top - r2.bottom, 0);
    if (dx > 0 && dy > 0) return Math.sqrt(dx * dx + dy * dy);
    return Math.max(dx, dy);
  }

  // Um elemento só conta como alvo de toque de verdade se o ponto central da
  // sua própria caixa é o que o navegador realmente pintaria ali -- exclui
  // dois falsos positivos que a 1a rodada de medição pegou ao vivo:
  //   1. item de nav rolado para fora da área visível do .nav (overflow:
  //      auto recorta visualmente, mas getBoundingClientRect ainda devolve
  //      a geometria "crua", como se estivesse visível);
  //   2. bottom-nav por trás do scrim do drawer (aberto por cima, z-index
  //      1000 vs 30) -- os dois existem no DOM ao mesmo tempo, mas só um é
  //      alcançável.
  // Precisa do preview servido por HTTP de verdade (preview_start) com um
  // screenshot tirado antes -- ver nota no cabeçalho do gerador.
  function reachability(el, cx, cy) {
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
      return { reachable: false, reason: 'fora do viewport (clipado por um ancestral com overflow, provavelmente)' };
    }
    var hit = document.elementFromPoint(cx, cy);
    if (!hit) return { reachable: false, reason: 'elementFromPoint não retornou nada' };
    // De propósito SÓ hit===el ou el.contains(hit) (o ponto pintou um FILHO
    // do alvo, ex.: o svg/span por dentro de um nav-item -- ainda é o alvo).
    // NÃO hit.contains(el): isso aceitava qualquer ANCESTRAL estrutural como
    // prova de alcance, e ancestralidade não é pintura -- um item recortado
    // pelo overflow de um antepassado, fora da região visível, devolve
    // html (ou o próprio ancestral que clipa) no elementFromPoint, e
    // html.contains(item) é sempre true mesmo com o item invisível. Cair
    // para "inalcançável" nesse caso é o erro seguro: um falso-negativo aqui
    // vira uma linha extra em obscured pra conferir à mão; um falso-positivo
    // passaria em silêncio, que é o bug que essa função existe pra pegar.
    if (hit === el || el.contains(hit)) return { reachable: true, reason: null };
    return { reachable: false, reason: 'coberto por ' + describe(hit) };
  }

  var TOUCH_TARGET_SELECTOR =
    '.nav-item:not(.disabled), .nav-group-head, .switcher, .switch-arena-link, .user-row, .nav-trigger, .topbar-avatar, .bottom-slot';

  function measureTouchTargets() {
    var pointerCoarse = matchMedia('(pointer: coarse)').matches;
    var els = Array.prototype.slice.call(document.querySelectorAll(TOUCH_TARGET_SELECTOR));
    // Guarda no mesmo espírito da extração de NAV_ITEMS: se o seletor sair de
    // sincronia com o shell (classe renomeada em panel-shell.component.ts
    // sem espelhar em TOUCH_TARGET_SELECTOR), esta função não pode devolver
    // silenciosamente "zero alvos, zero violações" -- isso leria como
    // asserção 4 verde para sempre, medindo nada. Em qualquer estado
    // renderizado do shell (sidebar OU drawer aberto OU só a topbar/
    // bottom-nav com o drawer fechado) sempre existe pelo menos um elemento
    // que casa com o seletor -- zero aqui é sinal de desalinhamento, não um
    // estado válido.
    if (els.length === 0) {
      throw new Error(
        'measureTouchTargets: TOUCH_TARGET_SELECTOR não casou nenhum elemento neste estado ' +
          '-- o seletor provavelmente saiu de sincronia com panel-shell.component.ts.',
      );
    }
    var visible = [];
    var obscured = [];
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var reach = reachability(els[i], cx, cy);
      if (reach.reachable) {
        visible.push({ el: els[i], r: r });
      } else {
        obscured.push({ target: describe(els[i]), reason: reach.reason });
      }
    }
    var undersized = [];
    for (var j = 0; j < visible.length; j++) {
      // Tolerância de 0.25px: arredondamento subpixel do layout engine
      // (getBoundingClientRect devolve frações de pixel; comparar igualdade
      // exata contra 44/8 flutuaria por ruído de renderização, não por
      // geometria real).
      if (visible[j].r.height < 44 - 0.25) {
        undersized.push({ target: describe(visible[j].el), height: Math.round(visible[j].r.height * 100) / 100 });
      }
    }
    var gapViolations = [];
    for (var a = 0; a < visible.length; a++) {
      for (var b = a + 1; b < visible.length; b++) {
        var gap = edgeGap(visible[a].r, visible[b].r);
        if (gap < 8 - 0.25) {
          gapViolations.push({
            a: describe(visible[a].el), b: describe(visible[b].el), gap: Math.round(gap * 100) / 100,
          });
        }
      }
    }
    return {
      pointerCoarse: pointerCoarse, targetCount: visible.length,
      reachableTargets: visible.map(function (v) { return describe(v.el); }),
      obscured: obscured, undersized: undersized, gapViolations: gapViolations,
    };
  }

  // NÃO existe measureInputFontSize()/asserção 5 aqui de propósito. A sonda
  // que existia antes (#qaProbeInput) media um input pelado que só vivia no
  // painel de QA, fora de #host -- nunca um campo do shell de verdade, porque
  // o shell (panel-shell.component.ts + drawer.component.ts) é só a moldura
  // de navegação e não renderiza NENHUM input/select/textarea; quem tem esses
  // campos são as 38 telas de ng-content, que este harness deixa vazias por
  // design (ver 'Fidelidade' no doc). Media a regra global (input, select,
  // textarea com font-size 16px sob toque) contra um elemento que nunca tinha
  // a classe .input-box/o encapsulamento de um componente real por perto --
  // ou seja, nunca podia reproduzir o bug real (a derrota de especificidade
  // contra .input-box com o atributo de escopo do Angular). A sonda só podia
  // dar verde, e dava, e o doc registrava esse verde como se fosse a regra de
  // 16px provada -- não provava. Ver 'Não coberto' em
  // docs/qa/arena-responsivo-passe-medido.md: a regra de 16px precisa de
  // medição manual num formulário de verdade (ex.: .input-box de
  // panel-court-form.component.ts), fora do escopo geométrico deste harness.

  function measurePageOverflow() {
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      hostScrollWidth: hostEl.scrollWidth,
      innerWidth: window.innerWidth,
      documentOverflows: document.documentElement.scrollWidth > window.innerWidth,
      hostOverflows: hostEl.scrollWidth > window.innerWidth,
    };
  }

  // Varre, para um cargo, TODOS os estados de grupo alcançáveis (cada
  // grupo aberto sozinho, mais o estado "tudo fechado") e mede o nav em cada
  // um. Um item só é "inalcançável de verdade" se nunca aparecer em
  // NENHUM desses estados.
  function sweepRole(role) {
    var prevRole = state.role, prevOpen = state.openGroup, prevActive = state.activeId;
    state.role = role;
    state.activeId = '__none__';

    var canSeeFn = function (it) { return canSee(it, role); };
    var expected = DATA.navItems.filter(canSeeFn).map(function (it) { return it.id; });
    var sections = buildNavSections(DATA.navItems, canSeeFn);
    var groups = [];
    for (var i = 0; i < sections.length; i++) if (sections[i].group !== null) groups.push(sections[i].group);

    var flags = computeViewportFlags();
    // Largura compacta precisa do drawer aberto pra medir o .nav -- mas abrir
    // aqui dispara a animação de entrada de drawer.component.ts
    // (ar-drawer-in-left, 240ms), que só assenta (transform: none) depois de
    // tempo de PAREDE real passar -- medido ao vivo que nem reflow síncrono
    // (offsetHeight) nem screenshot isolado bastam, só esperar de verdade
    // (computer wait). Se o chamador já abriu e esperou por fora
    // (window.arenaHarness.openDrawer() + wait real antes desta chamada),
    // reusa sem reabrir -- reabrir de novo destruiria o assentamento que já
    // aconteceu. Só força abrir aqui se ainda estiver fechado (chamada
    // avulsa, sem o cuidado externo -- aceita que o primeiro estado pode
    // medir com o transform preso; isso só contamina elementFromPoint
    // /alcançabilidade, nunca scrollHeight/clientHeight nem altura/gap de
    // retângulo, que não dependem de X).
    if (flags.isCompact && !state.drawerOpen) { state.drawerOpen = true; render(); }

    var seen = {};
    var perGroup = [];
    var statesToTry = groups.concat(['none']);
    for (var s = 0; s < statesToTry.length; s++) {
      state.openGroup = statesToTry[s];
      var f = render();
      var navRoot = f.isCompact ? drawerPanelEl : sidebarEl;
      var navEl = navRoot.querySelector('.nav');
      var navMetrics = null;
      if (navEl) {
        var cs = getComputedStyle(navEl);
        var scrollable = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
        var fits = navEl.scrollHeight <= navEl.clientHeight + 0.5 || scrollable;
        navMetrics = {
          scrollHeight: navEl.scrollHeight, clientHeight: navEl.clientHeight,
          overflowY: cs.overflowY, fits: fits,
        };
        var idEls = navEl.querySelectorAll('[data-nav-id]');
        for (var k = 0; k < idEls.length; k++) seen[idEls[k].getAttribute('data-nav-id')] = true;
      }
      perGroup.push({ state: statesToTry[s], nav: navMetrics, touch: measureTouchTargets() });
    }

    // Passada extra com o drawer FECHADO -- o estado padrão real, antes de
    // qualquer interação. O loop acima deixa o drawer aberto o tempo todo
    // (necessário pra medir o .nav), o que esconde .nav-trigger/
    // .topbar-avatar (cobertos pelo brand do próprio drawer) e .bottom-slot
    // (por trás do scrim) em TODA célula com isCompact -- as três classes
    // nunca eram medidas de verdade sem esta passada. Só faz sentido em
    // largura compacta: em desktop não existe topbar/drawer/bottom-nav, e o
    // sidebar já é coberto pelos estados de grupo acima.
    if (flags.isCompact) {
      state.drawerOpen = false;
      render();
      perGroup.push({ state: 'drawer-fechado', nav: null, touch: measureTouchTargets() });
    }

    var missing = expected.filter(function (id) { return !seen[id]; });

    // Restaura cargo/grupo/rota ativa (sem custo de animação) mas NÃO
    // reabre o drawer -- ele fica fechado (a passada acima já fechou, e
    // fechar nunca anima). Reabrir aqui só pra "deixar como estava"
    // disparia a MESMA animação sem ninguém esperar ela assentar,
    // contaminando a próxima leitura (do outro cargo, ou de quem chamar
    // isto em seguida). Quem for medir o próximo estado reabre por conta
    // própria com o mesmo cuidado (openDrawer() + espera real).
    state.role = prevRole; state.openGroup = prevOpen; state.activeId = prevActive;
    render();

    return { role: role, expectedCount: expected.length, expected: expected, missing: missing, perGroup: perGroup };
  }

  // sweptDono/sweptRecepcao: resultados de sweepRole() já calculados por
  // fora (ver openDrawer() + espera real no procedimento, pra largura
  // compacta). Omitidos, chama sweepRole() na hora -- correto e suficiente
  // pra largura NÃO compacta (sem drawer, sem animação pra assentar) e útil
  // pra uma chamada avulsa que aceita medir com o transform ainda preso.
  function fullReport(sweptDono, sweptRecepcao) {
    var flags = computeViewportFlags();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      flags: flags,
      pointerCoarse: matchMedia('(pointer: coarse)').matches,
      pageOverflow: measurePageOverflow(),
      dono: sweptDono || sweepRole('dono'),
      recepcao: sweptRecepcao || sweepRole('recepcao'),
    };
  }

  // Condensa fullReport() num veredito por asserção -- pensado para chamar
  // uma vez por viewport (resize_window + esta função) e montar a tabela do
  // procedimento sem reprocessar o JSON gigante à mão a cada caso.
  function summarize(sweptDono, sweptRecepcao) {
    var full = fullReport(sweptDono, sweptRecepcao);
    var a1Violations = [];
    var a2Missing = { dono: full.dono.missing, recepcao: full.recepcao.missing };
    var undersized = {};
    var gaps = {};
    var offscreen = {};
    // União de todo alvo REALMENTE medido (alcançável, não obscurecido) em
    // qualquer estado varrido, os dois cargos -- o número que denuncia o
    // buraco de cobertura: se um seletor sair de sincronia e passar a casar
    // menos coisa (ou nada, o que a guarda de measureTouchTargets() já pega
    // primeiro), esta contagem cai, visível na tabela em vez de escondida
    // dentro de um "assertion4_touchTargetsOk: true" que na verdade mediu
    // zero.
    var measuredTargets = {};

    ['dono', 'recepcao'].forEach(function (role) {
      full[role].perGroup.forEach(function (g) {
        if (g.nav && !g.nav.fits) {
          a1Violations.push({
            role: role, state: g.state, scrollHeight: g.nav.scrollHeight,
            clientHeight: g.nav.clientHeight, overflowY: g.nav.overflowY,
          });
        }
        if (g.touch) {
          g.touch.reachableTargets.forEach(function (t) { measuredTargets[t] = true; });
        }
        // O alvo de 44px/8px só vale "sob pointer: coarse" (a asserção 4 é
        // explícita nisso). Sem coarse, 30/34px É o tamanho correto (mouse/
        // trackpad) -- reportar isso como violação seria falso positivo.
        if (g.touch && full.pointerCoarse) {
          g.touch.undersized.forEach(function (u) {
            if (!(u.target in undersized) || u.height < undersized[u.target]) undersized[u.target] = u.height;
          });
          g.touch.gapViolations.forEach(function (v) {
            var key = v.a + ' | ' + v.b;
            if (!(key in gaps) || v.gap < gaps[key]) gaps[key] = v.gap;
          });
          g.touch.obscured.forEach(function (o) {
            if (!offscreen[o.target]) offscreen[o.target] = {};
            offscreen[o.target][o.reason] = true;
          });
        }
      });
    });

    var offscreenList = [];
    for (var key in offscreen) {
      offscreenList.push({ target: key, reasons: Object.keys(offscreen[key]) });
    }

    var measuredTargetsList = Object.keys(measuredTargets).sort();

    return {
      viewport: full.viewport,
      pointerCoarse: full.pointerCoarse,
      assertion1_navNeverClipsSilently: a1Violations.length === 0,
      assertion1_violations: a1Violations,
      assertion2_allItemsReachable: a2Missing.dono.length === 0 && a2Missing.recepcao.length === 0,
      assertion2_missing: a2Missing,
      assertion3_noHorizontalScroll: !full.pageOverflow.documentOverflows && !full.pageOverflow.hostOverflows,
      assertion3_pageOverflow: full.pageOverflow,
      assertion4_touchTargetsOk: !full.pointerCoarse || (Object.keys(undersized).length === 0 && Object.keys(gaps).length === 0),
      assertion4_undersized: undersized,
      assertion4_gapViolations: gaps,
      assertion4_offscreenChrome: offscreenList,
      assertion4_targetsMeasuredCount: measuredTargetsList.length,
      assertion4_targetsMeasured: measuredTargetsList,
      // Sem assertion5_*: não existe sujeito real pra essa medição neste
      // harness (ver nota acima de measurePageOverflow()). Não incluir a
      // chave aqui -- em vez de incluir com um valor sempre-verde -- é
      // deliberado: um consumidor que leia este objeto e trate ausência de
      // chave como "não verificado" fica correto por padrão; um
      // "assertion5_ok: true" sempre presente é o tipo de coisa que passa em
      // silêncio.
    };
  }

  function boot() {
    hostEl = document.getElementById('host');
    topbarEl = document.getElementById('topbar');
    sidebarEl = document.getElementById('sidebar');
    drawerScrimEl = document.getElementById('drawerScrim');
    drawerPanelEl = document.getElementById('drawerPanel');
    bottomNavEl = document.getElementById('bottomNav');
    wireStaticUi();
    render();
    window.addEventListener('resize', render, { passive: true });
    window.arenaHarness = {
      state: state,
      render: render,
      setRole: function (role) { document.getElementById('qaRole').value = role; state.role = role; state.openGroup = null; render(); },
      openGroup: function (g) { state.openGroup = g; render(); },
      // Abre o drawer sem medir nada -- use com uma espera real (computer
      // wait) antes de sweepRole()/summary() em largura compacta, pra dar
      // tempo da animação de entrada assentar (ver nota em sweepRole()).
      openDrawer: function () { state.drawerOpen = true; render(); },
      fullReport: fullReport,
      summary: summarize,
      sweepRole: sweepRole,
      measureTouchTargets: measureTouchTargets,
      measurePageOverflow: measurePageOverflow,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;

// ---------------------------------------------------------------------------
// index.html: esqueleto que espelha a marcação real do shell (topbar / shell
// grid / aside.sidebar / drawer / bottom-nav), mais um painel de QA (fora do
// #host, não entra em nenhuma medição de geometria do shell).
// ---------------------------------------------------------------------------
const indexHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Arena sidebar harness</title>
<style id="shell-css">__SHELL_CSS__</style>
<style>
  .qa-panel {
    max-width: 100%;
    box-sizing: border-box;
    padding: 12px 16px;
    background: #111;
    color: #eee;
    font: 12px/1.5 ui-monospace, monospace;
    border-top: 2px solid #ff6a1a;
  }
  .qa-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
  .qa-panel button { cursor: pointer; }
  .qa-output { max-height: 40vh; overflow: auto; background: #000; padding: 8px; white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>
  <div id="host" class="host">
    <header class="topbar" id="topbar"></header>
    <div class="shell" id="shell">
      <aside class="sidebar" id="sidebar"></aside>
      <div class="content"></div>
    </div>
    <div class="scrim left" id="drawerScrim" hidden>
      <div class="panel" id="drawerPanel" role="dialog" aria-modal="true" aria-label="Menu de navegação" tabindex="-1"></div>
    </div>
    <nav class="bottom-nav" id="bottomNav" aria-label="Navegação principal" hidden></nav>
  </div>

  <div class="qa-panel">
    <div class="qa-row">
      <strong>Harness do shell da arena</strong> -- gerado em __GENERATED_AT__
    </div>
    <div class="qa-row">
      <label>Cargo:
        <select id="qaRole">
          <option value="dono">dono (gestor)</option>
          <option value="recepcao">recepção</option>
        </select>
      </label>
      <label><input type="checkbox" id="qaMultiArena" checked /> múltiplas arenas (pior caso)</label>
      <button type="button" id="qaOpenDrawer">Abrir drawer</button>
      <button type="button" id="qaCloseAll">Fechar todos os grupos</button>
    </div>
    <div class="qa-row">
      <button type="button" id="qaRunSweep"><strong>Rodar varredura completa (window.arenaHarness.fullReport)</strong></button>
    </div>
    <pre class="qa-output" id="qaOutput">Use window.arenaHarness.fullReport() no console, ou o botão acima.</pre>
  </div>

  <script>window.__ARENA_NAV_DATA__ = __NAV_DATA_JSON__;</script>
  <script>__HARNESS_JS__</script>
</body>
</html>
`;

// shell.css e harness.js.mjs são escritos como arquivos separados só pra
// inspeção/diff isolado (pedido no procedimento) -- o index.html NÃO os
// referência por <link>/<script src>, e sim EMBUTE o conteúdo direto via
// <style>/<script> inline. Motivo: medido ao vivo que o servidor estático
// usado por preview_start ("serve") pode devolver conteúdo desatualizado
// pra uma re-escrita recente do MESMO caminho -- confirmado comparando
// document.styleSheets (parado numa versão antiga, contagem de regra
// menor) contra um fetch() manual pro mesmo href (contando a versão nova
// certa). Um query string de cache-busting por geração NÃO resolveu (o
// sintoma se repetiu idêntico com a URL trocada); inline elimina a
// requisição HTTP separada por completo, e com ela a classe inteira desse
// problema -- cada `node scripts/qa/arena-sidebar-harness.mjs` seguido de
// um reload de verdade no navegador sempre reflete o gerado por último.
// split/join, não .replace(str, str) -- .replace interpreta sequências
// "$&"/"$1"/... na STRING de troca; com CSS/JS de conteúdo real (não
// controlado por nós) um "$" acidental corromperia a saída em silêncio.
function inject(html, placeholder, value) {
  return html.split(placeholder).join(value);
}

const finalHtml = inject(
  inject(
    inject(inject(indexHtml, '__NAV_DATA_JSON__', navDataJson), '__GENERATED_AT__', navData.generatedAt),
    '__SHELL_CSS__',
    shellCssOut,
  ),
  '__HARNESS_JS__',
  harnessJs,
);

writeFileSync(path.join(outDir, 'index.html'), finalHtml);
writeFileSync(path.join(outDir, 'harness.js'), harnessJs);
writeFileSync(path.join(outDir, 'nav-data.json'), navDataJson);

console.log('harness gerado em', outDir);
console.log(`  itens extraídos de NAV_ITEMS: ${navItems.length}`);
console.log(`  grupos: ${groupOrder.join(', ')}`);
console.log(`  áreas de 'recepcao': ${recepcaoAreas.join(', ')}`);
