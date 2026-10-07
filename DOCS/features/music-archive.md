# Music & Archive

A production's music track list plus a one-click cue sheet PDF. Lives at Deliver → **Music & Archive** (`/music-clearance`, `MusicClearancePage`).

## Code map
| Area | Location |
|---|---|
| Page | `src/features/music-clearance/page.tsx` |
| Repository (tracks, clearances, cue sheets) | `src/lib/db/repositories/music-clearance.ts` |
| Cue sheet PDF | `generateCueSheet` in `src/lib/pdf/index.ts` |
| Saving the PDF | `persistProductionDocument` (`src/lib/documents/persistDocument.ts`), `saveFileWithDialog` (`src/lib/files`) |
| Clearance consumer | `src/lib/breakdown/matching.ts`, `src/features/schedule/script-breakdown-data.ts` |
| Tables | `music_tracks`, `clearances`, `cue_sheets` (0001); `music_tracks.episode_id` (0062) |
| Tests | `src/features/music-clearance/MusicClearance.integration.test.tsx` |

## Data model
| Table | Notes |
|---|---|
| `music_tracks` | `production_id`, nullable `episode_id`, `title` (required), `artist`, `publisher_label`, `notes`, soft-delete. |
| `clearances` | `type` (`music` or `archive`), `item_id` (the track id), `status` (default `pending`), `requested_at`, `granted_at`, `expiry`, soft-delete. `item_id` is not a foreign key. |
| `cue_sheets` | `production_id`, `generated_at`, `document_id` -> `documents`. One row per generated PDF. |

## How it works
- **Tracks**: the page lists tracks by title and supports **New music track** and edit (title, artist, publisher / label, scope). The repository also has `deleteMusicTrack` (soft delete) but the page does not expose it.
- **Episodic scope**: on episodic productions each track is project-wide (`episode_id` null) or tied to one active episode; the table shows a **Scope** column and the list can be filtered All / Project-wide / one episode. `assertMusicTrackEpisodeAllowed` rejects an episode on a non-episodic production and any archived or unknown episode. A track pointing at an archived episode keeps its label "(archived)" until reassigned; deleting an episode nulls `episode_id` on its tracks. See [productions.md](productions.md#episodic-productions).
- **Cue sheet**: **Generate cue sheet PDF** takes all live tracks (ignoring the list filter), builds a one-page PDF (title, artist, publisher / label, "Use" column which is always blank), stores it as a document with `entity_type = 'cue_sheet'`, inserts a `cue_sheets` row, then offers a save-as dialog for a copy. The PDF appears under Documents -> **Music & clearance** ([documents.md](documents.md)).
- **Clearances**: stored per track and read by Script Breakdown: a Foley/Music element matched to a track is "partial" while a `music` clearance exists with no `granted_at`, "sourced" otherwise ([script.md](script.md)). Clearances are created only by demo seeds and the repository functions (`createClearance`, `updateClearance`); the page has no clearance editor.

## Connections
- Documents hub (cue sheet PDFs), Script Breakdown (clearance status), the tutorial section `musicArchiveTutorial`.
- **Duplicate production** copies tracks (title, artist, publisher / label, remapped `episode_id`; `notes` is not copied) and clearances (`expiry` is not copied), remapping `item_id`.
- **.apf export** includes `music_tracks`, `clearances` and `cue_sheets`; see [import-export.md](../import-export.md).

## Gotchas
- `generateCueSheet` draws on a single page and stops at the bottom margin (`y < 100`), so long track lists are silently cut off. Titles, artists and labels are truncated to 25-30 characters.
- Nothing links a `clearances.type = 'archive'` row to a feature yet; only `music` clearances are consumed.
