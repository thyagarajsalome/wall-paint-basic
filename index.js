const mainCanvas = document.getElementById("mainCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const mainCtx = mainCanvas.getContext("2d", { willReadFrequently: true });
const overlayCtx = overlayCanvas.getContext("2d");
const canvasContainer = document.getElementById("canvasContainer");
const canvasArea = document.getElementById("canvasArea");
const brushCursor = document.getElementById("brushCursor");
const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const placeholder = document.getElementById("placeholder");
const colorPicker = document.getElementById("colorPicker");
const colorValue = document.getElementById("colorValue");
const brushSize = document.getElementById("brushSize");
const brushValue = document.getElementById("brushValue");
const vertexInfo = document.getElementById("vertexInfo");
const brushTools = document.getElementById("brushTools");

let originalImage = null;
let currentImage = null;
let selectionMask = null;
let currentTool = "polygon";
let isDrawing = false;
let polygonPoints = [];

// Tool buttons
const polygonBtn = document.getElementById("polygonBtn");
const addBtn = document.getElementById("addBtn");
const eraseBtn = document.getElementById("eraseBtn");
const clearBtn = document.getElementById("clearBtn");
const clearPaintBtn = document.getElementById("clearPaintBtn"); // New button
const applyBtn = document.getElementById("applyBtn");
const saveBtn = document.getElementById("saveBtn");
const resetImageBtn = document.getElementById("resetImageBtn");

// --- UPLOAD HANDLERS ---
uploadArea.addEventListener("click", () => fileInput.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () =>
  uploadArea.classList.remove("dragover")
);
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) loadImage(file);
});
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadImage(file);
});

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const rect = canvasArea.getBoundingClientRect();
      const maxWidth = rect.width - 20;
      const maxHeight = rect.height - 20;
      let width = img.width;
      let height = img.height;
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);

      mainCanvas.width = overlayCanvas.width = width;
      mainCanvas.height = overlayCanvas.height = height;

      mainCtx.drawImage(img, 0, 0, width, height);

      originalImage = mainCtx.getImageData(0, 0, width, height);
      currentImage = mainCtx.getImageData(0, 0, width, height);
      selectionMask = new Uint8Array(width * height);

      placeholder.style.display = "none";
      canvasContainer.style.display = "block";
      enableTools();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function enableTools() {
  [
    polygonBtn,
    addBtn,
    eraseBtn,
    clearBtn,
    clearPaintBtn, // Enable new button
    applyBtn,
    saveBtn,
    resetImageBtn,
  ].forEach((btn) => (btn.disabled = false));
  setTool("polygon"); // Default tool
}

// --- TOOL SELECTION ---
polygonBtn.addEventListener("click", () => setTool("polygon"));
addBtn.addEventListener("click", () => setTool("add"));
eraseBtn.addEventListener("click", () => setTool("erase"));

function setTool(tool) {
  currentTool = tool;
  [polygonBtn, addBtn, eraseBtn].forEach((btn) =>
    btn.classList.remove("active")
  );

  vertexInfo.style.display = "none";
  brushTools.style.display = "none";
  mainCanvas.style.cursor = "crosshair";

  if (tool === "polygon") {
    polygonBtn.classList.add("active");
    vertexInfo.style.display = "block";
  } else if (tool === "add" || tool === "erase") {
    (tool === "add" ? addBtn : eraseBtn).classList.add("active");
    brushTools.style.display = "block";
  }
}

// --- CANVAS INTERACTION ---
const getCanvasCoords = (e) => {
  const event = e.touches ? e.touches[0] : e;
  const rect = mainCanvas.getBoundingClientRect();
  const scaleX = mainCanvas.width / rect.width;
  const scaleY = mainCanvas.height / rect.height;
  return {
    x: Math.floor((event.clientX - rect.left) * scaleX),
    y: Math.floor((event.clientY - rect.top) * scaleY),
  };
};

function handleCanvasDown(e) {
  const { x, y } = getCanvasCoords(e);
  if (currentTool === "polygon") {
    polygonPoints.push({ x, y });
    drawPolygon();
  } else {
    // add or erase
    isDrawing = true;
    brushSelect(x, y);
  }
}

function handleCanvasMove(e) {
  e.preventDefault(); // Prevent scrolling on touch
  const coords = getCanvasCoords(e);
  const rect = mainCanvas.getBoundingClientRect();
  const clientX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const clientY = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

  if (currentTool === "add" || currentTool === "erase") {
    const size = parseInt(brushSize.value);
    const scale = rect.width / mainCanvas.width;
    brushCursor.style.width = brushCursor.style.height =
      size * 2 * scale + "px";
    brushCursor.style.left = clientX + "px";
    brushCursor.style.top = clientY + "px";
    brushCursor.style.display = "block";
    if (isDrawing) {
      brushSelect(coords.x, coords.y);
    }
  } else {
    brushCursor.style.display = "none";
  }

  if (currentTool === "polygon" && polygonPoints.length > 0) {
    drawPolygon(coords.x, coords.y);
  }
}

function handleCanvasUp() {
  isDrawing = false;
}

function handleDoubleClick() {
  if (currentTool === "polygon" && polygonPoints.length >= 3) {
    completePolygon();
  }
}

// Mouse events
mainCanvas.addEventListener("mousedown", handleCanvasDown);
mainCanvas.addEventListener("mousemove", handleCanvasMove);
mainCanvas.addEventListener("mouseup", handleCanvasUp);
mainCanvas.addEventListener("mouseleave", () => {
  isDrawing = false;
  brushCursor.style.display = "none";
});
mainCanvas.addEventListener("dblclick", handleDoubleClick);

// Touch events
mainCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  handleCanvasDown(e);
});
mainCanvas.addEventListener("touchmove", handleCanvasMove);
mainCanvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  handleCanvasUp(e);
});

// --- SELECTION ALGORITHMS ---
function drawPolygon(previewX, previewY) {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (polygonPoints.length === 0) return;

  overlayCtx.strokeStyle = "#667eea";
  overlayCtx.lineWidth = 3;
  overlayCtx.fillStyle = "rgba(102, 126, 234, 0.2)";

  overlayCtx.beginPath();
  overlayCtx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
  for (let i = 1; i < polygonPoints.length; i++) {
    overlayCtx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
  }
  if (previewX !== undefined) overlayCtx.lineTo(previewX, previewY);

  if (polygonPoints.length >= 3) {
    overlayCtx.closePath();
    overlayCtx.fill();
  }

  overlayCtx.stroke();
  polygonPoints.forEach((p) => {
    overlayCtx.fillStyle = "#667eea";
    overlayCtx.beginPath();
    overlayCtx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    overlayCtx.fill();
  });
}

function completePolygon() {
  if (polygonPoints.length < 3) return;
  const w = mainCanvas.width,
    h = mainCanvas.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isPointInPolygon(x, y, polygonPoints)) {
        selectionMask[y * w + x] = 1;
      }
    }
  }
  polygonPoints = [];
  overlayCtx.clearRect(0, 0, w, h);
  showSelection();
}

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function brushSelect(x, y) {
  const size = parseInt(brushSize.value);
  const w = mainCanvas.width,
    h = mainCanvas.height;
  const value = currentTool === "add" ? 1 : 0;
  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      if (dx * dx + dy * dy <= size * size) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h)
          selectionMask[ny * w + nx] = value;
      }
    }
  }
  showSelection();
}

function showSelection() {
  const w = mainCanvas.width,
    h = mainCanvas.height;
  const imageData = overlayCtx.createImageData(w, h);
  for (let i = 0; i < selectionMask.length; i++) {
    if (selectionMask[i] === 1) {
      const idx = i * 4;
      imageData.data[idx] = 102;
      imageData.data[idx + 1] = 126;
      imageData.data[idx + 2] = 234;
      imageData.data[idx + 3] = 128;
    }
  }
  overlayCtx.clearRect(0, 0, w, h);
  overlayCtx.putImageData(imageData, 0, 0);
}

// --- BUTTON ACTIONS ---
function clearSelection() {
  selectionMask.fill(0);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  polygonPoints = [];
}
clearBtn.addEventListener("click", clearSelection);

// Function to revert the image to its original state
function revertToOriginal() {
  if (originalImage) {
    currentImage = new ImageData(
      new Uint8ClampedArray(originalImage.data),
      originalImage.width,
      originalImage.height
    );
    mainCtx.putImageData(originalImage, 0, 0);
  }
}

resetImageBtn.addEventListener("click", () => {
  revertToOriginal();
  clearSelection();
});

// New Event Listener for Clear Paint button
clearPaintBtn.addEventListener("click", () => {
  revertToOriginal();
});

applyBtn.addEventListener("click", () => {
  const targetColor = hexToRgb(colorPicker.value);
  const targetHsl = rgbToHsl(targetColor.r, targetColor.g, targetColor.b);

  const newImageData = new ImageData(
    new Uint8ClampedArray(currentImage.data),
    currentImage.width,
    currentImage.height
  );

  for (let i = 0; i < selectionMask.length; i++) {
    if (selectionMask[i] === 1) {
      const idx = i * 4;
      const originalR = currentImage.data[idx];
      const originalG = currentImage.data[idx + 1];
      const originalB = currentImage.data[idx + 2];

      const originalHsl = rgbToHsl(originalR, originalG, originalB);

      // Create new color with target hue/saturation but original lightness
      const newRgb = hslToRgb(targetHsl[0], targetHsl[1], originalHsl[2]);

      newImageData.data[idx] = newRgb[0];
      newImageData.data[idx + 1] = newRgb[1];
      newImageData.data[idx + 2] = newRgb[2];
      newImageData.data[idx + 3] = 255; // Keep alpha at 100%
    }
  }
  currentImage = newImageData;
  mainCtx.putImageData(currentImage, 0, 0);
  clearSelection(); // Clear selection overlay after applying paint
});

saveBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "painted-room.png";
  link.href = mainCanvas.toDataURL();
  link.click();
});

// --- COLOR UTILITIES ---
colorPicker.addEventListener("input", (e) => {
  const color = e.target.value.toUpperCase();
  colorValue.value = color;
  updateSelectedPreset(color);
});
colorValue.addEventListener("change", (e) => {
  const value = e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(value)) {
    colorPicker.value = value;
    updateSelectedPreset(value);
  }
});
document.querySelectorAll(".preset-color").forEach((preset) => {
  preset.addEventListener("click", () => {
    const color = preset.dataset.color;
    colorPicker.value = color;
    colorValue.value = color;
    updateSelectedPreset(color);
  });
});

function updateSelectedPreset(color) {
  document
    .querySelectorAll(".preset-color")
    .forEach((p) => p.classList.remove("selected"));
  const matchingPreset = document.querySelector(
    `.preset-color[data-color="${color.toUpperCase()}"]`
  );
  if (matchingPreset) matchingPreset.classList.add("selected");
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 */
function rgbToHsl(r, g, b) {
  (r /= 255), (g /= 255), (b /= 255);
  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 */
function hslToRgb(h, s, l) {
  let r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }

    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// --- SLIDER VALUE UPDATES ---
brushSize.addEventListener(
  "input",
  (e) => (brushValue.textContent = e.target.value)
);
