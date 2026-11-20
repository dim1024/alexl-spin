// === DOM ELEMENTS ===
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('start-btn');
const menuBtn = document.getElementById('menu-btn');
const modeButtons = document.querySelectorAll('.mode-btn');
const modeIndicator = document.getElementById('mode-indicator');

const stat1Label = document.getElementById('stat1-label');
const stat1Value = document.getElementById('stat1-value');
const stat2Label = document.getElementById('stat2-label');
const stat2Value = document.getElementById('stat2-value');

// === GAME CONSTANTS ===
const CENTER = canvas.width / 2;
const RADIUS = 135;
const TWO_PI = Math.PI * 2;

// === GAME STATE ===
let mode = 'endless'; // 'endless' | 'lives' | 'lockpicker' | 'overload'
let isPlaying = false;
let lastTime = 0;

// Dial & Targets state
let pointerAngle = 0;
let pointerSpeed = 2.4;
let direction = 1;
let baseTargetWidth = 0.65;
let targets = []; // Array of target objects: { angle, width, maxWidth, age, shrinkDelay, hasEntered }

// Mode-specific progress
let score = 0;
let lives = 3;
let combo = 0;
let lockLevel = 1;
let lockHits = 0;
let lockGoal = 10;

// Visual feedback flash
let flashColor = null;
let flashAlpha = 0;
let feedbackText = '';
let feedbackAlpha = 0;

// Saved High Scores via localStorage
const savedData = JSON.parse(localStorage.getItem('spinstop_save')) || {
  endlessBest: 0,
  livesBest: 0,
  maxLockLevel: 1,
  overloadBest: 0
};

function saveProgress() {
  localStorage.setItem('spinstop_save', JSON.stringify(savedData));
}

// === ANGLE HELPER MATH ===
function normalizeAngle(angle) {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function shortestAngleDiff(a, b) {
  let diff = normalizeAngle(a - b);
  if (diff > Math.PI) diff -= TWO_PI;
  return diff;
}

// === MODE SELECTION & SETUP ===
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    updateHUD();
  });
});

function createTarget(width, canShrink = false) {
  let candidate;
  let attempts = 0;

  // Find a spot away from the pointer AND away from existing targets
  do {
    candidate = Math.random() * TWO_PI;
    attempts++;
    const farFromPointer = Math.abs(shortestAngleDiff(candidate, pointerAngle)) >= Math.PI / 3;
    const farFromOthers = targets.every(
      (t) => Math.abs(shortestAngleDiff(candidate, t.angle)) >= width + 0.15
    );
    if (farFromPointer && farFromOthers) break;
  } while (attempts < 40);

  return {
    angle: candidate,
    width: width,
    maxWidth: width,
    age: 0,
    canShrink: canShrink,
    shrinkDelay: 2.6, // Seconds before target starts shrinking
    hasEntered: false
  };
}

function resetSingleTarget() {
  targets = [createTarget(baseTargetWidth, false)];
}

function startGame(keepLockLevel = false) {
  isPlaying = true;
  overlay.classList.add('hidden');
  menuBtn.classList.remove('hidden');

  pointerAngle = -Math.PI / 2; // Start at 12 o'clock
  direction = 1;
  combo = 0;
  targets = [];

  if (mode === 'endless') {
    score = 0;
    pointerSpeed = 2.3;
    baseTargetWidth = 0.62;
    modeIndicator.textContent = 'Mode: Endless';
    resetSingleTarget();
  } else if (mode === 'lives') {
    score = 0;
    lives = 3;
    pointerSpeed = 2.5;
    baseTargetWidth = 0.60;
    modeIndicator.textContent = 'Mode: 3-Lives';
    resetSingleTarget();
  } else if (mode === 'lockpicker') {
    if (!keepLockLevel) lockLevel = savedData.maxLockLevel || 1;
    lockHits = 0;
    lockGoal = 8 + lockLevel * 2;
    pointerSpeed = 2.2 + lockLevel * 0.25;
    baseTargetWidth = Math.max(0.32, 0.65 - lockLevel * 0.03);
    modeIndicator.textContent = `Mode: Lockpicker (Lvl ${lockLevel})`;
    resetSingleTarget();
  } else if (mode === 'overload') {
    score = 0;
    lives = 3;
    pointerSpeed = 2.35;
    baseTargetWidth = 0.56;
    modeIndicator.textContent = 'Mode: Overload';
    // Spawn 3 simultaneous shrinking targets
    for (let i = 0; i < 3; i++) {
      targets.push(createTarget(baseTargetWidth, true));
    }
  }

  updateHUD();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// === PLAYER INPUT HANDLING ===
function triggerAction() {
  if (!isPlaying) return;

  // Check if pointer is inside ANY active target
  let hitIndex = -1;
  let hitDiff = Infinity;

  targets.forEach((t, index) => {
    const diff = Math.abs(shortestAngleDiff(pointerAngle, t.angle));
    if (diff <= t.width / 2 && diff < hitDiff) {
      hitIndex = index;
      hitDiff = diff;
    }
  });

  if (hitIndex !== -1) {
    handleHit(hitIndex, hitDiff);
  } else {
    handleMiss('MISSED!');
  }
}

function handleHit(hitIndex, diff) {
  triggerFlash('#22c55e');
  const hitTarget = targets[hitIndex];
  const halfWidth = hitTarget.width / 2;

  if (mode === 'endless') {
    score += 1;
    pointerSpeed = Math.min(6.2, pointerSpeed + 0.12);
    baseTargetWidth = Math.max(0.28, baseTargetWidth - 0.008);
    direction *= -1;
    showFeedback('+1');

    if (score > savedData.endlessBest) {
      savedData.endlessBest = score;
      saveProgress();
    }
    resetSingleTarget();
  } else if (mode === 'lives') {
    const isSweetSpot = diff <= halfWidth * 0.3;
    combo += 1;
    const points = isSweetSpot ? 25 : 10;
    score += points;

    pointerSpeed = Math.min(6.0, pointerSpeed + 0.08);
    direction *= -1;
    showFeedback(isSweetSpot ? `PERFECT! +${points}` : `+${points}`);

    if (score > savedData.livesBest) {
      savedData.livesBest = score;
      saveProgress();
    }
    resetSingleTarget();
  } else if (mode === 'lockpicker') {
    lockHits += 1;
    direction *= -1;
    showFeedback(`${lockHits} / ${lockGoal}`);

    if (lockHits >= lockGoal) {
      isPlaying = false;
      lockLevel += 1;
      if (lockLevel > savedData.maxLockLevel) {
        savedData.maxLockLevel = lockLevel;
        saveProgress();
      }
      showOverlay(
        `LEVEL ${lockLevel - 1} CRACKED!`,
        `Ready for Level ${lockLevel} (${8 + lockLevel * 2} hits)?`,
        `START LEVEL ${lockLevel}`,
        true
      );
      updateHUD();
      return;
    }
    resetSingleTarget();
  } else if (mode === 'overload') {
    // Reverse spin direction on every hit!
    direction *= -1;

    // Clutch save bonus if the target had already started shrinking!
    const wasShrinking = hitTarget.age > hitTarget.shrinkDelay;
    const points = wasShrinking ? 15 : 10;
    score += points;

    // Gradually ramp speed; at 100+ points keep 4 targets active at once
    pointerSpeed = Math.min(4.8, pointerSpeed + 0.04);
    showFeedback(wasShrinking ? `CLUTCH! +${points}` : `+${points}`);

    if (score > savedData.overloadBest) {
      savedData.overloadBest = score;
      saveProgress();
    }

    // Remove hit target and spawn replacements up to desired count
    targets.splice(hitIndex, 1);
    const desiredCount = score >= 100 ? 4 : 3;
    while (targets.length < desiredCount) {
      targets.push(createTarget(baseTargetWidth, true));
    }
  }

  updateHUD();
}

function handleMiss(reason) {
  triggerFlash('#ef4444');
  combo = 0;

  if (mode === 'endless') {
    endGame('GAME OVER', `${reason} Final Score: ${score}`);
  } else if (mode === 'lives') {
    lives -= 1;
    showFeedback(reason);
    updateHUD();

    if (lives <= 0) {
      endGame('OUT OF LIVES', `Final Score: ${score}`);
    } else {
      resetSingleTarget();
    }
  } else if (mode === 'lockpicker') {
    endGame(`LOCK JAMMED (LVL ${lockLevel})`, `${reason} Streak reset at ${lockHits}/${lockGoal}.`);
  } else if (mode === 'overload') {
    lives -= 1;
    showFeedback(reason);
    updateHUD();

    if (lives <= 0) {
      endGame('SYSTEM OVERLOAD', `Final Score: ${score} (Best: ${savedData.overloadBest})`);
    }
  }
}

function endGame(title, message) {
  isPlaying = false;
  updateHUD();
  showOverlay(title, message, 'PLAY AGAIN', false);
}

function showOverlay(title, message, btnText, keepLevel) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startBtn.textContent = btnText;
  startBtn.dataset.keepLevel = keepLevel ? 'true' : 'false';
  overlay.classList.remove('hidden');
}

// === HUD & VISUAL FEEDBACK ===
function updateHUD() {
  if (mode === 'endless') {
    stat1Label.textContent = 'SCORE';
    stat1Value.textContent = score;
    stat2Label.textContent = 'BEST';
    stat2Value.textContent = savedData.endlessBest;
  } else if (mode === 'lives') {
    stat1Label.textContent = 'SCORE';
    stat1Value.textContent = score;
    stat2Label.textContent = 'LIVES';
    stat2Value.textContent = '❤️'.repeat(Math.max(0, lives)) || '0';
  } else if (mode === 'lockpicker') {
    stat1Label.textContent = `LVL ${lockLevel} LOCKS`;
    stat1Value.textContent = `${lockHits} / ${lockGoal}`;
    stat2Label.textContent = 'MAX LEVEL';
    stat2Value.textContent = savedData.maxLockLevel;
  } else if (mode === 'overload') {
    stat1Label.textContent = 'SCORE';
    stat1Value.textContent = score;
    stat2Label.textContent = 'LIVES';
    stat2Value.textContent = '❤️'.repeat(Math.max(0, lives)) || '0';
  }
}

function triggerFlash(color) {
  flashColor = color;
  flashAlpha = 0.35;
}

function showFeedback(text) {
  feedbackText = text;
  feedbackAlpha = 1.0;
}

// === MAIN GAME LOOP (60 FPS) ===
function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(dt);
  draw();

  if (isPlaying || flashAlpha > 0 || feedbackAlpha > 0) {
    requestAnimationFrame(gameLoop);
  }
}

function update(dt) {
  if (isPlaying) {
    pointerAngle = normalizeAngle(pointerAngle + pointerSpeed * direction * dt);

    if (mode === 'overload') {
      // Update each target's age and shrinking state
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        t.age += dt;

        // Start shrinking once shrinkDelay has passed
        if (t.canShrink && t.age > t.shrinkDelay) {
          t.width -= 0.14 * dt; // Shrinks smoothly over ~4 seconds
        }

        // If it shrank too much and vanished -> lose a life & replace it!
        if (t.width <= 0.06) {
          targets.splice(i, 1);
          targets.push(createTarget(baseTargetWidth, true));
          handleMiss('TARGET VANISHED!');
          if (!isPlaying) return;
        }
      }
    } else {
      // Single-target modes: check if pointer passed completely over target without clicking
      const t = targets[0];
      if (t) {
        const diff = Math.abs(shortestAngleDiff(pointerAngle, t.angle));
        const insideTarget = diff <= t.width / 2;

        if (insideTarget) {
          t.hasEntered = true;
        } else if (t.hasEntered && !insideTarget) {
          t.hasEntered = false;
          handleMiss('TOO LATE!');
        }
      }
    }
  }

  // Fade out hit/miss flash and floating text
  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 1.5);
  if (feedbackAlpha > 0) feedbackAlpha = Math.max(0, feedbackAlpha - dt * 1.4);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Outer Ring Track
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, TWO_PI);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 24;
  ctx.stroke();

  // 2. Draw all active Target Arcs
  targets.forEach((t) => {
    const startArc = t.angle - t.width / 2;
    const endArc = t.angle + t.width / 2;

    // Color shifts from green -> amber -> red as a target shrinks
    let arcColor = '#22c55e';
    if (t.canShrink && t.age > t.shrinkDelay) {
      const ratio = t.width / t.maxWidth;
      arcColor = ratio < 0.45 ? '#ef4444' : '#f59e0b';
    }

    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RADIUS, startArc, endArc);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 24;
    ctx.lineCap = 'butt';
    ctx.stroke();

    // Sweet-Spot Center Marker (for 3-Lives mode)
    if (mode === 'lives') {
      const sweetHalf = (t.width / 2) * 0.3;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, RADIUS, t.angle - sweetHalf, t.angle + sweetHalf);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 24;
      ctx.stroke();
    }
  });

  // 3. Hit/Miss Flash Ring
  if (flashAlpha > 0 && flashColor) {
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RADIUS, 0, TWO_PI);
    ctx.strokeStyle = flashColor;
    ctx.lineWidth = 34;
    ctx.stroke();
    ctx.restore();
  }

  // 4. Rotating Pointer Hand
  const tipX = CENTER + Math.cos(pointerAngle) * (RADIUS + 14);
  const tipY = CENTER + Math.sin(pointerAngle) * (RADIUS + 14);
  const baseX = CENTER + Math.cos(pointerAngle) * (RADIUS - 22);
  const baseY = CENTER + Math.sin(pointerAngle) * (RADIUS - 22);

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(tipX, tipY);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 5. Center Status Text inside the circle
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (feedbackAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = feedbackAlpha;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px Segoe UI, sans-serif';
    ctx.fillText(feedbackText, CENTER, CENTER - 10);
    ctx.restore();
  }

  if (isPlaying && mode === 'lockpicker') {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 34px Segoe UI, sans-serif';
    ctx.fillText(lockGoal - lockHits, CENTER, CENTER + 24);
  }
}

// === EVENT LISTENERS ===
startBtn.addEventListener('click', () => {
  const keepLevel = startBtn.dataset.keepLevel === 'true';
  startGame(keepLevel);
});

menuBtn.addEventListener('click', () => {
  isPlaying = false;
  menuBtn.classList.add('hidden');
  showOverlay('CHOOSE A MODE', 'Test your timing across 4 arcade modes.', 'PLAY', false);
});

// Keyboard (Spacebar)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (isPlaying) {
      triggerAction();
    } else if (!overlay.classList.contains('hidden')) {
      const keepLevel = startBtn.dataset.keepLevel === 'true';
      startGame(keepLevel);
    }
  }
});

// Mouse & Touch on Canvas
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  triggerAction();
});

// Initial draw
updateHUD();
draw();
