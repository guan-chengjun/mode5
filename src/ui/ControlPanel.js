/**
 * ControlPanel —— 侧边控制面板（原生 DOM，无框架依赖）
 *
 * 通过 callbacks 与 3D 业务层解耦：
 *   onXrayChange(enabled)
 *   onPowerChange(enabled)
 *   onBloomChange(value)
 *   onWindChange(value)
 *   onLayerToggle(layerKey, visible)
 *   onLoadGLB(url)
 *   onResetModel()
 */
export class ControlPanel {
  constructor(container, callbacks) {
    this.container = container
    this.callbacks = callbacks
    this.refs = {}
    this._render()
  }

  _render() {
    this.container.innerHTML = `
      <div class="panel-title">💨 3D 吹风机展示台</div>
      <div class="panel-subtitle">Vite + Three.js · PBR / Bloom / 粒子气流</div>

      <div id="status-badge" class="status-badge off">
        <span class="dot"></span><span id="status-text">停机状态</span>
      </div>

      <div class="panel-section">
        <h3>显示控制</h3>
        <div class="switch-row">
          <label for="toggle-xray">透视模式（外壳半透明）</label>
          <span class="switch">
            <input type="checkbox" id="toggle-xray" />
            <span class="slider"></span>
          </span>
        </div>
      </div>

      <div class="panel-section">
        <h3>运转模拟</h3>
        <div class="switch-row">
          <label for="toggle-power">电源启动 / 停止</label>
          <span class="switch power-switch">
            <input type="checkbox" id="toggle-power" />
            <span class="slider"></span>
          </span>
        </div>

        <div class="slider-row">
          <div class="slider-head">
            <span>辉光强度（Bloom）</span>
            <span class="value" id="bloom-value">0.90</span>
          </div>
          <input type="range" id="slider-bloom" min="0" max="2.5" step="0.05" value="0.9" />
        </div>

        <div class="slider-row">
          <div class="slider-head">
            <span>粒子风速</span>
            <span class="value" id="wind-value">1.00×</span>
          </div>
          <input type="range" id="slider-wind" min="0.2" max="2" step="0.05" value="1" />
        </div>
      </div>

      <div class="panel-section">
        <h3>结构分层显隐</h3>
        <div class="layer-grid" id="layer-grid"></div>
      </div>

      <div class="panel-section">
        <h3>在线 GLB 模型</h3>
        <input type="text" id="glb-url" class="model-input"
          placeholder="粘贴 .glb / .gltf 网络地址" />
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-load-glb">加载模型</button>
          <button class="btn btn-ghost" id="btn-reset">内置模型</button>
        </div>
        <p class="model-tip">
          模型节点按名称自动分层（coil / fan / outlet / bracket / handle / shell）。
          资源服务器需返回 CORS 头；加载失败将自动回退内置程序化模型。
        </p>
      </div>
    `

    const $ = (id) => this.container.querySelector(id)
    this.refs.xray = $('#toggle-xray')
    this.refs.power = $('#toggle-power')
    this.refs.bloom = $('#slider-bloom')
    this.refs.bloomValue = $('#bloom-value')
    this.refs.wind = $('#slider-wind')
    this.refs.windValue = $('#wind-value')
    this.refs.layerGrid = $('#layer-grid')
    this.refs.glbUrl = $('#glb-url')
    this.refs.statusBadge = $('#status-badge')
    this.refs.statusText = $('#status-text')

    this.refs.xray.addEventListener('change', (e) =>
      this.callbacks.onXrayChange(e.target.checked)
    )
    this.refs.power.addEventListener('change', (e) =>
      this._onPower(e.target.checked)
    )
    this.refs.bloom.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value)
      this.refs.bloomValue.textContent = v.toFixed(2)
      this.callbacks.onBloomChange(v)
    })
    this.refs.wind.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value)
      this.refs.windValue.textContent = `${v.toFixed(2)}×`
      this.callbacks.onWindChange(v)
    })
    $('#btn-load-glb').addEventListener('click', () => {
      const url = this.refs.glbUrl.value.trim()
      if (url) this.callbacks.onLoadGLB(url)
    })
    this.refs.glbUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = e.target.value.trim()
        if (url) this.callbacks.onLoadGLB(url)
      }
    })
    $('#btn-reset').addEventListener('click', () => this.callbacks.onResetModel())
  }

  /** 根据模型分层标签渲染复选框 */
  renderLayerChecks(layerEntries) {
    this.refs.layerGrid.innerHTML = layerEntries
      .map(
        ([key, label]) => `
        <label>
          <input type="checkbox" data-layer="${key}" checked />
          ${label}
        </label>`
      )
      .join('')

    this.refs.layerGrid.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', (e) =>
        this.callbacks.onLayerToggle(e.target.dataset.layer, e.target.checked)
      )
    })
  }

  _onPower(enabled) {
    this.refs.statusBadge.classList.toggle('on', enabled)
    this.refs.statusBadge.classList.toggle('off', !enabled)
    this.refs.statusText.textContent = enabled ? '运转中 · 高温热风' : '停机状态'
    this.callbacks.onPowerChange(enabled)
  }

  /** 程序化 / GLB 模型切换后，把面板状态同步到新系统 */
  syncState(state) {
    this.refs.xray.checked = !!state.xray
    this.refs.power.checked = !!state.power
    this._onPowerSilent(!!state.power)
    this.refs.bloom.value = state.bloomStrength
    this.refs.bloomValue.textContent = Number(state.bloomStrength).toFixed(2)
    this.refs.wind.value = state.windSpeed
    this.refs.windValue.textContent = `${Number(state.windSpeed).toFixed(2)}×`
    this.refs.layerGrid.querySelectorAll('input').forEach((input) => {
      input.checked = true
    })
  }

  _onPowerSilent(enabled) {
    this.refs.statusBadge.classList.toggle('on', enabled)
    this.refs.statusBadge.classList.toggle('off', !enabled)
    this.refs.statusText.textContent = enabled ? '运转中 · 高温热风' : '停机状态'
  }

  setLoadingTip(text) {
    const overlay = document.getElementById('loading')
    const label = document.getElementById('loading-text')
    if (text) {
      label.textContent = text
      overlay.hidden = false
    } else {
      overlay.hidden = true
    }
  }
}
