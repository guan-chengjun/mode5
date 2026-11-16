import * as THREE from 'three'

/**
 * 材质库 —— 全部使用 MeshStandardMaterial（PBR 金属度 / 粗糙度工作流）
 * 同层部件共享材质，方便透视开关统一切换。
 */

// 吹风机外壳：暖白珠光塑料
export function createShellMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xf2f4f7,
    metalness: 0.15,
    roughness: 0.38
  })
}

// 手柄：深灰磨砂塑料
export function createHandleMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x3a4150,
    metalness: 0.2,
    roughness: 0.62
  })
}

// 内部支架：镀锌金属
export function createBracketMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x9aa3af,
    metalness: 0.85,
    roughness: 0.34
  })
}

/**
 * 螺旋发热丝：暗金属基底 + 暖红自发光
 * 开机时由 DryerSystem 动态调节 emissiveIntensity 实现脉动发红，
 * 高亮值配合 Bloom 通道产生辉光。
 */
export function createCoilMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x4a2b22,
    metalness: 0.65,
    roughness: 0.4,
    emissive: new THREE.Color(0xff3c14),
    emissiveIntensity: 0
  })
}

// 风叶：工程塑料
export function createFanMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x2f6fb0,
    metalness: 0.3,
    roughness: 0.45
  })
}

// 出风口：镀铬金属
export function createOutletMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xc7cdd6,
    metalness: 0.95,
    roughness: 0.18
  })
}

// 按钮等小部件
export function createAccentMaterial(color = 0x2563eb) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.4,
    roughness: 0.35
  })
}

/**
 * 透视模式材质：半透明、保留原色与自发光
 * @param {THREE.MeshStandardMaterial} source 原始材质（用于继承颜色 / 自发光）
 */
export function createXrayMaterial(source) {
  return new THREE.MeshStandardMaterial({
    color: source.color.clone(),
    metalness: source.metalness,
    roughness: 0.25,
    emissive: source.emissive ? source.emissive.clone() : new THREE.Color(0x000000),
    emissiveIntensity: source.emissiveIntensity || 0,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false // 半透明外壳不遮挡内部结构
  })
}
