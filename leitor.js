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
      ? item.titulo : tituloDoArquivo(arquivo.replace(/^
