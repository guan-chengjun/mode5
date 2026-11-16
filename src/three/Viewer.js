import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/**
 * Viewer —— 底层 Three.js 渲染器封装
 *
 * 负责：
 *  - 抗锯齿 + 阴影的 WebGLRenderer（PBR 工作流，ACES 色调映射，sRGB 输出）
 *  - OrbitControls：左键 360° 旋转、滚轮缩放、右键平移
 *  - 三点补光（主光 / 补光 / 轮廓光）+ 环境光 + 浅灰背景 + 阴影承接地面
 *  - EffectComposer 后期链：RenderPass → UnrealBloomPass → OutputPass
 *  - 自适应 resize、外部注册每帧回调
 */
export class Viewer {
  constructor(container) {
    this.container = container
    this.clock = new THREE.Clock()
    this.tickCallbacks = []
    this.disposables = []

    // ---------------- 渲染器：抗锯齿 + 阴影 + PBR ----------------
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    // ---------------- 场景：简洁浅灰背景 ----------------
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xeef1f5)

    // ---------------- 相机 ----------------
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    )
    this.camera.position.set(4.6, 2.6, 6.4)

    // ---------------- 轨道控制器 ----------------
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.enablePan = true // 右键平移
    this.controls.minDistance = 2.5
    this.controls.maxDistance = 18
    this.controls.maxPolarAngle = Math.PI // 允许全角度观察
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    this._setupLights()
    this._setupGround()
    this._setupComposer()

    window.addEventListener('resize', this._onResize)
    this._animate = this._animate.bind(this)
    this.renderer.setAnimationLoop(this._animate)
  }

  /** 三点补光 + 环境光 */
  _setupLights() {
    // 环境光：提供基础漫反射，避免暗部死黑
    const ambient = new THREE.AmbientLight(0xffffff, 0.45)
    this.scene.add(ambient)

    // 半球光：天空 / 地面渐变环境感
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c0cc, 0.35)
    this.scene.add(hemi)

    // 主光（Key Light）：暖白、投射阴影
    this.keyLight = new THREE.DirectionalLight(0xfff4e6, 2.4)
    this.keyLight.position.set(5, 7, 5)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(2048, 2048)
    this.keyLight.shadow.camera.near = 0.5
    this.keyLight.shadow.camera.far = 30
    this.keyLight.shadow.camera.left = -6
    this.keyLight.shadow.camera.right = 6
    this.keyLight.shadow.camera.top = 6
    this.keyLight.shadow.camera.bottom = -6
    this.keyLight.shadow.bias = -0.0004
    this.keyLight.shadow.radius = 4
    this.scene.add(this.keyLight)

    // 补光（Fill Light）：冷色、弱强度、无阴影
    this.fillLight = new THREE.DirectionalLight(0xdce8ff, 0.9)
    this.fillLight.position.set(-6, 3, 2)
    this.scene.add(this.fillLight)

    // 轮廓光 / 背光（Rim Light）：勾勒边缘
    this.rimLight = new THREE.DirectionalLight(0xffffff, 1.2)
    this.rimLight.position.set(-2, 4, -6)
    this.scene.add(this.rimLight)
  }

  /** 阴影承接地面：ShadowMaterial 只显示阴影，保持浅灰背景干净 */
  _setupGround() {
    this.groundY = -2.15
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = this.groundY
    ground.receiveShadow = true
    this.scene.add(ground)
  }

  /** 后期处理：Bloom 辉光通道 */
  _setupComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.9, // strength —— 可由 UI 滑块实时调节
      0.55, // radius
      0.72 // threshold —— 只有发热丝高亮区域参与辉光
    )
    this.composer.addPass(this.bloomPass)

    // OutputPass 负责色调映射 + sRGB 转换，保证 PBR 颜色正确
    this.composer.addPass(new OutputPass())
  }

  /** 注册每帧回调，参数为 delta 秒与已运行时间 */
  onTick(fn) {
    this.tickCallbacks.push(fn)
  }

  _animate() {
    const delta = this.clock.getDelta()
    const elapsed = this.clock.elapsedTime
    for (const fn of this.tickCallbacks) fn(delta, elapsed)
    this.controls.update()
    this.composer.render()
  }

  /** 实时调节 Bloom 强度（UI 辉光滑块） */
  setBloomStrength(value) {
    this.bloomPass.strength = value
  }

  /** 调整地面高度（加载尺寸不同的 GLB 后调用） */
  setGround(y) {
    this.groundY = y
    this.scene.children
      .filter((o) => o.isMesh && o.material instanceof THREE.ShadowMaterial)
      .forEach((o) => (o.position.y = y))
  }

  /**
   * 自适应取景：把目标对象缩放到合适尺寸、平移到原点并调整相机距离
   * @returns {{groundY:number}} 建议的地面高度
   */
  fitToView(object, targetSize = 3.4) {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1

    const scale = targetSize / maxDim
    object.scale.multiplyScalar(scale)

    // 缩放后重新计算包围盒，将模型中心移到原点
    const box2 = new THREE.Box3().setFromObject(object)
    const center2 = box2.getCenter(new THREE.Vector3())
    object.position.sub(center2)

    const box3 = new THREE.Box3().setFromObject(object)
    const groundY = box3.min.y - 0.12
    this.setGround(groundY)

    const fitSize = box3.getSize(new THREE.Vector3())
    const fitMax = Math.max(fitSize.x, fitSize.y, fitSize.z)
    const vFov = THREE.MathUtils.degToRad(this.camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect)
    const dist = (fitMax / 2 / Math.tan(Math.min(vFov, hFov) / 2)) * 1.45

    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    this.camera.position.copy(dir.multiplyScalar(dist))
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    return { groundY }
  }

  add(object) {
    this.scene.add(object)
  }

  remove(object) {
    this.scene.remove(object)
  }

  _onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  /** 释放全部资源 */
  dispose() {
    window.removeEventListener('resize', this._onResize)
    this.renderer.setAnimationLoop(null)
    this.controls.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
