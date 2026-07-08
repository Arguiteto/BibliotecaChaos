/* BibliChaos — estante + leitor de PDFs.
   Fonte dos livros:
     - Cloudflare Worker (CONFIG.WORKER_URL) — lista e le a pasta do Drive;
     - Local (senao) — usa livros.json + pasta Livros/.
   Desktop (tela larga + mouse): estante de madeira, livros de lombada;
     hover puxa o livro e mostra a capa (1a pagina real) + nome.
   Celular / retrato: grade de capas (sem nome) + leitor de UMA pagina.
   So renderiza as paginas proximas, por isso nao pesa. */

const pdfjsLib = window['pdfjsLib'];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);

/* --- estilos v2 (injetados; podem ser movidos pro estilo.css depois) --- */
(function estilosV2(){
  const css = `
  .case{width:min(1600px,98vw)}
  .conteudo{width:100%;max-width:1600px}
  .resumo{margin:0 0 22px}
  .resumo[hidden]{display:none}
  .continuar{max-width:min(560px,92vw);display:flex;align-items:center;gap:10px;
    padding:10px 20px;border-radius:999px;cursor:pointer;
    border:1px solid rgba(60,37,18,.28);background:rgba(255,250,242,.72);
    color:#4a3a22;font-family:"Cormorant Garamond",serif;font-size:15px;
    box-shadow:0 6px 18px rgba(60,37,18,.12);transition:background .2s,transform .15s}
  .continuar:hover{background:#fffaf2;transform:translateY(-1px)}
  .continuar .cont-label{flex:0 0 auto;color:#8a6a3a}
  .continuar b{flex:1 1 auto;min-width:0;font-weight:600;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .continuar .cont-pg{flex:0 0 auto;font-family:"Oswald",sans-serif;font-weight:600;
    font-size:13px;letter-spacing:.02em;color:#fff;background:#c96f2e;
    padding:3px 10px;border-radius:999px}
  .contador{cursor:pointer;border-radius:999px;padding:8px 16px;color:#f3e6cf;
    background:rgba(0,0,0,.55);font-family:"Oswald",sans-serif;font-size:13px;letter-spacing:.04em;
    transition:background .15s}
  .contador:hover{background:rgba(0,0,0,.72)}
  .contador .campo-pagina{width:72px;text-align:center;font-size:15px;
    font-family:"Cormorant Garamond",serif;color:#3a2b16;background:#fffaf2;
    border:1px solid #c96f2e;border-radius:999px;padding:3px 8px;outline:none;
    -webkit-appearance:none;appearance:none;margin:0}
  .contador .campo-pagina::-webkit-outer-spin-button,
  .contador .campo-pagina::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .btn-livros{position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:22;
    writing-mode:vertical-rl;background:rgba(0,0,0,.5);color:#f3e6cf;border:none;
    padding:16px 9px;border-radius:8px 0 0 8px;cursor:pointer;font-family:"Oswald",sans-serif;
    letter-spacing:.2em;text-transform:uppercase;font-size:12px;
    box-shadow:-4px 0 14px rgba(0,0,0,.4);transition:background .2s,padding .2s}
  .btn-livros:hover{background:rgba(0,0,0,.75);padding-right:13px}
  .backdrop{position:fixed;inset:0;z-index:29;background:rgba(0,0,0,.45);opacity:0;
    pointer-events:none;transition:opacity .25s}
  .backdrop.on{opacity:1;pointer-events:auto}
  .drawer{position:fixed;top:0;right:0;height:100%;width:320px;max-width:86vw;z-index:30;
    background:#221912;box-shadow:-16px 0 40px rgba(0,0,0,.55);transform:translateX(100%);
    transition:transform .3s cubic-bezier(.2,.75,.2,1);display:flex;flex-direction:column;
    padding-top:calc(14px + env(safe-area-inset-top))}
  .drawer.aberto{transform:translateX(0)}
  .drawer h3{margin:0;padding:6px 18px 12px;font-family:"Oswald",sans-serif;font-weight:500;
    letter-spacing:.14em;text-transform:uppercase;font-size:13px;color:#c9b596;
    display:flex;justify-content:space-between;align-items:center}
  .drawer .fechar{background:none;border:none;color:#c9b596;font-size:22px;cursor:pointer;line-height:1}
  .drawer .lista{overflow:auto;flex:1;padding:0 8px 16px}
  .drawer .item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;
    background:none;border:none;color:#f0e6d3;cursor:pointer;padding:11px 12px;border-radius:8px;
    font-family:"Cormorant Garamond",serif;font-size:15px;transition:background .15s}
  .drawer .item:hover{background:rgba(255,255,255,.08)}
  .drawer .item .nome{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .drawer .item .pg{flex:0 0 auto;font-family:"Oswald",sans-serif;font-size:12px;color:#fff;
    background:#c96f2e;border-radius:999px;padding:2px 9px}
  .drawer .item .pg.zero{background:rgba(255,255,255,.14);color:#c9b596}
  @media (max-width:900px),(orientation:portrait){
    .voltar{top:calc(12px + env(safe-area-inset-top));left:12px;font-size:13px;padding:8px 14px;
      max-width:44vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .faixa-titulo{top:calc(14px + env(safe-area-inset-top));left:auto;right:12px;transform:none;
      text-align:right;max-width:calc(100vw - 150px);font-size:13px;padding:6px 14px}
  }`;
  const s = document.createElement('style'); s.textContent = css;
  document.head.appendChild(s);
})();

const estante = $('estante'), leitor = $('leitor');
const caseDesktop = $('caseDesktop'), gridMobile = $('gridMobile');
const estanteVazia = $('estanteVazia'), semResultado = $('semResultado');

const RENDER_W  = 1300;  // largura de renderizacao de pagina no leitor (px)
const RENDER_MAX = 3000; // teto de largura ao dar zoom (nitidez)
const CAPA_W    = 300;   // largura da capa (miniatura da 1a pagina)
const FLIP_MS   = 600;   // duracao da virada 3D — combine com o CSS
const CACHE_MAX = 40;    // paginas guardadas em memoria no leitor
const CAP_CONC  = 3;     // capas renderizadas em paralelo

const usaDrive = typeof CONFIG !== 'undefined' && CONFIG.WORKER_URL;

/* chaves de armazenamento local (cache por visitante) */
const LS_LISTA = 'bc_lista_v2';
const LS_CAPA  = 'bc_capa_';   // + chave do livro
const LS_POS   = 'bc_pos_';    // + chave do livro -> ultima pagina
const LS_ULT   = 'bc_ultimo';  // chave do ultimo livro aberto

/* paleta de lombadas (quentes + frios de arquivo) */
const PAL = [
  ['#c47a34','#a2551f','#5f2f10','#fbe7cf'],['#d7a740','#b6842a','#6f4d12','#3a2c08'],
  ['#7f8d55','#5f6b3d','#39421f','#f2f0dc'],['#4a7290','#33566e','#1a303f','#e6f0f5'],
  ['#95505d','#6f3a44','#3f1e25','#f6e2e6'],['#e7ddc5','#cdbf9f','#9c8c66','#4a3c22'],
  ['#3f5a75','#2b4055','#152633','#dfe9f0'],['#a85a2c','#7d3f1c','#48220d','#f7e3d0'],
  ['#6d6f96','#4d4f70','#2b2c45','#e7e5f2'],['#4d7256','#33513a','#1c3020','#e4f0e6'],
  ['#b58236','#8c5f1f','#513509','#f8ecd2'],['#88424d','#5f2b34','#341419','#f4dde1'],
];

/* ---------- modo de leitura (solo = uma pagina) ---------- */
const mqSolo = window.matchMedia('(max-width: 900px), (orientation: portrait)');
let solo = mqSolo.matches;
async function aoMudarModo(){
  solo = mqSolo.matches;
  if(!pdf) return;
  solo ? await mostrarSolo(false) : await mostrarSpread();
  preload();
}
mqSolo.addEventListener ? mqSolo.addEventListener('change', aoMudarModo)
                        : mqSolo.addListener(aoMudarModo);

/* ---------- utilitarios de cache local ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } }
function chaveLivro(l){ return (l && (l.url || l.titulo)) || ''; }

/* ==================== ESTANTE ==================== */
let todosLivros = [];
let ioCapas = null;   // IntersectionObserver das capas (grade)

async function iniciar(){
  const cache = lsGet(LS_LISTA);
  if(cache){
    try{ montarTudo(JSON.parse(cache)); }catch(e){}
  }

  let lista = [];
  try{ lista = usaDrive ? await listarDoDrive() : await listarLocal(); }
  catch(e){ console.error(e); }

  if(lista.length){
    const assinatura = JSON.stringify(lista.map(l => l.url || l.titulo));
    lsSet(LS_LISTA, JSON.stringify(lista));
    if(!cache || assinatura !== JSON.stringify(todosLivros.map(l => l.url || l.titulo))){
      montarTudo(lista);
    }
  } else if(!cache){
    estanteVazia.hidden = false;
  }
}

function montarTudo(lista){
  todosLivros = lista;
  estanteVazia.hidden = !!lista.length;
  lista.forEach((l, i) => {
    l._pal   = PAL[i % PAL.length];
    l._busca = normalizar((l.titulo || '') + ' ' + (l.autor || ''));
    l.nodes  = [];
    l.imgs   = [];
    l.capa   = lsGet(LS_CAPA + chaveLivro(l)) || null;
  });
  aplicarFiltro('');
  montarResumo();
}

function normalizar(t){
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tituloDoArquivo(nome){
  return nome.replace(/\.pdf$/i, '')
    .replace(/[\u0000-\u001f\u2028\u2029\u200b-\u200f\ufeff\ufffd]/g, ' ') // controle/separadores
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function listarDoDrive(){
  const r = await fetch(`${CONFIG.WORKER_URL}/list`);
  if(!r.ok) throw new Error('Worker /list ' + r.status);
  const d = await r.json();
  return (d.files || []).map(f => ({
    titulo: tituloDoArquivo(f.name),
    autor: f.autor || '',
    url: `${CONFIG.WORKER_URL}/file/${f.id}`,
    thumb: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s400') : null
  }));
}

async function listarLocal(){
  const r = await fetch('livros.json?v=' + Date.now());
  const arr = await r.json();
  return arr.map(item => {
    const arquivo = typeof item === 'string' ? item : item.arquivo;
    if(!arquivo) return null;
    const titulo = (typeof item === 'object' && item.titulo)
      ? item.titulo : tituloDoArquivo(arquivo.replace(/^Livros\//, ''));
    const autor = (typeof item === 'object' && item.autor) ? item.autor : '';
    return { titulo, autor, url: encodeURI(arquivo), thumb: null };
  }).filter(Boolean);
}

/* ---------- estante de madeira (desktop) ---------- */
function corVars(el, p){
  el.style.setProperty('--c-lt', p[0]); el.style.setProperty('--c', p[1]);
  el.style.setProperty('--c-dk', p[2]); el.style.setProperty('--c-txt', p[3]);
}

const GAP_TOMO = 2;                          // gap entre lombadas (igual ao CSS .vao)
function alturaTomo(livro){ return 176 + (hash(livro.titulo) % 58); }
function larguraTomo(livro){ return 30 + (hash(livro.titulo + 'w') % 16); }

function criaTomo(livro){
  const p = livro._pal;
  const h = alturaTomo(livro);
  const w = larguraTomo(livro);
  const b = document.createElement('button');
  b.className = 'tomo';
  b.style.setProperty('--h', h + 'px');
  b.style.setProperty('--w', w + 'px');
  corVars(b, p);
  b.title = livro.titulo;
  b.setAttribute('aria-label', livro.titulo + (livro.autor ? ' — ' + livro.autor : ''));
  b.innerHTML =
    '<span class="lombada"><span class="faixa"></span>' +
      '<span class="rot"></span><span class="faixa"></span></span>' +
    '<span class="cover"><img class="capaImg" alt=""><span class="cover-nome"></span></span>';
  b.querySelector('.rot').textContent = livro.titulo;
  b.querySelector('.cover-nome').textContent = livro.titulo;
  b.onclick = () => abrirLivro(livro);
  const carregar = () => prepararCapa(livro);
  b.addEventListener('pointerenter', carregar, { once: true });
  b.addEventListener('focus', carregar, { once: true });
  livro.nodes.push(b);
  livro.imgs.push(b.querySelector('.capaImg'));
  if(livro.capa) b.querySelector('.capaImg').src = livro.capa;
  return b;
}

function fazPrat(livros, off){
  const prat = document.createElement('div');
  prat.className = 'prat ' + off;
  const vao = document.createElement('div'); vao.className = 'vao';
  livros.forEach(l => vao.appendChild(criaTomo(l)));
  prat.appendChild(vao);
  return prat;
}

function fazPratCentro(centro, off){
  const prat = document.createElement('div');
  prat.className = 'prat centro ' + off;
  const vao = document.createElement('div'); vao.className = 'vao';
  const meio = Math.ceil(centro.length / 2);
  const gEsq = document.createElement('div'); gEsq.className = 'grupo';
  centro.slice(0, meio).forEach(l => gEsq.appendChild(criaTomo(l)));
  const brand = document.createElement('div'); brand.className = 'brand';
  brand.innerHTML = '<b>Bibli<i>Chaos</i></b><small>arq &amp; art</small>';
  const gDir = document.createElement('div'); gDir.className = 'grupo';
  centro.slice(meio).forEach(l => gDir.appendChild(criaTomo(l)));
  vao.append(gEsq, brand, gDir);
  prat.appendChild(vao);
  return prat;
}

/* largura util de uma prateleira, ja descontando: o deslocamento off-l/off-r
   (8% via margin no CSS), os paddings do .prat (26px cada lado) e do .vao
   (12px cada lado) e uma pequena folga. E com base nela que os livros sao
   distribuidos, para nunca estourar as bordas nem sobrepor. */
function larguraUtilPrat(){
  const larg = caseDesktop.clientWidth || Math.min(1600, window.innerWidth * 0.98);
  return larg * 0.92 - 76 - 6;
}

function montarCase(livros, comCentro){
  caseDesktop.innerHTML = '';
  if(!livros.length) return;
  const arr = livros.slice();

  let centro = [];
  if(comCentro){
    const nCentro = Math.min(4, arr.length);
    const ini = Math.max(0, Math.floor((arr.length - nCentro) / 2));
    centro = arr.splice(ini, nCentro);
  }

  // empacotamento por largura real: soma a largura de cada lombada + gaps e
  // quebra a fileira antes de passar da largura util (nada some nas laterais).
  const usable = larguraUtilPrat();
  const chunks = [];
  let cur = [], wsum = 0;
  arr.forEach(l => {
    const w = larguraTomo(l);
    const add = (cur.length ? GAP_TOMO : 0) + w;
    if(cur.length && wsum + add > usable){ chunks.push(cur); cur = []; wsum = 0; }
    cur.push(l);
    wsum += (cur.length > 1 ? GAP_TOMO : 0) + w;
  });
  if(cur.length) chunks.push(cur);

  const midPos = comCentro ? Math.floor(chunks.length / 2) : -1;
  let n = 0;
  const off = () => (n++ % 2 === 0 ? 'off-l' : 'off-r');

  chunks.forEach((c, i) => {
    if(i === midPos) caseDesktop.appendChild(fazPratCentro(centro, off()));
    caseDesktop.appendChild(fazPrat(c, off()));
  });
  if(comCentro && midPos >= chunks.length) caseDesktop.appendChild(fazPratCentro(centro, off()));

  const pes = document.createElement('div');
  pes.className = 'pes'; pes.innerHTML = '<span></span><span></span>';
  caseDesktop.appendChild(pes);
}

/* ---------- grade de capas (celular) ---------- */
function montarGrid(livros){
  gridMobile.innerHTML = '';
  if(ioCapas) ioCapas.disconnect();
  ioCapas = new IntersectionObserver((entradas) => {
    entradas.forEach(en => {
      if(en.isIntersecting){
        prepararCapa(en.target._livro);
        ioCapas.unobserve(en.target);
      }
    });
  }, { root: null, rootMargin: '400px 0px' });

  livros.forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'livro-capa';
    btn.title = l.titulo;
    btn.setAttribute('aria-label', l.titulo);
    btn.innerHTML = '<div class="capa"><img alt="" loading="lazy"></div>';
    const img = btn.querySelector('img');
    if(l.capa) img.src = l.capa;
    else if(l.thumb) img.src = l.thumb;
    btn.onclick = () => abrirLivro(l);
    btn._livro = l;
    gridMobile.appendChild(btn);
    l.nodes.push(btn);
    l.imgs.push(img);
    if(!l.capa && !l.thumb) ioCapas.observe(btn);
  });
}

function hash(s){
  let h = 0; for(let i = 0; i < s.length; i++){ h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/* ---------- busca / filtro (reempacota a estante) ---------- */
function aplicarFiltro(q){
  // ignora maiusculas/minusculas e acentos; casa por palavras em qualquer ordem
  const termos = normalizar((q || '').trim()).split(/\s+/).filter(Boolean);
  const filtrados = termos.length
    ? todosLivros.filter(l => termos.every(t => l._busca.includes(t)))
    : todosLivros;
  todosLivros.forEach(l => { l.nodes = []; l.imgs = []; });
  montarCase(filtrados, termos.length === 0);
  montarGrid(filtrados);
  filtrados.forEach(l => { if(l.capa) l.imgs.forEach(im => { im.src = l.capa; }); });
  semResultado.hidden = !(termos.length && filtrados.length === 0);
}

let buscaTimer;
$('busca').addEventListener('input', (e) => {
  const v = e.target.value;
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(() => aplicarFiltro(v), 120);
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if(leitor.hidden && todosLivros.length) aplicarFiltro($('busca').value);
  }, 200);
});

/* ---------- chip "continuar leitura" ---------- */
function caixaResumo(){
  let box = $('resumo');
  if(!box){
    box = document.createElement('div');
    box.id = 'resumo'; box.className = 'resumo'; box.hidden = true;
    const busca = document.querySelector('.busca');
    if(busca && busca.parentNode) busca.parentNode.insertBefore(box, busca.nextSibling);
    else { const c = document.querySelector('.conteudo'); if(c) c.appendChild(box); }
  }
  return box;
}
function montarResumo(){
  const chaveUlt = lsGet(LS_ULT);
  const box = caixaResumo();
  if(!box) return;
  const livro = chaveUlt && todosLivros.find(l => chaveLivro(l) === chaveUlt);
  const pg = livro ? parseInt(lsGet(LS_POS + chaveUlt) || '1', 10) : 0;
  if(!livro || pg <= 1){ box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'continuar';
  btn.innerHTML = '<span class="cont-label">Continuar</span>' +
    '<b></b><span class="cont-pg">p. ' + pg + '</span>';
  btn.querySelector('b').textContent = livro.titulo;
  btn.onclick = () => abrirLivro(livro);
  box.appendChild(btn);
}

/* ---------- capas (fila com concorrencia limitada) ---------- */
const fila = []; let ativos = 0;
function enfileirarCapa(livro){ fila.push(livro); bombear(); }
function bombear(){
  while(ativos < CAP_CONC && fila.length){
    const l = fila.shift(); ativos++;
    renderPagina1(l).finally(() => { ativos--; bombear(); });
  }
}
function aplicarCapa(livro){
  if(!livro.capa) return;
  livro.imgs.forEach(im => { im.src = livro.capa; });
}
async function prepararCapa(livro){
  if(livro.capa) return aplicarCapa(livro);
  if(livro.thumb){ livro.capa = livro.thumb; return aplicarCapa(livro); }
  enfileirarCapa(livro);
}
async function renderPagina1(livro){
  if(livro.capa) return aplicarCapa(livro);
  try{
    const doc = await pdfjsLib.getDocument(livro.url).promise;
    livro.capa = await paginaParaImagem(doc, 1, CAPA_W);
    lsSet(LS_CAPA + chaveLivro(livro), livro.capa);
    aplicarCapa(livro);
  }catch(e){ /* mantem o fundo colorido */ }
}

/* ==================== RENDERIZACAO DE PAGINA ==================== */
async function paginaParaImagem(doc, num, largura){
  const page = await doc.getPage(num);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const escala = (largura / base.width) * ratio;
  const vp = page.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas.toDataURL('image/jpeg', 0.82);
}

/* ==================== ZOOM ==================== */
const ZOOM_MIN = 1, ZOOM_MAX = 2.6;
let zoom = 1;
const palco = $('palco'), bookEl = $('book');
function aplicarZoom(novo){
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo));
  bookEl.style.transform = `scale(${zoom})`;
  agendarNitido();
}
palco.addEventListener('wheel', (e) => {
  if(!e.ctrlKey) return;
  e.preventDefault();
  aplicarZoom(zoom - e.deltaY * 0.0025);
}, { passive: false });
let pinchDist0 = null, zoom0 = 1;
function distancia(t){
  const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}
palco.addEventListener('touchstart', (e) => {
  if(e.touches.length === 2){ pinchDist0 = distancia(e.touches); zoom0 = zoom; }
}, { passive: true });
palco.addEventListener('touchmove', (e) => {
  if(e.touches.length === 2 && pinchDist0){
    e.preventDefault();
    aplicarZoom(zoom0 * (distancia(e.touches) / pinchDist0));
  }
}, { passive: false });
palco.addEventListener('touchend', () => { pinchDist0 = null; });
bookEl.addEventListener('dblclick', () => aplicarZoom(1));
function resetarZoom(){ zoom = 1; bookEl.style.transform = 'scale(1)'; }

/* re-renderiza a pagina visivel em alta resolucao quando ha zoom (nitidez) */
let nitidoTimer;
function agendarNitido(){
  clearTimeout(nitidoTimer);
  nitidoTimer = setTimeout(renderNitido, 260);
}
async function renderNitido(){
  if(!pdf || zoom <= 1.05) return;
  const largura = Math.min(RENDER_MAX, Math.round(RENDER_W * zoom));
  if(solo){
    const el = $('imgSolo' + soloFrente);
    const url = await paginaAlta(atual, largura);
    if(url) el.src = url;
  } else {
    const s = spreadDe(atual);
    const l = leftNum(s), r = rightNum(s);
    if(l){ const u = await paginaAlta(l, largura); if(u) $('imgLeft').src = u; }
    if(r){ const u = await paginaAlta(r, largura); if(u) $('imgRight').src = u; }
  }
}
async function paginaAlta(num, largura){
  if(num == null || num < 1 || num > P) return '';
  try{ return await paginaParaImagem(pdf, num, largura); }catch(e){ return ''; }
}

/* ==================== LEITOR / FOLHEAR ==================== */
let pdf = null, P = 0, atual = 1, maxSpread = 0, ocupado = false, abrirId = 0;
let livroAtual = null;
const cache = new Map();

async function pag(num){
  if(num == null || num < 1 || num > P) return '';
  if(cache.has(num)){ const u = cache.get(num); cache.delete(num); cache.set(num, u); return u; }
  const url = await paginaParaImagem(pdf, num, RENDER_W);
  cache.set(num, url);
  if(cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return url;
}

const spreadDe = (p) => Math.floor(p / 2);
const leftNum  = (s) => (s === 0 ? null : 2 * s);
const rightNum = (s) => (2 * s + 1 <= P ? 2 * s + 1 : null);

async function abrirLivro(livro){
  const id = ++abrirId;
  livroAtual = livro;
  estante.hidden = true; leitor.hidden = false;
  $('tituloLivro').textContent = livro.titulo;
  const load = $('carregando');
  load.textContent = 'carregando paginas…'; load.hidden = false;
  cache.clear(); ocupado = false;
  resetarZoom(); resetarSolo();

  let doc;
  try{ doc = await pdfjsLib.getDocument(livro.url).promise; }
  catch(e){
    console.error(e);
    if(id !== abrirId) return;
    load.textContent = 'nao consegui abrir este livro';
    setTimeout(() => { load.hidden = true; voltarEstante(); }, 1800);
    return;
  }
  if(id !== abrirId) return;

  pdf = doc; P = pdf.numPages; maxSpread = Math.floor(P / 2);

  const salvo = parseInt(lsGet(LS_POS + chaveLivro(livro)) || '1', 10);
  atual = (salvo >= 1 && salvo <= P) ? salvo : 1;
  lsSet(LS_ULT, chaveLivro(livro));

  solo ? await mostrarSolo(false) : await mostrarSpread();
  load.hidden = true;
  preload();
}

function salvarPos(){
  if(livroAtual) lsSet(LS_POS + chaveLivro(livroAtual), String(atual));
}

/* uma pagina (celular) — crossfade entre duas imagens */
let soloFrente = 'A';
function resetarSolo(){
  ['A', 'B'].forEach(k => {
    const el = $('imgSolo' + k);
    el.style.opacity = '0'; el.style.transform = 'none'; el.style.zIndex = ''; el.removeAttribute('src');
  });
  soloFrente = 'A';
}
async function mostrarSolo(animar, dir = 1){
  const sai = $('imgSolo' + soloFrente);
  const entraKey = soloFrente === 'A' ? 'B' : 'A';
  const entra = $('imgSolo' + entraKey);
  entra.src = await pag(atual);
  try{ await entra.decode(); }catch(e){}
  entra.style.zIndex = 2; sai.style.zIndex = 1;
  entra.style.transition = 'none'; entra.style.opacity = '0';
  entra.style.transform = animar ? `translateX(${dir > 0 ? 26 : -26}px)` : 'none';
  void entra.offsetWidth;
  entra.style.transition = ''; entra.style.opacity = '1'; entra.style.transform = 'translateX(0)';
  sai.style.opacity = '0';
  soloFrente = entraKey;
  atualizarContador(); salvarPos();
}

/* duas paginas (desktop) */
async function mostrarSpread(){
  const s = spreadDe(atual);
  $('imgLeft').src  = await pag(leftNum(s));
  $('imgRight').src = await pag(rightNum(s));
  atualizarContador(); salvarPos();
}

/* ---------- contador clicavel (pular pra pagina) ---------- */
function atualizarContador(){
  const c = $('contador');
  if(solo){
    c.textContent = atual === 1 ? 'capa' : `p. ${atual} / ${P}`;
    $('prev').disabled = atual <= 1; $('next').disabled = atual >= P; return;
  }
  const s = spreadDe(atual);
  c.textContent = s === 0 ? 'capa' : `p. ${leftNum(s)}–${rightNum(s) || leftNum(s)}`;
  $('prev').disabled = s === 0; $('next').disabled = s >= maxSpread;
}

function abrirCampoPagina(){
  if(!pdf) return;
  const c = $('contador');
  if(c.querySelector('input')) return;
  c.innerHTML = '';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '1'; inp.max = String(P);
  inp.value = String(atual); inp.className = 'campo-pagina';
  inp.setAttribute('aria-label', 'Ir para a pagina');
  c.appendChild(inp);
  inp.focus(); inp.select();
  const ir = () => { const n = parseInt(inp.value, 10); irParaPagina(n); };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if(e.key === 'Enter'){ e.preventDefault(); ir(); }
    if(e.key === 'Escape'){ atualizarContador(); }
  });
  inp.addEventListener('blur', () => { atualizarContador(); });
}
async function irParaPagina(n){
  if(!pdf || isNaN(n)){ atualizarContador(); return; }
  atual = Math.min(P, Math.max(1, n));
  resetarZoom();
  solo ? await mostrarSolo(false) : await mostrarSpread();
  preload();
}

function preload(){
  let nums;
  if(solo){ nums = [atual + 1, atual + 2, atual - 1]; }
  else { const s = spreadDe(atual);
    nums = [leftNum(s + 1), rightNum(s + 1), leftNum(s - 1), rightNum(s - 1)]; }
  nums.forEach(n => { if(n && n >= 1 && n <= P) pag(n); });
}

async function virar(dir){
  if(ocupado || !pdf) return;
  if(zoom > 1.05) resetarZoom();

  if(solo){
    const alvo = atual + dir;
    if(alvo < 1 || alvo > P) return;
    ocupado = true; atual = alvo;
    await mostrarSolo(true, dir);
    setTimeout(() => { ocupado = false; preload(); }, 150);
    return;
  }

  const s = spreadDe(atual);
  if(dir > 0 && s >= maxSpread) return;
  if(dir < 0 && s <= 0) return;
  ocupado = true;

  const flip = $('flipper'), front = $('imgFront'), back = $('imgBack');
  if(dir > 0){
    front.src = await pag(rightNum(s));
    back.src  = await pag(leftNum(s + 1));
    $('imgRight').src = await pag(rightNum(s + 1));
    flip.style.transition = 'none'; flip.style.transform = 'rotateY(0deg)'; flip.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flip.style.transition = ''; flip.style.transform = 'rotateY(-180deg)'; }));
  } else {
    front.src = await pag(rightNum(s - 1));
    back.src  = await pag(leftNum(s));
    $('imgLeft').src = await pag(leftNum(s - 1));
    flip.style.transition = 'none'; flip.style.transform = 'rotateY(-180deg)'; flip.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flip.style.transition = ''; flip.style.transform = 'rotateY(0deg)'; }));
  }

  setTimeout(async () => {
    const ns = s + dir;
    atual = ns === 0 ? 1 : 2 * ns;
    await mostrarSpread();
    requestAnimationFrame(() => { flip.classList.remove('on'); ocupado = false; preload(); });
  }, FLIP_MS + 10);
}

function voltarEstante(){
  abrirId++;
  salvarPos();
  leitor.hidden = true; estante.hidden = false;
  pdf = null; P = 0; cache.clear();
  resetarZoom(); resetarSolo();
  montarResumo();
}

/* ==================== EVENTOS ==================== */
$('next').onclick = () => virar(1);
$('prev').onclick = () => virar(-1);
$('voltar').onclick = voltarEstante;
$('contador').addEventListener('click', abrirCampoPagina);
$('book').addEventListener('click', (e) => {
  if(zoom > 1.05) return;
  const r = e.currentTarget.getBoundingClientRect();
  const limite = r.left + r.width * (solo ? 0.35 : 0.5);
  (e.clientX < limite) ? virar(-1) : virar(1);
});
document.addEventListener('keydown', (e) => {
  if(leitor.hidden) return;
  if(e.key === 'Escape'){ fecharPainelLivros(); return; }
  if(e.target && e.target.tagName === 'INPUT') return;
  if(e.key === 'ArrowRight' || e.key === ' '){ e.preventDefault(); virar(1); }
  if(e.key === 'ArrowLeft'){ e.preventDefault(); virar(-1); }
});

/* ==================== PAINEL LATERAL "LIVROS" ==================== */
function construirPainelLivros(){
  if($('btnLivros')) return;
  const btn = document.createElement('button');
  btn.id = 'btnLivros'; btn.className = 'btn-livros'; btn.type = 'button';
  btn.textContent = 'Livros'; btn.setAttribute('aria-label', 'Lista de livros');
  const back = document.createElement('div'); back.id = 'backLivros'; back.className = 'backdrop';
  const dr = document.createElement('aside'); dr.id = 'drawerLivros'; dr.className = 'drawer';
  dr.innerHTML = '<h3>Meus livros<button class="fechar" aria-label="Fechar">&times;</button></h3>' +
                 '<div class="lista"></div>';
  document.body.appendChild(back); document.body.appendChild(dr); document.body.appendChild(btn);
  const abrir = () => { preencherListaLivros(); dr.classList.add('aberto'); back.classList.add('on'); };
  btn.onclick = abrir;
  back.onclick = fecharPainelLivros;
  dr.querySelector('.fechar').onclick = fecharPainelLivros;
}
function fecharPainelLivros(){
  const dr = $('drawerLivros'), back = $('backLivros');
  if(dr) dr.classList.remove('aberto');
  if(back) back.classList.remove('on');
}
function preencherListaLivros(){
  const lista = $('drawerLivros').querySelector('.lista');
  lista.innerHTML = '';
  todosLivros.forEach(l => {
    const pg = parseInt(lsGet(LS_POS + chaveLivro(l)) || '0', 10);
    const temPg = pg > 1;
    const it = document.createElement('button');
    it.className = 'item'; it.type = 'button';
    it.innerHTML = '<span class="nome"></span>' +
      '<span class="pg' + (temPg ? '' : ' zero') + '">' + (temPg ? ('p. ' + pg) : '—') + '</span>';
    it.querySelector('.nome').textContent = l.titulo;
    if(livroAtual && chaveLivro(l) === chaveLivro(livroAtual)) it.style.background = 'rgba(201,111,46,.18)';
    it.onclick = () => { fecharPainelLivros(); abrirLivro(l); };
    lista.appendChild(it);
  });
}

construirPainelLivros();
iniciar();
