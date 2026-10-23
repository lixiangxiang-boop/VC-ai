# 🥰 VC 智能助手

一个超可爱的 AI 聊天助手，可直接部署在腾讯云宝塔面板上！💕

## 项目结构

```
vc-assistant/
├── index.html        # 主页面
├── api-proxy.php     # 🔒 API 代理（安全保管 Key，需配置）
├── css/
│   └── style.css     # 样式文件（粉色可爱风）
├── js/
│   └── script.js     # 脚本文件
└── README.md         # 部署说明
```

## 预览效果

- 🌸 粉色系可爱界面设计
- 🎀 圆润元素与柔和过渡动画
- 🥰 Emoji 表情交互
- ✨ 闪光按钮效果

## 部署到宝塔面板

### 方法一：上传整个文件夹（推荐）

1. **登录宝塔面板**（通常地址：`http://你的服务器IP:8888`）
2. **添加站点**：
   - 进入「网站」→「添加站点」
   - 域名：输入你的域名（如 `vc.你的域名.com`）
   - 根目录：自动生成或手动选择
   - PHP版本：选 **PHP 8.x**（⚠️ 不要选「纯静态」，选了 PHP 不会执行，`api-proxy.php` 会直接 502 或把源码当文件下载）
   - 点击「提交」
3. **上传文件**：
   - 进入「文件」管理
   - 导航到站点根目录
   - 将本项目的所有文件（index.html、css、js 文件夹）上传到根目录
4. **设置 SSL**（可选但推荐）：
   - 进入「网站」→ 点击你的站点 →「SSL」
   - 申请免费的 Let's Encrypt 证书
5. **访问测试**：打开浏览器访问你的域名即可

### 方法二：压缩包上传

1. 将本项目的所有文件打包为 zip
2. 在宝塔面板「文件」管理中上传并解压到站点根目录
3. 确保 index.html 在站点根目录下

## 🔒 安全配置 API Key（关键步骤！）

本项目采用 **服务端代理架构**。真实 API Key 不写入源码，而是通过服务器的
`DEEPSEEK_API_KEY` 环境变量提供；前端页面完全看不到 Key。

### 第一步：配置服务器环境变量

在 PHP-FPM 或站点环境中设置：

```bash
DEEPSEEK_API_KEY=你的Key
VC_ADMIN_PASSWORD=你的强管理密码
```

多个 API Key 可使用 `DEEPSEEK_API_KEYS=key1,key2`。配置后重启 PHP-FPM。

### 第二步：选配高级安全设置

在 `api-proxy.php` 中你还可以配置：

| 功能 | 配置项 | 说明 |
|------|-------|------|
| 🛡️ **IP 白名单** | `$ALLOWED_IPS` | 只允许指定 IP 访问代理 |
| ⏱️ **频率限制** | `$RATE_LIMIT_PER_MINUTE` | 每个 IP 每分钟最大请求数 |
| 🔄 **多 Key 备用** | `$API_KEYS` 数组 | 可填多个 Key，自动使用第一个 |
| 🌐 **默认 API** | `$DEFAULT_API_ENDPOINT` | 修改可切换到其他 AI 服务 |

### 支持的 AI 服务

在 `api-proxy.php` 中修改 `$DEFAULT_API_ENDPOINT` 即可切换：

| 服务商 | 对应 `$DEFAULT_API_ENDPOINT` |
|-------|---------------------------|
| DeepSeek | https://api.deepseek.com/v1/chat/completions |
| OpenAI | https://api.openai.com/v1/chat/completions |
| 阿里通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions |
| 硅基流动 | https://api.siliconflow.cn/v1/chat/completions |

### 前端设置说明

**前端页面唯一可配置的是主题**（右上角齿轮 → 暗色调 / 亮色调，存在浏览器 localStorage）。其余全部没有可配置项——API Key 来自服务端环境变量，接口地址、模型、温度、最大回复长度和系统提示词固定在 `api-proxy.php` 顶部：

```php
$SERVER_MODEL         = 'deepseek-flash';   // DeepSeek-V4.1-Flash
$SERVER_TEMPERATURE   = 1;
$SERVER_MAX_TOKENS    = 8192;
$AI_TIMEOUT           = 90;                 // 单次请求最长等待秒数
$SERVER_SYSTEM_PROMPT = '你是一名发那科（FANUC）...';
```

请求体里固定带了 `thinking: disabled`。**不要去掉**——开着思考模式时，推理 token 会把
`max_tokens` 全部吃光，正文一个字都出不来（前端会提示「回复达到长度上限被截断」）。
实测同一问题：开 35.1s / 正文 3 字 / 8190 tokens，关 6.4s / 正文 1637 字 / 991 tokens。
调大 `max_tokens` 或设 `reasoning_effort=low` 都无效，推理量会跟着一起涨。

前端即使伪造这些参数（改请求体）也会被服务端忽略，以服务端配置为准。

### 界面主题

界面为工程风格（无插图、无粉色），两套配色由 CSS 变量驱动，切换时不需要刷新：

- 暗色调（默认）——`:root` 里的变量
- 亮色调——`[data-theme="light"]` 覆盖同名变量

页头有一段内联脚本，在样式表加载前就读 `localStorage.vc_theme` 定好 `data-theme`，避免刷新时闪一下黑/白。

## 功能特点

- ✅ 🎨 暗色 / 亮色两套主题，一键切换
- ✅ 💬 支持多轮对话
- ✅ 📂 会话历史管理（创建、切换、删除）
- ✅ 💾 对话自动保存（localStorage）
- ✅ 🤖 支持多种 AI 模型
- ✅ 🎭 自定义系统提示词
- ✅ 🌡️ 可调温度/最大Token参数
- ✅ 📱 响应式设计（支持手机和电脑）
- ✅ 🎯 快捷提示词
- ✅ ✨ 丝滑动画效果

## 📊 查看后台提问记录

AI 助手会自动记录每次提问，你可以通过管理后台查看：

### 访问地址
```
https://你的域名/admin.php
```

### 后台功能
- 🔐 **密码登录**：密码由服务器环境变量 `VC_ADMIN_PASSWORD` 提供
- 📊 **数据统计**：总提问数、成功/失败数、今日提问、独立访客
- 📝 **提问列表**：时间、IP、提问内容、模型、状态、设备信息
- 📄 **分页浏览**：每页 20 条，支持翻页
- 🗑️ **自动清理**：日志默认保留 30 天（可在 `api-proxy.php` 中修改 `$LOG_RETENTION_DAYS`）

### 日志存储位置
```
项目目录/logs/chat.log  (JSON Lines 格式，每行一条记录)
```

> ⚠️ **安全提示**：必须在服务器环境变量中设置强密码 `VC_ADMIN_PASSWORD`。

## 项目完整文件结构

```
vc-assistant/              ← 上传到网站根目录
├── index.html             # AI 助手主页面
├── api-proxy.php          # 🔒 API 代理 + 日志记录
├── admin.php              # 📊 管理后台（查看提问记录）
├── css/
│   └── style.css          # 样式文件
├── js/
│   └── script.js          # 脚本文件
├── logs/                  # 自动生成（提问日志）
│   └── chat.log
└── README.md              # 部署说明
```

## 注意事项

1. 所有对话数据存储在浏览器本地，清除浏览器缓存会丢失对话记录
2. API Key 和提问日志存储在服务端，安全可靠
3. 建议使用 HTTPS 访问，确保数据安全
4. 如有性能问题，可在设置中降低最大Token值
5. 管理后台密码必须通过 `VC_ADMIN_PASSWORD` 环境变量配置。

---

**用 🥰 让 AI 更可爱！**
