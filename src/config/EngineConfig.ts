export const EngineConfig = {
    // 2D Maze Constants
    Maze: {
        maxSpeed: 0.15,
        forwardSpeedScale: 0.2, // applied to moveY
        strafeSpeedScale: 0.2,  // applied to moveX
        turnSpeedScale: 0.5,    // applied to torque
        intentGain: 1.5,
        intentMoveMagnitude: 15.0, // gamepad rawAxes scale for translation
        intentTurnMagnitude: 2.0,  // gamepad rawAxes scale for turning
    },
    // 3D Arena Constants
    Arena: {
        baseSpeedScale: 9.0,    // matches maze max speed approximately
        baseTurnScale: 30.0,    // matches maze turn speed per second (turnSpeedScale * 60)
        turnSpeedScale: 0.5,    // input to smoothed intent yaw scale
        intentGain: 1.5,
        intentMoveMagnitude: 15.0, // gamepad rawAxes scale for translation
        intentTurnMagnitude: 2.0,  // gamepad rawAxes scale for turning
        safeDist: 2.0,          // protection bubble distance
        pushOutForce: 50.0,
        orbiterSpeed: 15.0,     // speed of blades returning/attacking
        bladeCooldown: 0.05,
    },
    BLE: {
        mapSimScale: 4.0,
        mapSimOffset: 0.18,
        driftSimScale: 50.0,
    }
};
