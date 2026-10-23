<?php
// =============================================
// VC 智能助手 - 管理后台
// 访问地址：https://你的域名/admin.php
// 管理密码由服务器环境变量 VC_ADMIN_PASSWORD 提供
// =============================================

error_reporting(0);
ini_set('display_errors', 0);

// 引入 api-proxy.php 中的配置（共用日志路径和密码）
// 如果 api-proxy.php 在同一目录下
$configFile = __DIR__ . '/api-proxy.php';
if (!file_exists($configFile)) {
    die('错误：找不到 api-proxy.php 配置文件');
}

// 从 api-proxy.php 中提取配置变量
$configContent = file_get_contents($configFile);

// 提取日志文件路径
$LOG_FILE = __DIR__ . '/logs/chat.log';
if (preg_match('/\$LOG_FILE\s*=\s*([\'"])(.+?)\1/', $configContent, $m)) {
    // 如果是相对路径，基于 api-proxy.php 的目录
    $path = $m[2];
    if (strpos($path, '__DIR__') !== false) {
        $LOG_FILE = __DIR__ . '/logs/chat.log';
    } else {
        $LOG_FILE = $path;
    }
}

// 管理密码只从服务器环境变量读取。
$ADMIN_PASSWORD = (string) (getenv('VC_ADMIN_PASSWORD') ?: '');

// ---- 登录验证 ----
$isLoggedIn = false;
$error = '';

session_start();

// 处理登录
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($ADMIN_PASSWORD === '') {
        $error = '管理密码尚未配置，请设置 VC_ADMIN_PASSWORD 环境变量。';
    } elseif (hash_equals($ADMIN_PASSWORD, (string) $_POST['password'])) {
        $_SESSION['vc_admin_logged_in'] = true;
        $isLoggedIn = true;
    } else {
        $error = '密码错误！';
    }
}

// 处理登出
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

// 检查是否已登录
if (isset($_SESSION['vc_admin_logged_in']) && $_SESSION['vc_admin_logged_in'] === true) {
    $isLoggedIn = true;
}

// ---- 读取日志 ----
$logs = [];
$stats = [
    'total' => 0,
    'success' => 0,
    'failed' => 0,
    'today' => 0,
    'unique_ips' => [],
];

if ($isLoggedIn && file_exists($LOG_FILE)) {
    $lines = file($LOG_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines) {
        // 从后往前读取（最新的在前）
        $lines = array_reverse($lines);
        $today = date('Y-m-d');

        foreach ($lines as $line) {
            $entry = json_decode($line, true);
            if ($entry) {
                $logs[] = $entry;
                $stats['total']++;
                if ($entry['status'] === 'success') $stats['success']++;
                if ($entry['status'] === 'failed' || $entry['status'] === 'error') $stats['failed']++;
                if (strpos($entry['time'], $today) === 0) $stats['today']++;
                if (!empty($entry['ip'])) $stats['unique_ips'][$entry['ip']] = true;
            }
        }
    }
}

// 分页
$page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
$perPage = 20;
$totalPages = ceil(count($logs) / $perPage);
$page = min($page, max(1, $totalPages));
$offset = ($page - 1) * $perPage;
$pageLogs = array_slice($logs, $offset, $perPage);

?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VC 助手 - 管理后台</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5;
            color: #333;
            min-height: 100vh;
        }

        /* === 登录页 === */
        .login-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #FF85A2, #C3B1E1);
        }

        .login-box {
            background: white;
            border-radius: 20px;
            padding: 40px;
            width: 360px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            text-align: center;
        }

        .login-box h1 {
            font-size: 24px;
            margin-bottom: 8px;
            color: #4A4A6A;
        }

        .login-box p {
            color: #999;
            font-size: 14px;
            margin-bottom: 24px;
        }

        .login-box input[type="password"] {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #eee;
            border-radius: 12px;
            font-size: 16px;
            transition: border-color 0.3s;
            outline: none;
        }

        .login-box input[type="password"]:focus {
            border-color: #FF85A2;
        }

        .login-box button {
            width: 100%;
            padding: 12px;
            margin-top: 12px;
            background: linear-gradient(135deg, #FF85A2, #C3B1E1);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .login-box button:hover {
            transform: translateY(-2px);
        }

        .login-error {
            color: #FF6B8A;
            font-size: 14px;
            margin-top: 12px;
        }

        /* === 管理页面 === */
        .admin-header {
            background: linear-gradient(135deg, #FF85A2, #C3B1E1);
            color: white;
            padding: 20px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .admin-header h1 {
            font-size: 20px;
            font-weight: 600;
        }

        .admin-header .actions {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .admin-header a {
            color: white;
            text-decoration: none;
            font-size: 14px;
            opacity: 0.9;
            padding: 6px 14px;
            background: rgba(255,255,255,0.2);
            border-radius: 8px;
            transition: opacity 0.3s;
        }

        .admin-header a:hover {
            opacity: 1;
        }

        /* 统计卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 16px;
            padding: 24px;
            max-width: 1000px;
            margin: 0 auto;
        }

        .stat-card {
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            text-align: center;
        }

        .stat-card .num {
            font-size: 32px;
            font-weight: 700;
            color: #4A4A6A;
        }

        .stat-card .label {
            font-size: 13px;
            color: #999;
            margin-top: 4px;
        }

        .stat-card.green .num { color: #52c41a; }
        .stat-card.red .num { color: #FF6B8A; }
        .stat-card.purple .num { color: #C3B1E1; }
        .stat-card.orange .num { color: #FAAD14; }

        /* 日志表格 */
        .log-section {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 24px 24px;
        }

        .log-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .log-header h2 {
            font-size: 18px;
            color: #4A4A6A;
        }

        .log-header .count {
            font-size: 14px;
            color: #999;
        }

        .log-table-wrap {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        thead {
            background: #fafafa;
        }

        th {
            text-align: left;
            padding: 12px 16px;
            color: #666;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #f0f0f0;
            white-space: nowrap;
        }

        td {
            padding: 12px 16px;
            border-bottom: 1px solid #f5f5f5;
            color: #555;
            vertical-align: top;
        }

        tr:hover td {
            background: #fafafa;
        }

        .question-cell {
            max-width: 350px;
            word-break: break-word;
        }

        .question-text {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.5;
        }

        .status-badge {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
        }

        .status-badge.success {
            background: #f6ffed;
            color: #52c41a;
        }

        .status-badge.failed {
            background: #fff2f0;
            color: #ff4d4f;
        }

        .status-badge.error {
            background: #fff7e6;
            color: #fa8c16;
        }

        .time-cell {
            white-space: nowrap;
            font-size: 12px;
            color: #999;
        }

        .ip-cell {
            font-family: monospace;
            font-size: 12px;
            white-space: nowrap;
        }

        .model-cell {
            font-size: 12px;
            background: #f5f5f5;
            padding: 2px 8px;
            border-radius: 4px;
            white-space: nowrap;
            display: inline-block;
        }

        /* 分页 */
        .pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 20px 0;
        }

        .pagination a, .pagination span {
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 13px;
            text-decoration: none;
            color: #666;
            background: white;
            border: 1px solid #eee;
            transition: all 0.2s;
        }

        .pagination a:hover {
            border-color: #FF85A2;
            color: #FF85A2;
        }

        .pagination .current {
            background: linear-gradient(135deg, #FF85A2, #C3B1E1);
            color: white;
            border: none;
        }

        .pagination .disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }

        .empty-state .emoji {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .empty-state p {
            font-size: 15px;
        }

        /* 响应式 */
        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
                padding: 16px;
            }

            .log-section {
                padding: 0 12px 12px;
            }

            .log-table-wrap {
                border-radius: 12px;
                font-size: 12px;
            }

            th, td {
                padding: 8px 10px;
            }

            .question-cell {
                max-width: 180px;
            }

            .admin-header {
                padding: 14px 16px;
                flex-wrap: wrap;
                gap: 10px;
            }

            .admin-header h1 {
                font-size: 16px;
            }
        }
    </style>
</head>
<body>

<?php if (!$isLoggedIn): ?>
<!-- ====== 登录页面 ====== -->
<div class="login-page">
    <div class="login-box">
        <h1>🔐 VC 管理后台</h1>
        <p>输入密码查看提问记录</p>
        <form method="POST">
            <input type="password" name="password" placeholder="请输入管理密码" required autofocus>
            <button type="submit">登录</button>
        </form>
        <?php if ($error): ?>
            <div class="login-error">❌ <?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <p style="margin-top:16px;font-size:12px;color:#ccc;">管理密码由服务器环境变量 VC_ADMIN_PASSWORD 提供</p>
    </div>
</div>

<?php else: ?>
<!-- ====== 管理页面 ====== -->
<header class="admin-header">
    <h1>📊 VC 智能助手 · 后台管理</h1>
    <div class="actions">
        <a href="/" target="_blank">打开助手</a>
        <a href="?logout=1">退出登录</a>
    </div>
</header>

<!-- 统计卡片 -->
<div class="stats-grid">
    <div class="stat-card">
        <div class="num"><?= number_format($stats['total']) ?></div>
        <div class="label">总提问数</div>
    </div>
    <div class="stat-card green">
        <div class="num"><?= number_format($stats['success']) ?></div>
        <div class="label">成功</div>
    </div>
    <div class="stat-card red">
        <div class="num"><?= number_format($stats['failed']) ?></div>
        <div class="label">失败</div>
    </div>
    <div class="stat-card orange">
        <div class="num"><?= number_format($stats['today']) ?></div>
        <div class="label">今日提问</div>
    </div>
    <div class="stat-card purple">
        <div class="num"><?= number_format(count($stats['unique_ips'])) ?></div>
        <div class="label">独立访客</div>
    </div>
</div>

<!-- 日志列表 -->
<div class="log-section">
    <div class="log-header">
        <h2>📝 提问记录</h2>
        <span class="count">共 <?= number_format($stats['total']) ?> 条记录</span>
    </div>

    <div class="log-table-wrap">
        <?php if (empty($logs)): ?>
            <div class="empty-state">
                <div class="emoji">📭</div>
                <p>还没有提问记录，快去问 VC 一个问题吧！</p>
            </div>
        <?php else: ?>
        <table>
            <thead>
                <tr>
                    <th>时间</th>
                    <th>IP</th>
                    <th>提问内容</th>
                    <th>模型</th>
                    <th>状态</th>
                    <th>设备</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($pageLogs as $log): ?>
                <tr>
                    <td class="time-cell"><?= htmlspecialchars($log['time'] ?? '') ?></td>
                    <td class="ip-cell"><?= htmlspecialchars($log['ip'] ?? '') ?></td>
                    <td class="question-cell">
                        <div class="question-text" title="<?= htmlspecialchars($log['question'] ?? '') ?>">
                            <?= htmlspecialchars(mb_substr($log['question'] ?? '', 0, 200)) ?>
                        </div>
                    </td>
                    <td><span class="model-cell"><?= htmlspecialchars($log['model'] ?? '') ?></span></td>
                    <td>
                        <?php if ($log['status'] === 'success'): ?>
                            <span class="status-badge success">✅ 成功</span>
                        <?php elseif ($log['status'] === 'failed'): ?>
                            <span class="status-badge failed">❌ 失败</span>
                        <?php else: ?>
                            <span class="status-badge error">⚠️ 错误</span>
                        <?php endif; ?>
                        <?php if (!empty($log['error_msg'])): ?>
                            <br><small style="color:#999;"><?= htmlspecialchars($log['error_msg']) ?></small>
                        <?php endif; ?>
                    </td>
                    <td style="font-size:11px;color:#999;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        <?= htmlspecialchars(mb_substr($log['user_agent'] ?? '', 0, 60)) ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </div>

    <!-- 分页 -->
    <?php if ($totalPages > 1): ?>
    <div class="pagination">
        <?php if ($page > 1): ?>
            <a href="?page=1">首页</a>
            <a href="?page=<?= $page - 1 ?>">上一页</a>
        <?php else: ?>
            <span class="disabled">首页</span>
            <span class="disabled">上一页</span>
        <?php endif; ?>

        <?php
        // 显示页码
        $start = max(1, $page - 2);
        $end = min($totalPages, $page + 2);
        if ($start > 1) echo '<span>...</span>';
        for ($i = $start; $i <= $end; $i++):
        ?>
            <a href="?page=<?= $i ?>" class="<?= $i === $page ? 'current' : '' ?>"><?= $i ?></a>
        <?php endfor;
        if ($end < $totalPages) echo '<span>...</span>';
        ?>

        <?php if ($page < $totalPages): ?>
            <a href="?page=<?= $page + 1 ?>">下一页</a>
            <a href="?page=<?= $totalPages ?>">末页</a>
        <?php else: ?>
            <span class="disabled">下一页</span>
            <span class="disabled">末页</span>
        <?php endif; ?>
    </div>
    <?php endif; ?>
</div>

<?php endif; ?>
</body>
</html>
