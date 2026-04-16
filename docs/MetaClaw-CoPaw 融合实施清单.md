# MetaClaw-CoPaw 融合实施清单（平台能力内嵌）

## 1. 目标与范围

本方案采用“平台能力内嵌”路线：把 MetaClaw 的核心能力嵌入 CoPaw 现有架构，不新增独立对外代理作为强依赖。  
目标覆盖全系统（不限科研部门），优先提升：

1. 会话后学习（技能沉淀与演化）
2. 多部门技能检索与注入
3. 重计算任务调度（空闲窗口执行）
4. 质量评估闭环（评分、反馈、回灌）
5. 运行态可观测性（健康、状态、回滚）

---

## 2. 融合原则

1. **内嵌优先**：能力落在 CoPaw 的 `app/routers`、`app/store`、`console` 内，不破坏现有登录、权限、会话主链路。
2. **部门隔离**：技能和学习数据按部门隔离，支持通用能力共享但默认最小暴露。
3. **灰度发布**：先“skills-only 内嵌版”，后“评分闭环”，最后再考虑 RL 训练。
4. **可回滚**：每个阶段都提供配置开关，异常时可降级到当前稳定链路。

---

## 3. 能力映射（MetaClaw -> CoPaw）

核心参考（已拉取本地）：

1. [README.md](/home/featurize/work/aifscie/MetaClaw/README.md)
2. [api_server.py](/home/featurize/work/aifscie/MetaClaw/metaclaw/api_server.py)
3. [skill_manager.py](/home/featurize/work/aifscie/MetaClaw/metaclaw/skill_manager.py)
4. [skill_evolver.py](/home/featurize/work/aifscie/MetaClaw/metaclaw/skill_evolver.py)
5. [scheduler.py](/home/featurize/work/aifscie/MetaClaw/metaclaw/scheduler.py)
6. [claw_adapter.py](/home/featurize/work/aifscie/MetaClaw/metaclaw/claw_adapter.py)

映射清单：

1. `SkillManager` -> CoPaw 技能检索引擎（模板检索 + 向量检索双模）
2. `SkillEvolver` -> CoPaw 会话后技能演化任务
3. `Scheduler` -> CoPaw 空闲窗口任务调度器（夜间/空闲/会议时段）
4. `API health/status` -> CoPaw 运行状态面板与告警
5. `Session boundary heuristic` -> CoPaw 多端会话边界判定增强

---

## 4. 分阶段实施清单

## 阶段 A（P0，1-2 周）：内嵌 Skills Loop（无 RL）

目标：先让 CoPaw 全系统具备“会话结束后自动沉淀技能”的基础闭环。

实施项：

1. 后端新增 `skill_runtime_store.py`：保存技能元数据（部门、来源会话、版本、启用状态）。
2. 后端新增 `skill_retrieval_service.py`：实现 `template/embedding` 双检索策略。
3. 在会话结束事件中挂载 `post_session_skill_summary` 任务（异步，不阻塞用户）。
4. 新增管理接口：
   - `GET /platform/skills/runtime`
   - `POST /platform/skills/reload`
   - `POST /platform/skills/evolve`
5. 前端新增“平台学习中心”页（管理员）：查看新技能、审批启用、回滚版本。

验收标准：

1. 任意部门会话结束后可生成候选技能记录。
2. 下一会话可命中该技能并注入提示链路。
3. 新技能支持一键禁用/回滚。

## 阶段 B（P1，2 周）：跨部门技能治理与策略化注入

目标：从“会沉淀”升级到“可治理、可控注入”。

实施项：

1. 技能加标签：`department/domain/risk_level/source`。
2. 增加注入策略：
   - 部门优先
   - 全局通用兜底
   - 高风险技能需审批才可注入
3. 专家中心与技能中心联动：专家角色可绑定技能包。
4. 新增策略接口：
   - `GET /platform/skill-policies`
   - `PUT /platform/skill-policies`

验收标准：

1. 不同部门同一问题可获得不同技能注入结果。
2. 被禁用技能不再进入任何会话注入链路。
3. 策略调整后 1 分钟内生效。

## 阶段 C（P2，2-3 周）：空闲窗口调度（MadMax Lite）

目标：把重任务（技能演化、批量评估、索引重建）放到业务低峰执行。

实施项：

1. 复用 CoPaw 现有 `crons` 能力，新增 `learning_scheduler`。
2. 支持三类窗口：
   - 夜间时间窗
   - 用户空闲窗口
   - 会议占用窗口（预留日历接口）
3. 任务中断与恢复：用户活跃时自动暂停，恢复后断点继续。
4. 新增状态接口：
   - `GET /platform/learning-scheduler/status`

验收标准：

1. 重任务不影响前台会话响应。
2. 任务可暂停、可恢复、可追踪。
3. 调度状态可在后台管理页面可视化。

## 阶段 D（P3，3-4 周）：质量评分闭环（PRM 样式，不上 RL）

目标：先建立评分闭环，不立即做线上 RL 训练。

实施项：

1. 新增 `response_quality_scorer` 服务：按任务类型评估回答质量。
2. 将低分会话自动流入“技能演化候选池”。
3. 构建运营看板指标：
   - 会话质量分布
   - 技能命中率
   - 低分会话下降率

验收标准：

1. 每个部门可看到质量趋势。
2. 新增技能后，相关场景质量指标有提升。
3. 评分链路可关闭，关闭后不影响主会话功能。

---

## 5. CoPaw 代码改造落点（建议路径）

后端（新增）：

1. `src/copaw/app/skill_runtime_store.py`
2. `src/copaw/app/skill_retrieval_service.py`
3. `src/copaw/app/skill_evolution_service.py`
4. `src/copaw/app/learning_scheduler.py`
5. `src/copaw/app/quality_scorer.py`
6. `src/copaw/app/routers/platform_learning.py`

后端（改造）：

1. `src/copaw/app/routers/prompt_templates.py`：注入策略入口
2. `src/copaw/app/custom_app.py`：会话后异步触发演化任务
3. `src/copaw/app/crons/*`：调度器挂载

前端（新增）：

1. `console/src/pages/PlatformLearning/index.tsx`
2. `console/src/api/modules/platformLearning.ts`
3. `console/src/api/types/platformLearning.ts`

前端（改造）：

1. 管理端导航增加“平台学习中心”
2. 专家中心增加“技能包绑定”入口

---

## 6. 配置项清单（新增）

建议新增 `platform_learning` 配置段：

1. `enabled`：总开关
2. `retrieval_mode`：`template | embedding`
3. `auto_evolve`：会话后是否自动演化
4. `evolve_threshold`：触发阈值（质量分）
5. `scheduler.enabled`：调度总开关
6. `scheduler.sleep_window`：夜间窗口
7. `scheduler.idle_threshold_minutes`：空闲阈值
8. `department_isolation`：是否强隔离

---

## 7. 风险与控制

1. 风险：技能演化质量不稳定导致“错误经验放大”。  
   控制：引入审批流 + 质量分门槛 + 灰度启用比例。
2. 风险：跨部门技能污染。  
   控制：默认部门隔离，通用技能需白名单发布。
3. 风险：后台任务影响主链路。  
   控制：调度限流、任务熔断、可一键关闭学习模块。

---

## 8. 本周执行单（可立即开工）

1. 先落 `P0`：技能运行时存储 + 会话后演化任务框架 + 管理端只读列表页。
2. 打通最小注入链路：新技能可命中并在会话中生效。
3. 完成 3 个部门冒烟（科研部、法务部、研发部）。
4. 输出首版质量基线报表（命中率、人工可用率）。

---

## 9. 里程碑定义

1. M1（P0 完成）：系统具备自动沉淀能力，且可回滚。  
2. M2（P1 完成）：具备跨部门治理与策略注入能力。  
3. M3（P2 完成）：重任务完全后台调度，不打扰前台。  
4. M4（P3 完成）：质量闭环建立，形成可量化提升。

