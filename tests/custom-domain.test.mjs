import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sourcePages=['index.html','library.html'];
const roots=['https://chriswalker-afk.github.io/IA-Marking/','https://marking.mrwalkermaths.com/'];

test('IA Marking Desk HTML is portable across project and custom-domain roots',()=>{
  for(const path of sourcePages){
    const html=read(path);
    assert.doesNotMatch(html,/<base\b/i,'Do not fix a site base path to one host');
    const links=[...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map(x=>x[1]);
    const local=links.filter(x=>!x.startsWith('#')&&!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(x));
    assert.ok(local.length>=8,'Expected CSS and JavaScript assets in '+path);
    for(const link of local){
      assert.ok(!link.startsWith('/'),path+' must not use a root-absolute asset: '+link);
      for(const root of roots){
        const pageURL=new URL(path,root);
        const assetURL=new URL(link,pageURL);
        assert.equal(assetURL.origin,pageURL.origin,'Link must remain on same origin: '+link);
        assert.ok(assetURL.pathname.startsWith(new URL(root).pathname),
          path+' must remain within '+root+': '+link);
      }
    }
  }
});

test('PDF.js and embedded fonts still load from the same site origin',()=>{
  const app=read('app.js'),styles=read('styles.css'),build=read('scripts/build.mjs');
  assert.match(app,/vendor\/pdf\.mjs/,'Self-hosted PDF viewer must be preserved');
  assert.match(build,/pdf\.worker\.mjs/,'PDF worker must be included in dist');
  assert.match(build,/jszip\.min\.js/,'Project/archive library must be included in dist');
  assert.match(build,/library\.html/,'Independent marking library must be included');
  const fonts=[...styles.matchAll(/url\(["']?([^)"']+)["']?\)/g)]
    .map(m=>m[1]).filter(x=>x.startsWith('vendor/fonts/'));
  assert.ok(fonts.length>=3,'The PDF annotation fonts must remain self-hosted');
  for(const font of fonts){
    for(const root of roots){
      const url=new URL(font,new URL('styles.css',root));
      assert.equal(url.origin,new URL(root).origin);
      assert.ok(url.pathname.startsWith(new URL(root).pathname));
    }
  }
});

test('PDF privacy policy does not require a new third-party service',()=>{
  const html=read('index.html');
  assert.match(html,/default-src 'self'/);
  assert.match(html,/connect-src 'self' blob:/);
  assert.match(html,/Import backup/);
  assert.match(html,/Back up IA/);
  assert.match(html,/\.iamark\.json/);
});
