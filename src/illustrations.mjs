// Inline SVG illustrations from design/sid-motion-kit-standalone.html.
// Styling lives in site.css under "Illustrations". All of them are decorative (aria-hidden).

/** Hero illustration B · Pipeline: a request goes in, an AI step handles it, a finished result comes out. */
export const heroPipeline = `<svg class="il" viewBox="0 0 400 320" aria-hidden="true" focusable="false">
<rect class="ln" x="24" y="110" width="92" height="100" rx="14"/>
<line class="dim" x1="42" y1="138" x2="98" y2="138"/>
<line class="dim" x1="42" y1="160" x2="84" y2="160"/>
<line class="dim" x1="42" y1="182" x2="94" y2="182"/>
<rect class="ac breathe" x="154" y="90" width="92" height="140" rx="14"/>
<circle class="ac" cx="200" cy="160" r="20"/>
<circle class="acf" cx="200" cy="160" r="6"/>
<line class="ac" x1="200" y1="130" x2="200" y2="136"/>
<line class="ac" x1="200" y1="184" x2="200" y2="190"/>
<line class="ac" x1="170" y1="160" x2="176" y2="160"/>
<line class="ac" x1="224" y1="160" x2="230" y2="160"/>
<rect class="ln" x="284" y="110" width="92" height="100" rx="14"/>
<path class="ac" d="M298 138l4 4 8-8"/>
<line class="dim" x1="318" y1="138" x2="360" y2="138"/>
<path class="ac" d="M298 160l4 4 8-8"/>
<line class="dim" x1="318" y1="160" x2="350" y2="160"/>
<path class="ac" d="M298 182l4 4 8-8"/>
<line class="dim" x1="318" y1="182" x2="356" y2="182"/>
<path class="ln flow" d="M120 160H150"/>
<path class="ln" d="M145 154l6 6-6 6"/>
<path class="ln flow" d="M250 160H280"/>
<path class="ln" d="M275 154l6 6-6 6"/>
<text x="70" y="254" text-anchor="middle">INBOX</text>
<text x="200" y="254" text-anchor="middle">AI STEP</text>
<text x="330" y="254" text-anchor="middle">DONE</text>
</svg>`;

const markSvg = (inner) => `<svg class="il" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${inner}</svg>`;

/** Venture line marks, keyed like site.ventures. */
export const marks = {
  agentra: markSvg(`<line class="ln" x1="14" y1="46" x2="50" y2="46"/><line class="ln" x1="14" y1="46" x2="32" y2="14"/><line class="ln" x1="50" y1="46" x2="32" y2="14"/><line class="ac" x1="32" y1="35" x2="14" y2="46"/><line class="ac" x1="32" y1="35" x2="50" y2="46"/><line class="ac" x1="32" y1="35" x2="32" y2="14"/><circle class="bgf" cx="14" cy="46" r="5"/><circle class="bgf" cx="50" cy="46" r="5"/><circle class="bgf" cx="32" cy="14" r="5"/><circle class="acf" cx="32" cy="35" r="4"/>`),
  catalyst: markSvg(`<rect class="ln" x="11" y="38" width="9" height="16" rx="2"/><rect class="ln" x="27.5" y="28" width="9" height="26" rx="2"/><rect class="ac" x="44" y="14" width="9" height="40" rx="2"/><line class="ln" x1="8" y1="58" x2="56" y2="58"/>`),
  mautalk: markSvg(`<rect class="ac" x="24" y="8" width="16" height="28" rx="8"/><path class="ln" d="M15 29a17 17 0 0 0 34 0"/><line class="ln" x1="32" y1="46" x2="32" y2="56"/><line class="ln" x1="23" y1="56" x2="41" y2="56"/>`),
  dolceAttires: markSvg(`<path class="ac" d="M32 28C32 24 38 23 38 18a6 6 0 1 0-12 0"/><path class="ln" d="M32 28L8 46h48Z"/>`),
};

/** Waitlist confirmation tick: a ring and a check that draw themselves. */
export const tick = `<svg class="tick-svg" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><circle class="t-c" cx="36" cy="36" r="30" pathLength="1"/><path class="t-k" d="M23 37l9 9 17-19" pathLength="1"/></svg>`;
