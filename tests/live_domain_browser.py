"""Run a synthetic IA PDF through the actual HTTPS site, without student data."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import fitz
from playwright.sync_api import sync_playwright, expect

BASE='https://marking.mrwalkermaths.com'
with TemporaryDirectory() as directory:
    sample=Path(directory)/'synthetic-maths-ia.pdf'
    doc=fitz.open()
    page=doc.new_page()
    page.insert_text((70,100),'Synthetic Mathematics IA: f(x) = 2x + 3')
    page.insert_text((70,140),'Evaluate the model using a table and graph.')
    doc.new_page().insert_text((70,100),'Conclusion: the results support the mathematical claim.')
    doc.save(sample)
    doc.close()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        context=browser.new_context(accept_downloads=True,viewport={'width':1450,'height':930})
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        bad_requests=[]
        page.on('response',lambda r:bad_requests.append((r.status,r.url)) if r.status>=400 and r.url.startswith(BASE) else None)
        response=page.goto(BASE+'/library.html',wait_until='domcontentloaded',timeout=30000)
        assert response and response.status==200
        page.locator('.ref-comment').first.wait_for(timeout=30000)
        assert page.locator('.ref-comment').count()==294
        page.goto(BASE+'/index.html',wait_until='domcontentloaded',timeout=30000)
        expect(page.locator('#feedbackMode')).to_be_visible()
        page.locator('#feedbackMode').click()
        page.locator('#pdfInput').set_input_files(str(sample))
        expect(page.locator('#pageTotal')).to_have_text('2',timeout=45000)
        page.locator('#commentList [data-comment-id="F002"]').click()
        expect(page.locator('#feedbackStampPriority')).to_be_visible(timeout=15000)
        page.locator('#draftTextEdit').fill('Explain how the investigation addresses the research question.')
        page.locator('#stampLayer').click(position={'x':125,'y':260})
        expect(page.locator('#allPinCount')).to_have_text('1',timeout=20000)
        with page.expect_download(timeout=25000) as saved:
            page.locator('#projectSave').click()
        backup=json.loads(Path(saved.value.path()).read_text())
        assert backup['activeMode']=='feedback'
        assert len(backup['feedbackStamps'])==1
        assert backup['pdfBase64']
        page.locator('#openReview').click()
        expect(page.locator('#downloadFeedbackPdf')).to_be_enabled(timeout=25000)
        with page.expect_download(timeout=40000) as exported:
            page.locator('#downloadFeedbackPdf').click()
        pdf=fitz.open(stream=Path(exported.value.path()).read_bytes(),filetype='pdf')
        assert len(pdf)>=1
        assert pdf[0].get_text().strip()
        pdf.close()
        assert not bad_requests, 'Live static assets returned errors: '+repr(bad_requests)
        assert not errors, 'Browser JavaScript errors: '+repr(errors)
        print('LIVE_BROWSER_RESULT='+json.dumps({
            'site':BASE,'standaloneLibraryComments':294,'pdfUploadedPages':2,
            'feedbackStamps':1,'portableBackupHasOriginalPDF':True,
            'feedbackPdfExportValid':True,'jsErrors':0,'failedAssets':0,'status':'PASS'
        }))
        browser.close()
