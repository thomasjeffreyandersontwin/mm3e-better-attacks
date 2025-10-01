// Heart and Star HUD by mxzf
// This is a World Script
// This macro adds a little star by Hero Points and a Heart by Injuries in the Token Hud. 
// Make sure to run the "Add Hero Points to Bar 2 Attribute by mxzf" first to add the Hero Point number to the Bar 2 Attribute which is the box above a token when you right click on a token.

// Remove any existing renderTokenHUD hooks to allow rerunning
Hooks.off('renderTokenHUD');

Hooks.on('renderTokenHUD', (app, [html], context) => {
debugger
// Get the token from the app
const token = app.object;

//Add a heart to injuries Window in the Token HUD (bottom bar) - only if not already there
    const bar1 = html.querySelector('.attribute.bar1');
    if (bar1 && !bar1.querySelector('.fas.fa-heart')) {
        bar1.insertAdjacentHTML('afterbegin', '<i class="fas fa-heart" style="font-size: 1.5rem;color: red;text-shadow: 0px 0px 6px white, 1px 1px 2px red;top:unset;bottom:10px;left:6px;-webkit-text-stroke-width: 1px;-webkit-text-stroke-color: white"></i>')
    }

// Add a star to the Hero Point window in the Token HUD (top bar) - only if not already there
    const bar2 = html.querySelector('.attribute.bar2');
    if (bar2 && !bar2.querySelector('.fas.fa-star')) {
        bar2.insertAdjacentHTML('afterbegin', '<i class="fas fa-star" style="font-size: 1.5rem;color: yellow;text-shadow: 0px 0px 6px white, 1px 1px 2px red;top:10px; left:5px;-webkit-text-stroke-width: 1px;-webkit-text-stroke-color: white"></i>')
    }

    token.document.update({ displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS });
    
    // Check if bar2 is being shown, if not adjust it
    if(token.prototype.bar2.attribute === '' || token.prototype.bar2.attribute === null) {
        token.document.update({
            'bar2.attribute': 'heroisme',
            'displayBars': CONST.TOKEN_DISPLAY_MODES.HOVER
        })
    }
    
    if(token.prototype.bar1.attribute !== 'blessure'){
        token.document.update({
            'bar1.attribute': 'blessure',
            'displayBars': CONST.TOKEN_DISPLAY_MODES.HOVER
        })
    }
})
