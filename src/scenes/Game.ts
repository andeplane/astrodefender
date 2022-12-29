import Phaser from 'phaser';
import Asteroid from '../objects/Asteroid';
import Planet from '../objects/Planet'

type GameObjectWithBody = Phaser.Types.Physics.Arcade.GameObjectWithBody
type SpriteWithDynamicBody = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
type GameObject = Phaser.GameObjects.GameObject

let PlanetFactory: Planet|undefined
let AsteroidFactory: Asteroid|undefined

export default class Demo extends Phaser.Scene {
  gameOver: boolean
  population: number
  populationText?: Phaser.GameObjects.Text
  moon?: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
  cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  fire?: Phaser.GameObjects.Particles.ParticleEmitterManager
  lastAddUpdate: Date
  lastFireUpdate: Date

  constructor() {
    super('GameScene');
    this.gameOver = false
    this.population = 10
    
    this.lastAddUpdate = new Date()
    this.lastFireUpdate = new Date()
  }

  preload() {
    this.load.image('fire', 'assets/particles/muzzleflash3.png');
    this.load.image('sky', 'assets/sky.png');
    this.load.image('planet', 'assets/planet.png');
    this.load.spritesheet('asteroids', 'assets/asteroids.png', { frameWidth: 125, frameHeight: 125 });
  }

  create() {
    this.add.image(400, 300, 'sky');
    this.fire = this.add.particles('fire');

    this.cursors = this.input.keyboard.createCursorKeys();
    
    this.populationText = this.add.text(16, 16, `Population: ${this.population}`, { fontSize: '32px' });

    PlanetFactory = new Planet(this)
    AsteroidFactory = new Asteroid(this, PlanetFactory)

    const planet = PlanetFactory.Create(this, {x: 400, y: 400, name: "Planet", texture: "planet"})
    this.physics.add.collider(planet, AsteroidFactory.group, this.collidePlanet);
  }

  update() {
    if (this.gameOver || !this.cursors)
    {
        return;
    }

    if (AsteroidFactory) {
      // Add asteroids
      const now = (new Date())
      const delta = now.valueOf() - this.lastAddUpdate.valueOf()
      if (delta > 500 && AsteroidFactory.asteroids.length < 100) {
        this.lastAddUpdate = now
        const x = 1000
        const y = 200 + 20 * Math.random()
        AsteroidFactory.Create(this, {x, y})
      }
      AsteroidFactory.Update()
    }
    if (PlanetFactory) {
      PlanetFactory.Update()
    }
    
    // if (this.moon) {
    //   const delta = new Phaser.Math.Vector2(this.planet.body.center.x - this.moon.body.center.x, this.planet.body.center.y - this.moon.body.center.y);
    //   const deltaLength = delta.length()
    //   delta.normalize()
    //   delta.scale(1.0/(deltaLength*deltaLength))
    //   const strength = 10000000.0
    //   this.moon.body.setGravity(strength*delta.x, strength*delta.y)
    // }

    // // Fire defense
    // let closestAsteroid = undefined
    // let distanceSquared = 1e9
    // this.asteroids.forEach(asteroid => {
    //   if (!this.planet) {
    //     return
    //   }
    //   const delta = new Phaser.Math.Vector2(this.planet.body.center.x - asteroid.body.center.x, this.planet.body.center.y - asteroid.body.center.y);
    //   if (delta.lengthSq() < distanceSquared) {
    //     closestAsteroid = asteroid
    //     distanceSquared = delta.lengthSq()
    //   }
    // })

  }

  collidePlanet = (planet: GameObjectWithBody, asteroid: GameObjectWithBody) => {
    if (!this.populationText || !this.fire) {
      return
    }
    
    //@ts-ignore
    asteroid.disableBody(true, true);
    
    this.fire.createEmitter({
        alpha: { start: 1, end: 0 },
        scale: { start: 0.5, end: 2.5 },
        tint: { start: 0xff945e, end: 0xff945e },
        speed: 20,
        accelerationY: -300,
        angle: { min: -85, max: -95 },
        rotate: { min: -180, max: 180 },
        lifespan: { min: 1000, max: 1100 },
        blendMode: 'ADD',
        frequency: 110,
        maxParticles: 10,
        x: asteroid.body.position.x,
        y: asteroid.body.position.y,
    });

    if (planet.name === "Planet") {
      //  Add and update the score
      this.population -= 1;
      this.populationText.setText('Population: ' + this.population);
    }
  }
}
