# IA Marking Desk - Mathematics

**Teacher-only, local-first review workspace for IB Mathematics explorations.** Supports both final assessment and constructive first-draft feedback. It is an independent teacher aid, not an official IB product or an automated marking service.

## Review workflows

- **First draft feedback:** place strengths and actionable improvement prompts on a student draft, prioritise revisions, and export an annotated PDF containing a student checklist. No marks are awarded in this mode.
- **Final assessment:** place evidence observations and assign teacher-controlled criterion marks using the existing A–E framework, then inspect the exact PDF export.
- Both workflows have separate editable banks and stamp sets, while sharing the secure browser-local project manager. The original PDF and teacher comments remain on the device unless the teacher exports them.

## Pass 1 — visual refinement

- Introduces shared, more legible typography, colours, button hierarchy and consistent focus styles across the workspace and standalone comment library.
- Makes default stamp settings and per-stamp appearance controls **expandable, closed by default**, leaving full formatting and resize tools one click away.
- Standardises student-facing terminology across the feedback mode (strengths and *improvements*, rather than marking *limitations*) and fixes the standalone library link.
- Cleans up project action labels: **New IA**, **Import backup** and **Back up IA**. Nothing about annotation geometry, assessment marks, PDF export integrity, or local storage was changed.
- Adds smoke checks for collapsed controls, keyboard-accessible appearance adjustments, UI terms and both libraries.

## Pass 2 — PDF-first workspace

- **Larger PDF:** on desktop, the document panel automatically shrinks to a compact rail after a PDF is loaded (unless you have chosen a different layout). You can reopen it at any time. The comment panel may also be hidden, or use **Focus PDF** to expand the page and temporarily hide the extra workspace chrome.
- **Contextual comments:** the right panel now has a **Find a comment / Edit stamp** switch. Selecting a library comment opens its editor; choosing a placed stamp reopens its text, sizing and priority controls. Use **Find another comment** to return to the searchable library.
- **Tablets and phones:** the PDF occupies the main workspace. **Document**, **Comments** and **Edit** open accessible, dismissible drawers instead of stacking a long library under the paper. Escape, a close button or the backdrop dismisses the drawer. Focus remains within an open drawer. On phones the less-frequent **Projects & backups** and **IA details, criteria & marks** tools are collapsed until requested; a 2029-framework warning remains visible.
- **Unchanged marking data:** these controls affect only the local browser layout; marks, feedback actions, PDF coordinates, on-page exports and project backups remain as before.
- **Verification:** the existing real-PDF end-to-end suite now tests search-to-editor, panel controls, mobile drawers, focus mode and the complete export path.

## Pass 3 — faster marking and feedback

- **Keyboard-first comment finding:** use **/** or **Ctrl/Cmd + K** anywhere outside another modal to open the appropriate comment bank, even in the PDF-only focused view. Search understands *multiple independent keywords* across criterion, category, tags and full comment wording, ranking closely related suggestions first. Use **↑/↓** and **Enter** to prepare a stamp without leaving the keyboard.
- **Predictable stamp placement:** as the pointer moves over empty PDF space, an outlined preview shows the **full teacher comment at its calculated final location**. The same existing placement algorithm shifts boxes away from other teacher comments when possible. The preview reports when it moves or when a box needs attention. It does **not** claim to detect or avoid the student's mathematical work; teachers still inspect and position every stamp.
- **Fewer clicks:** keep favourites and recent stamps, use **R** to toggle repeat stamping, **[** and **]** to change PDF pages, and **Esc** to abandon a placement. The **?** guide is available beside the fast search button. Typing shortcuts are inactive inside text fields; Ctrl/Cmd + K can still open search. All shortcuts are inactive inside other dialogs.
- **Safety and persistence:** the visual preview is never written to the IA or exported PDF. All stamps, criteria marks, text editing, undo/redo, local save/restore and export preflight remain unchanged.
- Unit tests and real-PDF browser checks cover matching, selection, preview-to-final placement agreement and the unchanged moderation/export workflow.

## What you can do

- Upload an IA PDF (rendered within your browser, not uploaded to this repository or a server). The annotated export prints notes directly onto each original PDF page, rather than placing them in a separate right-hand margin.
- Select AA SL, AI SL, AA HL or AI HL; add an anonymous assessment ID and exam session.
- Place **circular A-E evidence stamps** on pages. Each **complete strength/limitation comment is printed directly ON the student’s original PDF page, beside its A–E circle**, so the moderator sees the wording in place. Teachers drag and resize the on-page callout to find available whitespace; the PDF export keeps the same original page size. Each stamp's text is independently editable. Choose the A–E circle **diameter (14–42 PDF points)** and its colour, then separately customise the **full comment's font size (7–18 pt), text colour, box background, border colour, width and height**. Each placed comment has a draggable lower-right resize handle; the sidebar also provides width and height sliders plus **Fit box height to full comment**. Use the collapsible default comment-style controls to set reusable formatting for new notes or explicitly apply font and colours to all placed comments without resetting their individually sized boxes. Drag a stamp or move it to another page; use the side panel to revisit it.
- Search **294 original assessment-evidence comments** from the supplied 2021–2026 examiner-feedback synthesis (147 strengths, 147 limitations), organised by criterion and searchable topic. Open the independent **[full comment library](library.html)** (it works even when the PDF renderer is missing) to see all comments in one searchable view, copy an individual comment, copy all filtered comments, edit an existing library entry or add your own reusable comments. This works even before uploading an IA.
- Open **IB criteria & marks** for a complete **criterion-by-criterion, mark-by-mark teacher reference**: every achievable level (including zero) for A /4, B /4, C /3, D /3 and E /6 is shown. The A–E jump bar and tap-to-award rows make marking quick, and the teacher can record a separate rationale for each criterion. Criterion E switches automatically between SL and HL. On phones this is a **full-height sheet** with a scrollable rubric, compact fixed navigation and a visible total. Original official descriptor wording can be consulted using the linked IB subject guide or a locally opened authorised PDF within the same panel. The on-site level descriptions are **independently paraphrased guidance, not a reproduction of the IB's official licensed rubric**. Neither stamps nor comment counts determine marks.
- **Pass 8 teacher efficiency**: use the compact toolbar for **Undo/Redo** (also Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl+Y when not typing), **Stamp again**, and a **Repeat** toggle that keeps a customised comment active for repeated placement. Duplicate an existing comment from its editor using **Duplicate & place**; click the PDF for each new annotation. The comment bank now has **All**, **★ Favourites**, and **Recent** views, and the quick-stamp dropdown offers favourites/recently *placed* comments while the PDF remains visible. Favourites are also available in the standalone library and are stored locally as **comment IDs only**, independently of student projects. Use **A–E evidence** to see all placed teacher observations and marks grouped by criterion; selecting a comment jumps to its exact PDF page and opens its editor. The navigator has a full-screen mobile view.
- **Bounded marking undo history**: reverses up to 60 changes to stamps, drag/resize, text and colour adjustments, bulk formatting/arrangement, deletions, criterion marks and rationales. A text edit is one step when the field loses focus. History is **cleared on a new/replaced/imported IA**, cannot restore a different student's PDF, and is not embedded in portable project files. Regular browser text fields retain their own native editing undo.
- **Pass 7 moderator preflight**: press **Generate actual PDF preview** in Review & export. Automated checks flag small-font comments, weak text/background contrast, overlapping annotations, missing criterion marks, scanned/rotated pages and possible overlap with selectable student text. Inspect **every page of the actual exported file, including the mark summary**, confirm legibility and unobscured student mathematics, then export the **same PDF bytes** shown in the preview. Changing a comment, mark or rationale invalidates the previous approval.
- **Mathematics-preserving Unicode export**: Noto Sans and Noto Sans Math are embedded directly in the exported file (via PDF fontkit), preserving ordinary mathematical characters such as π, ∫, √, ≤, Σ, σ² and subscripts. Unsupported characters cause an explicit error instead of silently becoming question marks or ASCII approximations. These are Unicode comments rather than TeX formula typesetting.
- Export a new annotated PDF with the original student pages and dimensions retained. **Every full comment and its A–E circle are burned into the original IA page at the teacher-chosen position.** Annotations that cannot fit, whose text overflows a manually shortened box, or which overlap are flagged and export is blocked until corrected. The visible preview and PDF share the chosen font size, text colour, background and border colours. A separate marking summary follows.
- **Pass 9 cohort project manager:** select **My IAs** to see saved IAs by anonymous assessment ID, course, session, source PDF, pages, criterion marks recorded (0–5), evidence-stamp count, last-saved timestamp and status. Filter by course or search ID/filename. **Open IA** safely writes the current project before switching, so different students' marks and comments never mix. An explicit **Saved on this device** indicator confirms completed local IndexedDB writes; if storage fails, teachers are told to download the portable backup instead.
- **Private browser backups:** **Download backup** produces a full editable `.iamark.json` for the current or selected IA (including its original student PDF). **Download all backups (.zip)** packages the entire local cohort into separate project files, entirely in the browser. Both formats are **unencrypted and confidential**; do not store the ZIP in a publicly accessible location. Existing portable v1 backups remain compatible, and importing one creates an **independent** locally saved IA rather than overwriting another.
- **Local data controls:** Delete a particular IA in the dashboard or choose **Clear stored IA data…**, which requires typing `DELETE ALL`. This clears every saved IA and the legacy draft from this browser's IndexedDB, including the currently open project. A separate checkbox optionally clears only this site's personal comment library, stamp defaults, edits, favourites and recent comment choices. Previously downloaded backups, external device backups, other browser tabs and physical disk remnants are **not** erased. This does not claim forensic secure deletion.
- **Old drafts preserved:** the existing version-1 single-browser-draft store is migrated automatically into the local multi-IA list. A New project starts a blank assessment without deleting previously saved projects; switching resets the short-lived undo history.

### Assessment framework warning

The five criteria above apply to the **IB Mathematics IA framework whose last assessment is November 2028**. The IB's **first assessment in May 2029 introduces four new criteria** (A Problem specification /4, B Abstraction /6, C Computation /4, D Interpretation /6). This app displays a warning and **blocks annotated-PDF export when the session says 2029 or later**. A future version would need a separate 2029-specific bank and assessment UI. See [IB Mathematics curriculum](https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/) and the current [AA](https://www.ibo.org/university-admission/latest-curriculum-updates/dp-mathematics-analysis-and-approaches-updates/) and [AI](https://www.ibo.org/university-admission/latest-curriculum-updates/dp-mathematics-applications-and-interpretation-updates/) updates.

### Course notes

The supplied examiner-feedback synthesis covers **AA SL, AI SL and AA HL**. AI HL is included as a course choice and uses the generally applicable bank, but comments have not been independently calibrated against AI HL examiner reports. Criterion E descriptors differ between SL and HL under the pre-2029 framework; always consult the applicable official guide and marked exemplars before awarding marks.

### Comment editing vs stamped evidence

The **Edit** action on a comment updates the reusable local library for future stamps. Built-in comments can be restored to their original wording; personal comments can be edited or deleted. Edits are saved in this browser's local storage and included in newly saved projects. They do not change the repository's shared 294-comment source file or automatically rewrite any stamp already placed on a student's IA. The **Edit stamp** textarea only changes that particular annotation. Use the **Copy** buttons to paste the comment into a separate marking record or moderation document.

Font size, text colour, box fill, outline, width and height are stored with each placed stamp and preserved when saved marking projects are reopened. Older marking projects that lack these fields receive safe defaults. The coloured criterion circle can remain different from the colour of the comment text and box.

Stamp defaults also persist in this browser. A new stamp inherits its size and colour when selected; changes to defaults do not restyle already placed stamps unless **Apply these colours and size to all existing stamps** is chosen. Individual stamp overrides remain in saved projects and the annotated PDF export.

## Install and publish

This repository contains the source for the static application, with exact-version PDF rendering dependencies:

```bash
npm install --omit=optional --ignore-scripts --no-audit --no-fund
npm test
npm run build
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000` to use the built app. PDF.js 6.4.299, pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1 and open-licensed Noto Sans / Noto Sans Math fonts are copied from npm dependencies to `dist/vendor/`. The deployed webpage requests only **self-hosted** scripts, including JSZip 3.10.1 for cohort backups. There is no backend, account, external upload or telemetry.

**Important:** GitHub Pages must publish the compiled Actions build, **not** the raw `main` branch. The raw source does not contain `vendor/pdf.mjs` or its worker, so PDF upload fails (and the older version prevented the library from loading). In GitHub **Settings > Pages > Build and deployment**, set **Source = GitHub Actions**. If you still see the old site, use a hard refresh after the deployment completes. PDF loading now fails with a visible notice rather than breaking all reference tools.\n\nFor automatic deployment, go to **Settings > Pages > Build and deployment > Source: GitHub Actions**. On every push to `main`, `.github/workflows/pages.yml` runs the data checks, builds the self-hosted static files, then deploys to GitHub Pages. The expected URL after Pages is enabled is `https://chriswalker-afk.github.io/IA-Marking/`. If Pages has not yet been enabled, the deploy step may fail even though source and tests are fine.

## Privacy and boundaries

- Only use a trusted teacher-controlled device/browser. Project PDFs, annotated evidence and personal comments are stored **unencrypted in IndexedDB/localStorage**. A browser can evict these records; save confidential portable backups regularly. There is no login, central access control or guaranteed forensic deletion.
- A saved `.iamark.json` embeds the **entire student PDF**; it is confidential. Do not commit projects, annotated student PDFs, actual names or student data to GitHub. `.gitignore` excludes local project and PDF files.
- This tool does not independently evaluate mathematical work, assign marks, detect originality, perform anonymisation, apply official descriptors or replace faculty standardisation. The teacher remains responsible for assessment.
- PDF exports retain the original student page dimensions and print full text beside the coloured criterion circle. Preflight can identify potential collisions with **selectable source text**, but it cannot reliably detect mathematics drawn as vectors, diagrams, photos or scans. Treat warnings as prompts for human inspection, not proof of safety. The exact-PDF preview requires visiting every page and an explicit teacher acknowledgement before export. Check legibility, anonymity and any upload size/layout restrictions before moderation submission.
- Exported comments embed Unicode-capable Noto fonts. Common mathematical operators and Greek characters are preserved; an unsupported glyph blocks the preview with an error rather than silently changing notation. Formula placement is text-based, not full LaTeX layout. Original student PDF content is preserved.
- PDFs with rotation, password protection, unusual page boxes or extensive scanning need additional testing. Do not assume exported annotation positions are correct on those files without checking.
- This comment bank is an **original, paraphrased set of teacher-facing observations**, not a copy of the IB achievement descriptors. It draws from the supplied 21-page *IA examiner feedback actionable checklist* (2021-2026), especially criterion comments (pp. 4-12) and assessment/moderation guidance (pp. 18-19).

## Repository map

- `index.html`, `styles.css` - PDF marking workspace and responsive full-height A–E rubric/marking dialog
- `rubric.js` - complete original paraphrases of A–E achievement levels, with course-specific SL and HL criterion E; links to the authoritative IB guides remain in `app.js`
- `library.html`, `library.css`, `library.js` - PDF-independent full searchable, copyable and editable comment library
- `app.js` - placement, editing, manual marks, local storage, exact-PDF preview and export
- `unicode-fonts.js` - Unicode/Greek/operator-preserving font layout and PDF drawing; rejects unsupported characters
- `moderation-preflight.js` - source-text collision, contrast, text-size, scan/rotation and completeness warnings
- `marking-history.js` - bounded undo/redo snapshots and safely normalised quick-pick IDs
- `project-vault.js` - multi-IA local IndexedDB storage, atomic project/index writes, progress metadata and v1 draft migration
- `comments.js` - browser comment library
- `comments.json` - structured authoring library (includes source page and course tags)
- `build_bank.py` - source script for generating comment bank
- `tests/bank.test.mjs`, `tests/marking-history.test.mjs`, `tests/project-vault.test.mjs` - library, UI, reversible marking and local-project progress checks
- `tests/smoke_browser.py` - mocked PDF UI smoke test
- `tests/live_pdf_browser.py` - real Chromium PDF upload, page render, **complete on-page/moderator-visible comment text**, original page dimensions, PDF export, multi-IA storage/switching, ZIP backups, confirmed deletion and v1 draft migration
- `scripts/build.mjs` - copies version-pinned libraries and source into a deployable static `dist/`
- `.github/workflows/pages.yml` - verify and publish from a compiled `dist/` site\n- `.github/workflows/verify.yml` - test PRs and run the real PDF end-to-end browser check

## Next improvements

1. Follow with **Pass 10 — faculty moderation / second marking**: isolated first/second marker marks and rationales, a criterion-level comparison and a final agreed assessment record. All original IA evidence and stored projects must stay private on the teacher's device.
2. Stress-test 20+ stamps on a page, large or rotated/scanned PDFs and reopen projects across browsers; scan and diagram obstruction still needs explicit teacher review.
3. Add optional graphical highlight evidence, reusable teacher presets and sharing non-confidential bank customisations.
4. Add moderated mark comparisons and a distinct **first-assessment-2029** framework with its own evidence bank.
