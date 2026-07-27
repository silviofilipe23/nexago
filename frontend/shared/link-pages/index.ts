export type {
  LinkIconName,
  LinkIconOption,
  LinkPage,
  LinkPageHighlight,
  LinkPageOwnerType,
  PageLink,
} from './link-page.model';
export {
  LINK_ICON_OPTIONS,
  LINK_PAGE_MAX_LINKS,
  LINK_PAGE_SLUG_MAX,
  LINK_PAGE_SLUG_MIN,
  RESERVED_LINK_SLUGS,
  activePageLinks,
  displayLinkUrl,
  isLinkIconName,
  linkPageIdFor,
  linkPageInitials,
  linkPagePath,
  normalizeLinkUrl,
  slugifyLinkPage,
  sortPageLinks,
  topLinkOf,
  validateLinkPageSlug,
  validateLinkUrl,
  viewsTrendPercent,
} from './link-page.model';

export type { LinkPageProfileInput, PageLinkInput } from './link-pages-repository';
export {
  createPageLink,
  deletePageLink,
  fetchLinkPage,
  fetchPageLinks,
  linkPageFromFirestore,
  pageLinkFromFirestore,
  reorderPageLinks,
  saveLinkPageProfile,
  setPageLinkActive,
  updatePageLink,
  validateLinkPageProfile,
  validatePageLink,
} from './link-pages-repository';

export { LinkIconComponent } from './ui/link-icon.component';
export { LinkPagePreviewComponent } from './ui/link-page-preview.component';
export { LinkEditorDialogComponent } from './ui/link-editor-dialog.component';
export {
  LinkPageSettingsDialogComponent,
  type LinkPageSettingsValue,
} from './ui/link-page-settings-dialog.component';
export { LinkManagerComponent, type LinkSuggestion } from './ui/link-manager.component';
