# B：stats / dir 命令插件实现与验收

更新：2026-11-25。基于 main 的 cc2c882。B 的两个命令、适配器、独立测试、宿主集成测试和代码装配示例已实现。当前类型检查与 65 项测试全部通过，其中原有 47 项、新增 18 项。

本说明仅覆盖 B 的职责。配置装配已通过测试专用程序验证插件契约与输出一致性，但仓库尚无 D 的生产配置加载器和 dirty 标签，真实 box 插件也未落地；这些跨成员联调不计作已完成验收。未修改原 README、src/doc 下的交接说明、内核、内置命令或原启动入口。

## 1. 文件结构与职责

```text
src/plugins/
  command-stats/
    StatsCommand.ts          只读统计逻辑
    StatsPlugin.ts           注册 stats
    index.mts                ESM 默认插件实例与具名导出
    package.json             独立包名、main、contributes
  command-dir/
    DirectoryReader.ts       目录项模型与访问接口
    NodeDirectoryReader.ts   Node.js 文件系统适配器
    DirCommand.ts            参数检查、排序、格式化和错误转换
    DirPlugin.ts             注入适配器并注册 dir
    index.mts                ESM 默认插件实例与具名导出
    package.json             独立包名、main、contributes
src/assembly/
  command-plugins-main.mts   代码装配 CLI 示例
examples/
  command-plugins.config.json
tests/
  StatsCommand.test.ts       stats 独立测试（4 项）
  DirCommand.test.ts         dir 独立及真实适配器组合测试（4 项）
  CommandPlugins.test.ts     宿主集成与历史保护（7 项）
  CommandAssembly.test.ts    双装配、启停、工作目录测试（3 项）
  helpers/
    commandDoubles.ts        只读公开接口替身，禁止所有修改入口
    commandSession.ts        配置装配正向契约测试程序
doc/transcript/
  b-commands.txt             只有命令与注释的输入会话
  b-commands.expected.txt    固定目录下的预期正文输出
```

插件只依赖 `src/api` 的公开类型和自身文件。两个包各自只注册一个命令，可以分别启用或禁用，不导入其他插件、内核实现或装配模块。宿主自动收集 helpLines，不修改内置帮助文本。

## 2. stats 规则

- `requiresDocument = true`：未初始化时沿用宿主的 no document 错误；已初始化空画布输出 `(total 0, containers 0)`。
- 不接受参数；文档存在时多余参数报 `error: usage: stats`。宿主先检查文档前置条件，因此无文档且参数错误时优先报 no document。
- 从 document.roots 按当前 children 顺序深度优先遍历，不统计 SVG 根。
- 普通 g（type=g）和 box（kind=box）只计 containers，空容器也算；容器内部叶子继续统计。
- 叶子按公开 type 计数，支持未知的新叶子类型；Map 保留首次出现顺序。
- 每次执行使用局部变量，不缓存结果、不修改图形，也不创建撤销操作。

示例：`circle: 1  rect: 1  (total 2, containers 2)`。类型之间及括号前均为两个空格。

## 3. dir 与 Adapter 模式

| 模式角色 | 代码 | 职责 |
|---|---|---|
| Target | DirectoryReader | 定义 read(path)，返回与 Node 无关的 DirectoryEntry 数组 |
| Adaptee | node:fs / Dirent | 实际读取文件系统、识别目录项类型 |
| Adapter | NodeDirectoryReader | 调用 readdirSync({withFileTypes:true})，转换目录项 |
| Client | DirCommand | 只通过接口读取，负责参数、排序、输出和错误转换 |

DirCommand 构造器注入 DirectoryReader；DirPlugin 默认提供 NodeDirectoryReader，也允许测试注入假目录。使用同步接口与 A 的同步 Command.execute 契约保持一致。

- `requiresDocument = false`，未 init/read 时也能使用。仅使用 context.workingDirectory，不使用 SVG 文件路径。
- 不接受参数，不递归，保留隐藏项，过滤 . 和 ..。
- 目录在前，普通文件其次，特殊项最后；各组按 JavaScript 字符串比较的 UTF-16 码元顺序排序，区分大小写，不依赖系统 locale。
- 每行 `[DIR]  名称`、`[FILE]  名称` 或 `[OTHER]  名称`，标记后恰好两个空格。
- 符号链接（目录链接、文件链接、失效链接）和其他特殊项显示 [OTHER]，不跟随目标。
- 空目录输出 `(empty directory)`。
- 读取失败抛出 `cannot read directory: <path>`，外层 CLI 添加 `error: `；不暴露底层异常内容，后续命令仍可执行。
- filter 产生新数组再排序，不改变适配器返回数组。

两个查询均不调用 context.execute、replaceDocument、markIoBoundary，不改变 cwd。独立测试上下文会在调用任何修改入口时立即抛错。

## 4. 启动与测试

在仓库根目录、正常 Node/npm 环境中：

```sh
npm ci
npm run typecheck
npm test
npm run test:stats
npm run test:dir
npm run test:commands
npm run cli:commands
```

推荐 Node 24（实际验证版本 v24.22.3）。`npm run cli` 保留原 Phase 1 基线，不启用 B 插件；`npm run cli:commands` 启用 stats 和 dir。

示例会话：

```text
dir
init
create g empty
create rect r 0 0 10 10
stats
```

stats 输出 `rect: 1  (total 1, containers 1)`。

本机未配置全局 npm，本次使用工作区外层 `../work/tooling/package` 的临时 npm 安装依赖，未安装全局软件。已有 node_modules 时可以直接运行：

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc
node --test dist/tests/*.test.js
node dist/src/assembly/command-plugins-main.mjs
```

必要时安装依赖：

```sh
node ../work/tooling/package/bin/npm-cli.js ci --ignore-scripts --cache ../work/npm-cache
```

临时工具和日志不是交付源码；node_modules、dist 均被 Git 忽略。

## 5. 两种装配及与 D 的对接

### 代码装配

新入口显式导入两个默认插件实例，读取各包 package.json，将 `{plugin, manifest}` 传给 CliApplication。由 A 已有的 PluginActivationManager 执行暂存、清单校验及提交/回滚，不直接绕过事务调用 activate。

根 package.json 只增加运行/测试脚本；tsconfig.json 仅增加 src/**/*.mts 编译范围。依赖和锁文件未变。ESM index.mts 编译为 index.mjs，动态 import(...).default 可直接得到插件实例，不要求 D 实例化类。

### 配置装配接口

`examples/command-plugins.config.json` 的两个 module 路径相对于该配置文件目录。插件包 main 指向本仓库 dist 的 index.mjs，必须先构建；当前为仓库内插件包，不是可独立发布到 npm 的完整包。

D 对每个启用模块按以下流程处理即可：

1. 按配置文件目录解析模块路径，通过包的 main 解析运行入口。
2. 读取源插件包 package.json 的 contributes.commands。
3. 动态 import 运行入口，取得 default（实现 Plugin 的实例）。
4. 将 plugin、manifest、options 交给统一激活机制。两个 B 插件目前无需 options。

`tests/helpers/commandSession.ts` 是正向契约测试程序：泛化解析模块、跳过 enabled:false、读取清单并装配。它不硬编码配置插件名称映射，但不实现生产加载器的所有配置校验和加载失败处理，不能代替 D 的交付。

可手动观察配置契约会话（输出 dir 取决于运行目录）：

```sh
node dist/tests/helpers/commandSession.js examples/command-plugins.config.json < doc/transcript/b-commands.txt
```

该程序未作为正式 CLI --config 入口。原入口和代码装配示例均不解析 --config，避免暗示 D 的加载器已经实现。

## 6. 验证证据

| 要求 | 验证位置与结果 |
|---|---|
| 空画布、空 g/box、嵌套容器、首次出现顺序、自定义叶子、不积累计数 | StatsCommand.test.ts，使用冻结的公开接口替身 |
| 混合目录项、隐藏项、特殊项、错误参数、稳定排序、错误恢复 | DirCommand.test.ts，轮转输入排列并重复执行 |
| 真实适配器与命令组合 | 临时目录包含隐藏文件、子目录、三类符号链接；覆盖空目录、不存在路径、文件误作目录 |
| 未初始化时 dir 可用、两个插件独立启停、help 自动加入 | CommandPlugins.test.ts |
| 文档、sourcePath、cwd、多级 undo/redo 与 I/O 边界不变 | 与完全不执行查询的基线会话逐步比较；同时覆盖 dir 成功/失败 |
| 配置路径不依赖 cwd、独立启停、disabled 模块跳过 | CommandAssembly.test.ts，通过独立子进程执行 |
| 双装配输出逐字节一致 | 同一固定临时目录、同一输入及插件顺序，对照 b-commands.expected.txt；输出留在进程内存，不写入被列目录 |
| read/save 后 dir 仍列启动目录 | SVG 放另一临时目录，读写前后三次列表一致 |
| 可运行代码装配入口 | 对实际入口做相同会话冒烟验证，剥除提示符后与预期正文比较 |
| Phase 1 兼容性 | 原有 47 项测试全部通过，内核与原入口无差异 |

2026-11-25：类型检查通过，全部 65 项测试通过（0 失败、0 跳过）；其中 8 项纯命令/适配器测试可单独运行且不加载其他插件。`git diff --check` 通过。

## 7. 小组最终验收边界

以下是跨成员集成事项，不表示 B 命令尚未实现，也不能提前声明已验收：

- C：用真实 box 插件复验统计；目前使用 kind=box 的公开视图替身，不依赖 C 内部类。
- D：用正式配置加载器重跑相同会话，检查加载失败与异步激活契约；当前只验证 B 的正向配置装配接口。
- A/D：现有公开接口没有 dirty 状态或事件，modified-star 尚无实现。已证明查询不改内容、历史和调用修改入口，但真实标签状态需集成后复验。
- E：最终全组会话、指标、Git 提交差异及 p2 tag 不在本次 B 单独开发的验收范围。

## 8. Git 交付建议

本次提交覆盖 B 的插件、代码装配示例、测试和说明，不打最终 p2 标签。测试程序不替代生产加载器；提交后可通过 git diff C^ C 检查代码装配的差异范围，配置方式的独立接入证据仍需等待 D 的加载器基线。

代码接入提交可包括两个新插件包、新增的单个顶层装配文件、必要测试/文档及 package.json/tsconfig.json 元数据变化；内核与已有插件必须零变更。配置方式的独立演示应等 D 的加载器成为基线后再提交：新增插件及配置，既有运行源码不改。两个演示提交/分支的顺序由小组协调，避免提前把两种接入混成一个不符合判据的提交。

原 A 交接说明中“有子节点才算容器”以及两个命令合包的示例未照搬；本实现按作业要求统计空容器，并分成两个独立插件包，未改动他人说明。
