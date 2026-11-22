# D 任务交接：树标签与配置加载器

- 接收方：D · 树标签与插件加载器
- 提供方：A · CLI 内核与扩展机制
- 文档日期：2026-11-20
- 目标：D 实现 `modified-star`、`box-type-label` 和配置装配

## 1. 开始前

```bash
git pull origin main
npm run typecheck
npm test
```

请先阅读：

- [扩展点清单](./extension-points-and-attribute-adr.md)
- [插件激活事务 ADR](./adr-003-plugin-activation-transaction.md)
- [重构后依赖图](./architecture-diagrams.md)

插件只依赖 [`src/api/index.ts`](../api/index.ts) 中的公开接口。配置加载器属于组合/装配层，可以调用 `PluginActivationManager`，但不能复制另一套注册和回滚逻辑。

## 2. A 已经提供的能力

A 已完成：

- `TreeDecorator`、`TreeNodeView`、`TreeDecorationContext`。
- `TreeDecoratorRegistry` 和稳定注册顺序。
- `TreeRenderer` 的每行调用机制。
- 空标签忽略、多标签单空格拼接。
- 标签包含换行时的契约错误。
- 装饰器异常不修改文档和 undo/redo。
- 无装饰器时 Phase 1 `tree` 输出逐字不变。
- `PluginActivationManager` 同步/异步入口。
- 插件暂存、manifest 集合校验、跨注册表原子提交和回滚。
- 一个插件失败后继续加载后续插件。
- `options` 传递和 CLI 启动错误收集。

## 3. `TreeDecorator` 契约

接口：

```ts
interface TreeDecorator {
  readonly name: string;

  decorate(
    node: TreeNodeView,
    context: TreeDecorationContext,
  ): string | undefined;
}
```

节点视图：

```ts
interface TreeNodeView {
  readonly kind: "canvas" | "shape";
  readonly shape: ReadonlyShape | null;
  readonly summary: string;
}
```

只读上下文：

```ts
interface TreeDecorationContext {
  readonly document: ReadonlyDocument;
}
```

规则：

1. 每个装饰器看到同一份未装饰 `summary`。
2. 装饰器不能读取前一个装饰器的输出。
3. 返回 `undefined`、空字符串或纯空白时忽略。
4. 标签不得包含 `\r`/`\n`。
5. 标签按注册顺序拼接，每个标签之间一个空格。
6. `decorate()` 不得修改文档。
7. 插件状态必须保存在装饰器实例字段中，不能使用模块级全局变量。

## 4. `box-type-label` 实现

建议名称：

```ts
readonly name = "box-type-label";
```

判断使用公开 `kind`：

```ts
decorate(node: TreeNodeView): string | undefined {
  return node.shape?.kind === "box" ? "(box)" : undefined;
}
```

不要：

- 导入 C 的具体 `BoxShape` 后使用 `instanceof`。
- 根据 ID 后缀推断 box。
- 修改 `TreeRenderer` 添加 box 分支。

## 5. `modified-star` 语义必须先确定

题目要求在 ADR 中明确三个决策：

### 5.1 Dirty 定义

选择之一：

1. 内容是否与上次保存点不同：undo 回保存点后 `*` 消失。
2. 是否发生过编辑命令：undo 后也可能保留 `*`。

推荐选择第 1 种，因为它更符合“modified”含义，但需要可观察的 revision/savepoint。

### 5.2 祖先传播

当子图形变化时，决定父 `g` 和根 SVG 是否也显示 `*`。建议在 ADR 中明确：

- 只标直接变化节点；或
- 标变化节点及全部祖先。

示例图通常更适合“向祖先传播”，但最终由小组统一。

### 5.3 多标签顺序

顺序由注册顺序决定。例如先注册 box 标签再注册 star：

```text
g#n1 (box) *
```

## 6. `modified-star` 当前接口缺口

当前 `TreeDecorationContext` 只提供只读文档。它不足以可靠知道：

- 哪条编辑命令刚成功。
- 哪些 shape ID 被修改。
- 何时保存成功。
- undo/redo 后是否回到保存点。
- 子节点变化是否影响祖先。

因此 D 不要通过以下方式绕过：

- 读取 `CommandHistory` 私有栈。
- monkey patch 命令。
- 比较整份 SVG 快照。
- 使用模块级 dirty 集合。

D 应先向 A 提供需要观察的事件清单。A 再设计通用、与具体标签无关的事件或 revision/savepoint 接口，例如：

```text
edit committed
undo committed
redo committed
save committed
document replaced
```

事件设计应服务所有状态型插件，不能命名为 `modified-star` 专用接口。

## 7. 树标签插件注册

```ts
class TreeLabelPlugin implements Plugin {
  activate(context: PluginContext): void {
    context.decorators.register(new BoxTypeLabelDecorator());
    context.decorators.register(new ModifiedStarDecorator(...));
  }
}
```

Manifest：

```json
{
  "name": "tree-label-plugins",
  "contributes": {
    "decorators": ["box-type-label", "modified-star"]
  }
}
```

## 8. 配置加载器职责

D 负责 `plugins.config.json` 和动态模块加载，加载器应位于组合/装配层，不属于扩展内核。

配置示例：

```json
{
  "plugins": [
    { "module": "@svgframe/plugin-shape-box" },
    { "module": "./plugins/tree-star" },
    {
      "module": "@svgframe/plugin-shape-diamond",
      "options": { "fill": "#f5a623" }
    },
    {
      "module": "@svgframe/plugin-export-png",
      "enabled": false
    }
  ]
}
```

### 8.1 配置规则

- `plugins` 必须是数组。
- 按数组顺序加载。
- `enabled: false` 完全跳过，不导入模块。
- 相对路径以配置文件所在目录为基准。
- 包名按 Node.js 模块解析规则解析。
- `options` 原样传给插件。
- 配置不合法时输出 `error: invalid plugin config`，然后以内置能力启动。

### 8.2 模块加载规则

每个模块需要：

1. 动态解析和导入。
2. 检查默认导出。
3. 读取插件 manifest。
4. 构造 `{ plugin, manifest, options }`。
5. 调用 `PluginActivationManager.activate()`。

不得：

- 硬编码具体插件 import。
- 维护插件名称到模块的映射表。
- 使用 `switch` 判断 box/stats/tree-star。
- 直接调用 `plugin.activate(liveContext)`。

## 9. 错误格式

加载器负责：

| 情况 | 输出 |
|---|---|
| 顶层模块找不到 | `error: plugin not found: <module>` |
| 没有默认导出 | `error: plugin has no default export: <module>` |
| 配置语法/结构错误 | `error: invalid plugin config` |

`PluginActivationManager` 已负责：

| 情况 | 输出 |
|---|---|
| Manifest 不一致 | `error: plugin manifest mismatch: <name> (...)` |
| 激活抛错 | `error: plugin failed to activate: <name> (<reason>)` |
| 重复注册 | `error: duplicate registration: <category>/<name>` |

注意区分：

- 目标模块路径本身不存在。
- 目标模块存在，但模块求值或它的依赖失败。

后者属于插件加载/激活失败，不能误报为顶层模块不存在。

## 10. 代码装配与配置装配一致性

代码装配：

```ts
new CliApplication([
  { plugin, manifest, options },
]);
```

配置装配：

```text
read config
→ dynamic import
→ obtain plugin/manifest/options
→ PluginActivationManager.activate(...)
```

两条路径必须使用：

- 同一个插件实现。
- 同一个 manifest。
- 同一个 options。
- 同一个注册和校验管理器。

相同输入会话的输出必须逐字一致。

## 11. D 必须提供的测试

### TreeDecorator

- 无标签时基线不变。
- `(box)` 只出现在 box。
- `modified-star` 状态机。
- 两个标签并存且顺序稳定。
- 空标签忽略。
- 装饰器异常不改变文档和历史。
- 状态存储在实例中，不同 CLI 会话不串状态。

### 配置加载器

- 配置语法和结构错误。
- 模块找不到。
- 无默认导出。
- 模块存在但求值失败。
- Manifest 不一致。
- activate 抛错。
- 插件内部重复注册。
- 与已有插件重复。
- 当前插件回滚后继续下一个插件。
- `enabled: false` 不导入。
- 相对路径基准正确。
- options 正确传递。
- 配置顺序决定标签和插件顺序。

### 双装配一致性

- Phase 1 基础会话。
- B 的 `stats`/`dir` 会话。
- C 的 `box` 会话。
- 使用固定临时目录验证 `dir`，日志写到目录外。

## 12. 不允许的做法

- 在 `TreeRenderer` 中硬编码 `*` 或 `(box)`。
- 装饰器修改文档。
- 使用模块级变量保存 dirty 状态。
- 配置加载器硬编码插件包名。
- 绕过 `PluginActivationManager`。
- 因一个可选插件失败而终止整个 CLI。
- 为 dirty 检测保存整份 SVG 文档快照。

遇到 dirty 事件接口不足时，请先向 A 提出事件和状态需求，再共同确定公开契约。
