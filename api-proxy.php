<?php
// =============================================
// VC 智能助手 - API 代理
// 作用：在服务端安全地保管 API Key，前端通过此代理调用 AI 接口
// =============================================

// 禁用错误输出，防止 PHP 警告破坏 JSON 响应
error_reporting(0);
ini_set('display_errors', 0);

// API Key 只从服务器环境变量读取，禁止把真实 Key 提交到源码仓库。
// 多个 Key 可用英文逗号分隔：DEEPSEEK_API_KEYS=key1,key2
$apiKeySource = getenv('DEEPSEEK_API_KEYS');
if ($apiKeySource === false || trim($apiKeySource) === '') {
    $apiKeySource = getenv('DEEPSEEK_API_KEY');
}
$API_KEYS = array_values(array_filter(array_map(
    'trim',
    preg_split('/[,;]+/', $apiKeySource ?: '')
)));

// ========== 可选：默认 API 地址 ==========
$DEFAULT_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

// ========== 可选：IP 白名单（留空=不限制） ==========
$ALLOWED_IPS = [];

// ========== 可选：频率限制（0=不限制） ==========
$RATE_LIMIT_PER_MINUTE = 30;

// ========== 日志配置 ==========
// 日志文件路径（相对于本文件所在目录）
$LOG_FILE = __DIR__ . '/logs/chat.log';
// 日志保留天数 (0=永久保留)
$LOG_RETENTION_DAYS = 7;
// 管理后台密码也必须由服务器环境变量提供。
$ADMIN_PASSWORD = (string) (getenv('VC_ADMIN_PASSWORD') ?: '');

// ========== 服务端统一配置（前端看不到，也改不了） ==========
// 模型、温度、回复长度、系统提示词都在这里定死：前端传什么值都会被忽略
$SERVER_MODEL         = 'deepseek-flash';
$SERVER_TEMPERATURE   = 1;
$SERVER_MAX_TOKENS    = 8192;
// 单次 AI 请求最多等多久（秒）。宝塔 PHP-FPM 的 request_terminate_timeout 默认 100s，
// 这里必须留出余量，否则 worker 被杀，nginx 直接 502
$AI_TIMEOUT = 90;
$SERVER_SYSTEM_PROMPT = '你是一名发那科（FANUC）工业机器人领域的高级工程师，拥有15年以上现场经验。你精通发那科全系列机器人（R-2000、M-20、LR Mate、CRX协作等）及R-30iB/R-30iB Plus控制柜。你的核心能力如下：

1. **故障诊断与报警处理**：能解析所有常见报警代码（SRVO、SYST、MOTN、INTP等），根据报警现象和代码快速锁定伺服、通信、安全回路、编码器、电源等故障根源，并给出具体排障步骤。
2. **本体损坏修复**：具备独立更换减速机、伺服电机、手腕单元、平衡缸和线缆的能力；精通零点标定、抱闸间隙调整、齿轮背隙测量与补偿，能使用激光跟踪仪或传统方法恢复机器人绝对精度。
3. **高级编程与工艺**：熟练使用示教器和TP/KAREL语言编写多任务、宏程序，实现复杂码垛、弧焊、点焊、搬运、涂胶等工艺；善于配置DCS安全区域、Space Check功能，进行节拍优化和多机协同互锁。
4. **工程方案与集成**：可主导自动化工作站方案设计，进行ROBOGUIDE仿真验证；擅长视觉引导、力控打磨、第七轴联动等高级应用，并能完成与PLC（ProfiNet/EtherNet/IP）和视觉系统的通信调试。能从技术评估、报价到现场集成实现项目全流程闭环。
5. **知识沉淀与传承**：能建立报警案例库、维修作业指导书，对初级工程师进行系统培训。

请以严谨、专业、注重安全的口吻回答问题，提供可操作的技术建议。如果遇到不确定的报警或故障，应优先引导用户进行安全检查和数据记录。';

// =============================================
// 以下代码无需修改
// =============================================

try {
    // Windows 上 curl_exec 的等待时间算进 max_execution_time（Linux 不算），默认 30s
    // 会在模型想得久一点时把脚本砍掉，前端只看到 "请求失败 (500)"。放在最前面，联网搜索那条分支也覆盖到
    @set_time_limit($AI_TIMEOUT + 30);

    // 设置响应头
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');

    // 预检请求
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }

    // 只接受 POST
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => '仅支持 POST 请求']);
        exit;
    }

    // IP 白名单检查
    if (!empty($ALLOWED_IPS)) {
        $clientIP = getClientIP();
        if (!in_array($clientIP, $ALLOWED_IPS)) {
            http_response_code(403);
            echo json_encode(['error' => 'IP 不在白名单中']);
            exit;
        }
    }

    // 频率限制
    if ($RATE_LIMIT_PER_MINUTE > 0) {
        $clientIP = getClientIP();
        $rateFile = sys_get_temp_dir() . '/vc_rate_' . md5($clientIP);
        $now = time();
        $window = 60;
        $requests = [];
        if (file_exists($rateFile)) {
            $data = @file_get_contents($rateFile);
            $requests = $data ? json_decode($data, true) : [];
            $requests = array_filter($requests, function($t) use ($now, $window) {
                return $t > ($now - $window);
            });
        }
        if (count($requests) >= $RATE_LIMIT_PER_MINUTE) {
            http_response_code(429);
            echo json_encode(['error' => '请求过于频繁，请稍后再试']);
            exit;
        }
        $requests[] = $now;
        @file_put_contents($rateFile, json_encode($requests), LOCK_EX);
    }

    // 读取 API Key
    $apiKey = '';
    if (!empty($API_KEYS)) {
        $apiKey = $API_KEYS[0];
    } else {
        http_response_code(500);
        echo json_encode(['error' => '服务端未配置 API Key，请设置 DEEPSEEK_API_KEY 环境变量']);
        exit;
    }

    // 读取请求数据
    $input = file_get_contents('php://input');
    if ($input === false || $input === '') {
        // 请求体超过 post_max_size 时 php://input 为空，PHP 会在脚本执行前吐警告
        $declared = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($declared > 0) {
            http_response_code(413);
            echo json_encode([
                'error' => '上传内容过大（' . round($declared / 1048576, 1) . 'MB），'
                    . '服务端 post_max_size = ' . ini_get('post_max_size')
                    . '，请少传几张图或调大该值',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(400);
        echo json_encode(['error' => '未收到请求数据']);
        exit;
    }
    $data = json_decode($input, true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => '请求数据格式错误']);
        exit;
    }

    // ---- 联网搜索分支（前端 action=search）----
    if (isset($data['action']) && $data['action'] === 'search') {
        $query = trim((string)($data['query'] ?? ''));
        if ($query === '') {
            http_response_code(400);
            echo json_encode(['error' => '缺少搜索关键词']);
            exit;
        }
        $results = webSearch($query, 5);
        echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!isset($data['messages'])) {
        http_response_code(400);
        echo json_encode(['error' => '请求数据格式错误']);
        exit;
    }

    // ---- 提取用户提问内容（用于日志） ----
    // 注意：带图时 content 是数组 [{type:'text',...},{type:'image_url',...}]，必须先摊平
    $userQuestion = '';
    foreach ($data['messages'] as $msg) {
        if (isset($msg['role']) && $msg['role'] === 'user' && !empty($msg['content'])) {
            $t = contentToText($msg['content']);
            if ($t !== '') $userQuestion = $t;
        }
    }
    // 如果 messages 里没有 user，可能第一个 user 消息在前端，取最后一个消息
    if ($userQuestion === '' && !empty($data['messages'])) {
        $lastMsg = end($data['messages']);
        $userQuestion = (isset($lastMsg['role']) && $lastMsg['role'] === 'user')
            ? contentToText($lastMsg['content'] ?? '')
            : '(非用户消息)';
    }
    $clientIP = getClientIP();
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';

    // 确定目标 API 地址
    $endpoint = $DEFAULT_API_ENDPOINT;

    // 丢掉前端发来的 system 消息，系统提示词由服务端注入
    $clientMessages = [];
    foreach ($data['messages'] as $msg) {
        if (isset($msg['role']) && $msg['role'] === 'system') continue;
        $clientMessages[] = $msg;
    }

    // 构建请求体：模型 / 温度 / 长度 / 系统提示词一律以服务端为准
    $requestBody = [
        'model' => $SERVER_MODEL,
        'messages' => array_merge(
            [['role' => 'system', 'content' => $SERVER_SYSTEM_PROMPT]],
            $clientMessages
        ),
        'temperature' => $SERVER_TEMPERATURE,
        'max_tokens' => $SERVER_MAX_TOKENS,
        // 关掉思考模式。开着的话推理 token 会把 max_tokens 吃光，正文一个字都出不来：
        // 实测同一个问题 35.1s/finish=length/正文3字/8190 tokens → 关掉后 6.4s/finish=stop/正文1637字/991 tokens
        // 注：调大 max_tokens 或 reasoning_effort=low 都没用，推理会跟着一起涨
        'thinking' => ['type' => 'disabled'],
    ];

    // 转发请求到 AI API
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $endpoint,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($requestBody),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_RETURNTRANSFER => true,
        // ponytail: 必须低于宝塔 PHP-FPM 的 request_terminate_timeout(默认100s)，
        // 否则 worker 会被杀，nginx 直接 502，前端只看到一页 nginx 错误页
        CURLOPT_TIMEOUT => $AI_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    $curlErrno = curl_errno($ch);
    curl_close($ch);

    // ---- 记录日志（无论成功还是失败都记录） ----
    $logEntry = [
        'time' => date('Y-m-d H:i:s'),
        'ip' => $clientIP,
        'question' => mb_substr($userQuestion, 0, 500),  // 截断过长的提问
        'model' => $requestBody['model'],
        'status' => $error ? 'error' : ($httpCode >= 400 ? 'failed' : 'success'),
        'http_code' => $error ? 0 : $httpCode,
        'error_msg' => $error ?: '',
        'user_agent' => mb_substr($userAgent, 0, 200),
    ];
    writeLog($logEntry);

    // 检查 cURL 错误
    if ($error) {
        // errno 28 = 超时：多半是带图请求，模型看图+思考比较慢
        if ($curlErrno === 28) {
            http_response_code(504);
            echo json_encode([
                'error' => 'AI 响应超时（超过 ' . $AI_TIMEOUT . ' 秒）。带图提问会比较慢，'
                    . '可以少传几张图、把图裁小一点再试；'
                    . '若服务器已调大 request_terminate_timeout，可把 api-proxy.php 里的 CURLOPT_TIMEOUT 一起调大',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(502);
        echo json_encode([
            'error' => '代理请求失败: ' . $error,
            'errno' => $curlErrno
        ]);
        exit;
    }

    // 检查 HTTP 状态码
    if ($httpCode >= 400) {
        http_response_code($httpCode);
        $errorData = json_decode($response, true);
        if ($errorData && isset($errorData['error'])) {
            $msg = is_string($errorData['error']) ? $errorData['error'] : ($errorData['error']['message'] ?? '未知错误');
            echo json_encode(['error' => $msg]);
        } else {
            echo $response;
        }
        exit;
    }

    // 返回 AI 响应
    http_response_code($httpCode);
    echo $response;

} catch (Throwable $e) {   // TypeError 等 Error 不是 Exception，漏了会变成空白 500
    http_response_code(500);
    echo json_encode(['error' => '服务器内部错误: ' . $e->getMessage()]);
    exit;
}

// ---- 日志写入函数 ----
function writeLog($entry) {
    global $LOG_FILE, $LOG_RETENTION_DAYS;

    // 确保日志目录存在
    $logDir = dirname($LOG_FILE);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }

    // 写入日志（JSON Lines 格式，每行一个 JSON 对象）
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n";
    $result = @file_put_contents($LOG_FILE, $line, FILE_APPEND | LOCK_EX);

    // 定期清理旧日志（每写 10 次清理一次）
    if ($result && $LOG_RETENTION_DAYS > 0) {
        $cleanFile = sys_get_temp_dir() . '/vc_log_clean_' . md5($LOG_FILE);
        $lastClean = @file_get_contents($cleanFile);
        if (!$lastClean || (time() - intval($lastClean)) > 3600) {
            // 每小时清理一次
            @file_put_contents($cleanFile, time());
            cleanupOldLogs();
        }
    }

    return $result;
}

// ---- 清理旧日志 ----
function cleanupOldLogs() {
    global $LOG_FILE, $LOG_RETENTION_DAYS;
    if ($LOG_RETENTION_DAYS <= 0 || !file_exists($LOG_FILE)) return;

    $cutoff = time() - ($LOG_RETENTION_DAYS * 86400);
    $tempFile = $LOG_FILE . '.tmp';
    $readFp = @fopen($LOG_FILE, 'r');
    $writeFp = @fopen($tempFile, 'w');

    if (!$readFp || !$writeFp) {
        @fclose($readFp);
        @fclose($writeFp);
        return;
    }

    while (($line = fgets($readFp)) !== false) {
        $entry = json_decode($line, true);
        if ($entry && isset($entry['time'])) {
            $entryTime = strtotime($entry['time']);
            if ($entryTime !== false && $entryTime >= $cutoff) {
                fwrite($writeFp, $line);
            }
        }
    }

    fclose($readFp);
    fclose($writeFp);
    @rename($tempFile, $LOG_FILE);
}

// ---- 联网搜索 ----
// ponytail: 直接抓 Bing 结果页，无需 API Key；页面改版或要更稳时换成
// Serper / Tavily / 博查 等搜索 API（填 key 即可，返回结构沿用下面三字段）
function webSearch($query, $limit = 5) {
    $url = 'https://cn.bing.com/search?q=' . urlencode($query) . '&mkt=zh-CN&setlang=zh-CN';
    $html = httpGet($url);
    $results = [];

    if ($html === '') return $results;

    if (preg_match_all('/<li class="b_algo".*?<\/li>/s', $html, $blocks)) {
        foreach (array_slice($blocks[0], 0, $limit) as $block) {
            if (!preg_match('/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/s', $block, $m)) {
                continue;
            }
            $title = trim(html_entity_decode(strip_tags($m[2]), ENT_QUOTES, 'UTF-8'));
            $link = $m[1];
            $snippet = '';
            if (preg_match('/<p[^>]*>(.*?)<\/p>/s', $block, $p)) {
                $snippet = trim(html_entity_decode(strip_tags($p[1]), ENT_QUOTES, 'UTF-8'));
            }
            if ($title === '' || strpos($link, 'http') !== 0) continue;
            $results[] = [
                'title' => $title,
                'url' => $link,
                'snippet' => mb_substr($snippet, 0, 300),
            ];
        }
    }
    return $results;
}

function httpGet($url) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept-Language: zh-CN,zh;q=0.9'],
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return $body === false ? '' : $body;
}

// ---- 把消息 content 摊平成纯文本（多模态时是数组） ----
function contentToText($content) {
    if (is_string($content)) return $content;
    if (!is_array($content)) return '';
    $text = '';
    $imgs = 0;
    foreach ($content as $part) {
        if (is_string($part)) { $text .= $part; continue; }
        if (!is_array($part)) continue;
        if (isset($part['text'])) $text .= $part['text'];
        if (isset($part['type']) && $part['type'] === 'image_url') $imgs++;
    }
    if ($imgs > 0) $text .= ' [含图片 x' . $imgs . ']';
    return $text;
}

// ---- 辅助函数 ----
function getClientIP() {
    $headers = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'];
    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ips = explode(',', $_SERVER[$header]);
            $ip = trim($ips[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return '0.0.0.0';
}
