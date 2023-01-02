import Phaser from 'phaser';
import Asteroid from '../objects/Asteroid';
import { Planet } from '../objects/Planet';

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
    group: Phaser.GameObjects.Group
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
    public group: Phaser.GameObjects.Group
    public asteroidFactory: Asteroid|undefined
    constructor(options: WaveProps) {
        this.duration = options.duration
        this.spawnDuration = options.spawnDuration
        this.group = options.group
        this.units = options.units
    }

    update(delta: number, scene: Phaser.Scene, celestialBodies: Planet[]) {
        if (!this.asteroidFactory) {
            this.asteroidFactory = new Asteroid(scene)
        }
        this.elapsedTime += delta
        this.asteroidFactory.update(delta, celestialBodies)
        if (this.units.meteors) {
            const expectedNumMeteors = Math.ceil((this.units.meteors?.count || 0) / this.spawnDuration * this.elapsedTime)
            
            while (this.numMeteors < expectedNumMeteors) {
                const x = 1000
                const y = 200 + 20 * Math.random()
                const {sizeMin, sizeMax} = this.units.meteors
                const size = sizeMin + (sizeMax-sizeMin) * Math.random()
                
                this.asteroidFactory.create(scene, {x, y, size})
                this.numMeteors += 1
            }
        }
    }

    isFinished() {
        return this.elapsedTime >= this.duration
    }
}