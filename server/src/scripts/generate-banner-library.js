/**
 * One-off: generate the shared banner PHOTO library (ready-made backgrounds per store type) with the existing
 * Cloudflare FLUX provider. Run it yourself — it needs CF_AI_TOKEN + CF_ACCOUNT_ID in the environment:
 *   node server/src/scripts/generate-banner-library.js                 (all types, 4 images each)
 *   node server/src/scripts/generate-banner-library.js kids shoes 2    (only these types; trailing number = images per type)
 * Output: server/seed-assets/banner-library/<type>/<n>.jpg + manifest.json. Review the pictures by eye, delete the bad ones,
 * then they are published once for every store. Existing files are skipped, so re-running only fills the gaps.
 * Prompts ask for NO text, NO logos, NO brand marks; people are generic and the background is a plain studio wall so the
 * banner text (typed by the merchant) sits on clean space. FLUX returns a square, the studio places it on the end side and blends the rest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareFlux, cloudflareReady } from '../lib/image-providers.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed-assets/banner-library');
const STYLE = 'professional fashion e-commerce campaign photograph, soft natural daylight, plain seamless warm studio wall background with lots of clean empty space, subjects placed to one side, sharp focus, high-end catalogue look, no text, no logos, no watermark, no brand names';
export const TYPES = {
  women: ['a smiling woman in an elegant long dress', 'two women in stylish coats and knitwear, autumn palette', 'a woman in a tailored suit and heels', 'three women in modern casual outfits walking together'],
  men: ['a man in a grey blazer and dark turtleneck', 'two men in casual jackets and chinos', 'a man in a classic overcoat', 'three men in smart casual outfits'],
  modest: ['a woman in an elegant abaya and soft hijab, pastel tones', 'two women in modest layered outfits with scarves', 'a woman in a long flowing modest dress and hijab', 'a group of three women in modest fashion, neutral colours'],
  kids: ['two happy children in colourful clothes', 'a toddler in a cute knitted outfit', 'three kids in playful seasonal outfits, laughing', 'a little girl in a pretty dress and a boy in a shirt'],
  baby: ['a baby in a soft cotton romper on a pastel blanket', 'newborn clothes and soft toys arranged neatly, flat lay', 'a happy baby in a knitted outfit', 'pastel baby clothes flat lay with a teddy bear'],
  shoes: ['a pair of stylish sneakers on a plain pedestal', 'elegant women high heels on a soft surface', 'leather men dress shoes beautifully lit', 'a flat lay of assorted shoes and boots in neutral tones'],
  perfume: ['elegant perfume bottles on a marble surface with soft light', 'a luxury perfume bottle with golden reflections', 'several perfume bottles arranged on a velvet cloth', 'a perfume bottle with flowers, minimal luxury still life'],
  makeup: ['lipsticks and makeup brushes arranged on a soft pink surface', 'a makeup flat lay with palettes and brushes, neutral tones', 'skincare bottles on a clean marble counter', 'close-up of a woman with natural glowing makeup'],
  sport: ['an athletic man in modern sportswear running outdoors', 'a woman in leggings and a sports top stretching', 'sports shoes and a gym bag on a clean floor', 'a group of friends in sportswear'],
  accessories: ['handbags and sunglasses arranged on a clean surface', 'jewellery on a soft neutral display', 'scarves and watches in a flat lay', 'a woman holding a stylish handbag'],
  uniforms: ['professional staff in neat matching uniforms', 'medical scrubs on a clean background', 'a smiling team in matching work uniforms', 'school uniform outfits arranged neatly'],
  general: ['colourful shopping bags and gift boxes on a clean background', 'a modern bright still life with abstract shapes and soft shadows', 'a stylish flat lay of fashion items in neutral tones', 'a clean colourful promotional background with soft light'],
};

async function main() {
  if (!cloudflareReady()) { console.error('Set CF_AI_TOKEN and CF_ACCOUNT_ID (or R2_ACCOUNT_ID) first.'); process.exit(1); }
  const args = process.argv.slice(2);
  const per = Math.min(4, Number(args.find((a) => /^\d+$/.test(a))) || 4);
  const wanted = args.filter((a) => TYPES[a]);
  const types = wanted.length ? wanted : Object.keys(TYPES);
  const manifestPath = path.join(OUT, 'manifest.json');
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  for (const t of types) {
    fs.mkdirSync(path.join(OUT, t), { recursive: true });
    for (let i = 0; i < per; i++) {
      const file = path.join(OUT, t, `${i + 1}.jpg`);
      if (fs.existsSync(file)) { console.log(`skip ${t}/${i + 1}`); continue; }
      const prompt = `${TYPES[t][i]}, ${STYLE}`;
      try {
        const { buffer } = await cloudflareFlux({ prompt });
        fs.writeFileSync(file, buffer);
        (manifest[t] ||= {})[i + 1] = { prompt };
        console.log(`ok   ${t}/${i + 1}`);
      } catch (e) { console.error(`fail ${t}/${i + 1}: ${e.message}`); if (e.limited) { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); process.exit(2); } }
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Done → ${OUT}. Look at the pictures, delete the bad ones, re-run to refill.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
