/**
 * Onboarding screen shown in place of the editor when no IMG.LY API key
 * is configured. Vanilla TS port of the React `OnboardingScreen`
 * shipped with @imgly/starterkit-ai-editor-react-web.
 *
 * Variants (picked at render time):
 *
 *   - `import.meta.env.PROD` — a deployed bundle (the visitor can't
 *     edit `.env`). We show an input field that writes the pasted key
 *     to `localStorage` via `setUserApiKey`, then reloads.
 *
 *   - Dev (`vite dev`) — the developer ran `npm run dev` without
 *     filling in `.env`. We show a 3-step walkthrough pointing at the
 *     dashboard and the `.env` file.
 */

import {
  clearUserApiKey,
  getUserApiKey,
  setUserApiKey
} from './credentials';
import './onboarding.css';

const DASHBOARD_URL = 'https://img.ly/dashboard';
const GATEWAY_DOCS_URL =
  'https://img.ly/docs/cesdk/js/user-interface/ai-integration/gateway-provider-06df22/';

const ENV_SNIPPET = `# .env (project root)
VITE_AI_API_KEY=sk_your_api_key_here`;

export type OnboardingReason = 'missing' | 'invalid';

export interface RenderOnboardingScreenOpts {
  reason: OnboardingReason;
}

/**
 * Replace the contents of `root` with the onboarding screen.
 * The screen sizes to its container, so passing the same DOM node
 * the editor would have used (e.g. `#cesdk_container`) is fine.
 */
export function renderOnboardingScreen(
  root: HTMLElement,
  opts: RenderOnboardingScreenOpts
): void {
  root.innerHTML = '';

  const container = el('div', 'tr-ob-container');
  const card = el('div', 'tr-ob-card');
  container.appendChild(card);
  root.appendChild(container);

  if (import.meta.env.PROD) {
    renderDeployedCard(card, opts.reason);
  } else {
    renderDevCard(card, opts.reason);
  }
}

// ---------------------------------------------------------------------------
// Dev variant: `.env` walkthrough
// ---------------------------------------------------------------------------

function renderDevCard(card: HTMLElement, reason: OnboardingReason): void {
  const isMissing = reason === 'missing';

  card.appendChild(badge(isMissing));
  card.appendChild(
    titleEl(
      isMissing
        ? 'Set up your IMG.LY API key'
        : 'Your API key was rejected'
    )
  );

  const lead = el('p', 'tr-ob-lead');
  if (isMissing) {
    lead.textContent =
      'This demo routes every translation through the IMG.LY AI Gateway. ' +
      'To unlock the gateway and the catalog of supported models, you need ' +
      'an API key.';
  } else {
    lead.append(
      text('The gateway rejected the value in '),
      codeEl('VITE_AI_API_KEY'),
      text(
        '. The most likely cause is that the placeholder in .env was never ' +
          'replaced with a real key. Less commonly, the key may be expired, ' +
          'revoked, or scoped to a different account.'
      )
    );
  }
  card.appendChild(lead);

  const steps = el('ol', 'tr-ob-steps');
  steps.appendChild(
    stepItem(
      1,
      stepText((p) => {
        p.append(
          text('Open your '),
          strongEl('IMG.LY Dashboard'),
          text(' and create an API key.')
        );
      })
    )
  );
  steps.appendChild(
    stepItem(
      2,
      stepText((p) => {
        p.append(
          text('Paste the key into a '),
          codeEl('.env'),
          text(' file in the project root.')
        );
      }),
      codeBlock(ENV_SNIPPET)
    )
  );
  steps.appendChild(
    stepItem(
      3,
      stepText((p) => {
        p.append(
          text('Restart the dev server (Vite reads '),
          codeEl('.env'),
          text(' on start), then reload this page.')
        );
      })
    )
  );
  card.appendChild(steps);

  card.appendChild(
    actionsBar([
      linkButton('Open IMG.LY Dashboard →', DASHBOARD_URL, 'primary'),
      reloadButton()
    ])
  );

  card.appendChild(productionFootnote());
}

// ---------------------------------------------------------------------------
// Deployed variant: paste-key form with localStorage persistence
// ---------------------------------------------------------------------------

function renderDeployedCard(card: HTMLElement, reason: OnboardingReason): void {
  const isMissing = reason === 'missing';
  const stored = getUserApiKey() ?? '';

  card.appendChild(badge(isMissing));
  card.appendChild(
    titleEl(
      isMissing
        ? 'Set up your IMG.LY API key'
        : 'Your API key was rejected'
    )
  );

  const lead = el('p', 'tr-ob-lead');
  lead.textContent = isMissing
    ? 'Paste an IMG.LY API key below to unlock the translation demo. The ' +
      'key is saved in this browser only; it never leaves your machine.'
    : 'The IMG.LY AI Gateway rejected the saved API key. Paste a different ' +
      'key below — most commonly the saved key is expired, revoked, or ' +
      'scoped to a different account.';
  card.appendChild(lead);

  // Input group.
  const group = el('label', 'tr-ob-input-group');
  group.htmlFor = 'imgly-translate-ai-key';

  const label = el('span', 'tr-ob-label');
  label.textContent = 'API key';
  group.appendChild(label);

  const input = el('input', 'tr-ob-input') as HTMLInputElement;
  input.id = 'imgly-translate-ai-key';
  input.type = 'text';
  input.value = stored;
  input.placeholder = 'sk_...';
  input.spellcheck = false;
  input.autocomplete = 'off';
  group.appendChild(input);

  const helper = el('p', 'tr-ob-helper-text');
  helper.append(text('Create one in the '));
  const helperLink = el('a') as HTMLAnchorElement;
  helperLink.href = DASHBOARD_URL;
  helperLink.target = '_blank';
  helperLink.rel = 'noopener noreferrer';
  helperLink.textContent = 'IMG.LY Dashboard';
  helper.append(helperLink, text('.'));
  group.appendChild(helper);

  card.appendChild(group);

  // Buttons.
  const save = button('Save and reload', 'primary');
  const clear = button('Clear stored key', 'secondary');

  const refreshSaveButton = () => {
    const trimmed = input.value.trim();
    save.disabled = trimmed.length === 0 || trimmed === stored;
  };
  input.addEventListener('input', refreshSaveButton);
  refreshSaveButton();

  save.addEventListener('click', () => {
    const trimmed = input.value.trim();
    if (!trimmed) return;
    setUserApiKey(trimmed);
    window.location.reload();
  });
  clear.addEventListener('click', () => {
    clearUserApiKey();
    window.location.reload();
  });

  const actions: HTMLElement[] = [save];
  if (stored) actions.push(clear);
  card.appendChild(actionsBar(actions));

  card.appendChild(productionFootnote());
}

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function text(content: string): Text {
  return document.createTextNode(content);
}

function badge(isMissing: boolean): HTMLElement {
  const span = el('span', 'tr-ob-badge');
  if (!isMissing) span.classList.add('tr-ob-badge--invalid');
  span.textContent = isMissing ? 'Setup required' : 'Invalid API key';
  return span;
}

function titleEl(content: string): HTMLElement {
  const div = el('div', 'tr-ob-title');
  div.setAttribute('role', 'heading');
  div.setAttribute('aria-level', '2');
  div.textContent = content;
  return div;
}

function codeEl(content: string): HTMLElement {
  const code = el('code');
  code.textContent = content;
  return code;
}

function strongEl(content: string): HTMLElement {
  const strong = el('strong');
  strong.textContent = content;
  return strong;
}

function codeBlock(content: string): HTMLElement {
  const pre = el('pre', 'tr-ob-codeblock');
  pre.textContent = content;
  return pre;
}

function stepText(fill: (p: HTMLElement) => void): HTMLElement {
  const p = el('p', 'tr-ob-step-text');
  fill(p);
  return p;
}

function stepItem(
  n: number,
  ...bodyChildren: HTMLElement[]
): HTMLElement {
  const li = el('li', 'tr-ob-step');

  const number = el('span', 'tr-ob-step-number');
  number.textContent = String(n);
  li.appendChild(number);

  const body = el('div', 'tr-ob-step-body');
  for (const child of bodyChildren) body.appendChild(child);
  li.appendChild(body);

  return li;
}

function actionsBar(children: HTMLElement[]): HTMLElement {
  const bar = el('div', 'tr-ob-actions');
  for (const child of children) bar.appendChild(child);
  return bar;
}

function button(
  label: string,
  variant: 'primary' | 'secondary'
): HTMLButtonElement {
  const btn = el('button', `tr-ob-button tr-ob-button--${variant}`);
  btn.type = 'button';
  btn.textContent = label;
  return btn;
}

function linkButton(
  label: string,
  href: string,
  variant: 'primary' | 'secondary'
): HTMLAnchorElement {
  const a = el('a', `tr-ob-button tr-ob-button--${variant}`);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  return a;
}

function reloadButton(): HTMLButtonElement {
  const b = button('Reload', 'secondary');
  b.addEventListener('click', () => window.location.reload());
  return b;
}

function productionFootnote(): HTMLElement {
  const p = el('p', 'tr-ob-step-text');
  p.append(
    text(
      'For production, mint short-lived tokens from your backend and register a custom '
    ),
    codeEl('ly.img.ai.getToken'),
    text(' action instead. See the ')
  );
  const link = el('a') as HTMLAnchorElement;
  link.href = GATEWAY_DOCS_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Gateway Provider guide';
  p.append(link, text(' for the full setup.'));
  return p;
}
