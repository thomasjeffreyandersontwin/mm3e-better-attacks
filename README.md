This module improves on attacks made in the Mutants and Masterminds 3e System developed by @Zakarik.

Enhancements include:

- Auto Creation Of Attacks From Powers : takes powers from characters imported from hero lab,  the system provided jab's build importer, or any of the builds from the various jab's modules,  converts them into (automated) attacks on the character sheet. 

- Support For Automated Animations:

Name Matching: If you name an animation the same as an attack it will fire just like in other systems that Automated Animations works with
Descriptor-Effect Matching: if you name an animation using a descriptor-range-effect format, then that animation will fire for any attack that is linked to a power that has a  matching descriptor, range,and effect. To make this work:
Link your attack to a power (easiest to do using the Auto Creation Of Attacks From Powers mentioned above)
Enter an effect for the power  (eg: Affliction, Blast, Create, Damage, Healing, Transform,Flight, Leaping, Running, Swinging, Teleport, Burrowing, Deflect, Force Field, Energy Aura, Healing, Insubstantial, Transform)
Enter a descriptor for the power (eg:

Air, Alien, Biological, Chemical, Chi, Ice, Colors, Cosmic, Darkness, Dimensions, Divine, Dreams, Earth, Electricity, Entropy, Fire, Force, Heat, Kinetic, Light, Luck, Madness, Magic, Magnetic, Memes, Mutant, None, Plant, Primal, Psionic, Quantum, Radiation, Super Strength, Super Speed, Technology, Vibration, Training, Time  Quantum, Technology, Skills, Energy, Webbing, etc )

for area effect powers make sure you have entered the appropriate area extra and size of the area for the power (eg Burst, Cone, Line 30 ft.)
Name an animation according to the attributes of the power linked to the attack eg: Ice-Range-Damage, Fire-Close-Affliction, Plant-Burst-Damage, Technology-Perception-Mind Control

- Auto creation / sizing of templates and targeting of tokens when template is paced for area powers (Burst, Cone, Line), Just specify shape and size in the power associated with the attack (see above). This feature is in alpha and has a few known issues. The sizing and targeting is a bit off and will be optimized, also there is a dependency on warpgate, which is a retired module. Both issues are being addressed.

Coming functionality: We are currently working on an improved autorecognition file that will cover a large number of descriptor-effect-range combinations! stay tuned!
