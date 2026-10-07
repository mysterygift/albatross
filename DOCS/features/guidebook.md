# Guidebook viewer
The in-app reader for the user guide at **Settings → Guidebook** (`/settings/guidebook/:chapter?`). It renders the markdown files in `GUIDEBOOK/` directly, so editing a chapter is all it takes to update the app.

## Code map
| Area | Location |
|---|---|
| Page (layout, scroll handling, prev/next) | `src/features/guidebook/GuidebookPage.tsx` |
| Contents sidebar | `src/features/guidebook/GuidebookContents.tsx` |
| Markdown renderer (element styling, link and image handling) | `src/features/guidebook/GuidebookMarkdown.tsx` |
| Loading, headings, link resolution | `src/lib/guidebook/guidebook.ts` |
| Route and Settings entry | `src/app/router.tsx` (lazy route), `src/features/settings/settingsSections.ts` (`guidebook` section) |
| Tests | `src/lib/guidebook/guidebook.test.ts`, `src/features/guidebook/GuidebookPage.test.tsx` |

## How it works
- **Content is bundled at build time.** `import.meta.glob('/GUIDEBOOK/*.md', { query: '?raw' })` and `GUIDEBOOK/images/*` (`?url`) are resolved by Vite, so the guide works offline and no file is read at runtime. The route is lazy, so the markdown is in its own chunk.
- **Chapters come from file names.** `README.md` is the contents page (slug `index`); every other `NN-slug.md` is a chapter, ordered numerically. The first `# ` line is the chapter title shown in the sidebar.
- **Sidebar sections** are the `##` and `###` headings of the open chapter. Ids match `rehype-slug` (GitHub-style, duplicates suffixed `-1`), so in-page anchor links and `file.md#heading` links work. A scroll spy highlights the current section.
- **Links:** `#anchor` scrolls in place; `NN-slug.md#anchor` navigates in the app; `http(s):`/`mailto:` open in the system (`openInSystem`); `../<path>` (for example `../README.md#...`) opens that file on GitHub (`REPO_BLOB_URL`). Anything else renders as plain text.
- **Images:** `images/<file>` is looked up in the bundled images. A missing file renders a dashed "Screenshot: <alt text>" placeholder instead of a broken image, so chapters can ship before every screenshot exists.
- Rendering uses `react-markdown` with `remark-gfm` (tables) and `rehype-slug`. Styling is a component map in `GuidebookMarkdown.tsx`; there is no typography plugin.

## Authoring rules
- Name chapters `NN-slug.md`; keep one `# ` title per file.
- Link between chapters with relative `NN-slug.md#anchor` links, as on GitHub.
- `guidebook.test.ts` fails if any chapter link or anchor is broken, so renaming a chapter or heading surfaces broken links in `npm test`.

## Gotchas
- Raw HTML in markdown is not rendered (react-markdown default); use markdown syntax only.
- The glob is relative to the Vite root, so `GUIDEBOOK/` must stay at the repository root.
