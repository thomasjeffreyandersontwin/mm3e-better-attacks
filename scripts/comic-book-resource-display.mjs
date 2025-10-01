// Comic Book Style Resource Display - Updated version
resourceDisplay.style.cssText = `
  position: fixed;
  left: ${menuLeft}px;
  top: ${canvasRect.top + tokenRect.y + tokenRect.height + 10}px;
  width: ${menuWidth}px;
  z-index: 1001;
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  background: linear-gradient(45deg, #FFFF99, #FFB347);
  border: 3px solid #000000;
  border-radius: 12px;
  font-family: 'Bangers', cursive;
  color: #000000;
  box-shadow: 4px 4px 0px #000000, 8px 8px 0px rgba(0,0,0,0.3);
  text-shadow: 1px 1px 0px #FFFFFF;
`;

resourceDisplay.innerHTML = `
  <div style="
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    gap: 2px;
    background: #FF0000;
    border: 2px solid #000000;
    border-radius: 8px;
    padding: 4px 6px;
    box-shadow: 2px 2px 0px #000000;
    transition: all 0.1s ease;
  " title="${game.i18n.localize('MM3.Heroisme') || 'Hero Points'}"
     onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='3px 3px 0px #000000'"
     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='2px 2px 0px #000000'">
    <i class="fas fa-star" style="font-size: 1.2rem; color: #FFFF00; text-shadow: 1px 1px 0px #000000;"></i>
    <input type="number" value="${heroPoints}" min="0" max="99" 
           style="width: 28px; background: #FFFF00; border: 1px solid #000000; color: #000000; text-align: center; font-weight: bold; font-size: 0.9rem; padding: 1px; border-radius: 4px; font-family: 'Bangers', cursive;"
           onchange="updateHeroPoints('${token.id}', this.value)"
           title="${game.i18n.localize('MM3.Heroisme') || 'Hero Points'}">
  </div>
  
  <div style="
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    gap: 2px;
    background: #FF0000;
    border: 2px solid #000000;
    border-radius: 8px;
    padding: 4px 6px;
    box-shadow: 2px 2px 0px #000000;
    transition: all 0.1s ease;
  " title="${game.i18n.localize('MM3.Blessures') || 'Injuries'}"
     onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='3px 3px 0px #000000'"
     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='2px 2px 0px #000000'">
    <i class="fas fa-heart" style="font-size: 1.2rem; color: #FFFFFF; text-shadow: 1px 1px 0px #000000;"></i>
    <input type="number" value="${injuries}" min="0" max="99" 
           style="width: 28px; background: #FFFFFF; border: 1px solid #000000; color: #000000; text-align: center; font-weight: bold; font-size: 0.9rem; padding: 1px; border-radius: 4px; font-family: 'Bangers', cursive;"
           onchange="updateInjuries('${token.id}', this.value)"
           title="${game.i18n.localize('MM3.Blessures') || 'Injuries'}">
  </div>
  
  <div style="
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    gap: 2px;
    background: #FFA500;
    border: 2px solid #000000;
    border-radius: 8px;
    padding: 4px 6px;
    box-shadow: 2px 2px 0px #000000;
    transition: all 0.1s ease;
  " title="Fatigue Points"
     onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='3px 3px 0px #000000'"
     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='2px 2px 0px #000000'">
    <i class="fas fa-battery-three-quarters" style="font-size: 1.2rem; color: #FFFFFF; text-shadow: 1px 1px 0px #000000;"></i>
    <input type="number" value="${fatiguePoints}" min="0" max="99" 
           style="width: 28px; background: #FFFFFF; border: 1px solid #000000; color: #000000; text-align: center; font-weight: bold; font-size: 0.9rem; padding: 1px; border-radius: 4px; font-family: 'Bangers', cursive;"
           onchange="updateFatiguePoints('${token.id}', this.value)"
           title="Fatigue Points">
  </div>
  
  ${luckPoints > 0 ? `
  <div style="
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    gap: 2px;
    background: #00FF00;
    border: 2px solid #000000;
    border-radius: 8px;
    padding: 4px 6px;
    box-shadow: 2px 2px 0px #000000;
    transition: all 0.1s ease;
  " title="Luck"
     onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='3px 3px 0px #000000'"
     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='2px 2px 0px #000000'">
    <i class="fas fa-clover" style="font-size: 1.2rem; color: #FFFFFF; text-shadow: 1px 1px 0px #000000;"></i>
    <input type="number" value="${luckPoints}" min="0" max="99" 
           style="width: 28px; background: #FFFFFF; border: 1px solid #000000; color: #000000; text-align: center; font-weight: bold; font-size: 0.9rem; padding: 1px; border-radius: 4px; font-family: 'Bangers', cursive;"
           onchange="updateLuckPoints('${token.id}', this.value)"
           title="Luck">
  </div>
  ` : ''}
`;

