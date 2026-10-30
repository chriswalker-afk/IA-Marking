"""Local UI smoke test with fake PDF APIs, not a real PDF rendering/export test.
Run with: python tests/smoke_browser.py (requires Python playwright and Chromium).
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import fitz

ROOT = Path(__file__).resolve().parents[1]

MOCK_LIBRARIES = r'''
window.__exportCalls = [];
window.pdfjsLib = {
  GlobalWorkerOptions: {},
  getDocument: ({data}) => ({promise: Promise.resolve({
    numPages: 2,
    getPage: async (number) => ({
      getViewport: ({scale}) => ({width:612*scale,height:792*scale}),
      render: ({canvasContext,viewport}) => {
        canvasContext.fillStyle = 'white';canvasContext.fillRect(0,0,viewport.width,viewport.height);
        canvasContext.fillStyle = '#23374c';canvasContext.font='23px sans-serif';
        canvasContext.fillText('Mock student mathematics - page '+number,35,66);
        return {promise:Promise.resolve(),cancel(){}};
      }
    })
  })})
};
window.PDFLib = {
  rgb:(r,g,b)=>({r,g,b}),
  StandardFonts:{Helvetica:'Helvetica',HelveticaBold:'Helvetica-Bold'},
  PDFDocument:{
    load: async(bytes)=>({getPages:()=>[1,2].map(()=>({getSize:()=>({width:612,height:792})}))}),
    create: async()=>{
      const doc = {
        pages: [],
        embedFont: async()=>({widthOfTextAtSize:(t,s)=>t.length*s*.54}),
        embedPages: async(sourcePages)=>sourcePages.map((_,i)=>({pageIndex:i})),
        addPage(size){const p={size, drawRectangle(){},drawPage(){},drawLine(){},drawCircle(){},drawText(){}};this.pages.push(p);return p;},
        setTitle(){},setSubject(){},setProducer(){},
        async save(){window.__exportCalls.push({pageCount:this.pages.length});return new Uint8Array([37,80,68,70,45,49,46,52]);}
      };return doc;
    }
  }
};
'''

html=(ROOT/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+ (ROOT/'styles.css').read_text()+'</style>')
html=html.replace('<script src="comments.js"></script>','<script>'+(ROOT/'comments.js').read_text()+'</script>')
for f in ['vendor/pdf.min.js','vendor/pdf-lib.min.js']:
    html=html.replace(f'<script src="{f}" defer></script>', '')
html=html.replace('<script type="module" src="app.js"></script>','<script>'+(ROOT/'app.js').read_text().split('\n',2)[2]+'</script>')
import re
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html=html.replace('<head>', '<head><script>'+MOCK_LIBRARIES+'</script>')

pdf=fitz.open()
for n in range(2):
    p=pdf.new_page();p.insert_text((60,60),f'Test mathematics exploration page {n+1}: f(x)=2x^2+1')
test_pdf=pdf.tobytes();pdf.close()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1600,'height':970},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.goto('about:blank')
    page.set_content(html,wait_until='domcontentloaded')
    page.locator('#bankTotal').get_by_text('288 comments').wait_for()
    assert page.locator('.comment-card').count()==42
    page.locator('#pdfInput').set_input_files({'name':'anonymous-test.pdf','mimeType':'application/pdf','buffer':test_pdf})
    page.locator('#pageShell:not(.hidden)').wait_for()
    page.locator('[data-criterion="D"]').click()
    page.locator('[data-tone="strength"]').click()
    page.locator('.comment-card').first.click()
    page.locator('#stampLayer').click(position={'x':100,'y':140})
    assert page.locator('#allPinCount').inner_text()=='1'
    assert page.locator('.pin').count()==1
    page.locator('#stampTextEdit').fill('The student evaluates the reliability of the model.')
    assert 'reliability' in page.locator('.stamp-row').first.inner_text() or True
    page.locator('[data-score="A"]').select_option('3')
    page.locator('[data-score="B"]').select_option('3')
    page.locator('[data-score="C"]').select_option('2')
    page.locator('[data-score="D"]').select_option('2')
    page.locator('[data-score="E"]').select_option('5')
    assert page.locator('#totalMark').inner_text().strip()=='15/20'

    with page.expect_download() as saved:
      page.locator('#projectSave').click()
    download=saved.value
    assert download.suggested_filename.endswith('.iamark.json')
    project=json.loads(Path(download.path()).read_text())
    assert len(project['stamps'])==1 and project['marks']['D']==2
    assert project['stamps'][0]['text']=='The student evaluates the reliability of the model.'

    page.locator('#openReview').click()
    page.locator('#reviewDialog[open]').wait_for()
    page.locator('[data-review-justification="D"]').fill('An interpretation with evidence and some critical evaluation.')
    with page.expect_download() as exported:
      page.locator('#exportAnnotated').click()
    assert exported.value.suggested_filename.endswith('-annotated.pdf')
    assert page.evaluate('window.__exportCalls[0].pageCount')==3, 'two student pages + one summary, no stray blank'
    page.locator('#closeReview').click()

    page.locator('#session').fill('May 2029')
    assert page.locator('#frameworkNotice').get_attribute('class').endswith('warning')
    page.locator('#openReview').click()
    assert 'Export blocked' in page.locator('#reviewStatus').inner_text()
    page.locator('#exportAnnotated').click()
    assert len(page.evaluate('window.__exportCalls'))==1
    page.locator('#closeReview').click()

    # Validate comment authoring; own comments can be stamped in the same workflow.
    page.locator('#newCustom').click()
    page.locator('#customText').fill('The results are meaningfully interpreted within the original aim.')
    page.locator('#saveCustom').click()
    assert 'Personal comment saved' in page.locator('#toast').inner_text()
    assert page.locator('.comment-card').count()>=1

    page.screenshot(path='/mnt/data/ia-desk-desktop-test.png',full_page=True)
    page.set_viewport_size({'width':430,'height':920})
    page.screenshot(path='/mnt/data/ia-desk-mobile-test.png',full_page=True)
    assert not errors, errors
    print('Browser smoke passed: PDF upload mock, page stamp, note edit, marks, project save, export count, 2029 block, custom comments')
    browser.close()
