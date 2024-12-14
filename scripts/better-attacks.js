import {createTemplateWithPreview} from "./template.mjs";

let currentAttack = null;

Hooks.on('ready', () => {
  game.waitForTemplatePlacementLater = waitForTemplatePlacementLater;
  Hooks.on("renderActorSheet", (app, html, data) => {
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
  });
});

async function PlaceTemplateAndTargetActors(token, attaque) {
    let range = GetRangeForAttack(token, attaque)
    if (range === 'Cone' || range === 'Burst' || range === 'Line' || range == 'Area') {
        
        let {template, targets: targetedTokens} = await createPowerTemplate(token, attaque);
        await game.user.updateTokenTargets([]);
        let targetedIds = [];
        
        for (let token of targetedTokens) {
             targetedIds.push(token.id);
        }
        await game.user.updateTokenTargets(targetedIds);
        
        setTimeout( () => {
          template.delete()
      }
      , (5000));
    }
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
    const templateData = {
        t: t,
        distance: templateDistance * canvas.scene.grid.size / 100 ,
        width: width,
        fillColor: "#FF0000",
    };
    const {document, targets} = await createTemplateWithPreview(templateData)
    if (document) {
        const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [document.toObject()]);
        console.log("Template placement completed at crosshair location.");
        return {template, targets}
    } else {
        console.log("Template placement cancelled or no position selected.");
    }
}
function waitForTemplatePlacementLater() {
      ui.notifications.warn("Waiting for template placement to target tokens before rolling attack");
      const {token, atk} = currentAttack;
      return PlaceTemplateAndTargetActors(token, atk)
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

Hooks.on('renderActorDirectory', async function () {
	if(!game.user.isGM) return;
	addCreateAttackFomPowerButtonToActorDirectory()
});


async function CreateAttackForAllCharacters(){
  // Loop through all actors in the game
  for (actor of game.actors.contents){
    // Check if the actor is in a folder and if that folder is expanded (open)
  if (actor.folder && actor.folder.expanded) {
    // Assuming CreateAttacksFromPowers is a method on the actor or globally available
     await CreateAttacksFromPowers(actor,null, true).then(() => {
        console.log(`CreateAttacksFromPowers applied to ${actor.name}`);
      }).catch(err => {
        console.error(`Error applying CreateAttacksFromPowers to ${actor.name}:`, err);
      });
    }
  };
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
  return selectedActor.update(updateData);
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
  key =key+1
  console.log("new attack" + newAttackData)
  await actor.update(newAttack);
  console.log(newAttack)
}



game.actors.set(actor._id , actor)
return actor.system.attaque[key]

} 