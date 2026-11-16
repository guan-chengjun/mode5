import * as THREE from 'three'

const PARTICLE_COUNT = 900

const vertexShader = /* glsl */ `
  attribute float aScale;
  attribute float aAlpha;
  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // 近大远小的点精灵尺寸
    gl_PointSize = aScale * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;

  void main() {
    // 圆形软粒子：距点中心越远越透明
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, d);

    // 热风暖色：亮黄 → 暖橙
    vec3 hot = vec3(1.0, 0.78, 0.42);
    vec3 cool = vec3(1.0, 0.45, 0.18);
    vec3 color = mix(cool, hot, soft);

    gl_FragColor = vec4(color, soft * vAlpha);
  }
`

/**
 * Airflow —— 出风口热风粒子流
 *
 * 粒子在模型局部空间模拟：从 outletAnchor 所在圆盘随机出生，
 * 沿 +Z 方向（出风方向）持续加速前进，附带径向扩散与螺旋扰动；
 * 寿命结束后回到发射点循环。停机时粒子自然消散、停止重生。
 */
export class Airflow {
  /**
   * @param {THREE.Object3D} anchor 发射锚点（取其世界矩阵定位 / 定向）
   */
  constructor(anchor) {
    this.anchor = anchor
    this.active = false
    this.windSpeed = 1.0 // UI 风速系数 0.2 ~ 2.0

    this.positions = new Float32Array(PARTICLE_COUNT * 3)
    this.scales = new Float32Array(PARTICLE_COUNT)
    this.alphas = new Float32Array(PARTICLE_COUNT)
    // CPU 端模拟数据
    this.velocities = new Float32Array(PARTICLE_COUNT * 3)
    this.ages = new Float32Array(PARTICLE_COUNT)
    this.lifetimes = new Float32Array(PARTICLE_COUNT)
    this.radials = new Float32Array(PARTICLE_COUNT)
    this.swirlSeeds = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this._kill(i)
      this.alphas[i] = 0
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(this.scales, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.points = new THREE.Points(geometry, this.material)
    this.points.name = 'airflowParticles'
    this.points.frustumCulled = false
  }

  /** 让粒子停在发射点、不可见，等待开机 */
  _kill(i) {
    const i3 = i * 3
    this.positions[i3] = 0
    this.positions[i3 + 1] = 0
    this.positions[i3 + 2] = 0
    this.velocities[i3] = 0
    this.velocities[i3 + 1] = 0
    this.velocities[i3 + 2] = 0
    this.ages[i] = 0
    this.lifetimes[i] = 1
    this.radials[i] = 0
    this.swirlSeeds[i] = Math.random() * Math.PI * 2
    this.scales[i] = 6 + Math.random() * 10
    this.alphas[i] = 0
  }

  /** 开机时预热：让粒子沿喷流路径均匀分布，立即得到完整气流 */
  prewarm() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this._respawn(i)
      const life = this.lifetimes[i]
      this.ages[i] = Math.random() * life
      this._integrate(i, this.ages[i])
    }
  }

  /** 重新发射一个粒子：发射圆盘内随机出生，初速度沿 +Z */
  _respawn(i) {
    const i3 = i * 3
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * 0.34
    this.positions[i3] = Math.cos(angle) * radius
    this.positions[i3 + 1] = Math.sin(angle) * radius
    this.positions[i3 + 2] = 0

    const base = 2.2 * (0.75 + Math.random() * 0.5)
    this.velocities[i3] = 0
    this.velocities[i3 + 1] = 0
    this.velocities[i3 + 2] = base
    this.ages[i] = 0
    this.lifetimes[i] = 0.9 + Math.random() * 0.5
    this.radials[i] = radius
    this.swirlSeeds[i] = Math.random() * Math.PI * 2
    this.scales[i] = 6 + Math.random() * 10
  }

  /** 把粒子推进 t 秒（用于预热时直接算到某年龄的位置） */
  _integrate(i, t) {
    const i3 = i * 3
    const speed = this.windSpeed
    const swirl = this.swirlSeeds[i] + t * 9
    const radial = this.radials[i] + t * 0.55 * speed
    this.positions[i3] = Math.cos(swirl) * radial
    this.positions[i3 + 1] = Math.sin(swirl) * radial
    this.positions[i3 + 2] = this.velocities[i3 + 2] * speed * t
  }

  setActive(on) {
    this.active = on
    if (on) this.prewarm()
  }

  setWindSpeed(value) {
    this.windSpeed = value
  }

  update(delta) {
    // 限制单帧步长，切后台回来不会跳变
    const dt = Math.min(delta, 0.05)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3

      if (!this.active) {
        // 停机：现有粒子继续飞完寿命后不再重生，气流自然消散
        if (this.ages[i] >= this.lifetimes[i]) {
          this.alphas[i] = 0
          continue
        }
      }

      this.ages[i] += dt
      if (this.ages[i] >= this.lifetimes[i]) {
        if (this.active) {
          this._respawn(i)
        } else {
          this.alphas[i] = 0
          continue
        }
      }

      if (this.active || this.ages[i] < this.lifetimes[i]) {
        this._integrate(i, this.ages[i])
        const lifeRatio = this.ages[i] / this.lifetimes[i]
        // 淡入 → 持续 → 淡出 的包络
        const envelope =
          Math.min(1, lifeRatio * 6) * (1 - THREE.MathUtils.smoothstep(lifeRatio, 0.65, 1))
        this.alphas[i] = this.active ? envelope * 0.85 : envelope * 0.6
      }
    }

    const geometry = this.points.geometry
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
    geometry.attributes.aScale.needsUpdate = true

    // 粒子点的变换跟随发射锚点（模型局部空间 → 世界空间）
    // 缩放也同步：保证不同尺寸的 GLB 模型上，发射圆盘与喷流比例仍然匹配
    this.anchor.getWorldPosition(this.points.position)
    this.points.quaternion.copy(this.anchor.getWorldQuaternion(new THREE.Quaternion()))
    this.points.scale.copy(this.anchor.getWorldScale(new THREE.Vector3()))
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}
