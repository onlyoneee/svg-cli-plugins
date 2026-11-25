# ADR-004 · box 的子部件、属性与读回

## 结构与编辑

`create box n1 120 100 160 60 "开始"` 创建一个容器，直接子节点依次为 `rect#n1-rect` 和 `text#n1-label`。矩形沿用内置矩形的非负宽高规则，默认填充为 `#4a90d9`。标题起点取 `(x + 20, y + height / 2 + 5)`，示例中为 `(140,135)`。Provider 返回完整子树，由文档统一检查所有 ID 后插入。

两个派生 ID 对应的直接子节点必须一直存在，类型分别为 `rect` 和 `text`。用户可以在 box 中添加其他图形或嵌套 box。普通命令可以移动整个 box、缩放或删除整棵子树，也可以调整部件的几何属性、文字和绘制顺序。删除必要子部件、将其换到另一个父节点、将其编入新组以及解组 box 都会报错。批量分组先检查所有目标，再摘取子节点。

容器通过 `GroupShape.canUngroup` 和 `GroupShape.isRequiredChild()` 提供结构规则。创建输出使用 `Shape.creationSummary()`。box 的公开 `kind` 为 `box`，基础树摘要沿用 `g#<id>`，供 D 的独立标签插件追加 `(box)`。

## 属性与历史

`box-fill` 匹配 box 的 `fill`，写入矩形填充。 `box-label` 匹配 box 的 `label`，读取原文字以生成撤销文案，再写入文本节点的 `text`。两个处理器都通过 `AttributeHandlerContext` 写入。每次成功的 `set` 形成一个历史单元，多处理器命中时拒绝执行。处理器抛错时，事务逆序恢复已写入的值，原有 undo 和 redo 记录保持可用。事务流程见[属性处理契约](./extension-points-and-attribute-adr.md)。

## 保存与读回

box 写为带 `data-kind="box"` 的标准 SVG 分组。已安装插件时，provider 校验外层标签、直接子部件的 ID 和类型，再按文件顺序恢复所有子节点。读回使用文件里的坐标、填充和标题，因此手工编辑的部件及额外子节点可以往返保存。缺少必要部件或类型错误会使本次读取整体失败，并保留当前文档。插件缺失时读为普通 `g`，两个部件仍可单独编辑。重复 ID 在两种模式下都会导致读入失败。详见 [SVG 读回与降级 ADR](./adr-002-svg-read-fallback.md)。

## 运行与验证

使用 `npm run cli -- --box` 启用插件。使用 `npm run cli` 启动基础会话。代码装配入口加载插件默认导出与命名导出 `manifest`。构建后的模块为 `dist/src/plugins/box/index.mjs`，可供配置加载器动态导入。

```text
init
create box n1 120 100 160 60 "开始"
set n1 fill red
set n1 label "完成"
undo
redo
tree n1
```

运行 `npm test` 可执行全部回归测试。只验证 C 部分时，先运行 `npm run build`，再运行 `node --test dist/tests/BoxPlugin.test.js`。
