// ========================================
// Gesture Conductor — Audio Module
// ========================================
// Responsibilities:
// 1. Create one sample-based instrument for each interaction zone.
// 2. Monitor sample readiness and the audio context state.
// 3. Map palm height to discrete pitches in C major.
// 4. Trigger, repeat and release notes independently for each zone.
//
// Instrument settings and voice state come from config.js.
// Hand positions and group assignments come from gesture.js.
// intro.js attempts to enable audio after opening is complete.
// sketch.js calls updateGestureAudio() every animation frame.


// ========================================
// Generate Instrument Pitch Scales
// ========================================

const pitchScales = instrumentRanges.map(([low, high]) => {
  // C-major pitch classes relative to C:
  // C, D, E, F, G, A and B.
  const allowed = [0, 2, 4, 5, 7, 9, 11];
  const notes = [];

  // Include only C-major notes within the configured MIDI range.
  // Taking MIDI modulo 12 identifies its pitch class.
  for (let midi = low; midi <= high; midi++) {
    if (allowed.includes(midi % 12)) {
      notes.push(midi);
    }
  }

  return notes;
});


// ========================================
// Initialise Sample-Based Instruments
// ========================================

function initAudio() {
  for (let g = 0; g < 3; g++) {
    const sampler = new Tone.Sampler({
      // Keys identify the original pitches of the uploaded samples.
      // The sampler transposes available samples to play other notes.
      urls: sampleMaps[g],

      // Envelope times are in seconds.
      // Attack softens the onset; release softens the ending.
      attack: 0.05,
      release: 0.18,

      onload: () => {
        loadedInstruments++;
      },

      onerror: (error) => {
        // A loading failure prevents audioEnabled from becoming true.
        audioError = true;

        console.error(
          "Sample loading failed:",
          labels[g],
          error
        );
      }
    }).toDestination();

    // Connect directly to the audio output and apply the configured
    // level in decibels. No additional effects are added here.
    sampler.volume.value = instrumentVolumes[g];
    samplers.push(sampler);
  }

  // No audio-start button is created.
  // If automatic startup is blocked, a pointer press or key press
  // during performance provides another opportunity to unlock audio.
  document.addEventListener(
    "pointerdown",
    unlockStageAudio
  );

  document.addEventListener(
    "keydown",
    unlockStageAudio
  );
}


// ========================================
// Audio Unlocking and Readiness
// ========================================

function unlockStageAudio() {
  // Only attempt unlocking through these events during performance.
  if (introState === "playing" && !editMode) {
    enableAudio();
  }
}

function syncAudioState() {
  // Audio is ready only when all three instruments are loaded,
  // no sample-loading error has occurred, and the context is running.
  audioEnabled =
    !audioError &&
    samplers.length === 3 &&
    samplers.every((sampler) => sampler.loaded) &&
    Tone.getContext().state === "running";
}

function enableAudio() {
  if (audioError) return;

  // Request context startup without blocking later attempts.
  // A browser may keep an automatic startup request pending until
  // it receives a permitted user interaction.
  try {
    Promise.resolve(Tone.start())
      .then(() => {
        syncAudioState();
      })
      .catch((error) => {
        console.warn(
          "Audio could not start:",
          error
        );
      });

    // Also check the current state immediately.
    // updateGestureAudio() continues checking it on subsequent frames.
    syncAudioState();
  } catch (error) {
    console.warn(
      "Audio could not start:",
      error
    );
  }
}


// ========================================
// Map Hand Height to Pitch
// ========================================

function getNoteFromHeight(group, y) {
  const scale = pitchScales[group];

  // Hand height is normalised:
  // 0 = top of the camera view; 1 = bottom.
  const value = Math.max(
    0,
    Math.min(1, y)
  );

  // Reverse the vertical direction so higher hands produce
  // higher pitches. Round to select a discrete scale note
  // rather than producing a continuous pitch slide.
  const index = Math.round(
    (1 - value) * (scale.length - 1)
  );

  return Tone.Frequency(
    scale[index],
    "midi"
  ).toNote();
}


// ========================================
// Update Gesture-Controlled Playback
// ========================================

function updateGestureAudio() {
  syncAudioState();

  // Allow sound only while the stage is playing, assets are ready,
  // editing is inactive, and the page is visible.
  const canPlay =
    audioEnabled &&
    introState === "playing" &&
    !editMode &&
    loadedCount === imagePaths.length &&
    !document.hidden;

  if (!canPlay) {
    stopAllSounds();
    return;
  }

  const heights = [[], [], []];

  // Collect palm heights by instrument group.
  // This includes briefly retained tracks until gesture.js expires
  // them using handLostGraceMs.
  for (const hand of trackedHands) {
    if (hand.group >= 0 && hand.group < 3) {
      heights[hand.group].push(hand.y);
    }
  }

  for (let g = 0; g < 3; g++) {
    const state = voiceStates[g];
    const values = heights[g];

    // A group with no tracked hands releases its active notes.
    // Other groups continue independently.
    if (!values.length) {
      stopGroupSound(g);
      continue;
    }

    // Two hands in the same zone share one target pitch.
    // Averaging prevents them from overriding each other.
    const averageY =
      values.reduce((sum, y) => sum + y, 0) /
      values.length;

    const desiredNote =
      getNoteFromHeight(g, averageY);

    const now = millis();

    // Restart the stability timer whenever the candidate changes.
    if (state.pendingNote !== desiredNote) {
      state.pendingNote = desiredNote;
      state.pendingSince = now;
    }

    // Start the first note immediately.
    const firstNote = state.note === null;

    // Existing notes change only after the new target remains
    // stable for the configured delay.
    const changed =
      state.note !== desiredNote &&
      now - state.pendingSince >= noteChangeDelayMs;

    // Retrigger periodically while a hand remains in the zone.
    const repeatDue =
      now - state.lastTrigger >= noteRepeatMs;

    if (firstNote || changed || repeatDue) {
      // If a new pitch is still pending when repetition is due,
      // repeat the current note instead of switching early.
      const note =
        firstNote || changed
          ? desiredNote
          : state.note;

      // Begin releasing previous voices before triggering the note.
      // Release tails can briefly overlap the new attack.
      samplers[g].releaseAll();

      // noteDuration is in seconds.
      // Tone.now() schedules using the audio clock.
      // Velocity is fixed at 0.8; hand speed does not control volume.
      samplers[g].triggerAttackRelease(
        note,
        noteDuration,
        Tone.now(),
        0.8
      );

      // millis() is used for application-level timing.
      state.note = note;
      state.lastTrigger = now;
    }
  }
}


// ========================================
// Release One Instrument Group
// ========================================

function stopGroupSound(group) {
  const state = voiceStates[group];

  // Release voices only when this group has a tracked active note.
  // This avoids repeatedly requesting release on every idle frame.
  if (state.note !== null && samplers[group]) {
    samplers[group].releaseAll();
  }

  // Reset pitch and timing state so the next hand entry
  // triggers its initial note immediately.
  state.note = null;
  state.lastTrigger = 0;
  state.pendingNote = null;
  state.pendingSince = 0;
}


// ========================================
// Release All Instrument Groups
// ========================================

function stopAllSounds() {
  // Use the same cleanup procedure for each instrument.
  // This releases notes without disposing the samplers or context.
  for (let g = 0; g < 3; g++) {
    stopGroupSound(g);
  }
}