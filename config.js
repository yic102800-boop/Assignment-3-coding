// ========================================
// Gesture Conductor — Shared Configuration
// ========================================
// Load this file before the other project modules.
// Timing values use milliseconds unless otherwise stated.


// ========================================
// Image and Audio Assets
// ========================================

const imagePaths = [
  "assets/01.png",
  "assets/02.png",
  "assets/03.png",
  "assets/04.png",
  "assets/05.png",
  "assets/06.png",
  "assets/07.png",
  "assets/08.png",
  "assets/09.png",
  "assets/10.png",
  "assets/11.png",
  "assets/12.png"
];

const labels = [
  "STRINGS",
  "WOODWINDS",
  "BRASS"
];

// Sample keys identify the original pitch of each audio file.
const sampleMaps = [
  {
    A3: "assets/A3.mp3",
    A4: "assets/A4.mp3",
    A5: "assets/A5.mp3"
  },
  {
    C4: "assets/C4.mp3",
    C5: "assets/C5.mp3",
    C6: "assets/C6.mp3"
  },
  {
    F3: "assets/F3.mp3",
    F4: "assets/F4.mp3",
    F5: "assets/F5.mp3"
  }
];


// ========================================
// Display Settings
// ========================================

// Overall musician magnification.
// Use 1.4 here if you have adopted the smaller layout.
const globalSize = 1.2;

// Interaction margins used by hand mapping and mouse selection.
const topBarHeight = 55;
const bottomBarHeight = 36;


// ========================================
// Opening and Hand Tracking Settings
// ========================================

// Hold a palm inside the central target for two seconds.
const holdDuration = 2000;

// Open the curtains over 1.5 seconds.
const curtainDuration = 1500;

// Briefly retain lost hands to reduce interruptions.
const handLostGraceMs = 250;

// Require fresh detections for opening and particle interaction.
const introFreshHandMs = 180;

// Normalised boundary margin for stable zone selection.
const zoneMargin = 0.025;


// ========================================
// Musical Settings
// ========================================

// Repeat active notes every 1.6 seconds.
const noteRepeatMs = 1600;

// Duration passed to Tone.Sampler, in seconds.
const noteDuration = 1.25;

// Require a new target pitch to remain stable before switching.
const noteChangeDelayMs = 100;

// Initial sampler volume levels in decibels.
const instrumentVolumes = [-12, -12, -12];

// Inclusive MIDI ranges for strings, woodwinds and brass.
// audio.js selects C-major notes within these ranges.
const instrumentRanges = [
  [57, 81],
  [60, 84],
  [53, 77]
];


// ========================================
// Musician Layout
// ========================================
// x, y: normalised bottom-centre image position.
// size: height before responsive scaling and globalSize.
// flip: horizontal mirroring.
//
// All y positions below have already been increased by 0.05.
// Do not add a second layout-shifting loop after this array.

let layout = [
  {
    x: 0.1269,
    y: 0.7529,
    size: 200,
    flip: false
  },
  {
    x: 0.0565,
    y: 0.8337,
    size: 220,
    flip: false
  },
  {
    x: 0.1742,
    y: 0.7878,
    size: 180,
    flip: false
  },
  {
    x: 0.2722,
    y: 0.7547,
    size: 210,
    flip: true
  },
  {
    x: 0.5307,
    y: 0.685,
    size: 170,
    flip: false
  },
  {
    x: 0.6097,
    y: 0.7364,
    size: 210,
    flip: false
  },
  {
    x: 0.3831,
    y: 0.7327,
    size: 200,
    flip: false
  },
  {
    x: 0.4584,
    y: 0.6739,
    size: 160,
    flip: false
  },
  {
    x: 0.866,
    y: 0.7713,
    size: 220,
    flip: true
  },
  {
    x: 0.7936,
    y: 0.7401,
    size: 210,
    flip: true
  },
  {
    x: 0.69,
    y: 0.724,
    size: 210,
    flip: true
  },
  {
    x: 0.9072,
    y: 0.8039,
    size: 240,
    flip: true
  }
];


// ========================================
// Image Loading and Editor State
// ========================================

let players = [];
let loadedCount = 0;
let failedFiles = [];

let editMode = false;

// -1 indicates that no musician is selected.
let selected = -1;
let dragging = false;

// Cursor offset from the selected image anchor.
let offsetX = 0;
let offsetY = 0;


// ========================================
// Stage State
// ========================================

// waiting → opening → playing → closing → waiting.
let introState = "waiting";

let holdStartedAt = null;
let holdProgress = 0;

let curtainStartedAt = null;

// 0 = closed; 1 = fully open.
let curtainProgress = 0;

// Current closing timers are defined in intro.js:
// stageExitDelayMs and stageClosingDurationMs.


// ========================================
// Camera and Hand Tracking State
// ========================================

let cameraVideo;
let handModel;

let cameraReady = false;

let cameraStatus =
  "Starting the camera and loading the hand model.";

let trackedHands = [];

// Store each active group only once, even with two hands in one zone.
const activeHandGroups = new Set();


// ========================================
// Audio State
// ========================================

let samplers = [];
let loadedInstruments = 0;

let audioEnabled = false;
let audioStarting = false;
let audioError = false;

// Retained for compatibility with earlier audio versions.
// The current button-free audio module does not use these.
let audioButton;
let soundMessage = "";

const voiceStates = Array.from(
  { length: 3 },
  () => ({
    note: null,
    lastTrigger: 0,
    pendingNote: null,
    pendingSince: 0
  })
);


// ========================================
// Hand Skeleton Connections
// ========================================
// Landmark 0: wrist.
// 1–4: thumb; 5–8: index; 9–12: middle;
// 13–16: ring; 17–20: little finger.

const handConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17],
  [17, 18], [18, 19], [19, 20]
];


// ========================================
// Legacy Closing Variables
// ========================================
// Preserved for compatibility.
// The current intro.js uses its own stage-prefixed closing state.

const noHandDuration = 2000;
const curtainCloseDuration = 1500;

let noHandStartedAt = null;
let curtainCloseStartedAt = null;
let curtainCloseFrom = 1;