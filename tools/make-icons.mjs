// Builds the Flip Clock logo and app icons.
// Usage: node make-icons.mjs <path to BarlowCondensed-SemiBold.ttf> <output dir> [digits]
// Needs: npm i opentype.js@1.3.4 @resvg/resvg-js@2.6.2
import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";

const [fontFile, outDir, digits = "12"] = process.argv.slice(2);
const font = opentype.loadSync(fontFile);
fs.mkdirSync(outDir, { recursive: true });

const S = 512;            // design canvas
const C = S / 2;          // center
const CARD = 344;         // card size
const R = 58;             // card corner radius
const STRETCH = 1.18;     // same vertical stretch as the clock digits
const x0 = C - CARD / 2, y0 = C - CARD / 2;

// Digits as outlines (no font needed to display the SVG), sized like the app:
// font-size 0.88 x card, then centered exactly on the card and stretched.
const fontSize = CARD * 0.88;
const p = font.getPath(digits, 0, 0, fontSize);
const bb = p.getBoundingBox();
const cx = (bb.x1 + bb.x2) / 2, cy = (bb.y1 + bb.y2) / 2;
const digitPath = p.toPathData(2);
const digitsEl =
  `<path fill="#fff" transform="translate(${C} ${C}) scale(1 ${STRETCH}) translate(${-cx.toFixed(2)} ${-cy.toFixed(2)})" d="${digitPath}"/>`;

function svg({ rounded }) {
  const bg = rounded
    ? `<rect width="${S}" height="${S}" rx="112" fill="#000"/>`
    : `<rect width="${S}" height="${S}" fill="#000"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  ${bg}
  <defs>
    <clipPath id="card"><rect x="${x0}" y="${y0}" width="${CARD}" height="${CARD}" rx="${R}"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect x="${x0}" y="${y0}" width="${CARD}" height="${CARD / 2}" fill="#222"/>
    <rect x="${x0}" y="${C}" width="${CARD}" height="${CARD / 2}" fill="#1a1a1a"/>
    ${digitsEl}
    <rect x="${x0}" y="${C - 4}" width="${CARD}" height="8" fill="#000"/>
  </g>
</svg>
`;
}

const rounded = svg({ rounded: true });  // logo + browser favicon
const square = svg({ rounded: false });  // phones round the corners themselves

fs.writeFileSync(path.join(outDir, "logo.svg"), rounded);
fs.writeFileSync(path.join(outDir, "favicon.svg"), rounded);

const png = (src, size, name) => {
  const out = new Resvg(src, { fitTo: { mode: "width", value: size } }).render().asPng();
  fs.writeFileSync(path.join(outDir, name), out);
  console.log(name, size, out.length, "bytes");
};
png(rounded, 32, "favicon-32.png");
png(square, 180, "apple-touch-icon.png");
png(square, 192, "icon-192.png");
png(square, 512, "icon-512.png");
