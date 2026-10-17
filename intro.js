// ========================================
// Gesture Conductor — Stage and Curtain Module
// ========================================
// Controls the stage cycle:
// waiting → opening → playing → closing → waiting.
//
// A fresh palm detection inside the central circle starts the
// opening hold. Leaving the circle resets the hold progress.
//
// During performance, losing both hands for two seconds starts
// closing. Once closing begins, it finishes before another opening.
//
// Shared opening settings and state come from config.js.
// Hand coordinates come from gesture.js.
// Audio functions come from audio.js.


// ========================================
// Closing Settings and State
// ========================================

// Time without a detected hand before closing begins.
// All timing constants in this section use milliseconds.
const stageExitDelayMs = 2000;

// Duration of the closing animation.
const stageClosingDurationMs = 1500;

// Latest hand-detection time, or the start of a new monitoring period.
let stageLastHandAt = null;

// Time at which the closing animation started.
let stageClosingStartedAt = null;

// Curtain openness at the beginning of closing.
// Openness is 0 when closed and 1 when fully open.
let stageClosingFrom = 1;


// ========================================
// Central Opening Target
// ========================================

function getIntroTarget() {
  // Scale the target using the shorter canvas dimension
  // so the circle remains proportional to the viewport.
  return {
    x: width / 2,
    y: height / 2,
    radius: Math.min(width, height) * 0.14
  };
}


// ========================================
// Stage State Update
// ========================================

function updateIntro() {
  const now = millis();

  // Cancel the opening hold and no-hand timer while hidden.
  // Opening and closing timestamps are not reset here:
  // an animation already in progress may advance on return.
  if (document.hidden) {
    holdStartedAt = null;
    holdProgress = 0;
    stageLastHandAt = null;
    return;
  }

  // Do not trigger automatic closing while editing the layout.
  if (editMode) {
    stageLastHandAt = null;
    return;
  }

  // ----------------------------------------
  // Waiting: detect a palm inside the circle
  // ----------------------------------------

  if (introState === "waiting") {
    // Visual opening requires loaded images and a ready camera.
    // It does not depend on audio samples or audio being unlocked.
    const ready =
      loadedCount === imagePaths.length &&
      cameraReady;

    const target = getIntroTarget();

    const handInside =
      ready &&
      trackedHands.some((hand) => {
        // Ignore stale detections retained by the tracking system.
        if (now - hand.lastSeen > introFreshHandMs) {
          return false;
        }

        const point = handToScreen(hand);

        // Test the palm centre rather than the entire hand outline.
        return (
          Math.hypot(
            point.x - target.x,
            point.y - target.y
          ) <= target.radius
        );
      });

    if (handInside) {
      if (holdStartedAt === null) {
        holdStartedAt = now;
      }

      // Convert elapsed hold time into a progress value from 0 to 1.
      // holdDuration is defined in config.js.
      holdProgress = constrain(
        (now - holdStartedAt) / holdDuration,
        0,
        1
      );

      // The condition requires at least one fresh palm inside.
      // It does not require the same hand throughout the hold.
      if (holdProgress >= 1) {
        introState = "opening";
        curtainStartedAt = now;
        stageLastHandAt = null;
      }
    } else {
      // Leaving the target restarts the required continuous hold.
      holdStartedAt = null;
      holdProgress = 0;
    }

    return;
  }

  // ----------------------------------------
  // Opening: move the curtain panels apart
  // ----------------------------------------

  if (introState === "opening") {
    const t = constrain(
      (now - curtainStartedAt) / curtainDuration,
      0,
      1
    );

    // Smoothstep easing starts and ends with zero slope,
    // producing gentle acceleration and deceleration.
    curtainProgress = t * t * (3 - 2 * t);

    if (t >= 1) {
      introState = "playing";

      // Begin a new no-hand monitoring period when the stage opens.
      stageLastHandAt = now;

      // Attempt to enable audio only after opening is complete.
      // Browser autoplay restrictions are handled by audio.js.
      enableAudio();
    }

    return;
  }

  // ----------------------------------------
  // Playing: monitor the latest hand detection
  // ----------------------------------------

  if (introState === "playing") {
    // Establish a new baseline after editing or page visibility changes.
    if (stageLastHandAt === null) {
      stageLastHandAt = now;
    }

    // Use detection timestamps rather than refreshing the timer
    // merely because a retained hand object is still present.
    // Either hand can keep the performance active.
    for (const hand of trackedHands) {
      stageLastHandAt = Math.max(
        stageLastHandAt,
        hand.lastSeen
      );
    }

    if (now - stageLastHandAt >= stageExitDelayMs) {
      startCurtainClosing();
    }

    return;
  }

  // ----------------------------------------
  // Closing: complete the return to the centre
  // ----------------------------------------

  if (introState === "closing") {
    const t = constrain(
      (now - stageClosingStartedAt) /
        stageClosingDurationMs,
      0,
      1
    );

    const eased = t * t * (3 - 2 * t);

    // Reduce openness from its captured starting value to zero.
    // Returning hands do not interrupt this closing animation.
    curtainProgress =
      stageClosingFrom * (1 - eased);

    if (t >= 1) {
      resetIntro();
    }
  }
}


// ========================================
// Start Closing
// ========================================

function startCurtainClosing() {
  // Closing can begin only from the performance state.
  if (introState !== "playing") return;

  // Release active sounds before moving the curtains.
  stopAllSounds();

  introState = "closing";
  stageClosingStartedAt = millis();
  stageClosingFrom = curtainProgress;

  holdStartedAt = null;
  holdProgress = 0;
  dragging = false;
}


// ========================================
// Reset to the Opening Screen
// ========================================

function resetIntro() {
  stopAllSounds();

  editMode = false;
  dragging = false;

  introState = "waiting";
  holdStartedAt = null;
  holdProgress = 0;

  curtainStartedAt = null;
  curtainProgress = 0;

  stageLastHandAt = null;
  stageClosingStartedAt = null;
  stageClosingFrom = 1;

  // Keep the camera, loaded assets and audio context available.
  // Another performance can begin without reinitialising them.
}


// ========================================
// Curtain Rendering
// ========================================

function drawCurtain() {
  push();

  rectMode(CORNER);
  noStroke();

  // A small overlap prevents a gap along the centre when closed.
  const panelWidth = width / 2 + 2;

  // At full openness, narrow curtain strips remain at both edges.
  const offset =
    (width / 2 - width * 0.04) * curtainProgress;

  drawCurtainPanel(
    -offset,
    panelWidth,
    height
  );

  drawCurtainPanel(
    width / 2 - 2 + offset,
    panelWidth,
    height
  );

  // Draw a fixed dark strip above both moving panels.
  fill(25);
  rect(0, 0, width, 22);

  pop();
}


// ========================================
// Procedural Curtain Folds
// ========================================

function drawCurtainPanel(x, panelWidth, panelHeight) {
  push();

  translate(x, 0);
  rectMode(CORNER);
  noStroke();

  fill(45);
  rect(0, 0, panelWidth, panelHeight);

  // Build 18 repeating folds from vertical tonal bands.
  // This is a drawn fabric effect, not a cloth physics simulation.
  const foldWidth = panelWidth / 18;

  for (let i = 0; i < 18; i++) {
    const foldX = i * foldWidth;

    // Main illuminated surface.
    fill(65);
    rect(
      foldX,
      0,
      foldWidth * 0.48,
      panelHeight
    );

    // Dark recess between folds.
    fill(30);
    rect(
      foldX + foldWidth * 0.68,
      0,
      foldWidth * 0.32,
      panelHeight
    );

    // Narrow highlight suggesting the raised edge of a fold.
    fill(85);
    rect(
      foldX + foldWidth * 0.12,
      0,
      Math.max(1, foldWidth * 0.06),
      panelHeight
    );
  }

  pop();
}


// ========================================
// Opening Title, Target and Hold Progress
// ========================================

function drawIntroPrompt() {
  // Hide opening instructions once the opening animation begins.
  if (introState !== "waiting") return;

  const target = getIntroTarget();

  push();

  textAlign(CENTER, CENTER);
  noStroke();
  fill(255);

  // Scale the title down on narrow viewports.
  textSize(Math.min(32, width / 25));

  text(
    "Gesture Conductor",
    width / 2,
    height * 0.2
  );

  // Draw the circular palm-placement target.
  noFill();
  stroke(140);
  strokeWeight(2);

  circle(
    target.x,
    target.y,
    target.radius * 2
  );

  // Draw a progress arc starting at the top of the circle.
  // This uses p5's default radian angle mode.
  if (holdProgress > 0) {
    stroke(255);
    strokeWeight(5);

    arc(
      target.x,
      target.y,
      target.radius * 2,
      target.radius * 2,
      -HALF_PI,
      -HALF_PI + TWO_PI * holdProgress
    );
  }

  // Keep a single instruction below the target.
  noStroke();
  fill(255);
  textSize(Math.min(16, width / 30));

  text(
    "Please place your hand inside the circle.",
    width / 2,
    target.y + target.radius + 35
  );

  pop();
}