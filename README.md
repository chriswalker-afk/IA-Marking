# IA Marking Desk - Mathematics

**Teacher-only, local-first marking workspace for final IB Mathematics explorations.** An independent aid for recording assessment evidence, not an official IB product, a student-feedback system or an automated marking service.

## What you can do

- Upload a final IA PDF (rendered within your browser, not uploaded to this repository or a server).
- Select AA SL, AI SL, AA HL or AI HL; add an anonymous assessment ID and exam session.
- Place **small circular A-E evidence stamps** on pages, with an individually editable strength/limitation observation attached. Drag a stamp or move it to another page; use the side panel to revisit it.
- Search **294 original assessment-evidence comments** from the attached 2021-2026 examiner-feedback synthesis (147 strengths, 147 limitations), organised by criterion and searchable topic. Add your own reusable comments locally.
- Award A /4, B /4, C /3, D /3 and E /6 manually, and add criterion-level rationales. Neither stamps nor comment counts determine marks.
- Export a new annotated PDF with the original student pages retained, evidence notes in a right-side margin, continuation pages for crowded annotations, and a criterion summary.
- Save a portable `.iamark.json` project (includes the uploaded PDF), or resume your own locally autosaved draft through IndexedDB.

### Assessment framework warning

The five criteria above apply to the **IB Mathematics IA framework whose last assessment is November 2028**. The IB's **first assessment in May 2029 introduces four new criteria** (A Problem specification /4, B Abstraction /6, C Computation /4, D Interpretation /6). This app displays a warning and **blocks annotated-PDF export when the session says 2029 or later**. A future version would need a separate 2029-specific bank and assessment UI. See [IB Mathematics curriculum](https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/) and the current [AA](https://www.ibo.org/university-admission/latest-curriculum-updates/dp-mathematics-analysis-and-approaches-updates/) and [AI](https://www.ibo.org/university-admission/latest-curriculum-updates/dp-mathematics-applications-and-interpretation-updates/) updates.

### Course notes

The supplied examiner-feedback synthesis covers **AA SL, AI SL and AA HL**. AI HL is included as a course choice and uses the generally applicable bank, but comments have not been independently calibrated against AI HL examiner reports. Criterion E descriptors differ between SL and HL under the pre-2029 framework; always consult the applicable official guide and marked exemplars before awarding marks.

## Install and publish

This repository contains the source for the static application, with exact-version PDF rendering dependencies:

```bash
npm install --omit=optional --ignore-scripts --no-audit --no-fund
npm test
npm run build
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000` to use the built app. PDF.js 6.4.299 and pdf-lib 1.17.1 are copied from locally installed npm dependencies to `dist/vendor/`. The deployed webpage requests only **self-hosted** scripts. There is no backend, account, external upload or telemetry.

For automatic deployment, go to **Settings > Pages > Build and deployment > Source: GitHub Actions**. On every push to `main`, `.github/workflows/pages.yml` runs the data checks, builds the self-hosted static files, then deploys to GitHub Pages. The expected URL after Pages is enabled is `https://chriswalker-afk.github.io/IA-Marking/`. If Pages has not yet been enabled, the deploy step may fail even though source and tests are fine.

## Privacy and boundaries

- Only use a trusted teacher-controlled device/browser. PDF bytes, draft annotations and personal comments are stored **unencrypted locally**. There is no central access control or automatic cleanup.
- A saved `.iamark.json` embeds the **entire student PDF**; it is confidential. Do not commit projects, annotated student PDFs, actual names or student data to GitHub. `.gitignore` excludes local project and PDF files.
- This tool does not independently evaluate mathematical work, assign marks, detect originality, perform anonymisation, apply official descriptors or replace faculty standardisation. The teacher remains responsible for assessment.
- PDF exports widen the pages to place notes beside the original rather than cover mathematics. Check the rendered file, continued notes, legibility, anonymity and any upload size/layout restrictions before moderation submission.
- Exported teacher notes use PDF standard fonts and normalise some mathematical/Greek symbols to ASCII. Check custom maths text carefully. Original student PDF content is preserved.
- PDFs with rotation, password protection, unusual page boxes or extensive scanning need additional testing. Do not assume exported annotation positions are correct on those files without checking.
- This comment bank is an **original, paraphrased set of teacher-facing observations**, not a copy of the IB achievement descriptors. It draws from the supplied 21-page *IA examiner feedback actionable checklist* (2021-2026), especially criterion comments (pp. 4-12) and assessment/moderation guidance (pp. 18-19).

## Repository map

- `index.html`, `styles.css` - three-column PDF, evidence bank and score workspace
- `app.js` - placement, editing, manual marks, local storage, review and PDF export
- `comments.js` - browser comment library
- `comments.json` - structured authoring library (includes source page and course tags)
- `build_bank.py` - source script for generating comment bank
- `tests/bank.test.mjs` - consistency and coverage checks
- `scripts/build.mjs` - copies version-pinned libraries and source into a deployable static `dist/`
- `.github/workflows/pages.yml` - verify and publish

## Next improvements

1. Test against faculty examples: 20+ stamps on one page, large or scanned/rotated PDFs, cross-page moves, export overflow and reopen projects on multiple browsers.
2. Add on-page graphical highlights (optional), richer Unicode in teacher-note PDF export and bank sharing between colleagues.
3. Add criterion descriptor calibration, moderated mark comparisons and a distinct **first-assessment-2029** framework with its own evidence bank.
