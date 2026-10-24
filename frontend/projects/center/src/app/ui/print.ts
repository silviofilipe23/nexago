/**
 * "Baixar PDF" do contrato: imprime SÓ a folha. Uma cópia dela vai pro `<body>` (fora do shell)
 * e o CSS de impressão (`styles.scss`, `.ct-print-root`) esconde todo o resto; o navegador
 * oferece "Salvar como PDF". O título da aba vira o nome sugerido do arquivo.
 */
export function printSheet(sheet: HTMLElement, fileTitle = ''): void {
  const body = document.body;
  const root = document.createElement('div');
  root.className = 'ct-print-root';
  root.appendChild(sheet.cloneNode(true));
  body.appendChild(root);
  body.classList.add('ct-printing');
  const previousTitle = document.title;
  if (fileTitle) {
    document.title = fileTitle;
  }
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener('afterprint', cleanup);
    root.remove();
    body.classList.remove('ct-printing');
    document.title = previousTitle;
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
