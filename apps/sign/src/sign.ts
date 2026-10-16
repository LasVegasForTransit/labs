export {};

function required<T extends Element>(found: T | null): T {
  if (!found) throw new Error('The sign is missing a required control.');
  return found;
}

const root = required(document.querySelector<HTMLElement>('[data-event-sign]'));
const settings = required(document.querySelector<HTMLElement>('.sign-settings'));
const title = required(document.querySelector<HTMLElement>('[data-sign-title]'));
const titleArea = required(document.querySelector<HTMLElement>('.sign-title-area'));
const input = required(document.querySelector<HTMLInputElement>('#display-name'));
const show = required(document.querySelector<HTMLButtonElement>('[data-show-sign]'));
const exit = required(document.querySelector<HTMLButtonElement>('[data-exit-sign]'));
const feedback = required(document.querySelector<HTMLElement>('[data-sign-status]'));
const copy = required(document.querySelector<HTMLButtonElement>('[data-copy-sign]'));
const textColors = document.querySelectorAll<HTMLButtonElement>('[data-text-choice]');
const colors = document.querySelectorAll<HTMLButtonElement>('[data-color-choice]');

{
  const state = { presenting: false, setupScrollY: 0 };
  let controlsTimer: ReturnType<typeof setTimeout> | undefined;
  let textColor = 'black';
  const device: { wakeLock?: WakeLock } = navigator;
  const display: { requestFullscreen?: () => Promise<void> } = root;
  let wakeLock: WakeLockSentinel | undefined;
  let wakePending = false;
  let color = 'orange';
  const brightnessHint = 'Turn up your tablet’s brightness for outdoor events.';

  function fitName() {
    let low = 12;
    let high = Math.min(titleArea.clientWidth * 0.32, titleArea.clientHeight * 0.8);
    for (let step = 0; step < 12; step++) {
      const size = (low + high) / 2;
      title.style.fontSize = `${size}px`;
      if (title.scrollHeight > titleArea.clientHeight || title.scrollWidth > titleArea.clientWidth)
        high = size;
      else low = size;
    }
    title.style.fontSize = `${low}px`;
  }

  function updateLabel() {
    const name = input.value.trim();
    if (name) {
      title.textContent = name;
      title.classList.add('sign-custom-name');
    } else {
      title.replaceChildren(
        ...['Las Vegans', 'for Better', 'Transit'].map((line) => {
          const span = document.createElement('span');
          span.textContent = `${line} `;
          return span;
        }),
      );
      title.classList.remove('sign-custom-name');
    }
    fitName();
  }

  function updateTextColor(value: string) {
    textColor = value === 'white' ? 'white' : 'black';
    applyTextColor();
  }

  function applyTextColor() {
    const effective = color === 'dark' ? 'white' : textColor;
    root.dataset.textColor = effective;
    for (const button of textColors) {
      button.setAttribute('aria-pressed', String(button.dataset.textChoice === effective));
      button.disabled = color === 'dark' && button.dataset.textChoice === 'black';
    }
  }

  function revealControls() {
    if (!state.presenting) return;
    root.classList.add('controls-visible');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => root.classList.remove('controls-visible'), 2500);
  }

  function updateColor(value: string) {
    color = value === 'dark' ? 'dark' : 'orange';
    root.setAttribute('data-color', color);
    for (const button of colors) {
      button.setAttribute('aria-pressed', String(button.dataset.colorChoice === color));
    }
    applyTextColor();
  }

  function loadLink() {
    const params = new URLSearchParams(location.hash.slice(1));
    input.value = (params.get('name') ?? '').slice(0, 60);
    updateLabel();
    updateColor(params.get('color') ?? 'orange');
    updateTextColor(params.get('text') ?? 'black');
  }

  function canKeepAwake() {
    return state.presenting && document.visibilityState === 'visible';
  }

  async function keepAwake() {
    if (!canKeepAwake() || wakeLock || wakePending) return;
    if (!device.wakeLock) {
      feedback.textContent = `This browser cannot keep the screen awake. Check your device’s auto-lock setting. ${brightnessHint}`;
      return;
    }
    wakePending = true;
    try {
      const acquired = await device.wakeLock.request('screen');
      // A request can finish after the volunteer exits or switches apps.
      if (!canKeepAwake()) {
        await acquired.release();
        return;
      }
      wakeLock = acquired;
      feedback.textContent = `The screen will stay awake while the sign is on display. ${brightnessHint}`;
      acquired.addEventListener('release', () => {
        if (wakeLock !== acquired) return;
        wakeLock = undefined;
        feedback.textContent = `The screen can sleep again. Check your device’s auto-lock setting. ${brightnessHint}`;
      });
    } catch {
      feedback.textContent = `The screen may sleep. Check your device’s auto-lock setting. ${brightnessHint}`;
    } finally {
      wakePending = false;
    }
  }

  function stopDisplay() {
    if (!state.presenting) return;
    state.presenting = false;
    root.classList.remove('is-displaying', 'controls-visible');
    clearTimeout(controlsTimer);
    settings.hidden = false;
    exit.hidden = true;
    void wakeLock?.release();
    wakeLock = undefined;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    window.scrollTo(0, state.setupScrollY);
    show.focus({ preventScroll: true });
  }

  root.addEventListener('pointermove', revealControls);
  root.addEventListener('pointerdown', revealControls);
  for (const button of textColors)
    button.addEventListener('click', () => updateTextColor(button.dataset.textChoice ?? 'black'));
  input.addEventListener('input', updateLabel);
  for (const button of colors) {
    button.addEventListener('click', () => updateColor(button.dataset.colorChoice ?? 'orange'));
  }
  show.addEventListener('click', () => {
    state.setupScrollY = window.scrollY;
    state.presenting = true;
    root.classList.add('is-displaying');
    settings.hidden = true;
    exit.hidden = false;
    exit.focus({ preventScroll: true });
    revealControls();
    void keepAwake();
    // iPad browsers can omit or deny fullscreen; the viewport display still works.
    if (display.requestFullscreen) void display.requestFullscreen.call(root).catch(() => {});
  });
  exit.addEventListener('click', stopDisplay);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') stopDisplay();
    if (state.presenting && event.key === 'Tab') {
      event.preventDefault();
      revealControls();
      exit.focus({ preventScroll: true });
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) stopDisplay();
    else if (!state.presenting) void document.exitFullscreen().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void keepAwake();
  });
  window.addEventListener('pagehide', () => {
    state.presenting = false;
    void wakeLock?.release();
    wakeLock = undefined;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      root.classList.remove('is-displaying');
      settings.hidden = false;
      exit.hidden = true;
    }
  });
  window.addEventListener('hashchange', loadLink);
  async function copyLink() {
    const params = new URLSearchParams();
    if (input.value.trim()) params.set('name', input.value.trim());
    if (color !== 'orange') params.set('color', color);
    if (textColor !== 'black') params.set('text', textColor);
    const url = new URL(location.href);
    // Keep volunteer-entered names out of requests to the server.
    url.hash = params.toString();
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.href);
      feedback.textContent =
        'Sign link copied. Send it to another volunteer or save it for the event.';
    } catch {
      feedback.textContent =
        'Copy the address from your browser to share this sign. Your name and color are included.';
    }
  }
  copy.addEventListener('click', () => {
    void copyLink();
  });
  new ResizeObserver(fitName).observe(titleArea);
  void document.fonts.ready.then(fitName);
  loadLink();
  settings.hidden = false;
}
