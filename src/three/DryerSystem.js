import * as THREE from 'three'
import { Airflow } from './Airflow.js'
import { createXrayMaterial } from './materials.js'

const LAYER_KEYS = ['shell', 'handle', 'bracket', 'coil', 'fan', 'outlet', 'other']

const DEFAULT_LABELS = {
  shell: '吹风机外壳',
  handle: '手柄',
  bracket: '内部支架',
  coil: '螺旋发热丝',
  fan: '风叶',
  outlet: '出风口',
  other: '其他部件'
}

/**
 * DryerSystem —— 吹风机业务逻辑层
 *
 * 组合「程序化模型 / GLB 模型」与气流粒子，统一管理：
 *  - 透视模式（外壳 / 手柄半透明，直视内部结构）
 *  - 电源开关（发热丝脉动自发光 + Bloom、风叶旋转、热风粒子）
 *  - 辉光强度、粒子风速、分层显隐
 */
export class DryerSystem {
  /**
   * @param {import('./Viewer.js').Viewer} viewer
   * @param {object} model buildProceduralDryer / loadHairDryerGLB 的返回值
   */
  constructor(viewer, model) {
    this.viewer = viewer
    this.root = model.root
    this.layers = model.layers
    this.fanPivot = model.fanPivot
    this.coilMesh = model.coilMesh
    this.outletAnchor = model.outletAnchor
    this.layerLabels = model.layerLabels || DEFAULT_LABELS

    this.xray = false
    this.power = false
    this.bloomStrength = 0.9
    this.windSpeed = 1.0

    // 收集每个分层下的全部网格；originalMaterials 记录透视切换前的原始材质
    this.layerMeshes = model.layerMeshes || this._collectMeshes()
    this.originalMaterials = model.originalMaterials || new Map()
    this.xrayMaterials = new Map()

    // 发热丝受控材质（程序化与 GLB 管线都保证 coilMesh 使用该材质）
    this.coilMaterial = this.coilMesh ? this.coilMesh.material : null

    // 热风粒子：挂到场景，通过 outletAnchor 世界矩阵跟随出风口
    this.airflow = new Airflow(this.outletAnchor)
    this.viewer.add(this.root)
    this.viewer.add(this.airflow.points)

    this._fanVelocity = 0
    this._coilLevel = 0

    this.viewer.onTick((delta, elapsed) => this.update(delta, elapsed))
  }

  /** 程序化模型没有预算 layerMeshes，遍历分层补齐 */
  _collectMeshes() {
    const map = Object.fromEntries(LAYER_KEYS.map((k) => [k, []]))
    for (const key of LAYER_KEYS) {
      const group = this.layers[key]
      if (!group) continue
      group.traverse((o) => {
        if (o.isMesh) map[key].push(o)
      })
    }
    return map
  }

  /* ---------------- 透视模式 ---------------- */

  setXray(enabled) {
    this.xray = enabled
    // 透视只让外壳与手柄半透明，内部结构保持实体，层次更清晰
    const targetLayers = ['shell', 'handle']

    for (const key of targetLayers) {
      for (const mesh of this.layerMeshes[key] || []) {
        if (enabled) {
          // 首次进入透视时记录原始材质，关闭时据此恢复
          if (!this.originalMaterials.has(mesh)) {
            this.originalMaterials.set(mesh, mesh.material)
          }
          if (!this.xrayMaterials.has(mesh)) {
            this.xrayMaterials.set(mesh, createXrayMaterial(mesh.material))
          }
          mesh.material = this.xrayMaterials.get(mesh)
        } else {
          const original = this.originalMaterials.get(mesh)
          if (original) mesh.material = original
        }
      }
    }
  }

  /* ---------------- 电源与运转 ---------------- */

  setPower(on) {
    this.power = on
    this.airflow.setActive(on)
  }

  setBloomStrength(value) {
    this.bloomStrength = value
    this.viewer.setBloomStrength(value)
  }

  setWindSpeed(value) {
    this.windSpeed = value
    this.airflow.setWindSpeed(value)
  }

  /** 单独切换某一结构层的显隐 */
  setLayerVisible(layerKey, visible) {
    const group = this.layers[layerKey]
    if (group) group.visible = visible
  }

  /** 每帧更新：发热丝脉动、风叶转速、粒子推进 */
  update(delta, elapsed) {
    const dt = Math.min(delta, 0.05)

    // ---- 发热丝：亮度目标随电源状态切换，开机时正弦脉动模拟高温发红 ----
    let target = 0
    if (this.power && this.coilMaterial) {
      // 0.75 ~ 1.0 之间脉动的高温系数
      const pulse = 0.86 + Math.sin(elapsed * 6.2) * 0.14
      target = 2.6 * pulse
    }
    this._coilLevel = THREE.MathUtils.damp(this._coilLevel, target, 6, dt)
    if (this.coilMaterial) {
      this.coilMaterial.emissiveIntensity = this._coilLevel
    }
    // 透视材质若继承了发热丝自发光也同步（外壳类不含发热丝，此处仅兜底）
    for (const mat of this.xrayMaterials.values()) {
      if (mat.emissive && this.coilMaterial && mat.emissive.getHex() === this.coilMaterial.emissive.getHex()) {
        mat.emissiveIntensity = this._coilLevel
      }
    }

    // ---- 风叶：开机加速 / 停机惯性减速，转速随风速变化 ----
    const fanTarget = this.power ? 26 * this.windSpeed : 0
    this._fanVelocity = THREE.MathUtils.damp(this._fanVelocity, fanTarget, 5, dt)
    if (this.fanPivot) {
      this.fanPivot.rotation.z -= this._fanVelocity * dt
    }

    // ---- 热风粒子 ----
    this.airflow.update(dt)
  }

  /* ---------------- 资源释放 ---------------- */

  dispose() {
    this.airflow.dispose()
    this.viewer.remove(this.airflow.points)
    this.viewer.remove(this.root)

    const disposed = new Set()
    const disposeMaterial = (mat) => {
      if (!mat || disposed.has(mat)) return
      disposed.add(mat)
      mat.dispose()
    }

    // 释放透视材质与各网格自有材质（共享材质靠 Set 去重）
    for (const mat of this.xrayMaterials.values()) disposeMaterial(mat)

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.()
        if (Array.isArray(o.material)) o.material.forEach(disposeMaterial)
        else disposeMaterial(o.material)
      }
    })

    // GLB 管线替换下来的原始材质（含贴图）也需释放，避免反复加载时泄漏。
    // 程序化模型开启过透视时，originalMaterials 与网格材质是同一批对象，
    // 已由上面的 Set 去重逻辑释放，此处不会重复 dispose。
    if (this.originalMaterials) {
      for (const mat of this.originalMaterials.values()) {
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else disposeMaterial(mat)
      }
    }
  }
}
