

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
  async function createTemplateWithPreview(templateData) {
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
  function acquireTargets(template) {
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

  let previewTemplate = null;
  let lastRangeState = null;

  // Global powers configuration for attack creation
  const POWERS_CONFIG = [
    { name: "Strength Damage", range: "Close", resistance: "Toughness", attackType: "damage"},
    { name: "Strength-based Damage", range: "Close", resistance: "Toughness", attackType: "damage"},
    { name: "Strength Effect", range: "Close", resistance: "Toughness", attackType: "damage"},
    { name: "Affliction", range: "Close", resistance: "Fortitude", attackType: "affliction" },
    { name: "Blast", range: "Ranged", resistance: "Toughness", attackType:"damage"},
    { name: "Damage", range: "Close", resistance: "Toughness", attackType:"damage"},
    { name: "Dazzle", range: "Ranged", resistance: "Will", attackType: "affliction"},
    { name: "Energy Aura", range: "Close", resistance: "Toughness", attackType:"damage" },
    { name: "Energy Control", range: "Ranged", resistance: "Toughness", attackType:"damage" },
    { name: "Magic", range: "Ranged", resistance: "Toughness", attackType:"damage"},
    { name: "Mental Blast", range: "Perception", resistance: "Will", attackType:"damage" },
    { name: "Mind Control", range: "Perception", resistance: "Will", attackType: "affliction"},
    { name: "Nullify", range: "Ranged", resistance: "Will", attackType:"other"},
    { name: "Sleep", range: "Ranged", resistance: "Fortitude", attackType: "affliction"},
    { name: "Snare", range: "Ranged", resistance: "Dodge", attackType: "affliction"},
    { name: "Strike", range: "Close", resistance: "Toughness", attackType:"damage" },
    { name: "Suffocation", range: "Ranged", resistance: "Fortitude", attackType: "affliction"},
    { name: "Weaken", range: "Close", resistance: "Fortitude", attackType: "weaken"},
    { name: "Enhanced Strength", range: "Close", resistance: "Toughness", attackType: "damage"}
  ];



  Hooks.on('ready', () => {
    
    // Add CSS styles for enhanced targeting
    addTargetingStyles();
    
    // Add token hover attack menu system
    setupTokenHoverAttackMenu();
    Hooks.on("renderActorSheet", (app, html, data) => {
    //add convert attack buttons to attack section
      const actor = app.actor;
      if (!actor) return; 	
        
      const attackSection = html.find(".attaque");
      const convertButton = $(`<a class="add" data-type="convert-action">Convert Powers</a>`);
      const deleteConvertButton = $(`<a class="add" data-type="convert-delete-action">Delete then Convert Powers</a>`);
      
      attackSection.append(convertButton);
      attackSection.append(deleteConvertButton);
      
      convertButton.on("click", (event) => {
        event.preventDefault();
        CreateAttacksFromPowers(app.actor, app, false);  
      });
      
      deleteConvertButton.on("click", (event) => {
        event.preventDefault();
        CreateAttacksFromPowers(app.actor, app);  
      });

      // Add Import Speed button to the Speed section
      const speedSection = html.find(".speed");
      const importSpeedButton = $(`<a class="add" data-type="import-speed-action">Import Speed from Powers</a>`);
      
      speedSection.append(importSpeedButton);
      
      importSpeedButton.on("click", (event) => {
        event.preventDefault();
        ImportSpeedFromPowers(app.actor, app);  
      });

    // range field to each attack  
    html.find(".reorderDrop[data-type='attaque']").each((_, el) => {
      const $row = $(el);
      const actor = app.actor;
      const atkId = $row.find(".editAtk").data("id"); // same as your existing code
      if (!atkId) return;

      // Look up this attack by its internal _id (matches your usage)
      const attack = Object.values(actor.system.attaque).find(a => a._id === atkId);
      if (!attack) return;

      // Avoid double-inserting
      if ($row.next(".mm3e-range-field").length) return;

      // Build a small inline field after "Effect" column; store as system.attaque[<key>].range
      const currentVal = attack.range ?? "";
      const $range = $(`
        <div class="mm3e-range-field" style="margin-top: 0px; padding-left: 10px;">
          <label style="font-weight:bold; margin-right:6px;">Range:</label>
          <input type="text" class="mm3e-range-input" value="${currentVal}" 
                placeholder="0"
                style="width: 30px;"/>
        </div>
      `);

      $row.after($range);

      // Persist on change – write to this attack's object
      $range.find(".mm3e-range-input").on("change", async ev => {
        const v = String(ev.currentTarget.value).trim();

        // find the key for this attack object (system.attaque is an object keyed by something)
        const entry = Object.entries(actor.system.attaque).find(([_, a]) => a._id === atkId);
        if (!entry) return;
        const [atkKey] = entry;

        await actor.update({ [`system.attaque.${atkKey}.range`]: v });
      });
      
      // Intercept attack roll buttons for enhanced targeting
      interceptAttackButtons(html, actor);
    });
    });
  }); 

  let targetingMode = false;
  let targetingToken = null;
  let targetingAttack = null;
  let originalCursor = null;
  let currentHoveredToken = null;
  let menuHideTimeout = null;
  
  /**
   * v13 compatible token targeting helper
   * @param {string[]} targetIds - Array of token IDs to target
   */
  async function updateTokenTargetsCompat(targetIds) {
    // Foundry v13+ uses user.targets API instead of updateTokenTargets
    if (game.version && parseInt(game.version.split('.')[0]) >= 13) {
      // v13+ method - use user.targets API (expects actual Token objects)
      const tokens = targetIds.map(id => canvas.tokens.get(id)).filter(t => t);
      game.user.targets.clear();
      tokens.forEach(token => game.user.targets.add(token));
    } else {
      // Pre-v13 method (expects token IDs)
      await game.user.updateTokenTargets(targetIds);
    }
  }
  /**
   * Sets up the token hover attack menu system
   */
  function setupTokenHoverAttackMenu() {
    console.log("Setting up token hover attack menu");
    
    // Use canvas stage mousemove to detect token hovering
    canvas.stage.on('mousemove', onTokenHover);
  }

  /**
   * Handles mouse movement to detect token hovering
   * @param {PIXI.InteractionEvent} event - The mouse move event
   */
  function onTokenHover(event) {
    if (targetingMode) return; // Don't show menus during targeting
    
    // Clear any existing timeout
    if (menuHideTimeout) {
      clearTimeout(menuHideTimeout);
      menuHideTimeout = null;
    }
    
    const pos = event.data.getLocalPosition(canvas.tokens);
    const mouseX = event.data.originalEvent.clientX;
    const mouseY = event.data.originalEvent.clientY;
    
    // Check if mouse is over any attack menu
    const overMenu = document.elementFromPoint(mouseX, mouseY)?.closest('.token-attack-menu');
    
    // If menu is visible, use expanded hover area
    if (currentHoveredToken && document.getElementById(`token-attack-menu-${currentHoveredToken.id}`)) {
      // Expanded hover area - token + menu area + buffer
      const tokenBounds = currentHoveredToken.bounds;
      const expandedBounds = {
        x: tokenBounds.x - 50,
        y: tokenBounds.y - 20,
        width: tokenBounds.width + 100,
        height: tokenBounds.height + 150 // Extra height for menu
      };
      
      const inExpandedArea = pos.x >= expandedBounds.x && 
                            pos.x <= expandedBounds.x + expandedBounds.width &&
                            pos.y >= expandedBounds.y && 
                            pos.y <= expandedBounds.y + expandedBounds.height;
      
      // Stay in expanded area or over menu - keep menu visible
      if (inExpandedArea || overMenu) {
        return;
      }
      
      // Left expanded area - hide menu
      document.querySelectorAll('.token-attack-menu').forEach(menu => menu.remove());
      currentHoveredToken = null;
      return;
    }
    
    // No menu visible - check for token hover with normal token bounds
    const hoveredToken = canvas.tokens.placeables.find(t => {
      const bounds = t.bounds;
      return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
            pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
    });
    
    // Show menu for newly hovered token
    if (hoveredToken && hoveredToken !== currentHoveredToken) {
      document.querySelectorAll('.token-attack-menu').forEach(menu => menu.remove());
      currentHoveredToken = hoveredToken;
      showTokenAttackMenu(hoveredToken);
    }
  }

  /**
   * Shows the attack menu for a token
   * @param {Token} token - The token to show the menu for
   */
  function showTokenAttackMenu(token) {
    // Don't show menu if in targeting mode or if token has no attacks
    if (targetingMode) return;
    
    const actor = token.actor;
    if (!actor || !actor.system.attaque) return;
    
    // Get all attacks for this actor
    const attacks = Object.values(actor.system.attaque).filter(attack => attack.label && attack.label.trim() !== '');
    if (attacks.length === 0) return;
    
    // Remove any existing menu
    hideTokenAttackMenu(token);
    
    // Create menu container
    const menu = document.createElement('div');
    menu.id = `token-attack-menu-${token.id}`;
    menu.className = 'token-attack-menu';
    
    // Position menu under the token
    const tokenRect = token.mesh.getBounds();
    const canvasRect = canvas.app.view.getBoundingClientRect();
    
    // Calculate width based on longest attack name
    const longestAttackName = attacks.reduce((longest, attack) => 
      attack.label.length > longest.length ? attack.label : longest, '').length;
    const menuWidth = Math.max(tokenRect.width, longestAttackName * 8 + 20); // 8px per char + padding
    
    // Position menu down and to the left like a comic caption
    const menuLeft = canvasRect.left + tokenRect.x - 20; // 20px to the left
    
    menu.style.cssText = `
      position: fixed;
      left: ${menuLeft}px;
      top: ${canvasRect.top + tokenRect.y + tokenRect.height + 10}px;
      width: ${menuWidth}px;
      z-index: 1000;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 5px;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 5px;
    `;
    
    // Create attack buttons
    attacks.forEach((attack, index) => {
      const button = document.createElement('button');
      button.className = 'token-attack-button';
      button.textContent = attack.label;
      button.style.cssText = `
        width: 100%;
        height: 32px;
        background: #FFFF99;
        border: 2px solid #000000;
        border-radius: 0px;
        font-family: 'Bangers', cursive;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        color: #000000;
        text-transform: uppercase;
        padding: 6px 12px;
        box-shadow: 3px 3px 0px #000000;
        letter-spacing: 1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: none;
        transition: all 0.1s ease;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      // Add hover effect
      button.addEventListener('mouseenter', () => {
        button.style.background = '#FFB347'; // Orange on hover
        button.style.color = '#000000';
        button.style.borderColor = '#000000';
        button.style.boxShadow = '4px 4px 0px #000000';
        button.style.transform = 'translateY(-1px)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.background = '#FFFF99'; // Back to yellow
        button.style.color = '#000000';
        button.style.borderColor = '#000000';
        button.style.boxShadow = '3px 3px 0px #000000';
        button.style.transform = 'translateY(0px)';
      });
      
      // Add click handler
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTokenAttackMenu(token);
        startEnhancedTargeting(token, attack, event);
      });
      
      menu.appendChild(button);
    });
    
    document.body.appendChild(menu);
  }

  /**
   * Hides the attack menu for a token
   * @param {Token} token - The token to hide the menu for
   */
  function hideTokenAttackMenu(token) {
    const menu = document.getElementById(`token-attack-menu-${token.id}`);
    if (menu) {
      menu.remove();
    }
  }

  /**
   * Adds CSS styles for enhanced targeting functionality
   */
  function addTargetingStyles() {
    if (document.getElementById('mm3e-enhanced-targeting-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'mm3e-enhanced-targeting-styles';
    style.textContent = `
      #targeting-overlay {
        animation: targeting-pulse 2s infinite;
      }
      
      @keyframes targeting-pulse {
        0% { border-color: #ff6b6b; }
        50% { border-color: #ff9999; }
        100% { border-color: #ff6b6b; }
      }
      
      #range-display {
        font-family: 'Bangers', cursive;
        font-size: 16px;
        letter-spacing: 1px;
        text-transform: uppercase;
        text-shadow: 1px 1px 0px #363B44;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
        border: 2px solid #363B44;
      }
      
      .token.targeting-valid {
        filter: drop-shadow(0 0 10px #00ff00);
      }
      
      .token.targeting-invalid {
        filter: drop-shadow(0 0 10px #ff0000);
      }
      
      .mm3e-targeting-cursor-valid {
        cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g stroke="%2300ff00" stroke-width="4" fill="none"><line x1="24" y1="4" x2="24" y2="16"/><line x1="24" y1="32" x2="24" y2="44"/><line x1="4" y1="24" x2="16" y2="24"/><line x1="32" y1="24" x2="44" y2="24"/><circle cx="24" cy="24" r="6"/></g></svg>') 24 24, crosshair !important;
      }
      
      .mm3e-targeting-cursor-invalid {
        cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g stroke="%23ff0000" stroke-width="4" fill="none"><line x1="24" y1="4" x2="24" y2="16"/><line x1="24" y1="32" x2="24" y2="44"/><line x1="4" y1="24" x2="16" y2="24"/><line x1="32" y1="24" x2="44" y2="24"/><circle cx="24" cy="24" r="6"/></g></svg>') 24 24, crosshair !important;
      }
      
      
      /* Style default Foundry notifications with comic book look */
      #notifications .notification {
        background: #FFFF99 !important;
        color: #000000 !important;
        border: 3px solid #000000 !important;
        border-radius: 0px !important;
        box-shadow: 4px 4px 0px #000000 !important;
        font-family: 'Bangers', cursive !important;
        font-weight: bold !important;
        font-size: 16px !important;
        letter-spacing: 1px !important;
        text-transform: uppercase !important;
        text-shadow: none !important;
        padding: 12px 20px !important;
      }
      
      #notifications .notification.warn {
        background: #FFB347 !important;
      }
      
      #notifications .notification.error {
        background: #FFB6C1 !important;
      }
      
      #notifications .notification.info {
        background: #FFFF99 !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Parses multiple effects from a power's notes field
   * @param {Object} power - The power to parse
   * @returns {Array} - Array of parsed effects with their data
   */
  function parseMultipleEffectsFromNotes(power) {
    const notes = power.system.notes || '';
    
    const effects = [];
    
    // Look for H3 tags that contain effect patterns
    const h3Matches = notes.matchAll(/<h3>([^<]+)<\/h3>/g);
    
    for (const h3Match of h3Matches) {
      const h3Content = h3Match[1].trim();
      
      // Check if this H3 contains an effect pattern
      let effectType, effectData;
      
      // Pattern 1: "Effect Name : Effect Type Number" (e.g., "Distracting Moves : Weaken 8")
      const pattern1 = /^([^:]+)\s*:\s*([A-Za-z\s]+)\s+(\d+)$/;
      const match1 = h3Content.match(pattern1);
      
      if (match1) {
        effectType = match1[2].trim();
        effectData = `${match1[2].trim()} ${match1[3]}`;
      } else {
        // Pattern 2: "Effect Type : Effect Type Number" (e.g., "Weaken : Weaken 8")
        const pattern2 = /^([A-Za-z\s]+)\s*:\s*([A-Za-z\s]+)\s+(\d+)$/;
        const match2 = h3Content.match(pattern2);
        
        if (match2) {
          effectType = match2[2].trim();
          effectData = `${match2[2].trim()} ${match2[3]}`;
        } else {
          // Pattern 3: "Effect Type Number" (e.g., "Weaken 8")
          const pattern3 = /^([A-Za-z\s]+)\s+(\d+)$/;
          const match3 = h3Content.match(pattern3);
          
          if (match3) {
            effectType = match3[1].trim();
            effectData = match3[2];
          }
        }
      }
      
      // If we found a valid effect pattern, look for the description
      if (effectType && effectType.length >= 3) {
        const afterH3 = notes.substring(h3Match.index + h3Match[0].length);
        const nextParagraph = afterH3.match(/<p>([^<]+)<\/p>/);
        
        if (nextParagraph) {
          effects.push({
            name: effectType,
            fullName: h3Content,
            data: nextParagraph[1].replace(/<[^>]*>/g, '').trim()
          });
        }
      }
    }
    
    return effects;
  }

  /**
   * Creates a linked attack from multiple effects in notes field
   * @param {Array} effects - Array of parsed effects
   * @param {Actor} actor - The actor
   * @param {Object} originalPower - The original power containing the effects
   */
  async function createLinkedAttackFromMultipleEffects(effects, actor, originalPower) {
    if (effects.length === 0) return;
    
    // Look for an affliction effect
    let afflictionEffect = effects.find(effect => 
      effect.name.toLowerCase().includes('affliction')
    );
    
    // If no affliction found, add one with 0 PL
    if (!afflictionEffect) {
      afflictionEffect = {
        name: 'Affliction',
        fullName: 'Affliction',
        data: 'Affliction 0'
      };
      effects.unshift(afflictionEffect); // Add to beginning
    }
    
    // Use affliction as primary effect
    const primaryEffect = afflictionEffect;
    
    let powerConfig = POWERS_CONFIG.find(config => 
      primaryEffect.name.toLowerCase().includes(config.name.toLowerCase()) ||
      config.name.toLowerCase().includes(primaryEffect.name.toLowerCase())
    );
    
    if (!powerConfig) return;
    
    // Create virtual power for primary effect
    const linkedEffectNote = getEffectNotesForEffectName(originalPower.system.notes, primaryEffect.name);
    
    // Extract power level from effect data
    let effectPowerLevel = 0;
    
    // If this is an empty affliction we created, use 0
    if (primaryEffect.data === 'Affliction 0') {
      effectPowerLevel = 0;
    } else {
      // For real effects, try to extract from the fullName (e.g., "Distracting Moves: Weaken 8" -> 8)
      const fullNameMatch = primaryEffect.fullName.match(/(\d+)/);
      if (fullNameMatch) {
        effectPowerLevel = parseInt(fullNameMatch[1]);
      } else {
        // Fallback to original power's level
        effectPowerLevel = originalPower.system.cout?.total || 0;
      }
    }
    
    const virtualPower = { 
      ...originalPower,
      name: originalPower.name,
      system: {
        ...originalPower.system,
        effetsprincipaux: primaryEffect.name,
        effets: primaryEffect.data,
        notes: linkedEffectNote,
        cout: {
          ...originalPower.system.cout,
          total: effectPowerLevel,
          rang: effectPowerLevel
        }
      }
    };
    
    let save = getSaveFromResistance(virtualPower, powerConfig.resistance);
    let type = getTypeFromPower(virtualPower, powerConfig);
    virtualPower.notes = originalPower.notes + "_____________"
    
    let combatSkill;
    if(type =="combatdistance" || type =="combatcontact"){
      combatSkill = getCombatSkill(actor, virtualPower, type);
    }
    
    let afflictions = undefined;
    if(powerConfig.attackType=="affliction" ){
      afflictions = determineAffliction(powerConfig, virtualPower);
      save = getSaveFromResistance(virtualPower, afflictions.resistedBy);
    }
    let afflictionResults = afflictions ? afflictions.result : null;
      
    // Create the primary attack
    let attack = await createAttack(virtualPower.name, actor, virtualPower, type, save, 20, powerConfig.attackType, combatSkill, afflictionResults, powerConfig);
    attack.save.affliction.effet = virtualPower.system.cout.rang.toString();
    attack.effet = ""
    
    // Link all effects (including weaken, damage, etc.)
    for (let i = 0; i < effects.length; i++) {
      const linkedEffect = effects[i];
      
      // Skip if this is the same as primary effect (affliction)
      if (linkedEffect.name === primaryEffect.name) continue;
      
      const note = originalPower.system.notes;
      const linkedEffectNote = getEffectNotesForEffectName(note, linkedEffect.name);
      
      // Create virtual power for linked effect
      const linkedVirtualPower = {
        ...originalPower,
        name: linkedEffect.name,
        system: {
          ...originalPower.system,
          effetsprincipaux: linkedEffect.name,
          effets: linkedEffect.data,
          notes: linkedEffectNote,
          cout: {
            ...originalPower.system.cout,
            rang: GetRangeForAttack(actor, attack)
          }
        }
      };

      // Use existing saveLinkedAttack logic
      saveLinkedAttack(actor, linkedVirtualPower);
    }
    
    if(attack.isDmg==false){
      const updateData = {
        isDmg: true,
        'repeat.dmg': [
          {value: 0, status: []},
          {value: 0, status: []},
          {value: 0, status: []},
          {value: 0, status: []}
        ],
        'save.dmg': {}
      };
    let lastAttackKey = findAttackLastAttackKey(actor.system.attaque)
      actor.system.attaque[lastAttackKey] = {...actor.system.attaque[lastAttackKey], ...updateData};
      await actor.update({[`system.attaque.${lastAttackKey}`]: actor.system.attaque[lastAttackKey]});
    }
    
  }

  function getEffectNotesForEffectName(notes, effectName){
    // Look for H3 tags containing the effect name, similar to parseMultipleEffectsFromNotes
    const h3Regex = new RegExp(`<h3>([^<]*${effectName}[^<]*)</h3>`, 'i');
    const h3Match = notes.match(h3Regex);
    
    if (h3Match) {
      const fullEffectName = h3Match[1].trim();
      // Extract the effect type (e.g., "Affliction" from "Affliction: Affliction 20")
      const effectType = fullEffectName.split(':')[0].trim();
      
      // Find the corresponding section in the notes
      const sections = notes.split(/<h3>/i);
      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const sectionMatch = section.match(/^([^<]+)</);
        if (sectionMatch && sectionMatch[1].trim().includes(effectName)) {
          // Split into paragraphs and get the data paragraph (second one)
          const paragraphs = section.split('</p>').map(p => p.replace(/<[^>]*>/g, '').trim()).filter(p => p.length > 0);
          if (paragraphs.length >= 2) {
            return paragraphs[1]; // Return the data paragraph
          }
        }
      }
    }
    
    return "";
  }


  /**
   * Gets the Elongation bonus for an actor by checking their powers
   * @param {Actor} actor - The actor to check
   * @returns {number} - The elongation bonus (0 if no elongation found)
   */
  function getElongationBonus(actor) {
    let elongationBonus = 0;
    
    // Check all powers for Elongation
    const powers = actor.items.filter(item => item.type === 'pouvoir');
    
    for (const power of powers) {
      // Check power name
      const powerName = power.name?.toLowerCase() || '';
      const effectName = power.system?.effetsprincipaux?.toLowerCase() || '';
      const description = power.system?.effets?.toLowerCase() || '';
      const notes = power.system?.notes?.toLowerCase() || '';
      
      // Combine all text to search
      const searchText = `${powerName} ${effectName} ${description} ${notes}`;
      
      // Look for "elongation" followed by a number
      const elongationMatch = searchText.match(/elongation\s*(\d+)/i);
      if (elongationMatch) {
        const elongationRank = parseInt(elongationMatch[1], 10);
        elongationBonus = Math.max(elongationBonus, elongationRank);
      }
      
      // Also check extras for Elongation
      if (power.system?.extras) {
        for (const extraKey in power.system.extras) {
          const extra = power.system.extras[extraKey];
          if (extra.name?.toLowerCase().includes('elongation')) {
            const extraMatch = extra.name.match(/elongation\s*(\d+)/i);
            if (extraMatch) {
              const elongationRank = parseInt(extraMatch[1], 10);
              elongationBonus = Math.max(elongationBonus, elongationRank);
            }
          }
        }
      }
    }
    
    return elongationBonus;
  }

  /**
   * Intercepts attack roll buttons to add enhanced targeting functionality
   * @param {jQuery} html - The character sheet HTML
   * @param {Actor} actor - The actor whose sheet is being rendered
   */
  function interceptAttackButtons(html, actor) {
    // Find all attack roll buttons
    html.find('a.roll[data-type="attaque"]').off('click').on('click', async function(event) {
      event.preventDefault();
      event.stopPropagation();
      
      const $button = $(this);
      const attackId = $button.data('id');
      const attackName = $button.data('name');
      
      // Find the actor's token on the canvas
      const token = canvas.tokens.placeables.find(t => t.actor === actor);
      if (!token) {
        ui.notifications.warn("No token found for this character on the canvas.");
        return;
      }
      
      // Get the attack data
      const attack = Object.values(actor.system.attaque).find(a => a._id === attackId);
      if (!attack) {
        ui.notifications.error("Attack not found.");
        return;
      }
      
      // Start enhanced targeting mode
      startEnhancedTargeting(token, attack, event);
    });
  }

  /**
   * Starts the enhanced targeting mode
   * @param {Token} token - The attacking token
   * @param {Object} attack - The attack data
   * @param {Event} originalEvent - The original click event
   */
  function startEnhancedTargeting(token, attack, originalEvent) {
    // If already in targeting mode, exit first
    if (targetingMode) {
      exitTargetingMode();
    }
    
    targetingMode = true;``
    targetingToken = token;
    targetingAttack = attack;
    
    // Clear all existing targets at start of new attack
    game.user.targets.clear()
    
    // Change cursor to crosshair
    originalCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';
    
    // Add targeting overlay
    addTargetingOverlay();
    
    // Add event listeners for targeting
    canvas.stage.on('mousemove', onTargetingMouseMove);
    canvas.stage.on('click', onTargetingClick);
    canvas.stage.on('rightclick', () => exitTargetingMode(true));
    
    // Add escape key listener
    document.addEventListener('keydown', onTargetingKeyDown);
    
    ui.notifications.info(`Targeting mode activated for ${attack.label}. Click to attack, Alt+Click to add target, Right-click or ESC to cancel.`);
  }

  /**
   * Handles mouse movement during targeting mode
   * @param {PIXI.InteractionEvent} event - The mouse move event
   */
  function onTargetingMouseMove(event) {
    if (!targetingMode || !targetingToken || !targetingAttack) return;
    
    // Remove throttling for more responsive grid updates
    
    const pos = event.data.getLocalPosition(canvas.tokens);
    const hoveredToken = canvas.tokens.placeables.find(t => {
      const bounds = t.bounds;
      return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
            pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
    });
    
    // Clear previous token highlights
    canvas.tokens.placeables.forEach(t => {
      if (t !== targetingToken) {
        t.mesh?.removeChild(t.mesh.getChildByName('targeting-highlight'));
      }
    });
    
    // Always update cursor based on position (for area attacks and better UX)
    const worldPos = event.data.getLocalPosition(canvas.stage);
    
    // Calculate distance from token edge to far edge of target square
    const tokenBounds = targetingToken.bounds;
    const gridSize = canvas.grid.size;
    
    // Find which grid square the cursor is in
    const cursorGridX = Math.floor(worldPos.x / gridSize);
    const cursorGridY = Math.floor(worldPos.y / gridSize);
    const tokenGridX = Math.floor(targetingToken.x / gridSize);
    const tokenGridY = Math.floor(targetingToken.y / gridSize);
    
    // Calculate grid square distance (not pixel distance)
    const gridDistanceX = Math.abs(cursorGridX - tokenGridX);
    const gridDistanceY = Math.abs(cursorGridY - tokenGridY);
    let distance;
    if (gridDistanceX === 0 && gridDistanceY === 0) {
      // Same square as token
      distance = 0;
    } else if (gridDistanceX > 0 && gridDistanceY > 0) {
      // Diagonal movement - use 1-2-1-2 rule (5ft-10ft-5ft-10ft pattern)
      const diagonalSquares = Math.max(gridDistanceX, gridDistanceY);
      let totalDistance = 0;
      
      for (let i = 1; i <= diagonalSquares; i++) {
        if (i % 2 === 1) {
          totalDistance += 5; // Odd squares cost 5ft
        } else {
          totalDistance += 10; // Even squares cost 10ft
        }
      }
      distance = totalDistance;
    } else {
      // Straight line movement - normal 5ft per square
      const straightSquares = Math.max(gridDistanceX, gridDistanceY);
      distance = straightSquares * 5;
    }
    const range = getAttackRange(targetingAttack);
    const inRange = isInRange(distance, range);
    
    // Check if this is an area attack
    const isAreaAttack = targetingAttack.area && targetingAttack.area.has;
    
    if (isAreaAttack) {
      // For area attacks, show template preview instead of just cursor color
      updateTemplatePreview(worldPos, inRange);
    } else {
      // For single target attacks, use cursor color
      document.body.style.cursor = 'crosshair';
      document.body.classList.remove('mm3e-targeting-cursor-valid', 'mm3e-targeting-cursor-invalid');
      document.body.classList.add(inRange ? 'mm3e-targeting-cursor-valid' : 'mm3e-targeting-cursor-invalid');
    }
    
    // Get mouse position for distance display
    const mouseX = event.data.originalEvent.clientX;
    const mouseY = event.data.originalEvent.clientY;
    
    // Always show distance text following cursor
    addDistanceDisplay(distance, inRange, mouseX, mouseY);
    
    if (hoveredToken && hoveredToken !== targetingToken) {
      // Add visual highlight to the token
      addTokenHighlight(hoveredToken, inRange);
      
      // Update range display for token beside cursor
      updateRangeDisplay(hoveredToken, distance, range, inRange, mouseX, mouseY);
    } else {
      // Clear range display when not hovering a token
      clearRangeDisplay();
    }
  }

  /**
   * Handles click events during targeting mode
   * @param {PIXI.InteractionEvent} event - The click event
   */
  async function onTargetingClick(event) {
      if (!targetingMode || !targetingToken || !targetingAttack) return;

    const pos = event.data.getLocalPosition(canvas.tokens);
    const clickedToken = canvas.tokens.placeables.find(t => {
      const bounds = t.bounds;
      return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
            pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
    });
    
    const isAltClick = event.data.originalEvent.altKey;
    const isShiftClick = event.data.originalEvent.shiftKey;
    const isAreaAttack = targetingAttack.area && targetingAttack.area.has;
    
    // If shift or alt click on a token, let the original system handle it
    if ((isShiftClick || isAltClick) && clickedToken) {
      // Exit targeting mode first
      exitTargetingMode(false, false);
      
      // Let the original click event propagate to the token
      // This will trigger the normal shift/alt click dialogs
      return;
    }
    
    // Handle area attacks first (they may or may not have a clicked token)
    if (isAreaAttack) {
      const worldPos = event.data.getLocalPosition(canvas.stage);
      const distance = canvas.grid.measureDistance(targetingToken, { x: worldPos.x, y: worldPos.y });
      const range = getAttackRange(targetingAttack);
      const inRange = isInRange(distance, range);
      
      if (inRange) {
        // Store values before clearing targeting mode
        const attackToken = targetingToken;
        const attackData = targetingAttack;
        
        exitTargetingMode();
        
        // Ensure attacker token is controlled before attack
        attackToken.control({ releaseOthers: true });
        
        // For area attacks, place template directly at click location
        await placeTemplateDirectly(attackToken, attackData, worldPos);
        
        // Execute the attack after template placement
        await executeAttack(attackToken, attackData);
      } else {
        ui.notifications.warn(`Target location is out of range (${Math.round(distance / 5) * 5}ft > ${range}ft).`);
      }
    } else if (clickedToken && clickedToken !== targetingToken) {
      // Handle single-target attacks on other tokens
      const squares = canvas.grid.getDirectPath([targetingToken.center, clickedToken.center]).length - 1;
      const distance = squares * canvas.grid.distance;
      const range = getAttackRange(targetingAttack);
      const inRange = isInRange(distance, range);
      
      if (isAltClick && !isShiftClick) {
        // Alt+Click (but not Shift+Alt): Add to targets (targets were cleared when attack button was clicked)
        const currentTargets = Array.from(game.user.targets);
        const targetIds = currentTargets.map(t => t.id);
        
        // Add the new target if not already targeted
        if (!targetIds.includes(clickedToken.id)) {
          targetIds.push(clickedToken.id);
          await updateTokenTargetsCompat(targetIds);
          ui.notifications.info(`${clickedToken.name} added to targets.`);
        } else {
          ui.notifications.info(`${clickedToken.name} is already targeted.`);
        }
      } else if (inRange) {
        // Regular click: Add target and attack (preserve existing Alt+clicked targets)
        const currentTargets = Array.from(game.user.targets);
        const targetIds = currentTargets.map(t => t.id);
        
        // Add the clicked target if not already targeted
        if (!targetIds.includes(clickedToken.id)) {
          targetIds.push(clickedToken.id);
          await updateTokenTargetsCompat(targetIds);
        }
        
        // Store values before clearing targeting mode
        const attackToken = targetingToken;
        const attackData = targetingAttack;
        
        exitTargetingMode(false, false); // Don't clear targets, don't show cancel message
        
        // Ensure attacker token is controlled for single-target attacks
        attackToken.control({ releaseOthers: true });
        
        executeAttack(attackToken, attackData);
      } else {
        // Out of range
        ui.notifications.warn(`${clickedToken.name} is out of range (${Math.round(distance / 5) * 5}ft > ${range}ft).`);
      }
    } else if (clickedToken && clickedToken === targetingToken) {
      // Handle self-targeting
      if (isAltClick && !isShiftClick) {
        // Alt+Click (but not Shift+Alt): Add self to targets
        const currentTargets = Array.from(game.user.targets);
        const targetIds = currentTargets.map(t => t.id);
        
        if (!targetIds.includes(clickedToken.id)) {
          targetIds.push(clickedToken.id);
          await game.user.targets.add(targetIds);
          ui.notifications.info(`${clickedToken.name} added to targets.`);
        } else {
          ui.notifications.info(`${clickedToken.name} is already targeted.`);
        }
      } else {
        // Regular click: Self-target and attack
        const currentTargets = Array.from(game.user.targets);
        const targetIds = currentTargets.map(t => t.id);
        
        if (!targetIds.includes(clickedToken.id)) {
          targetIds.push(clickedToken.id);
          await updateTokenTargetsCompat(targetIds);
        }
        
        const attackToken = targetingToken;
        const attackData = targetingAttack;
        
        attackToken.control({ releaseOthers: true });
        executeAttack(attackToken, attackData);
        exitTargetingMode(false, false); // Don't clear targets, don't show cancel message
      }
    }
  }

  /**
   * Handles keydown events during targeting mode
   * @param {KeyboardEvent} event - The keyboard event
   */
  function onTargetingKeyDown(event) {
    if (event.key === 'Escape' && targetingMode) {
      event.preventDefault();
      event.stopPropagation(); // Prevent ESC from closing Foundry forms
      exitTargetingMode(true, true); // Clear targets and show cancel message when canceling with ESC
    }
  }

  /**
   * Exits targeting mode and cleans up
   * @param {boolean} clearTargets - Whether to clear selected targets (default: false)
   * @param {boolean} showCancelMessage - Whether to show cancellation message (default: true)
   */
  function exitTargetingMode(clearTargets = false, showCancelMessage = true) {
    if (!targetingMode) return;
    
    targetingMode = false;
    
    // Restore cursor and remove targeting classes
    document.body.style.cursor = originalCursor || '';
    document.body.classList.remove('mm3e-targeting-cursor-valid', 'mm3e-targeting-cursor-invalid');
    
    // Remove targeting overlay
    removeTargetingOverlay();
    
    // Clear token highlights
    clearAllTokenHighlights();
    
    // Clear template preview
    clearTemplatePreview();
    
    // Remove event listeners
    canvas.stage.off('mousemove', onTargetingMouseMove);
    canvas.stage.off('click', onTargetingClick);
    canvas.stage.off('rightclick', () => exitTargetingMode(true));
    document.removeEventListener('keydown', onTargetingKeyDown);
    
    // Clear range display
    clearRangeDisplay();
    
    // Clear distance display
    clearDistanceDisplay();
    
    // Clear targets only if requested (when canceling, not when attacking)
    if (clearTargets) {
      game.user.targets.clear();
    }
    
    // Reset variables
    targetingToken = null;
    targetingAttack = null;
    originalCursor = null;
    lastRangeState = null; // Reset range state
    
    if (showCancelMessage) {
      ui.notifications.info("Targeting mode cancelled.");
    }
  }

  /**
   * Gets the range of an attack in feet
   * @param {Object} attack - The attack data
   * @returns {number} - The range in feet
   */
  function getAttackRange(attack) {  
    // Use the range field if it exists, otherwise calculate based on attack type
    if (attack.range && attack.range > 0) {
      return attack.range * 5; // Convert squares to feet (8 squares = 40ft)
    }
    if(attack.type==="combatcontact"){ 
      return  5
    }
    return Infinity; // Default range
  }

  /**
   * Checks if a distance is within range
   * @param {number} distance - The distance in feet
   * @param {number} range - The range in feet
   * @returns {boolean} - True if in range
   */
  function isInRange(distance, range) {
    // Treat range 0 as range 1 (melee range)
    const effectiveRange = range === 0 ? 1 : range;
    return distance <= effectiveRange;
  }

  /**
   * Adds a targeting overlay to the canvas
   */
  function addTargetingOverlay() {
    if (document.getElementById('targeting-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'targeting-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      border: 2px dashed #ff6b6b;
      box-sizing: border-box;
    `;
    document.body.appendChild(overlay);
  }

  /**
   * Removes the targeting overlay
   */
  function removeTargetingOverlay() {
    const overlay = document.getElementById('targeting-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Updates the range display for a hovered token
   * @param {Token} token - The hovered token
   * @param {number} distance - The distance to the token
   * @param {number} range - The attack range
   * @param {boolean} inRange - Whether the token is in range
   * @param {number} mouseX - Mouse X position
   * @param {number} mouseY - Mouse Y position
   */
  function updateRangeDisplay(token, distance, range, inRange, mouseX = 0, mouseY = 0) {
    clearRangeDisplay();
    
    const display = document.createElement('div');
    display.id = 'range-display';
    
    // Position beside cursor with offset to avoid covering it
    const offsetX = 15;
    const offsetY = -10;
    
    display.style.cssText = `
      position: fixed;
      left: ${mouseX + offsetX}px;
      top: ${mouseY + offsetY}px;
      background: ${inRange ? '#90EE90' : '#FFB6C1'};
      color: #000000;
      padding: 8px 12px;
      border-radius: 0px;
      font-family: 'Bangers', cursive;
      font-weight: bold;
      font-size: 16px;
      letter-spacing: 1px;
      text-transform: uppercase;
      text-shadow: none;
      border: 3px solid #000000;
      box-shadow: 4px 4px 0px #000000;
      z-index: 1001;
      pointer-events: none;
      white-space: nowrap;
    `;
    display.innerHTML = `
      Target: ${token.name}<br>
      Distance: ${Math.round(distance / 5) * 5}ft<br>
      Range: ${range === Infinity ? '∞' : range}ft<br>
      Status: ${inRange ? 'IN RANGE' : 'OUT OF RANGE'}
    `;
    document.body.appendChild(display);
  }

  /**
   * Clears the range display
   */
  function clearRangeDisplay() {
    const display = document.getElementById('range-display');
    if (display) {
      display.remove();
    }
  }

  /**
   * Adds a distance display that follows the cursor
   * @param {number} distance - The distance in feet
   * @param {boolean} inRange - Whether the position is in range
   * @param {number} mouseX - Mouse X position
   * @param {number} mouseY - Mouse Y position
   */
  function addDistanceDisplay(distance, inRange, mouseX, mouseY) {
    clearDistanceDisplay();
    
    const display = document.createElement('div');
    display.id = 'distance-display';
    display.style.cssText = `
      position: fixed;
      left: ${mouseX + 10}px;
      top: ${mouseY - 25}px;
      background: none;
      color: ${inRange ? '#00ff00' : '#ff0000'};
      padding: 0;
      border: none;
      box-shadow: none;
      font-family: 'Bangers', cursive;
      font-weight: 900;
      font-size: 18px;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-shadow: 4px 4px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000;
      z-index: 1002;
      pointer-events: none;
      white-space: nowrap;
    `;
    display.textContent = `${Math.round(distance / 5) * 5}ft`;
    document.body.appendChild(display);
  }

  /**
   * Clears the distance display
   */
  function clearDistanceDisplay() {
    const display = document.getElementById('distance-display');
    if (display) {
      display.remove();
    }
  }

  /**
   * Adds a visual highlight to a token
   * @param {Token} token - The token to highlight
   * @param {boolean} inRange - Whether the token is in range
   */
  function addTokenHighlight(token, inRange) {
    if (!token.mesh) return;
    
    // Remove existing highlight
    const existing = token.mesh.getChildByName('targeting-highlight');
    if (existing) {
      token.mesh.removeChild(existing);
    }
    
    // Create new highlight
    const highlight = new PIXI.Graphics();
    highlight.name = 'targeting-highlight';
    
    const color = inRange ? 0x00ff00 : 0xff0000;
    const alpha = 0.3;
    const thickness = 4;
    
    highlight.lineStyle(thickness, color, 1);
    highlight.beginFill(color, alpha);
    highlight.drawRoundedRect(
      -token.w / 2 - thickness,
      -token.h / 2 - thickness,
      token.w + thickness * 2,
      token.h + thickness * 2,
      8
    );
    highlight.endFill();
    
    token.mesh.addChild(highlight);
  }

  /**
   * Clears all token highlights
   */
  function clearAllTokenHighlights() {
    canvas.tokens.placeables.forEach(token => {
      if (token.mesh) {
        const highlight = token.mesh.getChildByName('targeting-highlight');
        if (highlight) {
          token.mesh.removeChild(highlight);
        }
      }
    });
  }

  /**
   * Updates the template preview for area attacks using existing preview system
   * @param {Object} position - World position {x, y}
   * @param {boolean} inRange - Whether the position is in range
   */
  async function updateTemplatePreview(position, inRange) {
    // Only recreate template if range state changed or no template exists
    if (lastRangeState !== inRange || !previewTemplate) {
      // Clear existing preview
      clearTemplatePreview();
      
      // Create template data for preview with position and color
      const templateData = createTemplateData(targetingToken, targetingAttack, position);
      
      // Set color based on range (hard coded: green=in range, red=out of range)
      templateData.fillColor = inRange ? "#ff000080":  "#00ff0080" ; // Semi-transparent green=in, red=out
      
      // Use the existing preview system
      const template = await canvas.templates._createPreview(templateData, {
        renderSheet: false,
      });
      
      // Store reference for cleanup
      previewTemplate = template;
      lastRangeState = inRange;
    } else {
      // Just update position if range state hasn't changed
      previewTemplate.document.updateSource({ x: position.x, y: position.y });
      previewTemplate.refresh();
    }
  }

  /**
   * Clears the template preview
   */
  function clearTemplatePreview() {
    if (previewTemplate) {
      previewTemplate.destroy();
      previewTemplate = null;
    }
  }

  /**
   * Creates template data for a given attack
   * @param {Token} token - The attacking token
   * @param {Object} attaque - The attack data
   * @param {Object} position - Optional position {x, y}. If not provided, creates data for preview
   * @returns {Object} Template data object
   */
  function createTemplateData(token, attaque, position = null) {
    const range = GetRangeForAttack(token, attaque);
    
    // Build template data using existing logic
    let pwr = token.actor.items.get(attaque.links.pwr);
    let distance = 0;
    
    if (pwr) {
      const extras = pwr.system.extras;
      for (const key in extras) {
        const extra = extras[key];
        if (extra.name && (extra.name.includes("Area") || extra.name.includes("Cone") || extra.name.includes("Burst") || extra.name.includes("Line"))) {
          const regex = /(\d+)\s*ft\./i;
          const match = extra.name.match(regex);
          if (match) {
            distance = parseInt(match[1], 10) / 5;
            break;
          } else {
            if (extra.name.includes("Cone")) distance = 60/5;
            else if (extra.name.includes("Burst")) distance = 30/5;
            else if (extra.name.includes("Line")) distance = 30/5;
          }
        }
      }
    } else {
      distance = 3;
    }
    
    let templateDistance = distance;
    let t = "circle";
    let width = undefined;
    
    if (range === "Line") {
      t = "ray";
      templateDistance = templateDistance * 2;
      width = 2;
    } else if (range === "Cone") {
      t = "cone";
    } else if (range === "Burst") {
      t = "circle";
    }
    
    // Create base template data
    const templateData = {
      t: t,
      distance: templateDistance * canvas.scene.grid.size / 50,
      width: width,
      fillColor: "#FF0000",
    };
    
    // Add position if provided (for direct placement)
    if (position) {
      templateData.x = position.x;
      templateData.y = position.y;
      templateData.direction = 0; // Default direction, could be enhanced later
    }
    
    return templateData;
  }

  /**
   * Places a template directly at the specified location without user interaction
   * @param {Token} token - The attacking token
   * @param {Object} attaque - The attack data
   * @param {Object} position - The world position {x, y} where to place the template
   */
  async function placeTemplateDirectly(token, attaque, position) {

    const templateData = createTemplateData(token, attaque, position);
    const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    
    // Switch canvas layer back to tokens immediately after template creation
    canvas.tokens.activate();

    // Follow the exact same pattern as PlaceTemplateAndTargetActors
    await game.user.targets.clear();
    let targetedIds = [];
    
    // Wait for template to be fully processed (same as original code)
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Get targets from the template (using the same method as original - find our template in placeables)
    const ourTemplate = canvas.templates.placeables.find(t => t.document.id === template.id);
    const targets = acquireTargets(ourTemplate);
    
    // Build target IDs array (same as original)
    for (let token of targets) {
      targetedIds.push(token.id);
    }
    
    // Update token targets
    await updateTokenTargetsCompat(targetedIds);
    
    // Control the attacking token
    
    
    // Set up for attack execution
    
    // Clean up template after delay
    setTimeout(() => {
      template.delete();
      
      // Exit targeting mode and return to normal token selection
      if (targetingMode) {
        exitTargetingMode(false, false); // Don't clear targets, don't show cancel message
      }
      
      // Switch canvas layer back to tokens
      canvas.tokens.activate();
    }, 10000);
  }

  /**
   * Executes the attack with current targets
   * @param {Token} attackToken - The attacking token
   * @param {Object} attackData - The attack data
   */
  async  function executeAttack(attackToken, attackData) {
    // Use parameters if provided, otherwise fall back to global variables
    const token = attackToken || targetingToken;
    const attack = attackData || targetingAttack;
    
    if (!token || !attack) {
      console.error("executeAttack: Missing token or attack data", { token, attack });
      return;
    }
    
    const actor = token.actor;
    
    // Use the existing MM3E attack system
    const targets = Array.from(game.user.targets);
    if (targets.length === 0) {
      ui.notifications.warn("No targets selected.");
      return;
    }
    
    // Ensure the attacker token is selected for animations
    token.control({ releaseOthers: true });
    
    // Use the MM3E system's RollMacro function directly
    await game.mm3.RollMacro(
      actor._id,
      actor.isToken ? canvas.scene?._id : 'null',
      actor.isToken ? token._id : 'null',
      'attaque',
      'attaque',
      attack._id,
      actor.type,
      { altKey: false, shiftKey: false } // Default event options
    );
  }

  //check range of attack
  Hooks.on('rollAttack',  (atk, token,strategie, altKey) => {  
    console.log("hooking into attack  " + atk);
    console.log("hooking for token  " + token);

    const targets = game.user.targets;
    if (targets.size===0){
      (async ()=> {
      await animateTextBesideTarget(token, `No Targets selected`, "orange")
      })()
      return
    }
      for(let target of targets){
        const distance = canvas.grid.measureDistance(token, target);
        //if defense is dodge
        if(atk.type === "combatdistance") { 
          if(distance > atk.range * 5){
          //unset target
            target.setTarget(false, { user: game.user, releaseOthers: false });
            //wra[ in anon async func]
            (async () => {
            await animateTextBesideTarget(target, `Target ${target.name} out of range, `, "red")
        
          await animateTextBesideTarget(target, `${target.name} removed from targets..`, "red")
              ui.notifications.warn(`Target ${target.name} out of range, removed from targets.`);
            })();
            return;
          }
        }
      }
  });

  // Speed calculation function using MM3E measures rank table
  function calculateTacticalSpeedFromRank(powerLevel) {
    const system = game.settings.get("mutants-and-masterminds-3e", "measuresystem");
    
    const metric = {};
    let factor = 1
    let speed = 0
      if(powerLevel < 7){
        factor = 1
      }
      if(powerLevel >= 7 && powerLevel <= 9 ){
        factor = 1.5
      }
      if(powerLevel >= 10 && powerLevel <= 12 ){
        factor = 2
      }
      if(powerLevel >= 13 && powerLevel <= 16 ){
        factor = 3
      }
      if(powerLevel >= 17 ){
        factor = 4
      }
      speed = factor * powerLevel * 5

    return speed;
  }

  function calculateOutOfCombatSpeedFromRank(powerLevel) {
    // MM3E Measures table - distance values (feet per 4 seconds)
    const distanceTable = {
      "-5": 0.5, "-4": 1, "-3": 3, "-2": 6, "-1": 15, "0": 30,
      "1": 60, "2": 120, "3": 250, "4": 500, "5": 1000, "6": 2000,
      "7": 4000, "8": 8000, "9": 16000, "10": 32000, "11": 64000,
      "12": 125000, "13": 250000, "14": 500000, "15": 1000000,
      "16": 2000000, "17": 4000000, "18": 8000000, "19": 16000000,
      "20": 32000000, "21": 64000000, "22": 125000000, "23": 250000000,
      "24": 500000000, "25": 1000000000, "26": 2000000000, "27": 4000000000,
      "28": 8000000000, "29": 16000000000, "30": 32000000000
    };
    
    let feetPer4Seconds;
    
    if (powerLevel <= 30) {
      feetPer4Seconds = distanceTable[powerLevel] || 0;
    } else {
      // For ranks above 30, double the previous value for each rank
      feetPer4Seconds = distanceTable[30];
      for (let i = 30; i < powerLevel; i++) {
        feetPer4Seconds = feetPer4Seconds * 2;
      }
    }
    
    // Convert from feet per 4 seconds to miles per hour
    // 4 seconds = 1/900 of an hour (3600 seconds / 4 = 900)
    // So multiply by 900 to get feet per hour, then divide by 5280 to get miles per hour
    const milesPerHour = (feetPer4Seconds * 900) / 5280;
    
    return milesPerHour;
  }

  async function ImportSpeedFromPowers(actor = canvas.tokens.controlled[0]?.actor, app = null) {
    if (!actor) {
      console.log("No actor selected.");
      return;
    }
    
    console.log("Importing speed from powers for actor:", actor.name);
    
    // Get character powers
    let characterPowers = actor.pouvoirs;
    let linkedPowers = actor.pwrLink;
    
    if (!characterPowers || characterPowers.length === 0) {
      ui.notifications.warn("No powers found on this character.");
      return; 
    }
    
    // Delete existing movement entries except base running and swimming
    await deleteNonBasicMovements(actor);
    
    // Process each power to find movement powers
    let movementPowers = [];
    
    for (let power of characterPowers) {
      let linkedPower = actor.pwrLink[power._id];
      
      // Check linked powers first
      if (linkedPower && linkedPower.length > 0) {
        for (let key = 0; key < linkedPower.length; key++) {
          let childPower = linkedPower[key];
          let movementType = identifyMovementPower(childPower);
          if (movementType) {
            movementPowers.push({
              power: childPower,
              type: movementType,
              rank: childPower.system.cout.rang
            });
          }
        }
      }
      
      // Check main power
      let movementType = identifyMovementPower(power);
      if (movementType) {
        movementPowers.push({
          power: power,
          type: movementType,
          rank: power.system.cout.rang
        });
      }
    }
    
    if (movementPowers.length === 0) {
      ui.notifications.info("No movement powers found on this character.");
      return;
    }
    
    // Create movement entries for each movement power found
    await createMovementEntries(actor, movementPowers);
    
    ui.notifications.info(`Imported ${movementPowers.length} movement power(s) to speed section.`);
  }

  function identifyMovementPower(power) {
    const effectName = power.system.effetsprincipaux || power.name || "";
    const powerName = power.name || "";
    
    // MM3E Movement Powers
    const movementPowers = [
      { names: ["Flight", "Fly"], type: "Flight" },
      { names: ["Speed", "Super-Speed"], type: "Speed" },
      { names: ["Swimming", "Swim"], type: "Swimming" },
      { names: ["Teleport", "Teleportation"], type: "Teleport" },
      { names: ["Leaping", "Leap", "Super-Leap"], type: "Leaping" },
      { names: ["Movement"], type: "Movement" }
    ];
    
    for (let movePower of movementPowers) {
      for (let name of movePower.names) {
        if (effectName.toLowerCase().includes(name.toLowerCase()) || 
            powerName.toLowerCase().includes(name.toLowerCase())) {
          return movePower.type;
        }
      }
    }
    
    return null;
  }

  async function deleteNonBasicMovements(actor) {
    const vitesseList = actor.system.vitesse?.list || {};
    let updates = {};
    
    for (let [key, movement] of Object.entries(vitesseList)) {
      // Keep base running and swimming (these usually have autotrade set or specific labels)
      const label = movement.label?.toLowerCase() || "";
      const autotrade = movement.autotrade || "";
      
      // Don't delete base movement types
      if (key === "base" || 
          autotrade === "course" || 
          autotrade === "natation" ||
          label.includes("running") || 
          label.includes("course") ||
          (label.includes("swimming") || label.includes("natation")) && movement.rang <= 0) {
        continue;
      }
      
      // Delete this movement entry
      updates[`system.vitesse.list.-=${key}`] = null;
    }
    
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
  }

  async function createMovementEntries(actor, movementPowers) {
    const vitesseList = actor.system.vitesse?.list || {};
    const existingKeys = Object.keys(vitesseList);
    
    let updates = {};
    
    for (let movePower of movementPowers) {
      const newKey =movePower.type.toLowerCase();
      
      // Calculate speeds using the rank table 
      const rank = movePower.rank;
      const perRoundFeet = calculateTacticalSpeedFromRank(rank); // Tactical movement in feet per round

      // Out-of-combat speed calculation (already returns miles per hour) round to  decimal places only if less than 1
      let  mphValue = calculateOutOfCombatSpeedFromRank(rank);
      if (mphValue < 1) {
        mphValue = mphValue.toFixed(1);
      } else {
        mphValue = mphValue.toFixed(0);
      }

      
      
      updates[`system.vitesse.list.${newKey}`] = {
        'canDel': true,
        'label': movePower.type,
        'rang': rank,
        'round': perRoundFeet,
        'kmh': mphValue,
        'selected': false
      };
    }
    
    //select the movePower with the fastest speed across the list
    //including base running and swimming
    const allSpeeds = {
      base: actor.system.vitesse.list.base.round,
      running: actor.system.vitesse.list.course.round,
      swimming: actor.system.vitesse.list.natation.round,
      ...Object.fromEntries(Object.entries(updates).map(([key, speed]) => [key, speed.round]))
    };

    const fastestSpeed = Math.max(...Object.values(allSpeeds));

    await actor.update({
      ...updates,
      'system.vitesse.list.base.selected': (allSpeeds.base === fastestSpeed),
      'system.vitesse.list.course.selected': (allSpeeds.running === fastestSpeed),
      'system.vitesse.list.natation.selected': (allSpeeds.swimming === fastestSpeed)
    });

  
  for (let key in actor.system.vitesse.list) {
    if(actor.system.vitesse.list[key].round === fastestSpeed)
    {
      let path =  "system.vitesse.list." + key + ".selected"
        await actor.update({ [`system.vitesse.list.${key}.selected`]: true });
    }
  }
  }

  window.ImportSpeedFromPowers = ImportSpeedFromPowers;
  async function animateTextBesideTarget (token, text,color,size = 0) {
    if(!size){
        size = 32
    }
    const style = {
        "fill": color,
        "fontFamily": "Bangers",
        "fontSize": size,
        "strokeThickness": 4,
        "textAnchor": "left"
    }
    if(!text)  
    {
        return
    }
    if(typeof text === "number"){
        text = String(text)
    }
    new Sequence()  
    .effect()
    .text(text, style) // Sets the text
    .atLocation(token) // Starts at the token's location
    .spriteOffset({x:0, y: - 100})
    .fadeIn(100) // Fades in
    .fadeOut(1200) 
    .moveTowards({ x: token.x + 75, y: token.y - 100 }, { delay: 2000,moveSpeed: .2, ease: "easeInOutQuad", rotate: false }) // Moves down without rotating

  //  .moveTowards({ x: token.x, y: token.y + 500 }, { duration: 2000 , rotate: false}) // Moves downward
    // Fades out as it disappears
    .play();

    await new Promise(resolve => setTimeout(resolve, 3000));

  }



  function GetRangeForAttack(token, attaque) {
    let pwr="";
    let actor
    if(!token.actor)
      actor = token
    else
      actor = token.actor
    if(actor){
      pwr = actor.items.get(attaque.links.pwr) //why doesnt attaque.pwr work?
    }
      let range = undefined;
      if (attaque.save.passive.type == 'parade') {
          range = 'Melee';
      } else {
          range = 'Ranged';
      }
      if (attaque.area.has == true) {
          range = 'Area';
      }
      if (range === 'Area') {
          if (pwr) {
              range = getAreaShape(pwr); 
          } else {
          //    ui.notifications.warn("You have not associated this attack to a power. Area attacks must belinked to a power with an Area Extra that specifies the shape eg: Area 15ft-Burst, Defaulting to Burst ");
              range = "Burst"
          }
      }
      return range;
  }

  function getAreaShape(matchingPower) {
      for (const key in matchingPower.system.extras) {
          const item = matchingPower.system.extras[key];
          if (item.name && item.name.includes("Cone")) {
              return "Cone"
          }
          if (item.name && item.name.includes("Line")) {
              return "Line"
          }
          if (item.name && item.name.includes("Burst")) {
              return "Burst"
          }
      }
      return "Burst"
  }


  //add range to system.attack for all actors in system
  /*Hooks.once('ready', async function () {
  
    /* for (const actor of game.actors) {
        const atkRoot = actor.system?.attaque;
        if (!atkRoot || typeof atkRoot !== "object") continue;

        // Build minimal update patch with only missing range fields
        const patch = {};
        for (const [key, atk] of Object.entries(atkRoot)) {
          if (atk && typeof atk === "object" && atk.range === undefined  || atk.range =="" || atk.range == 0  ) {
        let range = 0 
        if(atk.save.passive.type === 'esquive'){
          let effect = atk.effet
          if(atk.name && atk.name.includes('Strength')){
            effect += actor.system.caracteristique.force.total
          }
          let factor = 1
          if(effect < 7){
            factor = 2
          }
          if(effect >= 7 && effect <= 9 ){
            factor = 3
          }
          if(effect >= 10 && effect <= 12 ){
            factor = 4
          }
          if(effect >= 13 && effect <= 16 ){
            factor = 5
          }
          if(effect >= 17 ){
            factor = 6
          }
          range = factor * effect
        }
        
          if(actor.system.attaque[key]){
              patch[`system.attaque.${key}.range`] = range; // default: empty string (manual entry)
        }
          }
        }
        if (Object.keys(patch).length) {
          try { await actor.update(patch, { diff: true }); } catch (e) { console.error(e); }
        }
      }
    
  });*/

  Hooks.on('renderActorDirectory', async function () {
    if(!game.user.isGM) return;
    addCreateAttackFomPowerButtonToActorDirectory()
  });

  function addCreateAttackFomPowerButtonToActorDirectory(setting) {
    let addHtml = ``;


    $("section#actors footer.action-buttons").append(`<button class='convert-attack' ${addHtml}>${game.i18n.localize("MM3.IMPORTATIONS.ConvertFrom")}</button>`);

    $("section#actors footer.action-buttons button.convert-attack").on( "click", async function() {
      new Dialog({
        title: "Warning",
        content: "<p>Warning this will replace attacks in all characters in open folders with ones converted from character abilities?</p>",
        buttons: {
          ok: {
            label: "OK",
            callback: () => CreateAttackForAllCharacters() 
          },
          cancel: {
            label: "Cancel",
            callback: () => console.log("User clicked OK.")
          } 
        },
        default: "cancel",
      }).render(true);
      
    });
  }



  async function CreateAttackForAllCharacters(){
    for (actor of game.actors.contents){
    if (actor.folder && actor.folder.expanded) {

      actor.sheet.render(true);
      await CreateAttacksFromPowers(actor,null, true).then(() => {
          console.log(`CreateAttacksFromPowers applied to ${actor.name}`);
        }).catch(err => {
          console.error(`Error applying CreateAttacksFromPowers to ${actor.name}:`, err);
        });
      }
      actor.sheet.close();
    };
  }
  window.CreateAttackForAllCharacters = CreateAttackForAllCharacters; 


  async function CreateAttacksFromPowers(actor = canvas.tokens.controlled[0]?.actor, app = null,deleteExistingAttacks = true){
    if (!actor) {
      console.log("No actor selected.");
      return;
    }
    console.log("actor selected. We do this ya ya ya !");
    let context={}
    context.actor = actor;
    context.items = actor.items;

    if(app){
        app._prepareCharacterItems(context);
    }
  //  new PersonnageActorSheet()._prepareCharacterItems(context);
    
    if(deleteExistingAttacks){
      await deleteAllAttacks(actor);
    }

    

    
    let characterPowers = actor.pouvoirs;
    let linkedPowers = actor.pwrLink;
    console.log("linked power " + linkedPowers);
  
    for (let power of characterPowers) {
      console.log("power " + power);
      let linkedPower = actor.pwrLink[power._id]
      if(linkedPower.length > 0 ){
        for (let key = 0; key < linkedPower.length; key++) {
          let childPower = linkedPower[key];
          await createAttackDetailsFromPower(childPower,actor);
        }
      }
      if(power.system.effetsprincipaux!=""){
        await createAttackDetailsFromPower(power,actor)
    }
        else{
        //  ui.notifications.warn("ypu must specify an Effect for the power  " + power.name + " if you want to convert it\\n\\n Valid effects are Blast, Damage, Dazzle, Energy Aura, Energy Control, Magic, Mental Blast, Mind Control, Nullify, Sleep, Strike, Suffocation");
        
      }
    }
      
  }
  window.CreateAttacksFromPowers = CreateAttacksFromPowers;
  

  async function deleteAllAttacks(selectedActor) {
    const attackKeys = Object.keys(selectedActor.system.attaque);
    let updateData = {};
    attackKeys.forEach(key => {
      updateData[`system.attaque.-=${key}`] = null;
    });
    return await selectedActor.update(updateData);
  }

  async function createUnarmedAttack(actor){
    const attacks = actor.system.attaque;
    let attackName ="Close Combat (Unarmed)";
    let unarmedCombatSkill = findSkillByLabel(actor.system.competence.combatcontact, attackName);
    if(!unarmedCombatSkill){
      attackName ="Unarmed"
      unarmedCombatSkill = actor.system.competence.combatcontact.list[0];
    }
    let effect = actor.system.caracteristique.force.total;
    
    let characterPowers = actor.pouvoirs;
    for (let power of characterPowers) {
      let linkedPower = actor.pwrLink[power._id]
      if(linkedPower.length > 0 ){
        for (let key = 0; key < linkedPower.length; key++) {
          let childPower = linkedPower[key];
          if(childPower.system.effetsprincipaux.toLowerCase().includes("STR Strength-Damage")){
            effect += childPower.system.cout.rang;
          }
        }
      }
      else{
        if(power.system.effetsprincipaux.toLowerCase().includes("STR Strength-Damage")){
          effect += power.system.cout.rang;
        }
      }
    }

    //create a dummy matching power for the unarmed attack
    let matchingPower = {actor:actor, _id:"", name: attackName, system: { cout: {rang: effect}}}
    let attack = await createAttack("Unarmed", actor,matchingPower, "combatcontact", "robustesse" , 20, 'damage',unarmedCombatSkill)

    let foundKey;
    for (let [key, item] of  Object.entries(actor.system.attaque) )
    {
      if (item["_id"] === attack._id) {
        foundKey = key;
        break; 
    }
    }
    
    new Promise(resolve => setTimeout(resolve, 1000));
    let updates={};
    updates[`system.attaque.${foundKey}.label`] = attack.label+" ";
    await actor.update(updates);
  }
  let linkNextPower =false;

  function getSaveFromResistance(matchingPower, resistance)
  {
    //first check notes for "Resisted by: <resistance>"
    const notes = matchingPower.system.notes;
    const regex = /Resisted by: ([^,]+)/;
    let match = notes.match(regex);
    if(match){
      resistance = match[1];
    }
    //also check notes for "Alternate Resistance: <resistance>"
    const regex2 = /Alternate Resistance: ([^,]+)/;
    match = notes.match(regex2);
    if(match){
      resistance = match[1];
    }
    //then check extras for "Alternate Resistance: <resistance> as this trumps Resisted by:" 
    for (const key in matchingPower.system.extras) {
            const item =  matchingPower.system.extras[key];
      const regex = /Alternate Resistance: ([^,]+)/;
            if (item.name && item.name.includes("Alternate Resistance"))  {
                match = item.name.match(regex);
          if(match){
            resistance = match[1]
          }
        }
        
      }
    // Convert resistance to lowercase for comparison
    const resistanceLower = resistance.toLowerCase();
    
    // Map English resistances/abilities to French system names
    const resistanceMap = {
      // Defenses
      'toughness': 'robustesse',
      'fortitude': 'vigueur', 
      'will': 'volonte',
      'dodge': 'esquive',
      'parry': 'parade',
      // Abilities mapped to their French system names (now supported directly)
      'strength': 'force',
      'stamina': 'endurance', 
      'agility': 'agilite',
      'dexterity': 'dexterite',
      'fighting': 'combativite',
      'intellect': 'intelligence',
      'awareness': 'sensibilite',
      'presence': 'presence'
    };
    
    return resistanceMap[resistanceLower] || 'robustesse'; // Default to Toughness if not found
  }



  async function createAttackDetailsFromPower( matchingPower, actor)    { 
    
    
    let effectName = matchingPower.system.effetsprincipaux
    if(effectName==""){
      effectName = matchingPower.name
    }
    
    // Check if this power has multiple effects in notes field
    const multipleEffects = parseMultipleEffectsFromNotes(matchingPower);
    if (multipleEffects.length > 0) {
      // Build combined text description for all effects
      let combinedText = "";
      multipleEffects.forEach((effect, index) => {
        const effectNote = getEffectNotesForEffectName(matchingPower.system.notes, effect.name);
        if (effectNote) {
          if (index > 0) {
            combinedText += "\n--------------\n";
          }
          combinedText += `${effect.name}:\n${effectNote}`;
        }
      }); 
      
      // Create the primary attack from the first effect, then link the others
      await createLinkedAttackFromMultipleEffects(multipleEffects, actor, matchingPower);
      
      // Update the primary attack with the combined text
      const lastAttackKey = findAttackLastAttackKey(actor.system.attaque);
      const updates = {};
      updates[`system.attaque.${lastAttackKey}.text`] = combinedText;
      await actor.update(updates);
      return;
    }
    let powerConfig = POWERS_CONFIG.find(power => effectName.toLowerCase().includes(power.name.toLowerCase()));
    
    if(!powerConfig && linkNextPower==true)
    {
      linkNextPower = false;
    }
    if(powerConfig){
      let save= getSaveFromResistance(matchingPower, powerConfig.resistance);
      let type = getTypeFromPower(matchingPower, powerConfig);

      let combatSkill;
      if(type =="combatdistance" || type =="combatcontact"){
        combatSkill = getCombatSkill(actor, matchingPower, type )  
      }

      let afflictions = undefined;
      if(powerConfig.attackType=="affliction" ){
          afflictions  = determineAffliction(powerConfig, matchingPower)
          save = getSaveFromResistance(matchingPower, afflictions.resistedBy);
      }
    let afflictionResults = afflictions?afflictions.result:null; 
      if(linkNextPower==true)
        {
        saveLinkedAttack(actor, matchingPower);
        return; 
        } 
      
      if (matchingPower.system.effets.includes("Linked to")){
        linkNextPower = true;
      }

    
      await createAttack(matchingPower.name, actor, matchingPower, type, save, 20, powerConfig.attackType, combatSkill, afflictionResults, powerConfig);
    await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  function getTypeFromPower(matchingPower, powerConfig){
    let isArea = getAreaFromPower(matchingPower);
    let isRange = getRangedFromPower(matchingPower) || powerConfig.range=="Ranged" && !isArea;
    let isClose = !getRangedFromPower(matchingPower)  && powerConfig.range=="Close" && !isArea
    let isPerception = getPerceptionFromPower(matchingPower) || powerConfig.range=="Perception" 

    
    let type;
    if(isArea){
      type = "area"
    }
    else{
      if(isRange){
        type= "combatdistance";
      }
      else{
        if(isClose)
        {
          type = "combatcontact"
        }
    }
    }
    if(isPerception)
    {
      type = "combatperception"
    }
    return type;
  }

  function getCombatSkill(actor, matchingPower, combatSkilltype) {
    let combatSkill = findSkillByLabel(actor.system.competence[combatSkilltype], matchingPower.name);
    if(!combatSkill){
      if(actor.system.competence[combatSkilltype].list[0]!=undefined || actor.system.competence[combatSkilltype].list[1]!=undefined){
        combatSkill =  actor.system.competence[combatSkilltype].list[0] || actor.system.competence[combatSkilltype].list[1];
      }
      if(!combatSkill){
        ui.notifications.warn("This character has no combat skill to supply attack value for  combat power  "+ matchingPower.name );
      }
    }
    return combatSkill;
  }

  function saveLinkedAttack(actor, matchingPower) {
    let lastAttackKey = findAttackLastAttackKey(actor.system.attaque);
    let updates = {};
    let linkedAttack = actor.system.attaque[lastAttackKey];
    linkNextPower = true;
    
    // Determine the type of the linked effect
    let linkedPowerConfig = POWERS_CONFIG.find(power => 
      matchingPower.system.effetsprincipaux.toLowerCase().includes(power.name.toLowerCase()) ||
      matchingPower.name.toLowerCase().includes(power.name.toLowerCase())
    )
    
    if (linkedPowerConfig && linkedPowerConfig.attackType === "damage") {
      linkedAttack.isDmg = true;
      linkedAttack.save.dmg.effet = matchingPower.system.cout.total.toString();
      linkedAttack.save.dmg.type = getSaveFromResistance(matchingPower, linkedPowerConfig.resistance);
    } 
    if (linkedPowerConfig && linkedPowerConfig.attackType === "weaken") {
      linkedAttack.isWeaken = true;
      linkedAttack.save.weaken.type = getSaveFromResistance(matchingPower, linkedPowerConfig.resistance);
      linkedAttack.save.weaken.effet = matchingPower.system.cout.total.toString();
      const targetAbility = getWeakenTargetAbility(matchingPower);
      linkedAttack.repeat.weaken = {
        targetAbility: targetAbility
      };
    } 
    
    // Add the linked power's description to the attack text
    linkedAttack.text = getPowerDescription(matchingPower);
    
    updates[`system.attaque.${lastAttackKey}`] = linkedAttack;
    actor.update(updates);
    game.actors.set(actor._id, actor);
    linkNextPower = false;
  }

  function findAttackLastAttackKey(attaque) {
    const highestKey = Math.max(...Object.keys(attaque).map(key => parseInt(key)));
    //const lastAttack = attaque[highestKey];
    return highestKey;
  }

  function getAreaFromPower(matchingPower){
    for (const key in matchingPower.system.extras) {
            const item =  matchingPower.system.extras[key];
            if (item.name && (item.name.includes("Area") || item.name.includes("Burst") || item.name.includes("Cone") || item.name.includes("Line"))) {
                return true
            }
      }
      return false; 
  }

  function getRangedFromPower(matchingPower){
    for (const key in matchingPower.system.extras) {
            const item =  matchingPower.system.extras[key];
            if (item.name && (item.name.includes("Ranged") || item.name.includes("Range"))) {
                return true
            }
      }
      if(matchingPower.system.portee=="distance"){
        return true;
      }
      return false; 
  }

  function getPerceptionFromPower(matchingPower){
    for (const key in matchingPower.system.extras) {
            const item =  matchingPower.system.extras[key];
            if (item.name && item.name.includes("Perception")) {
                return true
            }
      }
      if(matchingPower.system.portee=="perception"){
        return true;
      }
      return false; 
  }

  function determineAffliction(powerConfig, matchingPower) {
      let effectName = matchingPower.system.effetsprincipaux;
      if (effectName == "") {
          effectName = matchingPower.name;
      }
      let affliction = {};
      const presetAfflictions = [
          { 
        power: "Dazzle", 
        afflictions: 
        { 
          resistedBy: "Fortitude", 
          result:
          [
            {status:[findStatusEffect("Impaired").id], value:0},
            {status: [findStatusEffect("Disabled").id],value:0}, 
            {status: [findStatusEffect("Unaware").id] ,value:0}
          ],
        }
      },
          { 
        power: "Mind Control", 
        afflictions: 
        { 
          resistedBy: "Will", 
          result:
          [
            {status:[findStatusEffect("Dazed").id], value:0},
            {status:[findStatusEffect("Compelled").id],  value:0},  
            {status:[findStatusEffect("Controlled").id] , value:0} 
          ],
        }
      },
          { power: "Snare", 
        afflictions: 
        { 
          resistedBy: "Dexterity",
          result:
          [
            {status:[findStatusEffect("Hindered").id, findStatusEffect("Vulnerable").id], value:0},  
            {status:[findStatusEffect("Immobile").id, findStatusEffect("Defenseless").id], value:0} 
          ],	
        }
      },
      { 
        power: "Suffocation", 
        afflictions: 
        { 
          resistedBy: "Fortitude",  
          result:
          [
            {status:[findStatusEffect("Dazed").id], value:0},  
            {status:[findStatusEffect("Stunned").id], value:0}  ,
            {status:[findStatusEffect("Incapacitated").id], value:0} 
          ]
        }
      }
    ];
      
      let presetAffliction = presetAfflictions.find(affliction => effectName.toLowerCase().includes(affliction.power.toLowerCase()));
      if (presetAffliction) {
          affliction = presetAffliction.afflictions;
      
      } else {
          let details = matchingPower.system.effets;
          
          details = details.replace(/<[^>]*>/g, '');
          const pattern1 = /Affliction resisted by (.*?); \/([^\/\s]+)(?:\s[^\/]+)?\/([^\/\s]+)(?:\s[^\/]+)?(?:\/([^\/\s]+)(?:\s[^\/]+)?)?/;
      let match = details.match(pattern1);
      details = details.replace(/<[^>]*>/g, '')
      if(!match)
      {
              details = matchingPower.system.notes
        details = details.replace(/<[^>]*>/g, '')
        match = details.match(pattern1);
          }
      if(match){
        affliction.resistedBy = match[1].trim();
        let one; 
        let two;
        let three;
        if(match[2]) {
          const statusEffect1 = findStatusEffect(match[2].trim());
          one = statusEffect1 ? statusEffect1.id : null;
        }
        if(match[3]) {
          const statusEffect2 = findStatusEffect(match[3].trim());
          two = statusEffect2 ? statusEffect2.id : null;
        }
        if(match[4]) {
          const statusEffect3 = findStatusEffect(match[4].trim());
          three = statusEffect3 ? statusEffect3.id : null;
        }

        affliction.result = [
          {status:[one], value: 0},
          {status:[two], value: 0},
          {status:[three], value: 0},
        ]; 
      }
      else{
        const pattern2 = /1st degree: (.*?), 2nd degree: (.*?), 3rd degree: (.*?), Resisted by: (.*?),/;
            let match = details.match(pattern2);
        if (!match)
            {
                details = matchingPower.system.notes
          details = details.replace(/<[^>]*>/g, '')
          match = details.match(pattern2);
            }
            if (match) {
                let one; 
                let two;
                let three;
          affliction.resistedBy = match[4].trim();
        if(match[1]) {
                    const statusEffect1 = findStatusEffect(match[1].trim());
                    one = statusEffect1 ? statusEffect1.id : null;
                }
                if(match[2]) {
                    const statusEffect2 = findStatusEffect(match[2].trim());
                    two = statusEffect2 ? statusEffect2.id : null;
                }
                if(match[3]) {
                    const statusEffect3 = findStatusEffect(match[3].trim());
                    three = statusEffect3 ? statusEffect3.id : null;
                }
    
                affliction.result = [
                    {status:[one], value: 0},
                    {status:[two], value: 0},
                    {status:[three], value: 0},
                ];    
            }
      }
      }  
    if(!affliction.result){
      affliction = presetAfflictions[0].afflictions
    }
    if(affliction.result[2] && affliction.result[2].status[0]==undefined){
          affliction.result.splice(2,1)
        }
    if(affliction.result[1] && affliction.result[1].status[0]==undefined){
      affliction.result.splice(1,1)
    }
      return affliction;
  }

  function findStatusEffect(englishCondition) {
    let conditionTranslations = {
        "Controlled": "Controlled",
        "Impaired": "Decreased",
        "Fatigued": "Tired",
        "Disabled": "Disabled",
        "Dazed": "Dazed",
        "Immobile": "Stuck",
        "Unaware": "Insensitive",
        "Debilitated": "Invalid",
        "Hindered": "Slow",
        "Defenseless": "Defenseless",
        "Transformed": "Transformed",
        "Vulnerable": "Vulnerability",
        "Staggered": "Chanceling",
        "Entranced": "Enthralled",
        "Compelled": "Influenced",
        "Exhausted": "Exhausted",
        "Bound": "Tied",
        "Dying": "Dying",
        "Incapacitated": "Neutralized",
        "Surprised": "Surprised",
        "Weakened": "Downgrade",
        "Prone": "Prone",
        "Blind": "Blind",
        "Asleep": "Asleep",
        "Restrained": "Restrained",
        "Paralyzed": "Paralysis",
        "Deaf": "Deaf",
        "Stunned": "Stunned"
      };
      
    

    // Find matching condition by checking if any key is contained in the englishCondition
    let frenchCondition = null;
    for (const [key, value] of Object.entries(conditionTranslations)) {
      if (englishCondition.toLowerCase().includes(key.toLowerCase())) {
        frenchCondition = value;
        break;
      }
    }
    
    // Return null if no matching condition found
    if (!frenchCondition) return null;
    
    // Prepare the search label by adding the prefix
    const searchLabel = `MM3.STATUS.${frenchCondition}`;

    // Find the corresponding status effect in CONFIG.statusEffects
    const statusEffect = CONFIG.statusEffects.find(effect => effect.label === searchLabel);

    // Return the found status effect, or null if not found
    return statusEffect || null;
  }

  function findSkillByLabel(skills, label) {
    for (const key in skills.list) {
        if (skills.list[key].label === label) {
            return skills.list[key];
        }
    }
    return null; 
  }

  /**
   * Extracts individual effect ranks from power description
   * @param {Object} matchingPower - The power object
   * @param {string} attackType - The primary attack type
   * @returns {Object} - Object with dmg, affliction, and weaken ranks
   */
  function getEffectRanks(matchingPower, attackType) {
    const powerLevel = matchingPower.system.cout.rang;
    const description = (matchingPower.system.notes || '') + ' ' + (matchingPower.system.effets || '');
    
    let dmgRank = 0;
    let afflictionRank = 0;
    let weakenRank = 0;
    
    // Check for explicit effect mentions in the description
    const dmgMatch = description.match(/(?:damage|blast|strike|strength)\s+(\d+)/i);
    const afflictionMatch = description.match(/(?:affliction|dazzle|mind control|snare|sleep|suffocation)\s+(\d+)/i);
    const weakenMatch = description.match(/weaken\s+(\d+)/i);
    
    if (dmgMatch) {
      dmgRank = parseInt(dmgMatch[1]);
    } else if (attackType === "damage") {
      dmgRank = powerLevel;
    }
    
    if (afflictionMatch) {
      afflictionRank = parseInt(afflictionMatch[1]);
    } else if (attackType === "affliction") {
      afflictionRank = powerLevel;
    }
    
    if (weakenMatch) {
      weakenRank = parseInt(weakenMatch[1]);
    } else if (attackType === "weaken") {
      weakenRank = powerLevel;
    }
    
    return {
      dmg: dmgRank.toString(),
      affliction: afflictionRank.toString(),
      weaken: weakenRank.toString()
    };
  }

  /**
   * Extracts the target ability for weaken effects from power description
   * @param {Object} matchingPower - The power object
   * @returns {string} - The target ability key (defaults to 'force')
   */
  function getWeakenTargetAbility(matchingPower) {
    const notes = matchingPower.system.notes || '';
    const effets = matchingPower.system.effets || '';
    
    // Look for "Affects: <ability>" pattern
    const affectsMatch = (notes + ' ' + effets).match(/Affects:\s*([^,;]+)/i);
    if (affectsMatch) {
      const ability = affectsMatch[1].trim().toLowerCase();
      
      // Map common ability names to system keys
      const abilityMap = {
        'strength': 'force',
        'stamina': 'endurance', 
        'agility': 'agilite',
        'dexterity': 'dexterite',
        'fighting': 'combativite',
        'intellect': 'intelligence',
        'awareness': 'sensibilite',
        'presence': 'presence',
        'intelligence': 'intelligence',
        'intellect': 'intelligence',
        'parry': 'parade',
        'dodge': 'esquive',
        'fortitude': 'vigueur',
        'toughness': 'robustesse',
        'will': 'volonte'
      };
      
      return abilityMap[ability] || 'force';
    }
    
    // Default to force if no specific target found
    return 'force';
  }

  /**
   * Extracts and formats the power's description and notes for the attack text field
   * @param {Object} matchingPower - The power object
   * @returns {string} - Formatted description text
   */
  function getPowerDescription(matchingPower) {
    let description = "";
    
    // For linked effects, prioritize the full notes field which contains all effects
    if (matchingPower.system?.notes) {
      description = matchingPower.system.notes;
    } else if (matchingPower.system?.effets) {
      // Fallback to effets if no notes
      description = matchingPower.system.effets;
    }
    
    // Clean up HTML tags and format the text
    if (description) {
      // Remove HTML tags but preserve line breaks
      description = description
        .replace(/&nbsp;/gi, ' ') // Replace &nbsp; with regular space
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
        .trim();
      
      // Remove generic descriptive paragraphs for each effect type
      description = removeGenericEffectDescriptions(description);
    }
    
    return description || "";
  }

  /**
   * Removes generic descriptive paragraphs that come after effect name lines
   * @param {string} description - The power description text
   * @returns {string} - Description with generic paragraphs removed
   */
  function removeGenericEffectDescriptions(description) {
    // Split into lines for processing
    const lines = description.split('\n');
    const result = [];
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Check if this line matches the pattern "Power Name : Known Effect Type Number"
      const effectNameMatch = line.match(/^([^:]+)\s*:\s*([A-Za-z\s]+)\s+(\d+)$/);
      
      if (effectNameMatch) {
        const effectType = effectNameMatch[2].trim();
        
        // Check if the effect type is one of our known effect types
        const knownEffectTypes = [
          'Affliction', 'Damage', 'Blast', 'Strike', 'Weaken', 'Mind Control', 
          'Snare', 'Sleep', 'Suffocation', 'Dazzle', 'Nullify', 'Mental Blast',
          'Energy Aura', 'Energy Control', 'Magic', 'Strength Damage', 'Enhanced Strength'
        ];
        
        const isKnownEffect = knownEffectTypes.some(knownType => 
          effectType.toLowerCase().includes(knownType.toLowerCase()) ||
          knownType.toLowerCase().includes(effectType.toLowerCase())
        );
        
        if (isKnownEffect) {
          // This is an effect name line - keep it
          result.push(line);
          i++;
          
          // Look for the next non-empty line - this should be the generic description
          while (i < lines.length && lines[i].trim() === '') {
            i++; // Skip empty lines
          }
          
          // Check if the next line is a generic description
          if (i < lines.length) {
            const nextLine = lines[i].trim();
            
            // Check if this looks like a generic description (starts with "You can")
            if (nextLine.startsWith('You can') && nextLine.length > 100) {
              // Skip this generic description line
              i++;
              
              // Skip any additional lines that are part of the generic description
              // (look for lines that don't contain specific modifiers like "1st degree:", "Resisted by:", etc.)
              while (i < lines.length) {
                const checkLine = lines[i].trim();
                
                // If we hit an empty line or a line with specific modifiers, stop skipping
                if (checkLine === '' || 
                    checkLine.includes('1st degree:') || 
                    checkLine.includes('2nd degree:') || 
                    checkLine.includes('3rd degree:') || 
                    checkLine.includes('Resisted by:') || 
                    checkLine.includes('Affects:') ||
                    checkLine.includes('DC ') ||
                    checkLine.includes('Increased Range:') ||
                    checkLine.includes('Limited:') ||
                    checkLine.includes('Check Required:') ||
                    checkLine.includes('Distracting') ||
                    checkLine.includes('Inaccurate') ||
                    checkLine.includes('Slow:') ||
                    checkLine.includes('Unreliable') ||
                    checkLine.includes('Subtle') ||
                    checkLine.includes('Insidious') ||
                    checkLine.includes('Multiattack') ||
                    checkLine.includes('Secondary Effect') ||
                    checkLine.includes('Feature:') ||
                    checkLine.includes('Affects Insubstantial') ||
                    checkLine.match(/^[A-Za-z\s]+:\s*[A-Za-z\s]+\s+\d+$/)) { // Another effect name line
                  break;
                }
                
                i++;
              }
            } else {
              // Next line is not a generic description, keep it
              result.push(nextLine);
              i++;
            }
          }
        } else {
          // Not a known effect type, treat as regular line
          result.push(line);
          i++;
        }
      } else {
        // Regular line - keep it
        result.push(line);
        i++;
      }
    }
    
    return result.join('\n').trim();
  }

  async function createAttack(effect, actor, matchingPower, type, save, critique, attackType, skill, afflictions=null, powerConfig=null) {
    let key;
    if(afflictions ==  null)
    {
        afflictions = [
          { value: 0, status: [] },
          { value: 0, status: [] },
          { value: 0, status: [] }
    ]} 
    
    let skillId = "";
    let attaque = "";
    let ability="";
    if(skill){
      skillId = skill._id;
      attaque = skill.total;
    }  
    else{
      if(type == "combatcontact" ){
        attaque = actor.system.caracteristique.combativite.total;
      //type = "other"
      //ability = "force";
      }
      if(type == "combatdistance"){
      //type = "other"
      //ability = "dexterite"
        attaque = actor.system.caracteristique.dexterite.total;
      } 


    }
    
    range = 0;
    let defpassive = undefined;
    
    // Check power characteristics directly
    const isPerceptionPower = getPerceptionFromPower(matchingPower);
    const isRangedPower = getRangedFromPower(matchingPower);
    const isClosePower = !isRangedPower && !isPerceptionPower;
    
    if (isPerceptionPower) {
      // Perception powers have infinite range
      defpassive = "esquive";
      range = Infinity;
    } else if (isClosePower) {
      // Close powers (including close area) have melee range + elongation
      defpassive = "parade";
      const elongationBonus = getElongationBonus(actor);
      if (elongationBonus > 0) {
        range = 1 + elongationBonus;
      } else {
        range = 0; // Standard melee range
      }
    } else {
      // Ranged powers (including ranged area) use power level calculation
      defpassive = "esquive";
      let powerLevel = matchingPower.system.cout.rang;
      if(matchingPower.system.effetsprincipaux.includes('Strength')){
        powerLevel += actor.system.caracteristique.force.total;
      }
      let factor = 1;
      if(powerLevel < 7){
        factor = 2;
      }
      if(powerLevel >= 7 && powerLevel <= 9 ){
        factor = 3;
      }
      if(powerLevel >= 10 && powerLevel <= 12 ){
        factor = 4;
      }
      if(powerLevel >= 13 && powerLevel <= 16 ){
        factor = 5;
      }
      if(powerLevel >= 17 ){
        factor = 6;
      }
      range = factor * powerLevel;
    }

  if(effect && effect.includes("Strength") || effect =="Unarmed")
  {
    ability = "force";
    
  }

  // Get individual effect ranks from power description
  const effectRanks = getEffectRanks(matchingPower, attackType);

    let newAttackData = {_id:foundry.utils.randomID(),
      afflictioneeffect : 0,        
      area:{has:type=="area", esquive:0},
      attaque : attaque,
    range: range,
      basearea:0,
      critique:critique,
      effet:matchingPower.system.cout.rang,
      isAffliction:attackType=="affliction",
      isDmg:attackType=="damage",
      isWeaken:attackType=="weaken",
      label: matchingPower.name,
      links:{ability:ability,pwr:matchingPower._id,skill: skillId, },
      mod:{atk:0, eff:0},
      pwr:matchingPower._id,
      repeat:{
          affliction:afflictions,
          dmg: [
          {value:1, status: []},
          {value:2, status: ['dazed']},
                  {value:3, status: ['chanceling']},
                  {value:4, status: ['neutralized']}
          ],
      },
      save:{
          dmg: {
              type: attackType === "damage" ? save : "robustesse",
              defense: "15",
              effet: effectRanks.dmg
          },
          other: {
              type: save,
              defense: "15"
          },
          affliction: {
              type: attackType === "affliction" ? save : "volonte",
              defense: "10",
              effet: effectRanks.affliction
          },
          weaken: {
              type: attackType === "weaken" ? save : "vigueur",
              defense: "10",
              effet: effectRanks.weaken
          },
          passive: {
              type: defpassive
          }
      },
      settings:{
          noatk: type=="area",
          nocrit: false
      },
      skill:skillId,
      text: getPowerDescription(matchingPower),
      type: type,
  };

  // If the attack exists, update it; otherwise, add a new one

  for (const [keyIndex, attack] of Object.entries(actor.system.attaque)) {
    if (attack.label === matchingPower.name) {
      key = keyIndex;
      break;
    }
  }
  let updates = {};
  if (key) {
    updates[`system.attaque.${key}`] = newAttackData;
    await actor.update(updates);
  } else { 
    const attacks = actor.system.attaque;
    let newAttack ={}
    let attackKeys = Object.keys(attacks);
    key = attackKeys.length > 0 ? Math.max(...attackKeys) : 0;   
    newAttack[`system.attaque.${key+1}`] = newAttackData
    key =key+1
    console.log("new attack" + newAttackData)
    await actor.update(newAttack);
    console.log(newAttack)
  }



  game.actors.set(actor._id , actor)
  return actor.system.attaque[key]

  } 