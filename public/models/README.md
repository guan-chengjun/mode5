# 本地模型资源目录

将自己的 `.glb` / `.gltf` 模型放到此目录后，可通过同源地址加载，不受跨域限制：

```
public/models/my-hairdryer.glb
```

运行 `npm run dev` 后，在侧边面板「在线 GLB 模型」输入框填入：

```
/models/my-hairdryer.glb
```

## 节点命名约定（自动分层）

加载器会按 mesh 名称关键字（不区分大小写）自动归入六个结构层，命名时包含对应关键字即可：

| 结构层 | 识别关键字 |
| --- | --- |
| 螺旋发热丝 coil | `coil`、`heating`、`heater`、`发热`、`电热` |
| 风叶 fan | `fan`、`blade`、`impeller`、`propeller`、`风叶`、`风扇` |
| 出风口 outlet | `outlet`、`nozzle`、`vent`、`出风口`、`喷嘴` |
| 内部支架 bracket | `bracket`、`frame`、`mount`、`motor`、`support`、`支架`、`电机` |
| 手柄 handle | `handle`、`grip`、`手柄`、`握把` |
| 外壳 shell | `shell`、`body`、`case`、`housing`、`barrel`、`外壳`、`筒` |

未命中关键字的网格会归入「其他部件」。建议模型：

- 出风口朝向 **+Z 轴**（粒子气流沿 +Z 发射）；
- 发热丝节点使用 `coil` 命名，会自动替换为受控的暖红自发光材质；
- DRACO 压缩模型同样支持（解码器从 Google CDN 按需加载）。
