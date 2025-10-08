

// ============================================================================
// TABLE OF CONTENTS
// ============================================================================
// 1. HOVER MENU
//   1.2 Display Token Interface
//     1.2.1 Show/hide action buttons using animation when hovering over token
//     1.2.2 Display attack, powers, and maneuvers buttons below token
//     1.2.3 Maintain visibility within expanded hover area (100px buffer)
//     1.2.4 Apply comic book visual styling
//     1.2.5 Manage UI lifecycle
//     1.2.6 Hide all menus when clicking empty canvas space
//     1.2.7 Hide all menus when dragging tokens
//   1.3 Manage Resources
//     1.3.1 Display resource panel with animation when hovering over token
//     1.3.2 Adjust resource values via inline controls
//    
// 2. ATTACKS
//   2.1 Convert Attacks from Powers
//     2.1.1 Create attacks from powers when clicking "Convert Powers" button
//     2.1.2 Convert range, close, or perception to attack
//     2.1.3 Convert power to attack for character that has a skill for that attack
//     2.1.4 Convert standard power to attack (damage, affliction, weaken, etc)
//     2.1.5 Convert linked power to attack
//     2.1.6 Convert power with area of effect to attack
//     2.1.8 Convert power with Critical extra to attack
//   2.2 Calculated Distance
//     2.2.1 Edit range values in actor sheet
//     2.2.2 Switch distance calculation approach when choosing from configured distance setting
//     2.2.4 Convert distance to feet
//   2.3 Perform Attacks
//     2.3.1 Launch attack menu when clicking attack action button
//     2.3.2 Display attack information on hover over attack
//     2.3.3 Execute attacks with enhanced targeting
//     2.3.4 Show green/red overlay on targets when hovering
//     2.3.5 Display range indicator on targets
//     2.3.6 Handle area attacks with template placement
// 3. POWERS
//   3.1 Extract speed values when clicking "Import Speed from Powers" button
//   3.2 Launch power menu when clicking powers action button on hover menu
//   3.3 Display power information on hover
// 4. ACTIVE EFFECTS
//   4.1 Generate effects from powers when clicking "Create Active Effects" button
//   4.2 Extract trait bonuses from power text
//   4.3 Map trait names to system attributes
// 5. CALCULATE MEASUREMENTS
//   5.1 Calculate value from rank for time, distance, mass, and volume
//   5.2 Calculate rank from value for time, distance, mass, and volume
//   5.3 Calculate distance from time and speed rank
//   5.4 Calculate time from distance and speed rank
//   5.5 Calculate throwing distance from strength and mass rank


// Top-level state variables
let targetTemplate;
Hooks.once('init', () => {
  game.settings.register('mm3e-better-attacks', 'movementCalculationMode', {
    name: 'Movement Calculation Mode',
    hint: 'Choose how movement speed and range are calculated. Tactical Combat uses imported speed values and target distance. RAW uses the speed table (6 seconds per turn) and range multipliers.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      'tactical': 'Tactical Combat Rules',
      'raw': 'RAW - Rules as Written'
    },
    default: 'raw',
    onChange: value => {
      console.log(`Movement calculation mode changed to: ${value}`);
    }
  });
  
  // Register migration version setting
  game.settings.register('mm3e-better-attacks', 'migrationVersion', {
    name: 'Migration Version',
    scope: 'world',
    config: false,
    type: Number,
    default: 0
  });
  
  // Add fatigue points to all actors using flags migration
  Hooks.once('ready', async () => {
    const migrationVersion = game.settings.get('mm3e-better-attacks', 'migrationVersion') || 0;
    
    if (migrationVersion < 1) {
      console.log('Running migration: Adding fatigue points to actors using flags');
      
      for (const actor of game.actors) {
        const currentFatigue = actor.getFlag('mm3e-better-attacks', 'fatiguePoints');
        if (currentFatigue === undefined) {
          await actor.setFlag('mm3e-better-attacks', 'fatiguePoints', 0);
        }
      }
      
      await game.settings.set('mm3e-better-attacks', 'migrationVersion', 1);
      console.log('Migration completed: Added fatigue points flags to all actors');
    }
  });
});

Hooks.on('ready', () => {
  addTargetingStyles();
  setupTokenHoverAttackMenu();
  Hooks.on("renderActorSheet", (app, html, data) => {
    const actor = app.actor;
    if (!actor) return;
    
    addConvertAttackFromPowersButton(html, app);
    addConvertSpeedFromPowersButton(html, app);
    addCreateActiveEffectsFromPowersButton(html, app);
    addRangeFieldToAttack(html, app);
    interceptAttackButtons(html, app);
  });
});


// 1. HOVER MENU
 
// 1.2 Display Token Interface

// 1.2.1 Show/hide action buttons using animation when hovering over token

// Add CSS animations for panel effects
const style = document.createElement('style');
style.textContent = `
  @keyframes panelSpreadIn {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  
  @keyframes panelSpreadOut {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(0);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

let currentHoveredToken = null;
let menuHideTimeout = null;
let menuShowTimeout = null;
let isMouseDown = false;
let isDragging = false;
let dragStartPosition = null;
let hoverTimeout = null;

function setupTokenHoverAttackMenu() {
  console.log("Setting up token hover and click attack menu");
  
  // Use canvas stage mousemove for resource panel and buttons
  canvas.stage.on('mousemove', onTokenHover);
  // Use canvas stage click for attack menu
  canvas.stage.on('click', onTokenClick);
  // Hide menus on mousedown and drag
  canvas.stage.on('mousedown', onMouseDown);
  canvas.stage.on('mouseup', onMouseUp);
  canvas.stage.on('pointermove', onPointerMove);
}

function onTokenHover(event) {
  if (targetingMode) return; // Don't show panels during targeting
  
  // Clear any existing timeout
  if (menuHideTimeout) {
    clearTimeout(menuHideTimeout);
    menuHideTimeout = null;
  }
  
  const pos = event.data.getLocalPosition(canvas.tokens);
  const mouseX = event.data.originalEvent.clientX;
  const mouseY = event.data.originalEvent.clientY;
  
  // Check if mouse is over any resource display, action buttons, or attack menu
  const overResourceDisplay = document.elementFromPoint(mouseX, mouseY)?.closest('.token-resource-display');
  const overResourceDisplayOnly = document.elementFromPoint(mouseX, mouseY)?.closest('.token-resource-display-only');
  const overActionButtons = document.elementFromPoint(mouseX, mouseY)?.closest('.token-action-buttons');
  const overAttackMenu = document.elementFromPoint(mouseX, mouseY)?.closest('.token-attack-menu');
  const overPowerMenu = document.elementFromPoint(mouseX, mouseY)?.closest('.token-power-menu');
  
  // If panels are visible, use expanded hover area with delay
  if (currentHoveredToken && (document.getElementById(`token-resource-display-${currentHoveredToken.id}`) || document.getElementById(`token-resource-display-only-${currentHoveredToken.id}`))) {
    // Large expanded hover area - generous buffer around all UI elements
    const tokenBounds = currentHoveredToken.bounds;
    const expandedBounds = {
      x: tokenBounds.x - 100, // Wider buffer
      y: tokenBounds.y - 150, // Higher buffer for resource panel
      width: tokenBounds.width + 200, // Much wider
      height: tokenBounds.height + 300 // Much taller for attack menu
    };
    
    const inExpandedArea = pos.x >= expandedBounds.x && 
                          pos.x <= expandedBounds.x + expandedBounds.width &&
                          pos.y >= expandedBounds.y && 
                          pos.y <= expandedBounds.y + expandedBounds.height;
    
    // Stay in expanded area or over any UI element - keep panels visible
    if (inExpandedArea || overResourceDisplay || overResourceDisplayOnly || overActionButtons || overAttackMenu || overPowerMenu) {
      // Clear any existing hide timeout
      if (menuHideTimeout) {
        clearTimeout(menuHideTimeout);
        menuHideTimeout = null;
      }
      // Also clear any attack menu hide timeout
      document.querySelectorAll('.token-attack-menu').forEach(menu => {
        if (menu.id.includes(currentHoveredToken.id)) {
          // Keep attack menu visible
          return;
        }
      });
      return;
    }
    
    // Left expanded area - start hide timeout (250ms delay)
    if (!menuHideTimeout) {
      menuHideTimeout = setTimeout(() => {
        // Check if we're hovering over another token
        const hoveredToken = canvas.tokens.placeables.find(t => {
          const bounds = t.bounds;
          return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
                pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
        });
        
        if (hoveredToken && hoveredToken !== currentHoveredToken) {
          // Hovering over a different token - show panels for that token
          document.querySelectorAll('.token-attack-menu').forEach(menu => menu.remove());
          document.querySelectorAll('.token-power-menu').forEach(menu => menu.remove());
          document.querySelectorAll('.token-resource-display').forEach(display => display.remove());
          document.querySelectorAll('.token-resource-display-only').forEach(display => display.remove());
          document.querySelectorAll('.token-action-buttons').forEach(buttons => buttons.remove());
          
          currentHoveredToken = hoveredToken;
          showTokenResourceDisplay(hoveredToken);
          showTokenActionButtons(hoveredToken);
        } else {
          // Not hovering over any token - animate out then hide
          document.querySelectorAll('.token-attack-menu').forEach(menu => {
            menu.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
            setTimeout(() => menu.remove(), 300);
          });
          document.querySelectorAll('.token-power-menu').forEach(menu => {
            menu.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
            setTimeout(() => menu.remove(), 300);
          });
          document.querySelectorAll('.token-resource-display').forEach(display => {
            display.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
            setTimeout(() => display.remove(), 300);
          });
          document.querySelectorAll('.token-resource-display-only').forEach(display => {
            display.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
            setTimeout(() => display.remove(), 300);
          });
          document.querySelectorAll('.token-action-buttons').forEach(buttons => {
            buttons.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
            setTimeout(() => buttons.remove(), 300);
          });
          currentHoveredToken = null;
        }
        menuHideTimeout = null;
      }, 250); // Quarter second delay
    }
    return;
  }
  
  // No panels visible - check for token hover with normal token bounds
  const hoveredToken = canvas.tokens.placeables.find(t => {
    const bounds = t.bounds;
    return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
          pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
  });
  
  // Show panels for newly hovered token with delay
  if (hoveredToken && hoveredToken !== currentHoveredToken) {
    // Clear any existing show timeout
    if (menuShowTimeout) {
      clearTimeout(menuShowTimeout);
      menuShowTimeout = null;
    }
    
    // Remove existing panels immediately
    document.querySelectorAll('.token-resource-display').forEach(display => display.remove());
    document.querySelectorAll('.token-resource-display-only').forEach(display => display.remove());
    document.querySelectorAll('.token-action-buttons').forEach(buttons => buttons.remove());
    currentHoveredToken = hoveredToken;
    
    // Show resource panel and buttons after delay (300ms)
    menuShowTimeout = setTimeout(() => {
      showTokenResourceDisplay(hoveredToken);
      showTokenActionButtons(hoveredToken);
      menuShowTimeout = null;
    }, 300);
  } else if (!hoveredToken && currentHoveredToken) {
    // No token hovered and we had one before - clear timeout and hide panels
    if (menuShowTimeout) {
      clearTimeout(menuShowTimeout);
      menuShowTimeout = null;
    }
    document.querySelectorAll('.token-resource-display').forEach(display => display.remove());
    document.querySelectorAll('.token-resource-display-only').forEach(display => display.remove());
    document.querySelectorAll('.token-action-buttons').forEach(buttons => buttons.remove());
    currentHoveredToken = null;
  }
}

function onTokenClick(event) {
  if (targetingMode) return; // Don't show menus during targeting
  
  const pos = event.data.getLocalPosition(canvas.tokens);
  const mouseX = event.data.originalEvent.clientX;
  const mouseY = event.data.originalEvent.clientY;
  
  // Check if clicking on any attack menu
  const clickedMenu = document.elementFromPoint(mouseX, mouseY)?.closest('.token-attack-menu');
  const clickedResourceDisplay = document.elementFromPoint(mouseX, mouseY)?.closest('.token-resource-display');
  const clickedResourceDisplayOnly = document.elementFromPoint(mouseX, mouseY)?.closest('.token-resource-display-only');
  const clickedActionButtons = document.elementFromPoint(mouseX, mouseY)?.closest('.token-action-buttons');
  const clickedPowerMenu = document.elementFromPoint(mouseX, mouseY)?.closest('.token-power-menu');
  
  // If clicking on menu/resource display/buttons, don't do anything
  if (clickedMenu || clickedResourceDisplay || clickedResourceDisplayOnly || clickedActionButtons || clickedPowerMenu) {
    return;
  }
  
  // Find clicked token
  const clickedToken = canvas.tokens.placeables.find(t => {
    const bounds = t.bounds;
    return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
          pos.y >= bounds.y && pos.y <= bounds.y + bounds.height;
  });
  
  if (clickedToken) {
    // Don't show attack menu on token click - only hide if it exists
    const existingMenu = document.getElementById(`token-attack-menu-${clickedToken.id}`);
    if (existingMenu) {
      hideTokenAttackMenu(clickedToken);
    }
  } else {
    // Clicked on empty space - hide any existing attack menu only
    document.querySelectorAll('.token-attack-menu').forEach(menu => menu.remove());
    document.querySelectorAll('.token-power-menu').forEach(menu => menu.remove());
  }
}

function onMouseDown(event) {
  if (targetingMode) return; // Don't interfere with targeting mode
  
  isMouseDown = true;
  dragStartPosition = { x: event.data.originalEvent.clientX, y: event.data.originalEvent.clientY };
  
  // Hide all menus immediately on mousedown
  hideAllMenus();
}

function onMouseUp(event) {
  if (targetingMode) return;
  
  isMouseDown = false;
  isDragging = false;
  dragStartPosition = null;
}

function onPointerMove(event) {
  if (targetingMode) return;
  
  if (isMouseDown && dragStartPosition) {
    const currentX = event.data.originalEvent.clientX;
    const currentY = event.data.originalEvent.clientY;
    const deltaX = Math.abs(currentX - dragStartPosition.x);
    const deltaY = Math.abs(currentY - dragStartPosition.y);
    
    // If mouse has moved more than 5 pixels, consider it a drag
    if (deltaX > 5 || deltaY > 5) {
      if (!isDragging) {
        isDragging = true;
        // Hide all menus when dragging starts
        hideAllMenus();
      }
    }
  }
}

function hideAllMenus() {
  // Hide all UI elements with smooth animations
  document.querySelectorAll('.token-attack-menu').forEach(menu => {
    menu.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => menu.remove(), 300);
  });
  document.querySelectorAll('.token-power-menu').forEach(menu => {
    menu.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => menu.remove(), 300);
  });
  document.querySelectorAll('.token-resource-display').forEach(display => {
    display.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => display.remove(), 300);
  });
  document.querySelectorAll('.token-resource-display-only').forEach(display => {
    display.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => display.remove(), 300);
  });
  document.querySelectorAll('.token-action-buttons').forEach(buttons => {
    buttons.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => buttons.remove(), 300);
  });
  document.querySelectorAll('.comic-page-background').forEach(background => {
    background.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => background.remove(), 300);
  });
  document.querySelectorAll('.attack-details-box').forEach(details => {
    details.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => details.remove(), 300);
  });
  document.querySelectorAll('.power-details-box').forEach(details => {
    details.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => details.remove(), 300);
  });
  
  // Clear any hover timeouts
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
  if (menuHideTimeout) {
    clearTimeout(menuHideTimeout);
    menuHideTimeout = null;
  }
  
  // Reset hover state
  currentHoveredToken = null;
}

window.handleActionButton = function(tokenId, actionType) {
  console.log(`Action button clicked: ${actionType} for token ${tokenId}`);
  
  // Hide all open menus first to prevent conflicts (but keep resource display and action buttons)
  document.querySelectorAll('.token-attack-menu').forEach(menu => menu.remove());
  document.querySelectorAll('.token-power-menu').forEach(menu => menu.remove());
  document.querySelectorAll('.comic-page-background').forEach(background => background.remove());
  
  switch(actionType) {
    case 'attack':
      // Show attack menu
      const token = canvas.tokens.get(tokenId);
      if (token) {
        // Recreate resource display and action buttons for attack menu
        showTokenResourceDisplay(token);
        showTokenActionButtons(token);
        showTokenAttackMenu(token);
      }
      break;
    case 'powers':
      // Show power menu
      const powerToken = canvas.tokens.get(tokenId);
      if (powerToken) {
        // Recreate resource display and action buttons for power menu
        showTokenResourceDisplay(powerToken);
        showTokenActionButtons(powerToken);
        showTokenPowerMenu(powerToken);
      }
      break;
    case 'maneuvers':
      ui.notifications.info('Maneuvers interface not yet implemented');
      break;
  }
}

function showTokenActionButtons(token) {
  // Check if action buttons already exist
  const existingButtons = document.getElementById(`token-action-buttons-${token.id}`);
  if (existingButtons && isUpdatingNumbers) {
    return;
  }
  
  const actor = token.actor;
  if (!actor) return;
  
  // Calculate positioning
  const tokenRect = token.mesh.getBounds();
  const canvasRect = canvas.app.view.getBoundingClientRect();
  
  // Create floating action buttons panel to the right of the token
  const actionButtonsPanel = document.createElement('div');
  actionButtonsPanel.id = `token-action-buttons-${token.id}`;
  actionButtonsPanel.className = 'token-action-buttons';
  
  actionButtonsPanel.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - 75}px;
    top: ${canvasRect.top + tokenRect.y + tokenRect.height + 12}px;
    width: 150px;
    height: 55px;
    z-index: 1001;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 8px;
    background: transparent;
    pointer-events: auto;
    border-radius: 0px;
    padding: 4px;
    ${isUpdatingNumbers ? '' : 'transform: scale(0); animation: panelSpreadIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;'}
  `;
  
  // Add hover event listeners to keep the UI visible when hovering over buttons
  actionButtonsPanel.addEventListener('mouseenter', () => {
    // Keep the current token as hovered when entering button area
    if (currentHoveredToken && currentHoveredToken.id === token.id) {
      // Clear any hide timeout
      if (menuShowTimeout) {
        clearTimeout(menuShowTimeout);
        menuShowTimeout = null;
      }
    }
  });
  
  actionButtonsPanel.addEventListener('mouseleave', () => {
    // Don't hide anything on mouseleave - let the main hover logic handle it
    // This prevents conflicts with the expanded hover area
  });
  
  actionButtonsPanel.innerHTML = `
    <button onclick="handleActionButton('${token.id}', 'attack')" style="
      width: 45px; 
      height: 45px; 
      background: url('modules/mm3e-better-attacks/images/attacks.png') center center; 
      background-size: 100% 100%; 
      border: none; 
      cursor: pointer; 
      border-radius: 0px;
      filter: brightness(1.1);
    " title="Attacks"></button>
    
    <button onclick="handleActionButton('${token.id}', 'powers')" style="
      width: 45px; 
      height: 45px; 
      background: url('modules/mm3e-better-attacks/images/powers.png') center center; 
      background-size: 100% 100%; 
      border: none; 
      cursor: pointer; 
      border-radius: 0px;
      filter: brightness(1.1);
    " title="Powers"></button>
    
    <button onclick="handleActionButton('${token.id}', 'maneuvers')" style="
      width: 45px; 
      height: 45px; 
      background: url('modules/mm3e-better-attacks/images/maneuvers.png') center center; 
      background-size: 100% 100%; 
      border: none; 
      cursor: pointer; 
      border-radius: 0px;
      filter: brightness(1.1);
    " title="Maneuvers"></button>
  `;
  
  document.body.appendChild(actionButtonsPanel);
}

// 1.3 Manage Resources
// 1.3.1 Display resource panel with animation when hovering over token

function showTokenResourceDisplay(token) {
  console.log('showTokenResourceDisplay called for token:', token.id, 'isUpdatingNumbers:', isUpdatingNumbers);
  
  // Always remove existing display to prevent duplicate event handlers
  const existingDisplay = document.getElementById(`token-resource-display-${token.id}`);
  if (existingDisplay) {
    console.log('Removing existing display');
    existingDisplay.remove();
  }
  
  // If we're just updating numbers, don't recreate the display
  if (isUpdatingNumbers) {
    console.log('We are updating numbers - skipping recreation');
    return;
  }
  
  const actor = token.actor;
  if (!actor) return;
  
  // Get resource values
  const heroPoints = actor.system.heroisme || 0;
  const injuries = actor.system.blessure || 0;
  const fatiguePoints = actor.getFlag('mm3e-better-attacks', 'fatiguePoints') || 0;
  
  // Check if actor has Luck advantage
  const luckTalent = actor.items.find(item => 
    item.type === 'talent' && 
    item.name.toLowerCase().includes('luck')
  );
  const hasLuck = luckTalent !== undefined;
  const luckPoints = hasLuck ? (actor.getFlag('mm3e-better-attacks', 'luck') || luckTalent.system.rang || 0) : 0;
  
  // Calculate positioning
  const tokenRect = token.mesh.getBounds();
  const canvasRect = canvas.app.view.getBoundingClientRect();
  const menuWidth = 250;
  
  // Create resource display
  const resourceDisplay = document.createElement('div');
  resourceDisplay.id = `token-resource-display-${token.id}`;
  resourceDisplay.className = 'token-resource-display';
  resourceDisplay.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - (menuWidth + 20) / 2}px;
    top: ${canvasRect.top + tokenRect.y - (hasLuck ? 94 : 55)}px;
    width: ${menuWidth + 20}px;
    height: auto;
    z-index: 950;
    display: table;
    table-layout: auto;
    background: transparent;
    pointer-events: auto;
    ${isUpdatingNumbers ? '' : 'transform: scale(0); animation: panelSpreadIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;'}
  `;
  
  resourceDisplay.innerHTML = `
    <div style="padding: 6px 6px 0px 6px; display: inline-block; background: transparent;">
      <table style="width: ${menuWidth + 20}px; border: none; border-collapse: separate; border-spacing: 0; background: transparent;">
      ${hasLuck ? `
      <tr style="background: transparent;">
        <td colspan="3" style="text-align: center; vertical-align: middle; padding: 2px 6px 6px 6px; border: none; background: transparent;">
          <div style="display: inline-block; width: ${(menuWidth + 20) / 3.25}px; margin-left: -4px;">
            <div title="Luck Points" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/luck.png') center center; background-size: 100% 100%; z-index: 1;"></div>
              <div style="position: relative; z-index: 2;">
              <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
                <button onclick="adjustResource('${token.id}', 'luck', -1)" style="background: linear-gradient(145deg, #66CC66, #228B22); border: 2px solid #003300; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
                <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                  <i class="fas fa-clover" style="color: #44AA44; font-size: 20px; text-shadow: 2px 2px 0px #228B22, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                  <input type="number" value="${luckPoints}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateLuckPoints('${token.id}', this.value)">
                </div>
                <button onclick="adjustResource('${token.id}', 'luck', 1)" style="background: linear-gradient(145deg, #66CC66, #228B22); border: 2px solid #003300; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
              </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
      ` : ''}
      <tr style="background: transparent;">
        <td style="width: ${(menuWidth + 20) / 3}px; text-align: center; vertical-align: middle; padding: 3px; border: none; background: transparent;">
          <div title="Hero Points" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/hero.png') center center; background-size: 100% 100%; z-index: 1;"></div>
            <div style="position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
              <button onclick="adjustResource('${token.id}', 'hero', -1)" style="background: linear-gradient(145deg, #FFE55C, #CC9900); border: 2px solid #B8860B; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-star" style="color: #FFD700; font-size: 20px; text-shadow: 2px 2px 0px #CC9900, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                <input type="number" value="${heroPoints}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateHeroPoints('${token.id}', this.value)">
              </div>
              <button onclick="adjustResource('${token.id}', 'hero', 1)" style="background: linear-gradient(145deg, #FFE55C, #CC9900); border: 2px solid #B8860B; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
            </div>
            </div>
          </div>
        </td>
        <td style="width: ${(menuWidth + 20) / 3}px; text-align: center; vertical-align: middle; padding: 3px; border: none; background: transparent;">
          <div title="Injuries" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
             <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/injury.png') center center; background-size: 100% 100%; z-index: 1;"></div>
            <div style="position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
              <button onclick="adjustResource('${token.id}', 'injury', -1)" style="background: linear-gradient(145deg, #FF6666, #CC3333); border: 2px solid #8B0000; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-heart" style="color: #FF4444; font-size: 20px; text-shadow: 2px 2px 0px #CC0000, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                <input type="number" value="${injuries}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateInjuries('${token.id}', this.value)">
              </div>
              <button onclick="adjustResource('${token.id}', 'injury', 1)" style="background: linear-gradient(145deg, #FF6666, #CC3333); border: 2px solid #8B0000; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
            </div>
            </div>
          </div>
        </td>
        <td style="width: ${(menuWidth + 20) / 3}px; text-align: center; vertical-align: middle; padding: 3px; border: none; background: transparent;">
          <div title="Fatigue" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/fatigue.png') center center; background-size: 100% 100%; z-index: 1;"></div>
            <div style="position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
              <button onclick="adjustResource('${token.id}', 'fatigue', -1)" style="background: linear-gradient(145deg, #FFAA44, #CC6600); border: 2px solid #CC6600; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-battery-full" style="color: #FF8800; font-size: 24px; text-shadow: 2px 2px 0px #CC6600, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                <input type="number" value="${fatiguePoints}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateFatiguePoints('${token.id}', this.value)">
              </div>
              <button onclick="adjustResource('${token.id}', 'fatigue', 1)" style="background: linear-gradient(145deg, #FFAA44, #CC6600); border: 2px solid #CC6600; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
            </div>
            </div>
          </div>
        </td>
      </tr>
      </table>
    </div>
  `;
  
  document.body.appendChild(resourceDisplay);
}

// 1.3.2 Adjust resource values via inline controls
let isUpdatingNumbers = false;

window.updateHeroPoints = async function(tokenId, value) {
  console.log('updateHeroPoints called, isUpdatingNumbers:', isUpdatingNumbers);
  isUpdatingNumbers = true;
  const token = canvas.tokens.get(tokenId);
  if (token && token.actor) {
    await token.actor.update({ 'system.heroisme': parseInt(value) });
  }
  setTimeout(() => { 
    console.log('Setting isUpdatingNumbers to false');
    isUpdatingNumbers = false; 
  }, 100);
}

window.updateInjuries = async function(tokenId, value) {
  isUpdatingNumbers = true;
  const token = canvas.tokens.get(tokenId);
  if (token && token.actor) {
    await token.actor.update({ 'system.blessure': parseInt(value) });
  }
  setTimeout(() => { isUpdatingNumbers = false; }, 100);
}

window.updateFatiguePoints = async function(tokenId, value) {
  isUpdatingNumbers = true;
  const token = canvas.tokens.get(tokenId);
  if (token && token.actor) {
    await token.actor.setFlag('mm3e-better-attacks', 'fatiguePoints', parseInt(value));
  }
  setTimeout(() => { isUpdatingNumbers = false; }, 100);
}

window.updateLuckPoints = async function(tokenId, value) {
  isUpdatingNumbers = true;
  const token = canvas.tokens.get(tokenId);
  if (token && token.actor) {
    await token.actor.setFlag('mm3e-better-attacks', 'luck', parseInt(value));
  }
  setTimeout(() => { isUpdatingNumbers = false; }, 100);
}

window.adjustResource = async function(tokenId, resourceType, delta) {
  console.log('adjustResource called:', tokenId, resourceType, delta);
  
  // Set flag BEFORE doing anything else to prevent UI recreation
  isUpdatingNumbers = true;
  
  const token = canvas.tokens.get(tokenId);
  if (!token || !token.actor) return;
  
  const actor = token.actor;
  let currentValue = 0;
  let newValue = 0;
  
  switch(resourceType) {
    case 'hero':
      currentValue = actor.system.heroisme || 0;
      newValue = Math.max(0, Math.min(9, currentValue + delta));
      console.log('Updating hero from', currentValue, 'to', newValue);
      // Direct property update to avoid hooks
      actor.system.heroisme = newValue;
      await actor.update({ 'system.heroisme': newValue }, { render: false });
      break;
    case 'injury':
      currentValue = actor.system.blessure || 0;
      newValue = Math.max(0, Math.min(9, currentValue + delta));
      console.log('Updating injury from', currentValue, 'to', newValue);
      actor.system.blessure = newValue;
      await actor.update({ 'system.blessure': newValue }, { render: false });
      break;
    case 'fatigue':
      currentValue = actor.getFlag('mm3e-better-attacks', 'fatiguePoints') || 0;
      newValue = Math.max(0, Math.min(9, currentValue + delta));
      console.log('Updating fatigue from', currentValue, 'to', newValue);
      await actor.setFlag('mm3e-better-attacks', 'fatiguePoints', newValue);
      break;
    case 'luck':
      currentValue = actor.getFlag('mm3e-better-attacks', 'luck') || 0;
      newValue = Math.max(0, Math.min(9, currentValue + delta));
      console.log('Updating luck from', currentValue, 'to', newValue);
      await actor.setFlag('mm3e-better-attacks', 'luck', newValue);
      break;
  }
  
  // Update the resource display to show new values
  const existingResourceDisplay = document.getElementById(`token-resource-display-${token.id}`);
  if (existingResourceDisplay) {
    // Get updated values
    const heroPoints = actor.system.heroisme || 0;
    const injuries = actor.system.blessure || 0;
    const fatiguePoints = actor.getFlag('mm3e-better-attacks', 'fatiguePoints') || 0;
    const luckPoints = actor.getFlag('mm3e-better-attacks', 'luck') || 0;
    
    // Update the input values - use more specific selectors
    const inputs = existingResourceDisplay.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
      if (input.onchange && input.onchange.toString().includes('updateHeroPoints')) {
        input.value = heroPoints;
      } else if (input.onchange && input.onchange.toString().includes('updateInjuries')) {
        input.value = injuries;
      } else if (input.onchange && input.onchange.toString().includes('updateFatiguePoints')) {
        input.value = fatiguePoints;
      } else if (input.onchange && input.onchange.toString().includes('updateLuckPoints')) {
        input.value = luckPoints;
      }
    });
  }
  
  // Reset flag after a delay to allow UI updates to complete
  setTimeout(() => { 
    isUpdatingNumbers = false; 
    console.log('isUpdatingNumbers reset to false');
  }, 200);
}

// 
// 2. ATTACKS
//
// 2.1 Convert Attacks from Powers
//
// 2.1.1 Create attacks from powers when clicking "Convert Powers" button

function addConvertAttackFromPowersButton(html, app) {
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
}

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

  // Iterate over advantages to add luck property
  let characterTalents = actor.items.filter(item => item.type === "talent");
  if (characterTalents) {
    for (let talent of characterTalents) {
      if (talent.name && talent.name.toLowerCase().includes("luck")) {
        // Parse luck value from name (e.g., "Luck 4" -> 4)
        let luckValue = 1; // default
        const luckMatch = talent.name.match(/luck\s+(\d+)/i);
        if (luckMatch) {
          luckValue = parseInt(luckMatch[1]);
        } else if (talent.system.rang) {
          luckValue = talent.system.rang;
        }
        
        // Add luck property to actor flags
        let updates = {};
        updates["flags.mm3e-better-attacks.luck"] = luckValue;
        await actor.update(updates);
        console.log(`Added luck property: ${luckValue} to ${actor.name}`);
        break; // Only add once
      }
    }
  }
    
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

async function createAttackDetailsFromPower( matchingPower, actor)    { 
  
  
  let effectName = matchingPower.system.effetsprincipaux
  if(effectName==""){
    effectName = matchingPower.name
  }
  
  // Skip creating attacks for power lifting effects (not actual attacks)
  const powerLiftingPattern = /power\s*-?\s*lifting/i;
  if (powerLiftingPattern.test(effectName) || 
      powerLiftingPattern.test(matchingPower.name) || 
      powerLiftingPattern.test(matchingPower.system.notes || '')) {
    console.log(`Skipping power lifting effect: ${matchingPower.name}`);
    return;
  }
  
  // Check if this power has multiple effects in notes field
  let combinedText = "";
  const multipleEffects = parseMultipleEffectsFromNotes(matchingPower);
  if (multipleEffects.length > 0) {
    // Build combined text description for all effects
    
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
  
  // Check if this power has an "Attack" or "Multiattack" extra (either in extras or notes)
  const hasAttackExtra = checkForAttackExtra(matchingPower);
  const hasMultiattackExtra = checkForMultiattackExtra(matchingPower);
  
  if(!powerConfig && linkNextPower==true)
  {
    linkNextPower = false;
  }
  
  // If no standard power config found but has Attack extra, create an "other" type attack
  if (!powerConfig && hasAttackExtra) {
    await createAttackFromExtra(matchingPower, actor, "Attack");
    return;
  }
  
  // If no standard power config found but has Multiattack extra, create an "other" type attack
  if (!powerConfig && hasMultiattackExtra) {
    await createAttackFromExtra(matchingPower, actor, "Multiattack");
    return;
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

  
    // Calculate critical value based on Dangerous/Improved Critical extras
    const criticalValue = getCriticalFromPower(matchingPower);
    const critique = criticalValue > 0 ? 20 - criticalValue : 20;
    
    await createAttack(matchingPower.name, actor, matchingPower, type, save, critique, powerConfig.attackType, combatSkill, afflictionResults, powerConfig);
  await new Promise(resolve => setTimeout(resolve, 1000));
  }
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
    // Ranged powers (including ranged area)
    defpassive = "esquive";
    
    // Calculate power level (may include strength bonus)
    let powerLevel = matchingPower.system.cout.rang;
    let effectiveRank = matchingPower.system.cout.rang;
    
    if(matchingPower.system.effetsprincipaux.includes('Strength')){
      powerLevel += actor.system.caracteristique.force.total;
      effectiveRank += actor.system.caracteristique.force.total;
    }
    
    // Use helper function to calculate range based on mode (returns squares)
    // For RAW mode, pass the effective rank (including strength bonus)
    // For Tactical mode, pass the power level for factor calculation
    range = calculateRange(effectiveRank, powerLevel, 'short');
  }

if(effect && effect.includes("Strength") || effect =="Unarmed" || 
   (matchingPower.system.effetsprincipaux && matchingPower.system.effetsprincipaux.includes("Strength")) ||
   (matchingPower.system.notes && matchingPower.system.notes.includes("Strength-based")))
{
  ability = "force";
  
}

// Get individual effect ranks from power description
const effectRanks = getEffectRanks(matchingPower, attackType);

// HACK: For multi-effect attacks (Affliction + Weaken), set all three flags to true
// even if there's no actual damage. This is required for the UI to work properly.
const hasMultipleEffects = (effectRanks.affliction > 0 && effectRanks.weaken > 0) || 
                            (effectRanks.affliction > 0 && effectRanks.dmg > 0) ||
                            (effectRanks.weaken > 0 && effectRanks.dmg > 0);

  let newAttackData = {_id:foundry.utils.randomID(),
    afflictioneeffect : 0,        
    area:{has:type=="area", esquive:0},
    attaque : attaque,
  range: range,
    basearea:0,
    critique:critique,
    effet:matchingPower.system.cout.rang,
    isAffliction:effectRanks.affliction > 0 || (effectRanks.weaken > 0 && effectRanks.dmg > 0),
    isDmg:effectRanks.dmg > 0 || hasMultipleEffects,
    isWeaken:effectRanks.weaken > 0,
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
        weaken: {
            targetAbility: ''
        }
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
        noatk: type=="area" || type=="combatperception",
        nocrit: false
    },
    skill:skillId,
    text: getPowerDescription(matchingPower),
    type: type,
};

// Set weaken targetAbility if this is a weaken attack
if (attackType === "weaken" || effectRanks.weaken > 0) {
  const targetAbility = getWeakenTargetAbility(matchingPower);
  newAttackData.repeat.weaken.targetAbility = targetAbility;
  console.log(`[Better Attacks] Setting weaken targetAbility to: ${targetAbility} for power: ${matchingPower.name}`);
  console.log(`[Better Attacks] newAttackData.repeat.weaken:`, newAttackData.repeat.weaken);
}

// Check for Inaccurate flaw and apply attack penalty
const inaccuratePenalty = getInaccuratePenalty(matchingPower);
if (inaccuratePenalty > 0) {
  newAttackData.mod.atk = -inaccuratePenalty;
}

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
  console.log(`[Better Attacks] BEFORE UPDATE - repeat.weaken:`, newAttackData.repeat.weaken);
  await actor.update(updates);
  console.log(`[Better Attacks] AFTER UPDATE - repeat.weaken:`, actor.system.attaque[key].repeat.weaken);
} else { 
  const attacks = actor.system.attaque;
  let newAttack ={}
  let attackKeys = Object.keys(attacks);
  key = attackKeys.length > 0 ? Math.max(...attackKeys) : 0;   
  newAttack[`system.attaque.${key+1}`] = newAttackData
  key =key+1
  console.log(`[Better Attacks] BEFORE UPDATE (new) - repeat.weaken:`, newAttackData.repeat.weaken);
  await actor.update(newAttack);
  console.log(`[Better Attacks] AFTER UPDATE (new) - repeat.weaken:`, actor.system.attaque[key].repeat.weaken);
}



game.actors.set(actor._id , actor)
return actor.system.attaque[key]

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

// 2.1.2 Convert range, close, or perception to attack

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

function hasReactionExtra(power) {
  // Check extras for Reaction extra
  if (power.system.extras) {
    for (const key in power.system.extras) {
      const extra = power.system.extras[key];
      if (extra.name && extra.name.toLowerCase().includes("reaction")) {
        return true;
      }
    }
  }
  
  // Check flaws (sometimes Reaction is listed as a flaw)
  if (power.system.defauts) {
    for (const key in power.system.defauts) {
      const flaw = power.system.defauts[key];
      if (flaw.name && flaw.name.toLowerCase().includes("reaction")) {
        return true;
      }
    }
  }
  
  return false;
}

function hasReactionInNotes(power) {
  if (power.system.notes) {
    return power.system.notes.toLowerCase().includes("reaction");
  }
  return false;
}

// 2.1.3 Convert power to attack for character that has a skill for that attack

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
function findSkillByLabel(skills, label) {
  for (const key in skills.list) {
      if (skills.list[key].label === label) {
          return skills.list[key];
      }
  }
  return null; 
}
// 2.1.3 calulate range based on elongation bonus
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

// 2.1.4 Convert standard power to attack (damage, affliction, weaken, etc)
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
function getEffectRanks(matchingPower, attackType) {
  const powerLevel = matchingPower.system.cout.rang;
  const description = (matchingPower.system.notes || '') + ' ' + (matchingPower.system.effets || '');
  
  let dmgRank = 0;
  let afflictionRank = 0;
  let weakenRank = 0;
  
  // Check for explicit effect mentions in the description
  const dmgMatch = description.match(/(?:Strength\s+Effect|Strength[-\s]?Based\s+Damage|Strength[-\s]?Based)\s+(\d+)/i);
  const afflictionMatch = description.match(/(?:affliction|dazzle|mind control|snare|sleep|suffocation):\s*[A-Za-z\s\-]+\s+(\d+)/i);
  const weakenMatch = description.match(/(?:<br>)?[^:]*:\s*Weaken\s+(\d+)/i);
  
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
    dmg: dmgRank,
    affliction: afflictionRank,
    weaken: weakenRank
  };
}
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
function mapResistanceToFrench(resistance) {
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
    'intelligence': 'intelligence',
    'intellect': 'intelligence',  // Add "Intellect" as alias for "Intelligence"
    'awareness': 'sensibilite',
    'presence': 'presence'
  };
  
  return resistanceMap[resistanceLower] || 'robustesse'; // Default to Toughness if not found
}

function getSaveFromResistance(matchingPower, resistance)
{
  const originalResistance = resistance;
  const notes = matchingPower.system.notes;
  let foundInNotes = false;
  
  //first check notes for "Resisted by: <resistance>"
  const regex = /Resisted by: ([^,]+)/;
  let match = notes.match(regex);
  if(match){
    resistance = match[1];
    foundInNotes = true;
  }
  
  //also check notes for "Alternate Resistance: <resistance>" - this takes priority over extras
  const regex2 = /Alternate Resistance: ([^,]+)/;
  match = notes.match(regex2);
  if(match){
    resistance = match[1];
    foundInNotes = true;
  }
  
  //only check extras for "Alternate Resistance: <resistance>" if nothing was found in notes
  if (!foundInNotes) {
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
  }
  
  return mapResistanceToFrench(resistance);
}

// 2.1.5 Convert linked power to attack
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
  virtualPower.system.notes = originalPower.system.notes + "_____________"
  
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
    
  // Calculate critical value based on Dangerous/Improved Critical extras
  const criticalValue = getCriticalFromPower(virtualPower);
  const critique = criticalValue > 0 ? 20 - criticalValue : 20;
  
  // Create the primary attack
  let attack = await createAttack(virtualPower.name, actor, virtualPower, type, save, critique, powerConfig.attackType, combatSkill, afflictionResults, powerConfig);
  attack.save.affliction.effet = virtualPower.system.cout.rang.toString();
  attack.effet = ""

    
  
  if(effects.length > 1)
  {
    let lastAttackKey = findAttackLastAttackKey(actor.system.attaque);
    const updates = {};
    
    // Set isDmg: true for multi-effect attacks (the system hack)
    if(attack.isDmg==false){
      updates[`system.attaque.${lastAttackKey}.isDmg`] = true;
      updates[`system.attaque.${lastAttackKey}.repeat.dmg`] = [
        {value: 0, status: []},
        {value: 0, status: []},
        {value: 0, status: []},
        {value: 0, status: []}
      ];
      updates[`system.attaque.${lastAttackKey}.save.dmg`] = {};
    }
    
    // Parse resistance types for each effect in multi-effect attacks
    for (const effect of effects) {
      const effectNote = getEffectNotesForEffectName(originalPower.system.notes, effect.name);
      console.log(`[Better Attacks] Effect: ${effect.name}, Note found: ${!!effectNote}`);
      if (!effectNote) continue;
      
      // Parse "Resisted by: <type>" from the effect's description
      const resistedByMatch = effectNote.match(/Resisted by:\s*([^,\n]+)/i);
      console.log(`[Better Attacks] Resisted by match for ${effect.name}:`, resistedByMatch ? resistedByMatch[1] : 'NOT FOUND');
      if (!resistedByMatch) continue;
      
      const resistanceType = mapResistanceToFrench(resistedByMatch[1].trim());
      console.log(`[Better Attacks] Mapped resistance for ${effect.name}: ${resistanceType}`);
      
      // Map effect type to save property
      if (effect.name.toLowerCase().includes('affliction')) {
        updates[`system.attaque.${lastAttackKey}.save.affliction.type`] = resistanceType;
        console.log(`[Better Attacks] Setting affliction resistance to: ${resistanceType}`);
      } else if (effect.name.toLowerCase().includes('weaken')) {
        updates[`system.attaque.${lastAttackKey}.save.weaken.type`] = resistanceType;
        console.log(`[Better Attacks] Setting weaken resistance to: ${resistanceType}`);
      } else if (effect.name.toLowerCase().includes('damage')) {
        updates[`system.attaque.${lastAttackKey}.save.dmg.type`] = resistanceType;
        console.log(`[Better Attacks] Setting dmg resistance to: ${resistanceType}`);
      }
    }
    
    // Apply all updates in a single actor.update() call
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
  }
  
}
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
  
  // If no H3 tags found, look for effect patterns in paragraph content
  if (effects.length === 0) {
    // Look for patterns like "Damage: Strength-based Damage 13" or "Weaken: Weaken 18"
    const paragraphMatches = notes.matchAll(/<p>([\s\S]*?)<\/p>/g);
    
    for (const pMatch of paragraphMatches) {
      const pContent = pMatch[1].trim();
      
      // Pattern: "Effect Type: Effect Name Number" (e.g., "Damage: Strength-based Damage 13")
      const effectPattern = /(?:<br>)?([A-Za-z\s]+):\s*([A-Za-z\s\-]+)\s+(\d+)(?:\s*\([^)]*\))?/ ;
      const effectMatch = pContent.match(effectPattern);
      
      if (effectMatch) {
        const effectType = effectMatch[1].trim();
        const effectName = effectMatch[2].trim();
        const rank = effectMatch[3];
        
        // Check if this effect type is in ACTIVE_EFFECTS_POWERS_CONFIG
        const powerConfig = ACTIVE_EFFECTS_POWERS_CONFIG.find(config => 
          effectType.toLowerCase().includes(config.name.toLowerCase()) ||
          config.name.toLowerCase().includes(effectType.toLowerCase())
        );
        
        if (powerConfig) {
          effects.push({
            name: powerConfig.name,
            fullName: `${effectType}: ${effectName} ${rank}`,
            data: `${powerConfig.name} ${rank}`
          });
        }
      } else {
        // Pattern for no-colon format: "Effect Type Number" (e.g., "Enhanced Trait 15")
        const noColonPattern = /^([A-Za-z\s]+)\s+(\d+)(?:\s*\([^)]*\))?$/;
        const noColonMatch = pContent.match(noColonPattern);
        
        if (noColonMatch) {
          const effectType = noColonMatch[1].trim();
          const rank = noColonMatch[2];
          
          // Check if this effect type is in ACTIVE_EFFECTS_POWERS_CONFIG
          const powerConfig = ACTIVE_EFFECTS_POWERS_CONFIG.find(config => 
            effectType.toLowerCase().includes(config.name.toLowerCase()) ||
            config.name.toLowerCase().includes(effectType.toLowerCase())
          );
          
          if (powerConfig) {
            effects.push({
              name: powerConfig.name,
              fullName: `${effectType} ${rank}`,
              data: `${powerConfig.name} ${rank}`
            });
          }
        }
      }
    }
  }
  
  // Filter to only return effects that are compatible with Active Effects from ACTIVE_EFFECTS_POWERS_CONFIG
  const activeEffects = effects.filter(effect => {
    return ACTIVE_EFFECTS_POWERS_CONFIG.some(power => 
      effect.name.toLowerCase().includes(power.name.toLowerCase()) ||
      power.name.toLowerCase().includes(effect.name.toLowerCase())
    );
  });
  
  return activeEffects;
}
function getEffectNotesForEffectName(notes, effectName){
  // Create a mapping for common effect name variations
  const effectNameMappings = {
    'Strength Damage': ['Strength Damage', 'Strength-based Damage', 'Damage'],
    'Damage': ['Damage', 'Strength Damage', 'Strength-based Damage'],
    'Weaken': ['Weaken'],
    'Affliction': ['Affliction']
  };
  
  // Get possible names to search for
  const searchNames = effectNameMappings[effectName] || [effectName];
  
  // Look for H3 tags containing the effect name, similar to parseMultipleEffectsFromNotes
  for (const searchName of searchNames) {
    const h3Regex = new RegExp(`<h3>([^<]*${searchName}[^<]*)</h3>`, 'i');
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
        if (sectionMatch && sectionMatch[1].trim().includes(searchName)) {
          // Split into paragraphs and get the data paragraph (second one)
          const paragraphs = section.split('</p>').map(p => p.replace(/<[^>]*>/g, '').trim()).filter(p => p.length > 0);
          if (paragraphs.length >= 2) {
            return paragraphs[1]; // Return the data paragraph
          }
        }
      }
    }
  }
  
  // If no H3 tags found, look for effect patterns in paragraph content
  const paragraphMatches = notes.matchAll(/<p>([\s\S]*?)<\/p>/g);
  
  for (const pMatch of paragraphMatches) {
    const pContent = pMatch[1].trim();
    
    // Try each search name
    for (const searchName of searchNames) {
      // Pattern: "Effect Type: Effect Name Number" (e.g., "Damage: Strength-based Damage 13")
      const effectPattern = new RegExp(`(?:<br>)?(${searchName}):\\s*([A-Za-z\\s\\-]+)\\s+(\\d+)(?:\\s*\\([^)]*\\))?`, 'i');
      const effectMatch = pContent.match(effectPattern);
      
      if (effectMatch) {
        // Return the rest of the paragraph content after the effect pattern
        const afterEffect = pContent.substring(effectMatch.index + effectMatch[0].length);
        return afterEffect.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  
  return "";
}

// 2.1.6 Convert power with area of effect to attack

function getAreaFromPower(matchingPower){
  for (const key in matchingPower.system.extras) {
          const item =  matchingPower.system.extras[key];
          if (item.name && (item.name.includes("Area") || item.name.includes("Burst") || item.name.includes("Cone") || item.name.includes("Line"))) {
              return true
          }
    }
    return false; 
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
function checkForAttackExtra(power) {
  // Check extras for actual Attack extra (not just any mention of "attack")
  if (power.system.extras) {
    for (const key in power.system.extras) {
      const extra = power.system.extras[key];
      if (extra.name) {
        const extraName = extra.name.toLowerCase();
        // Look for specific Attack extra patterns
        if (extraName.startsWith('attack') || 
            extraName.includes('attack:') || 
            extraName.includes('attack (')) {
          return true;
        }
      }
    }
  }
  
  // Check flaws (sometimes Attack is listed as a flaw)
  if (power.system.defauts) {
    for (const key in power.system.defauts) {
      const flaw = power.system.defauts[key];
      if (flaw.name) {
        const flawName = flaw.name.toLowerCase();
        // Look for specific Attack extra patterns
        if (flawName.startsWith('attack') || 
            flawName.includes('attack:') || 
            flawName.includes('attack (')) {
          return true;
        }
      }
    }
  }
  
  // Check notes for specific Attack patterns (not just any mention of "attack")
  if (power.system.notes) {
    const notes = power.system.notes.toLowerCase();
    // Look for specific patterns that indicate an Attack extra
    if ((notes.includes('attack:') || 
         notes.includes('attack vs') || 
         notes.includes('attack (')) && 
        !notes.includes('no attack') && 
        !notes.includes('not an attack')) {
      return true;
    }
  }
  
  return false;
}


//2.1.7 Convert power with Multiattack extra to attack
function checkForMultiattackExtra(power) {
  // Check extras
  if (power.system.extras) {
    for (const key in power.system.extras) {
      const extra = power.system.extras[key];
      if (extra.name && extra.name.toLowerCase().includes('multiattack')) {
        return true;
      }
    }
  }
  
  // Check flaws (sometimes Multiattack is listed as a flaw)
  if (power.system.defauts) {
    for (const key in power.system.defauts) {
      const flaw = power.system.defauts[key];
      if (flaw.name && flaw.name.toLowerCase().includes('multiattack')) {
        return true;
      }
    }
  }
  
  // Check notes for "Multiattack" keyword
  if (power.system.notes) {
    const notes = power.system.notes.toLowerCase();
    if (notes.includes('multiattack')) {
      return true;
    }
  }
  
  return false;
}

// 2.1.8 Convert power with Critical extra to attack
function getCriticalFromPower(power) {
  if (power.system.extras && power.system.extras.critical) {
    return power.system.extras.critical;
  }
  return 0;
}
function getCriticalFromPower(matchingPower){
  // First search in notes (more reliable)
  const notes = matchingPower.system.notes || '';
  console.log(`Checking notes: ${notes}`);
  
  // Look for patterns in notes like "Dangerous 4", "Dangerous: 4", "Improved Critical 2", "Improved Critical: 2"
  const dangerousMatch = notes.match(/Dangerous\s*:?\s*(\d+)/i);
  const improvedMatch = notes.match(/Improved\s+Critical\s*:?\s*(\d+)/i);
  
  
  if (dangerousMatch) {
    const value = parseInt(dangerousMatch[1]);
    console.log(`Found Dangerous ${value} in notes`);
    return value;
  }
  if (improvedMatch) {
    const value = parseInt(improvedMatch[1]);
    console.log(`Found Improved Critical ${value} in notes`);
    return value;
  }
  
  // If no number found in notes but contains "Dangerous" or "Improved Critical", default to 1
  if (notes.includes("Dangerous") || notes.includes("Improved Critical")) {
    console.log(`Found critical effect in notes but no number, defaulting to 1`);
    return 1;
  }
  
  // Fallback: search in extras (less reliable)
  for (const key in matchingPower.system.extras) {
    const item = matchingPower.system.extras[key];
    console.log(`Checking extra: ${item.name}`);
    if (item.name && (item.name.includes("Dangerous") || item.name.includes("Improved Critical"))) {
      // Look for patterns like "Dangerous 4", "Dangerous: 4", "Improved Critical 2", "Improved Critical: 2"
      const dangerousMatch = item.name.match(/Dangerous\s*:?\s*(\d+)/i);
      const improvedMatch = item.name.match(/Improved\s+Critical\s*:?\s*(\d+)/i);
      
      console.log(`Extra - Dangerous match: ${dangerousMatch}, Improved match: ${improvedMatch}`);
      
      if (dangerousMatch) {
        const value = parseInt(dangerousMatch[1]);
        console.log(`Found Dangerous ${value} in extras`);
        return value;
      }
      if (improvedMatch) {
        const value = parseInt(improvedMatch[1]);
        console.log(`Found Improved Critical ${value} in extras`);
        return value;
      }
      // If no number found but contains "Dangerous" or "Improved Critical", default to 1
      if (item.name.includes("Dangerous") || item.name.includes("Improved Critical")) {
        console.log(`Found critical effect in extras but no number, defaulting to 1`);
        return 1;
      }
    }
  }
  console.log(`No critical effects found`);
  return 0; // No critical effect found
}

//2.1.9 Convert power with Inaccurate flaw to attack
function getInaccuratePenalty(matchingPower) {
  const notes = matchingPower.system.notes;
  let totalPenalty = 0;
  let foundInNotes = false;
  
  // First check notes for "Inaccurate X: -Y" pattern
  const inaccurateRegex = /Inaccurate\s+(\d+):\s*-(\d+)/gi;
  let match;
  if ((match = inaccurateRegex.exec(notes)) !== null) {
    const level = parseInt(match[1], 10);
    const penalty = parseInt(match[2], 10);
    // Verify it's -2 per level, use the penalty value directly if it matches expected calculation
    if (penalty === level * 2) {
      totalPenalty += penalty;
      foundInNotes = true;
    }
  }
  
  // Also check for "Inaccurate X" pattern without explicit penalty (calculate -2 per level)
  if (!foundInNotes) {
    const inaccurateRegex2 = /Inaccurate\s+(\d+)/gi;
    while ((match = inaccurateRegex2.exec(notes)) !== null) {
      const level = parseInt(match[1], 10);
      totalPenalty += level * 2; // -2 per level
      foundInNotes = true;
    }
  }
  
  // Only check extras/flaws for "Inaccurate" if nothing was found in notes
  if (!foundInNotes) {
    // Check extras (this might be flaws, but checking extras for consistency with existing pattern)
    for (const key in matchingPower.system.extras) {
      const item = matchingPower.system.extras[key];
      if (item.name && item.name.includes("Inaccurate")) {
        const regex = /Inaccurate\s+(\d+)/i;
        const match = item.name.match(regex);
        if (match) {
          const level = parseInt(match[1], 10);
          totalPenalty += level * 2; // -2 per level
        }
      }
    }
    
    // Also check flaws if they exist as a separate property
    if (matchingPower.system.flaws) {
      for (const key in matchingPower.system.flaws) {
        const item = matchingPower.system.flaws[key];
        if (item.name && item.name.includes("Inaccurate")) {
          const regex = /Inaccurate\s+(\d+)/i;
          const match = item.name.match(regex);
          if (match) {
            const level = parseInt(match[1], 10);
            totalPenalty += level * 2; // -2 per level
          }
        }
      }
    }
  }
  
  return totalPenalty;
}
//2.1.10 Convert power with alternate resistance extra to attack
async function createAttackFromExtra(power, actor, extraType) {
  // Determine the resistance type from the Attack extra
  let resistance = "volonte"; // Default resistance (French for Will)
  let resistanceFound = false; // Track if we found a resistance type
  
  // Check notes for resistance type FIRST (more specific than extras)
  if (power.system.notes) {
    const notes = power.system.notes;
    
    // Look for patterns like "Attack vs Will", "Attack: Will", "vs Will", "Resisted by: Will"
    const resistancePatterns = [
      /Attack\s*(?:\([^)]+\))?\s*:\s*([A-Za-z]+)/i,
      /Attack\s+vs\s+([A-Za-z]+)/i,
      /vs\s+([A-Za-z]+)/i,
      /Resisted\s+by:\s*([A-Za-z]+)/i
    ];
    
    for (const pattern of resistancePatterns) {
      const match = notes.match(pattern);
      if (match) {
        const resistanceType = match[1].trim();
        resistanceFound = true; // Mark that we found a resistance type
        // Map common resistance types to French system values
        switch (resistanceType.toLowerCase()) {
          case 'dodge':
            resistance = "esquive";
            break;
          case 'will':
            resistance = "volonte";
            break;
          case 'fortitude':
            resistance = "vigueur";
            break;
          case 'toughness':
            resistance = "robustesse";
            break;
          case 'parry':
            resistance = "parade";
            break;
          case 'esquive':
            resistance = "esquive";
            break;
          case 'volonte':
            resistance = "volonte";
            break;
          case 'vigueur':
            resistance = "vigueur";
            break;
          case 'robustesse':
            resistance = "robustesse";
            break;
          case 'parade':
            resistance = "parade";
            break;
          default:
            // If it's not a standard defense, try to use it as-is
            resistance = resistanceType;
        }
        break; // Found a match, stop looking
      }
    }
  }
  
  // Check extras for resistance type (only if not found in notes)
  if (power.system.extras && !resistanceFound) { // Only check extras if no resistance was found in notes
    for (const key in power.system.extras) {
      const extra = power.system.extras[key];
      if (extra.name && extra.name.toLowerCase().includes('attack')) {
        // Parse resistance type from Attack extra name
        // Formats: "Attack (+self): Will", "Attack: Will", "Attack: Dodge", etc.
        const attackMatch = extra.name.match(/Attack\s*(?:\([^)]+\))?\s*:\s*([A-Za-z]+)/i);
        if (attackMatch) {
          const resistanceType = attackMatch[1].trim();
          // Map common resistance types to French system values
          switch (resistanceType.toLowerCase()) {
            case 'dodge':
              resistance = "esquive";
              break;
            case 'will':
              resistance = "volonte";
              break;
            case 'fortitude':
              resistance = "vigueur";
              break;
            case 'toughness':
              resistance = "robustesse";
              break;
            case 'parry':
              resistance = "parade";
              break;
            case 'esquive':
              resistance = "esquive";
              break;
            case 'volonte':
              resistance = "volonte";
              break;
            case 'vigueur':
              resistance = "vigueur";
              break;
            case 'robustesse':
              resistance = "robustesse";
              break;
            case 'parade':
              resistance = "parade";
              break;
            default:
              // If it's not a standard defense, try to use it as-is
              resistance = resistanceType;
          }
        }
        break;
      }
    }
  }
  
  // Determine attack type based on power characteristics
  let type = "other"; // Default to "other" type
  let isArea = getAreaFromPower(power);
  let isRange = getRangedFromPower(power);
  let isClose = !getRangedFromPower(power) && !isArea;
  let isPerception = getPerceptionFromPower(power);
  
  if (isArea) {
    type = "area";
  } else if (isPerception) {
    type = "combatperception";
  } else if (isRange) {
    type = "combatdistance";
  } else if (isClose) {
    type = "combatcontact";
  }
  
  // Get combat skill if needed
  let combatSkill = null;
  if (type === "combatdistance" || type === "combatcontact") {
    combatSkill = getCombatSkill(actor, power, type);
  }
  
  // Calculate critical value
  const criticalValue = getCriticalFromPower(power);
  const critique = criticalValue > 0 ? 20 - criticalValue : 20;
  
  // Create the attack using the existing createAttack function
  await createAttack(power.name, actor, power, type, resistance, critique, "other", combatSkill, null, null);
}

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

// 2.2 Calculated Distance

// 2.2.1 Edit range values in actor sheet
function addRangeFieldToAttack(html, app) {
  html.find(".reorderDrop[data-type='attaque']").each((_, el) => {
    const $row = $(el);
    const actor = app.actor;
    const atkId = $row.find(".editAtk").data("id");
    if (!atkId) return;
    const attack = Object.values(actor.system.attaque).find(a => a._id === atkId);
    if (!attack) return;

    if ($row.next(".mm3e-range-field").length) return;

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

    $range.find(".mm3e-range-input").on("change", async ev => {
      const v = String(ev.currentTarget.value).trim();
      const entry = Object.entries(actor.system.attaque).find(([_, a]) => a._id === atkId);
      if (!entry) return;
      const [atkKey] = entry;
      await actor.update({ [`system.attaque.${atkKey}.range`]: v });
    });
  });
}

//2.2.2  Switch distance calculation approach when choosing from configured distance setting
function isRAWMode() {
  return game.settings.get('mm3e-better-attacks', 'movementCalculationMode') === 'raw';
}

function calculateRange(rank, powerLevel = null, rangeType = 'short') {
  if (isRAWMode()) {
    // RAW mode: rank x 5 squares for short range
    // (Each rank = 25 feet, and 25 feet / 5 feet per square = 5 squares)
    const multipliersInSquares = {
      'short': 5,    // rank × 25 feet = rank × 5 squares
      'medium': 10,  // rank × 50 feet = rank × 10 squares
      'long': 20     // rank × 100 feet = rank × 20 squares
    };
    return rank * (multipliersInSquares[rangeType] || 5);
  } else {
    // Tactical mode: Use factor-based calculation (already in squares)
    const level = powerLevel !== null ? powerLevel : rank;
    let factor = 1;
    if (level < 7) {
      factor = 2;
    } else if (level >= 7 && level <= 9) {
      factor = 3;
    } else if (level >= 10 && level <= 12) {
      factor = 4;
    } else if (level >= 13 && level <= 16) {
      factor = 5;
    } else if (level >= 17) {
      factor = 6;
    }
    return factor * level;
  }
}

//2.2.4  Convert distance to feet
function convertDistanceToFeet(distanceStr) {
  if (!distanceStr || distanceStr === "Invalid rank") return 0;
  
  // Parse the distance string
  const str = distanceStr.toLowerCase().replace(/,/g, '');
  
  if (str.includes('mile')) {
    const miles = parseFloat(str);
    return miles * 5280; // Convert miles to feet
  } else if (str.includes('feet') || str.includes('foot')) {
    return parseFloat(str);
  } else if (str.includes('inches') || str.includes('inch')) {
    const inches = parseFloat(str);
    return inches / 12; // Convert inches to feet
  }
  
  return 0;
}

function getSpeedFromTable(speedRank, asNumber = false) {
  const table = MeasurementCalculator.MEASUREMENT_TABLE;
  const rankIndex = table.ranks.indexOf(speedRank);
  if (rankIndex === -1) return asNumber ? 0 : "Invalid rank";
  
  const distanceStr = table.distance[rankIndex];
  
  if (asNumber) {
    return convertDistanceToFeet(distanceStr);
  } else {
    return distanceStr;
  }
}


// 2.3 Perform Attacks

// 2.3.1 Launch attack menu when clicking attack action button

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
  
  // Fixed width for consistent appearance
  const menuWidth = 250; // Fixed width for all menus
  
  // Position menu down and to the left like a comic caption
  const menuLeft = canvasRect.left + tokenRect.x - 19; // 19px to the left (1px more to the right)
  
  // Add heart, star, fatigue, and luck icons with numbers above the menu
  const heroPoints = actor.system.heroisme || 0;
  const injuries = actor.system.blessure || 0;
  const fatiguePoints = actor.getFlag('mm3e-better-attacks', 'fatiguePoints') || 0;
  // Check if actor has Luck advantage
  const luckTalent = actor.items.find(item => 
    item.type === 'talent' && 
    item.name.toLowerCase().includes('luck')
  );
  const hasLuck = luckTalent !== undefined;
  console.log('hasLuck:', hasLuck, 'luckTalent:', luckTalent);
  const luckPoints = hasLuck ? (actor.getFlag('mm3e-better-attacks', 'luck') || luckTalent.system.rang || 0) : 0;
  
  
  // Create resource display above the menu
  const resourceDisplay = document.createElement('div');
  resourceDisplay.id = `token-resource-display-${token.id}`;
  resourceDisplay.className = 'token-resource-display';
  resourceDisplay.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - (menuWidth + 20) / 2}px;
    top: ${canvasRect.top + tokenRect.y - (hasLuck ? 94: 55)}px;
    width: ${menuWidth + 20}px;
    height: auto;
    z-index: 950;
    display: table;
    table-layout: auto;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0px;
    font-family: 'Crime Fighter', cursive;
    font-style: italic;
    color: #000000;
    box-shadow: none;
    text-shadow: 1px 1px 0px #FFFFFF;
    pointer-events: auto;
  `;
  
  resourceDisplay.innerHTML = `
    <div style="padding: 6px 6px 0px 6px; display: inline-block; background: transparent;">
      <table style="width: ${menuWidth + 20}px; border: none; border-collapse: separate; border-spacing: 0; background: transparent;">
      ${hasLuck ? `
      <tr style="background: transparent;">
        <td colspan="3" style="text-align: center; vertical-align: middle; padding: 2px 6px 6px 6px; border: none; background: transparent;">
          <div style="display: inline-block; width: ${(menuWidth + 20) / 3.25}px; margin-left: -4px;">
            <div title="Luck Points" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/luck.png') center center; background-size: 100% 100%; z-index: 1;"></div>
              <div style="position: relative; z-index: 2;">
              <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
                <button onclick="adjustResource('${token.id}', 'luck', -1)" style="background: linear-gradient(145deg, #66CC66, #228B22); border: 2px solid #003300; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
                <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                  <i class="fas fa-clover" style="color: #44AA44; font-size: 20px; text-shadow: 2px 2px 0px #228B22, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                  <input type="number" value="${luckPoints}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateLuckPoints('${token.id}', this.value)">
                </div>
                <button onclick="adjustResource('${token.id}', 'luck', 1)" style="background: linear-gradient(145deg, #66CC66, #228B22); border: 2px solid #003300; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
              </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
      ` : ''}
      <tr style="background: transparent;">
        <td style="width: ${(menuWidth + 20) / 3}px; text-align: center; vertical-align: middle; padding: 3px; border: none; background: transparent;">
          <div title="Hero Points" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/hero.png') center center; background-size: 100% 100%; z-index: 1;"></div>
            <div style="position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
              <button onclick="adjustResource('${token.id}', 'hero', -1)" style="background: linear-gradient(145deg, #FFE55C, #CC9900); border: 2px solid #B8860B; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-star" style="color: #FFD700; font-size: 20px; text-shadow: 2px 2px 0px #CC9900, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                <input type="number" value="${heroPoints}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateHeroPoints('${token.id}', this.value)">
              </div>
              <button onclick="adjustResource('${token.id}', 'hero', 1)" style="background: linear-gradient(145deg, #FFE55C, #CC9900); border: 2px solid #B8860B; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
            </div>
            </div>
          </div>
        </td>
        <td style="width: ${(menuWidth + 20) / 3}px; text-align: center; vertical-align: middle; padding: 3px; border: none; background: transparent;">
          <div title="Injuries" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
             <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/injury.png') center center; background-size: 100% 100%; z-index: 1;"></div>
            <div style="position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
              <button onclick="adjustResource('${token.id}', 'injury', -1)" style="background: linear-gradient(145deg, #FF6666, #CC3333); border: 2px solid #8B0000; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-heart" style="color: #FF4444; font-size: 20px; text-shadow: 2px 2px 0px #CC0000, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                <input type="number" value="${injuries}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateInjuries('${token.id}', this.value)">
              </div>
              <button onclick="adjustResource('${token.id}', 'injury', 1)" style="background: linear-gradient(145deg, #FF6666, #CC3333); border: 2px solid #8B0000; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
            </div>
            </div>
          </div>
        </td>
        <td style="width: ${(menuWidth + 20) / 3}px; text-align: center; vertical-align: middle; padding: 3px; border: none; background: transparent;">
          <div title="Fatigue" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30px; border: 1px solid #000000; padding: 5px; position: relative;">
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('modules/mm3e-better-attacks/images/fatigue.png') center center; background-size: 100% 100%; z-index: 1;"></div>
            <div style="position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 2px; margin-bottom: 5px;">
              <button onclick="adjustResource('${token.id}', 'fatigue', -1)" style="background: linear-gradient(145deg, #FFAA44, #CC6600); border: 2px solid #CC6600; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">−</button>
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-battery-full" style="color: #FF8800; font-size: 24px; text-shadow: 2px 2px 0px #CC6600, 4px 4px 2px rgba(0,0,0,0.3); filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));"></i>
                <input type="number" value="${fatiguePoints}" min="0" max="9" style="position: absolute; width: 16px; text-align: center; font-size: 10px; border: none; background: transparent; color: #000; font-weight: bold;" onchange="updateFatiguePoints('${token.id}', this.value)">
              </div>
              <button onclick="adjustResource('${token.id}', 'fatigue', 1)" style="background: linear-gradient(145deg, #FFAA44, #CC6600); border: 2px solid #CC6600; color: white; width: 20px; height: 20px; font-size: 12px; cursor: pointer; border-radius: 3px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset -1px -1px 2px rgba(0,0,0,0.2);">+</button>
            </div>
            </div>
          </div>
        </td>
      </tr>
      </table>
    </div>
  `;
  
  document.body.appendChild(resourceDisplay);
  
  // Create floating action buttons panel to the right of the token
  const actionButtonsPanel = document.createElement('div');
  actionButtonsPanel.id = `token-action-buttons-${token.id}`;
  actionButtonsPanel.className = 'token-action-buttons';
  
  actionButtonsPanel.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - 75}px;
    top: ${canvasRect.top + tokenRect.y + tokenRect.height + 12}px;
    width: 150px;
    height: 55px;
    z-index: 1001;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.1);
    border: none;
    border-radius: 0px;
    padding: 4px;
  `;
  
  // Add hover event listeners to keep the UI visible when hovering over buttons
  actionButtonsPanel.addEventListener('mouseenter', () => {
    // Keep the current token as hovered when entering button area
    if (currentHoveredToken && currentHoveredToken.id === token.id) {
      // Clear any hide timeout
      if (menuShowTimeout) {
        clearTimeout(menuShowTimeout);
        menuShowTimeout = null;
      }
    }
  });
  
  actionButtonsPanel.addEventListener('mouseleave', () => {
    // Don't hide anything on mouseleave - let the main hover logic handle it
    // This prevents conflicts with the expanded hover area
  });
  
  actionButtonsPanel.innerHTML = `
    <button onclick="handleActionButton('${token.id}', 'attack')" style="
      width: 45px; 
      height: 45px; 
      background: url('modules/mm3e-better-attacks/images/attacks.png') center center; 
      background-size: 100% 100%; 
      border: none; 
      cursor: pointer; 
      border-radius: 0px;
      filter: brightness(1.1);
    " title="Attacks"></button>
    
    <button onclick="handleActionButton('${token.id}', 'powers')" style="
      width: 45px; 
      height: 45px; 
      background: url('modules/mm3e-better-attacks/images/powers.png') center center; 
      background-size: 100% 100%; 
      border: none; 
      cursor: pointer; 
      border-radius: 0px;
      filter: brightness(1.1);
    " title="Powers"></button>
    
    <button onclick="handleActionButton('${token.id}', 'maneuvers')" style="
      width: 45px; 
      height: 45px; 
      background: url('modules/mm3e-better-attacks/images/maneuvers.png') center center; 
      background-size: 100% 100%; 
      border: none; 
      cursor: pointer; 
      border-radius: 0px;
      filter: brightness(1.1);
    " title="Maneuvers"></button>
  `;
  
  document.body.appendChild(actionButtonsPanel);
  
  menu.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - (menuWidth + 15) / 2}px;
    top: ${canvasRect.top + tokenRect.y + tokenRect.height + 94}px;
    width: ${menuWidth + 15}px;
    z-index: 960;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px;
    background: url('modules/mm3e-better-attacks/images/attack background.png') center center;
    background-size: 100% 100%;
    border: 1px solid #000000;
    border-radius: 0px;
    box-shadow: none;
  `;
  
  // Create attack buttons
  
  attacks.forEach((attack, index) => {
    const button = document.createElement('button');
    button.className = 'token-attack-button';
    button.textContent = attack.label;
    button.style.cssText = `
      width: 100%;
      height: 32px;
      background: #FFEB3B;
      border: 2px solid #000000;
      border-radius: 0px;
      font-family: 'Bangers', cursive;
      font-size: 16px;
      font-weight: normal;
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
      box-sizing: border-box;
      text-align: center;
      line-height: 20px;
    `;
    
    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.background = '#FFB347'; // Orange on hover
      button.style.color = '#000000';
      button.style.borderColor = '#000000';
      button.style.boxShadow = '4px 4px 0px #000000';
      button.style.transform = 'translateY(-1px)';
      
      // Clear any existing timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      
      // Start 1-second timer to show details
      hoverTimeout = setTimeout(() => {
        showAttackDetails(token, attack, button);
      }, 1000);
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = '#FFEB3B'; // Back to original yellow
      button.style.color = '#000000';
      button.style.borderColor = '#000000';
      button.style.boxShadow = '3px 3px 0px #000000';
      button.style.transform = 'translateY(0px)';
      
      // Clear timeout if mouse leaves before 2 seconds
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
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
  
  // Add comic page background that stretches around the attack menu
  const menuHeight = menu.offsetHeight;
  createComicPageBackground(token, menuHeight);
}

function hideTokenAttackMenu(token) {
  const menu = document.getElementById(`token-attack-menu-${token.id}`);
  if (menu) {
    menu.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => menu.remove(), 300);
  }
  
  // Also remove the resource display for this specific token with animation
  const resourceDisplay = document.getElementById(`token-resource-display-${token.id}`);
  if (resourceDisplay) {
    resourceDisplay.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => resourceDisplay.remove(), 300);
  }
  
  // Also remove the background panel with animation
  const backgroundPanel = document.getElementById(`token-resource-display-only-${token.id}`);
  if (backgroundPanel) {
    backgroundPanel.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => backgroundPanel.remove(), 300);
  }
  
  // Remove any details box for this token with animation
  const detailsBox = document.getElementById(`attack-details-${token.id}`);
  if (detailsBox) {
    detailsBox.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => detailsBox.remove(), 300);
  }
  
  // Reset the original background height for next time
  originalBackgroundHeight = null;
}

// 2.3.2 Display attack information on hover over attack

let currentDetailsBox = null;
let originalBackgroundHeight = null;

function showAttackDetails(token, attack, button) {
  // Remove any existing details box
  hideAttackDetails();
  
  // Create details box
  const detailsBox = document.createElement('div');
  detailsBox.id = `attack-details-${token.id}`;
  detailsBox.className = 'attack-details-box';
  
  // Get the attack text or use a default message
  const attackText = attack.text || attack.label || 'No description available';
  
  // Get attack value and effect types with ranks
  const attackValue = attack.attaque || 0;
  
  // Check for multiple effects and build display
  const effects = [];
  
  // Resistance translation map (shortened to 3-4 letters)
  const resistanceMap = {
    "robustesse": "tgh",
    "vigueur": "fort", 
    "volonte": "will",
    "esquive": "ddge",
    "parade": "pry",
    "intelligence": "int",
    "sagesse": "wis",
    "charisme": "cha",
    "force": "str",
    "dexterite": "dex",
    "constitution": "con"
  };
  
  // Check damage effect
  if (attack.isDmg && attack.save?.dmg?.effet && parseInt(attack.save.dmg.effet) > 0) {
    const resistance = resistanceMap[attack.save.dmg.type] || attack.save.dmg.type || 'tou';
    effects.push(`dmg:${attack.save.dmg.effet}->${resistance}`);
  }
  
  // Check weaken effect
  if (attack.isWeaken && attack.save?.weaken?.effet && parseInt(attack.save.weaken.effet) > 0) {
    const resistance = resistanceMap[attack.save.weaken.type] || attack.save.weaken.type || 'fort';
    effects.push(`wkn:${attack.save.weaken.effet}->${resistance}`);
  }
  
  // Sort effects to ensure affliction is always last
  effects.sort((a, b) => {
    if (a.startsWith('affl:')) return 1; // affliction goes to end
    if (b.startsWith('affl:')) return -1;
    return 0; // maintain original order for others
  });
  
  // Check affliction effect (always last)
  let afflictionConditions = '';
  if (attack.isAffliction && attack.save?.affliction?.effet && parseInt(attack.save.affliction.effet) > 0) {
    const resistance = resistanceMap[attack.save.affliction.type] || attack.save.affliction.type || 'will';
    effects.push(`affl:${attack.save.affliction.effet}->${resistance}`);
    
    // Get affliction conditions for separate display
    if (attack.repeat?.affliction && Array.isArray(attack.repeat.affliction)) {
      const conditionParts = [];
      attack.repeat.affliction.forEach((result, index) => {
        if (result.status && result.status.length > 0) {
          const severity = index + 1;
          // Translate French conditions to English using the complete mapping
          const translatedConditions = result.status.map(status => {
            const conditionMap = {
              // French -> English mappings from findStatusEffect
              "controlled": "controlled",
              "decreased": "impaired", 
              "tired": "fatigued",
              "disabled": "disabled",
              "dazed": "dazed",
              "stuck": "immobile",
              "insensitive": "unaware",
              "invalid": "debilitated",
              "slow": "hindered",
              "defenseless": "defenseless",
              "transformed": "transformed",
              "vulnerability": "vulnerable",
              "chanceling": "staggered",
              "enthralled": "entranced",
              "influenced": "compelled",
              "exhausted": "exhausted",
              "tied": "bound",
              "dying": "dying",
              "neutralized": "incapacitated",
              "stunned": "stunned",
              "dead": "dead"
            };
            return conditionMap[status] || status;
          }).join(' & ');
          conditionParts.push(`${severity}:${translatedConditions}`);
        }
      });
      
      if (conditionParts.length > 0) {
        afflictionConditions = conditionParts.join(' ');
      }
    }
  }
  
  // Fallback to single effect if no multiple effects found
  if (effects.length === 0) {
    const effectRank = attack.effet || 0;
    let effectType = "oth"; // Default to "other"
    if (attack.isDmg) {
      effectType = "dmg";
    } else if (attack.isWeaken) {
      effectType = "wkn";
    } else if (attack.isAffliction) {
      effectType = "affl";
    }
    effects.push(`${effectType}:${effectRank}`);
  }
  
  // Format effects as comma-separated list
  const effectDisplay = effects.join(', ');
  
  // Determine attack type display
  let attackTypeDisplay = "std";
  
  // Check for area attacks first
  if (attack.area && attack.area.has) {
    attackTypeDisplay = "area";
  }
  // Check for perception attacks: noattack and not ar  ea
  else if (attack.settings && attack.settings.noatk && 
           !(attack.area && attack.area.has)) {
    attackTypeDisplay = "per";
  }
  // Check for reaction attacks: check if linked power has Reaction extra
  else if (attack.links && attack.links.pwr) {
    const linkedPower = game.actors.contents
      .flatMap(actor => actor.items.contents)
      .find(item => item._id === attack.links.pwr);
    
    if (linkedPower && (hasReactionExtra(linkedPower) || hasReactionInNotes(linkedPower))) {
      attackTypeDisplay = "rea";
    }
  }
  // Default to Standard for all other attacks
  else {
    attackTypeDisplay = "std";
  }
  
  // Determine range display
  let rangeDisplay = "cls"; // Default to close
  if (attack.type === "combatdistance") {
    rangeDisplay = "rng";
  } else if (attack.type === "combatcontact") {
    rangeDisplay = "cls";
  } else if (attack.range === Infinity) {
    rangeDisplay = "per"; // Perception range
  } else if (attack.range && attack.range > 5) {
    rangeDisplay = "rng";
  }
  
  // Format effects display
  let effectsDisplay = '';
  let additionalEffects = '';
  
  if (effects.length === 1) {
    effectsDisplay = ` | ${effectDisplay}`;
  } else if (effects.length > 1) {
    // First effect on same line, rest stacked below
    effectsDisplay = ` | ${effects[0]}`;
    
    // Additional effects stacked vertically in the same column
    const stackedEffects = effects.slice(1).map(effect => 
      `<div style="font-size: 11px; line-height: 1.2; margin: 0; padding: 0; font-weight: bold; text-align: left;">${effect}</div>`
    ).join('');
    additionalEffects = `<div style="margin-top: 2px; text-align: right;">${stackedEffects}</div>`; 
  }
  
  // Extract extras and flaws from attack text (after DC <num>;)
  let extrasAndFlaws = '';
  if (attackText) {
    const dcMatch = attackText.match(/DC \d+; (.+)/);
    if (dcMatch && dcMatch[1]) {
      extrasAndFlaws = dcMatch[1].trim();
    }
  }

  detailsBox.innerHTML = `
    <div class="attack-details-content">
      <div style="margin-top: 8px; font-weight: bold; display: table; width: 100%;">
        <div style="display: table-row;">
          <div style="display: table-cell; width: 62%;">
            atk: ${attackValue} | ${attackTypeDisplay} | ${rangeDisplay} |
          </div>
          <div style="display: table-cell; width: 38%; text-align: left;">
            ${effects.length > 0 ? effects[0] : ''}
          </div>
        </div>
        ${effects.length > 1 ? `
        <div style="display: table-row;">
          <div style="display: table-cell;"></div>
          <div style="display: table-cell; text-align: left; line-height: 1.2;">
            ${effects.slice(1).map(effect => `<div style="font-weight: bold; margin: 0; padding: 0;">${effect}</div>`).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      ${afflictionConditions ? `<div style="margin-top: 4px; font-weight: bold; font-size: 11px; text-align: left;">${afflictionConditions}</div>` : ''}
      ${extrasAndFlaws ? `<div style="margin-top: 8px; font-weight: bold; font-size: 11px; text-align: left; border-top: 1px solid #000000; padding-top: 5px;">${extrasAndFlaws.split(',').map(item => `<div>${item.trim()}</div>`).join('')}</div>` : ''}
    </div>
  `;
  
  // Add animation styles to document head if not already present
  if (!document.getElementById('attack-details-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'attack-details-animation-styles';
    style.textContent = `
      @keyframes bounceInExpand {
        0% {
          opacity: 0;
          transform: scale(0.3);
        }
        50% {
          opacity: 1;
          transform: scale(1.05);
        }
        70% {
          transform: scale(0.9);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      @keyframes bounceOutContract {
        0% {
          opacity: 1;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(0.3);
        }
      }
      
      .attack-details-bounce-in {
        animation: bounceInExpand 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
      }
      
      .attack-details-bounce-out {
        animation: bounceOutContract 0.2s ease-in forwards;
      }
    `;
    document.head.appendChild(style);
  }

  detailsBox.style.cssText = `
    width: 100%;
    background: #F5F5F5;
    background-image: url('modules/mm3e-better-attacks/images/action lines.png');
    background-size: 100% 100%;
    background-repeat: no-repeat;
    filter: grayscale(30%) contrast(0.8);
    border: 2px solid #000000;
    border-radius: 0px;
    font-family: 'Comic Sans MS', cursive;
    font-size: 12px;
    color: #000000;
    padding: 5px 10px;
    margin-bottom: 4px;
    word-wrap: break-word;
    pointer-events: auto;
    box-sizing: border-box;
    opacity: 0;
    transform: scale(0.3);
  `;
  
  // Insert the details box after the hovered button
  const menu = button.closest('.token-attack-menu');
  button.parentNode.insertBefore(detailsBox, button.nextSibling);
  currentDetailsBox = detailsBox;
  
  // Trigger bounce-in animation
  requestAnimationFrame(() => {
    detailsBox.classList.add('attack-details-bounce-in');
  });
  
  // Expand the background panel to accommodate the details box
  expandBackgroundPanel(token, detailsBox);
  
  // Add mouse leave handlers
  const hideDetails = () => {
    hideAttackDetails();
    contractBackgroundPanel(token);
  };
  
  // Create a small delay before hiding to allow moving between button and details box
  let hideTimeout = null;
  
  const scheduleHide = () => {
    hideTimeout = setTimeout(() => {
      hideDetails();
    }, 100); // 100ms delay
  };
  
  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };
  
  // Button mouseleave - schedule hide
  button.addEventListener('mouseleave', scheduleHide);
  
  // Details box mouseenter - cancel hide
  detailsBox.addEventListener('mouseenter', cancelHide);
  
  // Details box mouseleave - schedule hide
  detailsBox.addEventListener('mouseleave', scheduleHide);
}

function hideAttackDetails() {
  if (currentDetailsBox) {
    // Trigger bounce-out animation
    currentDetailsBox.classList.remove('attack-details-bounce-in');
    currentDetailsBox.classList.add('attack-details-bounce-out');
    
    // Remove element after animation completes
    setTimeout(() => {
      if (currentDetailsBox) {
        currentDetailsBox.remove();
        currentDetailsBox = null;
      }
    }, 200); // Match animation duration
  }
}

function expandBackgroundPanel(token, detailsBox) {
  const backgroundPanel = document.getElementById(`token-resource-display-only-${token.id}`);
  if (!backgroundPanel) return;
  
  // Store the original height if not already stored
  if (originalBackgroundHeight === null) {
    originalBackgroundHeight = backgroundPanel.offsetHeight;
  }
  
  // Wait for the details box to be rendered and get its actual height
  requestAnimationFrame(() => {
    const detailsHeight = detailsBox.offsetHeight;
    
    // Calculate new height: original height + details height + padding
    const newHeight = originalBackgroundHeight + detailsHeight + 5;
    
    backgroundPanel.style.height = `${newHeight}px`;
    
    // The middle section will automatically stretch due to flex: 1
    // We need to update the bottom section positioning
    const bottomSection = backgroundPanel.querySelector('div:last-child');
    if (bottomSection) {
      const bottomOffset = -10; // Keep the same bottom offset
      bottomSection.style.transform = `translateY(${bottomOffset}px)`;
    }
  });
}

function contractBackgroundPanel(token) {
  const backgroundPanel = document.getElementById(`token-resource-display-only-${token.id}`);
  if (!backgroundPanel) return;
  
  // Wait for the details box to be removed and recalculate
  requestAnimationFrame(() => {
    // Always return to the original height
    if (originalBackgroundHeight !== null) {
      backgroundPanel.style.height = `${originalBackgroundHeight}px`;
    }
    
    // Reset bottom section positioning
    const bottomSection = backgroundPanel.querySelector('div:last-child');
    if (bottomSection) {
      const bottomOffset = -10;
      bottomSection.style.transform = `translateY(${bottomOffset}px)`;
    }
  });
}

function createComicPageBackground(token, menuHeight) {
  const actor = token.actor;
  if (!actor) return;
  
  // Check if actor has Luck advantage
  const luckTalent = actor.items.find(item => 
    item.type === 'talent' && 
    item.name.toLowerCase().includes('luck')
  );
  const hasLuck = luckTalent !== undefined;
  
  // Calculate menu dimensions
  const tokenRect = token.mesh.getBounds();
  const canvasRect = canvas.app.view.getBoundingClientRect();
  const menuWidth = 320; // Wider background panel
  const menuLeft = canvasRect.left + tokenRect.x - 35; // Adjusted to keep centered
  
  // Calculate bottom border offset - negative to pull bottom up
  const bottomOffset = -10;
  
  // Create resource display above the menu
  const resourceDisplay = document.createElement('div');
  resourceDisplay.id = `token-resource-display-only-${token.id}`;
  resourceDisplay.className = 'token-resource-display-only';
  resourceDisplay.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - menuWidth / 2}px;
    top: ${canvasRect.top + tokenRect.y + tokenRect.height + 57}px;
    width: ${menuWidth}px;
    height: ${originalBackgroundHeight !== null ? originalBackgroundHeight : menuHeight * 1.0 + 80}px;
    z-index: 90;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    overflow: visible;
    transform: scale(0);
    animation: panelSpreadIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
  `;
  
  resourceDisplay.innerHTML = `
    <div style="width: 100%; height: 40px; background: url('modules/mm3e-better-attacks/images/comic page top.png') no-repeat top center; background-size: 100% 100%; margin: 0; padding: 0; filter: brightness(1.4);"></div>
    <div style="flex: 1; width: 100%; background: url('modules/mm3e-better-attacks/images/comic page middle.png') repeat-y; background-size: 100% auto; background-position: center; margin: 0; padding: 0; filter: brightness(1.4);"></div>
    <div style="width: 100%; height: 40px; background: url('modules/mm3e-better-attacks/images/comic page bottom.png') no-repeat bottom center; background-size: 100% 100%; margin: 0; padding: 0; transform: translateY(${bottomOffset}px); filter: brightness(1.4);"></div>
  `;
  
  document.body.appendChild(resourceDisplay);
}

// 2.3.3 Execute attacks with enhanced targeting

let targetingMode = false;
let targetingToken = null;
let targetingAttack = null;
let originalCursor = null;

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
    
    @font-face {
      font-family: 'Crime Fighter';
      src: url('modules/mm3e-better-attacks/fonts/crimefighterbb_tt.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    
    /* Menu animations */
    @keyframes comicPop {
      0% {
        opacity: 0;
        transform: scale(0.3) rotate(-5deg);
        transform-origin: top center;
      }
      50% {
        transform: scale(1.1) rotate(2deg);
      }
      70% {
        transform: scale(0.95) rotate(-1deg);
      }
      100% {
        opacity: 1;
        transform: scale(1) rotate(0deg);
      }
    }
    
    .token-resource-display-only {
      animation: comicPop 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards;
    }
    
    .token-resource-display {
      animation: comicPop 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55) 0.05s forwards;
      opacity: 0;
    }
    
    .token-attack-menu {
      animation: comicPop 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55) 0.1s forwards;
      opacity: 0;
    }
    
    /* Resource panel styles */
    .resource-item {
      display: flex;
      align-items: center;
      gap: 1px;
    }
    
    .resource-icon {
      font-size: 1rem;
      text-shadow: 1px 1px 0px #000000;
    }
    
    .resource-icon.star { color: #FFFF00; }
    .resource-icon.heart { color: #FF0000; }
    .resource-icon.battery { color: #FFA500; }
    .resource-icon.clover { color: #00FF00; }
    
    .resource-control {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 2px 3px;
      border-radius: 2px;
      height: 16px;
    }
    
    .resource-control.hero { background: #FFFF00; }
    .resource-control.injury { background: #FF0000; }
    .resource-control.fatigue { background: #FFA500; }
    .resource-control.luck { background: #00FF00; }
    
    .resource-input {
      width: 6px !important;
      min-width: 6px !important;
      max-width: 6px !important;
      height: 16px !important;
      border: none !important;
      background: transparent !important;
      color: #000000;
      text-align: center;
      font-weight: bold;
      font-size: 0.5rem;
      padding: 0px !important;
      margin: 0px !important;
      border-radius: 0px;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif !important;
      box-sizing: border-box !important;
      line-height: 16px !important;
    }
    
    .resource-input::-webkit-inner-spin-button,
    .resource-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    
    .resource-btn {
      width: 10px;
      height: 16px;
      border: none;
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: bold;
      background: transparent;
      color: #000000;
      padding: 0;
      margin: 0;
      line-height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .resource-btn i {
      margin-top: -1px;
    }
    
    .resource-btn:last-child {
      margin-left: 2px;
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
    
    #notifications .notification.info {matchingPower.name
      background: #FFFF99 !important;
    }
  `;
  document.head.appendChild(style);
}
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
  
  // Handle Alt+Click - let the game handle targeting
  if (isAltClick && clickedToken) {
    // Let the game's built-in Alt+Click handle the targeting
    // We'll show feedback via the target change events instead
    return;
  }
  
  // If shift click on a token, let the original system handle it
  if (isShiftClick && clickedToken) {
    // Exit targeting mode first
    exitTargetingMode(false, false);
    
    // Let the original click event propagate to the token
    // This will trigger the normal shift click dialogs
    return;
  }
  
  // Handle area attacks first (they may or may not have a clicked token)
  if (isAreaAttack) {
    const worldPos = event.data.getLocalPosition(canvas.stage);
    const distance = canvas.grid.measureDistance(targetingToken, { x: worldPos.x, y: worldPos.y });
    const range = getAttackRange(targetingAttack);
    const inRange = isInRange(distance, range);
    
    if (!inRange) {
        ui.notifications.warn(`Target location is out of range (${Math.round(distance / 5) * 5}ft > ${range}ft).`);
      }
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
    
  } 
  else if (clickedToken && clickedToken !== targetingToken) {
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
        game.user.targets.add(clickedToken);
        //ui.notifications.info(`${clickedToken.name} added to targets.`);
      } else {
        ui.notifications.info(`${clickedToken.name} is already targeted.`);
      }
    } else {
      if (!inRange) {
        ui.notifications.warn(`${clickedToken.name} is out of range (${Math.round(distance / 5) * 5}ft > ${range}ft).`);
      } 
      // Regular click: Add target and attack (preserve existing Alt+clicked targets)
      const currentTargets = Array.from(game.user.targets);
      const targetIds = currentTargets.map(t => t.id);
      
      // Add the clicked target if not already targeted
      if (!targetIds.includes(clickedToken.id)) {
        game.user.targets.add(clickedToken);
      }
      
      // Store values before clearing targeting mode
      const attackToken = targetingToken;
      const attackData = targetingAttack;
      
      exitTargetingMode(false, false); // Don't clear targets, don't show cancel message
      
      // Ensure attacker token is controlled for single-target attacks
      attackToken.control({ releaseOthers: true });
      
      executeAttack(attackToken, attackData);
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
        //ui.notifications.info(`${clickedToken.name} added to targets.`);
      } else {
        ui.notifications.info(`${clickedToken.name} is already targeted.`);
      }
    } else {
      // Regular click: Self-target and attack
      const currentTargets = Array.from(game.user.targets);
      const targetIds = currentTargets.map(t => t.id);
      
      if (!targetIds.includes(clickedToken.id)) {
        game.user.targets.add(clickedToken);
      }
      
      const attackToken = targetingToken;
      const attackData = targetingAttack;
      
      attackToken.control({ releaseOthers: true });
      executeAttack(attackToken, attackData);
      exitTargetingMode(false, false); // Don't clear targets, don't show cancel message
    }
      } else {
        // Clicked on empty space (no token) - execute normal attack
        const attackToken = targetingToken;
        const attackData = targetingAttack;
        
        exitTargetingMode(false, false); // Don't clear targets, don't show cancel message
        
        // Ensure attacker token is controlled for single-target attacks
        attackToken.control({ releaseOthers: true });
        
        executeAttack(attackToken, attackData);
      }
}
function onTargetingKeyDown(event) {
  if (event.key === 'Escape' && targetingMode) {
    event.preventDefault();
    event.stopPropagation(); // Prevent ESC from closing Foundry forms
    exitTargetingMode(true, true); // Clear targets and show cancel message when canceling with ESC
  }
}
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
function isInRange(distance, range) {
  // Treat range 0 as range 1 (melee range)
  const effectiveRange = range === 0 ? 1 : range;
  return distance <= effectiveRange;
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

// 2.3.4 Show green/red overlay on targets when hovering
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

function removeTargetingOverlay() {
  const overlay = document.getElementById('targeting-overlay');
  if (overlay) {
    overlay.remove();
  }
}

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

// 2.3.5 Display range indicator on targets
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
    border: 1px solid #000000;
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

function clearRangeDisplay() {
  const display = document.getElementById('range-display');
  if (display) {
    display.remove();
  }
}

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

function clearDistanceDisplay() {
  const display = document.getElementById('distance-display');
  if (display) {
    display.remove();
  }
}

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

// 2.3.6 Handle area attacks with template placement
let previewTemplate = null;
let lastRangeState = null;

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

function cancelTemplate(event) {
  event.preventDefault();
  deactivateTemplate(event);
  targetTemplate.reject();
}

function confirmTemplate(event) {
  event.stopPropagation();

  targetTemplate.resolve({
    object: targetTemplate.object,
    document: targetTemplate.document,
    targets: acquireTargets(targetTemplate.object),
  });
  deactivateTemplate(event);
}

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
  game.user.targets.clear();
  targets.forEach(token => game.user.targets.add(token));
  
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

function clearTemplatePreview() {
  if (previewTemplate) {
    previewTemplate.destroy();
    previewTemplate = null;
  }
}

// 3. POWERS

// 3.1 Extract speed values when clicking "Import Speed from Powers" button

function addConvertSpeedFromPowersButton(html, app) {
  const speedSection = html.find(".speed");
  const importSpeedButton = $(`<a class="add" data-type="import-speed-action">Import Speed from Powers</a>`);
  
  speedSection.append(importSpeedButton);
  
  importSpeedButton.on("click", (event) => {
    event.preventDefault();
    ImportSpeedFromPowers(app.actor, app);  
  });
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
    
    // Calculate speeds based on mode
    const rank = movePower.rank;
    let perRoundFeet, mphValue;
    
    if (isRAWMode()) {
      // RAW mode: Use the speed table (6 seconds = 1 turn)
      // Get numeric feet for perRoundFeet
      perRoundFeet = getSpeedFromTable(rank, true);
      
  
      const feetPerTurn = perRoundFeet;
      const mph = (feetPerTurn * 600) / 5280;
      
    } else {
      // Tactical mode: Use existing calculation
      perRoundFeet = calculateTacticalSpeedFromRank(rank); // Tactical movement in feet per round

      // Out-of-combat speed calculation (already returns miles per hour) -
      let outOfCombatRoundFeet = getSpeedFromTable(rank, true);
     
      const mph = (outOfCombatRoundFeet * 600) / 5280;
      mphValue = mph .toFixed(0);
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
  // Use the tactical speed calculation (feet per round/6 seconds)
  const feetPerRound = calculateTacticalSpeedFromRank(powerLevel);
  const milesPerHour = (feetPerRound * 600) / 5280;
  
  return milesPerHour;
}

// 3.2 Launch power menu when clicking powers action button on hover menu
function showTokenPowerMenu(token) {
  // Don't show menu if in targeting mode
  if (targetingMode) return;
  
  const actor = token.actor;
  if (!actor || !actor.items) return;
  
  // Get all powers that are NOT also attacks, NOT movement powers, and NOT arrays (parent powers with children)
  const powers = actor.items.filter(item => {
    if (item.type !== 'pouvoir') return false;
    
    // Check if this power is also an attack by looking for pwr field
    const isAttack = Object.values(actor.system.attaque || {}).some(attack => 
      attack.pwr === item._id
    );
    
    // Check if this is a movement power
    const isMovementPower = identifyMovementPower(item);
    
    // Check if this power is an array (has children in pwrLink)
    const isArray = actor.pwrLink && actor.pwrLink[item._id] && actor.pwrLink[item._id].length > 0;
    
    return !isAttack && !isMovementPower && !isArray; // Only include powers that are NOT attacks, NOT movement powers, and NOT arrays
  });
  
  if (powers.length === 0) {
    ui.notifications.info(`${actor.name} has no powers to display`);
    return;
  }
  
  // Remove any existing menu
  hideTokenPowerMenu(token);
  
  // Create menu container
  const menu = document.createElement('div');
  menu.id = `token-power-menu-${token.id}`;
  menu.className = 'token-power-menu';
  
  // Position menu with smart positioning to avoid going off-screen
  const tokenRect = token.mesh.getBounds();
  const canvasRect = canvas.app.view.getBoundingClientRect();
  
  // Fixed width for consistent appearance
  const menuWidth = 250;
  
  menu.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + tokenRect.x + tokenRect.width / 2 - (menuWidth + 15) / 2}px;
    top: ${canvasRect.top + tokenRect.y + tokenRect.height + 94}px;
    width: ${menuWidth + 15}px;
    z-index: 960;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px;
    background: url('modules/mm3e-better-attacks/images/attack background.png') center center;
    background-size: 100% 100%;
    border: 1px solid #000000;
    border-radius: 0px;
    box-shadow: none;
  `;
  
  // Create power buttons (same structure as attacks)
  powers.forEach((power, index) => {
    // Check if power has active effects to determine layout
    const hasActiveEffects = power.system?.listEffectsVariantes && Object.keys(power.system.listEffectsVariantes).length > 0;
    
    if (hasActiveEffects) {
      // Create a row container for button + slider
      const powerRow = document.createElement('div');
      powerRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      `;
      
      // Create button (takes most of the space)
      const button = document.createElement('button');
      button.className = 'token-power-button';
      button.textContent = power.name;
      button.style.cssText = `
        flex: 1;
        height: 32px;
        background: #FFEB3B;
        border: 2px solid #000000;
        border-radius: 0px;
        font-family: 'Bangers', cursive;
        font-size: 16px;
        font-weight: normal;
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
        box-sizing: border-box;
        text-align: center;
        line-height: 20px;
      `;
      
      // Create slider (fixed width)
      const toggle = document.createElement('input');
      toggle.type = 'range';
      toggle.min = '0';
      toggle.max = '1';
      toggle.step = '1';
      toggle.value = power.system.activate ? '1' : '0';
      toggle.style.cssText = `
        width: 60px;
        height: 24px;
        appearance: none;
        background: transparent;
        cursor: pointer;
        border: 2px solid #000000;
        border-radius: 12px;
        box-shadow: 2px 2px 0px #000000;
        padding: 2px;
      `;
      
      // Add the sliding thumb
      const sliderThumb = document.createElement('div');
      sliderThumb.style.cssText = `
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background-color: white;
        border-radius: 50%;
        transition: transform 0.3s ease;
        border: 1px solid #000000;
        box-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        pointer-events: none;
      `;
      
      // Create a wrapper for the slider
      const sliderWrapper = document.createElement('div');
      sliderWrapper.style.cssText = `
        position: relative;
        display: inline-block;
        width: 60px;
        height: 24px;
        background-color: #ccc;
        border-radius: 12px;
        border: 2px solid #000000;
      `;
      
      sliderWrapper.appendChild(toggle);
      sliderWrapper.appendChild(sliderThumb);
      
      // Update slider appearance based on state
      const updateSlider = () => {
        if (toggle.value === '1') {
          sliderWrapper.style.backgroundColor = '#4CAF50';
          sliderThumb.style.transform = 'translateX(36px)';
        } else {
          sliderWrapper.style.backgroundColor = '#ccc';
          sliderThumb.style.transform = 'translateX(0px)';
        }
      };
      
      // Initial state
      updateSlider();
      
      toggle.addEventListener('change', async () => {
        const isActive = power.system?.activate ?? false;
        const value = toggle.value === '1';
        const link = power.system?.link ?? '';
        let linksFilter = [];

        if(value) {
          linksFilter = actor.items.filter(itm =>
            (itm.system.link === link && itm._id !== power._id && link !== '' && (power.system.special === 'alternatif' || itm.system.special === 'alternatif')) ||
            (itm._id === power.system.link && power.system.special === 'alternatif') ||
            (itm.system.link === power._id && itm.system.special === 'alternatif'));

          for(let l of linksFilter) {
            l.update({['system.activate']:false});
          }
        }

        await power.update({[`system.activate`]:value});
        
        // Update the slider appearance
        updateSlider();
      });
      
      // Add click handler to roll the power (same as character sheet dice button)
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTokenPowerMenu(token);
        // Use the MM3E system's RollMacroPwr function directly (same as executeAttack approach)
        await game.mm3.RollMacroPwr(
          actor._id,
          token.scene?.id || 'null',
          token.id || 'null',
          power._id,
          actor.type,
          { altKey: false, shiftKey: false } // Default event options
        );
      });
      
      // Add hover effect to button (WITH SLIDER - separate branch)
      button.addEventListener('mouseenter', () => {
        button.style.background = '#FFB347'; // Orange on hover
        button.style.color = '#000000';
        button.style.borderColor = '#000000';
        button.style.boxShadow = '4px 4px 0px #000000';
        button.style.transform = 'translateY(-1px)';
        
        // Clear any existing timeout
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
        
        // Start 1-second timer to show details
        hoverTimeout = setTimeout(() => {
          showPowerDetailsWithSlider(token, power, button, powerRow);
        }, 1000);
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.background = '#FFEB3B'; // Back to original yellow
        button.style.color = '#000000';
        button.style.borderColor = '#000000';
        button.style.boxShadow = '3px 3px 0px #000000';
        button.style.transform = 'translateY(0px)';
        
        // Clear timeout if mouse leaves before 1 second
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
      });
      
      // Add elements to row
      powerRow.appendChild(button);
      powerRow.appendChild(sliderWrapper);
      
      // Add row to menu
      menu.appendChild(powerRow);
      
    } else {
      // No effects - just the button (full width like attacks)
      const button = document.createElement('button');
      button.className = 'token-power-button';
      button.textContent = power.name;
      button.style.cssText = `
        width: 100%;
        height: 32px;
        background: #FFEB3B;
        border: 2px solid #000000;
        border-radius: 0px;
        font-family: 'Bangers', cursive;
        font-size: 16px;
        font-weight: normal;
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
        box-sizing: border-box;
        text-align: center;
        line-height: 20px;
      `;
      
      // Add click handler to roll the power (same as character sheet dice button)
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTokenPowerMenu(token);
        // Use the MM3E system's RollMacroPwr function directly (same as executeAttack approach)
        await game.mm3.RollMacroPwr(
          actor._id,
          token.scene?.id || 'null',
          token.id || 'null',
          power._id,
          actor.type,
          { altKey: false, shiftKey: false } // Default event options
        );
      });
      
      // Add hover effect (NO SLIDER - separate branch)
      button.addEventListener('mouseenter', () => {
        button.style.background = '#FFB347'; // Orange on hover
        button.style.color = '#000000';
        button.style.borderColor = '#000000';
        button.style.boxShadow = '4px 4px 0px #000000';
        button.style.transform = 'translateY(-1px)';
        
        // Clear any existing timeout
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
        
        // Start 1-second timer to show details
        hoverTimeout = setTimeout(() => {
          showPowerDetailsNoSlider(token, power, button);
        }, 1000);
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.background = '#FFEB3B'; // Back to original yellow
        button.style.color = '#000000';
        button.style.borderColor = '#000000';
        button.style.boxShadow = '3px 3px 0px #000000';
        button.style.transform = 'translateY(0px)';
        
        // Clear timeout if mouse leaves before 1 second
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }
      });
      
      menu.appendChild(button);
    }
  });
  
  document.body.appendChild(menu);
  
  // Add comic page background that stretches around the power menu
  const menuHeight = menu.offsetHeight;
  createComicPageBackground(token, menuHeight);
}

function hideTokenPowerMenu(token) {
  const menu = document.getElementById(`token-power-menu-${token.id}`);
  if (menu) {
    menu.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => menu.remove(), 300);
  }
  
  // Also remove the resource display for this specific token with animation
  const resourceDisplay = document.getElementById(`token-resource-display-${token.id}`);
  if (resourceDisplay) {
    resourceDisplay.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => resourceDisplay.remove(), 300);
  }
  
  // Also remove the background panel with animation
  const backgroundPanel = document.getElementById(`token-resource-display-only-${token.id}`);
  if (backgroundPanel) {
    backgroundPanel.style.animation = 'panelSpreadOut 0.3s ease-in forwards';
    setTimeout(() => backgroundPanel.remove(), 300);
  }
  
  // Reset the original background height for next time
  originalBackgroundHeight = null;
}

// 3.3 Display power information on hover

function showPowerDetailsNoSlider(token, power, button) {
  // Remove any existing details box for this token
  const existingDetails = document.getElementById(`power-details-${token.id}`);
  if (existingDetails) {
    existingDetails.remove();
  }
  
  // Get power data - use effetsprincipaux for effect names and ranks
  const effetsprincipaux = power.system.effetsprincipaux || "";
  const extras = power.system.extras || {};
  const defauts = power.system.defauts || {};
  
  // Build extras/flaws list
  let extrasText = "";
  const extrasList = [];
  Object.values(extras).forEach(extra => {
    if (extra.data && extra.data.name) {
      extrasList.push(`+ ${extra.data.name}`);
    }
  });
  Object.values(defauts).forEach(defaut => {
    if (defaut.data && defaut.data.name) {
      extrasList.push(`- ${defaut.data.name}`);
    }
  });
  extrasText = extrasList.join(', ');
  
  // Create details box
  const detailsBox = document.createElement('div');
  detailsBox.id = `power-details-${token.id}`;
  detailsBox.className = 'power-details-box';
  
  // Format the content - use only effetsprincipaux (effect name), not power name
  let detailsContent = effetsprincipaux;
  
  detailsBox.innerHTML = `
    <div class="power-details-content">
      <div style="font-weight: bold;">
        ${detailsContent}
      </div>
      ${extrasText ? `<div style="margin-top: 8px; font-weight: bold; font-size: 11px; text-align: left; padding-top: 5px;">${extrasText.split(',').map(item => `<div>${item.trim()}</div>`).join('')}</div>` : ''}
    </div>
  `;
  
  // Add animation styles
  if (!document.getElementById('power-details-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'power-details-animation-styles';
    style.textContent = `
      @keyframes bounceInExpand {
        0% { opacity: 0; transform: scale(0.3); }
        50% { opacity: 1; transform: scale(1.05); }
        70% { transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes bounceOutContract {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.3); }
      }
      .power-details-bounce-in { animation: bounceInExpand 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
      .power-details-bounce-out { animation: bounceOutContract 0.2s ease-in forwards; }
    `;
    document.head.appendChild(style);
  }

  detailsBox.style.cssText = `
    width: 100%;
    background: #F5F5F5;
    background-image: url('modules/mm3e-better-attacks/images/action lines.png');
    background-size: 100% 100%;
    background-repeat: no-repeat;
    filter: grayscale(30%) contrast(0.8);
    border: 2px solid #000000;
    border-radius: 0px;
    font-family: 'Comic Sans MS', cursive;
    font-size: 12px;
    color: #000000;
    padding: 5px 10px;
    margin-bottom: 4px;
    word-wrap: break-word;
    pointer-events: auto;
    box-sizing: border-box;
    opacity: 0;
    transform: scale(0.3);
  `;
  
  // Insert after the button (NO SLIDER - like attacks)
  button.parentNode.insertBefore(detailsBox, button.nextSibling);
  currentDetailsBox = detailsBox;
  
  // Trigger bounce-in animation
  requestAnimationFrame(() => {
    detailsBox.classList.add('power-details-bounce-in');
  });
  
  // Add mouse leave handlers
  const hideDetails = () => {
    hideAttackDetails();
  };
  
  let hideTimeout = null;
  const scheduleHide = () => {
    hideTimeout = setTimeout(() => {
      hideDetails();
    }, 100);
  };
  
  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };
  
  button.addEventListener('mouseleave', scheduleHide);
  detailsBox.addEventListener('mouseenter', cancelHide);
  detailsBox.addEventListener('mouseleave', scheduleHide);
}

function hidePowerDetails(token) {
  const detailsBox = document.getElementById(`power-details-${token.id}`);
  if (detailsBox) {
    detailsBox.classList.add('power-details-bounce-out');
    setTimeout(() => {
      if (detailsBox.parentNode) {
        detailsBox.remove();
      }
    }, 200);
  }
}

//4  Active Effects
// 4.1 Create Active Effects from Powers
function addCreateActiveEffectsFromPowersButton(html, app) {
  const powersSection = html.find(".tab.pouvoirs");
  if (powersSection.length > 0) {
    const createEffectsButton = $(`<a class="add" data-type="create-effects-action">Create Active Effects</a>`);
    powersSection.append(createEffectsButton);
    
    createEffectsButton.on("click", (event) => {
      event.preventDefault();
      CreateActiveEffectsFromPowers(app.actor, app);
    });
  }
}

const ACTIVE_EFFECTS_POWERS_CONFIG = [
  { name: "Enhanced Trait", effectType: "enhanced_trait" },
  { name: "Enhanced Ability", effectType: "enhanced_ability" },
  { name: "Protection", effectType: "protection" },
  { name: "Enhanced Strength", effectType: "enhanced_trait" },
  { name: "Enhanced Agility", effectType: "enhanced_trait" },
  { name: "Enhanced Fighting", effectType: "enhanced_trait" },
  { name: "Enhanced Awareness", effectType: "enhanced_trait" },
  { name: "Enhanced Stamina", effectType: "enhanced_trait" },
  { name: "Enhanced Intellect", effectType: "enhanced_trait" },
  { name: "Enhanced Presence", effectType: "enhanced_trait" },
  { name: "Enhanced Toughness", effectType: "enhanced_trait" },
  { name: "Enhanced Dodge", effectType: "enhanced_trait" },
  { name: "Enhanced Parry", effectType: "enhanced_trait" },
  { name: "Enhanced Fortitude", effectType: "enhanced_trait" },
  { name: "Enhanced Will", effectType: "enhanced_trait" },
  // Defenses
  { name: "Enhanced Acrobatics", effectType: "enhanced_trait" },
  { name: "Enhanced Athletics", effectType: "enhanced_trait" },
  { name: "Enhanced Deception", effectType: "enhanced_trait" },
  { name: "Enhanced Insight", effectType: "enhanced_trait" },
  { name: "Enhanced Intimidation", effectType: "enhanced_trait" },
  { name: "Enhanced Investigation", effectType: "enhanced_trait" },
  { name: "Enhanced Perception", effectType: "enhanced_trait" },
  { name: "Enhanced Persuasion", effectType: "enhanced_trait" },
  { name: "Enhanced Stealth", effectType: "enhanced_trait" },
  { name: "Enhanced Technology", effectType: "enhanced_trait" },
  { name: "Enhanced Treatment", effectType: "enhanced_trait" },
  { name: "Enhanced Vehicles", effectType: "enhanced_trait" }
];


async function CreateActiveEffectsFromPowers(actor, app) {
if (!actor) {
  ui.notifications.error("No actor selected");
  return;
}

try {
  ui.notifications.info("Creating Active Effects from powers...");
  
  // Get actual Foundry item documents instead of raw data
  const powerItems = actor.items.filter(item => item.type === 'pouvoir');
  let powersUpdated = 0;
  
  for (let power of powerItems) {
    let linkedPower = actor.pwrLink[power._id];
    if (linkedPower && linkedPower.length > 0) {
      // Power has linked powers - process those instead of the main power
      for (let key = 0; key < linkedPower.length; key++) {
        let childPowerData = linkedPower[key];
        // Get the actual Foundry document for the linked power
        const childPower = powerItems.find(item => item._id === childPowerData._id);
        if (childPower) {
          const updated = await addActiveEffectsAsVariants(childPower, actor);
          if (updated) powersUpdated++;
        }
      }
    } else {
      // Power has no linked powers - check the main power itself
      const updated = await addActiveEffectsAsVariants(power, actor);
      if (updated) powersUpdated++;
    }
  }
  
  if (powersUpdated === 0) {
    ui.notifications.info("No compatible effects found in powers");
    return;
  }
  
  ui.notifications.info(`Added Active Effects to ${powersUpdated} powers`);
  
  // Refresh the actor sheet to show new effects
  app.render();
  
} catch (error) {
  console.error("Error creating Active Effects from powers:", error);
  ui.notifications.error("Failed to create Active Effects from powers");
}
}

async function addActiveEffectsAsVariants(power, actor) {
try {
  const traitBonuses = await extractActiveEffectsFromPower(power, actor);
  if (traitBonuses.length === 0) return false;
  
  console.log(`=== Processing Power: ${power.name} ===`);
  console.log(`Found ${traitBonuses.length} trait bonuses:`, traitBonuses);
  
  const variantId = "e1";
  const variantName = power.name;
  
  // Check if there's already an Active Effect with the same name
  const existingEffect = power.effects.find(effect => effect.name === variantName);
  
  if (existingEffect) {
    console.log(`Found existing Active Effect "${variantName}", deleting and recreating`);
    
    // Delete existing effect from power
    await power.deleteEmbeddedDocuments('ActiveEffect', [existingEffect.id]);
    
    // Also delete from actor if it exists there
    const powerActor = power.actor;
    if (powerActor !== null) {
      const actorEffect = powerActor.effects.find(effect => effect.name === variantName);
      if (actorEffect) {
        await powerActor.deleteEmbeddedDocuments('ActiveEffect', [actorEffect.id]);
      }
    }
    
    console.log(`Deleted existing Active Effect for ${power.name}`);
  }
  
  // Create new effect (either after deletion or if none existed)
  console.log(`Creating new Active Effect for ${power.name}`);
  
  // Delete existing variants if they exist
  const existingVariants = power.system.listEffectsVariantes || {};
  if (Object.keys(existingVariants).length > 0) {
    console.log(`Deleting existing variants for ${power.name}`);
    delete power.system.listEffectsVariantes;
  }
  
  // Convert trait bonuses to Foundry changes using MM3E format
  const changes = [];
  for (const bonus of traitBonuses) {
    const traitKey = mapSystemTraitToPath(bonus.trait);
    if (traitKey) {
      changes.push({
        key: traitKey,
        mode: 2, // ADD mode
        priority: null,
        value: bonus.bonus.toString()
      });
      console.log(`Added ${bonus.trait} +${bonus.bonus} to ${traitKey}`);
    }
  }
  
  console.log(`Created changes for ${power.name} with ${changes.length} total changes:`, changes);
  
  // Update the power with variant data first
  const updateData = {
    "system.listEffectsVariantes": {
      [variantId]: variantName
    },
    "system.effectsVarianteSelected": variantId
  };
  
  await power.update(updateData);
  
  // Use MM3E's createEffectsWithChanges function
  let updateItemEffects = {
    name: variantName,
    flags: {
      'mutants-and-masterminds-3e': {
        variante: variantId
      }
    },
    icon: '',
    changes: changes,
    parent: power,
    disabled: true
  };

  await power.createEmbeddedDocuments('ActiveEffect', [updateItemEffects]);

  // Also create on actor for FoundryVTT v12 compatibility
  const powerActor = power.actor;
  if (powerActor !== null) {
    let updateActorEffects = {
      name: variantName,
      flags: {
        'mutants-and-masterminds-3e': {
          variante: variantId
        }
      },
      icon: '',
      changes: changes,
      origin: `Actor.${powerActor._id}.Item.${power._id}`,
      disabled: true
    };

    await powerActor.createEmbeddedDocuments('ActiveEffect', [updateActorEffects]);
  }
  console.log(`✅ Successfully added Active Effects to power: ${power.name}`);
  console.log(`📊 Effects added to ${power.name}:`, traitBonuses.map(b => `${b.trait} +${b.bonus}`).join(', '));
  return true;
  
} catch (error) {
  console.error(`Error adding variants to power ${power.name}:`, error);
  return false;
}
}

async function extractActiveEffectsFromPower(power, actor) {
const effects = [];

try {
  console.log(`🔍 Analyzing power: ${power.name}`);
  console.log(`📝 Notes: ${power.system.notes}`);
  console.log(`⚡ Effetsprincipaux: ${power.system.effetsprincipaux}`);
  
  // Step 1: Look for enhancement keywords in notes, effetsprincipaux, then name
  const enhancementKeywords = ['enhanced ability', 'enhanced trait', 'enhanced', 'protection'];
  let foundEnhancement = false;
  let searchText = '';
  
  // Check notes first
  if (power.system.notes) {
    searchText = power.system.notes.toLowerCase();
    console.log(`🔍 Checking notes: "${searchText}"`);
    for (const keyword of enhancementKeywords) {
      if (searchText.includes(keyword)) {
        console.log(`✅ Found enhancement keyword "${keyword}" in notes`);
        foundEnhancement = true;
        break;
      }
    }
  }
  
  // Check effetsprincipaux if no enhancement found in notes
  if (!foundEnhancement && power.system.effetsprincipaux) {
    searchText = power.system.effetsprincipaux.toLowerCase();
    console.log(`🔍 Checking effetsprincipaux: "${searchText}"`);
    for (const keyword of enhancementKeywords) {
      if (searchText.includes(keyword)) {
        console.log(`✅ Found enhancement keyword "${keyword}" in effetsprincipaux`);
        foundEnhancement = true;
        break;
      }
    }
  }
  
  // Check power name if no enhancement found yet
  if (!foundEnhancement) {
    searchText = power.name.toLowerCase();
    console.log(`🔍 Checking power name: "${searchText}"`);
    for (const keyword of enhancementKeywords) {
      if (searchText.includes(keyword)) {
        console.log(`✅ Found enhancement keyword "${keyword}" in power name`);
        foundEnhancement = true;
        break;
      }
    }
  }
  
  if (!foundEnhancement) {
    console.log(`❌ No enhancement keywords found in power: ${power.name}`);
    return effects; // No enhancement found
  }
  
  // Step 2: Extract trait bonuses from all sources
  const traitBonuses = [];
  
  // Search in notes
  if (power.system.notes) {
    const notesBonuses = extractTraitBonusesFromText(power.system.notes);
    traitBonuses.push(...notesBonuses);
  }
  
  // Search in effetsprincipaux
  if (power.system.effetsprincipaux) {
    const primaryBonuses = extractTraitBonusesFromText(power.system.effetsprincipaux);
    traitBonuses.push(...primaryBonuses);
  }
  
  // Search in power name
  const nameBonuses = extractTraitBonusesFromText(power.name);
  traitBonuses.push(...nameBonuses);
  
  // Step 3: Create effect objects
  for (const bonus of traitBonuses) {
    effects.push({
      trait: bonus.trait,
      bonus: bonus.bonus
    });
  }
  
} catch (error) {
  console.error(`Error extracting effects from power ${power.name}:`, error);
}

return effects;
}

function convertMM3EEffectToActiveEffect(mm3eEffect, power, actor) {
if (!mm3eEffect || !mm3eEffect.name) return null;

// Create base Active Effect structure
const activeEffect = {
  name: `${power.name} - ${mm3eEffect.name}`,
  label: `${power.name} - ${mm3eEffect.name}`,  // Display name for users
  icon: power.img || "icons/svg/aura.svg",
  origin: null,
  disabled: true,
  duration: {
    startTime: null,
    seconds: null,
    combat: null,
    rounds: null,
    turns: null,
    startRound: null,
    startTurn: null
  },
  changes: [],
  flags: {
    "mm3e-better-attacks": {
      sourcePower: power._id,
      effectType: mm3eEffect.name
    }
  }
};

// Get the power's rank for the effect value
const effectValue = power.system.cout ? power.system.cout.rang : 1;

// Convert specific MM3E effects to Foundry changes
switch (mm3eEffect.name.toLowerCase()) {
  case "enhanced trait":
    // Try to map to specific traits based on the effect text
    if (mm3eEffect.details && mm3eEffect.details[1]) {
      const traitName = mm3eEffect.details[1].toLowerCase();
      
      let traitKey = null;
      switch (traitName) {
        // Characteristics/Abilities
        case "strength":
        case "force":
          traitKey = "system.force";
          break;
        case "agility":
        case "agilite":
          traitKey = "system.agilite";
          break;
        case "fighting":
        case "combativite":
          traitKey = "system.combativite";
          break;
        case "awareness":
        case "vigilance":
          traitKey = "system.vigilance";
          break;
        case "stamina":
        case "endurance":
          traitKey = "system.endurance";
          break;
        case "intellect":
        case "intelligence":
          traitKey = "system.intelligence";
          break;
        case "presence":
        case "presence":
          traitKey = "system.presence";
          break;
        
        // Defenses
        case "toughness":
        case "robustesse":
          traitKey = "system.robustesse";
          break;
        case "dodge":
        case "esquive":
          traitKey = "system.esquive";
          break;
        case "parry":
        case "parade":
          traitKey = "system.parade";
          break;
        case "fortitude":
        case "vigueur":
          traitKey = "system.vigueur";
          break;
        case "will":
        case "volonte":
          traitKey = "system.volonte";
          break;
        
        // Skills (common ones that might be enhanced)
        case "acrobatics":
        case "acrobaties":
          traitKey = "system.competence.acrobaties";
          break;
        case "athletics":
        case "athletisme":
          traitKey = "system.competence.athletisme";
          break;
        case "deception":
        case "tromperie":
          traitKey = "system.competence.tromperie";
          break;
        case "insight":
        case "intuition":
          traitKey = "system.competence.intuition";
          break;
        case "intimidation":
        case "intimidation":
          traitKey = "system.competence.intimidation";
          break;
        case "investigation":
        case "enquete":
          traitKey = "system.competence.enquete";
          break;
        case "perception":
        case "perception":
          traitKey = "system.competence.perception";
          break;
        case "persuasion":
        case "persuasion":
          traitKey = "system.competence.persuasion";
          break;
        case "stealth":
        case "discretion":
          traitKey = "system.competence.discretion";
          break;
        case "technology":
        case "technologie":
          traitKey = "system.competence.technologie";
          break;
        case "treatment":
        case "soins":
          traitKey = "system.competence.soins";
          break;
        case "vehicles":
        case "vehicules":
          traitKey = "system.competence.vehicules";
          break;
      }
      
      if (traitKey) {
        activeEffect.changes.push({
          key: traitKey,
          mode: 2, // ADD
          value: effectValue,
          priority: 20
        });
      }
    }
    break;
    
  case "enhanced ability":
    // Enhanced Ability can affect any ability, defense, or skill
    // For now, store as custom data since we'd need to parse which specific ability
    activeEffect.changes.push({
      key: `flags.mm3e-better-attacks.enhancedAbility.${power.name}`,
      mode: 5, // CUSTOM
      value: effectValue,
      priority: 20
    });
    break;
    
  case "protection":
    // Protection affects Toughness
    activeEffect.changes.push({
      key: "system.robustesse",
      mode: 2, // ADD
      value: effectValue,
      priority: 20
    });
    break;
    
  default:
    // For unknown effects, store as custom data
    activeEffect.changes.push({
      key: `flags.mm3e-better-attacks.customEffects.${mm3eEffect.name}`,
      mode: 5, // CUSTOM
      value: effectValue,
      priority: 20
    });
    break;
}

// Only return if we have changes to apply
return activeEffect.changes.length > 0 ? activeEffect : null;
}

function convertMM3EEffectToChanges(mm3eEffect, power, actor) {
const changes = [];

if (!mm3eEffect || !mm3eEffect.name) return changes;

// Get the effect value - use the parsed rank if available, otherwise use power's rank
const effectValue = mm3eEffect.value || (power.system.cout ? power.system.cout.rang : 1);

// Convert specific MM3E effects to Foundry changes
if (mm3eEffect.name.toLowerCase().includes("enhanced trait")) {
  // Handle Enhanced Trait effects (generic or specific)
  // Check if we have specific traits from notes first
  if (mm3eEffect.specificTraits && mm3eEffect.specificTraits.length > 0) {
    // Create changes for each specific trait found in notes with their individual bonus values
    for (const traitData of mm3eEffect.specificTraits) {
      const traitKey = mapSystemTraitToPath(traitData.name);
      if (traitKey) {
        changes.push({
          key: traitKey,
          mode: 2, // ADD
          value: traitData.bonus, // Use the individual bonus from notes
          priority: 20
        });
      }
    }
  } else if (mm3eEffect.details && mm3eEffect.details[1]) {
    // Fall back to mapping based on the effect text
    const traitName = mm3eEffect.details[1].toLowerCase();
    const traitKey = mapSystemTraitToPath(traitName);
    if (traitKey) {
      changes.push({
        key: traitKey,
        mode: 2, // ADD
        value: effectValue, // Use the total from effetsprincipaux
        priority: 20
      });
    }
  } else {
    // Try to extract trait name from power name (e.g., "Goo Strength - Enhanced Trait")
    const traitName = extractTraitFromPowerName(power.name, power);
    if (traitName) {
      const traitKey = mapSystemTraitToPath(traitName);
      if (traitKey) {
        changes.push({
          key: traitKey,
          mode: 2, // ADD
          value: effectValue,
          priority: 20
        });
      } else {
        throw new Error(`Unknown trait name "${traitName}" extracted from power name "${power.name}"`);
      }
    } else {
      throw new Error(`Cannot determine specific trait for generic "Enhanced Trait" in power "${power.name}". No specific traits found in notes, effects, or power name.`);
    }
  }
} else if (mm3eEffect.name.toLowerCase().includes("enhanced ability")) {
  // Enhanced Ability can affect any ability, defense, or skill
  // For now, store as custom data since we'd need to parse which specific ability
  changes.push({
    key: `flags.mm3e-better-attacks.enhancedAbility.${power.name}`,
    mode: 5, // CUSTOM
    value: effectValue,
    priority: 20
  });
} else if (mm3eEffect.name.toLowerCase().includes("protection")) {
  // Protection affects Toughness
  changes.push({
    key: "system.defense.robustesse.bonuses",
    mode: 2, // ADD
    value: effectValue,
    priority: 20
  });
} else {
  // For unknown effects, store as custom data
  changes.push({
    key: `flags.mm3e-better-attacks.customEffects.${mm3eEffect.name}`,
    mode: 5, // CUSTOM
    value: effectValue,
    priority: 20
  });
}

return changes;
}

//4.1.1 extract  effects that cause Active Effects from Powers
function extractTraitBonusesFromText(text) {
  const bonuses = [];
  
  if (!text) return bonuses;
  
  // Handle Protection effect type
  if (text.toLowerCase().includes('protection')) {
    const match = text.match(/protection\s+(\d+)/i);
    if (match) {
      bonuses.push({
        trait: "toughness",
        bonus: parseInt(match[1])
      });
      return bonuses;
    }
  }
  
  // Look for patterns like "Strength +5", "Agility 3", "Toughness -2", etc.
  const patterns = [
    // Pattern: "TraitName +Number" or "TraitName -Number" - capture the first number before any brackets
    /(\w+)\s*([+-]?\d+)(?=\s*\([^)]*\)|,|\s|$)/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const traitName = match[1].trim();
      const bonusValue = parseInt(match[2]);
      
      // Map trait name to system name
      const mappedTrait = mapTraitNameToSystem(traitName);
      if (mappedTrait && bonusValue !== 0) { // Allow negative values too
        bonuses.push({
          trait: mappedTrait,
          bonus: bonusValue
        });
      }
    }
  }
  
  return bonuses;
}
  
function parseEffectsFromField(effectText, power = null) {
  if (!effectText) return [];
  
  const effects = [];
  
  // Look for actual MM3E effect patterns that exist in the system
  const patterns = [
    { name: "Enhanced Trait", regex: /enhanced\s+(\w+)\s+(\d+(?:\.\d+)?)/i, value: 2 },
    { name: "Enhanced Ability", regex: /enhanced\s+ability\s+(\d+(?:\.\d+)?)/i, value: 1 },
    { name: "Protection", regex: /protection\s+(\d+(?:\.\d+)?)/i, value: 1 },
    { name: "Enhanced Trait", regex: /enhanced\s+trait/i, value: 0 } // Generic Enhanced Trait without specific trait
  ];
  
  for (const pattern of patterns) {
    const match = effectText.match(pattern.regex);
    if (match) {
      // Extract the rank value from the match
      let rankValue = 1; // default
      if (pattern.name === "Enhanced Trait" && match[2]) {
        rankValue = parseFloat(match[2]); // Use parseFloat to handle decimals
      } else if ((pattern.name === "Enhanced Ability" || pattern.name === "Protection") && match[1]) {
        rankValue = parseFloat(match[1]); // Use parseFloat to handle decimals
      }
      
      let effectData = {
        name: pattern.name,
        value: rankValue,
        text: match[0],
        details: match
      };
      
      // If this is a generic "Enhanced Trait" and we have a power with notes, try to extract specific traits
      if (pattern.name === "Enhanced Trait" && match[1].toLowerCase() === "trait" && power && power.system.notes) {
        const specificTraits = extractSpecificTraitsFromNotes(power.system.notes);
        if (specificTraits.length > 0) {
          effectData.specificTraits = specificTraits;
        }
      }
      
      effects.push(effectData);
    }
  }
  
  return effects;
}
  
function extractSpecificTraitsFromNotes(notes) {
const traits = [];

if (!notes) return traits;

// Look for patterns like "Traits: Dodge +4, Perception +2, Parry +1, Acrobatics +1, Agility +2"
const traitsMatch = notes.match(/traits:\s*([^<]+)/i);
if (traitsMatch) {
  const traitsText = traitsMatch[1];
  
  // Split by comma and extract trait names and bonuses
  const traitEntries = traitsText.split(',');
  
  for (const entry of traitEntries) {
    // Extract trait name and bonus value
    // Pattern: "TraitName +Value (other stuff)"
    const traitMatch = entry.trim().match(/(\w+)\s*\+(\d+)/);
    if (traitMatch) {
      const traitName = traitMatch[1].trim();
      const bonusValue = parseInt(traitMatch[2]);
      
      // Map to system trait names
      const mappedTrait = mapTraitNameToSystem(traitName);
      if (mappedTrait) {
        traits.push({
          name: mappedTrait,
          bonus: bonusValue
        });
      }
    }
  }
}

return traits;
}
function extractTraitFromPowerName(powerName, power = null) {
if (!powerName) return null;

// First try to extract from power name
const patterns = [
  // Pattern: "Something TraitName - Enhanced Trait"
  /(\w+)\s*-\s*enhanced\s+trait/i,
  // Pattern: "Enhanced TraitName"
  /enhanced\s+(\w+)/i,
  // Pattern: "TraitName Enhancement"
  /(\w+)\s+enhancement/i,
  // Pattern: "TraitName Boost"
  /(\w+)\s+boost/i
];

for (const pattern of patterns) {
  const match = powerName.match(pattern);
  if (match) {
    const traitName = match[1].toLowerCase();
    // Check if this trait name is valid
    const mappedTrait = mapTraitNameToSystem(traitName);
    if (mappedTrait) {
      return mappedTrait;
    }
  }
}

// If not found in power name, try to extract from notes
if (power && power.system.notes) {
  const notes = power.system.notes;
  
  // Look for patterns like "Enhanced Trait: Strength" or "Enhanced Trait: Agility"
  const notesPattern = /enhanced\s+trait:\s*(\w+)/i;
  const notesMatch = notes.match(notesPattern);
  if (notesMatch) {
    const traitName = notesMatch[1].toLowerCase();
    const mappedTrait = mapTraitNameToSystem(traitName);
    if (mappedTrait) {
      return mappedTrait;
    }
  }
  
  // Look for patterns like "Strength +X" in notes
  const traitPattern = /(\w+)\s*\+\d+/i;
  const traitMatch = notes.match(traitPattern);
  if (traitMatch) {
    const traitName = traitMatch[1].toLowerCase();
    const mappedTrait = mapTraitNameToSystem(traitName);
    if (mappedTrait) {
      return mappedTrait;
    }
  }
}

return null;
}
function mapTraitNameToSystem(traitName) {
  const traitMap = {
    // Characteristics
    "strength": "strength",
    "force": "strength", 
    "agility": "agility",
    "agilite": "agility",
    "fighting": "fighting",
    "combativite": "fighting",
    "awareness": "awareness",
    "vigilance": "awareness",
    "stamina": "stamina",
    "endurance": "stamina",
    "intellect": "intellect",
    "intelligence": "intellect",
    "presence": "presence",
    
    // Defenses
    "toughness": "toughness",
    "robustesse": "toughness",
    "dodge": "dodge",
    "esquive": "dodge",
    "parry": "parry",
    "parade": "parry",
    "fortitude": "fortitude",
    "vigueur": "fortitude",
    "will": "will",
    "volonte": "will",
    
    // Skills
    "acrobatics": "acrobatics",
    "acrobaties": "acrobatics",
    "athletics": "athletics",
    "athletisme": "athletics",
    "deception": "deception",
    "tromperie": "deception",
    "insight": "insight",
    "intuition": "insight",
    "intimidation": "intimidation",
    "investigation": "investigation",
    "enquete": "investigation",
    "perception": "perception",
    "persuasion": "persuasion",
    "stealth": "stealth",
    "discretion": "stealth",
    "technology": "technology",
    "technologie": "technology",
    "treatment": "treatment",
    "soins": "treatment",
    "vehicles": "vehicles",
    "vehicules": "vehicles"
  };
  
  return traitMap[traitName.toLowerCase()] || null;
}
function mapSystemTraitToTruncated(systemTrait) {
  // Handle full system paths like "system.defense.esquive.bonuses"
  const pathMap = {
    // Characteristics
    "system.caracteristique.force.bonuses": "str",
    "system.caracteristique.agilite.bonuses": "agi",
    "system.caracteristique.combativite.bonuses": "fgt",
    "system.caracteristique.vigilance.bonuses": "awr",
    "system.caracteristique.endurance.bonuses": "sta",
    "system.caracteristique.intelligence.bonuses": "int",
    "system.caracteristique.presence.bonuses": "pre",
    
    // Defenses
    "system.defense.robustesse.bonuses": "tgh",
    "system.defense.esquive.bonuses": "ddge",
    "system.defense.parade.bonuses": "pry",
    "system.defense.vigueur.bonuses": "fort",
    "system.defense.volonte.bonuses": "will",
    
    // Skills
    "system.competence.acrobaties.bonuses": "acro",
    "system.competence.athletisme.bonuses": "ath",
    "system.competence.tromperie.bonuses": "dec",
    "system.competence.intuition.bonuses": "ins",
    "system.competence.intimidation.bonuses": "intim",
    "system.competence.enquete.bonuses": "inv",
    "system.competence.perception.bonuses": "perc",
    "system.competence.persuasion.bonuses": "pers",
    "system.competence.discretion.bonuses": "stealth",
    "system.competence.technologie.bonuses": "tech",
    "system.competence.soins.bonuses": "treat",
    "system.competence.vehicules.bonuses": "veh"
  };
  
  // Check for full path first
  if (pathMap[systemTrait]) {
    return pathMap[systemTrait];
  }
  
  // Fallback to simple trait names
  const simpleMap = {
    "strength": "str",
    "agility": "agi", 
    "fighting": "fgt",
    "awareness": "awr",
    "stamina": "sta",
    "intellect": "int",
    "presence": "pre",
    "toughness": "tgh",
    "dodge": "ddge",
    "parry": "pry", 
    "fortitude": "fort",
    "will": "will",
    "acrobatics": "acro",
    "athletics": "ath",
    "deception": "dec",
    "insight": "ins",
    "intimidation": "intim",
    "investigation": "inv",
    "perception": "perc",
    "persuasion": "pers",
    "stealth": "stealth",
    "technology": "tech",
    "treatment": "treat",
    "vehicles": "veh"
  };
  
  return simpleMap[systemTrait] || systemTrait;
}
function mapSystemTraitToPath(traitName) {
const pathMap = {
  // Characteristics
  "strength": "system.caracteristique.force.bonuses",
  "agility": "system.caracteristique.agilite.bonuses",
  "fighting": "system.caracteristique.combativite.bonuses",
  "awareness": "system.caracteristique.vigilance.bonuses",
  "stamina": "system.caracteristique.endurance.bonuses",
  "intellect": "system.caracteristique.intelligence.bonuses",
  "presence": "system.caracteristique.presence.bonuses",
  
  // Defenses
  "toughness": "system.defense.robustesse.bonuses",
  "dodge": "system.defense.esquive.bonuses",
  "parry": "system.defense.parade.bonuses",
  "fortitude": "system.defense.vigueur.bonuses",
  "will": "system.defense.volonte.bonuses",
  
  // Skills
  "acrobatics": "system.competence.acrobaties.bonuses",
  "athletics": "system.competence.athletisme.bonuses",
  "deception": "system.competence.tromperie.bonuses",
  "insight": "system.competence.intuition.bonuses",
  "intimidation": "system.competence.intimidation.bonuses",
  "investigation": "system.competence.enquete.bonuses",
  "perception": "system.competence.perception.bonuses",
  "persuasion": "system.competence.persuasion.bonuses",
  "stealth": "system.competence.discretion.bonuses",
  "technology": "system.competence.technologie.bonuses",
  "treatment": "system.competence.soins.bonuses",
  "vehicles": "system.competence.vehicules.bonuses"
};

return pathMap[traitName.toLowerCase()] || null;
}

//4.2 toggle active effects on power menu details
function showPowerDetailsWithSlider(token, power, button, powerRow) {
  // Remove any existing details box for this token
  const existingDetails = document.getElementById(`power-details-${token.id}`);
  if (existingDetails) {
    existingDetails.remove();
  }
  
  // Get power data - use effetsprincipaux for effect names and ranks
  const effetsprincipaux = power.system.effetsprincipaux || "";
  const extras = power.system.extras || {};
  const defauts = power.system.defauts || {};
  
  // Build active effects list
  let activeEffectsText = "";
  if (power.system.listEffectsVariantes && Object.keys(power.system.listEffectsVariantes).length > 0) {
    const effects = [];
    Object.entries(power.system.listEffectsVariantes).forEach(([key, effectName]) => {
      const effect = power.effects.find(e => e.getFlag('mutants-and-masterminds-3e', 'variante') === key);
      if (effect && effect.changes) {
        const bonuses = effect.changes.map(change => {
          const truncatedTrait = mapSystemTraitToTruncated(change.key);
          return `${truncatedTrait}:+${change.value}`;
        }).join(', ');
        effects.push(bonuses); // Don't show effect name, just the bonuses
      } else {
        effects.push(effectName);
      }
    });
    activeEffectsText = effects.join(', ');
  }
  
  // Build extras/flaws list
  let extrasText = "";
  const extrasList = [];
  Object.values(extras).forEach(extra => {
    if (extra.data && extra.data.name) {
      extrasList.push(`+ ${extra.data.name}`);
    }
  });
  Object.values(defauts).forEach(defaut => {
    if (defaut.data && defaut.data.name) {
      extrasList.push(`- ${defaut.data.name}`);
    }
  });
  extrasText = extrasList.join(', ');
  
  // Create details box
  const detailsBox = document.createElement('div');
  detailsBox.id = `power-details-${token.id}`;
  detailsBox.className = 'power-details-box';
  
  // Format the content - effect name on first line, active effects on second line
  let detailsContent = effetsprincipaux;
  if (activeEffectsText) {
    detailsContent = `${effetsprincipaux}\n${activeEffectsText}`;
  }   
  
  detailsBox.innerHTML = `
    <div class="power-details-content">
      <div style="font-weight: bold;">
        ${effetsprincipaux}
      </div>
      ${activeEffectsText ? `<div style="font-weight: bold;">${activeEffectsText}</div>` : ''}
      ${extrasText ? `<div style="margin-top: 8px; font-weight: bold; font-size: 11px; text-align: left; padding-top: 5px;">${extrasText.split(',').map(item => `<div>${item.trim()}</div>`).join('')}</div>` : ''}
    </div>
  `;
  
  // Add animation styles
  if (!document.getElementById('power-details-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'power-details-animation-styles';
    style.textContent = `
      @keyframes bounceInExpand {
        0% { opacity: 0; transform: scale(0.3); }
        50% { opacity: 1; transform: scale(1.05); }
        70% { transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes bounceOutContract {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.3); }
      }
      .power-details-bounce-in { animation: bounceInExpand 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
      .power-details-bounce-out { animation: bounceOutContract 0.2s ease-in forwards; }
    `;
    document.head.appendChild(style);
  }

  detailsBox.style.cssText = `
    width: 100%;
    background: #F5F5F5;
    background-image: url('modules/mm3e-better-attacks/images/action lines.png');
    background-size: 100% 100%;
    background-repeat: no-repeat;
    filter: grayscale(30%) contrast(0.8);
    border: 2px solid #000000;
    border-radius: 0px;
    font-family: 'Comic Sans MS', cursive;
    font-size: 12px;
    color: #000000;
    padding: 5px 10px;
    margin-bottom: 4px;
    word-wrap: break-word;
    pointer-events: auto;
    box-sizing: border-box;
    opacity: 0;
    transform: scale(0.3);
  `;
  
  // Insert after the power row (WITH SLIDER)
  powerRow.parentNode.insertBefore(detailsBox, powerRow.nextSibling);
  currentDetailsBox = detailsBox;
  
  // Trigger bounce-in animation
  requestAnimationFrame(() => {
    detailsBox.classList.add('power-details-bounce-in');
  });
  
  // Add mouse leave handlers
  const hideDetails = () => {
    hideAttackDetails();
  };
  
  let hideTimeout = null;
  const scheduleHide = () => {
    hideTimeout = setTimeout(() => {
      hideDetails();
    }, 100);
  };
  
  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };
  
  button.addEventListener('mouseleave', scheduleHide);
  detailsBox.addEventListener('mouseenter', cancelHide);
  detailsBox.addEventListener('mouseleave', scheduleHide);
}



// 5. CALCULATE MEASUREMENTS

class MeasurementCalculator extends Application {
  constructor(options = {}) {
    super(options);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "measurement-calculator",
      title: "Measurement Lookup & Calculator",
      template: "modules/mm3e-better-attacks/templates/measurement-calculator.html",
      width: 600,
      height: 500,
      resizable: true,
      classes: ["measurement-calculator"]
    });
  }

  static get MEASUREMENT_TABLE() {
    return {
      ranks: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      mass: ["1.5 lb.", "3 lbs.", "6 lbs.", "12 lbs.", "25 lbs.", "50 lbs.", "100 lbs.", "200 lbs.", "400 lbs.", "800 lbs.", "1,600 lbs.", "3,200 lbs.", "3 tons", "6 tons", "12 tons", "25 tons", "50 tons", "100 tons", "200 tons", "400 tons", "800 tons", "1,600 tons", "3.2 ktons", "6.4 ktons", "12.8 ktons", "25.6 ktons", "51.2 ktons", "102.4 ktons", "204.8 ktons", "409.6 ktons", "819.2 ktons", "1,638.4 ktons", "3,276.8 ktons", "6,553.6 ktons", "13,107.2 ktons", "25,000 ktons"],
      time: ["1/8 second", "1/4 second", "1/2 second", "1 second", "2 seconds", "6 seconds", "12 seconds", "30 seconds", "1 minute", "2 minutes", "4 minutes", "8 minutes", "15 minutes", "30 minutes", "1 hour", "2 hours", "4 hours", "8 hours", "16 hours", "1 day", "2 days", "4 days", "1 week", "2 weeks", "1 month", "2 months", "4 months", "8 months", "1.5 years", "3 years", "6 years", "12 years", "25 years", "50 years", "100 years", "200 years"],
      distance: ["6 inches", "1 foot", "2 feet", "4 feet", "8 feet", "15 feet", "30 feet", "60 feet", "120 feet", "250 feet", "500 feet", "1,000 feet", "1/2 mile", "1 mile", "2 miles", "4 miles", "8 miles", "16 miles", "30 miles", "60 miles", "120 miles", "250 miles", "500 miles", "1,000 miles", "2,000 miles", "4,000 miles", "8,000 miles", "16,000 miles", "32,000 miles", "64,000 miles", "125,000 miles", "250,000 miles", "500,000 miles", "1 million miles", "2 million miles", "4 million miles"],
      volume: ["1/32 cft.", "1/16 cft.", "1/8 cft.", "1/4 cft.", "1/2 cft.", "1 cubic ft. (cft.)", "2 cft.", "4 cft.", "8 cft.", "15 cft.", "30 cft.", "60 cft.", "125 cft.", "250 cft.", "500 cft.", "1,000 cft.", "2,000 cft.", "4,000 cft.", "8,000 cft.", "16,000 cft.", "32,000 cft.", "64,000 cft.", "125,000 cft.", "250,000 cft.", "500,000 cft.", "1 million cft.", "2 million cft.", "4 million cft.", "8 million cft.", "15 million cft.", "30 million cft.", "60 million cft.", "125 million cft.", "250 million cft.", "500 million cft.", "1 billion cft."]
    };
  }

  //5.1 calculate value from rank for time, distance, mass, and volume
  static getMeasurementValue(rank, type) {
    const table = this.MEASUREMENT_TABLE;
    const rankIndex = table.ranks.indexOf(rank);
    if (rankIndex === -1) return "Invalid rank";
    const typeMap = { 'mass': table.mass, 'time': table.time, 'distance': table.distance, 'volume': table.volume };
    return typeMap[type] ? typeMap[type][rankIndex] : "Invalid type";
  }

  //5.2 calculate rank from value for time, distance, mass, and volume
  static findRankFromValue(value, type) {
    const table = this.MEASUREMENT_TABLE;
    const typeMap = { 'mass': table.mass, 'time': table.time, 'distance': table.distance, 'volume': table.volume };
    const values = typeMap[type];
    if (!values) return null;
    
    for (let i = 0; i < values.length; i++) {
      if (values[i].toLowerCase().includes(value.toLowerCase())) {
        return table.ranks[i];
      }
    }
    return null;
  }

  //5.3 calculate distance from time and speed rank
  static calculateDistance(timeRank, speedRank) { return timeRank + speedRank; }
  //5.4 calculate time from distance and speed rank
  static calculateTime(distanceRank, speedRank) { return distanceRank - speedRank; }
  //5.5 calculate throwing distance from strength and mass rank
  static calculateThrowingDistance(strengthRank, massRank) { return strengthRank - massRank; }

  getData() {
    const table = this.constructor.MEASUREMENT_TABLE;
    return { 
      measurementTypes: [{ value: 'mass', label: 'Mass' }, { value: 'time', label: 'Time' }, { value: 'distance', label: 'Distance' }, { value: 'volume', label: 'Volume' }],
      timeValues: table.time.map((value, index) => ({ rank: table.ranks[index], value })),
      distanceValues: table.distance.map((value, index) => ({ rank: table.ranks[index], value })),
      massValues: table.mass.map((value, index) => ({ rank: table.ranks[index], value }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('#rank-input').on('input', this.onRankInput.bind(this));
    html.find('#measurement-type').on('change', this.onMeasurementTypeChange.bind(this));
    html.find('#time-lookup, #speed-input').on('change input', this.onDistanceCalculation.bind(this));
    html.find('#distance-lookup, #speed-input2').on('change input', this.onTimeCalculation.bind(this));
    html.find('#strength-input, #mass-lookup').on('input change', this.onThrowingDistanceCalculation.bind(this));
    html.find('#reset-button').on('click', this.onReset.bind(this));
  }


  onRankInput(event) {
    const rank = parseInt(event.target.value);
    const type = this.element.find('#measurement-type').val();
    if (!isNaN(rank) && type) {
      const value = this.constructor.getMeasurementValue(rank, type);
      this.element.find('#measurement-result').text(value);
    }
  }

  onMeasurementTypeChange(event) {
    const rank = parseInt(this.element.find('#rank-input').val());
    const type = event.target.value;
    
    // Clear all previous selections
    this.element.find('#measurement-type option').removeAttr('selected').removeClass('selected-option');
    
    // Set the selected option
    this.element.find(`#measurement-type option[value="${type}"]`).attr('selected', 'selected');
    
    if (!isNaN(rank) && type) {
      const value = this.constructor.getMeasurementValue(rank, type);
      this.element.find('#measurement-result').text(value);
    }
  }

  onDistanceCalculation(event) {
    const timeRank = parseInt(this.element.find('#time-lookup').val());
    const speedRank = parseInt(this.element.find('#speed-input').val());
    if (!isNaN(timeRank) && !isNaN(speedRank)) {
      const distanceRank = this.constructor.calculateDistance(timeRank, speedRank);
      const distanceValue = this.constructor.getMeasurementValue(distanceRank, 'distance');
      this.element.find('#distance-result').text(`${distanceRank} (${distanceValue})`);
    } else {
      this.element.find('#distance-result').text('');
    }
  }

  onTimeCalculation(event) {
    const distanceRank = parseInt(this.element.find('#distance-lookup').val());
    const speedRank = parseInt(this.element.find('#speed-input2').val());
    if (!isNaN(distanceRank) && !isNaN(speedRank)) {
      const timeRank = this.constructor.calculateTime(distanceRank, speedRank);
      const timeValue = this.constructor.getMeasurementValue(timeRank, 'time');
      this.element.find('#time-result').text(`${timeRank} (${timeValue})`);
    } else {
      this.element.find('#time-result').text('');
    }
  }

  onThrowingDistanceCalculation(event) {
    const strengthRank = parseInt(this.element.find('#strength-input').val());
    const massRank = parseInt(this.element.find('#mass-lookup').val());
    if (!isNaN(strengthRank) && !isNaN(massRank)) {
      const throwingDistanceRank = this.constructor.calculateThrowingDistance(strengthRank, massRank);
      const distanceValue = this.constructor.getMeasurementValue(throwingDistanceRank, 'distance');
      this.element.find('#throwing-distance-result').text(`${throwingDistanceRank} (${distanceValue})`);
    } else {
      this.element.find('#throwing-distance-result').text('');
    }
  }

  onReset(event) {
    this.element.find('input[type="number"]').val('');
    this.element.find('select').val('');
    this.element.find('.result-display').text('');
  }
}
