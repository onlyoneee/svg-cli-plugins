# ADR-002：SVG 专用图形读回与缺失插件降级

- 状态：已接受（Accepted）
- 日期：2026-11-20
- 决策范围：`ShapeProvider` 的 SVG 读回、`data-kind` 分发和缺失插件时的降级

## 背景

插件图形不一定对应独立的标准 SVG 标签。以 C 任务的 `box` 为例，它在 SVG 中表现为一个 `<g>`，但领域语义不同于普通分组：

```xml
<g id="n1" data-kind="box">
  <rect id="n1-rect" .../>
  <text id="n1-label" ...>开始</text>
</g>
```

如果只根据标签名 `<g>` 读回，内核无法判断它是普通分组还是 `box`。如果在内核中增加 `if (dataKind === "box")`，新增每一种插件图形都会要求修改内核，违反开闭原则。

同时，用户可能在没有安装原插件的环境中打开 SVG。框架需要在“保留可读性”和“发现损坏数据”之间建立明确边界。

## 决策

### 1. `data-kind` 作为专用 provider 的分发键

`ShapeProvider` 可以声明：

```ts
readonly svgTag: string;
readonly serializedKind?: string;
```

- `svgTag` 表示实际 SVG 标签，例如 `g`。
- `serializedKind` 表示插件领域类型，例如 `box`。
- 内置普通 SVG 图形不声明 `serializedKind`，作为相应标签的默认 provider。

注册表分别维护默认 SVG 标签和专用 kind 的索引，内核不枚举任何具体插件名称。

### 2. 查找顺序为“专用优先，标签降级”

[`ShapeProviderRegistry.findForRead()`](../core/registries/ShapeProviderRegistry.ts) 使用以下规则：

```text
读取 svgTag 和 data-kind
  ↓
data-kind 是否有已注册的专用 provider？
  ├── 是：返回专用 provider
  └── 否：按 svgTag 返回默认 provider
```

对应行为矩阵：

| 输入 | 已注册 provider | 结果 |
|---|---|---|
| `<rect ...>` | 默认 `rect` | 读回为内置矩形 |
| `<rect data-kind="square" ...>` | `square` 已安装 | 由 `square` provider 读回 |
| `<rect data-kind="square" ...>` | `square` 未安装 | 降级为普通 `rect` |
| `<g data-kind="box">...</g>` | `box` 已安装 | 由 `box` provider 校验并读回 |
| `<g data-kind="box">...</g>` | `box` 未安装 | 降级为普通 `g` |
| `<unknown ...>` | 没有默认 provider | 返回未知图形类型错误 |

### 3. “插件不存在”与“插件存在但数据非法”必须区分

只有找不到专用 provider 时才允许按 SVG 标签降级。

如果已经找到专用 provider，但它在 `read()` 中发现必要子部件缺失、类型错误或其他不变量被破坏，则必须拒绝本次读取，不能捕获错误后再次降级。原因是：

- 插件已安装，说明框架知道该类型的完整契约。
- provider 校验失败代表文件数据损坏，而不是能力缺失。
- 静默降级会掩盖错误，并可能在后续保存时永久丢失领域语义。

因此规则为：

```text
插件缺失       → 可以降级
插件存在但非法 → 明确报错
```

### 4. 重复 ID 始终拒绝

[`SvgReader`](../persistence/SvgReader.ts) 在构造图形前收集显式 ID，并在文档插入阶段检查整个子树。重复 ID 违反全局唯一性，不能通过 provider 降级消除。

任何显式 ID 重复或新增子树内部 ID 冲突都使整个读取失败。

### 5. 读取失败不替换当前文档

`read` 先在临时的新 `SvgDocument` 中构造全部图形；只有 `SvgReader.read()` 完整成功，`ReadCliCommand` 才调用 `replaceDocument()`。

因此 provider 读回失败、必要属性缺失或重复 ID 时，CLI 原有文档保持不变。

### 6. 降级后的语义边界

降级对象按照默认 SVG provider 的普通图形语义工作。例如未知 `box` 降级成普通 `g` 后：

- 子图形仍然可见和可遍历。
- 普通容器操作仍可使用。
- `box` 专用属性和不变量不再可用。
- 当前实现不承诺在再次保存时保留未知插件的 `data-kind` 元数据。

如果产品以后要求“缺少插件时无损往返”，需要另行引入未知扩展元数据保留机制，不能让普通 `g` 假装具备 `box` 语义。

## 被否决的方案

### 方案 A：未知 `data-kind` 一律报错

否决原因：没有插件时连基础 SVG 结构也无法打开，违背缺失可选插件时仍保持基础能力的要求。

### 方案 B：在 `SvgReader` 中硬编码 `box` 等名称

否决原因：每增加一种插件图形都要修改内核；解析器依赖具体插件实现。

### 方案 C：专用 provider 失败后自动降级

否决原因：会把数据损坏误判为插件缺失，掩盖不变量错误，并可能产生表面可用但语义不完整的对象。

### 方案 D：读取过程中直接替换当前文档

否决原因：中途失败会留下半构造文档，破坏 `read` 的原子性。

## 结果与影响

优点：

- 新图形通过注册 provider 接入，无需修改内核分支。
- 缺少可选插件时仍可读取标准 SVG 结构。
- 插件存在时由插件自己验证领域不变量。
- 失败读取不会破坏当前会话文档。

代价：

- 普通标签的默认 provider 与专用 `serializedKind` 必须避免注册冲突。
- 降级后只保留基础 SVG 语义，不保证插件语义和未知元数据无损往返。
- provider 必须明确验证自己的必要子部件和类型关系。

## 不变量

1. 内核不按 `box`、`square` 等具体名称分支。
2. 专用 provider 优先于默认 SVG 标签 provider。
3. 只有专用 provider 缺失时才允许降级。
4. 专用 provider 已找到但读回失败时，不再尝试默认 provider。
5. 重复 ID 始终拒绝。
6. 读取完整成功前不替换当前文档。

## 代码与测试证据

- 分发入口：[`ShapeFactory.createFromSvg()`](../model/ShapeFactory.ts)
- 查找策略：[`ShapeProviderRegistry.findForRead()`](../core/registries/ShapeProviderRegistry.ts)
- 文档构造：[`SvgReader`](../persistence/SvgReader.ts)
- 专用读回及降级测试：[`ShapeProviderIntegration.test.ts`](../../tests/ShapeProviderIntegration.test.ts)
- 读取原子性与重复 ID：[`SvgPersistence.test.ts`](../../tests/SvgPersistence.test.ts)

> 注：文中的 `box` 用于说明 C 任务的预期接入方式；当前 A 任务只提供通用机制，不包含 `box` 的生产实现。
