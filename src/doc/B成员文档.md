# B 任务交接：`stats` 与 `dir` 命令插件

- 接收方：B · 命令插件
- 提供方：A · CLI 内核与扩展机制
- 文档日期：2026-11-20
- 目标：B 在不修改命令内核的情况下接入 `stats` 和 `dir`

## 1. 开始前

请先同步 `main` 并确认 A 的基线测试通过：

```bash
git pull origin main
npm run typecheck
npm test
```

开发插件时优先从 [`src/api/index.ts`](../api/index.ts) 导入公开类型。不要依赖：

- `CliApplication` 的私有字段。
- `CommandRegistry` 的内部 `Map`。
- `CommandHistory` 的 undo/redo 栈。
- `SvgDocument` 的可变内部结构。

通用契约请阅读：

- [四个扩展点清单](./extension-points-and-attribute-adr.md)
- [插件激活事务 ADR](./adr-003-plugin-activation-transaction.md)

## 2. A 已经提供的能力

A 已完成：

- `Command`、`CommandContext`、`CommandRegistration` 接口。
- 命令注册表和大小写不敏感查询。
- `CommandDispatcher` 统一分发。
- 注册命令的 `helpLines` 自动进入 `help`。
- `requiresDocument` 文档前置检查。
- `ReadonlyDocument` / `ReadonlyShape` 深度遍历所需信息。
- `workingDirectory`，表示 CLI 启动时的当前目录。
- 插件暂存、manifest 校验、原子提交和失败回滚。
- 代码装配和异步装配共用的 `PluginActivationManager`。

Phase 1 的 19 条命令已改为内置 `Command` 实现，禁用 Phase 2 可选插件时仍保持原行为。

## 3. `Command` 契约

接口位于 [`src/api/Command.ts`](../api/Command.ts)：

```ts
interface Command {
  readonly name: string;
  readonly helpLines: readonly string[];
  readonly requiresDocument: boolean;

  execute(arguments_: readonly string[], context: CommandContext): string;
}
```

基本约定：

1. `name` 必须非空，注册时转换为小写。
2. `helpLines` 至少有一个非空字符串。
3. `execute()` 返回不带 `svg>` 提示符的正文。
4. 失败时抛出 `Error`，外层 CLI 自动添加 `error: `。
5. 查询命令不得调用 `context.execute()`、`replaceDocument()` 或 `markIoBoundary()`。
6. 查询命令不进入 undo 栈，也不能清空 redo 栈。

## 4. `CommandContext` 可用能力

接口位于 [`src/api/CommandContext.ts`](../api/CommandContext.ts)：

```ts
interface CommandContext {
  readonly document: ReadonlyDocument | null;
  readonly workingDirectory: string;

  requireDocument(): ReadonlyDocument;
  execute(operation: UndoableOperation): string;
  replaceDocument(document: SvgDocument): void;
  markIoBoundary(): void;
}
```

B 只需要：

- `stats`：`requireDocument()`。
- `dir`：`workingDirectory`。

其他三个可变入口属于内置编辑/文档命令，B 的两个查询命令不得使用。

## 5. `stats` 实现要求

建议元数据：

```ts
readonly name = "stats";
readonly helpLines = ["stats"];
readonly requiresDocument = true;
```

### 5.1 遍历规则

从 `document.roots` 开始，按照当前 `children` 顺序深度优先遍历：

```ts
interface ReadonlyShape {
  id: string;
  type: string;
  kind: string;
  children: readonly ReadonlyShape[];
}
```

规则：

- 根 SVG 不计数。
- `children.length > 0` 的普通 `g` 和 `box` 只计入 containers。
- 容器内部叶子继续统计。
- 叶子按 `type` 计数。
- 类型输出顺序按深度优先遍历时第一次出现的顺序。
- `total` 是全部叶子数。
- `containers` 是普通 `g` 和 `box` 容器数。

示例：

```text
rect: 3  circle: 1  text: 2  (total 6, containers 2)
```

空文档：

```text
(total 0, containers 0)
```

### 5.2 注意事项

- 不要通过 `instanceof` 判断 C 的 `box`。
- 使用公开的 `kind` 和 `children`。
- 不要修改文档或图形。
- 不要将统计结果缓存为模块全局状态。
- `stats` 参数数量必须为 0；有参数时返回 `error: usage: stats`。

## 6. `dir` 实现要求

建议元数据：

```ts
readonly name = "dir";
readonly helpLines = ["dir"];
readonly requiresDocument = false;
```

### 6.1 必须使用适配器模式

命令逻辑不要直接调用 `node:fs`。建议在 B 的插件包中定义：

```ts
interface DirectoryReader {
  read(path: string): readonly DirectoryEntry[];
}

interface DirectoryEntry {
  readonly name: string;
  readonly kind: "directory" | "file" | "other";
}
```

对应角色：

| 适配器模式角色 | 建议实现 |
|---|---|
| Target | `DirectoryReader` |
| Adaptee | Node.js `fs` / `Dirent` |
| Adapter | `NodeDirectoryReader` |
| Client | `DirCommand` |

`DirCommand` 构造时注入 `DirectoryReader`，以便使用测试替身。

### 6.2 输出规则

- 路径固定使用 `context.workingDirectory`。
- 不接收参数，不递归。
- 包含以 `.` 开头的隐藏项。
- 不显示 `.` 和 `..`。
- 目录在前，文件在后。
- 每组按名称升序排列，输出稳定。
- 每个项目单独一行。

```text
[DIR]  docs
[DIR]  plugins
[FILE] demo.svg
[FILE] package.json
```

空目录：

```text
(empty directory)
```

读取失败时抛出：

```ts
throw new Error(`cannot read directory: ${path}`);
```

CLI 最终输出：

```text
error: cannot read directory: <path>
```

符号链接及其他特殊文件的显示规则由 B 在文档中明确；不要求跟随链接目标。

### 6.3 状态约束

执行 `dir` 前后必须保持：

- 当前 SVG 文档不变。
- 当前工作目录不变。
- undo/redo 历史不变。
- dirty 状态不变。
- 未执行 `init` 或 `read` 时仍可使用。

## 7. 插件注册示例

```ts
class CommandPlugins implements Plugin {
  constructor(private readonly directoryReader: DirectoryReader) {}

  activate(context: PluginContext): void {
    context.commands.register(new StatsCommand());
    context.commands.register(new DirCommand(this.directoryReader));
  }
}
```

Manifest：

```json
{
  "name": "command-plugins",
  "contributes": {
    "commands": ["stats", "dir"]
  }
}
```

代码装配示例：

```ts
new CliApplication([
  {
    plugin: new CommandPlugins(new NodeDirectoryReader()),
    manifest,
  },
]);
```

配置装配由 D 负责，但最终必须使用同一插件实例和同一 `PluginActivationManager` 注册路径。

## 8. B 必须提供的测试

### `stats`

- 空文档。
- 多种叶子和嵌套容器。
- 首次出现顺序。
- `box` 内部叶子照常统计。
- 不改变 undo/redo。
- 参数错误。

### `dir` 测试替身

- 文件与目录混合。
- 空目录。
- 隐藏项。
- 读取失败。
- 稳定排序。
- 特殊文件规则。

### `dir` 真实适配器

- 使用临时目录组合 `DirCommand + NodeDirectoryReader`。
- 日志文件放在被列目录之外，避免改变输入。
- 未初始化文档时可用。
- 成功和失败均不改变文档及历史。

## 9. 不允许的做法

- 修改 `CommandDispatcher` 增加 `stats`/`dir` 分支。
- 修改内置命令表硬编码两个命令。
- 在 `help` 中手工追加文案。
- `DirCommand` 直接依赖 `node:fs` 而没有适配器。
- 为查询命令创建 `UndoableOperation`。
- 直接访问 `SvgDocument` 可变字段。

## 10. 交接完成判据

```text
启用插件：help 中出现 stats、dir，命令可执行。
禁用插件：执行时返回 unknown command，Phase 1 行为不变。
代码装配与配置装配：相同目录和文档输入得到逐字一致输出。
新增插件提交：不修改 CommandDispatcher、既有命令或其他插件。
```

遇到公开接口不足时，请先向 A 提出具体用例，不要从插件中导入内核私有实现。
