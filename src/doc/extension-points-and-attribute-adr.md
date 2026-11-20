# CLI 扩展点清单与属性事务 ADR

- 文档状态：已接受（Accepted）
- 对应阶段：Phase 2 / A · CLI 内核与扩展机制
- 最后更新：2026-11-20
- 适用范围：`Command`、`ShapeProvider`、`AttributeHandler`、`TreeDecorator` 及插件注册事务

## 1. 文档目的

本文档用于说明 CLI 内核开放的四个扩展点及其调用契约，并记录属性处理器的冲突处理、撤销/重做和失败回滚决策。文档中的类名、调用位置和错误文本均对应当前代码，可用于代码审查和 Phase 2 验收。

内核只负责注册、查询、分发和事务控制；具体命令、图形、属性语义及树标签由实现扩展接口的对象提供。

```text
插件实现
   │ register
   ▼
四类注册表
   │ lookup / list
   ▼
内核调用点
   │ invoke
   ▼
Command / ShapeProvider / AttributeHandler / TreeDecorator
```

## 2. 扩展点总览

| 接口 | 职责 | 内核调用位置 | 当前实现 | 未安装可选插件时的缺省行为 | 主要违约处理 |
|---|---|---|---|---|---|
| `Command` | 定义命令名、帮助文本、文档依赖和执行逻辑 | `CommandDispatcher.dispatch()` | Phase 1 的 19 个内置命令；测试用 `stats` 等命令 | 内置命令继续可用；未注册命令返回 `error: unknown command: <name>` | 空名称、缺少 help、重复名称或执行异常均报告错误 |
| `ShapeProvider` | 创建一种图形，并从 SVG 元素读回该图形 | `ShapeFactory.create()`、`ShapeFactory.createFromSvg()` | `rect`、`circle`、`ellipse`、`line`、`text`、`g` 六个内置 provider | 六种 Phase 1 图形始终由默认装配提供；未知创建类型报错；未知 `data-kind` 读回时按 SVG 标签降级 | 注册键冲突、未知类型、provider 创建/读回异常均报告错误，失败图形不加入文档 |
| `AttributeHandler` | 为特定图形和属性定义领域语义 | `SetCommand.apply()` | 当前有事务、冲突和失败测试处理器；生产环境的 `box-fill`、`box-label` 由 C 任务提供 | 没有处理器命中时调用 Phase 1 的 `Shape.setAttribute()` | 多处理器冲突、无变更处理器及执行异常均失败；已产生的增量变化被回滚 |
| `TreeDecorator` | 为 `tree` 输出的画布行或图形行追加标签 | `TreeRenderer.decorate()` | 当前有标签顺序、空标签和失败测试装饰器；`modified-star`、`box-type-label` 由 D 任务提供 | 没有装饰器时输出与 Phase 1 逐字一致 | 重复名称、包含换行的标签或装饰器异常均报告错误；文档和历史不受影响 |

## 3. `Command` 扩展点

### 3.1 接口与注册

- 接口：[`src/api/Command.ts`](../api/Command.ts)
- 注册入口：[`src/api/CommandRegistration.ts`](../api/CommandRegistration.ts)
- 注册表：[`src/core/registries/CommandRegistry.ts`](../core/registries/CommandRegistry.ts)
- 分发器：[`src/core/commands/CommandDispatcher.ts`](../core/commands/CommandDispatcher.ts)

每个命令必须声明：

```ts
interface Command {
  readonly name: string;
  readonly helpLines: readonly string[];
  readonly requiresDocument: boolean;
  execute(arguments_: readonly string[], context: CommandContext): string;
}
```

命令名按去除首尾空白后的小写形式注册和查询，因此命令查询不区分大小写。注册顺序会保留，用于生成稳定的 `help` 输出。

### 3.2 内核调用流程

```text
CLI 分词
  → CommandDispatcher.dispatch(name, arguments)
  → CommandRegistry.get(name)
  → 检查 requiresDocument
  → Command.execute(arguments, context)
```

`CommandContext` 只向命令公开文档视图、工作目录、可撤销操作执行入口和 I/O 边界，不要求插件访问 `CliApplication` 的私有字段。

### 3.3 当前实现与缺省行为

内置实现位于 [`src/builtins/commands/BuiltinCliCommands.ts`](../builtins/commands/BuiltinCliCommands.ts)，提供 Phase 1 的 19 条命令。它们由 `BuiltinCommandsPlugin` 注册，因此默认启动时行为保持不变。

没有找到命令时：

```text
error: unknown command: <name>
```

### 3.4 违约处理

- 空命令名：`error: invalid registration: commands/<empty>`。
- 没有非空帮助文本：`error: invalid registration: commands/<name> (help is required)`。
- 重复命令名：`error: duplicate registration: commands/<name>`。
- 声明 `requiresDocument=true` 但当前没有文档：返回 Phase 1 的无文档错误。
- `execute()` 抛出的异常由 CLI 统一转换成 `error: <reason>`。

## 4. `ShapeProvider` 扩展点

### 4.1 接口与注册

- 接口：[`src/api/ShapeProvider.ts`](../api/ShapeProvider.ts)
- 注册表：[`src/core/registries/ShapeProviderRegistry.ts`](../core/registries/ShapeProviderRegistry.ts)
- 创建与读回分发：[`src/model/ShapeFactory.ts`](../model/ShapeFactory.ts)
- 内置实现：[`src/builtins/shapes/BuiltinShapeProviders.ts`](../builtins/shapes/BuiltinShapeProviders.ts)

Provider 同时负责两条路径：

1. `create`：根据 CLI 参数创建新图形。
2. `read`：根据只读 SVG 元素视图和已读回子图形构造图形。

### 4.2 创建调用流程

```text
create <type> ...
  → CreateCommand
  → ShapeFactory.create(type, ...)
  → ShapeProviderRegistry.findByShapeType(type)
  → ShapeProvider.create(request, context)
  → SvgDocument.add(shape)
```

Provider 返回图形后，文档统一检查整棵新增子树的 ID。任何 ID 冲突都会使整条创建命令失败，不留下部分子树。

### 4.3 SVG 读回与降级

读回时先检查 SVG 元素的 `data-kind`：

```text
有 data-kind 且对应 provider 已注册
  → 使用专用 provider

没有对应专用 provider
  → 根据 rect / circle / g 等 SVG 标签使用默认 provider
```

例如未安装 `box` 插件时：

```xml
<g id="n1" data-kind="box">...</g>
```

会由默认 `g` provider 读成普通分组，而不是使整个框架无法启动。重复 ID 仍然必须拒绝，不能通过降级消除。

### 4.4 当前实现与缺省行为

默认装配注册：`rect`、`circle`、`ellipse`、`line`、`text`、`g`。因此禁用 Phase 2 可选插件后，Phase 1 的六种图形仍可创建、保存和读回。

CLI 创建未知类型时：

```text
error: unknown shape type: <type> (is the plugin loaded?)
```

### 4.5 违约处理

- provider 名称、`shapeType` 或 `svgTag` 为空：拒绝注册。
- 名称、图形类型、默认 SVG 标签或 `serializedKind` 冲突：`error: duplicate registration: shapes/<key>`。
- `create()` 或 `read()` 抛错：当前创建/读回失败，文档不接收不完整图形。
- 非容器 provider 收到子图形时，应明确拒绝；内置叶子 provider 返回 `invalid SVG` 错误。

## 5. `AttributeHandler` 扩展点

### 5.1 接口与调用位置

- 接口：[`src/api/AttributeHandler.ts`](../api/AttributeHandler.ts)
- 公开上下文：[`src/api/AttributeHandlerContext.ts`](../api/AttributeHandlerContext.ts)
- 注册表：[`src/core/registries/AttributeHandlerRegistry.ts`](../core/registries/AttributeHandlerRegistry.ts)
- 分发位置：[`src/commands/SetCommand.ts`](../commands/SetCommand.ts)
- 增量事务：[`src/core/attributes/AttributeTransaction.ts`](../core/attributes/AttributeTransaction.ts)

### 5.2 分发规则

执行 `set <id> <attr> <value>` 时：

```text
0 个处理器命中
  → 使用 Phase 1 的默认 Shape.setAttribute()

1 个处理器命中
  → 调用该处理器

2 个或更多处理器命中
  → 拒绝执行，不选择“第一个”
```

冲突错误：

```text
error: conflicting attribute handlers: <handler-a>, <handler-b>
```

处理器只能通过 `AttributeHandlerContext.requireShape()` 读取只读图形，并通过 `setAttribute()` 提交受事务控制的修改。

### 5.3 缺省行为

没有处理器命中时，普通图形的 Phase 1 属性仍然可修改，例如：

```text
set r1 fill red
set r1 x 100
set c1 r 30
set t1 text "hello"
```

未定义属性仍按 Phase 1 规则报告 `error: unknown attribute: <attr>`。

### 5.4 违约处理

- 处理器名称重复：`error: duplicate registration: attributes/<name>`。
- 多处理器同时命中：在任何处理器执行前拒绝。
- 处理器返回但没有通过上下文记录变化：`error: attribute handler made no changes: <name>`。
- 处理器修改部分属性后抛错：逆序恢复本次已记录变化，失败命令不进入历史。

## 6. `TreeDecorator` 扩展点

### 6.1 接口与调用位置

- 接口：[`src/api/TreeDecorator.ts`](../api/TreeDecorator.ts)
- 节点视图：[`src/api/TreeNodeView.ts`](../api/TreeNodeView.ts)
- 只读上下文：[`src/api/TreeDecorationContext.ts`](../api/TreeDecorationContext.ts)
- 注册表：[`src/core/registries/TreeDecoratorRegistry.ts`](../core/registries/TreeDecoratorRegistry.ts)
- 调用位置：[`src/core/trees/TreeRenderer.ts`](../core/trees/TreeRenderer.ts)

### 6.2 标签组合规则

每个装饰器看到相同的未装饰基础节点，不读取其他装饰器的结果。返回的非空标签按注册顺序排列，并使用一个空格连接：

```text
基础摘要 + " " + 标签1 + " " + 标签2
```

例如：

```text
g#n1 (box) *
```

若没有装饰器或全部返回空标签，则只输出基础摘要，保证 Phase 1 基线逐字不变。

### 6.3 违约处理

- 装饰器名称重复：`error: duplicate registration: decorators/<name>`。
- 返回 `undefined`、空字符串或纯空白：忽略该标签。
- 标签包含换行：`error: invalid tree decoration: <name>`。
- `decorate()` 抛错：当前 `tree` 命令失败；因为上下文只读，文档和 undo/redo 历史保持不变。

## 7. 插件注册事务

- 实现：[`src/core/plugins/PluginActivationManager.ts`](../core/plugins/PluginActivationManager.ts)
- 四个正式注册表通过 `DefaultPluginContext` 提供。

所有内置插件和可选插件经过同一流程：

```text
activate(stagedContext)
  → 校验暂存注册
  → 校验 manifest
  → 保存四个正式注册表检查点
  → 提交 shapes / commands / decorators / attributes
  → 任一步失败则恢复全部检查点
```

注册表检查点只包含扩展对象映射，不包含 SVG 文档，也不属于文档 undo/redo 快照。

主要错误：

- 重复注册：`error: duplicate registration: <category>/<name>`。
- manifest 不一致：`error: plugin manifest mismatch: <name> (declared: …; registered: …)`。
- 激活异常：`error: plugin failed to activate: <name> (<reason>)`。

批量激活会保留已经成功的插件，拒绝当前失败插件，并继续处理后续插件。

---

# ADR-001：属性处理器采用增量变更日志

## 状态

已接受（Accepted）。

## 背景

Phase 2 的复合图形属性可能修改多个内部子图形。例如：

```text
set n1 fill red
```

可能实际修改 `n1-rect.fill`；一个更复杂的属性也可能同时修改矩形和文字。要求一条 `set` 只形成一个 undo 单元，并且处理器修改一部分后抛错时，文档和历史必须恢复到执行前状态。

同时，本项目明确不采用完整 `SvgDocument` 快照实现 undo/redo。

## 决策

### 1. 处理器命中规则

- 0 个处理器：执行 Phase 1 默认属性逻辑。
- 1 个处理器：由该处理器负责全部领域语义。
- 多个处理器：视为配置冲突，执行前拒绝。

选择“冲突即拒绝”，而不是“第一个获胜”，避免插件加载顺序静默改变属性语义。

### 2. 只记录最小增量

每次 `AttributeHandlerContext.setAttribute()` 记录：

```ts
interface AttributeChange {
  shapeId: string;
  attribute: string;
  before: string | undefined;
  after: string | undefined;
}
```

例如一次处理器调用修改两个子图形时，只保存：

```text
n1-rect   fill  blue → red
n1-label  text  old  → new
```

不保存、序列化或复制整个 `SvgDocument`。

### 3. 执行失败回滚

处理器产生的变化按执行顺序写入日志。如果后续修改或处理器本身抛错，则按相反顺序恢复每条记录的 `before` 值：

```text
apply change 1
apply change 2
change 3 throws
restore change 2
restore change 1
```

只有处理器完整成功且至少记录一项变化，`SetCommand` 才会被 `CommandHistory` 推入 undo 栈。

### 4. Undo/Redo

- `undo`：逆序恢复所有 `before`。
- `redo`：正序恢复所有 `after`。
- 一组变化始终属于同一个 `SetCommand`，因此只需要一次 `undo` 或 `redo`。
- undo/redo 重放失败时，事务会尽力恢复到重放前状态，`CommandHistory` 继续保留原来的栈位置。

### 5. 输出文案

处理器可以返回 `executeMessage`、`undoMessage` 和 `redoMessage`。这样 `box` 插件可以输出领域化文案，同时不要求 `SetCommand` 硬编码 `box`、`fill` 或 `label`。

## 被否决的方案

### 完整文档快照

否决原因：空间开销与文档大小相关；掩盖每条命令的真实逆操作；不符合本项目传统 Command 模式和“不使用文档快照”的约束。

### 第一个匹配处理器获胜

否决原因：结果依赖加载顺序；冲突可能长期不被发现；更换配置顺序可能静默改变行为。

### 允许处理器直接修改可变文档

否决原因：内核无法记录修改范围，也无法可靠完成一次性撤销和失败回滚；插件还会依赖内部实现。

## 结果与影响

优点：

- 内存开销与本次属性变化数量相关，而不是与文档大小相关。
- 复合属性仍然是一个 undo 单元。
- 失败处理器不会留下部分修改或污染历史。
- C 任务可以通过公开上下文实现 `box`，无需依赖 `CommandHistory` 或 `SetCommand` 内部字段。

代价：

- 所有可撤销属性写入必须经过 `AttributeHandlerContext.setAttribute()`。
- 新增非属性类复合修改时，需要定义对应的增量操作，而不能绕过事务直接修改。
- 属性必须能够通过 `getAttribute()` 读取，并通过 `restoreAttribute()` 恢复。

## 不变量

1. 处理器的 `handles()` 不得修改状态。
2. 处理器命中后不得绕过上下文进行未记录的属性写入。
3. 成功的处理器至少记录一项属性变化。
4. 一次 `set` 对应一个 `SetCommand` 和一个 undo 单元。
5. 失败的 `set` 不改变文档最终状态，也不改变 undo/redo 历史。
6. Undo/redo 只保存和重放增量记录，不保存文档快照。

## 验证证据

- Phase 1 基线：[`tests/Phase1Regression.test.ts`](../../tests/Phase1Regression.test.ts)
- 属性事务：[`tests/AttributeHandlerIntegration.test.ts`](../../tests/AttributeHandlerIntegration.test.ts)
- ShapeProvider 接入：[`tests/ShapeProviderIntegration.test.ts`](../../tests/ShapeProviderIntegration.test.ts)
- TreeDecorator 接入：[`tests/TreeDecoratorIntegration.test.ts`](../../tests/TreeDecoratorIntegration.test.ts)
- 插件激活事务：[`tests/PluginActivationManager.test.ts`](../../tests/PluginActivationManager.test.ts)

运行验证：

```bash
npm run typecheck
npm test
```

当前完整测试基线为 47 项全部通过。
