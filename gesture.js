// ========================================
// Gesture Conductor — Hand Tracking Module
// ========================================
// Responsibilities:
// 1. Start the hidden camera feed and the two-hand model.
// 2. Convert detected landmarks into normalised coordinates.
// 3. Match new observations to recently tracked hands.
// 4. Smooth landmark positions and stabilise zone selection.
// 5. Map normalised coordinates to the canvas.
//
// Shared settings and state are defined in config.js.
// The model returns observations asynchronously through gotHands().
// sketch.js calls updateHandState() every animation frame.


// ========================================
// Camera and Model Initialisation
// ========================================

async function startHandTracking() {
  let timeoutId;

  try {
    // Capture video at the requested processing dimensions.
    // Hide the video element; visuals.js draws virtual hands instead.
    cameraVideo = createCapture(VIDEO);
    cameraVideo.size(640, 480);
    cameraVideo.hide();

    // Wait until the video element has a usable current frame.
    const videoReady = new Promise((resolve, reject) => {
      const element = cameraVideo.elt;

      const ready = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      element.addEventListener(
        "loadeddata",
        ready,
        { once: true }
      );

      element.addEventListener(
        "error",
        () => {
          clearTimeout(timeoutId);
          reject(new Error("Camera video error"));
        },
        { once: true }
      );

      // Limit the video-readiness wait to 30 seconds.
      // This timeout does not cover the model-loading operation.
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            "Camera not ready: check permissions / other apps"
          )
        );
      }, 30000);

      // The video may already be ready before listeners are attached.
      if (element.readyState >= 2) {
        ready();
      }
    });

    // Load the hand model while waiting for the camera.
    // Begin detection only when both operations have completed.
    const results = await Promise.all([
      ml5.handPose({ maxHands: 2 }),
      videoReady
    ]);

    handModel = results[0];
    cameraReady = true;
    cameraStatus = "Place your hands within the camera view.";

    // Continuously send recognition results to gotHands().
    handModel.detectStart(cameraVideo, gotHands);
  } catch (error) {
    clearTimeout(timeoutId);

    cameraStatus =
      "Camera/model startup failed. Check permissions and the console.";

    console.error(error);
  }
}


// ========================================
// Process Hand Detection Results
// ========================================

function gotHands(results) {
  const now = millis();

  // Discard tracks that have exceeded the brief loss-grace period.
  trackedHands = trackedHands.filter(
    (hand) => now - hand.lastSeen <= handLostGraceMs
  );

  const observations = results.slice(0, 2).map((result) => {
    // Store all 21 landmarks as coordinates between 0 and 1.
    // Mirror x so interaction behaves like looking in a mirror.
    const keypoints = result.keypoints.map((point) => ({
      x: constrain(
        1 - point.x / cameraVideo.width,
        0,
        1
      ),

      y: constrain(
        point.y / cameraVideo.height,
        0,
        1
      )
    }));

    // Estimate the palm centre from the wrist and four finger bases.
    // This reduces the effect of individual fingertip movements.
    const palm = [0, 5, 9, 13, 17];

    return {
      keypoints,

      x: palm.reduce(
        (sum, i) => sum + keypoints[i].x,
        0
      ) / palm.length,

      y: palm.reduce(
        (sum, i) => sum + keypoints[i].y,
        0
      ) / palm.length
    };
  });

  // Build possible matches between observations and existing tracks.
  // Model result order can change, so array order alone is unreliable.
  const candidates = [];

  for (let i = 0; i < observations.length; i++) {
    for (let j = 0; j < trackedHands.length; j++) {
      const observation = observations[i];
      const old = trackedHands[j];

      const distance = Math.hypot(
        observation.x - old.x,
        observation.y - old.y
      );

      // Distance is measured in normalised camera coordinates.
      // Reject large jumps rather than smoothing across them.
      if (distance < 0.35) {
        candidates.push({ i, j, distance });
      }
    }
  }

  candidates.sort(
    (a, b) => a.distance - b.distance
  );

  const matches = new Map();
  const usedTracks = new Set();

  // Greedily accept the closest available one-to-one matches.
  // This follows spatial proximity rather than permanent hand IDs.
  // Crossing hands or occlusion can therefore create ambiguity.
  for (const { i, j } of candidates) {
    if (!matches.has(i) && !usedTracks.has(j)) {
      matches.set(i, j);
      usedTracks.add(j);
    }
  }

  const previous = [...trackedHands];
  const updated = [];

  for (let i = 0; i < observations.length; i++) {
    const observation = observations[i];

    const old = matches.has(i)
      ? previous[matches.get(i)]
      : null;

    // Move matched landmarks 40% towards each new observation.
    // Smoothing reduces jitter but introduces some response lag.
    // It is applied per detection callback, not per rendering frame.
    const keypoints = old
      ? observation.keypoints.map((point, k) => ({
          x: lerp(
            old.keypoints[k].x,
            point.x,
            0.4
          ),

          y: lerp(
            old.keypoints[k].y,
            point.y,
            0.4
          )
        }))
      : observation.keypoints;

    // Recalculate the palm centre from the smoothed landmarks
    // so interaction and the drawn hand use consistent positions.
    const palm = [0, 5, 9, 13, 17];

    const x = palm.reduce(
      (sum, k) => sum + keypoints[k].x,
      0
    ) / palm.length;

    const y = palm.reduce(
      (sum, k) => sum + keypoints[k].y,
      0
    ) / palm.length;

    updated.push({
      x,
      y,
      keypoints,

      // Preserve an existing zone near its boundaries.
      // New tracks start in the zone containing their palm centre.
      group: old
        ? getStableGroup(x, old.group)
        : Math.min(2, Math.floor(x * 3)),

      lastSeen: now
    });
  }

  // Retain unmatched recent tracks to bridge brief detection losses.
  // Their timestamps are not refreshed, so they still expire.
  // Current observations take priority, with at most two tracks kept.
  for (let j = 0; j < previous.length; j++) {
    if (!usedTracks.has(j) && updated.length < 2) {
      updated.push(previous[j]);
    }
  }

  trackedHands = updated;
}


// ========================================
// Stable Instrument Zone Selection
// ========================================

function getStableGroup(x, previousGroup) {
  const left = previousGroup / 3;
  const right = (previousGroup + 1) / 3;

  // Extend the previous zone by a small margin on both sides.
  // The hand must leave this expanded range before switching zones.
  // This hysteresis reduces rapid switching near a boundary.
  if (
    x >= left - zoneMargin &&
    x <= right + zoneMargin
  ) {
    return previousGroup;
  }

  // Divide normalised horizontal position into three equal zones.
  // Cap the index at 2 because x can equal exactly 1.
  return Math.min(2, Math.floor(x * 3));
}


// ========================================
// Per-Frame Hand State Maintenance
// ========================================

function updateHandState() {
  // Expire old tracks even when no new detection callback arrives.
  trackedHands = trackedHands.filter(
    (hand) =>
      millis() - hand.lastSeen <= handLostGraceMs
  );

  // A Set stores each active zone only once, even when both hands
  // occupy it. Other modules still access individual tracked hands.
  activeHandGroups.clear();

  for (const hand of trackedHands) {
    activeHandGroups.add(hand.group);
  }

  // Retained tracks count during the loss-grace period.
  // Opening and particle generation apply additional freshness checks.
  if (cameraReady) {
    cameraStatus = trackedHands.length
      ? `${trackedHands.length} hand(s) tracked.`
      : "Place your hands within the camera view.";
  }
}


// ========================================
// Camera-to-Canvas Coordinate Mapping
// ========================================

function handToScreen(point) {
  // Accept either a landmark or a palm-centre object.
  // Both contain normalised x and y coordinates.
  return {
    x: point.x * width,

    // Map vertical position into the interaction area, preserving
    // the top and bottom margins defined in config.js.
    // These margins remain even though interface labels are hidden.
    y: topBarHeight +
      point.y * Math.max(
        1,
        height - topBarHeight - bottomBarHeight
      )
  };
}