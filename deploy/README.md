# Linux 部署：每天 0 点自动抢券

脚本本身负责"等到 0 点并自动开火"（时钟校准 → 预热登录 → 连接保活 → 提前 100ms 开火），
Linux 上只需要：装 Node → 填 Cookie → 配一个每天 23:55 拉起它的定时器。

## 1. 安装 Node.js（>= 22，推荐 24）

```bash
# Debian/Ubuntu（NodeSource 官方源，Node 24）
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# 或者用 fnm/nvm 装到用户目录亦可，只要 node --version >= 22
node --version
```

> cookie@2 依赖要求 Node >= 22。Node 24 可直接 `node main.ts`（原生 TS 支持），
> Node 22 走项目自带的 `node_modules/.bin/tsx`（下面 systemd 单元默认用它）。

## 2. 部署代码

```bash
sudo mkdir -p /opt/partner-perks-ne
# 方式一：git 克隆（推荐，方便更新）
sudo git clone <你的仓库地址> /opt/partner-perks-ne
# 方式二：从本机拷贝
# scp -r ./partner-perks-ne user@server:/tmp/ && sudo mv /tmp/partner-perks-ne /opt/

cd /opt/partner-perks-ne
sudo npm install
```

## 3. 配置账号

纯协议手机号登录优先读取用户导入的 `.login-device.json`，没有档案时初始化原生 Node 设备。智能验证失败后会获取滑块并使用纯 JavaScript 图片解码和匹配求解，依赖由 `npm install` 安装，不需要浏览器或 Python/OpenCV。使用已有设备档案的自动滑块和手机号绑定预检查已通过；原生 Node 环境仍有拒绝，完整短信登录尚未完成端到端验证。可先检查初始化、VDF 和验证码，不发送短信：

```bash
cd /opt/partner-perks-ne
npm run login -- --preflight
npm run login -- --preflight --check-captcha
```

验证码预检查通过后，可在交互终端执行 `npm run login`：输入手机号、确认发送、输入短信码。服务端验证同一账号后才会保存 Passport。通过 SSH 操作请分配终端（`ssh -t`）。不要把 `login` 放进 timer/cron，它需要人工输入验证码；每天自动运行的仍是 `grant`。

当前可继续使用已有有效 Passport：

```bash
sudo cp passport.example.jsonc passport.jsonc
sudo nano passport.jsonc
sudo chmod 600 passport.jsonc
```

新增账号默认追加；续期时 `npm run login -- --replace 1` 更新第一个账号，保留其他账号。建议使用拥有部署目录的普通用户执行登录和抢券，避免保存凭证后出现文件权限不一致。

## 4. 先手动验证一次（强烈建议）

```bash
cd /opt/partner-perks-ne
TZ=Asia/Shanghai ./node_modules/.bin/tsx main.ts run --at now
```

输出包括时钟校准偏差、账号登录结果、预取权益数量以及领取接口结果；是否领取成功以实际业务响应为准。
登录失败会明确报接口 code 和缺的 Cookie。账号登录验证通过后再执行立即领取；空账号状态可以先安装定时器，服务会跳过。

## 5. 安装 systemd 定时器（推荐）

```bash
# 按实际情况改 partner-perks.service 里的 WorkingDirectory / User
sudo cp deploy/partner-perks.service deploy/partner-perks.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now partner-perks.timer

# 确认定时器已排期
systemctl list-timers partner-perks.timer
```

每天北京时间 23:55 拉起脚本，脚本内部 23:59 登录预热，00:00:00 前 100ms 开火，约 6 分钟后自行退出。timer 的 `OnCalendar` 显式指定 `Asia/Shanghai`，不依赖服务器默认时区。
机器在 23:55 处于关机状态也没关系：`Persistent=true` 会在开机后补跑，脚本会等到下一个 0 点。

服务启动前执行 `deploy/check-accounts.ts`：Passport 缺失、空数组或格式无效时会输出原因并跳过，不发起抢券请求。定时器可以先安装，配置有效账号后再运行；是否登录成功仍须通过 `auth` 单独确认。

仓库中的服务模板使用本项目的 `tsx`，安装依赖时不要使用 `--omit=dev`。若改用系统 Node 直接执行 TypeScript，请同步修改 `ExecCondition` 和 `ExecStart`，使用实际安装的 Node 路径；项目默认不安装全局 `partner-perks` 命令。

完整短信登录尚未通过时，可将可信的 Passport 填入 `/opt/partner-perks-ne/passport.jsonc`（字符串数组），保持属主 `partner-perks:partner-perks`、权限 `600`。不要把 SSH 密码、HAR 或其他凭证放入部署目录。

**查日志：**

```bash
journalctl -u partner-perks.service -n 50        # 控制台输出（登录/保活/开火/结果汇总）
ls -t /opt/partner-perks-ne/logs/ | head         # 每次执行的完整 JSON 结果
cat /opt/partner-perks-ne/logs/grant-*.json | tail -40
```

## 5'. 或者用 cron（不想用 systemd 的话）

```cron
55 23 * * * cd /opt/partner-perks-ne && TZ=Asia/Shanghai ./node_modules/.bin/tsx main.ts run >> logs/cron.log 2>&1
```

cron 粒度是分钟级，无所谓——精确到毫秒的开火时刻由脚本内部的时钟校准负责，不依赖 cron 的触发精度。

## 运维事项

| 事项 | 说明 |
|---|---|
| **时区** | 目标时刻按本地时区解析。systemd 服务锁 `TZ=Asia/Shanghai`，timer 同时指定 `Asia/Shanghai`。cron 的触发时间取决于 cron/主机时区，单独设置命令的 TZ 只影响程序，不能改变 cron 排期 |
| **时钟** | 脚本用服务器 Date 头估算偏差，网络延迟和秒级响应头会影响精度；建议系统启用时间同步 |
| **Cookie 过期** | 实际有效期由服务端决定。登录失败时更新可信的 Passport，或在短信协议完整通过后进行交互式续期 |
| **改目标时刻** | 在 `ExecStart` 末尾直接加 `--at 10:00:00`，例如 `... tsx main.ts run --at 10:00:00`；这里无需 npm 的额外 `--`。timer 的 OnCalendar 同步提前几分钟 |
| **多券类型** | 默认只抢 `PHONE_REWARD`；需要兑换码类加 `--types PHONE_REWARD,CODE` |
| **安全** | `passport.jsonc`、`auth.json`、`logs/` 含凭证和手机号相关记录，不要提交 git（已 gitignore），文件权限建议 600 |
