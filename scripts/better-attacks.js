Hooks.on("init", () => {
	//CONFIG.Token.objectClass = TokenMM3;
	//CONFIG.MeasuredTemplate.objectClass = MeasuredTemplateMM3;
}) 
Hooks.on('ready', () => {
	
  game.waitForTemplatePlacementLater = waitForTemplatePlacementLater;


  Hooks.on('rollPower', async (atk, token,strategie, altKey) => {
    if(game.modules.get('autoanimations')?.active) {
      await triggerAnimationForPower(atk, token);
    } 

  })
  Hooks.on('rollAttack', async (atk, token,strategie, altKey) => {
      console.log("hooking into attack  " + atk);
      console.log("hooking for token  " + token);
      if(atk.area && atk.area.has==true){
    //    if(game.modules.get('warpgate')?.active)
    //    {
            await PlaceTemplateAndTargetActors(token, atk);
    //    }
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

async function triggerAnimationForPower(power, source) {
  //try for power name first
  let powerName = power.name;
  let item = {
      name: powerName,
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
          let range = GetRangeForPower( power) ? GetRangeForPower(power) : "Range";
          let attackType = GetEffectFromPower(power) ? GetEffectFromPower(power) : "Damage";

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
            let range = GetRangeForAttack(source.actor, attaque) ? GetRangeForAttack(source.actor, attaque) : "Range";
            let attackType = GetAttackTypeFromAttack(attaque) ? GetAttackTypeFromAttack(attaque) : "Damage";

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
    let range = GetRangeForAttack(token, attaque)
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

function GetEffectFromPower(power) {
  let effect = power.system.effetsprincipaux;
 //regex to strip trailing number form effect eg: Damage 5 -> Damage
  effect = effect.replace(/\d+/g, '');
  if(effect=="Blast"){
    effect="Damage";
  }
  return effect;
  
}

function GetAttackTypeFromAttack(attaque) {
    let attackType = undefined;
    if (attaque.isDmg == true) {
        attackType = 'Damage';
    }
    if (attaque.isAffliction == true) {
        attackType = 'Affliction';
    }
    return attackType;
}

function GetRangeForPower(matchingPower) {
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
      if(item.name && item.name.includes("Range"))
      {
        return "Range"
      }
  }
  if(matchingPower.system.portee=="distance"){
    return "Range"
  }
  if(matchingPower.system.portee=="perception"){
    return "Range"
  }
  if(matchingPower.system.portee=="contact"){
    return "Melee"
  }
  if(matchingPower.system.portee=="personnelle"){
    return "Personal"
  }
  return "Range";
}
function GetRangeForAttack(token, attaque) {
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
            if (extra.name && (extra.name.includes("Area") || extra.name.includes("Cone") || extra.name.includes("Burst") || extra.name.includes("Line"))) {
                const regex = /(\d+)\s*ft\./i;
                const match = extra.name.match(regex);
                if (match) {
                    distance = parseInt(match[1], 10) / 5;
                    break;
                }
                else{
                     ui.notifications.warn("You have not specified at distance on your Area Extra of power linked to your attack. Add an extra to the linked power in the exact format of Areas (Burst or Line or Cone ) XX ft.) ");
					 if(extra.name.includes("Cone"))
					 {
						 distance = 60/5;
					 }
					if(extra.name.includes("Burst"))
					 {
						 distance = 30/10;
					 }
					 if(extra.name.includes("Burst"))
					 {
							 line = 30/5;
					 }
                }
              
            }
        }
    } else {
        distance = 3;
    }
    let templateDistance = distance ;
    let warpDistance = distance * 2;

    let range = GetRangeForAttack(token, attaque)

    let t = "circle";
    if (range == "Line") {
        t = "ray"
        warpDistance = warpDistance;
        templateDistance = templateDistance  *1.5;
    }
    if (range == "Cone") {
        t = "cone"
        templateDistance = distance * 1.5;
        warpDistance = distance * 2;
        // templateDistance= distance// * 3;
    }
    if (range == "Burst") {
        t = "circle"
        templateDistance = distance/2 * 1.25
		warpDistance = warpDistance/2//* 1.25;
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
        ui.notifications.warn("ypu must specify an Effect for the power  " + power.name + " if you want to convert it\\n\\n Valid effects are Blast, Damage, Dazzle, Energy Aura, Energy Control, Magic, Mental Blast, Mind Control, Nullify, Sleep, Strike, Suffocation");
      
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
	for (const key in matchingPower.system.extras) {
          const item =  matchingPower.system.extras[key];
		const regex = /Alternate Resistance: ([^,]+)/;
          if (item.name && item.name.includes("Alternate Resistance"))  {
              const match = item.name.match(regex);
			  if(match){
				  resistance = match[1]
			  }
		  }
			 
    }
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
  const powersConfig = [
	{ name: "Strength Damage", range: "Close", resistance: "Toughness" ,attackType: "damage"},
	{ name: "Strength-based Damage", range: "Close", resistance: "Toughness" ,attackType: "damage"},
    { name: "Affliction", range: "Close", resistance: "Fortitude" , attackType: "affliction" },
    { name: "Blast", range: "Ranged", resistance: "Toughness" , attackType:"damage"},
    { name: "Damage", range: "Close", resistance: "Toughness" ,attackType:"damage"},
    { name: "Dazzle", range: "Ranged", resistance: "Will" ,attackType: "affliction"},
    { name: "Energy Aura", range: "Close", resistance: "Toughness", attackType:"damage" },
    { name: "Energy Control", range: "Ranged", resistance: "Toughness" ,attackType:"damage" },
    { name: "Magic", range: "Ranged", resistance: "Toughness"  ,attackType:"damage"},
    { name: "Mental Blast", range: "Perception", resistance: "Will", attackType:"damage" },
    { name: "Mind Control", range: "Perception", resistance: "Will" ,attackType: "affliction"},
    { name: "Nullify", range: "Ranged", resistance: "Will" , attackType:"other"},
    { name: "Sleep", range: "Ranged", resistance: "Fortitude" ,attackType: "affliction"},
    { name: "Snare", range: "Ranged", resistance: "Dodge" ,attackType: "affliction"},
    { name: "Strike", range: "Close", resistance: "Toughness" ,attackType:"damage" },
    { name: "Suffocation", range: "Ranged", resistance: "Fortitude" ,attackType: "affliction"},
	{ name: "Enhanced Strength", range: "Close", resistance: "Toughness" ,attackType: "damage"}
	
 
  ];
  let powerConfig = powersConfig.find(power => effectName.toLowerCase().includes(power.name.toLowerCase()));
  
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

	
    await createAttack(effectName, actor, matchingPower, type, save, 20, powerConfig.attackType, combatSkill, afflictionResults);
	await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

function getTypeFromPower(matchingPower, powerConfig){
  let isArea = getAreaFromPower(matchingPower);
  let isRange = getRangedFromPower(matchingPower) || powerConfig.range=="Ranged" && !isArea;
	let isClose = !getRangedFromPower(matchingPower)  && powerConfig.range=="Close" && !isArea
  let isPerception = getPerceptionFromPower(matchingPower) || powerConfig.range=="Perception" 

	 
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
		  else{
			  if(isPerception)
			  {
				  type = "combatperception"
			  }
		  }
	  }
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
  linkedAttack.isDmg = true;

  linkedAttack.save.affliction.effet = linkedAttack.effet.toString();
  linkedAttack.save.dmg.effet = matchingPower.system.cout.rang.toString();
  linkedAttack.save.dmg.type = getSaveFromResistance(matchingPower, "Toughness")
	
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
			if(match[2])
				one = findStatusEffect(match[2].trim()).id
			if(match[3])
				two = findStatusEffect(match[3].trim()).id
			if(match[4])
				three = findStatusEffect(match[4].trim()).id

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
	            if(match[1])	
	                one = findStatusEffect(match[1].trim()).id
	            if(match[2])
	                two = findStatusEffect(match[2].trim()).id
	            if(match[3])
	                three = findStatusEffect(match[3].trim()).id
	
	            affliction.result = [
	                {status:[one], value: 0},
	                {status:[two], value: 0},
	                {status:[three], value: 0},
	            ];    
	        }
		}
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

async function createAttack(effect, actor, matchingPower, type, save, critique, attackType, skill, afflictions=null) {
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
		type = "other"
	  //ability = "force";
    }
    if(type == "combatdistance"){
		type = "other"
     //ability = "dexterite"
	    attaque = actor.system.caracteristique.dexterite.total;
    } 


  }
  let defpassive = undefined
  if(type=="combatcontact"){
    defpassive = "parade"
  }
  else if(type=="combatdistance" || type=="area")
  {
    defpassive = "esquive";
  }

if(effect && effect.includes("Strength") || effect =="Unarmed")
{
	ability = "force";
}

  let newAttackData = {_id:foundry.utils.randomID(),
    afflictioneeffect : 0,        
    area:{has:type=="area", esquive:0},
    attaque : attaque,
    basearea:0,
    critique:critique,
    effet:matchingPower.system.cout.rang,
    isAffliction:attackType=="affliction",
    isDmg:attackType=="damage",
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
            type: save,
            defense: "15",
            effet: "0"
        },
        other: {
            type: save,
            defense: "15"
        },
        affliction: {
            type: save,
            defense: "10",
            effet: "0"
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
    text:"",
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
  console.log("new attack" + newAttackData)
  await actor.update(newAttack);
  console.log(newAttack)
}



game.actors.set(actor._id , actor)
return actor.system.attaque[key]

} 

class MeasuredTemplateMM3 extends MeasuredTemplate {
	/**
	 * Get tokens that occupy squares highlighted by the template.
	 *
	 * @returns {Token[]} Array of tokens
	 */
	getTokensWithin() {
		/** @type {[id: string]: Set<Point>} */
		const tokens = Object.fromEntries(
			canvas.tokens.placeables.map((token) => {
				const positions = token.getPositions().map(({ x, y }) => `${x},${y}`);
				return [token.id, new Set(positions)];
			}),
		);
		const highlightPositions = canvas.interface.grid.getHighlightLayer(this.highlightId).positions;
		const containedIds = Object.entries(tokens).reduce((acc, [id, tokenPositions]) => {
			const intersection = highlightPositions.intersection(tokenPositions);
			if (intersection.size > 0) acc.push(id);
			return acc;
		}, []);
		return containedIds.map((id) => canvas.tokens.get(id));
	}
}

class TokenMM3 extends Token {
	/**
	 * Get an array of positions of grid spaces this token occupies.
	 *
	 * @returns {Point[]}
	 */
	getPositions() {
		// TODO: Refactor and shorten
		const grid = canvas.grid;
		const { x: ox, y: oy } = this.document;
		const shape = this.shape;
		const bounds = shape.getBounds();
		bounds.x += ox;
		bounds.y += oy;
		bounds.fit(canvas.dimensions.rect);

		// Identify grid space that have their center points covered by the template shape
		const positions = [];
		const [i0, j0, i1, j1] = grid.getOffsetRange(bounds);
		for (let i = i0; i < i1; i++) {
			for (let j = j0; j < j1; j++) {
				const offset = { i, j };
				const { x: cx, y: cy } = grid.getCenterPoint(offset);

				// If the origin of the template is a grid space center, this grid space is highlighted
				let covered = Math.max(Math.abs(cx - ox), Math.abs(cy - oy)) < 1;
				if (!covered) {
					for (let dx = -0.5; dx <= 0.5; dx += 0.5) {
						for (let dy = -0.5; dy <= 0.5; dy += 0.5) {
							if (shape.contains(cx - ox + dx, cy - oy + dy)) {
								covered = true;
								break;
							}
						}
					}
				}
				if (!covered) continue;
				positions.push(grid.getTopLeftPoint(offset));
			}
		}
		return positions;
	}
}
