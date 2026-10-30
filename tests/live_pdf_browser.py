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
import json

import fitz
from playwright.sync_api import sync_playwright, expect

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

        # All five criterion rubrics, including every mark from zero upwards,
        # must be readable in an actual phone-sized FULL-HEIGHT dialog.
        page.goto(base_url + '/index.html')
        page.locator('#openCriteria').click()
        page.locator('#criteriaDialog[open]').wait_for()
        assert page.locator('.criteria-card').count() == 5
        assert page.locator('.criteria-level').count() == 25
        assert page.locator('#criteriaCard_A .criteria-level').count() == 5
        assert page.locator('#criteriaCard_E .criteria-level').count() == 7
        assert 'ibo.org' in page.locator('#criteriaGuideLink').get_attribute('href')
        assert 'SL descriptor set' in page.locator('#criteriaCard_E').inner_text()

        page.set_viewport_size({'width':390, 'height':844})
        dialog_bounds=page.locator('#criteriaDialog').bounding_box()
        body_bounds=page.locator('#criteriaScrollArea').bounding_box()
        assert dialog_bounds and body_bounds
        assert dialog_bounds['x'] <= 1 and dialog_bounds['y'] <= 1
        assert dialog_bounds['width'] >= 389
        assert dialog_bounds['height'] >= 840, f'Mobile modal too short: {dialog_bounds}'
        assert body_bounds['height'] >= 350, f'Rubric content is hidden behind header/footer: {body_bounds}'
        assert page.locator('#criteriaDialog').evaluate(
            '(el) => el.scrollWidth <= el.clientWidth + 2'), 'Rubric window has horizontal overflow'
        page.screenshot(path=str(ROOT/'qa-full-rubric-mobile.png'))

        # Every criterion remains reachable from the jump bar, and tapping a
        # level changes the underlying award without clearing the rationale.
        page.locator('[data-criteria-jump="E"]').click()
        expect(page.locator('#criteriaCard_E')).to_be_in_viewport(ratio=.20,timeout=10000)
        page.locator('[data-rubric-key="E"][data-rubric-score="6"]').click()
        expect(page.locator('[data-score="E"]')).to_have_value('6')
        expect(page.locator('[data-rubric-key="E"][data-rubric-score="6"]')).to_have_attribute('aria-pressed','true')
        expect(page.locator('[data-jump-mark="E"]')).to_have_text('6 / 6')
        page.locator('[data-criteria-jump="A"]').click()
        expect(page.locator('#criteriaCard_A')).to_be_in_viewport(ratio=.20,timeout=10000)
        page.locator('[data-criteria-rationale="A"]').fill('Clearly organised investigation.')
        page.locator('[data-rubric-key="A"][data-rubric-score="3"]').click()
        expect(page.locator('[data-score="A"]')).to_have_value('3')
        assert page.locator('[data-criteria-rationale="A"]').input_value()=='Clearly organised investigation.'
        expect(page.locator('#criteriaProgress')).to_have_text('2 of 5 criteria marked')
        page.locator('[data-criteria-score="E"]').select_option('5')
        expect(page.locator('[data-jump-mark="E"]')).to_have_text('5 / 6')

        # Official verbatim descriptors remain available from the IB guide and
        # from an authorised guide PDF viewed directly in the same modal.
        page.locator('#criteriaOpenGuide').click()
        expect(page.locator('#criteriaOfficialGuideDetails')).to_have_attribute('open','')
        page.locator('#criteriaGuideInput').set_input_files(str(sample))
        expect(page.locator('#criteriaGuidePreview')).to_be_visible()
        assert page.locator('#criteriaGuideFrame').get_attribute('src').startswith('blob:')
        page.locator('#removeCriteriaGuide').click()
        expect(page.locator('#criteriaGuidePreview')).to_be_hidden()
        page.locator('#criteriaDone').click()

        # Criterion E must change to the HL bands when the course changes.
        page.set_viewport_size({'width':1450,'height':930})
        page.locator('#course').select_option('AA HL')
        page.locator('#openCriteria').click()
        assert 'HL descriptor set' in page.locator('#criteriaCard_E').inner_text()
        assert 'sophistication AND rigour' in page.locator('#criteriaCard_E .criteria-level').last.inner_text()
        expect(page.locator('#criteriaCoursePill')).to_have_text('AA HL')
        page.locator('#criteriaDone').click()
        page.locator('#course').select_option('AA SL')
        assert page.locator('[data-score="A"]').input_value() == '3'
        assert page.locator('[data-score="E"]').input_value() == '5'

        # Upload a REAL two-page PDF and wait for PDF.js worker to render it.
        page.locator('#pdfInput').set_input_files(str(sample))
        expect(page.locator('#pageTotal')).to_have_text('2', timeout=30000)
        page.locator('#pdfCanvas').wait_for(state='visible')
        assert page.locator('#documentName').inner_text() == 'example-ia.pdf'
        assert page.locator('[data-score="A"]').input_value() == '3', 'First PDF upload must preserve previously entered marks.'
        assert page.locator('[data-score="E"]').input_value() == '5'
        assert page.locator('#pdfLibraryStatus').is_hidden(), page.locator('#pdfLibraryStatus').inner_text()

        # Real on-page annotations: the complete text and its A-E circle are
        # inside the original student-page rectangle, not in a separate rail.
        first_text=('The analysis uses residuals to check the accuracy of the fitted model. '
                    'The interpretation relates the findings to the aim and explains '
                    'why an unexpected result is mathematically meaningful.')
        second_text=('The numerical limitation of the model is evaluated and its '
                     'consequences are explained in the conclusion. The notation '
                     'π ≤ √16, σ², ∑, ∫ and x² remains mathematical in the export.')
        page.locator('#commentList [data-comment-id]').first.click()
        page.locator('#draftTextEdit').fill(first_text)
        page.locator('#stampLayer').click(position={'x': 120, 'y': 280})
        expect(page.locator('.onpage-stamp')).to_have_count(1)
        assert page.locator('#allPinCount').inner_text()=='1'
        assert page.locator('#pageNotes').count()==0
        assert ' '.join(page.locator('.onpage-stamp').inner_text().split()).endswith(first_text)
        first_box=page.locator('.onpage-stamp').first.bounding_box()
        pdf_box=page.locator('#pdfCanvas').bounding_box()
        circle=page.locator('.onpage-circle').first.bounding_box()
        note_text=page.locator('.onpage-note-body').first.bounding_box()
        assert first_box and pdf_box and circle and note_text
        assert first_box['x'] >= pdf_box['x'] and first_box['x'] + first_box['width'] <= pdf_box['x'] + pdf_box['width'] + 2
        assert circle['x']+circle['width'] <= note_text['x'], 'Full comment text must sit beside its coloured A-E circle'

        # Individual comment formatting is separate from the A-E circle style.
        # A true range input can be operated by keyboard without bypassing CSP.
        font_slider=page.locator('#selectedStampFont')
        font_slider.focus()
        font_slider.press('Home')
        for _ in range(12):
            font_slider.press('ArrowRight')
        expect(font_slider).to_have_value('13')
        for control, colour in [
            ('selectedStampTextColor','#b72a29'),
            ('selectedStampFillColor','#f5e49a'),
            ('selectedStampBorderColor','#2d9b5b'),
        ]:
            # Playwright evaluates a direct element callback without injecting
            # an eval-based poll blocked by this site's strict CSP.
            page.locator('#'+control).evaluate(
                "(el,colour) => { el.value=colour; el.dispatchEvent(new Event('input',{bubbles:true})); }",
                colour)
            expect(page.locator('#'+control)).to_have_value(colour)

        ink=page.locator('.onpage-note-body').first
        expect(ink).to_have_css('color','rgb(183, 42, 41)')
        expect(page.locator('.onpage-stamp').first).to_have_css('background-color','rgb(245, 228, 154)')
        expect(page.locator('.onpage-stamp').first).to_have_css('border-color','rgb(45, 155, 91)')
        assert page.locator('.onpage-note-header').first.evaluate(
            '(el)=>getComputedStyle(el).color') == 'rgb(183, 42, 41)', 'The header must use the chosen text colour too.'

        # Resize the whole box with the lower-right handle, not by scaling the
        # font or cropping the comment. Both physical dimensions must change.
        original_box=page.locator('.onpage-stamp').first.bounding_box()
        handle=page.locator('.note-resize-handle').first.bounding_box()
        hx=handle['x']+handle['width']/2
        hy=handle['y']+handle['height']/2
        page.mouse.move(hx,hy)
        page.mouse.down()
        page.mouse.move(hx+42,hy+48,steps=6)
        page.mouse.up()
        resized_box=page.locator('.onpage-stamp').first.bounding_box()
        assert resized_box['width'] > original_box['width']+8, 'Corner drag did not resize the box width.'
        assert resized_box['height'] > original_box['height']+8, 'Corner drag did not resize the box height.'
        assert 'Auto' not in page.locator('#selectedStampHeightValue').inner_text()

        # A teacher cannot export a short box which clips the selected font.
        page.locator('#selectedStampHeight').evaluate(
            "(el) => { el.value='55'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
        expect(page.locator('#annotationNotice')).to_be_visible()
        page.locator('#selectedStampHeightAuto').click()
        assert 'Auto' in page.locator('#selectedStampHeightValue').inner_text()
        expect(page.locator('#annotationNotice')).to_be_hidden()

        page.locator('#commentList [data-comment-id]').nth(1).click()
        page.locator('#draftTextEdit').fill(second_text)
        page.locator('#stampLayer').click(position={'x': 350, 'y': 500})
        expect(page.locator('.onpage-stamp')).to_have_count(2)
        box1=page.locator('.onpage-stamp').nth(0).bounding_box()
        box2=page.locator('.onpage-stamp').nth(1).bounding_box()
        assert not (box1['x'] < box2['x'] + box2['width'] and box1['x'] + box1['width'] > box2['x'] and box1['y'] < box2['y'] + box2['height'] and box1['y'] + box1['height'] > box2['y']), 'On-page comments overlap'
        assert page.locator('#annotationNotice').is_hidden(), 'No notes should overflow after initial placement.'

        # Editing a placed stamp changes the printed note and persists.
        page.locator('.onpage-stamp').first.click()
        revised_text=first_text+' The mathematical evidence supports the awarded mark.'
        page.locator('#stampTextEdit').fill(revised_text)
        assert revised_text in ' '.join(page.locator('.onpage-stamp').first.inner_text().split())
        assert revised_text in page.locator('#stampsList .stamp-row').first.inner_text()
        page.screenshot(path=str(ROOT/'qa-inline-moderator-page.png'),full_page=True)

        # Export a REAL PDF and inspect both the retained original page geometry
        # and whether the FULL comment is physically within that page.
        page.locator('#openReview').click()
        assert page.locator('#exportAnnotated').is_disabled(), 'Final export must require a reviewed PDF.'
        page.locator('#buildReviewPreview').click()
        page.locator('#reviewPreviewBox:not(.hidden)').wait_for(timeout=45000)
        expect(page.locator('#reviewPreviewPage')).to_have_text('Page 1 / 3',timeout=30000)
        assert page.locator('#reviewConfirmed').is_disabled()
        assert page.locator('#reviewPreviewCanvas').get_attribute('width') != '0'
        fit_width=page.locator('#reviewPreviewCanvas').bounding_box()['width']
        page.locator('#reviewPreviewZoomIn').click()
        expect(page.locator('#reviewPreviewZoomLabel')).to_have_text('150%',timeout=20000)
        zoomed_width=page.locator('#reviewPreviewCanvas').bounding_box()['width']
        assert zoomed_width > fit_width*1.3, 'PDF zoom did not enlarge text for moderator inspection.'
        page.locator('#reviewPreviewZoomOut').click()
        expect(page.locator('#reviewPreviewZoomLabel')).to_have_text('Fit',timeout=20000)
        page.screenshot(path=str(ROOT/'qa-exact-pdf-preview.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(ROOT/'qa-moderation-mobile.png'))
        page.set_viewport_size({'width':1450,'height':930})
        # Teacher must inspect the actual original pages AND marking summary.
        for number in [2,3]:
            page.locator('#reviewPreviewNext').click()
            expect(page.locator('#reviewPreviewPage')).to_have_text(f'Page {number} / 3',timeout=20000)
        assert page.locator('#reviewConfirmed').is_enabled()
        page.locator('#reviewConfirmed').check()
        expect(page.locator('#exportAnnotated')).to_be_enabled()
        # Changing a criterion rationale invalidates the previous exact-PDF
        # approval and requires reinspection of the newly generated export.
        page.locator('[data-review-justification="A"]').fill('Reviewed: coherent and organised mathematical exploration.')
        expect(page.locator('#exportAnnotated')).to_be_disabled()
        expect(page.locator('#reviewConfirmed')).not_to_be_checked()
        page.locator('#buildReviewPreview').click()
        page.locator('#reviewPreviewBox:not(.hidden)').wait_for(timeout=45000)
        expect(page.locator('#reviewPreviewPage')).to_have_text('Page 1 / 3',timeout=30000)
        for number in [2,3]:
            page.locator('#reviewPreviewNext').click()
            expect(page.locator('#reviewPreviewPage')).to_have_text(f'Page {number} / 3',timeout=20000)
        page.locator('#reviewConfirmed').check()
        expect(page.locator('#exportAnnotated')).to_be_enabled()
        with page.expect_download(timeout=35000) as download_info:
            page.locator('#exportAnnotated').click()
        saved_reviewed_pdf=Path(download_info.value.path()).read_bytes()
        (ROOT/'qa-reviewed-moderator-export.pdf').write_bytes(saved_reviewed_pdf)
        exported=fitz.open(stream=saved_reviewed_pdf,filetype='pdf')
        assert len(exported)==3, 'Only the original two pages plus marking-summary page are expected.'
        assert abs(exported[0].rect.width-595)<1 and abs(exported[0].rect.height-842)<1, 'IA pages must retain their original physical dimensions.'
        pdf_text=' '.join(exported[0].get_text().split())
        assert revised_text in pdf_text, 'Complete updated teacher comment missing from original page.'
        assert 'The numerical limitation of the model' in pdf_text, 'Second comment missing from original page.'
        for symbol in ['π','≤','√','σ','²','∑','∫']:
            assert symbol in pdf_text, f'Mathematical symbol {symbol} missing or replaced in the exported PDF.'
        assert '?' not in pdf_text, 'Unsupported characters should never silently become question marks.'
        assert 'Example Mathematics IA' in pdf_text, 'Student source page must remain intact.'
        assert 'A1' in pdf_text and 'A2' in pdf_text, 'Criterion labels must print beside comments.'
        # PDF text and graphical fills are examined from the actual exported
        # file, not merely from browser CSS. This is what IB moderators receive.
        spans=[span for block in exported[0].get_text('dict')['blocks']
               for line in block.get('lines',[]) for span in line.get('spans',[])]
        assert any('analysis' in span['text'].lower() and abs(span['size']-13)<0.2
                   and span['color']==int('b72a29',16) for span in spans), 'The saved PDF ignored the full-comment font or text colour.'
        fills=[drawing['fill'] for drawing in exported[0].get_drawings() if drawing.get('fill')]
        target_fill=(245/255,228/255,154/255)
        assert any(all(abs(actual-wanted)<0.02 for actual,wanted in zip(fill,target_fill)) for fill in fills), 'Comment background colour missing in PDF.'
        for keyword in ['residuals','mathematically','limitation','consequences']:
            words=[x for x in exported[0].get_text('words') if keyword.lower() in x[4].lower()]
            assert words and all(0<=x[0] and 0<=x[1] and x[2]<=595 and x[3]<=842 for x in words), f'Comment {keyword} is clipped or outside the actual page.'
        exported[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(ROOT/'qa-inline-export.pdf-page.png')
        exported.close()
        page.locator('#closeReview').click()

        # An editable project save/reopen must restore the full visible
        # comments and their PDF positions, not merely the letters.
        with page.expect_download(timeout=10000) as project_download:
            page.locator('#projectSave').click()
        portable_path=project_download.value.path()
        portable=json.loads(Path(portable_path).read_text())
        assert len(portable['stamps'])==2
        assert revised_text in [stamp['text'] for stamp in portable['stamps']]
        assert all('x' in stamp and 'y' in stamp and 'noteWidth' in stamp for stamp in portable['stamps'])
        styled=portable['stamps'][0]
        assert styled['fontSize']==13
        assert styled['textColor']=='#b72a29'
        assert styled['fillColor']=='#f5e49a'
        assert styled['borderColor']=='#2d9b5b'
        assert styled['noteWidth']>250
        assert styled['noteHeight'] is None, 'Fit-to-text preference was lost.'
        page.once('dialog',lambda dialog:dialog.accept())
        page.locator('#newProject').click()
        page.locator('#projectOpen').set_input_files({'name':'saved.iamark.json','mimeType':'application/json','buffer':json.dumps(portable).encode()})
        expect(page.locator('.onpage-stamp')).to_have_count(2,timeout=15000)
        assert revised_text in ' '.join(page.locator('.onpage-stamp').first.inner_text().split())
        page.locator('.onpage-stamp').first.click()
        expect(page.locator('#selectedStampFont')).to_have_value('13')
        expect(page.locator('#selectedStampTextColor')).to_have_value('#b72a29')
        expect(page.locator('#selectedStampFillColor')).to_have_value('#f5e49a')
        expect(page.locator('#selectedStampBorderColor')).to_have_value('#2d9b5b')

        # On a narrower display the same complete notes remain inside the PDF
        # page instead of being moved beneath it or to an external margin.
        page.set_viewport_size({'width': 430, 'height': 850})
        expect(page.locator('.onpage-stamp')).to_have_count(2)
        assert ' '.join(page.locator('.onpage-stamp').first.inner_text().split()).endswith(revised_text)
        mobile_page=page.locator('#pdfCanvas').bounding_box()
        mobile_note=page.locator('.onpage-stamp').first.bounding_box()
        assert mobile_page and mobile_note
        assert mobile_note['x']>=mobile_page['x']-1 and mobile_note['x']+mobile_note['width']<=mobile_page['x']+mobile_page['width']+2
        page.screenshot(path=str(ROOT/'qa-inline-mobile.png'),full_page=True)

        assert errors==[], f'Browser JS errors: {errors}'
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
