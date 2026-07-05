import { createPrototypeA } from './prototypes/prototype-a.js';
import { createPrototypeB } from './prototypes/prototype-b.js';
import { DROP_INTERVAL_MS, ML_PER_DROP, MAX_ML } from './shared/config.js';

const FIRST_DROP_DELAY = 800;
const MAX_DROPS = MAX_ML / ML_PER_DROP;

const canvas = document.getElementById('canvas');
const canvas2d = document.getElementById('canvas-2d');
const dropCountEl = document.getElementById('drop-count');
const mlCountEl = document.getElementById('ml-count');

const focusModal = document.getElementById('focus-modal');
const focusModalDrops = document.getElementById('focus-modal-drops');
const focusModalMl = document.getElementById('focus-modal-ml');

const protoB = createPrototypeB(canvas);
const protoA = createPrototypeA(canvas2d);

const sessionStart = Date.now();

let drops = 0;
let ml = 0;
let running = false;
let timer = null;
let paused = false;
let modalOpen = false;
let timeOffset = 0;
let freezeStartedAt = 0;

function isTimelineFrozen() {
  return paused || modalOpen;
}

function nowEffective() {
  if (isTimelineFrozen()) {
    return freezeStartedAt - timeOffset;
  }
  return Date.now() - timeOffset;
}

function dropTimeForIndex(n) {
  const t0 = sessionStart + FIRST_DROP_DELAY;
  return t0 + (n - 1) * DROP_INTERVAL_MS;
}

function expectedDropCount(at = nowEffective()) {
  const t0 = sessionStart + FIRST_DROP_DELAY;
  if (at < t0) return 0;
  return Math.min(Math.floor((at - t0) / DROP_INTERVAL_MS) + 1, MAX_DROPS);
}

function formatMl(value) {
  return value.toFixed(ML_PER_DROP < 0.1 ? 2 : 1);
}

function updateStats() {
  dropCountEl.textContent = drops;
  mlCountEl.textContent = formatMl(ml);
  focusModalDrops.textContent = drops;
  focusModalMl.textContent = formatMl(ml);
}

function syncVisuals(immediate = false) {
  protoA.setMl(ml);
  protoB.setMl(ml, immediate);
  updateStats();
}

function resizeAll() {
  protoB.resize();
  protoA.resize();
}

function clearDropTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function freezeTimeline() {
  if (freezeStartedAt) return;
  freezeStartedAt = Date.now();
  clearDropTimer();
}

function unfreezeTimeline() {
  if (!freezeStartedAt) return;
  timeOffset += Date.now() - freezeStartedAt;
  freezeStartedAt = 0;
  tickScheduler();
}

function scheduleWakeAt(wakeAt) {
  clearDropTimer();
  const delay = Math.max(0, wakeAt - nowEffective());
  timer = setTimeout(tickScheduler, delay);
}

function pauseCounter() {
  paused = true;
  freezeTimeline();
}

function resumeCounter() {
  paused = false;
  if (!modalOpen) unfreezeTimeline();
}

function tickScheduler() {
  clearDropTimer();

  if (isTimelineFrozen() || running || ml >= MAX_ML) return;

  const expected = expectedDropCount();
  if (drops >= expected) {
    if (drops < MAX_DROPS) {
      scheduleWakeAt(dropTimeForIndex(drops + 1));
    }
    return;
  }

  catchUpAndRun();
}

async function catchUpAndRun() {
  if (isTimelineFrozen() || running || ml >= MAX_ML) return;

  const expected = expectedDropCount();
  if (drops >= expected) {
    tickScheduler();
    return;
  }

  const deficit = expected - drops;
  if (deficit > 1) {
    drops = expected - 1;
    ml = Math.min(drops * ML_PER_DROP, MAX_ML);
    syncVisuals(true);
  }

  await runDropCycle();
  tickScheduler();
}

function openModal() {
  modalOpen = true;
  freezeTimeline();
  updateStats();
  focusModal.hidden = false;
  focusModal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => protoA.resize());
}

function closeModal() {
  if (!modalOpen) return;
  modalOpen = false;
  focusModal.hidden = true;
  focusModal.setAttribute('aria-hidden', 'true');
  if (!paused) unfreezeTimeline();
}

function toggleModal() {
  if (modalOpen) {
    closeModal();
    return;
  }
  openModal();
}

function onPointerDown(event) {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  toggleModal();
}

function onKeyDown(event) {
  if (event.code === 'Escape' && modalOpen) {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.code !== 'Space' && event.code !== 'Enter') return;
  if (event.repeat) return;
  event.preventDefault();
  toggleModal();
}

function onVisibilityChange() {
  if (document.hidden || isTimelineFrozen()) return;
  tickScheduler();
}

async function runDropCycle() {
  if (running || isTimelineFrozen() || ml >= MAX_ML) return;
  running = true;

  let statsUpdated = false;
  const onImpact = () => {
    if (statsUpdated) return;
    statsUpdated = true;
    drops += 1;
    ml = Math.min(drops * ML_PER_DROP, MAX_ML);
    protoA.setMl(ml);
    updateStats();
  };

  await Promise.all([
    protoB.animateDrop(ml, { onImpact }),
    protoA.animateDrop(ml, { onImpact }),
  ]);

  running = false;
}

window.addEventListener('resize', resizeAll);
window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('focus', tickScheduler);
document.addEventListener('visibilitychange', onVisibilityChange);

new ResizeObserver(resizeAll).observe(canvas.parentElement);
new ResizeObserver(resizeAll).observe(canvas2d.parentElement);

updateStats();
tickScheduler();
