/**
 * @typedef {object} TargetTemplateData
 *
 * Internal object tracking template placement state.
 *
 * @property {PlaceablesLayer} activeLayer - The active layer when the preview process began
 * @property {MeasuredTemplateDocument} document - The template document being previewed
 * @property {MeasuredTemplate} object - The template object being previewed
 * @property {number} moveTime - The timestamp of the last move event
 * @property {Application[]} minimizedWindows - An array of windows that were minimized during the preview
 * @property {Promise<{ document: MeasuredTemplateDocument, object: MeasuredTemplate, targets: Token[] }>} promise - The Promise that resolves when the template is confirmed
 * @property {Function} resolve - The function to call when the template is confirmed
 * @property {Function} reject - The function to call when the template is canceled
 */
/** @type {TargetTemplateData} */
let targetTemplate;

/**
 * Creates a preview template for a given configuration, and returns a Promise that resolves when its placement is confirmed.
 *
 * @param {object} templateData - Source data for the template to be placed
 * @returns {Promise<{ document: MeasuredTemplateDocument, object: MeasuredTemplate, targets: Token[] }>}
 */
export async function createTemplateWithPreview(templateData) {
  const activeLayer = canvas.activeLayer;

  const template = await canvas.templates._createPreview(templateData, {
    renderSheet: false,
  });
  template.document._object = template;

  const minimizedWindows = [];
  for (const app of Object.values(ui.windows)) {
    if (!app.minimized) {
      app.minimize();
      minimizedWindows.push(app);
    }
  }

  targetTemplate = {
    activeLayer,
    document: template.document,
    object: template,
    minimizedWindows,
  };

  canvas.stage.on("mousemove", moveTemplate);
  canvas.stage.on("mousedown", confirmTemplate);
  canvas.app.view.addEventListener("wheel", rotateTemplate);
  canvas.app.view.addEventListener("contextmenu", cancelTemplate);

  const { promise, resolve, reject } = Promise.withResolvers();
  Object.assign(targetTemplate, { promise, resolve, reject });
  return promise;
}

/**
 * Deactivates the template preview and its associated event listeners, maximizing previously minimized windows.
 *
 * @param {MouseEvent} event - The event that triggered the deactivation
 * @returns {void}
 */
function deactivateTemplate(event) {
  const { document, object, activeLayer } = targetTemplate;

  if (!object) return;

  event ??= new Event("contextmenu");
  canvas.templates._onDragLeftCancel(event);
  document._object = object;

  canvas.stage.off("mousemove", moveTemplate);
  canvas.stage.off("mousedown", confirmTemplate);
  canvas.app.view.removeEventListener("wheel", rotateTemplate);
  canvas.app.view.removeEventListener("contextmenu", cancelTemplate);

  activeLayer.activate();

  for (const app of targetTemplate.minimizedWindows) {
    app.maximize();
  }
}

/**
 * Cancels the template preview and rejects the associated Promise.
 *
 * @param {MouseEvent} event - The event that triggered the cancellation
 * @returns {void}
 */
function cancelTemplate(event) {
  event.preventDefault();
  deactivateTemplate(event);
  targetTemplate.reject();
}

/**
 * Confirms the template preview and resolves the associated Promise with the template.
 *
 * @param {MouseEvent} event - The event that triggered the confirmation
 * @returns {void}
 */
function confirmTemplate(event) {
  event.stopPropagation();

  targetTemplate.resolve({
    object: targetTemplate.object,
    document: targetTemplate.document,
    targets: acquireTargets(targetTemplate.object),
  });
  deactivateTemplate(event);
}

/**
 * Rotates the template preview based on the mouse wheel delta.
 *
 * @param {WheelEvent} event - The event that triggered the rotation
 * @returns {void}
 */
function rotateTemplate(event) {
  if (event.ctrlKey) event.preventDefault(); // Avoid zooming the browser window
  event.stopPropagation();
  const { document, object } = targetTemplate;
  const delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
  const snap = event.shiftKey ? delta : 5;
  const update = {
    direction: document.direction + snap * Math.sign(event.deltaY),
  };
  document.updateSource(update);
  object.refresh();
}

/**
 * Moves the template preview to the current mouse position, with a minimum interval of 16ms.
 *
 * @param {MouseEvent} event - The event that triggered the movement
 * @returns {void}
 */
function moveTemplate(event) {
  event.stopPropagation();
  const { moveTime, object } = targetTemplate;

  const now = Date.now();
  if (now - (moveTime || 0) < 16) return;
  targetTemplate.moveTime = now;

  const cursor = event.getLocalPosition(canvas.templates);
  const { x, y } = cursor;

  object.document.updateSource({ x, y });
  object.renderFlags.set({ refreshShape: true });
}

/**
 * Acquire target tokens for a template
 *
 * @param {MeasuredTemplate} template - The template for which to acquire targets
 * @returns {Set<Token>} - The set of Token objects which are targeted by the template
 */
export function acquireTargets(template) {
  const { x, y, bounds, shape } = template;
  const candidates = canvas.tokens.quadtree.getObjects(bounds, {
    collisionTest: ({ t: token }) => {
      const shapePolygon =
        shape instanceof PIXI.Polygon ? shape : shape.toPolygon();
      const tokenRect = token.bounds.pad(-canvas.scene.dimensions.size / 4);
      tokenRect.x -= x;
      tokenRect.y -= y;
      const intersections = shapePolygon.intersectRectangle(tokenRect);
      return intersections.points.length > 0;
    },
  });
  return candidates;
}
