# Biblioteca — leitor de livros

Site estático que lê arquivos **.pdf** e mostra cada livro como um livro folheável,
num corredor de biblioteca. As páginas viram com as **setas do teclado** (← →) ou
clicando nas laterais. Só carrega as páginas visíveis, então não pesa.

## Como publicar no GitHub Pages (uma vez)

1. Crie um repositório novo no GitHub (ex.: `biblioteca`).
2. Suba todos os arquivos desta pasta para o repositório.
3. No repositório, vá em **Settings → Pages**.
4. Em **Build and deployment → Source**, escolha **Deploy from a branch**,
   branch **main** e pasta **/ (root)**. Salve.
5. Aguarde ~1 minuto. O site fica no ar em:
   `https://SEU-USUARIO.github.io/biblioteca/`

## Como adicionar livros

1. Coloque o arquivo **.pdf** dentro da pasta **`Livros/`**.
2. Registre o livro em **`livros.json`** (uma entrada por livro):

   ```json
   [
     { "arquivo": "Livros/Neufert.pdf", "titulo": "Neufert — Arte de Projetar" },
     { "arquivo": "Livros/Outro-Livro.pdf", "titulo": "Outro Livro" }
   ]
   ```

   > **Automação opcional:** o repositório já vem com uma rotina em
   > `.github/workflows/atualizar-lista.yml` que regenera o `livros.json`
   > sozinha sempre que você adiciona um PDF na pasta `Livros/`.
   > Para ativar: em **Settings → Actions → General → Workflow permissions**,
   > marque **Read and write permissions**. Depois é só arrastar os PDFs.

## Importante — limite de tamanho

O GitHub **não aceita** arquivos maiores que **100 MB**. Livros escaneados podem
passar disso. Se um PDF for muito grande, comprima antes de subir (por exemplo em
iLovePDF, Adobe, ou pela ferramenta que preferir). Repositórios acima de ~1 GB no
total também não são recomendados.

## Estrutura

```
index.html      página (estante + leitor)
estilo.css      aparência (cenário, livro, animação)
leitor.js       lógica (pdf.js, folhear, cache de páginas)
livros.json     lista de livros exibidos
Livros/         seus arquivos .pdf
.github/        automação opcional da lista
```
