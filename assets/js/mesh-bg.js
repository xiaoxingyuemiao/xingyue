// ================================
// 背景：宇宙引力场（assets/js/mesh-bg.js）
//
// 这段代码原本内联在 zhoubian.html 里（那一页专属的背景），
// 自动预览页要复用同一套粒子，所以**原样**抽出来放在这里 —— 逻辑一个字没改。
//
// 用法：页面里要有 <canvas id="mesh"></canvas>；
//       CSS 里给它 position:fixed / inset:0 / z-index:0 / pointer-events:none，
//       再把内容层（顶栏 / main / 页脚）抬到 z-index:1 —— 这样粒子垫在最底下，
//       可以被上面的内容盖住，但自己照常运行。
//
// ⚠️ zhoubian.html 里目前还留着内联的那一份（没动它）。以后想让两页共用同一份代码，
//    把那边的 <script>…</script> 换成 <script src="assets/js/mesh-bg.js"></script> 即可。
// ================================

'use strict';

        /* ============================================================
         * 背景：宇宙引力场 —— 3000 节点，三角形连接成镭射网
         *
         *  节点：3000 个自由粒子（带生命周期：随机生成/消散）
         *  连接：网格加速的近邻三角网 —— 每个点连向最近的若干邻居，
         *        形成密集三角形网格，线段去重后逐帧重画
         *  镭射风格：加色混合('lighter') + 泛光层 + 亮芯层，蓝色激光束
         *  鼠标交互 = 引力效应：影响半径内把粒子吸入成环、切向旋转，
         *        再以核心排斥力清出一圈"宇宙空腔"（亮环 + 空心的中心）
         *
         *  另外有两个"大光点"：一个白色、一个蓝色，带明显光晕。
         *  它们和普通节点一样跟着流场走、也会被鼠标引力影响，
         *  但**不会消散**，而且靠近屏幕边缘时会被推回来（边缘斥力）。
         *  可调参数集中在下面 GLOW_POINTS。
         * ============================================================ */

        /* ---- 大光点配置（想调大小/颜色/数量就改这里）----
           光晕大小是按"屏幕上的实际长度"估的：一般人眼在 60~80cm 外看显示器，
           1cm 大约等于 40~55 个 CSS 像素，这里取 1cm ≈ 54px。
           glow 是光晕半径，所以白色光晕直径 ≈ 108px（约 2cm 视觉直径） */
        const GLOW_POINTS = [
          { color: '255, 255, 255', dot: 2.6, glow: 54, name: '白色大光点' },
          { color: '120, 190, 255', dot: 2.0, glow: 27, name: '蓝色小光点' },
        ];
        const EDGE_MARGIN = 150;   // 距屏幕边缘多少像素开始被推回
        const EDGE_FORCE  = 2.6;   // 边缘斥力强度（越大推得越急）
        const GLOW_ALPHA  = 1;     // 光点自身不闪烁（普通节点会随生命呼吸）
        (function () {
          const canvas = document.getElementById('mesh');
          if (!canvas) return;
          const ctx = canvas.getContext('2d');

          const N         = 3000;   // 节点数
          const KMB       = 3;      // 每个点连接的最近邻居数（形成三角）
          const CELL      = 48;     // 空间哈希格子尺寸
                                    // 实测：72 → 48 每帧从 23~37ms 降到约 10ms，
                                    // 视觉几乎不变（只是邻居搜索的候选集变小）
          const BUCKETS   = 4;      // 镭射线亮度分桶（按两端点生命取小）

          const BASE_SPEED = 0.7;
          const ACCEL      = 0.06;
          const RADIUS     = 230;   // 引力影响半径
          const CORE       = 46;    // 空腔（排斥核心）半径
          const GRAVITY    = 1.7;   // 引力吸入
          const ORBIT      = 0.95;  // 切向旋转（动态吸积盘）
          const CORE_REPEL = 2.3;   // 核心排斥（清出空腔）

          let W = 0, H = 0, DPR = 1;
          let x, y, vx, vy, age, life, alpha;   // Float32Array
          let sparks = [];
          let glowPoints = [];                  // 大光点（不消散、有边缘斥力）
          let last = performance.now();

          const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, inside: false };

          /* ---- 值噪声（0..1） ---- */
          function hash(ix, iy) {
            let n = (ix | 0) * 374761393 + (iy | 0) * 668265263;
            n = (n ^ (n >> 13)) * 1274126177;
            n = n ^ (n >> 16);
            return ((n >>> 0) % 10000) / 10000;
          }
          function smooth(t) { return t * t * (3 - 2 * t); }
          function valueNoise(x0, y0) {
            const ix = Math.floor(x0), iy = Math.floor(y0);
            const fx = x0 - ix, fy = y0 - iy;
            const a = hash(ix, iy), b = hash(ix + 1, iy);
            const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
            const u = smooth(fx), v = smooth(fy);
            return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
          }
          function fieldAngle(x0, y0, t) {
            return valueNoise(x0 * 0.0016 + t * 0.05, y0 * 0.0016 + t * 0.04) * Math.PI * 2.5
                 + valueNoise(x0 * 0.0045 + t * 0.02, y0 * 0.0045 - t * 0.018) * Math.PI * 1.2;
          }

          /* ---- 初始化 3000 节点（随机位置与生命周期） ---- */
          function initParticles() {
            x = new Float32Array(N); y = new Float32Array(N);
            vx = new Float32Array(N); vy = new Float32Array(N);
            age = new Float32Array(N); life = new Float32Array(N); alpha = new Float32Array(N);
            for (let i = 0; i < N; i++) {
              x[i] = Math.random() * W;
              y[i] = Math.random() * H;
              vx[i] = (Math.random() - 0.5) * 0.3;
              vy[i] = (Math.random() - 0.5) * 0.3;
              age[i] = Math.random() * 360;
              life[i] = 160 + Math.random() * 360;
            }
            initGlowPoints();
          }

          /* ---- 初始化大光点：按配置各生成一个，位置随机但避开正中间 ---- */
          function initGlowPoints() {
            glowPoints = GLOW_POINTS.map(function (cfg, i) {
              // 均匀铺开：第 i 个点落在画面的第 i 个横向区间里，避免两个点总是凑到一起
              // （它们跟着同一套确定性流场走，起点太近的话会收敛到同一个位置）
              const slot = (i + 0.5) / GLOW_POINTS.length;
              return {
                cfg: cfg,
                x: W * (slot + (Math.random() - 0.5) * 0.16),
                y: H * (0.22 + Math.random() * 0.56),
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
              };
            });
          }

          function resize() {
            DPR = Math.min(window.devicePixelRatio || 1, 2);
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width  = W * DPR;
            canvas.height = H * DPR;
            canvas.style.width  = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            initParticles();
          }

          /* ---- 点击：涟漪 + 光点 ---- */
          function burst(x0, y0, t) {
            sparks.push({ x: x0, y: y0, r: 6, a: 0.5 });
            for (let i = 0; i < 20; i++) {
              const ang = (i / 20) * Math.PI * 2 + Math.random() * 0.4;
              const sp = 0.6 + Math.random() * 2.0;
              sparks.push({ x: x0, y: y0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dot: true, life: 1 });
            }
          }

          /* ---- 主循环 ---- */
          function draw(now) {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const t = now * 0.001;

            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';

            /* 引力核心处极淡的奇点微光 */
            if (mouse.inside) {
              const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, CORE * 1.2);
              g.addColorStop(0, 'rgba(150, 200, 255, 0.22)');
              g.addColorStop(1, 'rgba(150, 200, 255, 0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(mouse.x, mouse.y, CORE * 1.2, 0, Math.PI * 2);
              ctx.fill();
            }

            /* ---- 物理：流场 + 引力空腔 ---- */
            for (let i = 0; i < N; i++) {
              const ang = fieldAngle(x[i], y[i], t);
              let dvx = Math.cos(ang) * BASE_SPEED;
              let dvy = Math.sin(ang) * BASE_SPEED;

              if (mouse.inside) {
                const dx = x[i] - mouse.x, dy = y[i] - mouse.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > 0.01 && d2 < RADIUS * RADIUS) {
                  const d = Math.sqrt(d2);
                  const fall = 1 - d / RADIUS;
                  // 引力吸入
                  dvx += (-dx / d) * fall * GRAVITY;
                  dvy += (-dy / d) * fall * GRAVITY;
                  // 切向旋转（动态吸积盘）
                  dvx += (-dy / d) * fall * ORBIT;
                  dvy += (dx / d) * fall * ORBIT;
                  // 核心排斥：清出宇宙空腔
                  if (d < CORE) {
                    const f = (1 - d / CORE) * CORE_REPEL;
                    dvx += (dx / d) * f;
                    dvy += (dy / d) * f;
                  }
                }
              }

              vx[i] += (dvx - vx[i]) * ACCEL;
              vy[i] += (dvy - vy[i]) * ACCEL;

              let nx = x[i] + vx[i];
              if (nx < 0) nx += W; else if (nx > W) nx -= W;
              let ny = y[i] + vy[i];
              if (ny < 0) ny += H; else if (ny > H) ny -= H;
              x[i] = nx; y[i] = ny;

              /* 生命周期：衰老 → 随机重生 */
              age[i] += 1;
              if (age[i] >= life[i]) {
                x[i] = Math.random() * W; y[i] = Math.random() * H;
                vx[i] = 0; vy[i] = 0;
                age[i] = 0;
                life[i] = 160 + Math.random() * 360;
              }
              alpha[i] = Math.sin(Math.PI * age[i] / life[i]);
            }

            /* ---- 大光点：同样的流场 + 鼠标引力逻辑，但不消散、且被屏幕边缘推开 ---- */
            for (let g = 0; g < glowPoints.length; g++) {
              const gp = glowPoints[g];

              // 给每个光点的流场加一点相位偏移：
              // 流场只跟"位置"有关，两个光点如果走到同一处就会被同一股力气推着，
              // 永远黏在一起（看起来只有一个点）。加偏移后它们各走各的流线。
              const ang = fieldAngle(gp.x, gp.y, t + g * 7.5);
              let dvx = Math.cos(ang) * BASE_SPEED;
              let dvy = Math.sin(ang) * BASE_SPEED;

              // 鼠标引力：和普通节点用同一套公式（吸入 + 切向旋转 + 核心排斥）
              if (mouse.inside) {
                const dx = gp.x - mouse.x, dy = gp.y - mouse.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > 0.01 && d2 < RADIUS * RADIUS) {
                  const d = Math.sqrt(d2);
                  const fall = 1 - d / RADIUS;
                  dvx += (-dx / d) * fall * GRAVITY;
                  dvy += (-dy / d) * fall * GRAVITY;
                  dvx += (-dy / d) * fall * ORBIT;
                  dvy += (dx / d) * fall * ORBIT;
                  if (d < CORE) {
                    const f = (1 - d / CORE) * CORE_REPEL;
                    dvx += (dx / d) * f;
                    dvy += (dy / d) * f;
                  }
                }
              }

              // 屏幕边缘斥力：越贴近边缘推得越猛，保证它不会跑出屏幕
              const distL = gp.x, distR = W - gp.x, distT = gp.y, distB = H - gp.y;
              if (distL < EDGE_MARGIN) dvx += (1 - distL / EDGE_MARGIN) * EDGE_FORCE;
              if (distR < EDGE_MARGIN) dvx -= (1 - distR / EDGE_MARGIN) * EDGE_FORCE;
              if (distT < EDGE_MARGIN) dvy += (1 - distT / EDGE_MARGIN) * EDGE_FORCE;
              if (distB < EDGE_MARGIN) dvy -= (1 - distB / EDGE_MARGIN) * EDGE_FORCE;

              gp.vx += (dvx - gp.vx) * ACCEL;
              gp.vy += (dvy - gp.vy) * ACCEL;
              gp.x += gp.vx;
              gp.y += gp.vy;

              // 极端情况（比如窗口被拉得很小）兜一下，别让它卡在画面外
              if (gp.x < 0) { gp.x = 0; gp.vx = Math.abs(gp.vx) * 0.5; }
              if (gp.x > W) { gp.x = W; gp.vx = -Math.abs(gp.vx) * 0.5; }
              if (gp.y < 0) { gp.y = 0; gp.vy = Math.abs(gp.vy) * 0.5; }
              if (gp.y > H) { gp.y = H; gp.vy = -Math.abs(gp.vy) * 0.5; }
            }

            /* ---- 构建空间哈希 + 近邻三角网（去重） ---- */
            const grid = new Map();
            for (let i = 0; i < N; i++) {
              const gx = (x[i] / CELL) | 0, gy = (y[i] / CELL) | 0;
              const key = gy * 4096 + gx;
              let arr = grid.get(key);
              if (!arr) { arr = []; grid.set(key, arr); }
              arr.push(i);
            }

            const seen = new Set();
            const edgeBuckets = [[], [], [], []];
            for (let i = 0; i < N; i++) {
              const gi = (x[i] / CELL) | 0, gj = (y[i] / CELL) | 0;
              // 收集 3x3 邻域候选
              const cand = [];
              for (let a = gj - 1; a <= gj + 1; a++) {
                for (let b = gi - 1; b <= gi + 1; b++) {
                  const arr = grid.get(a * 4096 + b);
                  if (arr) {
                    for (let m = 0; m < arr.length; m++) if (arr[m] !== i) cand.push(arr[m]);
                  }
                }
              }
              if (cand.length === 0) continue;

              const xi = x[i], yi = y[i];
              // 取最近的 KMB 个
              cand.sort(function (p, q) {
                const dp = (x[p] - xi) * (x[p] - xi) + (y[p] - yi) * (y[p] - yi);
                const dq = (x[q] - xi) * (x[q] - xi) + (y[q] - yi) * (y[q] - yi);
                return dp - dq;
              });
              const m = Math.min(KMB, cand.length);
              for (let k = 0; k < m; k++) {
                const j = cand[k];
                if (i < j) {
                  const key = i * N + j;
                  if (!seen.has(key)) {
                    seen.add(key);
                    const lf = Math.min(alpha[i], alpha[j]);
                    const b = Math.min(BUCKETS - 1, (lf * BUCKETS) | 0);
                    edgeBuckets[b].push(i, j);
                  }
                }
              }
            }

            /* ---- 镭射线：泛光层 + 亮芯层（分桶） ---- */
            ctx.lineCap = 'round';
            for (let b = 0; b < BUCKETS; b++) {
              const e = edgeBuckets[b];
              if (e.length === 0) continue;
              const boost = (b + 0.5) / BUCKETS;

              // 泛光
              ctx.strokeStyle = 'rgba(70, 150, 235, ' + (0.10 * boost).toFixed(3) + ')';
              ctx.lineWidth = 2.6;
              ctx.beginPath();
              for (let k = 0; k < e.length; k += 2) {
                ctx.moveTo(x[e[k]], y[e[k]]);
                ctx.lineTo(x[e[k + 1]], y[e[k + 1]]);
              }
              ctx.stroke();

              // 亮芯
              ctx.strokeStyle = 'rgba(200, 236, 255, ' + (0.40 * boost).toFixed(3) + ')';
              ctx.lineWidth = 1;
              ctx.beginPath();
              for (let k = 0; k < e.length; k += 2) {
                ctx.moveTo(x[e[k]], y[e[k]]);
                ctx.lineTo(x[e[k + 1]], y[e[k + 1]]);
              }
              ctx.stroke();
            }

            /* ---- 节点光点 ---- */
            for (let i = 0; i < N; i++) {
              const a = alpha[i];
              if (a < 0.02) continue;
              ctx.fillStyle = 'rgba(190, 225, 255, ' + (a * 0.9).toFixed(3) + ')';
              ctx.fillRect(x[i] - 0.8, y[i] - 0.8, 1.6, 1.6);
            }

            /* ---- 大光点：光晕（两圈渐变）+ 一个小而实的中心球 ---- */
            for (let g = 0; g < glowPoints.length; g++) {
              const gp = glowPoints[g];
              const col = gp.cfg.color;
              const R = gp.cfg.glow;

              // 外圈：很大很淡，负责"光晕"的整体范围
              const outer = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, R);
              outer.addColorStop(0, 'rgba(' + col + ', ' + (0.30 * GLOW_ALPHA) + ')');
              outer.addColorStop(0.45, 'rgba(' + col + ', ' + (0.08 * GLOW_ALPHA) + ')');
              outer.addColorStop(1, 'rgba(' + col + ', 0)');
              ctx.fillStyle = outer;
              ctx.beginPath();
              ctx.arc(gp.x, gp.y, R, 0, Math.PI * 2);
              ctx.fill();

              // 内圈：小而集中，让光晕有明显的亮核
              const inner = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, R * 0.22);
              inner.addColorStop(0, 'rgba(' + col + ', ' + (0.85 * GLOW_ALPHA) + ')');
              inner.addColorStop(0.6, 'rgba(' + col + ', ' + (0.25 * GLOW_ALPHA) + ')');
              inner.addColorStop(1, 'rgba(' + col + ', 0)');
              ctx.fillStyle = inner;
              ctx.beginPath();
              ctx.arc(gp.x, gp.y, R * 0.22, 0, Math.PI * 2);
              ctx.fill();

              // 中心：一个小而实的球，和光晕形成明显区分
              ctx.fillStyle = 'rgba(' + col + ', ' + (0.98 * GLOW_ALPHA) + ')';
              ctx.beginPath();
              ctx.arc(gp.x, gp.y, gp.cfg.dot, 0, Math.PI * 2);
              ctx.fill();
            }

            /* ---- 涟漪 + 光点 ---- */
            for (let i = sparks.length - 1; i >= 0; i--) {
              const sp = sparks[i];
              if (sp.dot) {
                sp.x += sp.vx; sp.y += sp.vy;
                sp.vx *= 0.92; sp.vy *= 0.92;
                sp.life -= dt * 1.5;
                if (sp.life <= 0) { sparks.splice(i, 1); continue; }
                ctx.fillStyle = 'rgba(210, 230, 255, ' + (sp.life * 0.9).toFixed(3) + ')';
                ctx.fillRect(sp.x - 0.7, sp.y - 0.7, 1.4, 1.4);
              } else {
                sp.r += 3.2;
                sp.a -= 0.03;
                if (sp.a <= 0) { sparks.splice(i, 1); continue; }
                ctx.strokeStyle = 'rgba(150, 200, 255, ' + sp.a.toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
          }

          function loop(now) { draw(now); requestAnimationFrame(loop); }

          /* ---- 事件 ---- */
          window.addEventListener('pointermove', function (e) {
            if (mouse.inside) {
              mouse.vx = e.clientX - mouse.x;
              mouse.vy = e.clientY - mouse.y;
            } else {
              mouse.vx = 0; mouse.vy = 0;
            }
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.inside = true;
          });
          // 页面只剩背景和静态内容，没有输入控件，所以点击整页都可以漾开涟漪
          window.addEventListener('pointerdown', function (e) {
            burst(e.clientX, e.clientY, performance.now() * 0.001);
          });
          document.addEventListener('pointerleave', function () {
            mouse.inside = false;
            mouse.x = -9999; mouse.y = -9999;
            mouse.vx = 0; mouse.vy = 0;
          });
          window.addEventListener('resize', resize);

          resize();
          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            draw(performance.now());
          } else {
            requestAnimationFrame(loop);
          }
        })();
