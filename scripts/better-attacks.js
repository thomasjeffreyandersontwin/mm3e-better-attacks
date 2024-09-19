Hooks.on("init", () => {
	CONFIG.Token.objectClass = TokenMM3;
	CONFIG.MeasuredTemplate.objectClass = MeasuredTemplateMM3;
})
Hooks.on('ready', () => {
	
  game.waitForTemplatePlacementLater = waitForTemplatePlacementLater;
  Hooks.on('rollAttack', async (atk, token,strategie, altKey) => {
      console.log("hooking into attack  " + atk);
      console.log("hooking for token  " + token);
      if(atk.area.has==true){
        if(game.modules.get('warpgate')?.active)
        {
            await PlaceTemplateAndTargetActors(token, atk);
        }
      }
      if(game.modules.get('autoanimations')?.active) {
        await triggerAnimationForAttack(atk, token);
      } 
  })

  Hooks.on("renderActorSheet", (app, html, data) => {
      console.log("hooking into character sheet render");
      const attackSection = html.find(".attaque");
      console.log(attackSection)

      const convertButton = $(`<a class="add" data-type="convert-action">Convert Powers</a>`);
      const deleteConvertButton = $(`<a class="add" data-type="convert-delete-action">Delete then Convert Powers</a>`);
    
      attackSection.append(convertButton);
      attackSection.append(deleteConvertButton);
    
      
      convertButton.on("click", (event) => {
          event.preventDefault();
          console.log(`Custom action triggered for ${app.actor.name}`);
          // Define the behavior for this new button
          CreateAttacksFromPowers(app.actor, app, false);  
      });

     deleteConvertButton.on("click", (event) => {
          event.preventDefault();
          console.log(`Custom action triggered for ${app.actor.name}`);
          // Define the behavior for this new button
          CreateAttacksFromPowers(app.actor, app);  
      });
   });
});
         
async function triggerAnimationForAttack(attaque, source) {
    let power = source.actor.items.get(attaque.links.pwr)
    //try for power name first
    let attackName = attaque.label;
    let item = {
        name: attackName,
        type: "spell"
    };

    let options = {};

    if (window.AutomatedAnimations) {
        await window.AutomatedAnimations.playAnimation(source, item, options);
    }

    let animationEnded = false;
    function onAnimationEnd() {
        animationEnded = true;
        Hooks.off("aa.animationEnd", onAnimationEnd);
    }
    Hooks.on("aa.animationEnd", onAnimationEnd);


    //if an animation never ran then there was no name match of power, search descripter-range-attack combination of power instead
    setTimeout( () => {
        if (!animationEnded && power && power.system.descripteurs["1"]) {
            
            let descripter = power.system.descripteurs["1"] ? power.system.descripteurs["1"] : "Energy";
            let range = GetRangeForPower(source.actor, attaque) ? GetRangeForPower(source.actor, attaque) : "Range";
            let attackType = GetAttackTypeFromPower(attaque) ? GetAttackTypeFromPower(attaque) : "Damage";

            attackName = descripter + "-" + range + "-" + attackType;
            item = {
                name: attackName,
                type: "spell"
            };
            window.AutomatedAnimations.playAnimation(source, item, options);
        }
    }
    , 1000);
    // Timeout duration in milliseconds, adjust based on expected animation duration*/
}

async function PlaceTemplateAndTargetActors(token, attaque) {
    let range = GetRangeForPower(token, attaque)
    if (range === 'Cone' || range === 'Burst' || range === 'Line' || range == 'Area') {
        
        let templateOrTargets= await createPowerTemplate(token, attaque);
        if(range=='Burst') 
        {
          targetedTokens = templateOrTargets
        }
      else{
        targetedTokens = findTokensUnderTemplate(templateOrTargets);
      }
        await game.user.updateTokenTargets([]);
        let targetedIds = [];
        
        for (let token of targetedTokens) {
             targetedIds.push(token.id);
        }
        await game.user.updateTokenTargets(targetedIds);
        
    }
      setTimeout( () => {
        const templateIds = canvas.scene.templates.contents.map(t => t.id);
        canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", templateIds)
    }
    , (5000));
}

function GetAttackTypeFromPower(attaque) {
    let attackType = undefined;
    if (attaque.isDmg == true) {
        attackType = 'Damage';
    }
    if (attaque.isAffliction == true) {
        attackType = 'Affliction';
    }
    return attackType;
}
function GetRangeForPower(token, attaque) {
  let pwr="";
  if(token.actor){
     pwr = token.actor.items.get(attaque.links.pwr) //why doesnt attaque.pwr work?
  }
  else
  {
    pwr = token.items.get(attaque.links.pwr) //why doesnt attaque.pwr work?
  }


    let range = undefined;
    if (attaque.type == 'combatcontact') {
        range = 'Melee';
    } else {
        range = 'Range';
    }
    if (attaque.area.has == true) {
        range = 'Area';
    }
    if (range === 'Area') {
        if (pwr) {
            range = getAreaShape(pwr); 
        } else {
            ui.notifications.warn("You have not associated this attack to a power. Area attacks must belinked to a power with an Area Extra that specifies the shape eg: Area 15ft-Burst, Defaulting to Burst ");
            range = "Burst"
        }
    }
    return range;
}

async function createPowerTemplate(token, attaque) {
    let pwr = token.actor.items.get(attaque.links.pwr)
    let extras;
    let distance = 0;
    if (pwr) {
        extras = pwr.system.extras;
        for (const key in extras) {
            const extra = extras[key];
            if (extra.name.includes("Area") || extra.name.includes("Cone") || extra.name.includes("Burst") || extra.name.includes("Line")) {
                const regex = /(\d+)\s*ft\./i;
                const match = extra.name.match(regex);
                if (match) {
                    distance = parseInt(match[1], 10) / 5;
                    break;
                }
                else{
                     ui.notifications.warn("You have not specified at distance on your Area Extra of power linked to your attack. Add an extra to the linked power in the exact format of Areas (Burst or Line or Cone ) XX ft.) ");
         
                }
              
            }
        }
    } else {
        distance = 3;
    }
    let templateDistance = distance * 1.4;
    let warpDistance = distance * 2;

    let range = GetRangeForPower(token, attaque)

    let t = "circle";
    if (range == "Line") {
        t = "ray"
        warpDistance = warpDistance;
        templateDistance = templateDistance ;
    }
    if (range == "Cone") {
        t = "cone"
        templateDistance = distance * 1.5;
        warpDistance = distance * 2;
        // templateDistance= distance// * 3;
    }
    if (range == "Burst") {
        t = "circle"
        templateDistance = templateDistance //* 1.25;
    }

    let width = undefined
    if (t == "ray") {
        width = 2;
    }
    let config = {
        size: warpDistance * canvas.scene.grid.size / 100,
        icon: 'modules/jb2a_patreon/Library/1st_Level/Grease/Grease_Dark_Brown_Thumb.webp',
        label: 'Grease',
        tag: 'slimy',
        width: width ,
        t: t,
        drawIcon: true,
        drawOutline: true,
        interval: 0,
        rememberControlled: true
    };
    let position = await warpgate.crosshairs.show(config);
    const targets = warpgate.crosshairs.collect(position)
    if (position) {
        const templateData = {
            t: t,
            distance: templateDistance * canvas.scene.grid.size / 100 ,
            x: position.x,
            width: width,
            y: position.y,
            direction: position.direction,
            fillColor: "#FF0000",
        };

        canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
        const template = await waitForTemplatePlacement();
        console.log("Template placement completed at crosshair location.");
        if(range=="Burst")
        {
          return targets
        }
        return template;
    } else {
        console.log("Template placement cancelled or no position selected.");
    }
}

function waitForTemplatePlacement() {
      ui.notifications.warn("Waiting for template placement to target tokens before rolling attack");
      return new Promise( (resolve) => {
          // This hook is triggered once after a template is created.
          Hooks.once("createMeasuredTemplate", (template) => {
              console.log("Template placed:", template);
              clearTimeout(timeout)
              resolve(template);
              
          });
          const timeout = setTimeout(() => {
            ui.notifications.warn("Template placement timed out.");
            reject(new Error("Template placement timed out after 10 seconds."));
          }, 10000); 
        });
    }

function waitForTemplatePlacementLater() {
      ui.notifications.warn("Waiting for template placement to target tokens before rolling attack");
      return new Promise( (resolve) => {
          // This hook is triggered once after a template is created.
          Hooks.once("createMeasuredTemplate", (template) => {
              console.log("Template placed:", template);
               clearTimeout(timeout)
               setTimeout(() => {        
                  resolve(template);  // Resolve the promise after the delay   
              }, 500);
             // resolve(template);
          }
          );
          const timeout = setTimeout(() => {
            ui.notifications.warn("Template placement timed out.");
            reject(new Error("Template placement timed out after 10 seconds."));
          }, 10000); 
        });
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

function findTokensUnderTemplate(template) {
    const tokens = canvas.tokens.placeables;
    // Get all tokens on the canvas
    let targetedTokens = [];
    

    if (template.t === "circle") {
        const radius = template.distance * canvas.scene.grid.distance

        // Assuming template.distance holds the radius for circular templates
        const centerX = template.x;
        const centerY = template.y;
        targetedTokens = tokens.filter(token => {
            const distance = Math.sqrt((token.center.x - centerX) ** 2 + (token.center.y - centerY) ** 2);
            const isWithin = distance <= radius + (token.w / 2);     
            if (isWithin) {
                console.log("Token within circle:", token.name);
            }
            return isWithin;

        }
        );
    } else if (template.t === "rectangle") {
        const left = template.x - ((template.width / 2) * canvas.scene.data.grid.size);
        const top = template.y - ((template.height / 2) * canvas.scene.data.grid.size) ;
        const right = template.x + ((template.width / 2) * canvas.scene.data.grid.size);
        const bottom = template.y + ((template.width / 2) * canvas.scene.data.grid.size)
        targetedTokens = tokens.filter(token => {
            const tokenLeft = token.x;
            const tokenRight = token.x + token.w;
            const tokenTop = token.y;
            const tokenBottom = token.y + token.h;
            return tokenRight >= left && tokenLeft <= right && tokenBottom >= top && tokenTop <= bottom;
        }
        );
    } else if (template.t === "cone") {
        targetedTokens = tokens.filter(token => {
            const angle = Math.atan2(token.y - template.y, token.x - template.x) - toRadians(template.direction);
            let distanceToPoint = Math.sqrt((token.x - template.x) ** 2 + (token.y - template.y) ** 2);
            const coneAngle = toRadians(90);
            // Assuming a 90-degree cone angle for simplicity
            return Math.abs(angle) <= coneAngle / 2 && distanceToPoint <= (template.distance/1.4) * canvas.scene.data.grid.size;
        }
        );
    } else if (template.t === "ray") {
        targetedTokens = tokens.filter(token => {
            let point = {
                x: token.center.x,
                y: token.center.y
            };
            const rayEndPoint = {
                x: template.x + Math.cos(toRadians(template.direction)) * ((template.distance /1.4) * canvas.scene.data.grid.size),
                y: template.y + Math.sin(toRadians(template.direction)) * ((template.distance/1.4) * canvas.scene.data.grid.size),
            };
            const templateWidthInPixels = canvas.scene.data.grid.size * (template.width / 2);

            const distanceToRay = distanceFromLine(point.x, point.y, template.x, template.y, rayEndPoint.x, rayEndPoint.y);
            return distanceToRay <= templateWidthInPixels;
            ;
        }
        );
    }
    return targetedTokens;

  function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function distanceFromLine(px, py, x0, y0, x1, y1) {
    let A = px - x0;
    let B = py - y0;
    let C = x1 - x0;
    let D = y1 - y0;

    let dot = A * C + B * D;
    let len_sq = C * C + D * D;
    let param = -1;
    if (len_sq != 0) {
        //in case of 0 length line
        param = dot / len_sq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x0;
        yy = y0;
    } else if (param > 1) {
        xx = x1;
        yy = y1;
    } else {
        xx = x0 + param * C;
        yy = y0 + param * D;
    }

    let dx = px - xx;
    let dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}
}

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
  // Loop through all actors in the game
  game.actors.contents.forEach(actor => {
    // Check if the actor is in a folder and if that folder is expanded (open)
  if (actor.folder && actor.folder.expanded) {
    // Assuming CreateAttacksFromPowers is a method on the actor or globally available
    CreateAttacksFromPowers(actor,true).then(() => {
        console.log(`CreateAttacksFromPowers applied to ${actor.name}`);
      }).catch(err => {
        console.error(`Error applying CreateAttacksFromPowers to ${actor.name}:`, err);
      });
    }
  });
}
window.CreateAttackForAllCharacters = CreateAttackForAllCharacters; 

async function CreateAttacksFromPowers(actor = canvas.tokens.controlled[0]?.actor, app = null,deleteExistingAttacks = true){
  if (!actor) {
    console.log("No actor selected.");
    return;
  }
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
        ui.notifications.warn("ypu must specify an Effect for the power  " + power.name + "if you want to convert it\\n\\n Valid effects are Blast, Damage, Dazzle, Energy Aura, Energy Control, Magic, Mental Blast, Mind Control, Nullify, Sleep, Strike, Suffocation");
      
      }
  }

  await createUnarmedAttack(actor)
}    
window.CreateAttacksFromPowers = CreateAttacksFromPowers; 

async function deleteAllAttacks(selectedActor) {
  const attackKeys = Object.keys(selectedActor.system.attaque);
  let updateData = {};
  attackKeys.forEach(key => {
    updateData[`system.attaque.-=${key}`] = null;
  });
  await selectedActor.update(updateData);
  game.actors.set(selectedActor._id, selectedActor);
}

async function createUnarmedAttack(actor){
  const attacks = actor.system.attaque;
  let attackName ="Close Combat (Unarmed)";
  let unarmedCombatSkill = findSkillByLabel(actor.system.competence.combatcontact, attackName);
  if(!unarmedCombatSkill){
    attackName ="Unarmed"
    unarmedCombatSkill = findSkillByLabel(actor.system.competence.combatcontact, attackName);
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
  await createAttack(actor,attackName, "combatcontact", 15, effect, 'robustesse', 20, false,true, unarmedCombatSkill)

}
let linkNextPower =false;

function getSaveFromResistance(resistance)
{
  if(resistance=="Toughness")
    {
      return 'robustesse';
    }
    else {
      if(resistance=="Fortitude")
      {
        return'vigueur';
      }
      else if(resistance=="Will"){
        return 'volonte';
      }
      else if(resistance=="Dodge"){
        return 'esquive';
      }
    }
}



async function createAttackDetailsFromPower( matchingPower, actor)    { 
  let effectName = matchingPower.system.effetsprincipaux
  if(effectName==""){
    effectName = matchingPower.name
  }
  let isAffliction = false;
  let isDamage = false;
  let basedef = 0;
 
  let type='combatcontact'

  const powersConfig = [
    { name: "Affliction", range: "Close", resistance: "Fortitude" },
    { name: "Blast", range: "Ranged", resistance: "Toughness" },
    { name: "Damage", range: "Close", resistance: "Toughness" },
    { name: "Dazzle", range: "Ranged", resistance: "Will" },
    { name: "Energy Aura", range: "Close", resistance: "Toughness" },
    { name: "Energy Control", range: "Ranged", resistance: "Toughness" },
    { name: "Magic", range: "Ranged", resistance: "Toughness" },
    { name: "Mental Blast", range: "Perception", resistance: "Will" },
    { name: "Mind Control", range: "Perception", resistance: "Will" },
    { name: "Nullify", range: "Ranged", resistance: "Will" },
    { name: "Sleep", range: "Ranged", resistance: "Fortitude" },
    { name: "Snare", range: "Ranged", resistance: "Dodge" },
    { name: "Strike", range: "Close", resistance: "Toughness" },
    { name: "Suffocation", range: "Ranged", resistance: "Fortitude" },
  ];
  
  let combatSkill = null;
  let powerConfig = powersConfig.find(power => effectName.toLowerCase().includes(power.name.toLowerCase()));
  let afflictions =undefined;
  if(powerConfig){
    let save= getSaveFromResistance(powerConfig.resistance);
    if(save=='robustesse')
    {
      isDamage = true;
      basedef = 15;
      if(linkNextPower==true)
      {
        saveLinkedAttack(actor, matchingPower);
        return; 
      }
    }
    else {
      isAffliction = true;
      basedef = 10;
      afflictions = determineAffliction(powerConfig, matchingPower)
      save = getSaveFromResistance(afflictions.resistedBy);
      if (matchingPower.system.effets.includes("Linked to")){
        
        linkNextPower = true;
        
      }
    }
    let isArea = getAreaFromPower(matchingPower);
    let isRange = getRangedFromPower(matchingPower);
    let isPerception = getPerceptionFromPower(matchingPower)
    
    if(isRange ==false && powerConfig.range=="Close"){
      type = "combatcontact"
      combatSkill = findSkillByLabel(actor.system.competence.combatcontact, matchingPower.name);
      if(!combatSkill){
        if(actor.system.competence.combatcontact.list[0]!=undefined){
             ui.notifications.warn("This character has no close combat skill o supply attack value for ranged combat power  "+ matchingPower.name );
   
        combatSkill =  actor.system.competence.combatcontact.list[0];
        }
      }
    }
    else if(powerConfig.range=="Ranged"  || isRange== true){
      type = "combatdistance"
      combatSkill = findSkillByLabel(actor.system.competence.combatdistance, matchingPower.name);
      if(!combatSkill){
        if(actor.system.competence.combatdistance.list[0]!=undefined){
            ui.notifications.warn("This character has no ranged combat skills to supply attack value for ranged combat power  "+ matchingPower.name );
    
          combatSkill = actor.system.competence.combatdistance.list[0];
        }
      }
    }
    else if(powerConfig.range=="Perception" || isPerception){
      type = "combatperception"
    }
    if(!isAffliction && !isDamage){
      return;
    }
      await createAttack(actor,matchingPower.name, type, basedef, matchingPower.system.cout.rang, save, 20,isAffliction,isDamage, combatSkill,isArea, afflictions, matchingPower._id)
    }
}

function saveLinkedAttack(actor, matchingPower) {
  let lastAttackKey = findAttackLastAttackKey(actor.system.attaque);
  let updates = {};
  let linkedAttack = actor.system.attaque[lastAttackKey];
  linkNextPower = true;
  linkedAttack.isDmg = true;
  linkedAttack.afflictioneffet = actor.system.attaque[lastAttackKey].effet;
  linkedAttack.effet = matchingPower.system.cout.rang;
  linkedAttack.saveAffliction = actor.system.attaque[lastAttackKey].save;
  linkedAttack.afflictiondef = actor.system.attaque[lastAttackKey].basedef;
  linkedAttack.basedef = 15;
  linkedAttack.save = "robustesse";

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
  let conditions = [];
  const presetAfflictions = [
    { power: "Dazzle", afflictions: { resistedBy: "Fortitude", "e1": ["Impaired"], "e2": ["Disabled"], "e3": ["Unaware"] } },
    { power: "Mind Control", afflictions: { resistedBy: "Will", "e1": ["Dazed"], "e2": ["Compelled"], "e3": ["Controlled"] } },
    { power: "Snare", afflictions: { resistedBy: "Dexterity", "e1": ["Hindered", "Vulnerable"], "e2": ["Immobile", "Defenseless"] } },
    { power: "Suffocation", afflictions: { resistedBy: "Fortitude", "e1": ["Dazed"], "e2": ["Stunned"], "e3": ["Incapacitated"] } },
  ];
  
  let presetAffliction = presetAfflictions.find(affliction => effectName.toLowerCase().includes(affliction.power.toLowerCase()));
  if (presetAffliction) {
    conditions = presetAffliction.afflictions;
  } else {
    let details = matchingPower.system.effets;
    details = details.replace(/<[^>]*>/g, '');
    const pattern1 = /Affliction resisted by (.*?); \/([^\/\s]+)(?:\s[^\/]+)?\/([^\/\s]+)(?:\s[^\/]+)?(?:\/([^\/\s]+)(?:\s[^\/]+)?)?/;
    const pattern2 = /1st degree: (.*?), 2nd degree: (.*?), 3rd degree: (.*?), Resisted by: (.*?),/;
    let match = details.match(pattern1);
    
    if (!match) {
      let details = matchingPower.system.notes;
      details = details.replace(/<[^>]*>/g, '');
      match = details.match(pattern2);
      if (match) {
        const result = {
          resistedBy: match[4].trim(),
          "e1": [match[1].trim()],
          "e2": [match[2].trim()],
          "e3": [match[3].trim()],
        };
        conditions = result;
      }
    } else {
      const result = {
        resistedBy: match[1]
      };
      if (match[2]) result["e1"] = [match[2].trim()];
      if (match[3]) result["e2"] = [match[3].trim()];
      if (match[4]) result["e3"] = [match[4].trim()];
      conditions = result;
    }
  }

  ["e1", "e2", "e3"].forEach(effect => {
    let tempConditions = [];
    if (conditions[effect]) {
      conditions[effect].forEach(condition => {
        const statusEffect = findStatusEffect(condition); // Assuming findStatusEffect is defined elsewhere
        if (statusEffect !== null) {
          tempConditions.push(statusEffect);
        }
      });

      conditions[effect] = tempConditions;
    }
  });
  
  return conditions;
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
    
  

  // Translate English condition to French
  const frenchCondition = conditionTranslations[englishCondition];
  
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

async function createAttack(actor, label, type, baseDef, effet, save, critique,isAffliction,isDamage, skill,isArea=false, afflictions=null, pwr="") {
  if(!effet || effet ==0)
  {
          ui.notifications.warn("Effect set to 0 for attack "+ label);
       
  }
    if(afflictions ==  null)
    {
        afflictions = [
        {
            value: 0,
            status: []
        },
        {
            value: 0,
            status: []
        },
        {
            value: 0,
            status: []
        }
    ]
    }
    // Create the new attack data
  let skillId = 0;
  let attaque = 0;
  if(skill){
    skillId = skill._id;
    attaque = skill.total;
  }  
  else{
    if(type == "combatcontact"){
      attaque = actor.system.caracteristique.combativite.total;
    }
    if(type == "combatdistance"){
      attaque = actor.system.caracteristique.dexterite.total;
    } 


  }
  let defpassive = undefined
  if(type=="combatcontact"){
    defpassive = "parade"
  }
  else if(type="combatdistance")
  {
    defpassive = "esquive";
  }
  let newAttackData = {_id:foundry.utils.randomID(),
    afflictioneeffect : 0,        
    area:{has:isArea, esquive:0},
    attaque : attaque,
    basearea:0,
    critique:critique,
    effet:effet,
    isAffliction:isAffliction,
    isDamage:isDamage, 
    isDmg:isDamage,
    label:label,
    links:{ability:"",pwr:pwr,skill: skillId},
    mod:{atk:0, eff:0},
    noAtk:false,
    noCrit: false,
    pwr:pwr,
    repeat:{
        affliction:afflictions,
        dmg: [{value:1, status: ['dazed']},
                 {value:1, status: ['chanceling']},
                 {value:1, status: ['neutralized']}
        ],
    },
    save:{
        dmg: {
            type: "robustesse",
            defense: "15",
            effet: "0"
        },
        other: {
            type: "robustesse",
            defense: "15"
        },
        affliction: {
            type: "volonte",
            defense: "10",
            effet: "0"
        },
        passive: {
            type: "parade"
        }
    },
    settings:{
        noatk: false,
        nocrit: false
    },
    skill:skillId,
    text:"",
    type: type,
};



// If the attack exists, update it; otherwise, add a new one
let existingAttackKey = null;
for (const [key, attack] of Object.entries(actor.system.attaque)) {
  if (attack.label === label) {
    existingAttackKey = key;
    break;
  }
}
let updates = {};
if (existingAttackKey) {
  updates[`system.attaque.${existingAttackKey}`] = newAttackData;
  await actor.update(updates);
} else {
  const attacks = actor.system.attaque;
  let newAttack ={}
  let attackKeys = Object.keys(attacks);
  let newKey = attackKeys.length > 0 ? Math.max(...attackKeys) : 0;   
  newAttack[`system.attaque.${newKey+1}`] = newAttackData
  console.log("new attack" + newAttackData)
  await actor.update(newAttack);
}



game.actors.set(actor._id , actor)

} 