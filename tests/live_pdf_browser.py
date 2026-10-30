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
import zipfile

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

        # Pass 8: the evidence navigator must remain usable on an iPhone.
        expect(page.locator('#undoMark')).to_be_disabled()  # history is reset when project is reopened
        page.locator('#openEvidence').click()
        expect(page.locator('#evidenceDialog[open]')).to_be_visible()
        assert page.locator('#evidenceResults .evidence-result').count()==2
        assert revised_text in page.locator('#evidenceResults').inner_text()
        dialog=page.locator('#evidenceDialog').bounding_box()
        assert dialog and dialog['width']>=429 and dialog['height']>=849
        page.screenshot(path=str(ROOT/'qa-pass8-mobile-evidence.png'))
        page.locator('#evidenceResults [data-evidence-pin]').first.click()
        expect(page.locator('#evidenceDialog')).not_to_be_visible()
        assert revised_text in page.locator('#stampTextEdit').input_value()

        # Favourites persist outside the PDF project and can be chosen while
        # viewing the actual PDF. Recently used is based on placed stamps.
        page.set_viewport_size({'width':1450,'height':930})
        favourite=page.locator('#commentList [data-favourite-comment]').first.get_attribute('data-favourite-comment')
        page.locator('#commentList [data-favourite-comment]').first.click()
        page.locator('[data-bank-quick="favorites"]').click()
        expect(page.locator('#commentList [data-comment-id]')).to_have_count(1)
        assert page.locator('#commentList [data-comment-id]').first.get_attribute('data-comment-id')==favourite
        assert page.locator('#quickStampPicker option[value="'+favourite+'"]').count()>0
        page.locator('#nextPage').click()
        expect(page.locator('#pageNumber')).to_have_value('2')
        page.locator('#quickStampPicker').select_option(favourite)
        expect(page.locator('#draftTextEdit')).to_be_visible()

        # Repeat mode retains the customised wording and format for each
        # additional placement, while every action is reversible.
        page.locator('#draftTextEdit').fill('Evidence of appropriate mathematical notation in the conclusion.')
        page.locator('#repeatStamp').click()
        expect(page.locator('#repeatStamp')).to_have_attribute('aria-pressed','true')
        page.locator('#stampLayer').click(position={'x':130,'y':230})
        expect(page.locator('#allPinCount')).to_have_text('3')
        expect(page.locator('#draftTextEdit')).to_be_visible()
        page.locator('#stampLayer').click(position={'x':360,'y':450})
        expect(page.locator('#allPinCount')).to_have_text('4')
        expect(page.locator('#undoMark')).to_be_enabled()
        page.locator('#undoMark').click()
        expect(page.locator('#allPinCount')).to_have_text('3')
        page.locator('#redoMark').click()
        expect(page.locator('#allPinCount')).to_have_text('4')
        page.keyboard.press('Control+z')
        expect(page.locator('#allPinCount')).to_have_text('3')
        page.keyboard.press('Control+Shift+z')
        expect(page.locator('#allPinCount')).to_have_text('4')

        # Recent comments and a duplicate can be prepared without searching.
        page.locator('[data-bank-quick="recent"]').click()
        assert page.locator('#commentList [data-comment-id="'+favourite+'"]').count()==1
        page.locator('#repeatStamp').click()
        expect(page.locator('#repeatStamp')).to_have_attribute('aria-pressed','false')
        page.locator('.onpage-stamp').last.click()
        page.locator('#duplicateStamp').click()
        expect(page.locator('#draftTextEdit')).to_have_value('Evidence of appropriate mathematical notation in the conclusion.')
        page.locator('#cancelPlacement').click()

        # A–E navigator covers both pages and jumps directly to the selected
        # annotation, where the complete text can be edited.
        page.locator('#openEvidence').click()
        expect(page.locator('#evidenceResults .evidence-result')).to_have_count(4)
        page.locator('#evidenceResults [data-evidence-pin]').first.click()
        expect(page.locator('#pageNumber')).to_have_value('1')
        expect(page.locator('#stampTextEdit')).to_be_visible()
        assert revised_text in page.locator('#stampTextEdit').input_value()
        page.locator('#openEvidence').click()
        page.locator('#evidenceResults [data-evidence-pin]').last.click()
        expect(page.locator('#pageNumber')).to_have_value('2')

        # Delete -> Undo restores original comment. Text editing is grouped into
        # one undo step rather than a separate step per character typed.
        page.locator('.onpage-stamp').last.click()
        old_text=page.locator('#stampTextEdit').input_value()
        page.locator('#stampTextEdit').fill('Temporarily revised moderator evidence.')
        page.locator('#stampTextEdit').evaluate('(el)=>el.blur()')
        expect(page.locator('#undoMark')).to_be_enabled()
        page.locator('#undoMark').click()
        page.locator('.onpage-stamp').last.click()
        assert page.locator('#stampTextEdit').input_value()==old_text
        page.locator('#deleteStamp').click()
        expect(page.locator('#allPinCount')).to_have_text('3')
        page.locator('#undoMark').click()
        expect(page.locator('#allPinCount')).to_have_text('4')

        # Dragging and resizing existing comments each create a single, fully
        # reversible history step on the real PDF canvas.
        marker=page.locator('.onpage-stamp').first
        marker.scroll_into_view_if_needed()
        initial_bounds=marker.bounding_box()
        pdf_area=page.locator('#pdfCanvas').bounding_box()
        # Move inwards rather than insisting on dragging past the PDF edge.
        dx=(-32 if initial_bounds['x']+initial_bounds['width']/2 >
                 pdf_area['x']+pdf_area['width']/2 else 32)
        dy=(-33 if initial_bounds['y']+initial_bounds['height']/2 >
                 pdf_area['y']+pdf_area['height']/2 else 33)
        start_x=initial_bounds['x']+55
        start_y=initial_bounds['y']+12
        assert page.evaluate(
            "(point)=>Boolean(document.elementFromPoint(point.x,point.y)?.closest('.onpage-stamp'))",
            {'x':start_x,'y':start_y}), 'Drag target must be visible inside the PDF viewport.'
        page.mouse.move(start_x,start_y)
        page.mouse.down()
        page.mouse.move(start_x+dx,start_y+dy,steps=6)
        page.mouse.up()
        moved_bounds=page.locator('.onpage-stamp').first.bounding_box()
        assert abs(moved_bounds['x']-initial_bounds['x'])>8 and abs(moved_bounds['y']-initial_bounds['y'])>8, (
            f'Stamp did not move inside the PDF: before={initial_bounds}, after={moved_bounds}, drag=({dx},{dy})')
        page.locator('#undoMark').click()
        returned_bounds=page.locator('.onpage-stamp').first.bounding_box()
        assert abs(returned_bounds['x']-initial_bounds['x'])<3 and abs(returned_bounds['y']-initial_bounds['y'])<3
        page.locator('#redoMark').click()
        marker=page.locator('.onpage-stamp').first
        marker.scroll_into_view_if_needed()
        resized_from=marker.bounding_box()
        grip=marker.locator('.note-resize-handle').bounding_box()
        page.mouse.move(grip['x']+grip['width']/2,grip['y']+grip['height']/2)
        page.mouse.down()
        page.mouse.move(grip['x']+grip['width']/2+26,grip['y']+grip['height']/2+33,steps=5)
        page.mouse.up()
        resized_to=page.locator('.onpage-stamp').first.bounding_box()
        assert resized_to['width']>resized_from['width']+8
        page.locator('#undoMark').click()
        undone_resize=page.locator('.onpage-stamp').first.bounding_box()
        assert abs(undone_resize['width']-resized_from['width'])<3

        # No previously approved export is reused after these modifications.
        page.locator('#openReview').click()
        expect(page.locator('#exportAnnotated')).to_be_disabled()
        page.locator('#closeReview').click()
        page.screenshot(path=str(ROOT/'qa-pass8-desktop-quick-tools.png'),full_page=True)

        # Pass 9: the project vault preserves multiple original PDFs without
        # loading them into the dashboard, and each IA retains its own marks.
        page.locator('#candidate').fill('IA-SECOND')
        expect(page.locator('#localSaveState')).to_have_text('Saved on this device',timeout=25000)
        page.locator('#openProjects').click()
        expect(page.locator('#projectsDialog[open]')).to_be_visible()
        expect(page.locator('#projectsRows .project-card')).to_have_count(2,timeout=15000)
        assert 'IA-SECOND' in page.locator('#projectsRows').inner_text()
        assert '4 evidence stamps' in page.locator('#projectsRows').inner_text()
        assert page.locator('#projectsStats').inner_text().count('Local projects')==1
        expect(page.locator('#projectCountBadge')).to_have_text('2')

        # Full-height mobile project manager must leave substantial space for
        # scrolling the list and showing backup/delete controls.
        page.set_viewport_size({'width':390,'height':844})
        mobile_dialog=page.locator('#projectsDialog').bounding_box()
        content=page.locator('#projectsRows').bounding_box()
        assert mobile_dialog and mobile_dialog['width']>=389 and mobile_dialog['height']>=840
        assert content and content['height']>=220, f'Project list is hidden by fixed headers: {content}'
        assert page.locator('#projectsDialog').evaluate(
            '(el)=>el.scrollWidth <= el.clientWidth+2'), 'Project dashboard has horizontal overflow'
        page.screenshot(path=str(ROOT/'qa-pass9-mobile-projects.png'))
        page.set_viewport_size({'width':1450,'height':930})

        # A portable backup from an individual row includes the original IA.
        with page.expect_download(timeout=20000) as single_download:
            page.locator('#projectsRows .project-card.is-current [data-local-backup]').click()
        individual=json.loads(Path(single_download.value.path()).read_text())
        assert individual['candidate']=='IA-SECOND'
        assert len(individual['stamps'])==4
        assert individual['pdfBase64'] and individual['format']=='ia-marking-desk'

        # Switch to the OTHER IA. It had only the original two annotations.
        prior=page.locator('#projectsRows .project-card:not(.is-current)').first
        prior_id=prior.get_attribute('data-project-card')
        prior.locator('[data-local-open]').click()
        expect(page.locator('#projectsDialog')).not_to_be_visible(timeout=20000)
        expect(page.locator('#allPinCount')).to_have_text('2',timeout=15000)
        expect(page.locator('#undoMark')).to_be_disabled()
        # Switch back and verify marks, all four comments and anonymous ID.
        page.locator('#openProjects').click()
        page.locator('#projectsSearch').fill('IA-SECOND')
        expect(page.locator('#projectsRows .project-card')).to_have_count(1)
        page.locator('#projectsRows [data-local-open]').click()
        expect(page.locator('#allPinCount')).to_have_text('4',timeout=15000)
        expect(page.locator('#candidate')).to_have_value('IA-SECOND')
        expect(page.locator('[data-score="A"]')).to_have_value('3')
        page.locator('[data-score="B"]').select_option('1')
        expect(page.locator('#localSaveState')).to_have_text('Saved on this device',timeout=25000)

        # Create a truly new third IA. It must NEVER inherit other students'
        # candidate IDs, marks, evidence, or original PDFs.
        page.locator('#newProject').click()
        expect(page.locator('#emptyViewer')).to_be_visible(timeout=25000)
        page.locator('#pdfInput').set_input_files(str(sample))
        expect(page.locator('#pageTotal')).to_have_text('2',timeout=30000)
        expect(page.locator('#candidate')).to_have_value('')
        expect(page.locator('#allPinCount')).to_have_text('0')
        expect(page.locator('[data-score="A"]')).to_have_value('')
        expect(page.locator('[data-score="E"]')).to_have_value('')
        page.locator('#candidate').fill('IA-THIRD')
        page.locator('[data-score="A"]').select_option('0')
        expect(page.locator('#localSaveState')).to_have_text('Saved on this device',timeout=25000)
        page.locator('#openProjects').click()
        expect(page.locator('#projectsRows .project-card')).to_have_count(1)
        # Previous search remains in effect: clear it to see the full cohort.
        page.locator('#projectsSearch').fill('')
        expect(page.locator('#projectsRows .project-card')).to_have_count(3)
        page.locator('#projectsCourse').select_option('AA SL')
        expect(page.locator('#projectsRows .project-card')).to_have_count(3)

        # One click generates a complete local ZIP containing the portable
        # project files; no PDF uploads to any remote server.
        with page.expect_download(timeout=50000) as cohort_download:
            page.locator('#downloadAllProjects').click()
        zip_path=Path(cohort_download.value.path())
        with zipfile.ZipFile(zip_path) as archive:
            project_names=[name for name in archive.namelist() if name.endswith('.iamark.json')]
            assert len(project_names)==3, project_names
            backed_up=[json.loads(archive.read(name)) for name in project_names]
            assert any(x['candidate']=='IA-THIRD' and x['marks']['A']==0 for x in backed_up)
            assert any(x['candidate']=='IA-SECOND' and len(x['stamps'])==4 for x in backed_up)
            for saved in backed_up:
                assert saved['pdfBase64'] and saved['version']==1
            assert 'BACKUP-INSTRUCTIONS.txt' in archive.namelist()
        (ROOT/'qa-pass9-cohort-backup-check.txt').write_text(
            'ZIP validated: 3 complete portable .iamark.json IAs and privacy instructions.\\n'
        )

        # Removing one IA does not erase any of the other projects.
        page.once('dialog',lambda dialog:dialog.accept())
        page.locator('#projectsRows .project-card.is-current [data-local-delete]').click()
        expect(page.locator('#projectCountBadge')).to_have_text('2',timeout=15000)
        expect(page.locator('#emptyViewer')).to_be_visible()
        expect(page.locator('#projectsRows .project-card')).to_have_count(2)

        # A destructive cohort-wide clear is impossible until the teacher
        # types the exact confirmation phrase. Personal comment settings
        # are cleared only if the separate checkbox is ticked.
        page.locator('#openClearProjects').click()
        expect(page.locator('#clearProjectsDialog[open]')).to_be_visible()
        expect(page.locator('#confirmClearProjects')).to_be_disabled()
        page.locator('#clearProjectsPhrase').fill('delete all')
        expect(page.locator('#confirmClearProjects')).to_be_disabled()
        page.locator('#clearTeacherPreferences').check()
        page.locator('#clearProjectsPhrase').fill('DELETE ALL')
        expect(page.locator('#confirmClearProjects')).to_be_enabled()
        page.locator('#confirmClearProjects').click()
        expect(page.locator('#clearProjectsDialog')).not_to_be_visible(timeout=20000)
        expect(page.locator('#projectCountBadge')).to_have_text('0')
        assert page.evaluate(
            "localStorage.getItem('ia-marking-desk-quick-picks-v1')") is None
        page.locator('#openProjects').click()
        expect(page.locator('#projectsRows .project-card')).to_have_count(0)
        page.locator('#projectsDone').click()

        # Backups are portable: restore an IA from the downloaded ZIP, then
        # reopen it from IndexedDB even after a page reload.
        recovery=next(x for x in backed_up if x['candidate']=='IA-SECOND')
        page.locator('#projectOpen').set_input_files({
            'name':'restored.iamark.json','mimeType':'application/json',
            'buffer':json.dumps(recovery).encode(),
        })
        expect(page.locator('#allPinCount')).to_have_text('4',timeout=20000)
        expect(page.locator('#candidate')).to_have_value('IA-SECOND')
        expect(page.locator('#projectCountBadge')).to_have_text('1',timeout=25000)
        page.reload()
        expect(page.locator('#resumeLast')).to_be_visible(timeout=20000)
        page.locator('#resumeLast').click()
        expect(page.locator('#allPinCount')).to_have_text('4',timeout=20000)
        expect(page.locator('#candidate')).to_have_value('IA-SECOND')

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
