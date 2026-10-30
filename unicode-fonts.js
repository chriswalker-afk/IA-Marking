/*
 * PDF annotation font engine.
 * Embeds open-licensed Noto Sans and Noto Sans Math so the moderator receives
 * Unicode text and ordinary mathematical symbols, not ASCII replacements.
 * If an unsupported glyph is encountered, fail closed rather than emit '?'.
 */
export function normaliseAnnotationText(value) {
  return String(value ?? '').normalize('NFC')
    .replace(/\r\n?/g,'\n')
    .replace(/\t/g,'    ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
}

export function pdfFontError(error) {
  return error?.message || String(error);
}

export async function createUnicodeFonts(document, fontkit, fontAssets) {
  if (!fontkit?.create || !document?.registerFontkit) {
    throw new Error('The Unicode PDF font engine did not load. Export is unavailable until it is restored.');
  }
  document.registerFontkit(fontkit);
  const [regularBytes,boldBytes,mathBytes]=fontAssets;
  const originals=[
    fontkit.create(regularBytes),
    fontkit.create(boldBytes),
    fontkit.create(mathBytes),
  ];
  const [regular,bold,math]=await Promise.all(fontAssets.map(bytes=>document.embedFont(bytes,{subset:false})));
  const fontRecords=[{font:regular,original:originals[0]},{font:bold,original:originals[1]},{font:math,original:originals[2]}];
  function segments(value,isBold=false) {
    const text=normaliseAnnotationText(value);
    const chosen=[];
    for(const char of Array.from(text)){
      const cp=char.codePointAt(0);
      const requested=isBold?1:0;
      let index=originals[requested].hasGlyphForCodePoint(cp)?requested:
        originals[0].hasGlyphForCodePoint(cp)?0:
        originals[2].hasGlyphForCodePoint(cp)?2:-1;
      // Noto Sans Math contains several operators absent in Noto Sans.
      if(index<0){
        const code='U+'+cp.toString(16).toUpperCase().padStart(4,'0');
        throw new Error('Unsupported comment character '+code+' ('+char+'). Replace it with supported Unicode text before exporting.');
      }
      const last=chosen[chosen.length-1];
      if(last && last.index===index) last.text+=char;
      else chosen.push({index,text:char});
    }
    return chosen.map(({index,text})=>({text,font:fontRecords[index].font}));
  }
  function makeFont(boldText=false) {
    return {
      isUnicode:true,
      widthOfTextAtSize(value,size) {
        return segments(value,boldText).reduce((sum,part)=>sum+part.font.widthOfTextAtSize(part.text,size),0);
      },
      draw(page,value,x,y,size,color) {
        let px=x;
        for(const part of segments(value,boldText)) {
          if(part.text && part.text!=='\n')page.drawText(part.text,{x:px,y,size,font:part.font,color});
          px+=part.font.widthOfTextAtSize(part.text,size);
        }
      },
      check(value){segments(value,boldText);}
    };
  }
  return {regular:makeFont(false),bold:makeFont(true)};
}
