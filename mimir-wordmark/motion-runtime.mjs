// Animated crops reuse the existing transparent artwork without generating new imagery.
let wordmarkSequence = 0;
const WORDMARK_REGIONS = [
  { name:'beard', path:'M178 144 Q198 139 222 149 L235 168 Q233 199 211 228 Q194 215 184 187Z', origin:'204px 148px' },
  { name:'tree-top', path:'M651 42H744V125H651Z', origin:'696px 124px' },
  { name:'tree-r', path:'M828 145Q813 147 813 162Q798 168 812 185L823 195L819 207H846L838 192Q861 191 862 174Q864 158 847 156Q846 144 828 145Z', origin:'832px 210px' },
  { name:'tree-bank', path:'M921 207Q895 207 888 238Q884 263 909 272L916 284L918 303H941L930 281Q962 277 958 248Q957 217 938 213Z', origin:'924px 305px' },
  { name:'page-right', path:'M381 65Q395 55 410 58V93Q394 90 381 99Z', origin:'381px 78px' },
  { name:'drop-one', path:'M920 164Q914 179 913 185C908 206 934 207 930 185Z', origin:'921px 183px' },
  { name:'drop-two', path:'M816 260Q811 272 809 281C808 296 825 295 823 282Z', origin:'816px 279px' },
  { name:'drop-three', path:'M831 271Q826 279 825 285C824 297 838 298 838 287Z', origin:'831px 284px' },
];
const WORDMARK_CSS = `
${WORDMARK_INK_CSS}
:host{display:inline-block;width:240px;max-width:100%;vertical-align:middle;line-height:0;--mw-a:#193c4b;--mw-gold:#8da3bd;--mw-line-a:#8197b1;--mw-line-b:#a5a1b9;--mw-line-c:#a3b4c5}
:host([theme=dark]),:host([theme=auto]):host-context(body[data-mimir-mode=dark]){--mw-a:#294d60;--mw-gold:#afc2d6;--mw-line-a:#9db3ce;--mw-line-b:#b9adc8;--mw-line-c:#a9bdce}
*{box-sizing:border-box}.surface{display:block;position:relative;width:100%;min-height:44px;border:0;border-radius:7px;padding:0;background:transparent;color:inherit;line-height:0;touch-action:manipulation}
button.surface{cursor:pointer}.surface:focus-visible{outline:2px solid #4d6b8b;outline-offset:4px}
svg{display:block;width:100%;height:auto;overflow:visible;pointer-events:none}
.flow,.spot,.burst,.crown-glow,.hand{display:none}
.beard{animation:mw-beard 4.8s ease-in-out infinite}
.tree-top{animation:mw-tree-top 4.4s ease-in-out infinite}.tree-r{animation:mw-tree-r 3.5s ease-in-out infinite -.8s}.tree-bank{animation:mw-tree-bank 5.2s ease-in-out infinite -2s}
.page-right{animation:mw-page-turn 3.6s linear infinite}
.drop-one{animation:mw-drop 3.2s ease-in infinite}.drop-two{animation:mw-drop 2.8s ease-in infinite -.9s}.drop-three{animation:mw-drop 3.8s ease-in infinite -1.8s}
.river-texture{animation:mw-river 2s ease-in-out infinite}.river-streak{fill:none;stroke:#c7f2ff;stroke-width:3.5;stroke-linecap:round;stroke-dasharray:16 24;opacity:.7;animation:mw-current 2.4s linear infinite}.river-streak.second{animation-delay:-1.1s;opacity:.45}
.acting-book .page-right{animation-duration:1.1s}.acting-river .river-texture{animation-duration:.5s}.acting-river .river-streak{animation-duration:.6s}.acting-river .drop-one,.acting-river .drop-two,.acting-river .drop-three{animation-duration:1s}
.hotspot{position:absolute;display:block;border-radius:50%;pointer-events:none;opacity:0;border:1px solid #7f9fbb;box-shadow:0 0 8px #6387a655}.surface[data-selected=elder]~[data-motif=elder],.surface[data-selected=book]~[data-motif=book],.surface[data-selected=river]~[data-motif=river]{opacity:1}.hotspot:focus-visible{opacity:1;outline:2px solid #7f9fbb;outline-offset:3px}
.suspended *{animation-play-state:paused!important}.suspended .spot{transition:none}
@keyframes mw-beard{0%,100%{transform:rotate(-.8deg)}50%{transform:rotate(1.1deg) translateY(.7px)}}
@keyframes mw-tree-top{0%,100%{transform:skewX(-1.8deg) rotate(-1deg)}50%{transform:skewX(2.3deg) rotate(1.6deg)}}
@keyframes mw-tree-r{0%,100%{transform:rotate(1.6deg)}50%{transform:rotate(-2deg)}}
@keyframes mw-tree-bank{0%,100%{transform:skewX(2deg)}50%{transform:skewX(-2.6deg) rotate(-.7deg)}}
@keyframes mw-page-turn{0%{transform:scaleX(1) skewY(0deg);opacity:0;filter:brightness(1)}3%{opacity:1}25%{transform:scaleX(.72) skewY(-7deg);filter:brightness(1.08)}50%{transform:scaleX(0) skewY(-12deg);filter:brightness(1.2)}75%{transform:scaleX(-.72) skewY(-7deg);filter:brightness(1.08)}94%{transform:scaleX(-1) skewY(0deg);opacity:1;filter:brightness(1)}100%{transform:scaleX(-1) skewY(0deg);opacity:0;filter:brightness(1)}}
@keyframes mw-drop{0%,38%{transform:translateY(0);opacity:1}65%{opacity:1}85%{transform:translateY(26px) scaleY(1.12);opacity:0}86%,100%{transform:translateY(0);opacity:0}}
@keyframes mw-river{0%,100%{transform:translateX(-3px)}50%{transform:translateX(4px)}}
@keyframes mw-current{to{stroke-dashoffset:-80}}
@media(prefers-reduced-motion:reduce){.surface *{animation:none!important;transition:none!important}.flow,.crown-glow,.river-streak{opacity:0}.active .burst{opacity:.2}.active .wave{opacity:.4}.acting-elder .hand{opacity:0}}
`;
function wordmarkMarkup(id, embedded) {
  const crops = WORDMARK_REGIONS.map(r => `<clipPath id="${id}-${r.name}"><path d="${r.path}"/></clipPath>`).join('');
  const layers = WORDMARK_REGIONS.map(r => `<g class="motif ${r.name}" style="transform-origin:${r.origin}"><use href="#${id}-art" clip-path="url(#${id}-${r.name})"/></g>`).join('');
  return `<style>${WORDMARK_CSS}</style><${embedded ? 'span' : 'button type="button" aria-label="MIMIR"'} class="surface" data-state="idle" data-action="idle">
<svg viewBox="0 0 960 464" width="960" height="464" aria-hidden="true" focusable="false"><defs>
${wordmarkArt(id,WORDMARK_IMAGE)}
${crops}<clipPath id="${id}-crown"><path d="M169 95L178 85L189 92L199 82L210 90L224 86L242 102L238 108L173 106Z"/></clipPath><clipPath id="${id}-clip"><rect width="960" height="464"/></clipPath>
<mask id="${id}-base" maskUnits="userSpaceOnUse" x="-20" y="-20" width="1000" height="510"><rect width="960" height="464" fill="white"/><g fill="black">${WORDMARK_REGIONS.filter(r=>r.name!=='page-right').map(r=>`<path d="${r.path}"/>`).join('')}</g></mask>
<mask id="${id}-alpha" maskUnits="userSpaceOnUse" width="960" height="464" style="mask-type:alpha"><use href="#${id}-art"/></mask>
<clipPath id="${id}-water"><path d="M802 298Q818 307 834 300L850 340Q826 339 805 332Z M899 300Q928 314 955 293L954 334Q934 346 920 344Z"/></clipPath>
<linearGradient id="${id}-flow" x1="-160" x2="160" gradientUnits="userSpaceOnUse"><stop stop-color="#a2bdd5" stop-opacity="0"/><stop offset=".5" stop-color="#c1d6e8"/><stop offset="1" stop-color="#a2bdd5" stop-opacity="0"/></linearGradient>
<radialGradient id="${id}-spot"><stop stop-color="#bbd1e4"/><stop offset="1" stop-color="#bbd1e4" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-wave"><stop offset=".2" stop-color="#adc9df" stop-opacity="0"/><stop offset=".42" stop-color="#adc9df" stop-opacity=".95"/><stop offset=".68" stop-color="#adc9df" stop-opacity="0"/></radialGradient>
</defs>
<use href="#${id}-art" mask="url(#${id}-base)"/>${layers}
<g clip-path="url(#${id}-water)" mask="url(#${id}-alpha)"><use class="river-texture" href="#${id}-art"/><path class="river-streak" d="M797 310Q816 318 839 311 M899 316Q929 328 961 310 M803 329Q824 335 848 328 M910 335Q932 343 960 324"/><path class="river-streak second" d="M798 319Q818 327 845 317 M901 326Q934 337 960 318"/></g>
<g mask="url(#${id}-alpha)"><use class="crown-glow" href="#${id}-art" clip-path="url(#${id}-crown)" style="filter:brightness(1.8)"/>
<rect class="flow" x="-160" width="320" height="464" fill="url(#${id}-flow)"/>
<g class="spot"><circle cx="480" cy="232" r="220" fill="url(#${id}-spot)"/></g><g class="burst"><g class="origin" transform="translate(480 232)"><circle class="wave" r="600" fill="url(#${id}-wave)"/></g></g></g>
<g class="hand" style="transform-origin:224px 167px" fill="none" stroke="var(--mw-line-a)" stroke-width="1.4"><path d="M236 162L230 159Q226 156 225 160L223 169L218 165Q214 164 214 168L222 180Q227 184 232 179L238 171Z"/><path d="M224 162L226 172M229 160L230 170M233 163L234 170" fill="none"/><path d="M231 180L239 170L245 177L237 186Z" fill="none"/></g>
</svg></${embedded ? 'span' : 'button'}>
<span class="hotspot" ${embedded ? 'aria-hidden="true"' : 'role="button" tabindex="0"'} data-motif="elder" aria-label="老者：轻捋胡须" style="left:16%;top:14%;width:10%;height:36%"></span>
<span class="hotspot" ${embedded ? 'aria-hidden="true"' : 'role="button" tabindex="0"'} data-motif="book" aria-label="书本：加速翻页" style="left:35%;top:6%;width:11%;height:22%"></span>
<span class="hotspot" ${embedded ? 'aria-hidden="true"' : 'role="button" tabindex="0"'} data-motif="river" aria-label="河流：加速流淌" style="left:82%;top:60%;width:18%;height:18%"></span>`;
}

export function defineMimirWordmark() {
  if (!globalThis.customElements || customElements.get('mimir-wordmark')) return;
  class MimirWordmark extends HTMLElement {
    static get observedAttributes() { return ['width']; }
    connectedCallback() {
      if (this._dispose) return;
      if (!this.hasAttribute('theme')) this.setAttribute('theme', 'auto');
      this._embedded = this.hasAttribute('embedded');
      const shadow = this.shadowRoot || this.attachShadow({mode:'open'});
      shadow.innerHTML = wordmarkMarkup('mw-' + (++wordmarkSequence), this._embedded);
      this._surface = shadow.querySelector('.surface');
      this._target = (this._embedded && this.closest('button,a')) || this._surface;
      // Host buttons retain native navigation. Inner actions remain keyboard accessible.
      this.removeAttribute('aria-hidden');
      this.style.position = 'relative';
      this._selected=null;this._hover=false; this._focus=false; this._active=false; this._action='idle';
      this._inView=true; this._windowFocus=document.hasFocus();
      const disposers=[];
      const listen=(target,type,fn)=>{target.addEventListener(type,fn);disposers.push(()=>target.removeEventListener(type,fn));};
      const sync=()=>this._sync();
      listen(this._target,'pointerenter',e=>{if(e.pointerType==='touch')return;this._hover=true;this._move(e);sync();});
      listen(this._target,'pointermove',e=>{if(e.pointerType!=='touch')this._move(e);});
      listen(this._target,'pointerleave',()=>{this._hover=false;sync();});
      listen(this._target,'focus',()=>{this._focus=this._target.matches(':focus-visible');sync();});
      listen(this._target,'blur',()=>{this._focus=false;sync();});
      listen(this._target,'click',e=>this._activate(e));
      listen(this._target,'keydown',e=>{
        if(e.target!==this._target)return;
        if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
          e.preventDefault();const options=['elder','book','river'];const step=e.key==='ArrowRight'?1:-1;
          this._selected=options[(options.indexOf(this._selected)+step+3)%3];
          this._surface.dataset.selected=this._selected;this._describeSelection();
        }else if(e.key==='Escape'){this._selected=null;delete this._surface.dataset.selected;this._describeSelection();}
        else if(this._selected&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();this._playMotif(this._selected);}
      });
      const descriptionBefore=this._target.getAttribute('aria-description');
      this._describeSelection();
      disposers.push(()=>{if(descriptionBefore===null)this._target.removeAttribute('aria-description');else this._target.setAttribute('aria-description',descriptionBefore);});
      for (const hotspot of shadow.querySelectorAll('.hotspot')) {
        listen(hotspot,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();this._playMotif(hotspot.dataset.motif);}});
        listen(hotspot,'click',e=>{e.stopPropagation();this._playMotif(hotspot.dataset.motif);});
      }
      listen(document,'visibilitychange',sync);
      listen(window,'blur',()=>{this._windowFocus=false;sync();});
      listen(window,'focus',()=>{this._windowFocus=true;sync();});
      const observer=new IntersectionObserver(entries=>{this._inView=entries[0].isIntersecting;sync();});
      observer.observe(this);disposers.push(()=>observer.disconnect());
      this._dispose=()=>{disposers.forEach(dispose=>dispose());clearTimeout(this._timer);clearTimeout(this._actionTimer);cancelAnimationFrame(this._frame);this._frame=null;this._active=false;this._action='idle';};
      this.attributeChangedCallback('width');this._sync();
    }
    disconnectedCallback(){this._dispose?.();this._dispose=null;}
    attributeChangedCallback(name){if(name==='width'){const w=Number(this.getAttribute('width'));this.style.width=w>0&&Number.isFinite(w)?w+'px':'240px';}if(this._surface)this._sync();}
    _sync(){
      const suspended=document.hidden||!this._inView||!this._windowFocus;
      if(suspended){clearTimeout(this._timer);clearTimeout(this._actionTimer);this._active=false;this._action='idle';cancelAnimationFrame(this._frame);this._frame=null;}
      this._surface.classList.toggle('suspended',suspended);
      this._surface.classList.toggle('interested',this._hover||this._focus);
      this._surface.classList.toggle('active',this._active);
      for(const action of ['elder','book','river'])this._surface.classList.toggle('acting-'+action,this._action===action);
      this._surface.dataset.state=this._active?'activated':this._hover||this._focus?'hover':'idle';
      this._surface.dataset.action=this._action;
    }
    _point(event,centered=false){const r=this.shadowRoot.querySelector('svg').getBoundingClientRect();return{x:centered?480:Math.max(0,Math.min(960,(event.clientX-r.left)/r.width*960)),y:centered?232:Math.max(0,Math.min(464,(event.clientY-r.top)/r.height*464))};}
    _move(event){if(this._surface.classList.contains('suspended'))return;this._pointPending=this._point(event);if(this._frame)return;this._frame=requestAnimationFrame(()=>{this._frame=null;const{x,y}=this._pointPending;this.shadowRoot.querySelector('.spot circle').style.transform='translate('+(x-480)+'px,'+(y-232)+'px)';});}
    _describeSelection(){const label={elder:'老者',book:'书本',river:'河流'}[this._selected];this._target.setAttribute('aria-description',(label?'当前选择：'+label+'。':'')+'左右方向键选择老者、书本或河流，回车或空格播放，Escape恢复首页按钮。');}
    _playMotif(action){
      if(this._target.disabled||this._target.getAttribute('aria-disabled')==='true'||this._surface.classList.contains('suspended'))return;
      clearTimeout(this._actionTimer);this._action=action;this._sync();
      this.dispatchEvent(new CustomEvent('mimir-motif',{bubbles:true,composed:true,detail:{action}}));
      this._actionTimer=setTimeout(()=>{this._action='idle';this._sync();},4200);
    }
    _activate(event){
      if(this._target.disabled||this._target.getAttribute('aria-disabled')==='true')return;
      const point=this._point(event,event.detail===0);
      if(event.detail!==0){
        const{x,y}=point;
        const action=x>=155&&x<=248&&y>=64&&y<=231?'elder':x>=330&&x<=439&&y>=28&&y<=133?'book':x>=793&&y>=275&&y<=367?'river':null;
        if(action){event.preventDefault();event.stopPropagation();this._playMotif(action);}
      }
      this.dispatchEvent(new CustomEvent('mimir-activate',{bubbles:true,composed:true,detail:point}));
      if(this._active)return;
      this._active=true;this.shadowRoot.querySelector('.origin').setAttribute('transform','translate('+point.x+' '+point.y+')');this._sync();
      this._timer=setTimeout(()=>{this._active=false;this._sync();},1600);
    }
  }
  customElements.define('mimir-wordmark',MimirWordmark);
}
