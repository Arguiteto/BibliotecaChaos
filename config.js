/* ====================================================================
   CONFIGURAÇÃO — preencha o campo abaixo (só uma vez)
   ====================================================================

   WORKER_URL → o endereço do seu Cloudflare Worker (proxy do Drive).
   Depois de publicar o Worker, cole aqui a URL que a Cloudflare gerou,
   algo como: https://biblioteca-drive.SEUUSUARIO.workers.dev

   A API Key e o ID da pasta do Drive NÃO ficam mais aqui — foram
   movidos pras variáveis de ambiente do Worker (DRIVE_API_KEY e
   DRIVE_FOLDER_ID), pra não ficarem expostos no repositório público.

   Enquanto WORKER_URL estiver vazio, o site usa os PDFs locais da
   pasta Livros/ (livros.json).
   ==================================================================== */

const CONFIG = {
  WORKER_URL: "https://biblioteca-drive.carlos-arquitetocg.workers.dev"
};
