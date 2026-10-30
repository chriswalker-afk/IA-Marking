import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {createUnicodeFonts,normaliseAnnotationText} from '../unicode-fonts.js';

const data=[
  readFileSync('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
  readFileSync('node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'),
  readFileSync('node_modules/@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf'),
];
test('Noto PDF font engine preserves mathematical Unicode and rejects unsupported glyphs',async()=>{
  const doc=await PDFDocument.create();
  const fonts=await createUnicodeFonts(doc,fontkit,data);
  const text='π ≤ √16 and σ², ∑x, ∫f(x) dx ≈ 4';
  assert.ok(fonts.regular.widthOfTextAtSize(text,10)>30);
  fonts.regular.check(text);
  const page=doc.addPage([595,842]);
  fonts.regular.draw(page,text,40,730,10,rgb(.2,.2,.2));
  fonts.bold.draw(page,'Mathematics: π² ≤ ∫',40,700,12,rgb(0,0,0));
  const pdf=await doc.save();
  assert.ok(pdf.length>10000,'Font-embedded PDF should be nonempty');
  assert.throws(()=>fonts.regular.check('🧪'),/Unsupported comment character U\+/);
});
test('Teacher comment text is normalised without destructive mathematical ASCII replacement',()=>{
  assert.equal(normaliseAnnotationText('π\r\nσ² ≤ √16\t∫'),'π\nσ² ≤ √16    ∫');
});
