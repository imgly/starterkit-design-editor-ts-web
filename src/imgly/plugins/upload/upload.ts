/**
 * Pre-editor upload screen.
 *
 * Shown after the API key is verified and before the CE.SDK editor mounts.
 * The user drops or picks an image; clicking "Continue to editor" invokes
 * `opts.onContinue(file)`. The screen styles itself to its container, so
 * passing `#cesdk_container` is fine.
 */

import './upload.css';

export interface RenderUploadScreenOpts {
  onContinue: (file: File) => void;
}

export function renderUploadScreen(
  root: HTMLElement,
  opts: RenderUploadScreenOpts
): void {
  root.innerHTML = '';

  const container = el('div', 'tr-up-container');
  const card = el('div', 'tr-up-card');
  container.appendChild(card);
  root.appendChild(container);

  card.appendChild(badge('Step 1 of 2'));
  card.appendChild(title('Pick an image to translate'));

  const lead = el('p', 'tr-up-lead');
  lead.textContent =
    'Upload a photo that contains text. The editor will open with it ' +
    'loaded and the Translate panel ready.';
  card.appendChild(lead);

  // File picker (hidden; triggered by clicks on the drop zone).
  const fileInput = el('input') as HTMLInputElement;
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  card.appendChild(fileInput);

  // Drop zone container — toggles between idle and preview state in place.
  const dropZone = el('button', 'tr-up-dropzone') as HTMLButtonElement;
  dropZone.type = 'button';
  card.appendChild(dropZone);

  // Inline error message (only shown for non-image drops).
  const errorMessage = el('p', 'tr-up-error');
  errorMessage.hidden = true;
  card.appendChild(errorMessage);

  // Continue button.
  const continueBtn = el(
    'button',
    'tr-up-button tr-up-button--primary'
  ) as HTMLButtonElement;
  continueBtn.type = 'button';
  continueBtn.textContent = 'Continue to editor';
  continueBtn.disabled = true;
  card.appendChild(continueBtn);

  // ---- State -------------------------------------------------------------

  let selectedFile: File | null = null;
  let previewURL: string | null = null;

  function setSelected(file: File): void {
    if (previewURL) URL.revokeObjectURL(previewURL);
    selectedFile = file;
    previewURL = URL.createObjectURL(file);
    errorMessage.hidden = true;
    renderPreview();
    continueBtn.disabled = false;
  }

  function showError(message: string): void {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }

  // ---- Drop zone renderers ----------------------------------------------

  function renderIdle(): void {
    dropZone.innerHTML = '';
    dropZone.classList.remove('tr-up-dropzone--has-preview');
    const icon = el('span', 'tr-up-dropzone-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⬆';
    const text = el('span', 'tr-up-dropzone-text');
    text.textContent = 'Drop image or click to browse';
    dropZone.appendChild(icon);
    dropZone.appendChild(text);
  }

  function renderPreview(): void {
    if (!selectedFile || !previewURL) return;
    dropZone.innerHTML = '';
    dropZone.classList.add('tr-up-dropzone--has-preview');
    const img = el('img', 'tr-up-preview') as HTMLImageElement;
    img.src = previewURL;
    img.alt = selectedFile.name;
    const meta = el('div', 'tr-up-preview-meta');
    const name = el('span', 'tr-up-preview-name');
    name.textContent = selectedFile.name;
    const change = el('span', 'tr-up-preview-change');
    change.textContent = 'Change';
    meta.appendChild(name);
    meta.appendChild(change);
    dropZone.appendChild(img);
    dropZone.appendChild(meta);
  }

  // ---- Wiring ------------------------------------------------------------

  function pickFile(file: File | null | undefined): void {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Pick an image file (PNG, JPG, …).');
      return;
    }
    setSelected(file);
  }

  dropZone.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    pickFile(fileInput.files?.[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('tr-up-dropzone--hover');
  });
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('tr-up-dropzone--hover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('tr-up-dropzone--hover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('tr-up-dropzone--hover');
    pickFile(e.dataTransfer?.files?.[0]);
  });

  continueBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    // Don't revoke previewURL here — the editor still needs to read the
    // bytes; the next renderUploadScreen call clears via root.innerHTML.
    opts.onContinue(selectedFile);
  });

  // Initial state.
  renderIdle();
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function badge(content: string): HTMLElement {
  const span = el('span', 'tr-up-badge');
  span.textContent = content;
  return span;
}

function title(content: string): HTMLElement {
  const div = el('div', 'tr-up-title');
  div.setAttribute('role', 'heading');
  div.setAttribute('aria-level', '2');
  div.textContent = content;
  return div;
}
