# 3D 吹风机交互展示台（Vite + Three.js）

基于 **Vite 5 + Three.js r170（ES Modules）** 的交互式 3D 吹风机展示项目。
内置**程序化建模的完整吹风机**（零网络依赖即可运行），同时支持**在线加载网络 GLB / GLTF 模型**，
具备透视外壳、发热丝 Bloom 辉光脉动、热风粒子气流等完整运转模拟。

---

## 一、启动命令

```bash
# 1. 安装依赖（Node.js 18+，推荐 Node 20/22）
npm install

# 2. 启动开发服务器（默认自动打开 http://localhost:5173）
npm run dev

# 3. 生产构建（输出到 dist/）
npm run build

# 4. 本地预览生产构建
npm run preview
```

---

## 二、目录结构

```
mode5/
├── index.html                  # 页面入口：画布容器 / 控制面板挂载点 / 加载遮罩
├── package.json                # 依赖与脚本
├── vite.config.js              # Vite 配置（端口、CORS、构建目标）
├── public/
│   └── models/
│       └── README.md           # 本地 GLB 放置说明与节点命名约定
└── src/
    ├── main.js                 # 应用入口：组装各模块、UI 状态管理、GLB 加载回退
    ├── style.css               # 全部样式：侧边面板 / 开关 / 滑块 / 加载动画 / 响应式
    ├── ui/
    │   └── ControlPanel.js     # 侧边控制面板（原生 DOM，事件回调与 3D 层解耦）
    └── three/
        ├── Viewer.js           # 渲染器封装：抗锯齿/阴影/轨道控制器/三点光/Bloom 后期
        ├── materials.js        # PBR 材质库 + 透视半透明材质工厂
        ├── ProceduralDryer.js  # 程序化吹风机模型（六个独立分层，离线可用）
        ├── GLBLoader.js        # 在线 GLB/GLTF 加载 + 按名称关键字自动分层
        ├── Airflow.js          # 热风粒子气流（自定义 Shader 的 GPU 点精灵）
        └── DryerSystem.js      # 业务编排：透视/电源/脉动发热丝/风叶旋转/图层显隐
```

---

## 三、功能清单与实现对照

| 需求 | 实现方式 |
| --- | --- |
| 相机轨道控制：360° 旋转 / 滚轮缩放 / 平移 | `OrbitControls`（`Viewer.js`），左键旋转、滚轮缩放、右键平移，带阻尼 |
| 透视开关 | 外壳与手柄切换为 `opacity 0.22 / depthWrite:false` 的半透明 PBR 材质，内部结构保持实体 |
| 停机状态 | 发热丝 `emissiveIntensity → 0`、风叶惯性停转、粒子不再重生并自然消散 |
| 开机运转 | 发热丝暖红自发光（`#ff3c14`）正弦脉动 + `UnrealBloomPass` 辉光；出风口持续喷出热风粒子 |
| 六结构独立分层 | `shell / handle / bracket / coil / fan / outlet` 六个 Group，面板可单独显隐 |
| 侧边 UI 面板 | 透视开关、电源开关、辉光强度滑块、粒子风速滑块、分层复选框、GLB 地址加载 |
| 渲染配置 | 抗锯齿、PCF 软阴影、PBR（MeshStandardMaterial）、三点补光 + 环境/半球光、Bloom 后期链、浅灰背景 `#eef1f5` |

### 运转模拟细节

- **发热丝**：开机后自发光强度在 `2.2 ~ 2.6` 间以约 1 Hz 正弦脉动，超过 Bloom 阈值（0.72）的部分产生辉光；停机时强度平滑衰减到 0。
- **风叶**：7 叶挤出成型扇叶，开机后绕 Z 轴加速旋转，转速与风速滑块联动，停机带惯性减速。
- **热风粒子**：900 个加色混合的软粒子，从出风口圆盘随机出生，沿 +Z 前进并带螺旋扰动与径向扩散，亮度做淡入淡出包络；风速滑块调节喷射速度。
- **辉光滑块**：实时映射到 `UnrealBloomPass.strength`（0 ~ 2.5）。

---

## 四、在线加载 GLB 模型

### 方式 A：网络地址

在侧边面板「在线 GLB 模型」输入框粘贴完整 URL（`https://.../model.glb`），回车或点「加载模型」。

要求：

1. 资源服务器返回 **CORS 响应头**（`Access-Control-Allow-Origin`），否则浏览器会拦截；
2. 支持 `.glb` 与 `.gltf`，**DRACO 压缩**模型同样支持（解码器从 Google CDN 按需拉取）；
3. 加载失败会自动回退到内置程序化模型，并弹出提示。

> 项目不内置硬编码的第三方模型 URL（公共 CDN 上的资源地址易失效）。
> 可用的测试途径：把模型放到 GitHub Release / 对象存储（OSS、S3 等，开启 CORS），
> 或托管在 [Sketchfab](https://sketchfab.com/)（下载 GLB 后自行托管）。

### 方式 B：本地同源加载（无跨域问题）

把模型放到 `public/models/`，例如 `public/models/dryer.glb`，面板输入：

```
/models/dryer.glb
```

### 自动分层命名约定

加载器按 mesh 名称关键字（不区分大小写）归类，建议在建模软件中这样命名节点：

| 结构层 | 关键字 |
| --- | --- |
| 发热丝 | `coil` / `heating` / `heater` / `发热` |
| 风叶 | `fan` / `blade` / `impeller` / `风叶` |
| 出风口 | `outlet` / `nozzle` / `vent` / `出风口` |
| 内部支架 | `bracket` / `frame` / `motor` / `support` / `支架` |
| 手柄 | `handle` / `grip` / `手柄` |
| 外壳 | `shell` / `body` / `housing` / `barrel` / `外壳` |

- 发热丝 / 风叶 / 出风口网格会替换为项目受控材质，保证辉光与透视功能可用；
- 未命中关键字的网格归入「其他部件」；
- 模型加载后会**自动归一化尺寸、居中并适配相机取景**；
- 气流方向取模型 **+Z 轴**，出风口锚点优先取 outlet 层包围盒前端。

---

## 五、渲染管线说明

```
WebGLRenderer (antialias + PCFSoftShadowMap + ACESFilmicToneMapping + sRGB)
   └─ EffectComposer
        ├─ RenderPass        场景渲染
        ├─ UnrealBloomPass   辉光（strength 由 UI 实时控制，threshold 0.72）
        └─ OutputPass        色调映射 + sRGB 输出
```

灯光：环境光 + 半球光打底，主光（暖白、2048 阴影贴图）/ 冷色补光 / 轮廓背光组成三点布光；
地面使用 `ShadowMaterial` 只承接阴影，保持浅灰背景干净。

---

## 六、技术栈

- [three](https://www.npmjs.com/package/three) `^0.170.0` —— 3D 引擎，addons 经 `three/addons/*` 引入
- [vite](https://vitejs.dev/) `^5.4` —— 开发服务器与构建工具
- 原生 JavaScript（无前端框架）、原生 DOM 控制面板
