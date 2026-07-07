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
const estante = $('estante'), leitor = $('leitor');
const caseDesktop = $('caseDesktop'), gridMobile = $('gridMobile');
const estanteVazia = $('estanteVazia'), semResultado = $('semResultado');

const RENDER_W  = 1300;  // largura de renderizacao de pagina no leitor (px)
const CAPA_W    = 340;   // largura da capa (miniatura da 1a pagina)
const FLIP_MS   = 600;   // duracao da virada 3D — combine com o CSS
const CACHE_MAX = 40;    // paginas guardadas em memoria no leitor
const PERFILEIRA = 9;    // livros por prateleira na estante desktop
const CAP_CONC  = 3;     // capas renderizadas em paralelo

const usaDrive = typeof CONFIG !== 'undefined' && CONFIG.WORKER_URL;

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

/* ==================== ESTANTE ==================== */
let todosLivros = [];

async function iniciar(){
  let lista = [];
  try{ lista = usaDrive ? await listarDoDrive() : await listarLocal(); }
  catch(e){ console.error(e); lista = []; }

  todosLivros = lista;
  if(!lista.length){ estanteVazia.hidden = false; return; }

  lista.forEach((l, i) => {
    l._pal   = PAL[i % PAL.length];
    l._busca = normalizar(l.titulo);
    l.nodes  = [];   // botoes (lombada + capa da grade) — pra busca
    l.imgs   = [];   // <img> de capa — pra preencher quando renderizar
    l.capa   = null; // dataURL / thumb da 1a pagina
  });

  montarCase(todosLivros);
  montarGrid(todosLivros);

  // renderiza as capas com concorrencia limitada
  todosLivros.forEach(enfileirarCapa);
}

function normalizar(t){
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* "Casas-Estranhas-_Uketsu_.pdf" -> "Casas Estranhas Uketsu" */
function tituloDoArquivo(nome){
  return nome.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function listarDoDrive(){
  const r = await fetch(`${CONFIG.WORKER_URL}/list`);
  if(!r.ok) throw new Error('Worker /list ' + r.status);
  const d = await r.json();
  return (d.files || []).map(f => ({
    titulo: tituloDoArquivo(f.name),
    autor: '',
    url: `${CONFIG.WORKER_URL}/file/${f.id}`,
    thumb: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s400') : null
  }));
}

async function listarLocal(){
  const r = await fetch('livros.json?v=' + Date.now());
  const arr = await r.json();
  return arr.map(item => {
    const arquivo = typeof item === 'string' ? item : item.arquivo;
    if(!arquivo) return null; // entrada so de catalogo (sem "arquivo") e ignorada
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

function criaTomo(livro){
  const p = livro._pal;
  const h = 176 + ((hash(livro.titulo) % 58));   // altura estavel por titulo
  const w = 30 + ((hash(livro.titulo + 'w') % 16));
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

function montarCase(livros){
  caseDesktop.innerHTML = '';
  if(!livros.length) return;
  const arr = livros.slice();

  // separa ate 4 livros pro nicho central (pegos do meio do acervo)
  const nCentro = Math.min(4, arr.length);
  const ini = Math.max(0, Math.floor((arr.length - nCentro) / 2));
  const centro = arr.splice(ini, nCentro);

  // resto em fileiras de PERFILEIRA
  const chunks = [];
  for(let i = 0; i < arr.length; i += PERFILEIRA) chunks.push(arr.slice(i, i + PERFILEIRA));

  const midPos = Math.floor(chunks.length / 2);
  let n = 0;
  const off = () => (n++ % 2 === 0 ? 'off-l' : 'off-r');

  chunks.forEach((c, i) => {
    if(i === midPos) caseDesktop.appendChild(fazPratCentro(centro, off()));
    caseDesktop.appendChild(fazPrat(c, off()));
  });
  if(midPos >= chunks.length) caseDesktop.appendChild(fazPratCentro(centro, off()));

  const pes = document.createElement('div');
  pes.className = 'pes'; pes.innerHTML = '<span></span><span></span>';
  caseDesktop.appendChild(pes);
}

/* ---------- grade de capas (celular) ---------- */
function montarGrid(livros){
  gridMobile.innerHTML = '';
  livros.forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'livro-capa';
    btn.title = l.titulo;
    btn.setAttribute('aria-label', l.titulo);
    btn.innerHTML = '<div class="capa"><img alt=""></div>';
    const img = btn.querySelector('img');
    if(l.capa) img.src = l.capa;
    btn.onclick = () => abrirLivro(l);
    gridMobile.appendChild(btn);
    l.nodes.push(btn);
    l.imgs.push(img);
  });
}

/* pequeno hash estavel (pra altura/espessura fixas por titulo) */
function hash(s){
  let h = 0; for(let i = 0; i < s.length; i++){ h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/* ---------- busca ---------- */
$('busca').addEventListener('input', (e) => {
  const q = normalizar(e.target.value.trim());
  let visiveis = 0;
  todosLivros.forEach(l => {
    const match = !q || l._busca.includes(q);
    l.nodes.forEach(node => { node.hidden = !match; });
    if(match) visiveis++;
  });
  semResultado.hidden = !(q && visiveis === 0);
});

/* ---------- capas (fila com concorrencia limitada) ---------- */
const fila = []; let ativos = 0;
function enfileirarCapa(livro){ fila.push(livro); bombear(); }
function bombear(){
  while(ativos < CAP_CONC && fila.length){
    const l = fila.shift(); ativos++;
    prepararCapa(l).finally(() => { ativos--; bombear(); });
  }
}
function aplicarCapa(livro){
  if(!livro.capa) return;
  livro.imgs.forEach(im => {
    im.onerror = () => { // thumb do Drive falhou -> renderiza a 1a pagina
      im.onerror = null;
      if(!livro._tentouRender){ livro._tentouRender = true; livro.thumb = null; livro.capa = null;
        renderPagina1(livro); }
    };
    im.src = livro.capa;
  });
}
async function prepararCapa(livro){
  if(livro.capa) return aplicarCapa(livro);
  if(livro.thumb){ livro.capa = livro.thumb; return aplicarCapa(livro); }
  return renderPagina1(livro);
}
async function renderPagina1(livro){
  try{
    const doc = await pdfjsLib.getDocument(livro.url).promise;
    livro.capa = await paginaParaImagem(doc, 1, CAPA_W);
    aplicarCapa(livro);
  }catch(e){ /* mantem o fundo colorido da lombada/capa */ }
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
function resetarZoom(){ aplicarZoom(1); }

/* ==================== LEITOR / FOLHEAR ==================== */
let pdf = null, P = 0, atual = 1, maxSpread = 0, ocupado = false, abrirId = 0;
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
  estante.hidden = true; leitor.hidden = false;
  $('tituloLivro').textContent = livro.titulo;
  const load = $('carregando');
  load.textContent = 'carregando paginas…'; load.hidden = false;
  cache.clear(); atual = 1; ocupado = false;
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
  solo ? await mostrarSolo(false) : await mostrarSpread();
  load.hidden = true;
  preload();
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
  atualizarContador();
}

/* duas paginas (desktop) */
async function mostrarSpread(){
  const s = spreadDe(atual);
  $('imgLeft').src  = await pag(leftNum(s));
  $('imgRight').src = await pag(rightNum(s));
  atualizarContador();
}

function atualizarContador(){
  if(solo){
    $('contador').textContent = atual === 1 ? 'capa' : `p. ${atual} / ${P}`;
    $('prev').disabled = atual <= 1; $('next').disabled = atual >= P; return;
  }
  const s = spreadDe(atual);
  $('contador').textContent = s === 0 ? 'capa' : `p. ${leftNum(s)}–${rightNum(s) || leftNum(s)}`;
  $('prev').disabled = s === 0; $('next').disabled = s >= maxSpread;
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
  leitor.hidden = true; estante.hidden = false;
  pdf = null; P = 0; cache.clear();
  resetarZoom(); resetarSolo();
}

/* ==================== EVENTOS ==================== */
$('next').onclick = () => virar(1);
$('prev').onclick = () => virar(-1);
$('voltar').onclick = voltarEstante;
$('book').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const limite = r.left + r.width * (solo ? 0.35 : 0.5);
  (e.clientX < limite) ? virar(-1) : virar(1);
});
document.addEventListener('keydown', (e) => {
  if(leitor.hidden) return;
  if(e.key === 'ArrowRight' || e.key === ' '){ e.preventDefault(); virar(1); }
  if(e.key === 'ArrowLeft'){ e.preventDefault(); virar(-1); }
});

iniciar();
