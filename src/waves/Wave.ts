import Phaser from 'phaser';
import { Planet } from '../objects/Planet';
import Level from '../scenes/Level';

interface MeteorProps {
    count: number,
    sizeMin: number,
    sizeMax: number
}

interface CometProps {
    count: number,
    sizeMin: number,
    sizeMax: number
}

interface AlienProps {
    count: number,
    hpMin: number,
    hpMax: number
}

interface AsteroidProps {
    count: number,
    sizeMin: number,
    sizeMax: number
}

interface UnitsProps {
    meteors?: MeteorProps,
    asteroids?: AsteroidProps,
    comets?: CometProps,
    aliens?: AlienProps
}

interface WaveProps {
    duration: number
    spawnDuration: number
    units: UnitsProps
}


export default class Wave {
    private duration: number
    private spawnDuration: number
    private elapsedTime: number = 0
    private numMeteors: number = 0
    private numAsteroids: number = 0
    private numComets: number = 0
    private numAliens: number = 0
    private units: UnitsProps
    constructor(options: WaveProps) {
        this.duration = options.duration
        this.spawnDuration = options.spawnDuration
        this.units = options.units
    }

    update(delta: number, level: Level) {
        this.elapsedTime += delta
        if (this.units.meteors) {
            const expectedNumMeteors = Math.ceil((this.units.meteors?.count || 0) / this.spawnDuration * this.elapsedTime)
            
            while (this.numMeteors < expectedNumMeteors) {
                const x = 1000
                const y = 200 + 20 * Math.random()
                const {sizeMin, sizeMax} = this.units.meteors
                const size = sizeMin + (sizeMax-sizeMin) * Math.random()
                
                level.asteroidFactory!.create(level, {x, y, size})
                this.numMeteors += 1
            }
        }
    }

    isFinished() {
        return this.elapsedTime >= this.duration
    }
}