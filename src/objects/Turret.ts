import GameObject from "./GameObject";
import {Planet} from './Planet'

interface CreateProps {
    angle: number
    name: string
    texture: string
}

export class Turret {
    sprite: Phaser.Types.Physics.Arcade.ImageWithDynamicBody

    constructor(scene: Phaser.Scene, group: Phaser.GameObjects.Group, planet: Planet, {name, texture, angle}: CreateProps) {
        const scale = 0.1
        this.sprite = scene.physics.add.image(0, 0, texture).setScale(scale, scale).setRotation(Math.PI/2)
        const x = planet.sprite.x + planet.radius * Math.cos(angle) + 0.9 * scale * this.sprite.height/2
        const y = planet.sprite.y + planet.radius * Math.sin(angle)
        this.sprite.setPosition(x,y)
        group.add(this.sprite)
        this.sprite.setName(name)
        this.sprite.body.setAllowGravity(false)
        this.sprite.disableInteractive()
    }
}

export default class TurretFactory extends GameObject {
    turrets: Turret[] = []
    planet: Planet
    
    constructor(scene: Phaser.Scene, planet: Planet) {
        super(scene)
        this.planet = planet
    }

    create(scene: Phaser.Scene, options: CreateProps) {
        const turret = new Turret(scene, this.group, this.planet, options)
        this.turrets.push(turret)

        return turret
    }

    destroy() {
        
    }

    update(delta: number, celestialBodies: Planet[]) {
        const planetPosition = {
            x: this.planet.sprite.x,
            y: this.planet.sprite.y
          }

        this.group.rotateAround(planetPosition, this.planet.angularVelocity*delta/1000)
        this.turrets.forEach(turret => {
            turret.sprite.setRotation(turret.sprite.rotation + this.planet.angularVelocity*delta/1000)
        })
    }
}