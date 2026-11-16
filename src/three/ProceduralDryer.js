import * as THREE from 'three'
import {
  createShellMaterial,
  createHandleMaterial,
  createBracketMaterial,
  createCoilMaterial,
  createFanMaterial,
  createOutletMaterial,
  createAccentMaterial
} from './materials.js'

/**
 * 螺旋线曲线：沿 Z 轴生成螺旋发热丝的管道路径
 */
class HelixCurve extends THREE.Curve {
  /**
   * @param {number} radius 螺旋半径
   * @param {number} length 轴向长度（沿 Z）
   * @param {number} turns  螺旋圈数
   */
  constructor(radius, length, turns) {
    super()
    this.radius = radius
    this.length = length
    this.turns = turns
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = t * this.turns * Math.PI * 2
    return target.set(
      Math.cos(angle) * this.radius,
      Math.sin(angle) * this.radius,
      (t - 0.5) * this.length
    )
  }
}

/**
 * 程序化构建吹风机模型 —— 无需任何外部资源即可离线运行。
 *
 * 模型沿 Z 轴布局：风叶 / 电机在 -Z（进风端），发热丝居中，出风口在 +Z。
 * 六个独立分层 Group，便于单独显隐与透视切换：
 *   shell   吹风机外壳（筒身、前后装饰环、进风栅格）
 *   handle  手柄（握把、连接颈、尾盖、电源按键）
 *   bracket 内部支架（电机筒、安装环、支撑筋、发热丝支架）
 *   coil    螺旋发热丝
 *   fan     风叶（独立 pivot，运行时绕 Z 轴旋转）
 *   outlet  出风口（聚风喷嘴、出风圈）
 *
 * @returns {{
 *   root: THREE.Group, layers: Record<string, THREE.Group>,
 *   fanPivot: THREE.Group, coilMesh: THREE.Mesh,
 *   outletAnchor: THREE.Object3D
 * }}
 */
export function buildProceduralDryer() {
  const root = new THREE.Group()
  root.name = 'ProceduralHairDryer'

  // ---- 六个独立分层 ----
  const layers = {
    shell: new THREE.Group(),
    handle: new THREE.Group(),
    bracket: new THREE.Group(),
    coil: new THREE.Group(),
    fan: new THREE.Group(),
    outlet: new THREE.Group(),
    other: new THREE.Group()
  }
  Object.entries(layers).forEach(([key, group]) => {
    group.name = `layer_${key}`
    root.add(group)
  })

  const matShell = createShellMaterial()
  const matHandle = createHandleMaterial()
  const matBracket = createBracketMaterial()
  const matCoil = createCoilMaterial()
  const matFan = createFanMaterial()
  const matOutlet = createOutletMaterial()
  const matButton = createAccentMaterial(0x2563eb)

  /** 统一开启阴影的小工具 */
  const enableShadow = (mesh) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  // 圆筒几何体辅助：CylinderGeometry 默认沿 Y 轴，旋转到 Z 轴
  const zCylinder = (rTop, rBottom, length, segments = 48, openEnded = false) => {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, length, segments, 1, openEnded)
    geo.rotateX(Math.PI / 2)
    return geo
  }

  /* ============================================================
     1. 外壳层 shell —— 筒身 + 前后装饰环 + 进风栅格
     ============================================================ */
  const barrel = enableShadow(
    new THREE.Mesh(zCylinder(0.82, 0.82, 2.6, 64, true), matShell)
  )
  barrel.name = 'barrel'
  layers.shell.add(barrel)

  // 前 / 后装饰环
  const ringGeo = new THREE.TorusGeometry(0.82, 0.055, 16, 64)
  const frontRing = enableShadow(new THREE.Mesh(ringGeo, matShell))
  frontRing.position.z = 1.3
  const rearRing = enableShadow(new THREE.Mesh(ringGeo.clone(), matShell))
  rearRing.position.z = -1.3
  layers.shell.add(frontRing, rearRing)

  // 后端进风栅格：同心环 + 径向辐条
  const grillRing = enableShadow(
    new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 12, 48), matBracket)
  )
  grillRing.position.z = -1.33
  layers.shell.add(grillRing)

  const spokeGeo = new THREE.BoxGeometry(1.18, 0.045, 0.03)
  for (let i = 0; i < 6; i++) {
    const spoke = enableShadow(new THREE.Mesh(spokeGeo, matBracket))
    spoke.position.z = -1.34
    spoke.rotation.z = (i / 6) * Math.PI
    layers.shell.add(spoke)
  }
  const rearCap = enableShadow(
    new THREE.Mesh(zCylinder(0.14, 0.14, 0.06, 32), matBracket)
  )
  rearCap.position.z = -1.34
  layers.shell.add(rearCap)

  /* ============================================================
     2. 手柄层 handle —— 握把 + 连接颈 + 尾盖 + 电源按键
     ============================================================ */
  const handleGroup = new THREE.Group()
  handleGroup.position.set(0, -0.78, -0.15)
  handleGroup.rotation.x = 0.18 // 略微向后倾斜，符合真实造型
  layers.handle.add(handleGroup)

  const grip = enableShadow(
    new THREE.Mesh(zCylinder(0.21, 0.27, 1.5, 40), matHandle)
  )
  grip.rotation.x = Math.PI / 2 // 握把沿 Y 轴竖直
  grip.position.y = -0.75
  handleGroup.add(grip)

  // 手柄与筒身的连接颈
  const collar = enableShadow(new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), matHandle))
  collar.scale.set(1.1, 0.75, 1)
  collar.position.y = 0.02
  handleGroup.add(collar)

  // 尾盖
  const endCap = enableShadow(
    new THREE.Mesh(zCylinder(0.275, 0.275, 0.08, 40), matShell)
  )
  endCap.rotation.x = Math.PI / 2
  endCap.position.y = -1.52
  handleGroup.add(endCap)

  // 手柄正面的电源按键（装饰件）
  const powerButton = enableShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.26, 0.06), matButton)
  )
  powerButton.position.set(0, -0.55, 0.25)
  handleGroup.add(powerButton)

  /* ============================================================
     3. 内部支架层 bracket —— 电机筒 + 安装环 + 支撑筋 + 发热丝支架
     ============================================================ */
  const motorCan = enableShadow(
    new THREE.Mesh(zCylinder(0.34, 0.34, 0.5, 40), matBracket)
  )
  motorCan.position.z = -0.75
  layers.bracket.add(motorCan)

  // 电机安装环与支撑筋（把电机固定在筒身内壁）
  const mountRing = enableShadow(
    new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 12, 48), matBracket)
  )
  mountRing.position.z = -0.95
  layers.bracket.add(mountRing)

  const strutGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05)
  for (let i = 0; i < 4; i++) {
    const strut = enableShadow(new THREE.Mesh(strutGeo, matBracket))
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    strut.position.set(Math.cos(a) * 0.47, Math.sin(a) * 0.47, -0.95)
    strut.rotation.z = a
    layers.bracket.add(strut)
  }

  // 发热丝前后支撑环 + 轴向支撑杆
  const coilRingGeo = new THREE.TorusGeometry(0.42, 0.022, 10, 40)
  const coilRingFront = enableShadow(new THREE.Mesh(coilRingGeo, matBracket))
  coilRingFront.position.z = 0.55
  const coilRingRear = enableShadow(new THREE.Mesh(coilRingGeo.clone(), matBracket))
  coilRingRear.position.z = -0.15
  layers.bracket.add(coilRingFront, coilRingRear)

  const rodGeo = new THREE.BoxGeometry(0.035, 0.84, 0.035)
  for (let i = 0; i < 3; i++) {
    const rod = enableShadow(new THREE.Mesh(rodGeo, matBracket))
    const a = (i / 3) * Math.PI * 2
    rod.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.2)
    rod.rotation.z = a
    layers.bracket.add(rod)
  }

  /* ============================================================
     4. 螺旋发热丝层 coil
     ============================================================ */
  const coilCurve = new HelixCurve(0.32, 0.7, 7)
  const coilGeo = new THREE.TubeGeometry(coilCurve, 220, 0.045, 12, false)
  const coilMesh = enableShadow(new THREE.Mesh(coilGeo, matCoil))
  coilMesh.name = 'heatingCoil'
  coilMesh.position.z = 0.2
  layers.coil.add(coilMesh)

  /* ============================================================
     5. 风叶层 fan —— pivot 组运行时绕 Z 轴旋转
     ============================================================ */
  const fanPivot = new THREE.Group()
  fanPivot.name = 'fanPivot'
  fanPivot.position.z = -1.05
  layers.fan.add(fanPivot)

  const hub = enableShadow(new THREE.Mesh(zCylinder(0.12, 0.12, 0.24, 32), matFan))
  hub.name = 'fanHub'
  fanPivot.add(hub)

  // 单片扇叶：2D 轮廓挤出成型
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(0.12, -0.05)
  bladeShape.quadraticCurveTo(0.42, -0.16, 0.62, -0.05)
  bladeShape.quadraticCurveTo(0.66, 0.02, 0.6, 0.09)
  bladeShape.quadraticCurveTo(0.38, 0.14, 0.12, 0.06)
  bladeShape.closePath()
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2
  })
  bladeGeo.translate(0, 0, -0.02)

  const BLADE_COUNT = 7
  for (let i = 0; i < BLADE_COUNT; i++) {
    const blade = enableShadow(new THREE.Mesh(bladeGeo, matFan))
    blade.name = `fanBlade_${i}`
    blade.rotation.z = (i / BLADE_COUNT) * Math.PI * 2
    blade.rotation.x = 0.5 // 叶片倾角，旋转时产生轴向吹风感
    fanPivot.add(blade)
  }

  /* ============================================================
     6. 出风口层 outlet —— 聚风喷嘴 + 出风圈
     ============================================================ */
  const nozzle = enableShadow(
    new THREE.Mesh(zCylinder(0.46, 0.78, 0.72, 64, true), matOutlet)
  )
  nozzle.position.z = 1.62
  nozzle.name = 'nozzle'
  layers.outlet.add(nozzle)

  const outletLip = enableShadow(
    new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 14, 56), matOutlet)
  )
  outletLip.position.z = 1.98
  outletLip.name = 'outletLip'
  layers.outlet.add(outletLip)

  // 气流粒子发射锚点：位于出风口平面中心，+Z 即出风方向
  const outletAnchor = new THREE.Object3D()
  outletAnchor.name = 'outletAnchor'
  outletAnchor.position.set(0, 0, 2.0)
  layers.outlet.add(outletAnchor)

  return { root, layers, fanPivot, coilMesh, outletAnchor }
}
