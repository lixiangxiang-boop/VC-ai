// =============================================
// VC 智能助手 - 主脚本
// =============================================

// ---------- 数据 ----------
// 模型 / 温度 / 回复长度 / 系统提示词全部由服务端（api-proxy.php）决定，
// 前端不再保存也不再发送这些值
const DEFAULT_SETTINGS = {
    ragEnabled: true,
    ragMaxChunks: 5
};

// PHP 代理地址（api-proxy.php 和 index.html 在同一目录下）
const PROXY_URL = 'api-proxy.php';

let settings = { ...DEFAULT_SETTINGS };

// 支持的文件类型
const SUPPORTED_FILE_TYPES = {
    '.pdf': { ext: 'pdf', label: 'PDF' },
    '.docx': { ext: 'docx', label: 'Word' },
    '.doc': { ext: 'doc', label: 'Word' },
    '.txt': { ext: 'txt', label: '文本' },
    '.md': { ext: 'md', label: 'Markdown' }
};

// 文件最大大小：10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 图片附件配置
const MAX_IMAGES = 4;
const IMAGE_MAX_SIDE = 1280;          // 压缩后最长边（px）
const IMAGE_QUALITY = 0.85;
// ---------- DOM 引用 ----------
const dom = {
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menuToggle'),
    closeSidebar: document.getElementById('closeSidebar'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatHistory: document.getElementById('chatHistory'),
    messages: document.getElementById('messages'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    chatContainer: document.getElementById('chatContainer'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    userInput: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettings: document.getElementById('closeSettings'),
    toast: document.getElementById('toast'),
    // 知识库 DOM
    knowledgeToggle: document.getElementById('knowledgeToggle'),
    knowledgeBody: document.getElementById('knowledgeBody'),
    knowledgeFiles: document.getElementById('knowledgeFiles'),
    knowledgeStatus: document.getElementById('knowledgeStatus'),
    uploadBtn: document.getElementById('uploadBtn'),
    fileInput: document.getElementById('fileInput'),
    // 图片 / 联网 DOM
    imageBtn: document.getElementById('imageBtn'),
    imageInput: document.getElementById('imageInput'),
    imagePreviewBar: document.getElementById('imagePreviewBar'),
    webToggle: document.getElementById('webToggle')
};

// ---------- 状态 ----------
let conversations = [];
let currentConversationId = null;
let isGenerating = false;
let pendingImages = [];      // 待发送图片：[{ dataUrl, name }]
let webSearchEnabled = false; // 联网搜索开关

// ========== 知识库（RAG）系统 ==========
let knowledgeBase = [];
const KNOWLEDGE_STORAGE_KEY = 'vc_assistant_knowledge';

// 加载知识库
function loadKnowledgeBase() {
    const saved = localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    const seededFlag = localStorage.getItem('vc_knowledge_seeded');
    
    if (saved && seededFlag) {
        try {
            knowledgeBase = JSON.parse(saved);
        } catch (e) {
            knowledgeBase = [];
        }
    } else {
        // 首次启动：预加载 FANUC 知识库
        knowledgeBase = getPreloadedKnowledge();
        saveKnowledgeBase();
        localStorage.setItem('vc_knowledge_seeded', 'true');
    }
    renderKnowledgeFiles();
}

// 预加载 FANUC 知识库内容
function getPreloadedKnowledge() {
    return [{
        id: 'kb_preload_fanuc_001',
        fileName: 'FANUC 发那科工业机器人技术知识库.md',
        fileSize: 45678,
        fileType: 'md',
        content: '# FANUC 发那科工业机器人技术知识库\n\n\
## 产品系列总览\n\
### 发那科全系列机器人\n\
- R-2000 系列：重载通用型（100-700kg），适用于点焊、搬运、铸造\n\
- M-20 系列：中负载通用型（6-35kg），适用于弧焊、装配、涂胶\n\
- LR Mate 系列：紧凑型（5-25kg），适用于小型零件搬运、机床上下料\n\
- CRX 协作系列：协作机器人（5-25kg），适用于人机协作场景\n\
- M-710 系列：中大型（50-100kg），适用于码垛、搬运\n\
- M-900 系列：超重载（300-900kg），适用于大型工件搬运\n\
\n\
### 控制柜型号\n\
- R-30iB：标准控制柜，支持基本控制功能\n\
- R-30iB Plus：升级版，处理器速度提升，支持更多功能包\n\
- R-30iB Mate：紧凑型控制柜\n\
- R-30iB Mini：小型控制柜，适用于 LR Mate 系列\n\
\n\
## 报警代码大全\n\
### SRVO 报警（伺服系统）\n\
- SRVO-001 Operator panel E-stop：操作面板急停被按下\n\
- SRVO-002 Teach pendant E-stop：示教器急停被按下\n\
- SRVO-003 External E-stop：外部急停信号触发\n\
- SRVO-004 DCAL (Low voltage)：直流母线电压过低\n\
- SRVO-005 DCAL (High voltage)：直流母线电压过高\n\
- SRVO-006 BMC alarm：制动控制单元报警\n\
- SRVO-007 SVM alarm x：伺服放大器报警\n\
- SRVO-012 Excessive pos error：位置误差过大\n\
- SRVO-023 Encoder battery：编码器电池电压低\n\
- SRVO-024 Encoder data error：编码器数据错误\n\
- SRVO-030 Collision detected：碰撞检测\n\
\n\
### SRVO-006 BMC 报警详解\n\
可能原因：\n\
1. 控制柜内部温度过高\n\
2. 制动电阻过热\n\
3. 制动模块硬件故障\n\
4. 制动电源供应异常\n\
排障步骤：\n\
1. 检查控制柜风扇是否正常运转\n\
2. 测量制动电源电压（正常应为 24V DC）\n\
3. 检查制动电阻阻值是否在正常范围\n\
4. 更换 BMC 模块测试\n\
\n\
### SRVO-012 Excessive position error 详解\n\
可能原因：\n\
1. 伺服电机抱闸未完全释放\n\
2. 机械卡死（减速机损坏、轴承卡滞）\n\
3. 电机编码器故障导致反馈异常\n\
4. 伺服参数设置不当\n\
5. 负载超出机器人额定能力\n\
排障步骤：\n\
1. 手动盘车检查各关节是否灵活\n\
2. 检查 SERVO 参数中的误差极限值\n\
3. 降低加减速倍率测试\n\
4. 用示教器监控实际位置与指令位置偏差\n\
\n\
### SYST 报警（系统报警）\n\
- SYST-0000 System stop：系统停止\n\
- SYST-0010 SRAM error：SRAM 数据错误\n\
- SYST-0011 SRAM battery：SRAM 电池电压低\n\
- SYST-0040 Communication error：通信错误\n\
\n\
### MOTN 报警（运动报警）\n\
- MOTN-0001 Path not found：路径未找到\n\
- MOTN-0003 Near singularity：接近奇异点\n\
- MOTN-0010 Joint limit：关节极限\n\
- MOTN-0020 Speed limit exceeded：超速\n\
\n\
## 维修与保养\n\
### 定期保养周期\n\
- 编码器电池更换：每 2-3 年，在控制柜通电状态下更换\n\
- 减速机润滑油更换：每 3-5 年（或 20000 小时）\n\
- 控制柜滤网清洁：每月\n\
- 抱闸间隙检查：每年，标准值 0.2-0.4mm\n\
- 线缆检查：每季度\n\
\n\
### 减速机更换步骤\n\
1. 断电并锁定电源，在安全位置支撑机器人手臂\n\
2. 拆卸电机护罩和伺服电机（标记线缆接头位置）\n\
3. 拆卸减速机输出端连接螺栓\n\
4. 用专用吊具或支撑装置固定手臂端\n\
5. 拆卸减速机固定螺栓，取出减速机\n\
6. 清洁安装面，涂抹密封胶\n\
7. 安装新减速机，按扭矩要求拧紧螺栓\n\
8. 安装伺服电机，注意齿轮啮合标记对齐\n\
9. 进行零点标定（Mastering）\n\
10. 抱闸测试和空载运行测试\n\
\n\
### 零点标定（Mastering）\n\
快速标定：使用预留的零点标记线对齐，精度 ±0.05°\n\
精确标定：使用百分表或激光跟踪仪，精度 ±0.01°\n\
标准零点参考位置：\n\
- J1: -90°（与底座对齐标记）\n\
- J2: 0°（大臂水平）\n\
- J3: -90°（小臂垂直）\n\
- J4: 180°（手腕旋转标记对齐）\n\
- J5: 0°（手腕水平）\n\
- J6: 0°（法兰盘标记对齐）\n\
操作步骤：\n\
1. 进入 Mastering 菜单（MENU → 0 NEXT → Mastering）\n\
2. 选择标定方式（Calibrate → Quick Mastering 或 Fine Mastering）\n\
3. 将各轴移至零点参考位置\n\
4. 确认并保存零点数据\n\
\n\
## 编程与工艺\n\
### TP（示教编程）语言基础\n\
运动指令：\n\
- J P[1] 100% CNT100：关节运动\n\
- L P[2] 500mm/sec CNT50：直线运动\n\
- C P[3] P[4] 300mm/sec：圆弧运动\n\
\n\
### 弧焊工艺配置\n\
焊接参数范围：\n\
- 送丝速度：3-15 m/min\n\
- 焊接电流：100-350 A\n\
- 焊接电压：16-30 V\n\
- 焊接速度：20-80 cm/min\n\
\n\
## 工程方案与集成\n\
### ROBOGUIDE 仿真流程\n\
1. 导入 CAD 模型（工作台、夹具、工件）\n\
2. 选择机器人型号\n\
3. 搭建工作站布局\n\
4. 离线编写运动程序\n\
5. 运行仿真，检查碰撞和可达性\n\
6. 优化路径和节拍\n\
7. 生成 TP 程序并上传到控制柜\n\
\n\
### PLC 通信配置\n\
ProfiNet 配置：\n\
- 发那科控制柜作为 ProfiNet 设备\n\
- 使用 R-30iB 的 ProfiNet 选装卡\n\
- 需配置设备名称、IP 地址、I/O 映射\n\
典型 I/O 分配：32/32 字节或 64/64 字节\n\
\n\
EtherNet/IP 配置：\n\
- 发那科控制柜作为 EtherNet/IP 适配器\n\
- 使用 R-30iB 的 EtherNet/IP 选装卡\n\
- 需配置 IP 地址、输入/输出 Assembly 大小\n\
\n\
## 安全规范\n\
### 上电前检查\n\
- 确认机器人工作范围内无障碍物和人员\n\
- 检查所有安全防护装置完好\n\
- 确认示教器急停按钮正常\n\
- 确认外部安全回路连接可靠\n\
\n\
### 示教模式安全规范\n\
- 进入示教模式前确认速度倍率设为最低\n\
- 使用示教器时佩戴安全挂绳\n\
- 保持安全距离，随时准备按下急停\n\
\n\
## 常见故障案例\n\
### 案例：R-2000iC 关节 2 无法运动\n\
现象：运行时 J2 轴无法保持位置，有异响，报警 SRVO-012\n\
诊断：\n\
1. 示教器手动盘车 J2，感受阻力异常\n\
2. 检查制动电流，确认抱闸工作正常\n\
3. 脱开电机与减速机连接，单独测试电机\n\
4. 确认电机正常后判断为减速机故障\n\
修复：更换 RV-320E 减速机，重新标定零点\n\
\n\
### 案例：M-20iA 编码器报警\n\
现象：开机后报警 SRVO-023 和 SRVO-024\n\
诊断：\n\
1. 确认控制柜处于上电状态\n\
2. 测量编码器电池电压（2.1V，低于额定 3.6V）\n\
3. 判断电池电量过低导致编码器数据丢失\n\
修复：\n\
1. 保持控制柜上电状态\n\
2. 更换编码器电池组\n\
3. 对所有轴进行零点标定（Fine Mastering）\n\
\n\
## 关键参数设置\n\
伺服参数：\n\
- PGAIN（位置增益）：默认 150\n\
- VGAIN（速度增益）：默认 150\n\
- VFF（速度前馈）：默认 200\n\
- TDLIMIT（扭矩限制）：默认 120%\n\
\n\
负载参数设置：\n\
- $PAYLOAD：当前夹爪+工件重量\n\
- $PAYLOAD_FRAME：负载质心位置\n\
\n\
## 高级功能\n\
### 力控（Force Control）\n\
应用场景：精密装配、打磨抛光、去毛刺\n\
常用指令：\n\
- FORCE_SET_PARAM：设置力控参数\n\
- FORCE_CONTROL_ON：启用力控模式\n\
- FORCE_CONTROL_OFF：禁用力控模式\n\
\n\
### 第七轴联动\n\
配置要求：外部轴伺服系统 + R-30iB 附加轴选装卡\n\
应用场景：导轨行走、变位机协同、双机协同\n\
\n\
### 远程监控\n\
FANUC iHMI：通过 Web 界面远程监控机器人状态\n\
FANUC Field System：工业物联网平台\n\
ROBOGUIDE Connect：远程仿真与调试',
        uploadedAt: new Date().toISOString()
    }];
}

// 保存知识库
function saveKnowledgeBase() {
    localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(knowledgeBase));
}

// 渲染知识库文件列表
function renderKnowledgeFiles() {
    dom.knowledgeFiles.innerHTML = '';

    if (knowledgeBase.length === 0) {
        dom.knowledgeStatus.innerHTML = '<i class="fas fa-circle-info"></i> 上传文件后，对话时自动参考知识库内容';
        return;
    }

    dom.knowledgeStatus.innerHTML = '<i class="fas fa-circle-info"></i> 共 ' + knowledgeBase.length + ' 个文件，对话时自动参考';

    knowledgeBase.forEach(function(file, index) {
        const item = document.createElement('div');
        item.className = 'knowledge-file-item';

        const iconMap = {
            pdf: 'fa-file-pdf', docx: 'fa-file-word', doc: 'fa-file-word',
            txt: 'fa-file-lines', md: 'fa-file-code'
        };
        const icon = '<i class="fas ' + (iconMap[file.fileType] || 'fa-file') + '"></i>';

        const fileSizeStr = file.fileSize > 1024 * 1024
            ? (file.fileSize / 1024 / 1024).toFixed(1) + ' MB'
            : (file.fileSize / 1024).toFixed(1) + ' KB';

        const charCount = file.content ? file.content.length : 0;
        const charStr = charCount > 10000
            ? (charCount / 10000).toFixed(1) + '万字符'
            : charCount + '字符';

        item.innerHTML = '<span class="file-icon">' + icon + '</span>'
            + '<div class="file-info">'
            + '<div class="file-name">' + escapeHtml(file.fileName) + '</div>'
            + '<div class="file-meta">' + fileSizeStr + ' · ' + charStr + '</div>'
            + '</div>'
            + '<button class="file-delete" title="删除文件"><i class="fas fa-xmark"></i></button>';

        var deleteBtn = item.querySelector('.file-delete');
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteKnowledgeFile(index);
        });

        dom.knowledgeFiles.appendChild(item);
    });
}

// 删除知识库文件
function deleteKnowledgeFile(index) {
    if (!confirm('确定要删除「' + knowledgeBase[index].fileName + '」吗？删除后不可恢复。')) return;

    var fileName = knowledgeBase[index].fileName;
    knowledgeBase.splice(index, 1);
    saveKnowledgeBase();
    renderKnowledgeFiles();
    showToast('已删除「' + fileName + '」', 'success');
}

// 从知识库检索相关内容
function retrieveFromKnowledge(query) {
    if (!settings.ragEnabled || knowledgeBase.length === 0) {
        return null;
    }

    var queryLower = query.toLowerCase();
    var queryWords = queryLower.split(/[\s,，。、；;：:！!？?]+/).filter(function(w) { return w.length > 1; });

    var allChunks = [];

    knowledgeBase.forEach(function(file) {
        if (!file.content) return;

        var content = file.content;
        var chunkSize = 500;
        var overlap = 50;

        for (var i = 0; i < content.length; i += (chunkSize - overlap)) {
            var chunk = content.substring(i, i + chunkSize);
            if (chunk.trim().length < 20) continue;

            var score = 0;
            var chunkLower = chunk.toLowerCase();

            // 精确查询匹配
            if (chunkLower.indexOf(queryLower) !== -1) {
                score += queryLower.length * 3;
            }

            // 关键词匹配
            queryWords.forEach(function(word) {
                if (chunkLower.indexOf(word) !== -1) {
                    score += word.length;
                }
            });

            if (score > 0) {
                allChunks.push({
                    fileName: file.fileName,
                    fileType: file.fileType,
                    content: chunk.trim(),
                    score: score,
                    position: i
                });
            }
        }
    });

    // 按评分排序取前 N 个
    allChunks.sort(function(a, b) { return b.score - a.score; });
    var maxChunks = settings.ragMaxChunks || 5;
    var topChunks = allChunks.slice(0, maxChunks);

    if (topChunks.length === 0) return null;
    return topChunks;
}

// 构建知识库上下文文本
function buildKnowledgeContext(relevantChunks) {
    if (!relevantChunks || relevantChunks.length === 0) return '';

    // 按文件名分组
    var byFile = {};
    relevantChunks.forEach(function(chunk) {
        if (!byFile[chunk.fileName]) {
            byFile[chunk.fileName] = [];
        }
        byFile[chunk.fileName].push(chunk);
    });

    var context = '\n\n【以下是从知识库中检索到的参考信息】\n';
    context += '--- 知识库内容开始 ---\n';

    Object.keys(byFile).forEach(function(fileName) {
        context += '\n文件：' + fileName + '\n';
        context += '─────\n';

        var chunks = byFile[fileName];
        chunks.sort(function(a, b) { return a.position - b.position; });

        // 合并连续片段
        var mergedContent = '';
        var lastEnd = -1;
        chunks.forEach(function(chunk) {
            if (lastEnd >= chunk.position && mergedContent) return;
            if (mergedContent) mergedContent += '\n...\n';
            mergedContent += chunk.content;
            lastEnd = chunk.position + chunk.content.length;
        });

        context += mergedContent + '\n';
    });

    context += '\n--- 知识库内容结束 ---\n';
    context += '请根据以上参考信息回答用户的问题。如果参考信息与问题完全无关或者没有参考价值，请忽略参考信息并正常回答。\n\n';

    return context;
}

// 上传文件处理
async function handleFileUpload(files) {
    var uploadedCount = 0;
    var errorCount = 0;

    for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];

        try {
            // 检查文件大小
            if (file.size > MAX_FILE_SIZE) {
                showToast('「' + file.name + '」超过 10MB 限制，已跳过', 'error');
                errorCount++;
                continue;
            }

            // 检查文件类型
            var ext = '.' + file.name.split('.').pop().toLowerCase();
            if (!SUPPORTED_FILE_TYPES[ext]) {
                showToast('「' + file.name + '」格式不支持（支持 PDF/Word/TXT/MD）', 'error');
                errorCount++;
                continue;
            }

            // 检查是否已存在
            var exists = knowledgeBase.some(function(f) { return f.fileName === file.name; });
            if (exists) {
                showToast('「' + file.name + '」已存在于知识库中，已跳过', 'error');
                errorCount++;
                continue;
            }

            // 提取文本内容
            var content = '';
            if (ext === '.txt' || ext === '.md') {
                content = await readTextFile(file);
            } else if (ext === '.pdf') {
                content = await readPDFFile(file);
            } else if (ext === '.docx' || ext === '.doc') {
                content = await readDocxFile(file);
            }

            if (!content || content.trim().length < 10) {
                showToast('「' + file.name + '」内容为空或无法解析，已跳过', 'error');
                errorCount++;
                continue;
            }

            // 存入知识库
            knowledgeBase.push({
                id: 'kb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                fileName: file.name,
                fileSize: file.size,
                fileType: SUPPORTED_FILE_TYPES[ext].ext,
                content: content,
                uploadedAt: new Date().toISOString()
            });

            uploadedCount++;
        } catch (err) {
            console.error('文件上传错误:', file.name, err);
            showToast('「' + file.name + '」解析失败: ' + (err.message || '未知错误'), 'error');
            errorCount++;
        }
    }

    if (uploadedCount > 0) {
        saveKnowledgeBase();
        renderKnowledgeFiles();
        showToast('已导入 ' + uploadedCount + ' 个文件到知识库', 'success');
    }

    if (errorCount > 0 && uploadedCount === 0) {
        showToast('导入失败 ' + errorCount + ' 个文件', 'error');
    }
}

// 读取文本文件
function readTextFile(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) { resolve(e.target.result); };
        reader.onerror = function() { reject(new Error('文件读取失败')); };
        reader.readAsText(file);
    });
}

// 读取 PDF 文件
async function readPDFFile(file) {
    if (typeof pdfjsLib === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var fullText = '';

    for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var textContent = await page.getTextContent();
        var pageText = textContent.items.map(function(item) { return item.str; }).join(' ');
        fullText += pageText + '\n';
    }

    return fullText;
}

// 读取 DOCX 文件
async function readDocxFile(file) {
    if (typeof mammoth === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    }

    var arrayBuffer = await file.arrayBuffer();
    var result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

// 动态加载脚本
function loadScript(src) {
    return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = function() { reject(new Error('加载脚本失败: ' + src)); };
        document.head.appendChild(script);
    });
}

// 转义 HTML
function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =============================================
// 初始化
// =============================================
function init() {
    loadTheme();
    loadConversations();
    loadKnowledgeBase();
    createNewConversation();
    bindEvents();
    autoResizeTextarea();
}

// =============================================
// 主题（暗色 / 亮色）
// =============================================
const THEME_KEY = 'vc_theme';

function applyTheme(name) {
    if (name !== 'light') name = 'dark';
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem(THEME_KEY, name); } catch (e) {}

    document.querySelectorAll('.theme-option').forEach(function(el) {
        el.classList.toggle('active', el.dataset.themeValue === name);
    });
}

function loadTheme() {
    // 页头内联脚本已经按 localStorage 定好了 data-theme，这里只同步面板选中态
    applyTheme(document.documentElement.getAttribute('data-theme'));
}

// =============================================
// 对话管理
// =============================================
function loadConversations() {
    var saved = localStorage.getItem('vc_assistant_conversations');
    if (saved) {
        try {
            conversations = JSON.parse(saved);
        } catch (e) {
            conversations = [];
        }
    }
}

function saveConversations() {
    localStorage.setItem('vc_assistant_conversations', JSON.stringify(conversations));
}

function createNewConversation() {
    var id = 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    var conv = {
        id: id,
        title: '新对话',
        messages: [],
        createdAt: Date.now()
    };
    conversations.unshift(conv);
    currentConversationId = id;
    saveConversations();
    renderChatHistory();
    renderMessages();
    highlightCurrentConv();
    scrollToBottom();

    dom.welcomeScreen.style.display = 'flex';
}

function getCurrentConversation() {
    return conversations.find(function(c) { return c.id === currentConversationId; });
}

function switchConversation(id) {
    if (isGenerating) return;

    var conv = conversations.find(function(c) { return c.id === id; });
    if (!conv) return;

    currentConversationId = id;
    renderMessages();
    highlightCurrentConv();
    scrollToBottom();
}

function deleteConversation(id) {
    if (isGenerating) return;
    if (!confirm('确定要删除这个对话吗？删除后不可恢复。')) return;

    conversations = conversations.filter(function(c) { return c.id !== id; });
    saveConversations();

    if (conversations.length === 0) {
        createNewConversation();
    } else {
        if (currentConversationId === id) {
            currentConversationId = conversations[0].id;
        }
        renderMessages();
        highlightCurrentConv();
    }
    renderChatHistory();
}

function updateConversationTitle(id, title) {
    var conv = conversations.find(function(c) { return c.id === id; });
    if (!conv) return;
    conv.title = title;
    saveConversations();
    renderChatHistory();
}

// =============================================
// 渲染
// =============================================
function renderChatHistory() {
    dom.chatHistory.innerHTML = '';
    conversations.forEach(function(conv) {
        var item = document.createElement('div');
        item.className = 'chat-history-item' + (conv.id === currentConversationId ? ' active' : '');
        item.dataset.id = conv.id;

        var icon = document.createElement('i');
        icon.className = 'fas fa-comment';

        var titleSpan = document.createElement('span');
        titleSpan.textContent = conv.title;

        var deleteBtn = document.createElement('i');
        deleteBtn.className = 'fas fa-trash delete-conv';
        deleteBtn.title = '删除对话';
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteConversation(conv.id);
        });

        item.appendChild(icon);
        item.appendChild(titleSpan);
        item.appendChild(deleteBtn);

        item.addEventListener('click', function() { switchConversation(conv.id); });
        dom.chatHistory.appendChild(item);
    });
}

function highlightCurrentConv() {
    dom.chatHistory.querySelectorAll('.chat-history-item').forEach(function(el) {
        el.classList.toggle('active', el.dataset.id === currentConversationId);
    });
}

function renderMessages() {
    var conv = getCurrentConversation();
    dom.messages.innerHTML = '';

    if (!conv || conv.messages.length === 0) {
        dom.welcomeScreen.style.display = 'flex';
        return;
    }

    dom.welcomeScreen.style.display = 'none';

    conv.messages.forEach(function(msg) {
        appendMessageToDOM(msg.role, msg.content);
    });
}

function appendMessageToDOM(role, content, imageDataUrls) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'message ' + role;

    var avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = role === 'user'
        ? '<i class="fas fa-user"></i>'
        : '<i class="fas fa-robot"></i>';

    var contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (imageDataUrls && imageDataUrls.length) {
        var imgWrap = document.createElement('div');
        imgWrap.className = 'message-images';
        imageDataUrls.forEach(function(url) {
            var im = document.createElement('img');
            im.src = url;
            im.addEventListener('click', function() { window.open(url, '_blank'); });
            imgWrap.appendChild(im);
        });
        bubble.appendChild(imgWrap);
    }

    if (content) {
        var textNode = document.createElement('div');
        textNode.textContent = content;
        bubble.appendChild(textNode);
    }

    var time = document.createElement('div');
    time.className = 'message-time';
    var now = new Date();
    time.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    contentDiv.appendChild(bubble);
    contentDiv.appendChild(time);
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentDiv);

    dom.messages.appendChild(msgDiv);
    scrollToBottom();
}

function scrollToBottom() {
    dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
}

// =============================================
// 图片附件（压缩 → 预览 → 随消息发送）
// =============================================
function compressImage(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.width, img.height));
                var w = Math.max(1, Math.round(img.width * scale));
                var h = Math.max(1, Math.round(img.height * scale));
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                // ponytail: 统一转 JPEG 压体积；若需透明通道（PNG 图标类）改回 image/png 即可
                resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
            };
            img.onerror = function() { reject(new Error('图片解析失败')); };
            img.src = e.target.result;
        };
        reader.onerror = function() { reject(new Error('图片读取失败')); };
        reader.readAsDataURL(file);
    });
}

async function handleImageUpload(files) {
    for (var i = 0; i < files.length; i++) {
        if (pendingImages.length >= MAX_IMAGES) {
            showToast('最多一次发送 ' + MAX_IMAGES + ' 张图片', 'error');
            break;
        }
        var file = files[i];
        if (!file.type || file.type.indexOf('image/') !== 0) {
            showToast('「' + file.name + '」不是图片文件，已跳过', 'error');
            continue;
        }
        if (file.size > MAX_FILE_SIZE) {
            showToast('「' + file.name + '」超过 10MB 限制，已跳过', 'error');
            continue;
        }
        try {
            var dataUrl = await compressImage(file);
            pendingImages.push({ dataUrl: dataUrl, name: file.name });
        } catch (err) {
            showToast('「' + file.name + '」处理失败: ' + err.message, 'error');
        }
    }
    renderImagePreviews();
    updateSendButton();
}

function renderImagePreviews() {
    if (pendingImages.length === 0) {
        dom.imagePreviewBar.style.display = 'none';
        dom.imagePreviewBar.innerHTML = '';
        return;
    }
    dom.imagePreviewBar.style.display = 'flex';
    dom.imagePreviewBar.innerHTML = '';

    pendingImages.forEach(function(item, index) {
        var wrap = document.createElement('div');
        wrap.className = 'image-preview-item';

        var img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = item.name || '图片';
        img.title = item.name || '';

        var btn = document.createElement('button');
        btn.className = 'remove-img';
        btn.type = 'button';
        btn.textContent = '×';
        btn.addEventListener('click', function() {
            pendingImages.splice(index, 1);
            renderImagePreviews();
            updateSendButton();
        });

        wrap.appendChild(img);
        wrap.appendChild(btn);
        dom.imagePreviewBar.appendChild(wrap);
    });
}

function updateSendButton() {
    var hasContent = dom.userInput.value.trim().length > 0 || pendingImages.length > 0;
    dom.sendBtn.disabled = !hasContent || isGenerating;
}

// =============================================
// 联网搜索（经 PHP 代理，服务端抓取）
// =============================================
async function searchWeb(query) {
    var response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: query })
    });
    if (!response.ok) {
        throw new Error('搜索失败 (' + response.status + ')');
    }
    var data = await response.json();
    return data.results || [];
}

function buildWebContext(results) {
    if (!results || results.length === 0) return '';
    var ctx = '\n\n【联网搜索结果（实时抓取，可能有误差）】\n';
    results.forEach(function(r, i) {
        ctx += (i + 1) + '. ' + (r.title || '(无标题)') + '\n';
        if (r.snippet) ctx += '   ' + r.snippet + '\n';
        if (r.url) ctx += '   来源: ' + r.url + '\n';
    });
    ctx += '请结合以上联网结果回答，引用时注明来源链接。\n';
    return ctx;
}

// =============================================
// 发送消息（带 RAG 知识库检索）
// =============================================
async function sendMessage() {
    var text = dom.userInput.value.trim();
    var images = pendingImages.slice();
    if ((!text && images.length === 0) || isGenerating) return;

    dom.welcomeScreen.style.display = 'none';

    var conv = getCurrentConversation();
    if (conv && conv.messages.length === 0) {
        var title = text || '[图片]';
        title = title.length > 30 ? title.substring(0, 30) + '...' : title;
        updateConversationTitle(conv.id, title);
    }

    var displayText = text || '[图片]';
    // 注意：图片 base64 不写入 localStorage（易超配额），仅本次请求使用
    conv.messages.push({ role: 'user', content: displayText });
    saveConversations();

    appendMessageToDOM('user', displayText, images.map(function(i) { return i.dataUrl; }));
    dom.userInput.value = '';
    pendingImages = [];
    renderImagePreviews();
    dom.sendBtn.disabled = true;
    autoResizeTextarea();

    dom.loadingIndicator.style.display = 'flex';
    scrollToBottom();
    isGenerating = true;

    try {
        var extraContext = '';

        // 联网搜索：把实时结果拼进上下文
        if (webSearchEnabled && text) {
            try {
                var searchResults = await searchWeb(text);
                extraContext += buildWebContext(searchResults);
                if (searchResults.length === 0) {
                    showToast('联网搜索未返回结果，将基于已有知识回答', 'info');
                }
            } catch (searchErr) {
                showToast('联网搜索失败：' + searchErr.message, 'error');
            }
        }

        // RAG 检索：从知识库获取相关上下文
        var relevantChunks = retrieveFromKnowledge(text);
        var ragContext = buildKnowledgeContext(relevantChunks);
        if (ragContext) {
            extraContext += '\n\n[知识库参考] VC 在知识库中找到了以下相关内容，请参考回答：\n' + ragContext;
        }

        var messagesForAPI = conv.messages.slice();
        if (extraContext) {
            // 复制最后一条再追加，避免把参考上下文写回会话历史
            var lastIdx = messagesForAPI.length - 1;
            var lastUserMsg = messagesForAPI[lastIdx];
            if (lastUserMsg && lastUserMsg.role === 'user') {
                messagesForAPI[lastIdx] = {
                    role: 'user',
                    content: lastUserMsg.content + extraContext
                };
            }
        }

        var botMessage = await callAPI(messagesForAPI, images.map(function(i) { return i.dataUrl; }));

        conv.messages.push({ role: 'assistant', content: botMessage });
        saveConversations();

        dom.loadingIndicator.style.display = 'none';
        appendMessageToDOM('assistant', botMessage);

    } catch (error) {
        dom.loadingIndicator.style.display = 'none';
        showToast(error.message, 'error');
    } finally {
        isGenerating = false;
        dom.sendBtn.disabled = true;
        dom.userInput.focus();
    }
}

// =============================================
// API 调用（通过 PHP 代理）
// =============================================
async function callAPI(messages, imageDataUrls) {
    var apiMessages = [];
    var hasImages = !!(imageDataUrls && imageDataUrls.length);

    // 系统提示词由服务端注入，前端不发

    var recentMessages = messages.slice(-20);
    recentMessages.forEach(function(msg, idx) {
        var isLast = idx === recentMessages.length - 1;
        if (isLast && hasImages && msg.role === 'user') {
            // 多模态格式：文本 + 图片
            var parts = [{ type: 'text', text: msg.content }];
            imageDataUrls.forEach(function(url) {
                parts.push({ type: 'image_url', image_url: { url: url } });
            });
            apiMessages.push({ role: 'user', content: parts });
        } else {
            apiMessages.push({ role: msg.role, content: msg.content });
        }
    });

    // 模型 / 温度 / 回复长度由服务端决定，前端只发消息
    var requestBody = {
        messages: apiMessages
    };

    var response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    var contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
        var errorMsg = '';
        try {
            if (contentType.indexOf('application/json') !== -1) {
                var errorData = await response.json();
                errorMsg = errorData.error || '请求失败 (' + response.status + ')';
            } else {
                var text = await response.text();
                var preview = text.substring(0, 200).replace(/<[^>]+>/g, '').trim();
                errorMsg = '服务器返回了 HTML 错误: ' + (preview || 'PHP 配置有问题，请检查 api-proxy.php');
            }
        } catch (e) {
            errorMsg = '请求失败 (' + response.status + ')';
        }
        throw new Error(errorMsg);
    }

    if (contentType.indexOf('application/json') === -1) {
        var text = await response.text();
        var preview = text.substring(0, 200).replace(/<[^>]+>/g, '').trim();
        throw new Error('服务器返回格式错误（非 JSON）: ' + (preview || '请确认 api-proxy.php 文件已正确上传到服务器'));
    }

    var data;
    try {
        data = await response.json();
    } catch (e) {
        throw new Error('服务器返回的 JSON 解析失败，请检查 api-proxy.php 配置');
    }

    var content = '';
    if (data.choices && data.choices.length > 0) {
        content = data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content : (data.choices[0].text || '');
    } else if (data.response) {
        content = data.response;
    } else if (data.content) {
        content = data.content;
    } else {
        content = JSON.stringify(data);
    }

    // 思考型模型把 max_tokens 全用在 reasoning 上时，content 会是空的
    if (!content && data.choices && data.choices[0] && data.choices[0].finish_reason === 'length') {
        content = '回复达到长度上限被截断，请重新提问或缩小问题范围。';
    }

    return content;
}

// =============================================
// 事件绑定
// =============================================
function bindEvents() {
    // 侧边栏切换
    dom.menuToggle.addEventListener('click', function() {
        dom.sidebar.classList.toggle('open');
    });

    dom.closeSidebar.addEventListener('click', function() {
        dom.sidebar.classList.remove('open');
    });

    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (dom.sidebar.classList.contains('open') &&
                !dom.sidebar.contains(e.target) &&
                !dom.menuToggle.contains(e.target)) {
                dom.sidebar.classList.remove('open');
            }
        }
    });

    dom.sidebar.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && e.target === dom.sidebar) {
            dom.sidebar.classList.remove('open');
        }
    });

    // 新建对话
    dom.newChatBtn.addEventListener('click', function() {
        if (isGenerating) return;
        createNewConversation();
        if (window.innerWidth <= 768) {
            dom.sidebar.classList.remove('open');
        }
    });

    // 发送
    dom.sendBtn.addEventListener('click', sendMessage);

    dom.userInput.addEventListener('input', function() {
        updateSendButton();
        autoResizeTextarea();
    });

    dom.userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 快捷提示
    document.querySelectorAll('.chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            dom.userInput.value = chip.dataset.prompt;
            dom.sendBtn.disabled = false;
            dom.userInput.focus();
            autoResizeTextarea();
        });
    });

    // 设置面板
    dom.settingsBtn.addEventListener('click', function() {
        dom.settingsOverlay.classList.add('active');
    });

    // 主题切换
    document.querySelectorAll('.theme-option').forEach(function(el) {
        el.addEventListener('click', function() {
            applyTheme(el.dataset.themeValue);
        });
    });

    dom.closeSettings.addEventListener('click', function() {
        dom.settingsOverlay.classList.remove('active');
    });

    dom.settingsOverlay.addEventListener('click', function(e) {
        if (e.target === dom.settingsOverlay) {
            dom.settingsOverlay.classList.remove('active');
        }
    });

    dom.chatContainer.addEventListener('touchmove', function(e) {
        // 允许滚动
    }, { passive: true });

    // ========== 知识库（RAG）事件绑定 ==========
    // 知识库折叠/展开
    dom.knowledgeToggle.addEventListener('click', function() {
        var isHidden = dom.knowledgeBody.style.display === 'none';
        // 置空让 CSS 的 flex 布局生效，写死 'block' 会把 gap 挤掉
        dom.knowledgeBody.style.display = isHidden ? '' : 'none';
        var icon = dom.knowledgeToggle.querySelector('.knowledge-toggle-icon');
        if (icon) {
            icon.classList.toggle('open', isHidden);
        }
    });

    // 上传按钮点击
    dom.uploadBtn.addEventListener('click', function() {
        dom.fileInput.click();
    });

    // 文件选择处理
    dom.fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files);
        }
        // 重置 input 以允许重复选择同一文件
        e.target.value = '';
    });

    // 支持拖拽上传
    dom.uploadBtn.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dom.uploadBtn.style.borderColor = '#FF85A2';
        dom.uploadBtn.style.background = '#FFF0F3';
    });

    dom.uploadBtn.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dom.uploadBtn.style.borderColor = '#FFD6E0';
        dom.uploadBtn.style.background = '#FFF0F3';
    });

    dom.uploadBtn.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dom.uploadBtn.style.borderColor = '#FFD6E0';
        dom.uploadBtn.style.background = '#FFF0F3';

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
        }
    });

    // ========== 图片上传 / 联网搜索 ==========
    dom.imageBtn.addEventListener('click', function() {
        dom.imageInput.click();
    });

    dom.imageInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            handleImageUpload(e.target.files);
        }
        e.target.value = '';
    });

    // 粘贴图片（Ctrl+V 截图直接发）
    dom.userInput.addEventListener('paste', function(e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        var files = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image/') === 0) {
                var f = items[i].getAsFile();
                if (f) files.push(f);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            handleImageUpload(files);
        }
    });

    // 拖拽图片到聊天区
    dom.chatContainer.addEventListener('dragover', function(e) {
        if (e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
            e.preventDefault();
        }
    });

    dom.chatContainer.addEventListener('drop', function(e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            var imgs = [];
            for (var i = 0; i < e.dataTransfer.files.length; i++) {
                var f = e.dataTransfer.files[i];
                if (f.type && f.type.indexOf('image/') === 0) imgs.push(f);
            }
            if (imgs.length > 0) {
                handleImageUpload(imgs);
            } else {
                handleFileUpload(e.dataTransfer.files);
            }
        }
    });

    // 联网开关
    dom.webToggle.addEventListener('click', function() {
        webSearchEnabled = !webSearchEnabled;
        dom.webToggle.classList.toggle('active', webSearchEnabled);
        showToast(webSearchEnabled ? '联网搜索已开启' : '联网搜索已关闭', 'info');
    });
}

// =============================================
// 工具函数
// =============================================
function autoResizeTextarea() {
    dom.userInput.style.height = 'auto';
    dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 150) + 'px';
}

function showToast(message, type) {
    if (!type) type = 'info';
    dom.toast.textContent = message;
    dom.toast.className = 'toast ' + type;
    dom.toast.classList.add('show');

    clearTimeout(dom.toast._timer);
    dom.toast._timer = setTimeout(function() {
        dom.toast.classList.remove('show');
    }, 3000);
}

// =============================================
// 启动
// =============================================
document.addEventListener('DOMContentLoaded', init);
