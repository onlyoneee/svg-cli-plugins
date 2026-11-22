# ADR-003：插件激活的暂存、校验与原子提交

- 状态：已接受（Accepted）
- 日期：2026-11-20
- 决策范围：代码装配与配置装配共用的插件注册事务

## 背景

一个插件可以同时贡献四类扩展：

```text
commands
shapes
decorators
attributes
```

如果 `plugin.activate()` 直接写入正式注册表，插件可能注册若干扩展后抛错，从而留下“半安装”状态。例如命令已经可见，但对应图形或属性处理器不存在。

配置加载还要求校验 `package.json` 中的 `contributes` 声明。如果在校验前已经写入正式注册表，manifest 不一致也会污染正在运行的框架。

代码装配与配置装配必须使用相同注册路径，差别只能是由谁实例化插件和提供 manifest/options。

## 决策

### 1. 所有插件先在独立暂存上下文中激活

[`PluginActivationManager`](../core/plugins/PluginActivationManager.ts) 为每次激活创建四个空的临时注册表，并构造一个 `DefaultPluginContext`：

```text
staged CommandRegistry
staged ShapeProviderRegistry
staged TreeDecoratorRegistry
staged AttributeHandlerRegistry
```

插件收到的 `context` 只连接这些暂存注册表，因此激活期间不会接触正式注册表。

### 2. 暂存阶段先执行注册表自身校验

暂存注册仍使用正式注册表类，因此会执行相同的名称规范化和契约检查：

- 空名称拒绝。
- 插件内部重复名称拒绝。
- 命令缺少 help 拒绝。
- 图形 provider 的 name、shapeType、svgTag、serializedKind 冲突拒绝。

暂存失败时直接丢弃整个暂存上下文，不需要从正式注册表删除任何内容。

### 3. Manifest 按类别和名称集合校验

激活成功后，将实际暂存结果与 `PluginManifest.contributes` 比较：

```text
shapes
commands
decorators
attributes
```

比较规则：

- 名称去除首尾空白并转成小写。
- 类别内按集合比较，不依赖声明顺序。
- 缺省类别视为空集合。
- 声明多于、少于或名称不同都属于不一致。

不一致时：

```text
error: plugin manifest mismatch: <name> (declared: …; registered: …)
```

并丢弃当前插件全部暂存内容。

### 4. 提交前保存四个正式注册表检查点

Manifest 校验通过后，管理器保存四个正式注册表的映射检查点，再按固定类别顺序提交：

```text
shapes → commands → decorators → attributes
```

检查点只复制注册表中的键到扩展对象映射：

- 不复制 SVG 文档。
- 不复制插件对象内部状态。
- 不属于文档 undo/redo 快照。

### 5. 任一提交失败时恢复全部注册表

暂存阶段只能发现插件内部冲突；提交阶段还可能发现与此前成功插件的冲突。

如果任一正式注册表拒绝提交，管理器恢复四个检查点。即使失败前已经提交了其他类别或同类别的部分扩展，也不会留下当前插件的任何注册。

此前成功插件保留不变。

### 6. 批量加载按输入顺序继续

`activateAllSync()` 和 `activateAll()` 按请求数组顺序逐个加载：

```text
插件 A 成功 → 保留
插件 B 失败 → 回滚 B，记录错误
插件 C 成功 → 继续提交
```

批量结果分别返回成功回执和 `error:` 开头的错误列表。CLI 启动入口输出错误后继续运行。

### 7. 同时提供同步和异步入口

- `activateSync()`：用于当前代码装配和同步内置插件。
- `activate()`：用于 D 任务通过动态 `import()` 得到的异步插件。
- 两者共用暂存、manifest 校验和提交逻辑。
- `options` 原样传递给 `plugin.activate(context, options)`。

如果同步入口收到 Promise，会拒绝该次激活并提示使用异步入口；它产生的注册仍只可能进入已经脱离正式环境的暂存上下文。

### 8. 模块发现错误不属于本事务

以下职责由 D 任务的配置加载器负责：

- 读取和校验 `plugins.config.json`。
- 解析相对路径或包名。
- 区分顶层模块不存在与模块自身求值失败。
- 检查默认导出。
- 从插件包元数据读取 manifest。

加载器取得 `plugin + manifest + options` 后，必须调用 `PluginActivationManager`，不能绕过它直接注册。

## 错误分类

| 情况 | 错误格式 | 正式注册表结果 |
|---|---|---|
| 插件内部重复注册 | `error: duplicate registration: <category>/<name>` | 当前插件无残留 |
| 与已有插件重复 | `error: duplicate registration: <category>/<name>` | 恢复检查点，已有插件保留 |
| Manifest 不一致 | `error: plugin manifest mismatch: <name> (...)` | 当前插件无残留 |
| `activate()` 抛错 | `error: plugin failed to activate: <name> (<reason>)` | 当前插件无残留 |
| 一个批次中的插件失败 | 同上 | 继续处理后续插件 |

## 被否决的方案

### 方案 A：激活时直接写正式注册表，失败后逐项 unregister

否决原因：需要追踪每个插件写入的所有辅助索引；图形注册表具有多个索引，逐项删除容易遗漏；激活异常时插件可能只完成部分步骤。

### 方案 B：只在激活前检查 manifest 声明

否决原因：声明无法证明实际注册内容；只有激活完成后才能比较声明集合与真实集合。

### 方案 C：配置加载器自行维护另一套注册逻辑

否决原因：代码装配和配置装配可能产生不同校验、顺序和错误行为；测试结果无法互相代表。

### 方案 D：任一插件失败就终止 CLI

否决原因：一个可选插件故障不应取消 Phase 1 内置能力或此前成功插件。

## 结果与影响

优点：

- 插件注册具备跨四类注册表的原子性。
- 失败插件不会留下半安装能力。
- 代码装配和配置装配可以复用同一条安全路径。
- 先前成功插件和后续插件不受单个失败插件影响。
- 错误信息稳定，便于 CLI、测试和配置加载器复用。

代价：

- 每次激活需要四个临时注册表和四个浅映射检查点。
- 插件在 `activate()` 中对外部系统产生的副作用不受注册事务回滚；插件契约应避免在注册前执行不可逆外部操作。
- 动态模块解析、配置格式和默认导出检查仍需要 D 任务实现。

## 不变量

1. 插件激活期间不能直接访问正式注册表。
2. Manifest 校验发生在激活完成后、正式提交前。
3. 一个插件的四类贡献要么全部提交，要么全部不提交。
4. 当前插件失败不能移除此前成功插件。
5. 批量加载保持配置顺序，并在单个失败后继续。
6. 内置插件与可选插件经过同一个激活管理器。
7. 注册表检查点与 SVG 文档历史完全独立。

## 代码与测试证据

- 激活事务：[`PluginActivationManager`](../core/plugins/PluginActivationManager.ts)
- 正式上下文：[`DefaultPluginContext`](../core/plugins/DefaultPluginContext.ts)
- CLI 统一装配：[`CliApplication`](../cli/CliApplication.ts)
- 四个注册表：[`src/core/registries`](../core/registries/)
- 原子提交与继续加载测试：[`PluginActivationManager.test.ts`](../../tests/PluginActivationManager.test.ts)

> 注：本文档定义并实现的是安全注册事务。配置文件解析和模块发现仍属于 D 任务，不应在验收时误认为已经完成。
