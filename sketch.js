// ========================================
// Gesture Conductor — Main Program
// ========================================
// Camera-based interaction with up to two tracked hands.
//
// config.js: shared settings and state.
// gesture.js: camera input and hand tracking.
// intro.js: opening and closing sequence.
// audio.js: instrument playback and pitch control.
// visuals.js: musicians, virtual hands and floating notes.
// editor.js: musician layout editing.


// ========================================
// Initial Setup
// ========================================

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Start loading the visual and audio assets.
  loadMusicianImages();
  initAudio();

  // Start the hidden camera feed and two-hand recognition model.
  // No mouse-generated hand data is used in this version.
  startHandTracking();
}


// ========================================
// Main Animation Loop
// ========================================

function draw() {
  background(255);

  // Update detected hands and their instrument zones.
  updateHandState();

  // Update the stage cycle:
  // waiting → opening → playing → closing → waiting.
  updateIntro();

  // Map hand positions to instrument selection and pitch.
  updateGestureAudio();

  // Draw the orchestra and any editor guides.
  drawOrchestra();
  drawInterface();

  // Generate floating notes and apply nearby hand-motion forces.
  drawFloatingNotes();

  // Curtains cover the stage during the opening and closing sequence.
  // Hide them while editing the musician layout.
  if (!editMode) {
    drawCurtain();
    drawIntroPrompt();
  }

  // Render the tracked hand skeletons above other canvas elements.
  drawVirtualHands();
}


// ========================================
// Mouse Input for Layout Editing
// ========================================
// Mouse input only edits the layout.
// It does not simulate hands or select instruments.

function mousePressed() {
  selectMusician();
}

function mouseDragged() {
  if (editMode) {
    dragMusician();
    return false;
  }
}

function mouseReleased() {
  dragging = false;
}

function mouseMoved() {
  moveWithShift();
}


// ========================================
// Keyboard Controls
// ========================================
// E: toggle editing after the stage opens.
// R: return to the opening screen.
//
// Editing controls:
// Left / Right: select a musician.
// Up / Down or + / -: change image size.
// M: mirror the selected image.
// P: print the layout to the console.

function keyPressed(event) {
  return handleEditorKey(event);
}


// ========================================
// Responsive Canvas
// ========================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  // Remove particles using coordinates from the previous viewport.
  // Reset hand-motion history to prevent a false velocity spike.
  clearVisualMotionState();
}


// ========================================
// Particle and Motion Cleanup
// ========================================

function clearVisualMotionState() {
  floatingNotes.length = 0;
  lastNoteSpawnAt.fill(null);

  noteAnimationLastAt = null;
  previousNoteHands = [];
}


// ========================================
// Page Visibility Handling
// ========================================

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Release active notes while the page is hidden.
    stopAllSounds();

    trackedHands = [];
    activeHandGroups.clear();

    dragging = false;

    // Restart the opening hold and no-hand monitoring period.
    holdStartedAt = null;
    holdProgress = 0;
    stageLastHandAt = null;

    clearVisualMotionState();
  }
});