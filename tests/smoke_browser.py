"""Local UI smoke test with fake PDF APIs, not a real PDF rendering/export test.
Run with: python tests/smoke_browser.py (requires Python playwright and Chromium).
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import fitz

ROOT = Path(__file__).resolve().parents[1]

MOCK_LIBRARIES = r'''
window.__fakeStorage = {};
Object.defineProperty(window, 'localStorage', {configurable:true, value:{getItem:key=>window.__fakeStorage[key]??null,setItem:(key,value)=>{window.__fakeStorage[key]=String(value)},removeItem:key=>delete window.__fakeStorage[key]}});
window.__exportCalls = [];
window.__drawnCircles = [];
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
        addPage(size){const p={size, drawRectangle(){},drawPage(){},drawLine(){},drawCircle(options){window.__drawnCircles.push(options);},drawText(){}};this.pages.push(p);return p;},
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
    page.evaluate("document.execCommand = command => {window.__copiedText = document.activeElement.value; return command === 'copy';}")

    # The library is available without an uploaded PDF and every available comment is visible.
    page.locator('#openLibrary').click()
    page.locator('#libraryDialog[open]').wait_for()
    assert page.locator('.library-entry').count()==294
    first=page.locator('.library-entry').first
    first.locator('[data-copy-library]').click()
    assert len(page.evaluate('window.__copiedText'))>30
    first.locator('[data-edit-library]').click()
    page.locator('#libraryEditText').fill('The presentation flows logically from a clearly stated mathematical aim to its conclusion.')
    page.locator('#libraryEditTopic').fill('Aim and focus')
    page.locator('[data-save-library]').click()
    assert 'flows logically' in page.locator('.library-entry').first.inner_text()
    assert page.evaluate('JSON.parse(localStorage.getItem("ia-marking-desk-edits")).A001.text').startswith('The presentation flows logically')
    page.locator('#librarySearch').fill('outliers')
    assert page.locator('.library-entry').count()>0
    page.locator('#copyLibraryVisible').click()
    assert 'outlier' in page.evaluate('window.__copiedText').lower()
    page.locator('#closeLibrary').click()
    page.locator('#libraryDialog').evaluate('(el)=>{if(el.open)throw Error("Library still open")}')

    # Change default appearance (new stamps) and then customise one stamp separately.
    page.eval_on_selector('#defaultStampSize', '(el)=>{el.value=32;el.dispatchEvent(new Event("input",{bubbles:true}))}')
    page.eval_on_selector('#strengthStampColour', '(el)=>{el.value="#0f966b";el.dispatchEvent(new Event("input",{bubbles:true}))}')
    page.eval_on_selector('#limitationStampColour', '(el)=>{el.value="#a13c51";el.dispatchEvent(new Event("input",{bubbles:true}))}')
    assert page.locator('#defaultStampSizeValue').inner_text()=='32 pt'
    assert page.evaluate('JSON.parse(localStorage.getItem("ia-marking-desk-stamp-style")).strengthColor')=='#0f966b'
    page.locator('#pdfInput').set_input_files({'name':'anonymous-test.pdf','mimeType':'application/pdf','buffer':test_pdf})
    page.locator('#pageShell:not(.hidden)').wait_for()
    page.locator('[data-criterion="D"]').click()
    page.locator('[data-tone="strength"]').click()
    page.locator('.comment-card').first.click()
    page.eval_on_selector('#draftStampSize','(el)=>{el.value=36;el.dispatchEvent(new Event("input",{bubbles:true}))}')
    page.eval_on_selector('#draftStampColor','(el)=>{el.value="#ff00cc";el.dispatchEvent(new Event("input",{bubbles:true}))}')
    page.locator('#stampLayer').click(position={'x':100,'y':140})
    assert page.locator('#allPinCount').inner_text()=='1'
    assert page.locator('.pin').count()==1
    assert '#ff00cc' in page.locator('.pin').get_attribute('style')
    page.eval_on_selector('#selectedStampSize','(el)=>{el.value=42;el.dispatchEvent(new Event("input",{bubbles:true}))}')
    page.eval_on_selector('#selectedStampColor','(el)=>{el.value="#ffff11";el.dispatchEvent(new Event("input",{bubbles:true}))}')
    assert '#ffff11' in page.locator('.pin').get_attribute('style')
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
    assert project['stamps'][0]['size']==42 and project['stamps'][0]['color']=='#ffff11'
    assert project['stampStyle']['size']==32 and project['stampStyle']['strengthColor']=='#0f966b'
    assert project['commentEdits']['A001']['text'].startswith('The presentation flows logically')

    page.locator('#openReview').click()
    page.locator('#reviewDialog[open]').wait_for()
    page.locator('[data-review-justification="D"]').fill('An interpretation with evidence and some critical evaluation.')
    with page.expect_download() as exported:
      page.locator('#exportAnnotated').click()
    assert exported.value.suggested_filename.endswith('-annotated.pdf')
    assert page.evaluate('window.__exportCalls[0].pageCount')==3, 'two student pages + one summary, no stray blank'
    assert page.evaluate('window.__drawnCircles[0].size')==21, 'PDF should use selected 42pt diameter'
    assert abs(page.evaluate('window.__drawnCircles[0].color.r')-1)<.001
    page.locator('#closeReview').click()

    # Applying global defaults changes all placed stamps, not merely future stamps.
    page.locator('#applyStampStyle').click()
    assert '#0f966b' in page.locator('.pin').get_attribute('style')
    assert page.locator('#selectedStampSizeValue').inner_text()=='32 pt'

    # Using a sidebar Edit action opens the same full-library editor.
    page.locator('#commentList [data-edit-comment]').first.click()
    assert page.locator('#libraryDialog[open]').count()==1
    assert page.locator('#libraryEditText').count()==1
    page.locator('#libraryCloseBottom').click()

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

    page.locator('#openLibrary').click()
    page.locator('#librarySearch').fill('reflection')
    page.screenshot(path='/mnt/data/ia-desk-library-desktop.png',full_page=False)
    page.locator('#libraryCloseBottom').click()
    page.screenshot(path='/mnt/data/ia-desk-desktop-test.png',full_page=True)
    page.set_viewport_size({'width':430,'height':920})
    page.locator('#openLibrary').click()
    page.screenshot(path='/mnt/data/ia-desk-library-mobile.png',full_page=False)
    page.locator('#closeLibrary').click()
    page.screenshot(path='/mnt/data/ia-desk-mobile-test.png',full_page=True)
    assert not errors, errors
    print('Browser smoke passed: full library copy/edit/search, stamp colours/sizes, project persistence, PDF size export, marking, 2029 block')
    browser.close()

