# 用 AI 搞定用户系统：Superpowers 工程化开发教程

🧠如果你最近在关注 AI Coding，大概率已经刷到过 Superpowers 和 ui-ux-pro-max。 前者试图把"想到哪写到哪"的 AI 编程，拉回到更像工程交付的节奏里；后者则想解决另一个老问题：AI 能把页面写出来，但不一定写得像一个成熟产品。

这篇文章不准备再用"工具很强、流程很酷、装上就起飞"那种方式来介绍它们。

我更想做的，是把几个真正重要的问题讲清楚：这两个 Skill 分别解决什么问题、官方文档里到底怎么安装和工作的，以及如果把它们放进一个真实项目里，具体应该怎样用。

为了把过程讲具体，后文用一个 RBAC 用户权限系统 作为案例来串起整条链路。本文讨论的是单租户后台管理系统里的 RBAC，不展开 ABAC、行级权限、组织继承、多租户隔离这类更复杂的话题。

这是最终完成初版的多租户 RBAC 系统项目，仓库地址为 https://github.com/Cookieboty/Autix。感兴趣的同学可以 Star 支持一下。需要注意的是，这个项目虽然是按下文流程 VB 出来的，但过程中也做了不少 bug 处理；另外，受 AI 幻觉影响，部分分支出现过偏差，因此做了一些调整，但整体流程基本可控。


---

// 1. 获取所有的 h1 标签
const headings = document.querySelectorAll('h1');
let lastSeenH1Id = '';

// 2. 创建观察器：处理 h1 的进入
const h1Observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    // isIntersecting 表示元素出现在了视口内
    if (entry.isIntersecting) {
      const id = entry.target.id;
      lastSeenH1Id = id; // 记录最后一个看到的 h1
      console.log('当前滚动到 H1:', id);
    }
  });
}, {
  threshold: 0.1, // 只要有 10% 露出就触发
  rootMargin: "0px 0px -50% 0px" // 只有进入视口上半部分才算“到达”
});

// 开始观察每一个 h1
headings.forEach(h1 => h1Observer.observe(h1));

// 3. 观测底部：判断是否滚动到底
const footerSentinel = document.createElement('div');
document.body.appendChild(footerSentinel); // 在页面最后插入一个哨兵元素

const bottomObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    console.log('已滚动到底部，最后一个 H1 的 ID 是:', lastSeenH1Id);
  }
}, { threshold: 1.0 });

bottomObserver.observe(footerSentinel);

## 一、Superpowers 与 ui-ux-pro-max 的定位

### 1.1 Superpowers：面向工程流程的 AI 开发工作流

很多 AI 编程体验之所以让人又爱又烦，本质上不是模型不会写代码，而是它太容易过早进入实现阶段。你刚抛出一个需求，它就开始生成文件；你话还没说完，它已经默认做了三层扩展。

Superpowers 的核心思路，正是把这种"先写再说"的节奏，改造成一套更接近工程实践的工作流。它并不是单一 Skill，而是一套围绕软件开发流程组织起来的技能系统：从 brainstorm、plan，到执行、TDD、review、收尾，尽量让代理在每个阶段做该做的事。

### 1.2 ui-ux-pro-max：面向前端产出的设计增强能力

很多人第一次用 AI 生成前端页面时，都会有一种熟悉的感觉：布局也有，按钮也有，表格也有，生了一堆组件；但页面往往停留在"摆上去"的层面，缺少真正的设计判断——比如配色节奏、版式层级、字号体系、交互一致性。

ui-ux-pro-max 官方 README 对它的定位，是一个为多平台 AI coding assistant 提供 design intelligence 的 Skill。它不是一个 UI 组件库，也不是设计工具，而更像一个给模型补设计经验的知识层。

### 1.3 两者的互补关系

- Superpowers：解决"开发过程是否可控"
- ui-ux-pro-max：解决"前端结果是否足够成熟"

### 1.4 何时使用 Superpowers，何时使用 ui-ux-pro-max

Superpowers 适合的场景：

- 中大型功能开发，一次对话内完成不了
- 任务同时涉及后端建模、接口、前端、测试的多模块联动
- 需要跨 session 持续推进，上下文断了也要获山再起
- 需要可审计、可复盘的交付结果

不容易起效的场景：

- 修一个很小的 bug、一次性脚本、快速验证原型的任务
- 尚在探索方向、需求本身就不收敛的创意型工作

ui-ux-pro-max 适合的场景：

- 页面目标和组件库已经确定，你需要的是更统一、更成熟的设计产出
- 技术栈比较主流（React、Next.js、Tailwind 等）
- 不适合：尚在探索风格方向、仓库本身设计不统一或项目组件混乱的情况

💡实践中最常见的用法：先用 Superpowers 把任务拆清楚、推到后端骨架就位，再用 ui-ux-pro-max 进入前端阶段。两个工具的切换点是自然的：前者管流程，后者管界面。

---

## 二、安装与基础验证

### 2.1 Superpowers 安装

官方 README 先强调：不同平台的安装方式并不一样。Claude Code 和 Cursor 这类带插件市场的环境装法比较直接；Codex、OpenCode 这类环境则需要走手动安装说明。

#### Claude Code：官方 Marketplace 安装

```
/plugin install superpowers@claude-plugins-official
```

#### Claude Code：通过 Superpowers Marketplace 安装

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

### 2.2 ui-ux-pro-max 安装

#### 先决条件：Python 3.x

官方文档强调，Python 3.x 是必需的，因为它的搜索脚本依赖 Python 运行。

```bash
# 检查是否已安装
python3 --version

# macOS
brew install python3
```

这一步最好别省。很多"装了但是不好使"的问题，最后往往不是 Skill 本身的问题，而是本地依赖没有满足。

#### Claude Code：Marketplace 安装

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

---

## 三、官方工作流概览

按照官方 README，Superpowers 的基本工作流如下：

1. `brainstorming`
2. `using-git-worktrees`
3. `writing-plans`
4. `subagent-driven-development` 或 `executing-plans`
5. `test-driven-development`
6. `requesting-code-review` / review 相关环节
7. `finishing-a-development-branch`

### 3.1 需求澄清

对应 `brainstorming`。它不是"礼貌地追问几句"，而是把模糊需求转成一个能继续往下推的设计起点。最关键的产物不是聊天记录，而是后续会被固化下来的设计判断。

### 3.2 方案收敛与计划拆分

对应 `writing-plans`。AI 应把任务拆成一组可以逐步完成、逐步验收的动作。官方文档里一直强调 plan 的粒度要小，就是为了让长任务不会因为上下文膨胀而失控。

### 3.3 执行阶段的约束机制

对应 `executing-plans`、`subagent-driven-development` 和 `test-driven-development`。Superpowers 想做的是，让执行阶段继续受到测试、review 和阶段性检查的约束，而不是有了计划也照样一口气往前冲。

### 3.4 收尾与交付

对应 `finishing-a-development-branch`。很多 AI 生成代码的问题，不在生成时，而在收尾时：没确认测试结果，没做回归，也没有明确说明当前分支该如何处置。

### 3.5 ui-ux-pro-max 的工作方式

你提出任何 UI/UX 相关任务，Skill 在相关平台上自动激活，然后识别任务类型，检索对应的风格、配色、字体、布局建议，再把这些结果提供给模型。它更像"设计顾问"，而不是"页面生成器"。

---

## 四、RBAC 案例的选择

RBAC 系统之所以合适作为演示案例，是因为它天然有几层结构：后端要建模用户、角色、权限；接口层要做 Guard 和装饰器；前端要做登录、列表、权限分配、菜单控制；交付阶段还要处理联调、初始化数据和容器化启动。这正好能把 Superpowers 的长任务工作流和 ui-ux-pro-max 的前端辅助能力放进同一个案例里观察。

📌范围边界：本文讨论的是单租户后台管理系统里的 RBAC，不涉及 ABAC、数据行级权限、组织/部门继承、多租户隔离等更复杂的权限模型。

---

## 五、在 RBAC 项目中的使用方式

### 5.1 需求边界澄清

权限系统最容易出问题的，不是 CRUD 本身，而是边界不清时默认做了太多假设。所以第一步不是写代码，而是让 AI 先把问题问完整。

🤖 Prompt：需求边界澄清

```
/superpowers:brainstorm
我要做一个后台管理系统的 RBAC 权限模块。后端使用 NestJS + Prisma + PostgreSQL，前端使用 Next.js 14 + Tailwind + shadcn/ui。
请不要直接写代码，先帮我把边界条件问清楚，包括：
- 权限粒度到页面、按钮还是接口
- 是否需要 super_admin 绕过机制
- refreshToken 是否落库
- 是否需要审计日志
- 是否涉及组织 / 部门 / 租户维度
```

这一步的意义非常大。你以为自己要的是"后台权限控制"，模型理解成了"完整企业权限平台"；你只想做按钮级控制，它顺手给你加上了租户维度和审计模型。超出范围的内容局部不一定错，但大概率不是你当下真正需要的东西。

### 5.2 Spec 设计说明

一旦问题问得差不多了，让 AI 把核心决策收敛成一份设计说明。有没有把下面几件事说死才是关键：

- 后端模块怎么拆
- 权限命名采用什么规范
- 前端如何接入权限判断
- 哪些内容这次明确不做

如果这些东西不先落下来，后面生成的 Plan 再细，也只是把一堆摇摆中的决定拆得更碎而已。

### 5.3 Plan 拆分原则

不要用"实现用户模块"这种粗粒度的任务名。一步里面包含的决策越多，执行时越容易发散。

🤖 Prompt：生成实施计划

```
/superpowers:writing-plans
基于刚才对齐的 RBAC 权限系统需求，生成完整实施计划。
要求：
- 后端和前端分开规划
- 每个步骤要有明确的交付物和验收标准
- 数据库 Schema 设计作为独立步骤
- 鉴权模块和业务模块分开
- 前端页面按功能模块拆分
```

一份可执行的 Plan 应该是这样的结构：

```
### Phase 1：工程底座
- [ ] 1.1 初始化 monorepo（apps/api + apps/web）
- [ ] 1.2 配置 Prisma + PostgreSQL
- [ ] 1.3 设计并迁移数据库 Schema

### Phase 2：后端核心
- [ ] 2.1 实现 Auth 模块（登录/刷新 Token）
- [ ] 2.2 实现 Users 模块（CRUD + 状态管理）
- [ ] 2.3 实现 Roles 模块
- [ ] 2.4 实现 Permissions 模块
- [ ] 2.5 实现 JwtAuthGuard + PermissionsGuard
- [ ] 2.6 实现 @Permissions() 装饰器

### Phase 3：前端核心
- [ ] 3.1 初始化 Next.js + Tailwind + shadcn/ui
- [ ] 3.2 实现登录页
- [ ] 3.3 实现布局和侧边栏（权限驱动菜单）
- [ ] 3.4 实现用户、角色、权限管理页

### Phase 4：集成与收尾
- [ ] 4.1 前后端联调
- [ ] 4.2 Docker Compose 一键启动
- [ ] 4.3 初始化管理员账号与默认权限
```

Plan 不是项目目录，而是执行顺序。进入下一阶段前，务必确认当前阶段验收已通过、git commit 已提交。

### 5.4 后端实现阶段

🤖 Prompt：执行后端阶段

```
/superpowers:executing-plan
执行 PLAN.md 中 Phase 1 和 Phase 2 的所有步骤。
每个步骤执行完后，输出对应的验收 curl 命令。
```

后端验收清单：

```bash
# 登录获取 Token
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"123456"}'

# 获取用户信息 Token 应返回 200
curl -X GET http://localhost:3002/api/auth/profile \
    -H "Authorization: Bearer $ACCESS_TOKEN"

# 无权限的 Token 应返回 403（不是 401）
curl -X DELETE http://localhost:3002/users/1 \
  -H "Authorization: Bearer <limitedToken>"

# super_admin 应能访问所有接口
curl http://localhost:3002/users \
  -H "Authorization: Bearer <superAdminToken>"
```

验收标准：

- ✅ 登录成功，返回中包含权限列表的 Token
- ✅ 有权限接口正常返回 200
- ✅ 无权限接口返回 403（不是 401）
- ✅ super_admin 跳过权限检查
- ✅ Token 过期后 refreshToken 自动续签

### 5.5 前端实现阶段

等后端骨架差不多了，这时你已经知道自己要做哪些页面，需要的不再是"帮我想我要做什么"，而是"在页面目标已经明确的前提下，把它们做得更像一个成熟后台"。这就是 ui-ux-pro-max 开始发挥其真正价值的时候。

🤖 Prompt：执行前端阶段

```
/superpowers:execute-plan
执行 PLAN.md 中 Phase 3 的所有步骤，使用 ui-ux-pro-max 技能生成前端页面。
设计要求：
- 整体风格：SaaS 后台管理系统，Modern + Clean
- 配色方案：参考 SaaS 行业调色盘，主色深蓝（#1E40AF），辅色浅灰
- 字体：Inter + 系统字体栈
- 组件库：shadcn/ui，不自造轮子
- 侧边栏：固定宽 240px，图标 + 文字菜单，根据权限动态渲染
- 表格：带分页、搜索、批量操作
- 表单弹窗：Drawer 风格（从右侧滑入），不用居中 Modal
- 权限分配：Checkbox 树形结构，按 module 分组

页面清单：
1. 登录页（/login）
2. 用户管理（/dashboard/users）
3. 角色管理（/dashboard/roles）
4. 权限列表（/dashboard/permissions）
5. 个人信息（/dashboard/profile）
```

前端权限控制实现示例：

```typescript
// hooks/usePermissions.ts
export function usePermissions() {
  const { user } = useAuth();
  const can = (permission: string) =>
    user?.permissions?.includes(permission) ?? false;
  return { can };
}

// 按钮级权限控制
{ can('user:delete') && (
  <Button variant="destructive" onClick={handleDelete}>
    删除用户
  </Button>
)}

// 路由守卫
export function PermissionGuard({ permission, children }) {
  const { can } = usePermissions();
  if (!can(permission)) return <NoPermission />;
  return children;
}
```

前端验收清单：

- ✅ 菜单根据权限动态显示/隐藏
- ✅ 没权限的页面不允许进入
- ✅ 没权限的按钮不展示
- ✅ 权限分配界面能正常保存
- ✅ 禁用用户无法登录

### 5.6 集成与交付阶段

很多教程写到前后端页面都出来了，就差不多结束了。但真实项目往往恰恰是在集成阶段开始变难。

🤖 Prompt：执行集成阶段

```
/superpowers:execute-plan
执行 PLAN.md 中 Phase 4 的集成步骤：
1. 前后端联调：
   - 配置 Next.js API 代理（/api/* -> http://localhost:3001）
   - 封装 axios 实例，自动注入 Bearer Token，处理 401 自动刷新
   - 统一错误处理（403 跳转无权限页，401 跳转登录页）
2. Docker Compose：
   - postgres 服务（数据持久化）
   - api 服务（NestJS）
   - web 服务（Next.js）
   - 支持 docker compose up -d 一键启动
3. 初始化脚本：
   - 自动创建 super_admin 角色和初始管理员账号
   - 自动写入所有权限枚举到数据库

完成后输出完整的 README，包含本地启动步骤。
```

集成验收清单：

```bash
# 一键启动
docker compose up -d

# 初始化数据（运行一次）
docker compose exec api npx ts-node src/scripts/seed.ts

# 验证：前端登录后调用后端接口
curl http://localhost:3001/users \
  -H "Authorization: Bearer <tokenFromFrontend>"
```

最终验收标准：

- ✅ docker compose up -d 一键启动，服务全部起来
- ✅ 初始化脚本正常写入权限和管理员账号
- ✅ 前端登录后 Token 注入正常，接口可访问
- ✅ 401 / 403 按预期跳转
- ✅ 无需手动修改配置文件

---

## 六、适用场景与现实限制

### 6.1 真正适合它的场景

- 中大型功能开发：不是几个小修小补，而是会牵涉模型、接口、页面、测试的完整模块
- 多模块联动任务：前后端、交互、鉴权、配置、联调需要协同推进
- 需要跨 session 续做的任务：一次对话干不完，后面还要继续接着做
- 需要复盘与审计的交付：你希望知道设计是怎么定的、每一步做到哪了、为什么这样做

### 6.2 不适合全流程的场景

- 修一个很小的 bug
- 一次性脚本
- 快速验证想法的原型
- 本来就需要边做边改方向的创意型任务

一句话说就是：小任务轻流程，大任务重流程。

### 6.3 现实限制

#### Spec / Plan 确实会带来前置成本

如果任务本来就很小，前面花十几分钟对齐、落文档、拈计划，可能真的不划算。

#### TDD 会让 AI 显得更慢

它的好处是结果更可验证，但代价就是执行节奏不会像"直接写一版能跑的代码"那么快。

#### ui-ux-pro-max 的效果依赖代码基线

如果你的仓库本身组件体系混乱、设计 token 失控、页面结构脏乱，那它的上限也会被拉低。

#### 人工决策依旧不可替代

Skill 能加强执行，但不能替你决定：哪些复杂度该引入、哪些边界这次先不做、什么时候追求速度还是追求稳定。

---

## 七、总结

Superpowers 和 ui-ux-pro-max 的真正价值，不在于它们能把 AI 变成"全自动高级工程师"，而在于它们分别补上了两个最常见的缺口：一个补流程，一个补设计。

前者让任务不那么容易一路失控，后者让前端结果不那么容易停留在"有组件，但没产品感"的层面。

它们不是所有项目都需要的东西，也不是装完就一定立刻见效的东西。你还是得判断任务值不值得走完整流程，还是得亲自做关键决策，还是得面对代码基线、团队习惯和项目复杂度这些很现实的问题。

Superpowers 适合把大任务拉回工程轨道，ui-ux-pro-max 适合把前端结果拉回产品语境。它们真正有用的时候，通常不是在"随便试试"的那一刻，而是在你开始认真交付一个项目的时候。


// 1. 获取所有的 h1 标签
const headings = document.querySelectorAll('h1');
let lastSeenH1Id = '';

// 2. 创建观察器：处理 h1 的进入
const h1Observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    // isIntersecting 表示元素出现在了视口内
    if (entry.isIntersecting) {
      const id = entry.target.id;
      lastSeenH1Id = id; // 记录最后一个看到的 h1
      console.log('当前滚动到 H1:', id);
    }
  });
}, {
  threshold: 0.1, // 只要有 10% 露出就触发
  rootMargin: "0px 0px -50% 0px" // 只有进入视口上半部分才算“到达”
});

// 开始观察每一个 h1
headings.forEach(h1 => h1Observer.observe(h1));

// 3. 观测底部：判断是否滚动到底
const footerSentinel = document.createElement('div');
document.body.appendChild(footerSentinel); // 在页面最后插入一个哨兵元素

const bottomObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    console.log('已滚动到底部，最后一个 H1 的 ID 是:', lastSeenH1Id);
  }
}, { threshold: 1.0 });

bottomObserver.observe(footerSentinel);
