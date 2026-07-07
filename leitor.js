/* Leitor de biblioteca — mostra PDFs como livro folheável.
   Fonte dos livros:
     • Google Drive (se CONFIG.API_KEY estiver preenchida) — lista e lê a pasta do Drive;
     • Local (senão) — usa livros.json + pasta Livros/.
   Só carrega as páginas visíveis, por isso não pesa. */

const pdfjsLib = window['pdfjsLib'];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const estante = $('estante'), leitor = $('leitor');
const prateleira = $('prateleira'), estanteVazia = $('estanteVazia');

const RENDER_W = 1300;  // largura de renderização de cada página (px)
const FLIP_MS  = 600;   // duração da virada — combine com o CSS

const usaDrive = typeof CONFIG !== 'undefined' && CONFIG.WORKER_URL;

/* ---------- Montagem da estante ---------- */
async function iniciar(){
  let lista = [];
  try {
    lista = usaDrive ? await listarDoDrive() : await listarLocal();
  } catch(e){
    console.error(e); lista = [];
  }

  if(!lista.length){ estanteVazia.hidden = false; return; }

  lista.forEach((livro) => {
    const btn = document.createElement('button');
    btn.className = 'livro-capa';
    btn.innerHTML = `<div class="capa"></div><div class="nome">${livro.titulo}</div>`;
    btn.onclick = () => abrirLivro(livro);
    prateleira.appendChild(btn);
    montarCapa(livro, btn.querySelector('.capa'));
  });
}

/* Cada livro = { titulo, url, thumb? } */
async function listarDoDrive(){
  const r = await fetch(`${CONFIG.WORKER_URL}/list`);
  if(!r.ok) throw new Error('Worker /list ' + r.status);
  const d = await r.json();
  return (d.files || []).map(f => ({
    titulo: f.name.replace(/\.pdf$/i, ''),
    url: `${CONFIG.WORKER_URL}/file/${f.id}`,
    thumb: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s400') : null
  }));
}

async function listarLocal(){
  const r = await fetch('livros.json?v=' + Date.now());
  const arr = await r.json();
  return arr.map(item => {
    const arquivo = typeof item === 'string' ? item : item.arquivo;
    const titulo = (typeof item === 'object' && item.titulo)
      ? item.titulo : arquivo.replace(/^Livros\//,'').replace(/\.pdf$/i,'');
    return { titulo, url: encodeURI(arquivo), thumb: null };
  });
}

async function montarCapa(livro, alvo){
  // 1) miniatura do Drive (barata, não baixa o PDF inteiro)
  if(livro.thumb){
    const img = new Image();
    img.onload = () => alvo.appendChild(img);
    img.onerror = () => renderCapaPdf(livro, alvo);
    img.src = livro.thumb;
    return;
  }
  // 2) senão, renderiza a 1ª página do PDF
  renderCapaPdf(livro, alvo);
}

async function renderCapaPdf(livro, alvo){
  try{
    const doc = await pdfjsLib.getDocument(livro.url).promise;
    const url = await paginaParaImagem(doc, 1, 320);
    const img = new Image(); img.src = url; alvo.appendChild(img);
  }catch(e){ /* mantém o lombo escuro */ }
}

/* ---------- Renderização de página ---------- */
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

/* ---------- Leitor / folhear ---------- */
let pdf = null, P = 0, spread = 0, maxSpread = 0, ocupado = false;
const cache = new Map();

async function pag(num){
  if(num == null || num < 1 || num > P) return '';
  if(cache.has(num)) return cache.get(num);
  const url = await paginaParaImagem(pdf, num, RENDER_W);
  cache.set(num, url);
  return url;
}

const leftNum  = (s) => (s === 0 ? null : 2 * s);
const rightNum = (s) => (2 * s + 1 <= P ? 2 * s + 1 : null);

async function abrirLivro(livro){
  estante.hidden = true; leitor.hidden = false;
  $('tituloLivro').textContent = livro.titulo;
  $('carregando').hidden = false;
  cache.clear(); spread = 0;

  pdf = await pdfjsLib.getDocument(livro.url).promise;
  P = pdf.numPages;
  maxSpread = Math.floor(P / 2);

  await mostrarSpread();
  $('carregando').hidden = true;
  preload();
}

async function mostrarSpread(){
  $('imgLeft').src  = await pag(leftNum(spread));
  $('imgRight').src = await pag(rightNum(spread));
  atualizarContador();
}

function atualizarContador(){
  $('contador').textContent = spread === 0
    ? 'capa'
    : `p. ${leftNum(spread)}–${rightNum(spread) || leftNum(spread)}`;
  $('prev').disabled = spread === 0;
  $('next').disabled = spread >= maxSpread;
}

function preload(){
  [leftNum(spread+1), rightNum(spread+1), leftNum(spread-1), rightNum(spread-1)]
    .forEach(n => { if(n) pag(n); });
}

async function virar(dir){
  if(ocupado) return;
  if(dir > 0 && spread >= maxSpread) return;
  if(dir < 0 && spread <= 0) return;
  ocupado = true;

  const flip = $('flipper');
  const front = $('imgFront'), back = $('imgBack');

  if(dir > 0){
    front.src = await pag(rightNum(spread));            // página que levanta
    back.src  = await pag(leftNum(spread + 1));         // dorso = próxima esquerda
    $('imgRight').src = await pag(rightNum(spread + 1)); // revela a nova direita por trás
    flip.style.transition = 'none';
    flip.style.transform = 'rotateY(0deg)';
    flip.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flip.style.transition = '';
      flip.style.transform = 'rotateY(-180deg)';
    }));
  } else {
    front.src = await pag(rightNum(spread - 1));        // ficará à direita
    back.src  = await pag(leftNum(spread));             // página atual (recuando)
    $('imgLeft').src = await pag(leftNum(spread - 1));  // revela a nova esquerda por trás
    flip.style.transition = 'none';
    flip.style.transform = 'rotateY(-180deg)';
    flip.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flip.style.transition = '';
      flip.style.transform = 'rotateY(0deg)';
    }));
  }

  setTimeout(async () => {
    spread += dir;
    await mostrarSpread();
    requestAnimationFrame(() => {
      flip.classList.remove('on');
      ocupado = false;
      preload();
    });
  }, FLIP_MS + 10);
}

function voltarEstante(){
  leitor.hidden = true; estante.hidden = false;
  pdf = null; cache.clear();
}

/* ---------- Eventos ---------- */
$('next').onclick = () => virar(1);
$('prev').onclick = () => virar(-1);
$('voltar').onclick = voltarEstante;
$('book').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  (e.clientX < r.left + r.width / 2) ? virar(-1) : virar(1);
});
document.addEventListener('keydown', (e) => {
  if(leitor.hidden) return;
  if(e.key === 'ArrowRight' || e.key === ' '){ e.preventDefault(); virar(1); }
  if(e.key === 'ArrowLeft'){ e.preventDefault(); virar(-1); }
});

iniciar();
