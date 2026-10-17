// ========================================
// Gesture Conductor — Layout Editor
// ========================================
// Responsibilities:
// 1. Select and reposition musician images.
// 2. Adjust individual image sizes and horizontal mirroring.
// 3. Print reusable layout data to the browser console.
//
// Editing is available after the curtains have opened.
// Shared editor state and layout data come from config.js.
// Image bounds are calculated by getPlayerBox() in visuals.js.
// Mouse and keyboard events are forwarded by sketch.js.


// ========================================
// Mouse Selection and Dragging
// ========================================

function isInsidePlayArea() {
  // Restrict mouse selection to the canvas interaction area.
  // The top and bottom margins remain reserved even though
  // the performance interface no longer displays labels.
  return (
    mouseX >= 0 &&
    mouseX < width &&
    mouseY >= topBarHeight &&
    mouseY < height - bottomBarHeight
  );
}

function selectMusician() {
  // Image dimensions must be available before hit testing.
  if (
    !editMode ||
    loadedCount < imagePaths.length ||
    !isInsidePlayArea()
  ) {
    return;
  }

  // Clicking empty space within the play area clears selection.
  selected = -1;
  dragging = false;

  // Check images in reverse drawing order so the topmost
  // overlapping image receives selection first.
  for (let i = players.length - 1; i >= 0; i--) {
    const box = getPlayerBox(i);

    // Test the rectangular image bounds using the bottom-centre
    // anchor. Transparent PNG pixels also count as selectable area.
    const hit =
      mouseX >= box.x - box.w / 2 &&
      mouseX <= box.x + box.w / 2 &&
      mouseY >= box.y - box.h &&
      mouseY <= box.y;

    if (hit) {
      selected = i;
      dragging = true;

      // Preserve the distance between the cursor and image anchor.
      // This prevents the image from jumping when dragging begins.
      offsetX = mouseX - box.x;
      offsetY = mouseY - box.y;

      break;
    }
  }
}

function moveSelected(x, y) {
  if (selected < 0) return;

  // Convert canvas pixels back into normalised layout coordinates.
  // Positions can then adapt when the viewport dimensions change.
  // Clamping keeps the anchor inside the canvas; the full image
  // may still extend beyond its edges.
  layout[selected].x = constrain(
    x / width,
    0,
    1
  );

  layout[selected].y = constrain(
    y / height,
    0,
    1
  );
}

function dragMusician() {
  if (
    editMode &&
    dragging &&
    selected >= 0
  ) {
    // Apply the original click offset throughout the drag.
    moveSelected(
      mouseX - offsetX,
      mouseY - offsetY
    );
  }
}

function moveWithShift() {
  if (
    editMode &&
    selected >= 0 &&
    keyIsDown(SHIFT)
  ) {
    // Alternative positioning control: hold Shift and move the mouse.
    // Unlike dragging, this places the anchor directly at the cursor.
    moveSelected(mouseX, mouseY);
  }
}


// ========================================
// Keyboard Controls
// ========================================

function handleEditorKey(event) {
  // Held keys can generate repeated keydown events.
  // Ignore repeats for toggles, but allow them for selection and sizing.
  const repeated = event && event.repeat;

  // R: return immediately to the closed-curtain opening screen.
  // This command is available outside editing mode as well.
  if (key === "r" || key === "R") {
    if (!repeated) {
      resetIntro();
    }

    // Prevent the default browser response to this handled key.
    return false;
  }

  // E: toggle editing only while the stage is in the playing state.
  // Stop active sounds and end any drag when switching modes.
  if (key === "e" || key === "E") {
    if (
      !repeated &&
      introState === "playing"
    ) {
      editMode = !editMode;
      dragging = false;
      stopAllSounds();
    }

    return false;
  }

  // Remaining controls require editing mode and loaded images.
  if (
    !editMode ||
    loadedCount < imagePaths.length
  ) {
    return;
  }

  // Left / Right: cycle through musicians by image index.
  if (
    keyCode === LEFT_ARROW ||
    keyCode === RIGHT_ARROW
  ) {
    const direction =
      keyCode === RIGHT_ARROW ? 1 : -1;

    // Select the first musician if none is selected.
    // Otherwise wrap around at either end of the image list.
    selected = selected < 0
      ? 0
      : (
          selected +
          direction +
          imagePaths.length
        ) % imagePaths.length;

    dragging = false;
    return false;
  }

  if (selected >= 0) {
    // Up / + / =: increase the stored size by 10, up to 500.
    // Final displayed height also depends on globalSize and
    // the responsive screen scale calculated in visuals.js.
    if (
      keyCode === UP_ARROW ||
      key === "+" ||
      key === "="
    ) {
      layout[selected].size = min(
        layout[selected].size + 10,
        500
      );

      return false;
    }

    // Down / -: decrease the stored size by 10, down to 20.
    if (
      keyCode === DOWN_ARROW ||
      key === "-"
    ) {
      layout[selected].size = max(
        layout[selected].size - 10,
        20
      );

      return false;
    }

    // M: toggle horizontal mirroring once per key press.
    // Mirroring does not change the image's position or dimensions.
    if (key === "m" || key === "M") {
      if (!repeated) {
        layout[selected].flip =
          !layout[selected].flip;
      }

      return false;
    }
  }

  // P: print the complete layout, even if no musician is selected.
  if (key === "p" || key === "P") {
    printLayout();
    return false;
  }
}


// ========================================
// Layout Export to the Console
// ========================================

function printLayout() {
  // Create an export copy without changing the live layout.
  // Round positions to four decimal places for readable output.
  const saved = layout.map((item) => ({
    x: Number(item.x.toFixed(4)),
    y: Number(item.y.toFixed(4)),
    size: item.size,
    flip: Boolean(item.flip)
  }));

  // Print a JavaScript declaration that can replace the existing
  // layout declaration in config.js.
  //
  // This does not download a file or save changes automatically.
  // Copy the output into config.js and save the project to retain it.
  console.log(
    "let layout = " +
    JSON.stringify(saved, null, 2) +
    ";"
  );
}