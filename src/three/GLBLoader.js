import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import {
  createCoilMaterial,
  createFanMaterial,
  createOutletMaterial,
  createXrayMaterial
} from './materials.js'

/**
 * 分层关键字表：按 mesh 名称（小写）匹配所属结构层。
 * 顺序即优先级 —— 例如 "fan_blade" 先命中 fan 而非 blade 之外的规则。
 * 自定义 GLB 可按下表命名节点以获得最佳兼容；未命中的网格归入 other。
 */
const LAYER_RULES = [
  { layer: 'coil', keywords: ['coil', 'heating', 'heater', '发热', '电热'] },
  { layer: 'fan', keywords: ['fan', 'blade', 'impeller', 'propeller', '风叶', '风扇'] },
  { layer: 'outlet', keywords: ['outlet', 'nozzle', 'vent', '出风口', '喷嘴'] },
  { layer: 'bracket', keywords: ['bracket', 'frame', 'mount', 'motor', 'support', '支架', '电机'] },
  { layer: 'handle', keywords: ['handle', 'grip', '手柄', '握把'] },
  { layer: 'shell', keywords: ['shell', 'body', 'case', 'housing', 'barrel', '外壳', '筒'] }
]

const LAYER_LABELS = {
  shell: '外壳',
  handle: '手柄',
  bracket: '内部支架',
  coil: '螺旋发热丝',
  fan: '风叶',
  outlet: '出风口',
  other: '其他部件'
}

function classifyMesh(name) {
  const lower = (name || '').toLowerCase()
  for (const rule of LAYER_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return rule.layer
    }
  }
  return 'other'
}

function createLayers() {
  const layers = {}
  for (const key of [...Object.keys(LAYER_LABELS)]) {
    const group = new THREE.Group()
    group.name = `layer_${key}`
    layers[key] = group
  }
  return layers
}

/**
 * 在线加载 GLB / GLTF 吹风机模型并转成与程序化模型一致的分层结构。
 *
 * @param {string} url 网络模型地址（服务器需允许 CORS）
 * @param {(loaded:number,total:number)=>void} [onProgress]
 * @returns {Promise<object>} 与 buildProceduralDryer 同构的返回对象
 */
export function loadHairDryerGLB(url, onProgress) {
  const loader = new GLTFLoader()

  // DRACO 压缩模型支持（解码器从官方 CDN 按需拉取，未压缩模型不会触发下载）
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  loader.setDRACOLoader(dracoLoader)

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        try {
          const result = _processGLTF(gltf)
          resolve(result)
        } catch (err) {
          reject(err)
        } finally {
          dracoLoader.dispose()
        }
      },
      (event) => {
        if (onProgress && event.total) onProgress(event.loaded, event.total)
      },
      (err) => {
        dracoLoader.dispose()
        reject(err)
      }
    )
  })
}

function _processGLTF(gltf) {
  const root = new THREE.Group()
  root.name = 'GLBHairDryer'
  const layers = createLayers()
  Object.values(layers).forEach((g) => root.add(g))

  const model = gltf.scene
  const layerMeshes = { shell: [], handle: [], bracket: [], coil: [], fan: [], outlet: [], other: [] }
  const originalMaterials = new Map()

  const coilMaterial = createCoilMaterial()
  const fanMaterial = createFanMaterial()
  const outletMaterial = createOutletMaterial()

  model.traverse((child) => {
    if (!child.isMesh) return

    child.castShadow = true
    child.receiveShadow = true

    const layerKey = classifyMesh(child.name)
    const original = child.material
    originalMaterials.set(child, original)

    // 关键功能层替换为项目受控材质，保证辉光 / 透视等功能可用
    if (layerKey === 'coil') {
      child.material = coilMaterial
    } else if (layerKey === 'fan') {
      child.material = fanMaterial
    } else if (layerKey === 'outlet') {
      child.material = outletMaterial
    } else if (original && original.clone) {
      // 克隆一份，避免透视切换污染共享原始材质
      child.material = original.clone()
    }

    layerMeshes[layerKey].push(child)
    layers[layerKey].add(child)
  })

  // 风叶层包一层 pivot（位于模型原点），运行时绕 Z 轴旋转
  const fanPivot = new THREE.Group()
  fanPivot.name = 'fanPivot'
  root.add(fanPivot)
  layerMeshes.fan.forEach((mesh) => fanPivot.attach(mesh))

  // 发热丝引用（取第一个网格；其材质为受控 coilMaterial）
  const coilMesh = layerMeshes.coil[0] || null

  // 出风锚点：优先挂在出风口网格中心，否则默认模型 +Z 方向
  const outletAnchor = new THREE.Object3D()
  outletAnchor.name = 'outletAnchor'
  if (layerMeshes.outlet.length > 0) {
    const box = new THREE.Box3().setFromObject(layers.outlet)
    const center = box.getCenter(new THREE.Vector3())
    outletAnchor.position.set(center.x, center.y, box.max.z + 0.05)
  } else {
    const box = new THREE.Box3().setFromObject(root)
    outletAnchor.position.set(0, 0, box.max.z + 0.1)
  }
  layers.outlet.add(outletAnchor)

  return {
    root,
    layers,
    fanPivot,
    coilMesh,
    outletAnchor,
    layerMeshes,
    originalMaterials,
    layerLabels: LAYER_LABELS
  }
}
