# 网易大神合作权益脚本

通过 Node HTTP 协议登录、预热会话并定时领取权益，不需要浏览器。

## 1. 安装

安装 Node.js 22 或更高版本，在项目根目录执行：

```bash
npm ci
```

## 2. 登录或配置账号

首次领取前，先在网易大神 App 的领券页面完成手机号绑定。

```bash
npm run login
```

按提示输入手机号、确认发送短信、输入短信验证码。登录成功后自动追加到根目录的 `passport.jsonc`；续期第一个账号使用 `npm run login -- --replace 1`。

只检查登录验证流程、不发送短信：

```bash
npm run login -- --preflight --check-captcha --phone 你的手机号
```

也可以将 `passport.example.jsonc` 复制为 `passport.jsonc`，填写自己的 `NTES_YD_PASSPORT` 值；多个账号按字符串数组逐项填写。不要覆盖已有账号配置。

自动滑块和手机号绑定预检查已通过实测，完整短信码登录尚未完成端到端验证；服务端拒绝验证时程序会停止，不会继续发送短信。

## 3. 定时领取

```bash
# 等到下一个本地时间 00:00，默认领取 PHONE_REWARD
npm run grant

# 指定时间和权益类型
npm run grant -- --at 10:00:00 --types PHONE_REWARD,CODE

# 立即执行，会真实发起领取请求
npm run grant -- --at now
```

程序会自动校准时间、登录预热、保持连接并执行领取；运行期间请保持电脑开机和程序运行。默认提前 100ms 发出请求，可用 `--lead` 调整。执行记录保存在 `logs/`。

仅验证已保存账号并生成 `auth.json`，不领取权益：

```bash
npm run auth
```

需要复用该会话时执行 `npm run grant -- --from-auth-file`。更多参数用 `npx tsx main.ts help` 查看；Linux 定时运行见 [部署说明](deploy/README.md)。

## 项目文件

- `main.ts`：命令行入口。
- `src/api.ts`：业务接口；`src/grant/`：抢券与调度。
- `src/login/`：登录；其中 `urs/` 包含验证码、加密和设备协议。
- `src/storage/`：凭证读写；`deploy/`：部署配置；`tests/`：现有测试源码。
- `passport.jsonc`、`auth.json`、`.login-device.json`：本机账号与设备数据，更新代码时保留。

依赖、凭证、日志、HAR 和本地调试记录均由 `.gitignore` 排除；`package-lock.json` 和 `passport.example.jsonc` 应保留在仓库。`npm run typecheck` 可检查 TypeScript 类型。
