// Clear All Effects and Modifiers Macro
// Deletes all Active Effects and modifiers from powers of the selected token

const token = canvas.tokens.controlled[0];
if (!token) {
    ui.notifications.warn("Please select a token first.");
    return;
}

const actor = token.actor;
if (!actor) {
    ui.notifications.error("Selected token has no actor.");
    return;
}

let totalEffectsCleared = 0;
let totalPowersUpdated = 0;

// Iterate over all powers
const powers = actor.items.filter(item => item.type === 'pouvoir');
console.log(`Found ${powers.length} powers to process`);

for (const power of powers) {
    console.log(`Processing power: ${power.name} (ID: ${power._id})`);
    console.log(`Current listEffectsVariantes:`, power.system.listEffectsVariantes);
    
    let powerUpdated = false;
    
    // Clear Active Effects from this power
    if (power.effects && power.effects.length > 0) {
        const effectsToDelete = power.effects.map(effect => effect.id);
        await power.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
        totalEffectsCleared += effectsToDelete.length;
        powerUpdated = true;
        console.log(`Cleared ${effectsToDelete.length} effects from power: ${power.name}`);
    }
    
    // Clear variant data from this power
    const updateData = {};
    
    // Always clear variant effects (force clear)
    updateData["system.listEffectsVariantes"] = {};
    powerUpdated = true;
    
    // Always clear selected variant (force clear)
    updateData["system.effectsVarianteSelected"] = "";
    powerUpdated = true;
    
    console.log(`About to update power ${power.name} with:`, updateData);
    
    // Apply updates to this power
    if (powerUpdated) {
        await power.update(updateData);
        totalPowersUpdated++;
        console.log(`✅ Successfully updated power: ${power.name}`);
    }
}

// Clear all modifiers from actor (the bonuses that Active Effects create)
const actorUpdateData = {};
const characteristics = ["force", "agilite", "combativite", "sensibilite", "endurance", "dexterite", "intelligence", "presence"];
const defenses = ["robustesse", "esquive", "parade", "vigueur", "volonte"];
const skills = ["acrobaties", "athletisme", "duperie", "perspicacite", "intimidation", "investigation", "perception", "persuasion", "habilete", "discretion", "technologie", "soins", "vehicules"];

// Clear characteristic bonuses
characteristics.forEach(char => {
    actorUpdateData[`system.caracteristique.${char}.bonuses`] = 0;
});

// Clear defense bonuses
defenses.forEach(def => {
    actorUpdateData[`system.defense.${def}.bonuses`] = 0;
});

// Clear skill bonuses
skills.forEach(skill => {
    actorUpdateData[`system.competence.${skill}.bonuses`] = 0;
});

// Apply actor updates
if (Object.keys(actorUpdateData).length > 0) {
    console.log(`About to clear actor bonuses:`, actorUpdateData);
    await actor.update(actorUpdateData);
    console.log(`✅ Successfully cleared all bonuses from ${actor.name}`);
} else {
    console.log(`No actor bonuses to clear`);
}

// Provide feedback
if (totalEffectsCleared > 0 || totalPowersUpdated > 0) {
    ui.notifications.info(`Cleared ${totalEffectsCleared} Active Effects from ${totalPowersUpdated} powers and all bonuses from ${actor.name}`);
} else {
    ui.notifications.info(`No Active Effects or variants found on ${actor.name}'s powers`);
}

// Refresh the token display
token.refresh();
