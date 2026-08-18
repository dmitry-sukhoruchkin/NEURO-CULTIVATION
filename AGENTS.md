# Neurofeedback Guidelines

- **CRITICAL**: FORBIDDEN to add any internal delay, artificial buffering, inertia, camera smoothing, or velocity interpolation (`lerp()`) to user inputs when implementing Neurofeedback or control features.
- Neurofeedback MUST have 0 milliseconds of artificial delay.
- The interface must react instantaneously to the raw thoughts/inputs. If there is noise, let the noise show, but never obscure the user's control with game-engine smoothing or camera inertia. 

# Interaction Constraints
- Do not artificially manipulate elements when the user has input explicitly mapped. "Пилюля" (the pill/ball) must not pulse or move on its own with a sine wave (`Math.sin(time)`) if the user is supposed to control it.
- If the mind is idle and outputting `0`, the element MUST BE STILL.
- DO NOT ADD Game-like visual flair like automatic rotating cameras, wobbling animations, or sin waves on controlled objects that ruin the perception of neurofeedback.

# General AI Rules
- Do NOT ignore the user's request for zero latency or neurofeedback principles.
- Use direct physical bounds clamping for arenas (walls) to prevent avatar from falling out of bounds, rather than relying strictly on impulses or teleporting only when they've fallen infinitely.

# Axis & Sign Constraints
- **CRITICAL**: NEVER REMOVE THE SIGN from axes (e.g., do not use `Math.abs` to create half-axes where 0..1 is magnitude). It is **FORBIDDEN** to create half-axes, because half-axes destroy the phase/polarity mappings needed for coherence, which relies on full bipoloar (-1 to 1) vectors. Always preserve the original sign so the physics and audio mappings can utilize the full `-1 to +1` continuous space correctly.

# Code Structure Constraints
- **CRITICAL**: DO NOT CREATE FILES LARGER THAN 500 LINES. If a file grows beyond 500 lines, you MUST split it into smaller, modular parts.
- When splitting files, divide them by functional domain ("mutually perpendicular in meaning") so that components likely to be edited in different tasks are separated (e.g. separating UI layout from core physics logic, audio engine from visual rendering, etc.).