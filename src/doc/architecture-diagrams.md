# 重构前后模块依赖图说明

- 重构前 PlantUML：[`architecture-before.puml`](./architecture-before.puml)
- 重构后 PlantUML：[`architecture-after.puml`](./architecture-after.puml)
- 对比基线：Git 标签 `final`
- 当前目标：Phase 2 / A · CLI 内核与扩展机制

## 1. 重构前

Phase 1 的 `CliApplication` 同时承担：

- 命令名到处理函数的映射。
- 命令参数检查和具体命令创建。
- 当前文档、历史、工厂、读取器和写入器的持有。

`ShapeFactory` 直接引用六个具体图形类，并分别解释 CLI 参数和 SVG 属性。`SvgDocument` 直接生成 `tree` 文本，`SetCommand` 直接调用图形属性方法。

因此新增命令、图形类型、属性领域语义或树标签时，需要修改既有核心类。

## 2. 重构后

Phase 2 将“扩展实现”和“调用机制”分开：

| 可变能力 | 稳定调用机制 | 扩展接口 | 默认实现位置 |
|---|---|---|---|
| CLI 命令 | `CommandDispatcher` | `Command` | `src/builtins/commands` |
| 图形创建与读回 | `ShapeFactory` | `ShapeProvider` | `src/builtins/shapes` |
| 属性领域语义 | `SetCommand` + `AttributeTransaction` | `AttributeHandler` | Phase 1 缺省路径；C 提供 box 处理器 |
| 树标签 | `TreeRenderer` | `TreeDecorator` | 无标签为缺省；D 提供具体标签 |

四类扩展都通过注册表查询。`PluginActivationManager` 负责把插件的多类贡献作为一个原子事务提交。

## 3. 依赖方向

重构后的关键依赖方向是：

```text
CLI 组合根
  → 核心调用机制
  → 扩展接口

内置/可选插件
  → 扩展接口

核心调用机制 -X-> 具体可选插件
```

`-X->` 表示禁止依赖。内核不得导入 `box`、`stats`、`dir`、`modified-star` 或 `box-type-label` 的具体实现。

## 4. 开闭原则检查

新增扩展时允许变化：

- 新增插件类或插件包。
- 在代码装配处增加一个激活请求，或者在 D 的配置文件中增加一项。
- 增加测试、文档和必要依赖元数据。

新增扩展时不应变化：

- `CommandDispatcher`
- `ShapeFactory`
- `SetCommand` 的匹配与事务流程
- `TreeRenderer`
- 四个扩展接口
- 既有插件实现

## 5. Phase 1 保底能力

Phase 1 能力不是保留在硬编码分支中，而是作为默认内置插件装配：

```text
BuiltinShapeProvidersPlugin → 六种图形 provider
BuiltinCommandsPlugin       → 19 条原有命令
```

禁用 Phase 2 可选插件后，这些内置插件仍然启动，因此原有命令、六种图形和基础 `tree` 输出保持不变。

## 6. 图形渲染

如果本地安装了 PlantUML，可以在仓库根目录生成图片：

```bash
plantuml src/doc/architecture-before.puml
plantuml src/doc/architecture-after.puml
```

也可以使用支持 PlantUML 的编辑器预览 `.puml` 文件。生成的 PNG/SVG 是否提交由小组最终文档约定决定，源 `.puml` 文件必须提交。

## 7. 验证建议

```bash
npm run typecheck
npm test
```

然后检查核心中是否硬编码可选扩展名称：

```bash
grep -R -nE "box|stats|dir|modified-star|box-type-label" src/core src/model/ShapeFactory.ts src/commands/SetCommand.ts
```

搜索结果需要人工判断：测试说明、通用错误文字或文档出现名称不代表内核依赖；核心运行逻辑不得按这些名称建立条件分支。

> 当前图中的 `stats`、`dir`、`box` 和两个树标签表示 B/C/D 的预期插件位置，不表示 A 已经实现这些生产插件。
