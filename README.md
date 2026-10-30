# IA Marking Desk - Mathematics

**Teacher-only, local-first marking workspace for final IB Mathematics explorations.** An independent aid for recording assessment evidence, not an official IB product, a student-feedback system or an automated marking service.

## What you can do

- Upload a final IA PDF (rendered within your browser, not uploaded to this repository or a server). The annotated export prints notes directly onto each original PDF page, rather than placing them in a separate right-hand margin.
- Select AA SL, AI SL, AA HL or AI HL; add an anonymous assessment ID and exam session.
- Place **circular A-E evidence stamps** on pages. Each **complete strength/limitation comment is printed directly ON the student’s original PDF page, beside its A–E circle**, so the moderator sees the wording in place. Teachers drag and resize the on-page callout to find available whitespace; the PDF export keeps the same original page size. Each stamp's text is independently editable. Choose the A–E circle **diameter (14–42 PDF points)** and its colour, then separately customise the **full comment's font size (7–18 pt), text colour, box background, border colour, width and height**. Each placed comment has a draggable lower-right resize handle; the sidebar also provides width and height sliders plus **Fit box height to full comment**. Use the collapsible default comment-style controls to set reusable formatting for new notes or explicitly apply font and colours to all placed comments without resetting their individually sized boxes. Drag a stamp or move it to another page; use the side panel to revisit it.
- Search **294 original assessment-evidence comments** from the supplied 2021–2026 examiner-feedback synthesis (147 strengths, 147 limitations), organised by criterion and searchable topic. Open the independent **[full comment library](library.html)** (it works even when the PDF renderer is missing) to see all comments in one searchable view, copy an individual comment, copy all filtered comments, edit an existing library entry or add your own reusable comments. This works even before uploading an IA.
- Open the optional **IB criteria & marks** panel to consult the applicable complete official AA/AI subject-guide PDF, or view an authorised guide copy locally. Award A /4, B /4, C /3, D /3 and E /6 manually, and add criterion-level rationales. Neither stamps nor comment counts determine marks.
- Export a new annotated PDF with the original student pages and dimensions retained. **Every full comment and its A–E circle are burned into the original IA page at the teacher-chosen position.** Annotations that cannot fit, whose text overflows a manually shortened box, or which overlap are flagged and export is blocked until corrected. The visible preview and PDF share the chosen font size, text colour, background and border colours. A separate marking summary follows.
- Save a portable `.iamark.json` project (includes the uploaded PDF, stamp appearance, custom comments and edited library wording), or resume your own locally autosaved draft through IndexedDB. Existing version-1 projects continue to open, with defaults applied to older stamps.

### Assessment framework warning

The five criteria above apply to the **IB Mathematics IA framework whose last assessment is November 2028**. The IB's **first assessment in May 2029 introduces four new criteria** (A Problem specification /4, B Abstraction /6, C Computation /4, D Interpretation /6). This app displays a warning and **blocks annotated-PDF export when the session says 2029 or later**. A future version would need a separate 2029-specific bank and assessment UI. See [IB Mathematics curriculum](https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/) and the current [AA](https://www.ibo.org/university-admission/latest-curriculum-updates/dp-mathematics-analysis-and-approaches-updates/) and [AI](https://www.ibo.org/university-admission/latest-curriculum-updates/dp-mathematics-applications-and-interpretation-updates/) updates.

### Course notes

The supplied examiner-feedback synthesis covers **AA SL, AI SL and AA HL**. AI HL is included as a course choice and uses the generally applicable bank, but comments have not been independently calibrated against AI HL examiner reports. Criterion E descriptors differ between SL and HL under the pre-2029 framework; always consult the applicable official guide and marked exemplars before awarding marks.

### Comment editing vs stamped evidence

The **Edit** action on a comment updates the reusable local library for future stamps. Built-in comments can be restored to their original wording; personal comments can be edited or deleted. Edits are saved in this browser's local storage and included in newly saved projects. They do not change the repository's shared 294-comment source file or automatically rewrite any stamp already placed on a student's IA. The **Edit stamp** textarea only changes that particular annotation. Use the **Copy** buttons to paste the comment into a separate marking record or moderation document.

Font size, text colour, box fill, outline, width and height are stored with each placed stamp and preserved when saved marking projects are reopened. Older marking projects that lack these fields receive safe defaults. The coloured criterion circle can remain different from the colour of the comment text and box.\n\nStamp defaults also persist in this browser. A new stamp inherits its size and colour when selected; changes to defaults do not restyle already placed stamps unless **Apply these colours and size to all existing stamps** is chosen. Individual stamp overrides remain in saved projects and the annotated PDF export.

## Install and publish

This repository contains the source for the static application, with exact-version PDF rendering dependencies:

```bash
npm install --omit=optional --ignore-scripts --no-audit --no-fund
npm test
npm run build
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000` to use the built app. PDF.js 6.4.299 and pdf-lib 1.17.1 are copied from locally installed npm dependencies to `dist/vendor/`. The deployed webpage requests only **self-hosted** scripts. There is no backend, account, external upload or telemetry.

**Important:** GitHub Pages must publish the compiled Actions build, **not** the raw `main` branch. The raw source does not contain `vendor/pdf.mjs` or its worker, so PDF upload fails (and the older version prevented the library from loading). In GitHub **Settings > Pages > Build and deployment**, set **Source = GitHub Actions**. If you still see the old site, use a hard refresh after the deployment completes. PDF loading now fails with a visible notice rather than breaking all reference tools.\n\nFor automatic deployment, go to **Settings > Pages > Build and deployment > Source: GitHub Actions**. On every push to `main`, `.github/workflows/pages.yml` runs the data checks, builds the self-hosted static files, then deploys to GitHub Pages. The expected URL after Pages is enabled is `https://chriswalker-afk.github.io/IA-Marking/`. If Pages has not yet been enabled, the deploy step may fail even though source and tests are fine.

## Privacy and boundaries

- Only use a trusted teacher-controlled device/browser. PDF bytes, draft annotations and personal comments are stored **unencrypted locally**. There is no central access control or automatic cleanup.
- A saved `.iamark.json` embeds the **entire student PDF**; it is confidential. Do not commit projects, annotated student PDFs, actual names or student data to GitHub. `.gitignore` excludes local project and PDF files.
- This tool does not independently evaluate mathematical work, assign marks, detect originality, perform anonymisation, apply official descriptors or replace faculty standardisation. The teacher remains responsible for assessment.
- PDF exports retain the original student page dimensions and print full text beside the coloured criterion circle on that page. Teachers must position notes in unused space to avoid covering student mathematics; the interface cannot automatically detect which parts of the page contain relevant work. Check the rendered file, continued notes, legibility, anonymity and any upload size/layout restrictions before moderation submission.
- Exported teacher notes use PDF standard fonts and normalise some mathematical/Greek symbols to ASCII. Check custom maths text carefully. Original student PDF content is preserved.
- PDFs with rotation, password protection, unusual page boxes or extensive scanning need additional testing. Do not assume exported annotation positions are correct on those files without checking.
- This comment bank is an **original, paraphrased set of teacher-facing observations**, not a copy of the IB achievement descriptors. It draws from the supplied 21-page *IA examiner feedback actionable checklist* (2021-2026), especially criterion comments (pp. 4-12) and assessment/moderation guidance (pp. 18-19).

## Repository map

- `index.html`, `styles.css` - PDF marking workspace and optional official-criteria reference dialog\n- `library.html`, `library.css`, `library.js` - PDF-independent full searchable, copyable and editable comment library
- `app.js` - placement, editing, manual marks, local storage, review and PDF export
- `comments.js` - browser comment library
- `comments.json` - structured authoring library (includes source page and course tags)
- `build_bank.py` - source script for generating comment bank
- `tests/bank.test.mjs` - consistency, coverage and interface contract checks
- `tests/smoke_browser.py` - mocked PDF UI smoke test\n- `tests/live_pdf_browser.py` - real Chromium PDF upload, page render, **complete on-page/moderator-visible comment text**, original page dimensions and PDF export test, run by CI
- `scripts/build.mjs` - copies version-pinned libraries and source into a deployable static `dist/`
- `.github/workflows/pages.yml` - verify and publish from a compiled `dist/` site\n- `.github/workflows/verify.yml` - test PRs and run the real PDF end-to-end browser check

## Next improvements

1. Test against faculty examples: 20+ stamps on one page, large or scanned/rotated PDFs, cross-page moves, export overflow and reopen projects on multiple browsers.
2. Add on-page graphical highlights (optional), richer Unicode in teacher-note PDF export and bank sharing between colleagues.
3. Add criterion descriptor calibration, moderated mark comparisons and a distinct **first-assessment-2029** framework with its own evidence bank.
