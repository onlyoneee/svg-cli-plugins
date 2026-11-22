# C 任务交接：`box` 图形与属性处理器

- 接收方：C · 图形与属性插件
- 提供方：A · CLI 内核与扩展机制
- 文档日期：2026-11-20
- 目标：C 在不硬编码内核的情况下接入 `box`、`fill` 和 `label`

## 1. 开始前

```bash
git pull origin main
npm run typecheck
npm test
```

请优先从 [`src/api/index.ts`](../api/index.ts) 导入公开类型和公开领域类。先阅读：

- [扩展点清单与属性事务 ADR](./extension-points-and-attribute-adr.md)
- [SVG 读回与降级 ADR](./adr-002-svg-read-fallback.md)
- [插件激活事务 ADR](./adr-003-plugin-activation-transaction.md)

不要直接依赖：

- `ShapeFactory` 内部实现。
- `SvgReader` 私有方法。
- `SetCommand` 或 `CommandHistory` 私有字段。
- 四个正式注册表。

## 2. A 已经提供的能力

A 已完成：

- `ShapeProvider` 创建和 SVG 读回接口。
- 按 `shapeType`、SVG 标签和 `serializedKind` 查询的注册表。
- `data-kind` 专用 provider 优先、缺失插件按 SVG 标签降级。
- 新增子树的全局 ID 冲突检查。
- `AttributeHandler` 查询和冲突拒绝。
- `AttributeHandlerContext` 的只读查询和受控属性写入。
- 不使用文档快照的增量属性事务。
- 一次 `set` 一个 undo 单元。
- 处理器部分失败的逆序回滚。
- 插件四类贡献的原子注册与 manifest 校验。

Phase 1 六种图形已经作为内置 `ShapeProvider` 注册。

## 3. `box` 的目标语义

创建命令：

```text
create box n1 120 100 160 60 "开始"
```

逻辑结构：

```text
box#n1
├── rect#n1-rect
└── text#n1-label
```

基本要求：

- `box` 是容器。
- 支持 `in <containerId>`。
- 整体移动和缩放时，矩形与文字一起变化。
- 可以嵌套在普通 `g` 或其他允许的容器中。
- 自身可以作为更大组合的子节点。
- `ungroup n1` 必须拒绝。
- 必要子部件不能被普通命令删除或移走。
- 创建失败不能留下容器或任一子部件。

## 4. `ShapeProvider` 契约

接口位于 [`src/api/ShapeProvider.ts`](../api/ShapeProvider.ts)：

```ts
interface ShapeProvider {
  readonly name: string;
  readonly shapeType: string;
  readonly svgTag: string;
  readonly serializedKind?: string;

  create(request: ShapeCreateRequest, context: ShapeProviderContext): Shape;
  read(request: ShapeReadRequest, context: ShapeProviderContext): Shape;
}
```

`box` 建议声明：

```ts
readonly name = "box";
readonly shapeType = "box";
readonly svgTag = "g";
readonly serializedKind = "box";
```

注册：

```ts
context.shapes.register(new BoxShapeProvider());
```

## 5. 创建契约

`ShapeCreateRequest` 提供：

```ts
request.id
request.parameters
request.containerId
```

Provider 应完成：

1. 参数数量检查。
2. `x/y/width/height` 数值检查。
3. 宽高等领域边界检查。
4. 计算派生 ID：`<id>-rect`、`<id>-label`。
5. 在返回前构造完整子树。
6. 不直接把半成品插入文档。

Provider 返回完整子树后，A 的 `SvgDocument.add()` 会检查整个子树与文档已有 ID 的冲突。任何冲突都会使 `CreateCommand` 失败且不进入 undo 栈。

推荐创建结果文案需要与题目一致：

```text
box#n1 created (g#n1 + rect#n1-rect + text#n1-label)
```

如果现有通用 `CreateCommand` 无法生成该文案，请先和 A 协商通用结果格式钩子，不要在命令内核中判断 `box`。

## 6. 序列化与读回

序列化必须包含：

```xml
<g id="n1" data-kind="box">
```

`read()` 会收到已经递归读回的 `children`。C 必须校验：

- 必须存在 `n1-rect`，类型为矩形。
- 必须存在 `n1-label`，类型为文字。
- 子部件 ID 和关系符合约定。
- 不接受不完整的 `box` 对象。

错误策略：

```text
BoxShapeProvider 未安装
  → 内核按 <g> 降级为普通分组

BoxShapeProvider 已安装，但结构非法
  → read() 抛错，整个读取失败，不再降级
```

重复 ID 始终拒绝，不能靠降级解决。

## 7. `AttributeHandler` 契约

需要至少两个稳定名称的处理器：

```text
box-fill
box-label
```

接口位于 [`src/api/AttributeHandler.ts`](../api/AttributeHandler.ts)。

### 7.1 `handles()`

```ts
handles(target, attribute): boolean
```

要求：

- 只能判断，不能修改状态。
- 使用 `target.kind === "box"`，不要依赖内部类路径。
- `box-fill` 只匹配 `fill`。
- `box-label` 只匹配 `label`。

### 7.2 `apply()`

所有属性写入必须经过上下文：

```ts
context.setAttribute(`${id}-rect`, "fill", value);
context.setAttribute(`${id}-label`, "text", value);
```

不要取得可变图形后直接调用内部 setter。否则 A 无法记录 before/after，也无法完成 undo/redo 和失败回滚。

可以使用：

```ts
const oldLabel = context
  .requireShape(`${id}-label`)
  .getAttribute("text");
```

并返回领域文案：

```ts
return {
  executeMessage: `box#${id} label updated: "${value}"`,
  undoMessage: `box#${id} label restored: "${oldLabel}"`,
  redoMessage: `box#${id} label updated: "${value}"`,
};
```

`fill` 预期：

```text
box#n1 fill propagated to n1-rect
```

### 7.3 事务行为

- 一个处理器可记录多个子图形变化。
- 全部变化只形成一个 `SetCommand`。
- `undo` 逆序恢复全部 before。
- `redo` 正序恢复全部 after。
- 处理器中途抛错时，本次已记录变化全部逆序回滚。
- 失败操作不进入历史。
- 处理器返回但未记录任何变化会被视为违约。

## 8. 插件与 Manifest

```ts
class BoxPlugin implements Plugin {
  activate(context: PluginContext): void {
    context.shapes.register(new BoxShapeProvider());
    context.attributes.register(new BoxFillHandler());
    context.attributes.register(new BoxLabelHandler());
  }
}
```

Manifest：

```json
{
  "name": "box-plugin",
  "contributes": {
    "shapes": ["box"],
    "attributes": ["box-fill", "box-label"]
  }
}
```

三个贡献会作为一个注册事务提交。任一个注册失败，另外两个也不会残留。

## 9. C 必须覆盖的测试

- 正常创建及派生 ID。
- `in` 子句嵌套。
- 整体移动和缩放。
- 子树任一 ID 与已有文档冲突，创建整体失败。
- 保存包含 `data-kind="box"`。
- 安装插件后成功读回。
- 未安装插件时降级为普通 `g`。
- 插件存在但必要子部件缺失时拒绝。
- 子部件类型错误时拒绝。
- `set fill` 修改内部矩形。
- `set label` 修改内部文字。
- 每条 `set` 一次 undo/redo。
- 处理器部分失败时完整回滚。
- `ungroup box` 拒绝。
- 删除或移走必要子部件时保持 box 不变量。

## 10. 必须先和 A 协调的接口缺口

以下能力当前还没有最终通用契约，C 不应通过硬编码绕过：

### 10.1 容器类型

当前文档内部仍通过 `GroupShape` 识别容器，而普通 `GroupShape` 的类型和输出面向 `g`。C 在确定 `BoxShape` 继承结构前，应和 A 确认通用 `ContainerShape` 或容器能力接口。

### 10.2 `ungroup` 策略

当前普通分组允许 `ungroup`。需要通用能力表达“该容器不可解组”，不能在 `SvgDocument` 中写 `if (kind === "box")`。

### 10.3 必要子部件保护

当前普通命令可能删除、移动或重新分组内部子图形。需要通用不变量校验钩子或复合图形策略，保证 `n1-rect` 和 `n1-label` 不被破坏。

### 10.4 创建与移动输出

Phase 1 目标会话要求 `box#...` 领域输出。若当前 `Shape.type`/`summary()` 无法自然生成，必须先补通用领域接口，不能修改内置命令识别 box。

建议协作顺序：

1. C 向 A 提供 `BoxShape` 最小接口需求。
2. A 用独立提交补充通用容器/不变量钩子。
3. C rebase 最新 `main`。
4. C 的 box 接入提交只新增插件和装配，不修改内核及既有插件。

这样才能满足“接入 box 的提交对内核差异为 0”的验收要求。

## 11. 不允许的做法

- 在 `ShapeFactory` 中增加 `box` 分支。
- 在 `SvgReader` 中判断 `data-kind === "box"`。
- 在 `SetCommand` 中判断 `fill`/`label`/`box`。
- 直接操作 `CommandHistory`。
- 使用完整文档快照实现属性 undo/redo。
- 让处理器绕过 `AttributeHandlerContext` 修改子图形。
- 为了保护子部件在核心中硬编码具体 ID 后缀。

遇到接口不足时，请先向 A 提出具体不变量和调用场景。
