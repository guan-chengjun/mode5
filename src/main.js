import './style.css'
import { Viewer } from './three/Viewer.js'
import { DryerSystem } from './three/DryerSystem.js'
import { buildProceduralDryer } from './three/ProceduralDryer.js'
import { loadHairDryerGLB } from './three/GLBLoader.js'
import { ControlPanel } from './ui/ControlPanel.js'

/**
 * 应用入口：
 *  默认加载内置程序化吹风机（零网络依赖、保证可运行）；
 *  面板中粘贴在线 GLB 地址可替换为网络模型，失败自动回退。
 */
const viewer = new Viewer(document.getElementById('viewer'))

/** 当前面板参数（切换模型后需要重新应用到新系统） */
const uiState = {
  xray: false,
  power: false,
  bloomStrength: 0.9,
  windSpeed: 1.0,
  hiddenLayers: new Set()
}

/** @type {DryerSystem | null} */
let system = null

const panel = new ControlPanel(document.getElementById('panel'), {
  onXrayChange: (enabled) => {
    uiState.xray = enabled
    system?.setXray(enabled)
  },
  onPowerChange: (enabled) => {
    uiState.power = enabled
    system?.setPower(enabled)
  },
  onBloomChange: (value) => {
    uiState.bloomStrength = value
    system?.setBloomStrength(value)
  },
  onWindChange: (value) => {
    uiState.windSpeed = value
    system?.setWindSpeed(value)
  },
  onLayerToggle: (layerKey, visible) => {
    if (visible) uiState.hiddenLayers.delete(layerKey)
    else uiState.hiddenLayers.add(layerKey)
    system?.setLayerVisible(layerKey, visible)
  },
  onLoadGLB: (url) => loadOnlineModel(url),
  onResetModel: () => createSystem(buildProceduralDryer())
})

/**
 * 用给定模型创建新业务系统，替换旧系统并重放全部 UI 状态。
 * @param {object} model buildProceduralDryer / loadHairDryerGLB 返回值
 */
function createSystem(model) {
  if (system) system.dispose()

  viewer.fitToView(model.root)
  system = new DryerSystem(viewer, model)

  // 重放面板状态
  system.setBloomStrength(uiState.bloomStrength)
  system.setWindSpeed(uiState.windSpeed)
  system.setXray(uiState.xray)
  system.setPower(uiState.power)
  for (const key of uiState.hiddenLayers) system.setLayerVisible(key, false)

  // 生成分层复选框（过滤没有任何网格的空分层）
  const labels = model.layerLabels || {
    shell: '吹风机外壳',
    handle: '手柄',
    bracket: '内部支架',
    coil: '螺旋发热丝',
    fan: '风叶',
    outlet: '出风口',
    other: '其他部件'
  }
  panel.renderLayerChecks(
    Object.entries(labels).filter(
      ([key]) => model.layers[key] && model.layers[key].children.length > 0
    )
  )
  panel.syncState({
    xray: uiState.xray,
    power: uiState.power,
    bloomStrength: uiState.bloomStrength,
    windSpeed: uiState.windSpeed
  })
  // syncState 会把所有图层复选框重置为勾选，再还原隐藏项
  for (const key of uiState.hiddenLayers) {
    const input = document.querySelector(`input[data-layer="${key}"]`)
    if (input) input.checked = false
  }
}

/** 加载在线 GLB，带遮罩提示与失败回退 */
async function loadOnlineModel(url) {
  panel.setLoadingTip('正在下载在线 GLB 模型…')
  try {
    const model = await loadHairDryerGLB(url, (loaded, total) => {
      const percent = Math.round((loaded / total) * 100)
      panel.setLoadingTip(`正在下载模型… ${percent}%`)
    })
    createSystem(model)
    panel.setLoadingTip(null)
  } catch (err) {
    console.error('[GLB] 加载失败，回退内置程序化模型：', err)
    panel.setLoadingTip('模型加载失败，已回退内置模型')
    createSystem(buildProceduralDryer())
    setTimeout(() => panel.setLoadingTip(null), 1600)
  }
}

// 启动：内置程序化模型
createSystem(buildProceduralDryer())
