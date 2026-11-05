import { readFileSync, writeFileSync } from 'node:fs'

const sourcePath = 'node_modules/katex/dist/katex.min.css'
const targetPath = 'src/katex.css'

let css = readFileSync(sourcePath, 'utf8')
const fontFaces = css.match(/@font-face/g)?.length ?? 0

// Les WebView ciblées prennent toutes le woff2 en charge : conserver aussi les
// variantes woff et ttf ajouterait ~0,8 Mo au paquet.
css = css.replace(
  /src:url\(fonts\/([^)]+?)\.woff2\) format\("woff2"\),url\(fonts\/[^)]+?\.woff\) format\("woff"\),url\(fonts\/[^)]+?\.ttf\) format\("truetype"\)/g,
  'src:url(/katex/fonts/$1.woff2) format("woff2")',
)

if (css.includes('.woff)') || css.includes('.ttf)')) {
  throw new Error('KaTeX CSS still references non-woff2 fonts')
}
if ((css.match(/@font-face/g)?.length ?? 0) !== fontFaces) {
  throw new Error('KaTeX @font-face rules changed')
}

const version = JSON.parse(readFileSync('node_modules/katex/package.json', 'utf8')).version

const header =
  '/* Généré depuis katex/dist/katex.min.css (KaTeX ' +
  version +
  ').\n' +
  '   Seul le format woff2 est conservé : les WebView ciblées le prennent\n' +
  '   toutes en charge, et les variantes woff/ttf ajouteraient ~0,8 Mo.\n' +
  '   Les polices sont copiées dans katex/fonts par angular.json.\n' +
  '   Régénérer avec : node .github/scripts/sync-katex-css.mjs */\n'

writeFileSync(targetPath, `${header}${css.trim()}\n`)
console.log(`Wrote ${targetPath} (${fontFaces} font faces, ${css.length} bytes)`)
