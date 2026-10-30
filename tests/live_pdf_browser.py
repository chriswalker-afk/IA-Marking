"""End-to-end test with REAL PDF.js and pdf-lib, not mocked renderers.
Run from the repository root after npm run build:
    python -m pip install playwright pymupdf
    python -m playwright install chromium
    python tests/live_pdf_browser.py
"""
from pathlib import Path
from threading import Thread
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import tempfile

import fitz
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'dist'
assert (ROOT / 'vendor/pdf.mjs').exists(), 'Run npm run build first.'
assert (ROOT / 'vendor/pdf.worker.mjs').exists()

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
base_url = f'http://127.0.0.1:{server.server_port}'
with tempfile.TemporaryDirectory() as folder:
    sample = Path(folder) / 'example-ia.pdf'
    document = fitz.open()
    page = document.new_page()
    page.insert_text((65, 100), 'Example Mathematics IA: y = 2x + 3', fontsize=13)
    page.insert_text((65, 140), 'Calculation: 2 + 2 = 4')
    page = document.new_page()
    page.insert_text((65, 100), 'Conclusion: the model was checked.')
    document.save(sample)
    document.close()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True, viewport={'width': 1450, 'height': 930})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        # Standalone library does not need a PDF, and is fully searchable/copyable.
        page.goto(base_url + '/library.html')
        page.locator('.ref-comment').first.wait_for()
        assert page.locator('.ref-comment').count() == 294
        page.locator('#refSearch').fill('outliers')
        assert page.locator('.ref-comment').count() > 0
        page.locator('#refSearch').fill('')
        page.locator('button[data-action=edit]').first.click()
        page.locator('#referenceEditText').fill('The exploration follows a clear mathematical aim and is logically organised.')
        page.locator('#referenceSaveEdit').click()
        assert 'logically organised' in page.locator('.ref-comment').first.inner_text()

        # Main site initialises with the full official guide reference.
        page.goto(base_url + '/index.html')
        page.locator('#openCriteria').click()
        page.locator('#criteriaDialog[open]').wait_for()
        assert page.locator('.criteria-card').count() == 5
        assert 'ibo.org' in page.locator('#criteriaGuideLink').get_attribute('href')
        page.locator('[data-criteria-score="A"]').select_option('3')
        page.locator('[data-criteria-score="E"]').select_option('5')
        page.locator('[data-criteria-rationale="A"]').fill('Clearly organised investigation.')
        assert page.locator('[data-score="A"]').input_value() == '3'
        page.locator('#criteriaDone').click()

        # Upload a REAL two-page PDF and wait for PDF.js worker to render it.
        page.locator('#pdfInput').set_input_files(str(sample))
        page.wait_for_function("document.querySelector('#pageTotal').textContent === '2'", timeout=30000)
        page.locator('#pdfCanvas').wait_for(state='visible')
        assert page.locator('#documentName').inner_text() == 'example-ia.pdf'
        assert page.locator('#pdfLibraryStatus').is_hidden(), page.locator('#pdfLibraryStatus').inner_text()

        # Place a stamp, then export using real pdf-lib and parse the exported PDF.
        page.locator('#commentList [data-comment-id]').first.click()
        page.locator('#stampLayer').click(position={'x': 120, 'y': 160})
        assert page.locator('#allPinCount').inner_text() == '1'
        page.locator('#openReview').click()
        with page.expect_download(timeout=35000) as download_info:
            page.locator('#exportAnnotated').click()
        saved = download_info.value.path()
        exported = fitz.open(saved)
        assert len(exported) >= 3, f'Expected two source pages plus marking summary, got {len(exported)}.'
        assert 'ASSESSMENT EVIDENCE' in exported[0].get_text().upper()
        assert 'MARKING' in exported[-1].get_text().upper() or 'ASSESSMENT' in exported[-1].get_text().upper()
        exported.close()
        page.locator('#closeReview').click()

        assert errors == [], f'Browser JS errors: {errors}'
        context.close()

        # Degraded mode: missing PDF viewer should display a useful error but
        # still allow browsing all comments and applying criterion marks.
        broken = browser.new_context()
        broken_page = broken.new_page()
        broken_page.route('**/vendor/pdf.mjs', lambda route: route.abort())
        broken_page.goto(base_url + '/index.html')
        broken_page.locator('#openLibrary').click()
        broken_page.locator('#libraryDialog[open]').wait_for()
        assert broken_page.locator('.library-entry').count() == 294
        broken_page.locator('#closeLibrary').click()
        broken_page.locator('#openCriteria').click()
        assert broken_page.locator('.criteria-card').count() == 5
        broken_page.locator('#criteriaDone').click()
        broken_page.locator('#pdfInput').set_input_files(str(sample))
        broken_page.locator('#pdfLibraryStatus:not(.hidden)').wait_for(timeout=10000)
        assert 'missing' in broken_page.locator('#pdfLibraryStatus').inner_text().lower()
        broken.close()
        browser.close()
server.shutdown()
print('Real PDF upload/render/stamp/export, criteria marks, independent library and missing-vendor recovery: PASS')
