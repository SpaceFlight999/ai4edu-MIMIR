export const WORDMARK_INK_CSS = ''; // Keep the pale gradient static.

// Original artwork supplies only faint line detail; the first M has a clear structural fold.
export function wordmarkArt(id, href) {
  return `<image id="${id}-raw" href="${href}" width="960" height="464" preserveAspectRatio="xMidYMid meet"/>
<linearGradient id="${id}-ink-gradient" x1="-480" y1="0" x2="1440" y2="464" gradientUnits="userSpaceOnUse"><stop stop-color="var(--mw-line-a,#8197b1)"/><stop offset=".38" stop-color="var(--mw-line-c,#a3b4c5)"/><stop offset=".67" stop-color="var(--mw-line-b,#a5a1b9)"/><stop offset="1" stop-color="var(--mw-line-a,#8197b1)"/></linearGradient>
<linearGradient id="${id}-m-gradient" x1="90" y1="120" x2="300" y2="360" gradientUnits="userSpaceOnUse"><stop stop-color="var(--mw-line-a,#8197b1)"/><stop offset=".55" stop-color="var(--mw-line-b,#a5a1b9)"/><stop offset="1" stop-color="var(--mw-line-a,#8197b1)"/></linearGradient>
<filter id="${id}-line-filter" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feComponentTransfer in="SourceAlpha" result="shape"><feFuncA type="discrete" tableValues="0 0 1 1"/></feComponentTransfer>
<feMorphology in="shape" operator="erode" radius="3" result="inside"/>
<feComposite in="shape" in2="inside" operator="out" result="outline"/>
<feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="luminance"/>
<feGaussianBlur in="luminance" stdDeviation="1.1" result="smooth"/>
<feConvolveMatrix in="smooth" order="3" kernelMatrix="0 -1 0 -1 4 -1 0 -1 0" result="detail"/>
<feComponentTransfer in="detail" result="detail-lines"><feFuncA type="linear" slope="4" intercept="-.08"/></feComponentTransfer>
<feComponentTransfer in="SourceAlpha" result="wash"><feFuncA type="linear" slope=".035"/></feComponentTransfer>
<feMerge><feMergeNode in="wash"/><feMergeNode in="detail-lines"/><feMergeNode in="outline"/></feMerge>
</filter>
<mask id="${id}-line-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="960" height="464" style="mask-type:alpha"><use href="#${id}-raw" filter="url(#${id}-line-filter)"/></mask>
<mask id="${id}-quiet-knot" maskUnits="userSpaceOnUse" x="0" y="0" width="960" height="464"><rect width="960" height="464" fill="white"/><path d="M122 278H286V389H122Z" fill="#999"/></mask>
<g id="${id}-art">
<g mask="url(#${id}-quiet-knot)" opacity=".82"><g mask="url(#${id}-line-mask)"><rect class="line-gradient" x="-480" width="1920" height="464" fill="url(#${id}-ink-gradient)"/></g></g>
<g class="first-m-structure" fill="none" stroke="url(#${id}-m-gradient)" stroke-linejoin="miter" stroke-linecap="round"><path class="first-m-fold" d="M111 138L196 321L282 138" stroke-width="5" opacity=".88"/><path d="M125 145L196 292L268 145" stroke-width="2.8" opacity=".68"/></g>
</g>`;
}
