const MODULE_ID = "fluxees-ping";
const SOCKET_NAME = `module.${MODULE_ID}`;
const MENU_ID = `${MODULE_ID}-menu`;
const DEBUG_SHORTCUT_KEY = "e";
const DEBUG_PREFIX = `[${MODULE_ID}]`;
const RADIAL_PAGE_SIZE = 8;
const DEFAULT_ANIMATION_STYLE = "standard";
const BUNDLED_ASSET_PATH = `modules/${MODULE_ID}/assets`;
const SUPPORTED_STICKER_MEDIA_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".webm"]);
const RIGHT_CLICK_HOLD_MOVE_TOLERANCE = 14;
const DEFAULT_SOUND_VOLUME = 0.8;
const DEFAULT_STICKER_DURATION_MS = 1600;
const RELEASE_DEFAULT_STICKER_ORDER = [
  "swords.png",
  "dragon.png",
  "fight.png",
  "angry.png",
  "disguised face.png",
  "drooling face.png",
  "exploding head.png",
  "face with raised eyebrow.png",
  "grinning face.png",
  "grinning face with sweat.png",
  "melting face.png",
  "rolling on the floor laughing.png",
  "saluting face.png",
  "shaking face.png",
  "thinking face.png"
];
const ANIMATION_STYLE_OPTIONS = [
  { value: "none", label: "No Animation" },
  { value: "standard", label: "Standard" },
  { value: "pop", label: "Pop" },
  { value: "bounce", label: "Bounce" },
  { value: "spin", label: "Spin" },
  { value: "fade", label: "Fade" }
];

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const StickerManagerBase = HandlebarsApplicationMixin(ApplicationV2);
let stickerPingManagerInstance = null;

const DEFAULT_STICKERS = [
  ...RELEASE_DEFAULT_STICKER_ORDER
].map((fileName, index) => ({
  id: fileName.replace(/\.[^.]+$/, ""),
  name: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
  path: `${BUNDLED_ASSET_PATH}/${fileName}`,
  sortOrder: index + 1,
  animationStyle: DEFAULT_ANIMATION_STYLE,
  soundPath: "",
  soundVolume: DEFAULT_SOUND_VOLUME,
  repeatAudio: false,
  duration: DEFAULT_STICKER_DURATION_MS,
  enabled: true,
  gmOnly: false
}));

function cloneDefaultStickers() {
  const duration = getConfiguredDefaultStickerDuration();
  return DEFAULT_STICKERS.map((sticker, index) => normalizeSticker({
    ...sticker,
    duration
  }, index)).filter(Boolean);
}

function getConfiguredDefaultStickerDuration() {
  const settingKey = `${MODULE_ID}.displayDuration`;
  const hasRegisteredSetting = Boolean(game?.settings?.settings?.has?.(settingKey));
  if (!hasRegisteredSetting || typeof game.settings?.get !== "function") {
    return DEFAULT_STICKER_DURATION_MS;
  }

  return normalizeStickerDuration(game.settings.get(MODULE_ID, "displayDuration"));
}

function createStickerBehaviorDefaults() {
  return {
    animationStyle: DEFAULT_ANIMATION_STYLE,
    soundPath: "",
    soundVolume: DEFAULT_SOUND_VOLUME,
    repeatAudio: false,
    duration: getConfiguredDefaultStickerDuration(),
    enabled: true,
    gmOnly: false
  };
}

function isDebugEnabled() {
  return Boolean(game.settings?.get(MODULE_ID, "debugLogging"));
}

function debugLog(message, details) {
  if (!isDebugEnabled()) return;
  if (details === undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`);
    return;
  }

  console.log(`${DEBUG_PREFIX} ${message}`, details);
}

function getModuleDebugStateSnapshot() {
  const managerMarker = `data-${MODULE_ID}-manager`;
  const managerElement = document.getElementById(`${MODULE_ID}-sticker-manager`);
  const menuElement = document.getElementById(MENU_ID);
  const draggedRows = document.querySelectorAll(".fluxee-sticker-manager-row.is-dragging").length;
  const placeholders = document.querySelectorAll(".fluxee-sticker-manager-row-placeholder").length;
  const managerNodes = [
    ...document.querySelectorAll(`#${MODULE_ID}-sticker-manager`),
    ...document.querySelectorAll(`[${managerMarker}='true']`)
  ];
  const managerNodeRects = managerNodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      tag: node.tagName,
      id: node.id || null,
      className: typeof node.className === "string" ? node.className : null,
      connected: node.isConnected,
      hidden: node.hidden,
      pointerEvents: window.getComputedStyle(node).pointerEvents,
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  });

  return {
    managerOpen: Boolean(managerElement?.isConnected),
    managerNodeCount: managerNodes.length,
    managerNodeRects,
    menuOpen: Boolean(menuElement?.isConnected),
    bodyDraggingClass: document.body.classList.contains("fluxee-sticker-manager-dragging"),
    draggedRows,
    placeholders,
    activeElement: document.activeElement?.tagName ?? null,
    activeControl: ui.controls?.control?.name ?? null,
    activeTool: ui.controls?.control?.activeTool ?? null,
    canvasReady: Boolean(canvas?.ready)
  };
}

function removeGhostManagerWindows(exceptNodes = []) {
  const managerMarker = `data-${MODULE_ID}-manager`;
  const managerNodes = [
    ...document.querySelectorAll(`#${MODULE_ID}-sticker-manager`),
    ...document.querySelectorAll(`[${managerMarker}='true']`)
  ];
  const preserved = new Set(exceptNodes.filter(Boolean));
  const removed = [];

  for (const node of managerNodes) {
    if (preserved.has(node)) continue;

    const wrapper = node.closest?.(".window-app, .application") ?? null;
    if (wrapper && preserved.has(wrapper)) continue;

    const target = wrapper ?? node;
    removed.push({
      tag: target.tagName,
      id: target.id || null,
      className: typeof target.className === "string" ? target.className : null
    });
    target.remove();
  }

  if (removed.length) {
    debugLog("Removed ghost Sticker Manager nodes", { removed });
  }

  return removed.length;
}

function scrubAccidentalManagerClasses() {
  const pollutedNodes = [...document.querySelectorAll(".fluxee-sticker-manager-app, .fluxees-ping")];
  const cleaned = [];
  const managerMarker = `data-${MODULE_ID}-manager`;

  for (const node of pollutedNodes) {
    if (node.id === `${MODULE_ID}-sticker-manager`) continue;
    if (node.getAttribute(managerMarker) === "true") continue;

    const removedClasses = [];
    if (node.classList.contains("fluxee-sticker-manager-app")) {
      node.classList.remove("fluxee-sticker-manager-app");
      removedClasses.push("fluxee-sticker-manager-app");
    }
    if (node.classList.contains(MODULE_ID)) {
      node.classList.remove(MODULE_ID);
      removedClasses.push(MODULE_ID);
    }

    if (removedClasses.length) {
      cleaned.push({
        tag: node.tagName,
        id: node.id || null,
        removedClasses
      });
    }
  }

  if (cleaned.length) {
    debugLog("Scrubbed accidental Sticker Manager classes from unrelated nodes", { cleaned });
  }

  return cleaned.length;
}

function getStickerManagerWindowNodes() {
  const managerElement = document.getElementById(`${MODULE_ID}-sticker-manager`);
  const managerWindow = managerElement?.closest?.(".window-app, .application") ?? null;

  return {
    managerElement,
    managerWindow
  };
}

function getEventDebugSummary(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const pathElements = path.filter((entry) => entry instanceof Element);
  const pathSummary = pathElements.slice(0, 6).map((element) => {
    const id = element.id ? `#${element.id}` : "";
    const classNames = typeof element.className === "string"
      ? `.${element.className.trim().split(/\s+/).filter(Boolean).join(".")}`
      : "";
    return `${element.tagName}${id}${classNames}`;
  });

  return {
    type: event.type,
    button: "button" in event ? event.button : null,
    buttons: "buttons" in event ? event.buttons : null,
    ctrlKey: Boolean(event.ctrlKey),
    shiftKey: Boolean(event.shiftKey),
    altKey: Boolean(event.altKey),
    metaKey: Boolean(event.metaKey),
    defaultPrevented: event.defaultPrevented,
    target: event.target?.tagName ?? null,
    pathSummary,
    state: getModuleDebugStateSnapshot()
  };
}

function summarizeElementForDebug(element) {
  if (!(element instanceof Element)) return null;

  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName,
    id: element.id || null,
    className: typeof element.className === "string" ? element.className : null,
    marker: element.getAttribute(`data-${MODULE_ID}-manager`),
    connected: element.isConnected,
    pointerEvents: window.getComputedStyle(element).pointerEvents,
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function getStickerManagerDragDebugSnapshot(application = null) {
  const root = application?.element ?? document.getElementById(`${MODULE_ID}-sticker-manager`);
  const wrapper = root?.closest?.(".window-app, .application") ?? null;
  const list = root?.querySelector?.("[data-sticker-list]") ?? null;
  const rows = list ? [...list.querySelectorAll("[data-sticker-row]")] : [];

  return {
    moduleState: getModuleDebugStateSnapshot(),
    root: summarizeElementForDebug(root),
    wrapper: summarizeElementForDebug(wrapper),
    list: summarizeElementForDebug(list),
    rowCount: rows.length,
    firstRow: summarizeElementForDebug(rows[0] ?? null),
    openWindows: [...document.querySelectorAll(".window-app, .application")]
      .map((element) => summarizeElementForDebug(element))
      .filter(Boolean)
      .slice(0, 20)
  };
}

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.trunc(number));
}

function parseInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function normalizeAnimationStyle(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ANIMATION_STYLE_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_ANIMATION_STYLE;
}

function normalizeSoundVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, numeric));
}

function normalizeStickerDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STICKER_DURATION_MS;
  return Math.max(250, Math.trunc(numeric));
}

function getPathExtension(path) {
  const cleaned = String(path ?? "").trim().toLowerCase().split("?")[0].split("#")[0];
  const dotIndex = cleaned.lastIndexOf(".");
  return dotIndex >= 0 ? cleaned.slice(dotIndex) : "";
}

function getBaseFileName(path) {
  return String(path ?? "").trim().split("/").pop() ?? "";
}

function isVideoStickerPath(path) {
  return getPathExtension(path) === ".webm";
}

function isSupportedStickerMediaPath(path) {
  return SUPPORTED_STICKER_MEDIA_EXTENSIONS.has(getPathExtension(path));
}

function getAnimationStyleOptionsForTemplate(selectedValue) {
  const normalizedValue = normalizeAnimationStyle(selectedValue);
  return ANIMATION_STYLE_OPTIONS.map((option) => ({
    ...option,
    selected: option.value === normalizedValue
  }));
}

function getAnimationStyleOptionsMarkup(selectedValue) {
  return getAnimationStyleOptionsForTemplate(selectedValue)
    .map((option) => `<option value="${option.value}" ${option.selected ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function createStickerRecordFromPath(path, index = 0) {
  const trimmedPath = String(path ?? "").trim();
  if (!trimmedPath || !isSupportedStickerMediaPath(trimmedPath)) return null;

  const fallbackName = trimmedPath.split("/").pop()?.replace(/\.[^.]+$/, "") || `Sticker ${index + 1}`;
  return normalizeSticker({
    id: fallbackName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase(),
    name: fallbackName.replace(/[-_]/g, " "),
    path: trimmedPath,
    sortOrder: index + 1,
    ...createStickerBehaviorDefaults()
  }, index);
}

function sortBundledStickerPaths(paths) {
  const preferredOrderLookup = new Map(
    RELEASE_DEFAULT_STICKER_ORDER.map((fileName, index) => [fileName.toLowerCase(), index])
  );

  return [...paths].sort((left, right) => {
    const leftFileName = getBaseFileName(left).toLowerCase();
    const rightFileName = getBaseFileName(right).toLowerCase();
    const leftPreferredIndex = preferredOrderLookup.get(leftFileName);
    const rightPreferredIndex = preferredOrderLookup.get(rightFileName);

    if (leftPreferredIndex !== undefined && rightPreferredIndex !== undefined) {
      return leftPreferredIndex - rightPreferredIndex;
    }
    if (leftPreferredIndex !== undefined) return -1;
    if (rightPreferredIndex !== undefined) return 1;

    return leftFileName.localeCompare(rightFileName);
  });
}

async function getBundledDefaultStickers() {
  try {
    const result = await FilePicker.browse("public", BUNDLED_ASSET_PATH);
    const files = Array.isArray(result?.files) ? result.files : [];
    const bundled = sortBundledStickerPaths(files
      .filter((path) => isSupportedStickerMediaPath(path))
    )
      .map((path, index) => createStickerRecordFromPath(path, index))
      .filter(Boolean);

    if (bundled.length) {
      debugLog("Discovered bundled sticker media", { count: bundled.length, files });
      return sortStickers(bundled);
    }
  } catch (error) {
    debugLog("Bundled sticker discovery failed; falling back to hardcoded defaults", { error });
  }

  return cloneDefaultStickers();
}

function renderStickerMediaPreviewMarkup(path, altText = "") {
  const safePath = foundry.utils.escapeHTML(String(path ?? "").trim());
  const safeAlt = foundry.utils.escapeHTML(String(altText ?? ""));
  if (!safePath) return "<span>No media</span>";

  if (isVideoStickerPath(safePath)) {
    return `<video src="${safePath}" autoplay loop muted playsinline draggable="false"></video>`;
  }

  return `<img src="${safePath}" alt="${safeAlt}" draggable="false">`;
}

function createStickerMediaElement(path, altText = "", className = "") {
  const normalizedPath = String(path ?? "").trim();
  const safeAlt = String(altText ?? "");

  if (isVideoStickerPath(normalizedPath)) {
    const video = document.createElement("video");
    if (className) video.className = className;
    video.src = normalizedPath;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.draggable = false;
    video.setAttribute("aria-label", safeAlt);
    return video;
  }

  const image = document.createElement("img");
  if (className) image.className = className;
  image.src = normalizedPath;
  image.alt = safeAlt;
  image.draggable = false;
  return image;
}

async function playStickerSound(soundPath, soundVolume = DEFAULT_SOUND_VOLUME, repeatAudio = false, durationMs = DEFAULT_STICKER_DURATION_MS) {
  const src = String(soundPath ?? "").trim();
  if (!src) return () => {};
  const volume = normalizeSoundVolume(soundVolume);
  const loop = Boolean(repeatAudio);
  const duration = normalizeStickerDuration(durationMs);

  try {
    if (!loop && foundry.audio?.AudioHelper?.play) {
      await foundry.audio.AudioHelper.play({ src, volume, loop: false }, false);
      return () => {};
    }
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Failed to play sticker sound through AudioHelper`, error);
  }

  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.loop = loop;
    await audio.play();
    if (loop) {
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, duration);
    }
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Failed to play sticker sound through HTMLAudioElement`, error);
    return () => {};
  }
}

function normalizeSticker(sticker, index = 0) {
  const path = String(sticker?.path ?? "").trim();
  if (!path) return null;

  const fallbackName = path.split("/").pop()?.replace(/\.[^.]+$/, "") || `Sticker ${index + 1}`;
  return {
    id: String(sticker?.id ?? foundry.utils.randomID()),
    name: String(sticker?.name ?? fallbackName).trim() || fallbackName,
    path,
    sortOrder: parseInteger(sticker?.sortOrder, index + 1),
    animationStyle: normalizeAnimationStyle(sticker?.animationStyle),
    soundPath: String(sticker?.soundPath ?? "").trim(),
    soundVolume: normalizeSoundVolume(sticker?.soundVolume),
    repeatAudio: Boolean(sticker?.repeatAudio),
    duration: normalizeStickerDuration(sticker?.duration ?? getConfiguredDefaultStickerDuration()),
    enabled: sticker?.enabled !== false,
    gmOnly: Boolean(sticker?.gmOnly)
  };
}

function sortStickers(stickers) {
  return [...stickers].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name);
  });
}

function parseStickerSetting(rawValue) {
  const value = String(rawValue ?? "").trim();
  debugLog("Parsing sticker setting", { rawValue: value });

  if (!value) {
    debugLog("Sticker setting is blank");
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      debugLog("Sticker setting parsed, but was not an array", { parsed });
      return [];
    }

    const stickers = parsed.map((sticker, index) => normalizeSticker(sticker, index)).filter(Boolean);
    debugLog("Sticker setting parsed successfully", { count: stickers.length });
    return sortStickers(stickers);
  } catch (error) {
    debugLog("Sticker setting JSON parse failed", { error });
    return [];
  }
}

function getResolvedStickers() {
  const stickers = parseStickerSetting(game.settings.get(MODULE_ID, "stickers"));
  if (stickers.length) {
    debugLog("Resolved stickers from saved setting", { count: stickers.length });
    return stickers;
  }

  const defaults = cloneDefaultStickers();
  debugLog("Resolved stickers from bundled defaults", { count: defaults.length });
  return defaults;
}

function stickersMatchByPath(left, right) {
  if (left.length !== right.length) return false;

  const leftPaths = sortStickers(left).map((sticker) => sticker.path);
  const rightPaths = sortStickers(right).map((sticker) => sticker.path);
  return leftPaths.every((path, index) => path === rightPaths[index]);
}

async function setStoredStickers(stickers) {
  const normalized = sortStickers(stickers.map((sticker, index) => normalizeSticker(sticker, index)).filter(Boolean));
  debugLog("Persisting sticker data", { count: normalized.length, stickers: normalized });
  await game.settings.set(MODULE_ID, "stickers", JSON.stringify(normalized));
  Hooks.callAll(`${MODULE_ID}.stickersUpdated`, normalized);
}

async function ensureStickerData() {
  const stickers = parseStickerSetting(game.settings.get(MODULE_ID, "stickers"));
  if (stickers.length) {
    debugLog("Sticker data already valid; no fallback needed", { count: stickers.length });
    return stickers;
  }

  const defaults = await getBundledDefaultStickers();
  debugLog("Sticker data missing or invalid; persisting bundled defaults", { count: defaults.length });
  await setStoredStickers(defaults);
  return defaults;
}

function buildRadialPages(stickers) {
  const visible = sortStickers(stickers).filter((sticker) => sticker.enabled && (!sticker.gmOnly || game.user.isGM));
  const pages = [];
  for (let index = 0; index < visible.length; index += RADIAL_PAGE_SIZE) {
    pages.push({
      pageNumber: Math.floor(index / RADIAL_PAGE_SIZE) + 1,
      segment: 1,
      stickers: visible.slice(index, index + RADIAL_PAGE_SIZE)
    });
  }

  debugLog("Built radial pages", {
    totalVisibleStickers: visible.length,
    totalPages: pages.length
  });

  return pages;
}

function getNextSortOrder(stickers) {
  if (!stickers.length) return 1;
  return Math.max(...stickers.map((sticker) => parseInteger(sticker.sortOrder, 0))) + 1;
}

function createBlankSticker(stickers = []) {
  return {
    id: foundry.utils.randomID(),
    name: "",
    path: "",
    sortOrder: getNextSortOrder(stickers),
    ...createStickerBehaviorDefaults()
  };
}

function getPageNumberForIndex(index) {
  return Math.floor(index / RADIAL_PAGE_SIZE) + 1;
}

function getStickerSenderName() {
  const characterName = game.user?.character?.name?.trim?.();
  if (characterName) return characterName;

  const activeTokens = canvas?.tokens?.controlled ?? [];
  const firstTokenName = activeTokens[0]?.name?.trim?.();
  if (firstTokenName) return firstTokenName;

  const userName = game.user?.name?.trim?.();
  return userName || "Someone";
}

async function createStickerChatMessage(sticker) {
  const stickerName = String(sticker?.name ?? "sticker").trim() || "sticker";
  const senderName = getStickerSenderName();
  const content = `${foundry.utils.escapeHTML(senderName)} sent ${foundry.utils.escapeHTML(stickerName)}.`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({
      actor: game.user?.character ?? null,
      token: canvas?.tokens?.controlled?.[0]?.document ?? null,
      alias: senderName
    })
  });
}

function enrichStickerForTemplate(sticker) {
  return {
    ...sticker,
    animationStyle: normalizeAnimationStyle(sticker.animationStyle),
    animationStyleOptions: getAnimationStyleOptionsForTemplate(sticker.animationStyle),
    soundVolumePercent: Math.round(normalizeSoundVolume(sticker.soundVolume) * 100),
    repeatAudio: Boolean(sticker.repeatAudio),
    duration: normalizeStickerDuration(sticker.duration),
    isVideo: isVideoStickerPath(sticker.path)
  };
}

function renderStickerRowMarkup(sticker) {
  const safe = {
    id: foundry.utils.escapeHTML(sticker.id),
    name: foundry.utils.escapeHTML(sticker.name ?? ""),
    path: foundry.utils.escapeHTML(sticker.path ?? ""),
    sortOrder: Number(sticker.sortOrder) || 1,
    animationStyle: normalizeAnimationStyle(sticker.animationStyle),
    soundPath: foundry.utils.escapeHTML(sticker.soundPath ?? ""),
    soundVolumePercent: Math.round(normalizeSoundVolume(sticker.soundVolume) * 100),
    repeatAudio: Boolean(sticker.repeatAudio),
    duration: normalizeStickerDuration(sticker.duration),
    enabled: sticker.enabled !== false,
    gmOnly: Boolean(sticker.gmOnly)
  };

  return `
    <article class="fluxee-sticker-manager-row" data-sticker-row data-sticker-id="${safe.id}">
      <div class="fluxee-sticker-manager-handle" data-drag-handle title="Drag to reorder" aria-label="Drag to reorder">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="fluxee-sticker-manager-preview">
        ${renderStickerMediaPreviewMarkup(safe.path, safe.name)}
      </div>
      <div class="fluxee-sticker-manager-fields">
        <div class="fluxee-sticker-manager-topline">
          <div class="fluxee-sticker-manager-badges">
            <span class="fluxee-sticker-manager-badge" data-derived="page">Page 1</span>
            <span class="fluxee-sticker-manager-badge fluxee-sticker-manager-badge-muted" data-derived="sort">#${safe.sortOrder}</span>
          </div>
          <div class="fluxee-sticker-manager-row-actions">
            <button type="button" class="fluxee-sticker-manager-preview-button" data-action="preview-sticker">Preview</button>
            <button type="button" class="fluxee-sticker-manager-remove" data-action="remove-sticker">Remove</button>
          </div>
        </div>
        <div class="fluxee-sticker-manager-grid fluxee-sticker-manager-grid-primary">
          <label>
            <span>Name</span>
            <input type="text" data-field="name" value="${safe.name}" placeholder="Skull Warning">
          </label>
          <label>
            <span>Animation Style</span>
            <select data-field="animationStyle">
              ${getAnimationStyleOptionsMarkup(safe.animationStyle)}
            </select>
          </label>
        </div>
        <label class="fluxee-sticker-manager-path">
          <span>Sticker Media</span>
          <div class="fluxee-sticker-manager-path-row">
              <input type="text" data-field="path" value="${safe.path}" placeholder="modules/fluxees-ping/assets/skull.webp">
              <button type="button" data-action="browse-image">Browse</button>
          </div>
        </label>
        <label class="fluxee-sticker-manager-path">
          <span>Sound Effect</span>
          <div class="fluxee-sticker-manager-path-row">
              <input type="text" data-field="soundPath" value="${safe.soundPath}" placeholder="sounds/pop.ogg">
              <button type="button" data-action="browse-sound">Browse</button>
          </div>
        </label>
        <label class="fluxee-sticker-manager-volume">
          <span>Sound Volume</span>
          <div class="fluxee-sticker-manager-volume-row">
            <input type="range" data-field="soundVolume" min="0" max="100" step="1" value="${safe.soundVolumePercent}">
            <output data-derived="soundVolume">${safe.soundVolumePercent}%</output>
          </div>
        </label>
        <label>
          <span>Duration (ms)</span>
          <input type="number" data-field="duration" min="250" step="50" value="${safe.duration}">
        </label>
        <div class="fluxee-sticker-manager-grid fluxee-sticker-manager-grid-secondary">
          <label class="fluxee-sticker-manager-toggle">
            <input type="checkbox" data-field="repeatAudio" ${safe.repeatAudio ? "checked" : ""}>
            <span>Repeat Audio</span>
          </label>
          <label class="fluxee-sticker-manager-toggle">
            <input type="checkbox" data-field="enabled" ${safe.enabled ? "checked" : ""}>
            <span>Enabled</span>
          </label>
          <label class="fluxee-sticker-manager-toggle">
            <input type="checkbox" data-field="gmOnly" ${safe.gmOnly ? "checked" : ""}>
            <span>GM Only</span>
          </label>
        </div>
      </div>
    </article>
  `;
}

class StickerManagerApplication extends StickerManagerBase {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(foundry.utils.deepClone(super.DEFAULT_OPTIONS), {
    id: `${MODULE_ID}-sticker-manager`,
    tag: "div",
    classes: [],
    position: {
      width: 960,
      height: 720
    },
    window: {
      title: "Fluxee's Sticker Manager",
      resizable: true
    }
  }, { inplace: false });

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/sticker-manager.hbs`
    }
  };

  async _prepareContext() {
    const stickers = getResolvedStickers().map((sticker) => enrichStickerForTemplate(sticker));
    debugLog("Rendering Sticker Manager", { stickerCount: stickers.length });
    return {
      stickers,
      hasStickers: stickers.length > 0
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const currentRoot = this.element ?? null;
    const currentWrapper = currentRoot?.closest?.(".window-app, .application") ?? null;
    if (currentRoot) currentRoot.setAttribute(`data-${MODULE_ID}-manager`, "true");
    if (currentWrapper) currentWrapper.setAttribute(`data-${MODULE_ID}-manager`, "true");
    removeGhostManagerWindows([currentRoot, currentWrapper]);
    scrubAccidentalManagerClasses();
    this._clearDragState();
    debugLog("Sticker Manager rendered", getModuleDebugStateSnapshot());
    debugLog("Sticker Manager drag snapshot", getStickerManagerDragDebugSnapshot(this));
    this._bindManagerEvents();
  }

  async close(options) {
    this._clearDragState();
    debugLog("Sticker Manager closing", getModuleDebugStateSnapshot());
    const result = await super.close(options);
    removeGhostManagerWindows();
    scrubAccidentalManagerClasses();
    return result;
  }

  _bindManagerEvents() {
    const root = this.element;
    if (!root) return;

    const form = root.querySelector("[data-sticker-manager-form]");
    const list = root.querySelector("[data-sticker-list]");
    if (!form || !list) return;

    form.addEventListener("submit", (event) => this._onSubmit(event));
    root.addEventListener("click", (event) => this._onClick(event));
    root.addEventListener("change", (event) => this._onChange(event));
    root.addEventListener("pointerdown", (event) => this._onDragPointerDown(event));
    root.addEventListener("dragstart", (event) => this._preventNativeDrag(event));

    this._refreshDerivedFields();
    this._refreshEmptyState();
  }

  _getStickerListElement() {
    return this.element?.querySelector("[data-sticker-list]") ?? null;
  }

  _getStickerRowElements() {
    return [...(this.element?.querySelectorAll("[data-sticker-row]") ?? [])];
  }

  _readStickerFromRow(row, index = 0) {
    const read = (field) => row.querySelector(`[data-field='${field}']`);
    return normalizeSticker({
      id: row.dataset.stickerId,
      name: read("name")?.value,
      path: read("path")?.value,
      sortOrder: index + 1,
      animationStyle: read("animationStyle")?.value,
      soundPath: read("soundPath")?.value,
      soundVolume: Number(read("soundVolume")?.value) / 100,
      repeatAudio: read("repeatAudio")?.checked,
      duration: read("duration")?.value,
      enabled: read("enabled")?.checked,
      gmOnly: read("gmOnly")?.checked
    }, index);
  }

  _collectStickersFromForm() {
    const stickers = this._getStickerRowElements()
      .map((row, index) => this._readStickerFromRow(row, index))
      .filter(Boolean);

    return sortStickers(stickers);
  }

  _populateRows(stickers) {
    const list = this._getStickerListElement();
    if (!list) return;

    list.innerHTML = stickers.map((sticker) => renderStickerRowMarkup(sticker)).join("");
    this._refreshDerivedFields();
    this._refreshEmptyState();
  }

  _appendRow(sticker) {
    const list = this._getStickerListElement();
    if (!list) return;

    list.insertAdjacentHTML("beforeend", renderStickerRowMarkup(sticker));
    this._refreshDerivedFields();
    this._refreshEmptyState();
  }

  _refreshEmptyState() {
    const empty = this.element?.querySelector("[data-empty-state]");
    if (!empty) return;
    empty.toggleAttribute("hidden", this._getStickerRowElements().length > 0);
  }

  _refreshDerivedFields() {
    this._getStickerRowElements().forEach((row, index) => {
      const pageNumber = getPageNumberForIndex(index);
      const sortNumber = index + 1;
      row.dataset.sortOrder = String(sortNumber);
      row.dataset.page = String(pageNumber);

      const pageLabel = row.querySelector("[data-derived='page']");
      const sortLabel = row.querySelector("[data-derived='sort']");
      if (pageLabel) pageLabel.textContent = `Page ${pageNumber}`;
      if (sortLabel) sortLabel.textContent = `#${sortNumber}`;
    });
  }

  _getDragState() {
    if (!this._dragState) this._dragState = {};
    return this._dragState;
  }

  async _onSubmit(event) {
    event.preventDefault();
    const stickers = this._collectStickersFromForm();
    await setStoredStickers(stickers.length ? stickers : cloneDefaultStickers());
    ui.notifications?.info("Sticker Manager saved.");
    await this.render();
  }

  async _onClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    event.preventDefault();
    const action = target.dataset.action;

    if (action === "add-sticker") {
      this._appendRow(createBlankSticker(this._collectStickersFromForm()));
      return;
    }

    if (action === "reset-stickers") {
      const defaults = await getBundledDefaultStickers();
      this._populateRows(defaults);
      return;
    }

    if (action === "remove-sticker") {
      const row = target.closest("[data-sticker-row]");
      if (!row) return;

      const sticker = this._readStickerFromRow(row);
      const stickerName = sticker?.name || "this sticker";
      const confirmed = window.confirm(`Remove "${stickerName}" from Sticker Manager?`);
      if (!confirmed) return;

      row.remove();
      this._refreshDerivedFields();
      this._refreshEmptyState();
      return;
    }

    if (action === "preview-sticker") {
      const row = target.closest("[data-sticker-row]");
      if (row) this._previewStickerRow(row);
      return;
    }

    if (action === "browse-image") {
      this._browseForStickerMedia(target);
      return;
    }

    if (action === "browse-sound") {
      this._browseForSound(target);
      return;
    }
  }

  _onChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;

    if (input.dataset.field === "path") {
      const row = input.closest("[data-sticker-row]");
      const preview = row?.querySelector(".fluxee-sticker-manager-preview");
      if (!preview) return;

      const path = input.value.trim();
      preview.innerHTML = renderStickerMediaPreviewMarkup(path);
      return;
    }

    if (input.dataset.field === "soundVolume") {
      const row = input.closest("[data-sticker-row]");
      const output = row?.querySelector("[data-derived='soundVolume']");
      if (output) output.textContent = `${input.value}%`;
    }
  }

  _preventNativeDrag(event) {
    event.preventDefault();
    debugLog("Prevented native browser drag inside Sticker Manager", {
      target: event.target?.tagName ?? null,
      state: getModuleDebugStateSnapshot()
    });
  }

  _onDragPointerDown(event) {
    if (!(event instanceof PointerEvent)) return;
    if (event.button !== 0 || !event.isPrimary) return;

    const handle = event.target.closest?.("[data-drag-handle]");
    const row = event.target.closest?.("[data-sticker-row]");
    const list = this._getStickerListElement();
    if (!handle || !row || !list) return;

    debugLog("Sticker row drag pointerdown matched manager elements", {
      event: getEventDebugSummary(event),
      dragSnapshot: getStickerManagerDragDebugSnapshot(this),
      matchedHandle: summarizeElementForDebug(handle),
      matchedRow: summarizeElementForDebug(row),
      matchedList: summarizeElementForDebug(list)
    });

    event.preventDefault();
    event.stopPropagation();

    const state = this._getDragState();
    const rowRect = row.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "fluxee-sticker-manager-row fluxee-sticker-manager-row-placeholder";
    placeholder.style.height = `${rowRect.height}px`;
    placeholder.style.width = `${rowRect.width}px`;

    row.parentElement?.insertBefore(placeholder, row);
    document.body.appendChild(row);

    Object.assign(state, {
      row,
      list,
      handle,
      placeholder,
      pointerId: event.pointerId,
      offsetY: event.clientY - rowRect.top,
      offsetX: event.clientX - rowRect.left,
      width: rowRect.width
    });

    row.classList.add("is-dragging");
    row.style.width = `${rowRect.width}px`;
    row.style.left = `${rowRect.left}px`;
    row.style.top = `${rowRect.top}px`;
    row.style.position = "fixed";
    row.style.zIndex = "100000";
    row.style.pointerEvents = "none";
    document.body.classList.add("fluxee-sticker-manager-dragging");

    debugLog("Sticker row drag started", {
      pointerId: event.pointerId,
      stickerId: row.dataset.stickerId,
      state: getModuleDebugStateSnapshot()
    });

    window.addEventListener("pointermove", this._boundDragMove ??= (moveEvent) => this._onDragPointerMove(moveEvent), true);
    window.addEventListener("pointerup", this._boundDragEnd ??= (upEvent) => this._onDragPointerUp(upEvent), true);
    window.addEventListener("pointercancel", this._boundDragCancel ??= (cancelEvent) => this._onDragPointerUp(cancelEvent), true);
    window.addEventListener("blur", this._boundDragBlur ??= () => this._clearDragState(), true);
  }

  _onDragPointerMove(event) {
    const state = this._dragState;
    if (!state?.row || !state?.placeholder || !state?.list) return;
    if (event.pointerId !== state.pointerId) return;

    event.preventDefault();

    const left = event.clientX - state.offsetX;
    const top = event.clientY - state.offsetY;
    state.row.style.left = `${left}px`;
    state.row.style.top = `${top}px`;

    const siblings = [...state.list.querySelectorAll("[data-sticker-row]")];
    let nextSibling = null;

    for (const sibling of siblings) {
      const bounds = sibling.getBoundingClientRect();
      if (event.clientY < bounds.top + bounds.height / 2) {
        nextSibling = sibling;
        break;
      }
    }

    if (nextSibling) {
      if (state.placeholder.nextElementSibling !== nextSibling) {
        state.list.insertBefore(state.placeholder, nextSibling);
      }
    } else {
      state.list.append(state.placeholder);
    }
  }

  _onDragPointerUp(event) {
    const state = this._dragState;
    if (!state?.row || !state?.placeholder) return;
    if (event.pointerId !== state.pointerId) return;

    event.preventDefault();

    state.placeholder.replaceWith(state.row);
    state.row.classList.remove("is-dragging");
    state.row.style.removeProperty("width");
    state.row.style.removeProperty("left");
    state.row.style.removeProperty("top");
    state.row.style.removeProperty("position");
    state.row.style.removeProperty("z-index");
    state.row.style.removeProperty("pointer-events");

    this._refreshDerivedFields();
    debugLog("Sticker row drag ended", {
      pointerId: event.pointerId,
      stickerId: state.row.dataset.stickerId,
      state: getModuleDebugStateSnapshot()
    });
    this._clearDragState();
  }

  _clearDragState() {
    window.removeEventListener("pointermove", this._boundDragMove, true);
    window.removeEventListener("pointerup", this._boundDragEnd, true);
    window.removeEventListener("pointercancel", this._boundDragCancel, true);
    window.removeEventListener("blur", this._boundDragBlur, true);
    document.body.classList.remove("fluxee-sticker-manager-dragging");

    const state = this._dragState;
    if (state?.row) {
      if (state.placeholder?.isConnected) {
        state.placeholder.replaceWith(state.row);
      }
      state.row.classList.remove("is-dragging");
      state.row.style.removeProperty("width");
      state.row.style.removeProperty("left");
      state.row.style.removeProperty("top");
      state.row.style.removeProperty("position");
      state.row.style.removeProperty("z-index");
      state.row.style.removeProperty("pointer-events");
    }

    if (state?.placeholder?.isConnected) {
      state.placeholder.remove();
    }

    this._dragState = null;
    debugLog("Sticker row drag state cleared", getModuleDebugStateSnapshot());
  }

  _browseForStickerMedia(button) {
    const row = button.closest("[data-sticker-row]");
    if (!row) return;

    const pathInput = row.querySelector("[data-field='path']");
    const nameInput = row.querySelector("[data-field='name']");
    const preview = row.querySelector(".fluxee-sticker-manager-preview");

    new FilePicker({
      type: "imagevideo",
      callback: (path) => {
        pathInput.value = path;
        if (!nameInput.value.trim()) {
          nameInput.value = path.split("/").pop()?.replace(/\.[^.]+$/, "")?.replace(/[-_]/g, " ") ?? "";
        }
        preview.innerHTML = renderStickerMediaPreviewMarkup(path, nameInput.value);
      }
    }).render(true);
  }

  _browseForSound(button) {
    const row = button.closest("[data-sticker-row]");
    if (!row) return;

    const soundInput = row.querySelector("[data-field='soundPath']");

    new FilePicker({
      type: "audio",
      callback: (path) => {
        soundInput.value = path;
      }
    }).render(true);
  }

  _previewStickerRow(row) {
    const sticker = this._readStickerFromRow(row, [...row.parentElement.children].indexOf(row));
    if (!sticker) return;

    const preview = row.querySelector(".fluxee-sticker-manager-preview");
    const media = preview?.querySelector("img, video");
    if (!preview || !media) return;

    const animationPreset = stickerPingManagerInstance?._getStickerAnimationPreset(sticker.animationStyle)
      ?? {
        fadeInWindow: 0.16,
        fadeOutStart: 0.72,
        scaleCurve: (progress) => 0.18 + (1.05 * (1 - Math.pow(1 - progress, 3.1))),
        rotationCurve: (progress) => Math.sin(progress * Math.PI) * 8
      };

    const duration = normalizeStickerDuration(sticker.duration);
    const start = performance.now();

    preview.classList.add("is-previewing");
    if (media instanceof HTMLVideoElement) {
      media.currentTime = 0;
      media.play().catch(() => {});
    }
    playStickerSound(sticker.soundPath, sticker.soundVolume, sticker.repeatAudio, sticker.duration);

    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const fadeIn = Math.min(progress / animationPreset.fadeInWindow, 1);
      const fadeOut = progress < animationPreset.fadeOutStart
        ? 1
        : 1 - (progress - animationPreset.fadeOutStart) / (1 - animationPreset.fadeOutStart);
      const alpha = Math.max(0.25, Math.min(fadeIn, fadeOut));
      const scale = animationPreset.scaleCurve(progress);
      const rotation = animationPreset.rotationCurve(progress);

      media.style.opacity = String(alpha);
      media.style.transform = `scale(${scale}) rotate(${rotation}deg)`;

      if (progress < 1) {
        window.requestAnimationFrame(animate);
        return;
      }

      media.style.removeProperty("opacity");
      media.style.removeProperty("transform");
      preview.classList.remove("is-previewing");
    };

    window.requestAnimationFrame(animate);
  }
}

class StickerPingManager {
  constructor() {
    this._interactionState = null;
    this._menuElement = null;
    this._menuPages = [];
    this._currentMenuPage = 0;
    this._rightClickHoldState = null;
    this._suppressContextMenuUntil = 0;
    this._boundHandlers = {
      keydown: this._onKeyDown.bind(this),
      canvasPointerDown: (event) => this._onCanvasPointerDown(event),
      canvasPointerMove: (event) => this._onCanvasPointerMove(event),
      canvasPointerUp: (event) => this._onCanvasPointerUp(event),
      canvasContextMenu: (event) => this._onCanvasContextMenu(event),
      debugCanvasPointerDown: (event) => this._onDebugCanvasPointerDown(event),
      debugCanvasPointerUp: (event) => this._onDebugCanvasPointerUp(event),
      debugCanvasMouseDown: (event) => this._onDebugCanvasMouseDown(event),
      debugCanvasMouseUp: (event) => this._onDebugCanvasMouseUp(event),
      debugCanvasWheel: (event) => this._onDebugCanvasWheel(event)
    };
  }

  initialize() {
    removeGhostManagerWindows();
    scrubAccidentalManagerClasses();
    debugLog("Initializing StickerPingManager");
    game.socket.on(SOCKET_NAME, (payload) => this._onSocketMessage(payload));
    this._attachKeyListener();
    this._attachCanvasTriggerListeners();
    this._attachDebugCanvasListeners();
    window.fluxeesPingDebugState = () => getModuleDebugStateSnapshot();
    window.fluxeesPingDragDebugState = () => getStickerManagerDragDebugSnapshot();
    Hooks.on("canvasReady", () => this._attachKeyListener());
    Hooks.on("canvasReady", () => this._attachCanvasTriggerListeners());
    Hooks.on("canvasReady", () => this._attachDebugCanvasListeners());
    Hooks.on("canvasTearDown", () => this._cleanupInteractionState());
  }

  _attachKeyListener() {
    this._detachKeyListener();
    window.addEventListener("keydown", this._boundHandlers.keydown, true);
    debugLog("Keyboard listener attached");
  }

  _detachKeyListener() {
    window.removeEventListener("keydown", this._boundHandlers.keydown, true);
    debugLog("Keyboard listener detached");
  }

  _cleanupInteractionState() {
    this._clearRightClickHoldState();
    this._interactionState = null;
    this._closeMenu();
  }

  _attachCanvasTriggerListeners() {
    this._detachCanvasTriggerListeners();

    const view = canvas?.app?.view;
    if (!view) return;

    view.addEventListener("pointerdown", this._boundHandlers.canvasPointerDown, true);
    view.addEventListener("pointermove", this._boundHandlers.canvasPointerMove, true);
    view.addEventListener("pointerup", this._boundHandlers.canvasPointerUp, true);
    view.addEventListener("contextmenu", this._boundHandlers.canvasContextMenu, true);
    debugLog("Canvas trigger listeners attached");
  }

  _detachCanvasTriggerListeners() {
    const view = canvas?.app?.view;
    if (!view) return;

    view.removeEventListener("pointerdown", this._boundHandlers.canvasPointerDown, true);
    view.removeEventListener("pointermove", this._boundHandlers.canvasPointerMove, true);
    view.removeEventListener("pointerup", this._boundHandlers.canvasPointerUp, true);
    view.removeEventListener("contextmenu", this._boundHandlers.canvasContextMenu, true);
    debugLog("Canvas trigger listeners detached");
  }

  _onCanvasPointerDown(event) {
    if (!(event instanceof PointerEvent)) return;
    if (event.button !== 2) return;
    if (!game.settings.get(MODULE_ID, "enableRightClickHold")) return;
    if (!canvas?.ready) return;
    if (this._menuElement) return;
    if (!this._isInsideCanvas(event)) return;
    if (!this._isTokenControlActive()) return;

    const interactionState = this._getCurrentCanvasInteractionState();
    if (!interactionState?.origin) return;

    const holdDuration = this._getNumberSetting("holdDuration");
    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: interactionState.clientX,
      clientY: interactionState.clientY,
      origin: interactionState.origin,
      fired: false,
      timer: window.setTimeout(() => this._triggerRightClickHold(), holdDuration)
    };

    this._clearRightClickHoldState();
    this._rightClickHoldState = state;
    debugLog("Started right-click hold tracking", {
      holdDuration,
      pointerId: state.pointerId,
      origin: state.origin
    });
  }

  _onCanvasPointerMove(event) {
    const state = this._rightClickHoldState;
    if (!state) return;
    if (event.pointerId !== state.pointerId) return;
    if (state.fired) return;

    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (distance > RIGHT_CLICK_HOLD_MOVE_TOLERANCE) {
      debugLog("Cancelled right-click hold because pointer moved too far", {
        distance,
        tolerance: RIGHT_CLICK_HOLD_MOVE_TOLERANCE
      });
      this._clearRightClickHoldState();
    }
  }

  _onCanvasPointerUp(event) {
    const state = this._rightClickHoldState;
    if (!state) return;
    if (event.pointerId !== state.pointerId) return;

    if (!state.fired) {
      debugLog("Cancelled right-click hold on pointer release before timer");
      this._clearRightClickHoldState();
    }
  }

  _onCanvasContextMenu(event) {
    if (!game.settings.get(MODULE_ID, "enableRightClickHold")) return;
    if (!this._isInsideCanvas(event)) return;

    const holdTriggered = Boolean(this._rightClickHoldState?.fired);
    const suppressionActive = Date.now() < this._suppressContextMenuUntil;
    if (!holdTriggered && !suppressionActive) return;

    event.preventDefault();
    event.stopPropagation();
    debugLog("Suppressed canvas context menu after right-click hold trigger");
  }

  _triggerRightClickHold() {
    const state = this._rightClickHoldState;
    if (!state) return;
    if (this._menuElement) {
      this._clearRightClickHoldState();
      return;
    }

    state.fired = true;
    this._suppressContextMenuUntil = Date.now() + 750;
    this._interactionState = {
      clientX: state.clientX,
      clientY: state.clientY,
      origin: state.origin
    };

    debugLog("Right-click hold passed guards; opening radial menu", this._interactionState);
    this._openMenuAtState(this._interactionState);
  }

  _clearRightClickHoldState() {
    const state = this._rightClickHoldState;
    if (state?.timer) {
      window.clearTimeout(state.timer);
    }

    this._rightClickHoldState = null;
  }

  _attachDebugCanvasListeners() {
    this._detachDebugCanvasListeners();
    if (!isDebugEnabled()) return;

    const view = canvas?.app?.view;
    if (!view) return;

    view.addEventListener("pointerdown", this._boundHandlers.debugCanvasPointerDown, true);
    view.addEventListener("pointerup", this._boundHandlers.debugCanvasPointerUp, true);
    view.addEventListener("mousedown", this._boundHandlers.debugCanvasMouseDown, true);
    view.addEventListener("mouseup", this._boundHandlers.debugCanvasMouseUp, true);
    view.addEventListener("wheel", this._boundHandlers.debugCanvasWheel, { capture: true, passive: true });
    debugLog("Canvas debug listeners attached", getModuleDebugStateSnapshot());
  }

  _detachDebugCanvasListeners() {
    const view = canvas?.app?.view;
    if (!view) return;

    view.removeEventListener("pointerdown", this._boundHandlers.debugCanvasPointerDown, true);
    view.removeEventListener("pointerup", this._boundHandlers.debugCanvasPointerUp, true);
    view.removeEventListener("mousedown", this._boundHandlers.debugCanvasMouseDown, true);
    view.removeEventListener("mouseup", this._boundHandlers.debugCanvasMouseUp, true);
    view.removeEventListener("wheel", this._boundHandlers.debugCanvasWheel, { capture: true });
    debugLog("Canvas debug listeners detached", getModuleDebugStateSnapshot());
  }

  _onDebugCanvasPointerDown(event) {
    debugLog("Canvas pointerdown observed", getEventDebugSummary(event));
  }

  _onDebugCanvasPointerUp(event) {
    debugLog("Canvas pointerup observed", getEventDebugSummary(event));
  }

  _onDebugCanvasMouseDown(event) {
    debugLog("Canvas mousedown observed", getEventDebugSummary(event));
  }

  _onDebugCanvasMouseUp(event) {
    debugLog("Canvas mouseup observed", getEventDebugSummary(event));
  }

  _onDebugCanvasWheel(event) {
    const summary = getEventDebugSummary(event);
    summary.deltaY = event.deltaY;
    debugLog("Canvas wheel observed", summary);
  }

  _onKeyDown(event) {
    if (event.key === "Escape") {
      debugLog("Escape pressed; closing sticker picker if open");
      this._cleanupInteractionState();
      return;
    }

    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== DEBUG_SHORTCUT_KEY) return;

    debugLog("Ctrl+E detected", {
      canvasReady: Boolean(canvas?.ready),
      activeControl: this._getActiveControlSnapshot(),
      menuOpen: Boolean(this._menuElement),
      currentCanvasPosition: this._getCurrentCanvasInteractionState()
    });

    if (!canvas?.ready) {
      debugLog("Ctrl+E aborted: canvas is not ready");
      return;
    }

    if (!this._isTokenControlActive()) {
      debugLog("Ctrl+E aborted: Token Controls are not active", {
        activeControl: ui.controls?.control?.name ?? null
      });
      return;
    }

    if (this._menuElement) {
      debugLog("Ctrl+E aborted: radial menu is already open");
      return;
    }

    const interactionState = this._getCurrentCanvasInteractionState();
    if (!interactionState?.origin) {
      debugLog("Ctrl+E aborted: no current canvas mouse position could be resolved");
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this._interactionState = {
      clientX: interactionState.clientX,
      clientY: interactionState.clientY,
      origin: interactionState.origin
    };

    debugLog("Ctrl+E passed guards; opening radial menu", this._interactionState);
    this._openMenuAtState(this._interactionState);
  }

  _isTokenControlActive() {
    const snapshot = this._getActiveControlSnapshot();
    const controlName = snapshot?.name?.toLowerCase?.() ?? "";
    const activeTool = snapshot?.activeTool?.toLowerCase?.() ?? "";
    const toolNames = snapshot?.toolNames ?? [];

    if (["token", "tokens"].includes(controlName)) return true;
    if (["select", "target", "ruler"].includes(activeTool)) return true;

    const tokenToolNames = ["select", "target", "ruler"];
    return tokenToolNames.every((tool) => toolNames.includes(tool));
  }

  _getActiveControlSnapshot() {
    const control = ui.controls?.control;
    const toolNames = Array.isArray(control?.tools)
      ? control.tools.map((tool) => tool?.name).filter(Boolean)
      : [];

    return {
      name: control?.name ?? null,
      title: control?.title ?? null,
      activeTool: control?.activeTool ?? null,
      toolNames
    };
  }

  _isInsideCanvas(event) {
    const view = canvas?.app?.view;
    if (!view) return false;
    const bounds = view.getBoundingClientRect();
    return event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
  }

  _getCurrentCanvasInteractionState() {
    if (!canvas?.ready || !canvas?.mousePosition) return null;

    const origin = {
      x: canvas.mousePosition.x,
      y: canvas.mousePosition.y
    };

    const clientPoint = canvas.clientCoordinatesFromCanvas(origin);
    if (!clientPoint) return null;

    const view = canvas?.app?.view;
    if (!view) return null;

    const bounds = view.getBoundingClientRect();
    const isInsideCanvas = clientPoint.x >= bounds.left
      && clientPoint.x <= bounds.right
      && clientPoint.y >= bounds.top
      && clientPoint.y <= bounds.bottom;

    if (!isInsideCanvas) {
      debugLog("Current canvas mouse position resolved outside canvas bounds", {
        origin,
        clientPoint
      });
      return null;
    }

    return {
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      origin
    };
  }

  async _openMenuAtState(interactionState) {
    const stickers = await ensureStickerData();
    this._menuPages = buildRadialPages(stickers);
    this._currentMenuPage = 0;

    debugLog("Resolved sticker data for radial menu", {
      stickerCount: stickers.length,
      visiblePages: this._menuPages.length,
      usedInteractionState: interactionState
    });

    if (!this._menuPages.length || !interactionState?.origin) {
      debugLog("Radial menu aborted because no visible pages or interaction state were missing", {
        interactionState
      });
      ui.notifications?.warn("No enabled stickers are configured for this user.");
      this._cleanupInteractionState();
      return;
    }

    this._closeMenu();

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.className = "fluxee-sticker-menu";
    menu.style.left = `${interactionState.clientX}px`;
    menu.style.top = `${interactionState.clientY}px`;

    document.body.appendChild(menu);
    this._menuElement = menu;
    this._renderMenuPage();

    window.setTimeout(() => {
      window.addEventListener("mousedown", this._dismissMenuOnOutsideClick, true);
    }, 0);
  }

  _dismissMenuOnOutsideClick = (event) => {
    if (!this._menuElement) return;
    if (this._menuElement.contains(event.target)) return;
    debugLog("Clicked outside radial menu; closing");
    this._cleanupInteractionState();
  };

  _closeMenu() {
    window.removeEventListener("mousedown", this._dismissMenuOnOutsideClick, true);
    if (!this._menuElement) return;
    debugLog("Removing radial menu from DOM");
    this._menuElement.remove();
    this._menuElement = null;
    this._menuPages = [];
    this._currentMenuPage = 0;
  }

  _renderMenuPage() {
    if (!this._menuElement) return;

    this._menuElement.replaceChildren();

    const page = this._menuPages[this._currentMenuPage];
    const pageStickers = page?.stickers ?? [];
    const radius = Math.max(86, 32 + pageStickers.length * 6);
    const angleStep = pageStickers.length ? (Math.PI * 2) / pageStickers.length : 0;

    pageStickers.forEach((sticker, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fluxee-sticker-button";
      button.setAttribute("aria-label", sticker.name);
      button.dataset.stickerId = sticker.id;

      const angle = -Math.PI / 2 + angleStep * index;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      button.style.transform = `translate(${x}px, ${y}px)`;

      const image = createStickerMediaElement(sticker.path, sticker.name);
      if (image instanceof HTMLImageElement) {
        image.loading = "eager";
      }

      const label = document.createElement("span");
      label.className = "fluxee-sticker-label";
      label.textContent = sticker.name;

      button.append(image, label);
      button.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        this._selectSticker(sticker);
      });

      this._menuElement.appendChild(button);
    });

    const center = document.createElement("button");
    center.type = "button";
    center.className = "fluxee-sticker-center";
    center.setAttribute("aria-label", this._menuPages.length > 1 ? "Show more stickers" : "Close sticker menu");

    const centerLabel = document.createElement("span");
    centerLabel.className = "fluxee-sticker-center-label";
    centerLabel.textContent = this._menuPages.length > 1 ? "More" : "Close";
    center.appendChild(centerLabel);

    const pageLabel = document.createElement("span");
    pageLabel.className = "fluxee-sticker-center-page";
    pageLabel.textContent = `${this._currentMenuPage + 1}/${this._menuPages.length}`;
    center.appendChild(pageLabel);

    center.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (this._menuPages.length <= 1) {
        this._cleanupInteractionState();
        return;
      }

      this._currentMenuPage = (this._currentMenuPage + 1) % this._menuPages.length;
      debugLog("Advanced sticker radial menu page", {
        page: this._currentMenuPage + 1,
        totalPages: this._menuPages.length
      });
      this._renderMenuPage();
    });

    this._menuElement.appendChild(center);
  }

  _selectSticker(sticker) {
    if (!this._interactionState?.origin) {
      debugLog("Sticker selection aborted because interaction state had no origin", { sticker });
      this._cleanupInteractionState();
      return;
    }

    const payload = {
      imagePath: sticker.path,
      animationStyle: normalizeAnimationStyle(sticker.animationStyle),
      soundPath: String(sticker.soundPath ?? "").trim(),
      soundVolume: normalizeSoundVolume(sticker.soundVolume),
      repeatAudio: Boolean(sticker.repeatAudio),
      duration: normalizeStickerDuration(sticker.duration),
      sceneId: canvas.scene?.id,
      userId: game.user.id,
      x: this._interactionState.origin.x,
      y: this._interactionState.origin.y,
      size: this._getNumberSetting("pingSize")
    };

    debugLog("Sending sticker ping payload", payload);
    this._displayStickerPing(payload);
    playStickerSound(payload.soundPath, payload.soundVolume, payload.repeatAudio, payload.duration);
    game.socket.emit(SOCKET_NAME, payload);
    createStickerChatMessage(sticker).catch((error) => {
      console.error(`${DEBUG_PREFIX} Failed to create sticker chat message`, error);
    });
    this._cleanupInteractionState();
  }

  _onSocketMessage(payload) {
    if (!payload) return;
    if (payload.userId === game.user.id) return;
    if (payload.sceneId !== canvas.scene?.id) return;
    debugLog("Received remote sticker ping payload", payload);
    this._displayStickerPing(payload);
    playStickerSound(payload.soundPath, payload.soundVolume, payload.repeatAudio, payload.duration);
  }

  async _displayStickerPing(payload) {
    if (!canvas?.ready) return;

    const texture = await foundry.canvas.loadTexture(payload.imagePath);
    if (!texture?.valid) return;

    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(payload.x, payload.y);
    sprite.eventMode = "none";
    sprite.alpha = 0;
    sprite.zIndex = 10_000;

    const maxDimension = Number(payload.size) || 160;
    const scale = maxDimension / Math.max(texture.width, texture.height);
    const animationStyle = normalizeAnimationStyle(payload.animationStyle);
    const animationPreset = this._getStickerAnimationPreset(animationStyle);
    sprite.scale.set(scale * animationPreset.startScaleMultiplier);
    const videoSource = texture.baseTexture?.resource?.source;
    if (videoSource instanceof HTMLVideoElement) {
      videoSource.loop = true;
      videoSource.muted = true;
      videoSource.playsInline = true;
      videoSource.play().catch(() => {});
    }

    canvas.stage.sortableChildren = true;
    canvas.stage.addChild(sprite);

    const duration = Math.max(250, Number(payload.duration) || 1600);
    const start = performance.now();

    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const fadeIn = Math.min(progress / animationPreset.fadeInWindow, 1);
      const fadeOut = progress < animationPreset.fadeOutStart
        ? 1
        : 1 - (progress - animationPreset.fadeOutStart) / (1 - animationPreset.fadeOutStart);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const sizeBoost = animationPreset.scaleCurve(progress);
      const angle = animationPreset.rotationCurve(progress);

      sprite.alpha = alpha;
      sprite.scale.set(scale * sizeBoost);
      sprite.angle = angle;

      if (progress < 1) return window.requestAnimationFrame(animate);

      sprite.parent?.removeChild(sprite);
      if (videoSource instanceof HTMLVideoElement) {
        videoSource.pause();
      }
      sprite.destroy();
    };

    window.requestAnimationFrame(animate);
  }

  _getStickerAnimationPreset(animationStyle) {
    const style = normalizeAnimationStyle(animationStyle);

    const presets = {
      none: {
        startScaleMultiplier: 1,
        fadeInWindow: 0.001,
        fadeOutStart: 0.999,
        scaleCurve: () => 1,
        rotationCurve: () => 0
      },
      standard: {
        startScaleMultiplier: 0.18,
        fadeInWindow: 0.16,
        fadeOutStart: 0.72,
        scaleCurve: (progress) => 0.18 + (1.05 * (1 - Math.pow(1 - progress, 3.1))),
        rotationCurve: (progress) => Math.sin(progress * Math.PI) * 8
      },
      pop: {
        startScaleMultiplier: 0.08,
        fadeInWindow: 0.1,
        fadeOutStart: 0.76,
        scaleCurve: (progress) => {
          const eased = 1 - Math.pow(1 - progress, 4.8);
          const overshoot = Math.sin(Math.min(progress, 0.45) / 0.45 * Math.PI) * 0.32;
          return 0.08 + (0.98 * eased) + overshoot;
        },
        rotationCurve: (progress) => Math.sin(progress * Math.PI * 1.15) * 6
      },
      bounce: {
        startScaleMultiplier: 0.06,
        fadeInWindow: 0.12,
        fadeOutStart: 0.74,
        scaleCurve: (progress) => {
          const eased = 1 - Math.pow(1 - progress, 2.5);
          const bounce = Math.abs(Math.sin(progress * Math.PI * 3.6)) * (1 - progress) * 0.44;
          return 0.06 + (0.9 * eased) + bounce;
        },
        rotationCurve: (progress) => Math.sin(progress * Math.PI * 2.2) * 7
      },
      spin: {
        startScaleMultiplier: 0.12,
        fadeInWindow: 0.14,
        fadeOutStart: 0.74,
        scaleCurve: (progress) => 0.12 + (0.98 * (1 - Math.pow(1 - progress, 3.8))),
        rotationCurve: (progress) => (1 - progress) * 140
      },
      fade: {
        startScaleMultiplier: 1.35,
        fadeInWindow: 0.08,
        fadeOutStart: 0.6,
        scaleCurve: (progress) => 1.35 - (0.3 * progress),
        rotationCurve: (progress) => Math.sin(progress * Math.PI * 0.8) * 3
      }
    };

    return presets[style] ?? presets.standard;
  }

  _getNumberSetting(key) {
    return Number(game.settings.get(MODULE_ID, key));
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "stickers", {
    name: "Sticker Data",
    hint: "Stored sticker names and image paths.",
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify(cloneDefaultStickers())
  });

  game.settings.register(MODULE_ID, "imagePaths", {
    name: "Legacy Sticker Paths",
    hint: "Old multiline sticker path setting retained only for one-time migration.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "debugLogging", {
    name: "Enable Debug Logging",
    hint: "Write sticker manager and radial menu debug messages to the browser console while testing.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      debugLog("Debug logging setting changed", getModuleDebugStateSnapshot());
      if (isDebugEnabled()) {
        stickerPingManagerInstance?._attachDebugCanvasListeners();
      } else {
        stickerPingManagerInstance?._detachDebugCanvasListeners();
      }
    }
  });

  game.settings.registerMenu(MODULE_ID, "stickerManager", {
    name: "Sticker Manager",
    label: "Open Sticker Manager",
    hint: "Manage sticker media, animation, sound, and future menu options.",
    icon: "fas fa-icons",
    type: StickerManagerApplication,
    restricted: true
  });

  game.settings.register(MODULE_ID, "pingSize", {
    name: "Sticker Size",
    hint: "Maximum width or height of the sticker ping in pixels.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 48, max: 512, step: 8 },
    default: 144
  });

  game.settings.register(MODULE_ID, "holdDuration", {
    name: "Hold Duration (ms)",
    hint: "How long right-click must be held on the canvas before the sticker radial opens.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 150, max: 1000, step: 25 },
    default: 350
  });

  game.settings.register(MODULE_ID, "enableRightClickHold", {
    name: "Enable Right-Click Hold",
    hint: "Allow holding right-click on the canvas to open the sticker radial. Ctrl+E will still work even if this is off.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "displayDuration", {
    name: "Display Duration (ms)",
    hint: "Default duration for new stickers and bundled sticker resets. Existing stickers keep their own saved duration.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 400, max: 5000, step: 100 },
    default: 1600
  });
});

Hooks.once("ready", async () => {
  debugLog("Foundry ready hook fired");

  const oldPaths = String(game.settings.get(MODULE_ID, "imagePaths") ?? "").trim();
  const currentStickers = parseStickerSetting(game.settings.get(MODULE_ID, "stickers"));

  if (oldPaths && !currentStickers.length) {
    const migrated = oldPaths
      .split(/\r?\n|,/)
      .map((path, index) => normalizeSticker({ path }, index))
      .filter(Boolean);

    if (migrated.length) {
      debugLog("Migrating legacy sticker paths", { count: migrated.length });
      await setStoredStickers(migrated);
    }
  }

  const currentAfterMigration = parseStickerSetting(game.settings.get(MODULE_ID, "stickers"));
  if (currentAfterMigration.length && stickersMatchByPath(currentAfterMigration, cloneDefaultStickers())) {
    const discoveredDefaults = await getBundledDefaultStickers();
    if (!stickersMatchByPath(currentAfterMigration, discoveredDefaults)) {
      debugLog("Refreshing untouched standard stickers from bundled asset folder", {
        previousCount: currentAfterMigration.length,
        newCount: discoveredDefaults.length
      });
      await setStoredStickers(discoveredDefaults);
    }
  }

  await ensureStickerData();
  scrubAccidentalManagerClasses();

  const { managerElement, managerWindow } = getStickerManagerWindowNodes();
  if (managerElement) managerElement.setAttribute(`data-${MODULE_ID}-manager`, "true");
  if (managerWindow) managerWindow.setAttribute(`data-${MODULE_ID}-manager`, "true");

  stickerPingManagerInstance = new StickerPingManager();
  stickerPingManagerInstance.initialize();
});
