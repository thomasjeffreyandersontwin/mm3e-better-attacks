# MM3E Better Attacks - Enhanced Targeting Extension

This extension adds advanced targeting capabilities to the MM3E Better Attacks module, providing visual feedback and streamlined targeting for character attacks.

## Features
This module improves on attacks made in the Mutants and Masterminds 3e System developed by @Zakarik.
Enhancements include:
⦁	Auto Creation Of Attacks From Powers : takes powers from characters imported from hero lab,  the system provided jab's build importer, or any of the builds from the various jab's modules,  converts them into (automated) attacks on the character sheet. 
⦁	Auto creation / sizing of templates and targeting of tokens when template is paced for area powers (Burst, Cone, Line), Just specify shape and size in the power associated with the attack (see above). This feature is in alpha and has a few known issues. The sizing and targeting is a bit off and will be optimized, also there is a dependency on warpgate, which is a retired module. Both issues are being addressed.
⦁	Support For Automated Animations:
1.	Name Matching: If you name an animation the same as an attack it will fire just like in other systems that Automated Animations works with
2.	Descriptor-Effect Matching: if you name an animation using a descriptor-range-effect format, then that animation will fire for any attack that is linked to a power that has a  matching descriptor, range,and effect. To make this work:
Link your attack to a power (easiest to do using the Auto Creation Of Attacks From Powers mentioned above)
Enter an effect for the power  (eg: Affliction, Blast, Create, Damage, Healing, Transform,Flight, Leaping, Running, Swinging, Teleport, Burrowing, Deflect, Force Field, Energy Aura, Healing, Insubstantial, Transform)
Enter a descriptor for the power (eg:
Air, Alien, Biological, Chemical, Chi, Ice, Colors, Cosmic, Darkness, Dimensions, Divine, Dreams, Earth, Electricity, Entropy, Fire, Force, Heat, Kinetic, Light, Luck, Madness, Magic, Magnetic, Memes, Mutant, None, Plant, Primal, Psionic, Quantum, Radiation, Super Strength, Super Speed, Technology, Vibration, Training, Time  Quantum, Technology, Skills, Energy, Webbing, etc )
for area effect powers make sure you have entered the appropriate area extra and size of the area for the power (eg Burst, Cone, Line 30 ft.)
Name an animation according to the attributes of the power linked to the attack eg: Ice-Range-Damage, Fire-Close-Affliction, Plant-Burst-Damage, Technology-Perception-Mind Control

⦁	Coming functionality: We are currently working on an improved autorecognition file that will cover a large number of descriptor-effect-range combinations! stay tuned!

### 🎯 Enhanced Targeting Mode
- **Attack Button Interception**: All attack buttons now activate targeting mode instead of immediately rolling
- **Visual Cursor Changes**: Cursor changes to colored crosshair during targeting
- **Range-Based Feedback**: Crosshair changes color based on range (green for in-range, red for out-of-range)
- **Area Attack Support**: Full support for area attacks with template placement

### 🎨 Visual Feedback
- **Token Highlighting**: Tokens are highlighted with colored borders when hovered
  - 🟢 **Green**: Target is within range
  - 🔴 **Red**: Target is out of range
- **Range Display**: Real-time range information shown in top-right corner
- **Targeting Overlay**: Animated border around the entire screen during targeting mode

### 🖱️ Interaction Controls
- **Left Click on Token**: Attack the target (only if in range)
- **Left Click on Canvas**: For area attacks, instantly place template at clicked location (if in range)
- **Alt + Left Click**: Add target to target list without attacking (preserves existing targets)
- **Right Click**: Cancel targeting mode
- **ESC Key**: Cancel targeting mode

### 🎯 Area Attack Enhancements
- **Instant Template Placement**: No interactive template positioning - templates appear instantly where you click
- **Automatic Targeting**: Tokens within the template area are automatically targeted
- **Range Validation**: Template only places if click location is within attack range

### 📏 Range Calculation
The system calculates range based on:
1. **Manual Range**: Uses the range field if specified in the attack
2. **Attack Type Defaults**:
   - **Melee** (`combatcontact`): 5 feet
   - **Ranged** (`combatdistance`): Effect Rank × 5 feet
   - **Area** (`area`): Effect Rank × 5 feet  
   - **Perception** (`combatperception`): Unlimited range
   - **Default**: 30 feet

## How to Use

1. **Open Character Sheet**: Open any character sheet with attacks
2. **Click Attack Button**: Click any attack button to enter targeting mode
3. **Target Selection**: 
   - Hover over tokens to see range feedback
   - Click to attack in-range targets
   - Alt+Click to add multiple targets
4. **Cancel**: Right-click or press ESC to exit targeting mode

## Technical Details

### Integration
- Seamlessly integrates with existing MM3E attack system
- Uses existing `game.mm3.RollMacro()` for attack execution
- Preserves all original attack functionality and modifiers

### Visual Components
- **CSS Animations**: Smooth transitions and pulsing effects
- **PIXI Graphics**: Hardware-accelerated token highlighting
- **DOM Overlays**: Non-intrusive UI elements

### Event Handling
- **Canvas Events**: Mouse movement and click detection
- **Keyboard Events**: ESC key for cancellation
- **Token Interaction**: Precise token boundary detection

## Compatibility
- **MM3E System**: Fully compatible with Mutants & Masterminds 3E
- **Better Attacks Module**: Extends existing functionality
- **Foundry VTT**: Tested on Foundry v11+

## Installation
The enhanced targeting is automatically active when the MM3E Better Attacks module is loaded. No additional configuration required.

## Troubleshooting

### Common Issues
1. **No Token Found**: Ensure the character has a token on the current scene
2. **Range Not Calculating**: Check that attacks have proper range values set
3. **Targeting Not Activating**: Verify the Better Attacks module is enabled

### Debug Information
Check the browser console for any error messages. The system logs targeting events for debugging purposes.

## Version History
- **v1.0.0**: Initial release with full targeting functionality
