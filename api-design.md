一句话概括：这里写的并不只是“接口地址集合”，而是一套小型的前端通信层，负责统一协议、自动续期登录状态、处理并发竞态，再向页面暴露业务化的方法。

```text
页面 / 组件
    ↓
web-session.ts        登录、退出、组织切换、菜单同步
    ↓
auth-api / iam-api    业务接口名称与请求参数
    ↓
api-client.ts         Token、错误、重试、取消、响应解析
    ↓
NestJS API
```

## 1. 为什么不让组件直接调用 Axios

项目规范明确要求组件不要拼接请求细节，所有请求统一放在 `src/services`。

例如页面调用的是：

```ts
webIamApi.listMembers()
```

而不是：

```ts
axios.get("/api/members/list", {
  headers: { Authorization: ... },
})
```

这样页面只关心“获取成员”，不需要知道：

- API 前缀是什么
- Token 放在哪里
- 服务端响应为什么有 `code/message/data`
- 401 时是否要刷新 Token
- 网络错误要不要重试
- 错误应该转换成什么类型

入口在 [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:163)。

## 2. `api-client.ts` 是传输层

这一层把所有接口共同的行为集中起来。

### 统一解析响应

服务端返回固定结构：

```ts
{
  code: "OK",
  message: "ok",
  data: ...
}
```

定义在 [api-response.ts](/Users/liuguoping/code/Xpense/packages/shared/src/api-response.ts:15)，服务端也会统一包装响应。

前端拦截器在 [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:180) 中把它拆开：

- `code === "OK"`：直接返回 `data`
- 业务失败：转换成统一的 `ApiError`
- 非标准响应：报告“服务端响应格式异常”
- 网络断开：转换成“网络异常，请检查网络连接”

所以业务层拿到的是：

```ts
const members = await api.listMembers();
// members 直接是 IamMember[]
```

不用每个页面都写 `response.data.data`。

Axios 官方提供了独立实例、响应拦截器和 `AbortSignal` 取消能力；本项目是在这些能力上实现自己的协议和重试策略。[Axios 文档](https://github.com/axios/axios/blob/v1.x/README.md)

### 每次请求动态读取 Token

它接收的是：

```ts
getAccessToken: () => string | null
```

而不是创建客户端时直接传入一个 Token。

原因是 Token 会在登录、刷新、切换组织后变化。使用 getter 可以确保每次请求都读取 Zustand 中最新的 Token，见 [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:262)。

### GET 自动重试，POST 默认不重试

在 [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:56)：

- GET 默认重试网络错误、429 和 5xx
- 使用指数退避，避免立即反复轰炸服务端
- POST 默认不重试，防止“创建两次”“扣款两次”
- 确认幂等的 POST 可以显式开启重试

这个取舍是合理的。

### `cancelKey` 解决旧查询覆盖新查询

相同 `cancelKey` 的新请求会取消旧请求，适合搜索框、筛选器等场景。

不过我检查了当前调用方，这个能力目前只有测试覆盖，生产页面还没有实际使用。

### `X-Request-Id` 用于追踪

每个请求都生成 `X-Request-Id`，见 [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:275)。

服务端会把它带入审计日志。出现“某次修改为什么失败”时，可以把前端请求、服务端日志和审计记录串起来。

## 3. 为什么自动刷新 Token 写得这么复杂

核心代码在 [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:305)。

这里处理了几个真实的并发问题。

假设页面启动时同时发出成员、角色和菜单三个请求，Access Token 刚好过期，三个请求都会返回 401。

如果简单地让每个请求都刷新一次，会出现：

```text
请求 A 401 → refresh
请求 B 401 → refresh
请求 C 401 → refresh
```

而服务端会轮换 Refresh Token，[auth.service.ts](/Users/liuguoping/code/Xpense/apps/server/src/modules/auth/auth.service.ts:218)。并发刷新很容易让后面的刷新使用已经作废的旧 Token。

所以这里通过 `activeRefresh` 实现了“单航班刷新”：

```text
三个 401
   ↓
共享同一个 refresh Promise
   ↓
获得一个新 Access Token
   ↓
分别重放原请求
```

另外还有三层保护：

- 每个请求最多进行一次认证重放，避免无限循环。
- 请求发出后，如果用户已经退出，不再刷新或重放。
- 旧请求返回 401 时，如果当前已经是新 Token，不允许它清掉新登录状态。

这些保护对应了大量测试，例如“旧 Token 的延迟 401 不能清除新会话”和“多个 401 只能刷新一次”。

## 4. 为什么 Refresh Token 不在前端状态里

登录时，WEB 客户端把 `clientType` 设置为 `web_pc`，见 [web-session.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/web-session.ts:108)。

服务端识别为 WEB 登录后：

- Access Token 返回给 JavaScript
- Refresh Token 写入 `HttpOnly` Cookie
- 前端代码不能读取 Refresh Token

对应服务端实现在 [auth.controller.ts](/Users/liuguoping/code/Xpense/apps/server/src/modules/auth/auth.controller.ts:66)。

因此刷新请求故意不传 body：

```ts
client.post("/auth/refresh", undefined)
```

浏览器自动携带 Cookie，服务端重新签发 Access Token。当前前端使用相对地址 `/api`，开发环境再通过 Vite 代理访问后端，因此 Cookie 走的是同源路径。

好处是长期有效的 Refresh Token 不暴露给前端 JavaScript。页面刷新后内存里的 Access Token 消失，再通过 Cookie 恢复会话。

## 5. `auth-api.ts` 和 `iam-api.ts` 是业务接口层

例如 [auth-api.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/auth-api.ts:42)：

```ts
login(input)
getCurrentUser()
switchOrganization(id)
revokeSession(id)
```

以及 [iam-api.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/iam-api.ts:148)：

```ts
listMembers()
createRole()
editRolePermissions()
getAuthorizedMenus()
```

这一层的价值是把：

```ts
POST /roles/permissions/edit
```

翻译成：

```ts
api.editRolePermissions(input)
```

页面依赖业务语言，而不是 URL 和 HTTP 细节。

这些 API 都使用 `createXApi(client)` 工厂，而不是直接引用全局 Axios，主要是为了：

- 测试时注入假的 client
- 为不同会话创建相互隔离的 client
- 避免领域 API 直接依赖 Zustand
- 避免认证层和业务接口层循环依赖

## 6. 为什么 URL 是 `/list`、`/create`、`/update`

这是服务端明确规定的“动作式 API”，不是 React 或 Axios 要求。

项目规定：

```text
GET  /members/list
POST /members/create
POST /members/update
POST /members/delete
```

并要求更新、删除的 ID 放在 body 中。完整约定见 [apps/server/ARCHITECTURE.md](/Users/liuguoping/code/Xpense/apps/server/ARCHITECTURE.md:70)。

这样设计的主要目的，是让接口动作和权限码直接对应：

```text
members:create ↔ POST /members/create
members:update ↔ POST /members/update
```

它的优点是权限映射直观、前后端命名统一；缺点是放弃了一部分标准 REST 语义，例如 HTTP method、自带缓存语义和通用 API 工具支持。

所以这里“这么写”是项目主动选择，不是唯一正确方案。

## 7. `web-session.ts` 为什么比普通 API 文件复杂

[web-session.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/web-session.ts:83) 实际上不是接口定义，而是会话工作流协调器。

它保证下面几个状态一起变化：

```text
Access Token
当前用户
当前组织
角色和权限
组织菜单
```

例如切换组织不是简单调用一个接口：

```text
清空旧菜单
→ 请求切换组织
→ 服务端签发包含新组织的新 Token
→ 用新 Token 获取完整用户权限
→ 更新用户上下文
→ 加载新组织菜单
```

服务端切换组织时确实会重新签发 Access Token，见 [organizations.service.ts](/Users/liuguoping/code/Xpense/apps/server/src/modules/organizations/organizations.service.ts:22)。

如果中途失败，`web-session` 还要决定：

- 切换请求失败：保留原来的登录和组织
- 已切换成功，但新用户上下文加载失败：清空本地认证，避免 Token 与权限状态不一致
- 切换过程中用户退出：忽略随后返回的旧结果
- 连续点击切换：只允许一个切换操作执行

`WeakMap<AuthStoreApi, SessionMutationCoordinator>` 则是让每个 store 拥有自己的并发协调器，同时不阻止测试 store 被回收。

## 我的整体判断

这套设计的核心方向是正确的，复杂度主要来自安全和并发，而不是单纯过度封装。尤其是下面几项很有价值：

- Refresh Token 使用 HttpOnly Cookie
- 并发 401 共享一次刷新
- 旧请求不能清除或覆盖新登录
- POST 默认不自动重试
- 业务接口与底层 HTTP 解耦
- 登录、权限、组织和菜单保持一致

但也有几个值得后续治理的点：

- [api-client.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/api-client.ts:163) 已经 382 行，同时负责协议、重试、取消、认证刷新和追踪，接近需要按职责拆分的临界点。
- 除 `foundation-api` 外，多数接口只有 TypeScript 类型，没有运行时响应校验；服务端返回错误结构时只能到使用阶段才暴露。
- `patch`、`delete` 和 `cancelKey` 当前基本没有业务调用，属于预留能力。
- 如果以后把 API 改成真正的跨域绝对地址，需要重新确认 Axios 的 Cookie凭据配置；当前相对 `/api` 的同源模式没有这个问题。
- “第二次组织切换直接复用第一次 Promise”的策略会忽略用户最新一次选择；目前 UI 禁止连续点击，所以问题不大，但它属于需要明确的产品语义。


不是不能，而是“不适合把全部功能塞进去”。现在的设计其实已经封装了，只是封装入口是 `createWebSession`，不是 `createApiClient`。

## 两者管理的是不同生命周期

| 模块 | 管理的事情 |
|---|---|
| `createApiClient` | 一次 HTTP 请求如何发送、解析、重试、取消 |
| `createWebSession` | 用户从登录到退出期间，认证、组织、权限、菜单如何保持一致 |

`createApiClient` 关心的是：

```text
请求 → Token → 响应解析 → 401 刷新 → 重试
```

`web-session` 关心的是：

```text
登录 → 获取用户 → 更新 Store → 加载组织菜单
切换组织 → 换 Token → 换权限 → 换菜单
退出 → 清理所有本地状态
```

后者已经属于业务流程，而不只是 HTTP。

## 为什么 401 刷新又放在 `createApiClient` 里

这里做了一个比较合理的职责切割。

`createApiClient` 负责通用机制：

```ts
401
→ 调用 refreshAccessToken
→ 使用新 Token 重放原请求
```

但它不知道 Refresh Token 在哪里，也不知道刷新成功后应该更新哪个 Store：

```ts
refreshAccessToken?: (
  requestAccessToken: string,
) => Promise<string | null>
```

具体的 WEB 策略由 [web-session.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/web-session.ts:345) 注入：

```ts
refreshAccessToken: async (requestAccessToken) => {
  const { accessToken } = await apiClient.post(
    "/auth/refresh",
    undefined,
    {
      authFailure: "ignore",
      authRefresh: "ignore",
    },
  );

  // 确认这还是当前会话
  if (authStore.getState().accessToken !== requestAccessToken) {
    return null;
  }

  authStore.getState().setAccessToken(accessToken);
  return accessToken;
}
```

也就是说：

```text
api-client：我知道何时需要刷新
web-session：我知道 WEB 应该怎样刷新
```

这是依赖倒置：底层客户端通过回调请求上层提供策略，而不是直接依赖 Zustand 和 WEB 登录实现。

## 如果都塞进 `createApiClient` 会怎样

它的参数可能会变成这样：

```ts
createApiClient({
  baseUrl,
  authStore,
  menuStore,
  clientType: "web_pc",
  loadMenus,
  getCurrentUser,
  onLogin,
  onLogout,
  onOrganizationSwitch,
})
```

随后会产生几个问题。

### 1. 通用客户端与 WEB 业务绑死

现在公共接口可以这样创建：

```ts
createApiClient({
  baseUrl,
  getAccessToken: () => null,
})
```

例如 [foundation-api.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/foundation-api.ts:10) 就不需要登录态。

如果把 `web-session` 塞进去，即使只是调用公开接口，也要引入：

- `authStore`
- `menuStore`
- WEB Cookie 刷新逻辑
- 组织切换逻辑

客户端就不再通用了。

### 2. 移动端与 WEB 的刷新方式不同

WEB：

```text
Refresh Token → HttpOnly Cookie
```

移动端：

```text
Refresh Token → JSON body / 安全存储
```

服务端已经明确区分这两种传输方式，见 [auth.service.ts](/Users/liuguoping/code/Xpense/apps/server/src/modules/auth/auth.service.ts:361)。

如果 `createApiClient` 内置 WEB Cookie 流程，以后移动端就无法复用；如果同时兼容两套流程，`createApiClient` 又会充满平台判断。

### 3. HTTP 客户端开始理解组织和菜单

切换组织时，`web-session` 需要：

1. 暂时清理旧菜单。
2. 请求切换组织。
3. 保存新 Token。
4. 获取新用户、角色和权限。
5. 加载新组织菜单。
6. 防止旧请求覆盖新登录状态。

见 [web-session.ts](/Users/liuguoping/code/Xpense/apps/web/src/services/web-session.ts:137)。

这些都是 Xpense 的业务语义。一个 HTTP 客户端不应该知道“组织”“权限”“菜单”是什么。

### 4. 容易形成循环依赖

目前关系是：

```text
api-client
    ↑
auth-api / iam-api
    ↑
web-session
```

其中：

- `auth-api` 需要 `apiClient`
- `web-session` 需要 `authApi`
- Token 刷新又需要调用 `/auth/refresh`

如果把完整会话流程放进 `createApiClient`，它就要同时创建或了解 `authApi`，依赖关系会变成环。

现在通过回调解决了这个问题：客户端只调用 `refreshAccessToken()`，不需要知道刷新接口和 Store 的具体实现。

## 现在其实已经提供了统一封装入口

[createWebSession](/Users/liuguoping/code/Xpense/apps/web/src/services/web-session.ts:345) 正是整个 WEB API 系统的“组装入口”：

```ts
const apiClient = createApiClient(...)
const authApi = createAuthApi(apiClient)
const iamApi = createIamApi(apiClient)

return {
  authApi,
  iamApi,
  authStore,
  menuStore,
  restoreSession,
}
```

业务页面最终使用的是：

```ts
webSession.authApi
webSession.iamApi
webSession.authStore
webSession.menuStore
```

因此并不是没有封装，而是采用了组合：

```text
createApiClient      创建通用通信能力
createAuthApi        创建认证领域接口
createIamApi         创建权限领域接口
createWebSession     把上述能力组合成完整 WEB 会话
```

## 我的判断

当前边界总体合理。最值得保留的原则是：

> `createApiClient` 负责请求级机制，`createWebSession` 负责会话级业务一致性。

可以把两者在目录或命名上整理得更清楚，例如将 `web-session.ts` 视为 `application service` 或 `session coordinator`，但不建议把登录、退出、组织切换、权限和菜单同步全部下沉进 `createApiClient`。那会让一个已经 382 行的请求客户端承担更多不属于它的职责。
