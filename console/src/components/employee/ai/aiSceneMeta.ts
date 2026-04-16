export type AiActionIcon = "sparkles" | "brain" | "zap" | "arrow" | "message";
export type AiActionMode = "navigate" | "secretary";
export type AiSceneStatus = "aware" | "suggesting" | "chatting" | "warning";

export interface AiSceneActionSpec {
  key: string;
  label: string;
  mode: AiActionMode;
  type?: "primary" | "default";
  icon?: AiActionIcon;
  path?: string;
  prompt?: string;
  description?: string;
  preview?: string;
}

export interface AiSceneMeta {
  sceneKey: string;
  badge: string;
  title: string;
  description: string;
  heroSuggestion?: string;
  tags: string[];
  insights: string[];
  quickPrompts: string[];
  promptPlaceholder: string;
  resumeTitle?: string;
  resumeHint?: string;
  status: AiSceneStatus;
  actions: AiSceneActionSpec[];
  secondaryActions?: AiSceneActionSpec[];
}

export const getCurrentEmployeeName = (): string => {
  if (typeof window === "undefined") return "当前员工";
  return String(sessionStorage.getItem("copaw_user_name") || localStorage.getItem("copaw_user_name") || "当前员工").trim() || "当前员工";
};

export const resolveAiSceneMeta = (args: {
  selectedKey: string;
  currentPath: string;
  currentUserName?: string;
}): AiSceneMeta => {
  const { selectedKey, currentPath } = args;
  const currentUserName = String(args.currentUserName || getCurrentEmployeeName()).trim() || "当前员工";

  if (currentPath.startsWith("/app/member/learning")) {
    return {
      sceneKey: "member-learning",
      badge: "AI 学习副驾",
      title: "我已接住你当前的学习节奏",
      description: `${currentUserName}，我可以直接把当前课程列表整理成今天能落地的学习安排。`,
      heroSuggestion: "建议先排出今天最值得完成的 1 到 2 个学习动作。",
      tags: ["学习编排", "节奏提醒", "成长沉淀"],
      insights: ["我已识别你正在学习中心", "可以直接产出今日学习安排", "学完后还能整理成成长沉淀"],
      quickPrompts: ["排今天的学习计划", "解释我最该补哪块能力", "把当前学习内容转成成长记录"],
      promptPlaceholder: "直接告诉我你今天想补哪块能力",
      resumeTitle: "可继续：当前学习安排",
      resumeHint: "我会带上课程进度与当前页面信息，直接续接。",
      status: "suggesting",
      actions: [
        {
          key: "learning-plan",
          label: "排今日学习计划",
          mode: "secretary",
          type: "primary",
          icon: "sparkles",
          description: "按优先级给你今天的学习顺序",
          preview: "会输出今日重点、建议时长和复盘提纲",
          prompt: "学习中心：请基于当前课程与学习计划，输出今天最值得完成的 1 到 2 个学习动作、建议时长与复盘提纲。",
        },
        {
          key: "learning-gap",
          label: "解释能力缺口",
          mode: "secretary",
          icon: "brain",
          description: "判断现在最该补的能力",
          preview: "会说明原因并给出对应课程建议",
          prompt: "学习中心：请结合当前课程视图，解释我现在最该补的能力缺口，并给出对应学习建议。",
        },
        {
          key: "learning-growth-record",
          label: "转成成长记录",
          mode: "secretary",
          icon: "message",
          description: "把学习内容沉淀成成果",
          preview: "会整理成可回写的成长记录草稿",
          prompt: "学习中心：请把当前学习内容整理成一份可沉淀的成长记录草稿，包含学习主题、收获与下一步。",
        },
      ],
      secondaryActions: [
        { key: "learning-growth", label: "查看成长沉淀", mode: "navigate", path: "/app/member/growth", icon: "arrow" },
        { key: "learning-expert", label: "进入专家中心", mode: "navigate", path: "/app/expert-center", icon: "arrow" },
      ],
    };
  }

  if (currentPath.startsWith("/app/member/growth")) {
    return {
      sceneKey: "member-growth",
      badge: "AI 成长副驾",
      title: "我已接住你当前的成长诊断",
      description: "我可以直接解释成长变化、差距来源，以及下一阶段最值得投入的动作。",
      heroSuggestion: "建议先看清你和更高等级之间最关键的一道差距。",
      tags: ["成长诊断", "差距解释", "下一阶段建议"],
      insights: ["我已识别你正在查看成长结果", "可以直接解释等级差距", "也能整理成未来两周行动计划"],
      quickPrompts: ["解释我和更高等级的差距", "给我未来两周补齐方案", "把当前成长结果转成行动清单"],
      promptPlaceholder: "直接告诉我你想优先补齐哪块成长差距",
      resumeTitle: "可继续：当前成长补齐方案",
      resumeHint: "我会沿用当前成长结果，直接给你下一阶段动作。",
      status: "suggesting",
      actions: [
        {
          key: "growth-gap",
          label: "解释成长差距",
          mode: "secretary",
          type: "primary",
          icon: "brain",
          description: "拆清你和更高等级差在哪里",
          preview: "会解释差距来源，并指出最该补的点",
          prompt: "我的成长：请结合当前成长结果页，解释我与更高等级之间的关键差距，并指出最值得优先补齐的 2 个方向。",
        },
        {
          key: "growth-plan",
          label: "排两周进阶计划",
          mode: "secretary",
          icon: "sparkles",
          description: "给出未来两周的补齐节奏",
          preview: "会整理成阶段目标、动作和检查点",
          prompt: "我的成长：请基于当前成长结果，输出未来两周最有效的进阶计划，包含目标、动作与检查点。",
        },
        {
          key: "growth-action-list",
          label: "转成行动清单",
          mode: "secretary",
          icon: "message",
          description: "把结果页变成可执行事项",
          preview: "会整理成可直接推进的任务列表",
          prompt: "我的成长：请把当前成长结果页整理成一份行动清单，按优先级列出该做什么、为什么。",
        },
      ],
      secondaryActions: [
        { key: "growth-learning", label: "回学习中心补齐", mode: "navigate", path: "/app/member/learning", icon: "arrow" },
        { key: "growth-activity", label: "查看活动沉淀", mode: "navigate", path: "/app/member/activity", icon: "arrow" },
      ],
    };
  }

  if (currentPath.startsWith("/app/employee-center") || currentPath.startsWith("/app/employee/")) {
    return {
      sceneKey: "employee-center",
      badge: "AI 协同副驾",
      title: "我已接住当前协同场景",
      description: "我可以直接帮你判断先找谁、怎么分工，以及下一步怎么推进。",
      heroSuggestion: "建议先锁定 1 位最值得优先联络的人。",
      tags: ["协同推荐", "对象判断", "分工推进"],
      insights: ["我已识别你正在员工中心", "可以直接推荐优先协同对象", "也能把当前关系判断转成分工方案"],
      quickPrompts: ["推荐协同对象", "解释当前对象适合承接什么", "给我推进分工建议"],
      promptPlaceholder: "直接告诉我你现在想推进哪件协同事项",
      resumeTitle: "可继续：当前协同判断",
      resumeHint: "我会带上当前员工视图，继续帮你判断协同路线。",
      status: "aware",
      actions: [
        {
          key: "employee-collaboration",
          label: "推荐协同对象",
          mode: "secretary",
          type: "primary",
          icon: "sparkles",
          description: "先找出当前最值得联络的人",
          preview: "会说明推荐对象、原因和建议分工",
          prompt: "员工中心：请根据当前正在浏览的员工协同场景，推荐优先联络对象、原因与建议分工。",
        },
        {
          key: "employee-fit",
          label: "解释对象适配度",
          mode: "secretary",
          icon: "brain",
          description: "判断当前对象最适合承接什么",
          preview: "会说明适配原因与边界",
          prompt: "员工中心：请解释当前对象最适合承接什么任务、为什么适合，以及不适合承担什么。",
        },
        {
          key: "employee-plan",
          label: "生成推进分工",
          mode: "secretary",
          icon: "message",
          description: "把协同想法整理成推进方案",
          preview: "会产出推进顺序、角色分工与下一步动作",
          prompt: "员工中心：请结合当前协同场景，生成一份推进分工方案，包含角色、顺序与下一步动作。",
        },
      ],
      secondaryActions: [
        { key: "employee-expert", label: "查看专家中心", mode: "navigate", path: "/app/expert-center", icon: "arrow" },
        { key: "employee-workbench", label: "进入智能工作台", mode: "navigate", path: "/app/research-experiment", icon: "arrow" },
      ],
    };
  }

  if (currentPath.startsWith("/app/expert-center") || currentPath.startsWith("/app/expert/")) {
    return {
      sceneKey: "expert-center",
      badge: "AI 专家副驾",
      title: "我已接住当前专家匹配任务",
      description: "我可以直接给出该问题最适合谁介入、先后顺序和联席方式。",
      heroSuggestion: "建议先找出最值得优先联系的 1 位专家。",
      tags: ["专家匹配", "联席建议", "问题路由"],
      insights: ["我已识别你正在专家中心", "可以直接推荐专家组合", "也能整理成联席协作顺序"],
      quickPrompts: ["推荐专家组合", "解释为什么优先联系这位专家", "生成多专家联席顺序"],
      promptPlaceholder: "直接告诉我你想解决什么问题",
      resumeTitle: "可继续：当前专家判断",
      resumeHint: "我会沿用当前问题上下文，继续帮你匹配专家。",
      status: "aware",
      actions: [
        {
          key: "expert-group",
          label: "推荐专家组合",
          mode: "secretary",
          type: "primary",
          icon: "zap",
          description: "找出最匹配的专家人选",
          preview: "会说明推荐组合与各自角色",
          prompt: "专家中心：请根据当前问题上下文推荐专家组合，说明各自最适合承担的角色。",
        },
        {
          key: "expert-priority",
          label: "说明联系顺序",
          mode: "secretary",
          icon: "brain",
          description: "判断应该先联系谁",
          preview: "会解释优先顺序和原因",
          prompt: "专家中心：请解释当前问题为什么应该优先联系某位专家，并给出联系顺序。",
        },
        {
          key: "expert-joint-plan",
          label: "生成联席安排",
          mode: "secretary",
          icon: "message",
          description: "把专家协同整理成可执行方案",
          preview: "会给出联席节奏、目标与输出物",
          prompt: "专家中心：请基于当前问题生成一份多专家联席安排，包含顺序、目标与预期输出。",
        },
      ],
      secondaryActions: [
        { key: "expert-workbench", label: "查看智能工作台", mode: "navigate", path: "/app/research-experiment", icon: "arrow" },
        { key: "expert-employee", label: "查看员工中心", mode: "navigate", path: "/app/employee-center", icon: "arrow" },
      ],
    };
  }

  if (currentPath.startsWith("/app/research-experiment")) {
    return {
      sceneKey: "research-experiment",
      badge: "AI 工作台副驾",
      title: "我已接住当前任务编排",
      description: "我可以直接判断哪些任务最该先动、哪里有风险，以及下一步怎么排。",
      heroSuggestion: "先收敛最该推进的 1 到 3 个任务，再决定执行顺序。",
      tags: ["任务编排", "优先级", "风险提示"],
      insights: ["我已识别你正在智能工作台", "可以直接输出优先级判断", "也能把当前任务态势转成执行顺序"],
      quickPrompts: ["先排当前优先级", "提示我现在最大的风险", "直接给我执行顺序"],
      promptPlaceholder: "直接说现在卡在哪个任务，我来帮你排序拆解",
      resumeTitle: "可继续：当前任务编排",
      resumeHint: "我会带上工作台态势，直接帮你排序和拆解。",
      status: "warning",
      actions: [
        {
          key: "workbench-handoff",
          label: "接管当前任务编排",
          mode: "secretary",
          type: "primary",
          icon: "sparkles",
          description: "先让我判断现在哪些任务最该先动",
          preview: "会给出优先任务、原因和建议动作",
          prompt: "智能工作台：请基于当前任务调度场景，先给出最优先的 1 到 3 个任务、原因与建议动作。",
        },
        {
          key: "workbench-risk",
          label: "总结优先级与风险",
          mode: "secretary",
          icon: "brain",
          description: "快速看清当前最需要警惕的点",
          preview: "会输出优先级判断和风险提醒",
          prompt: "智能工作台：请结合当前任务场景，总结优先级判断与主要风险点，并说明为什么。",
        },
        {
          key: "workbench-order",
          label: "生成执行顺序",
          mode: "secretary",
          icon: "message",
          description: "把当前局面整理成下一步执行序列",
          preview: "会列出执行顺序、节奏与检查点",
          prompt: "智能工作台：请把当前任务调度场景整理成下一步执行顺序，包含节奏与检查点。",
        },
      ],
      secondaryActions: [
        { key: "workbench-secretary-home", label: "进入红智秘书", mode: "navigate", path: "/app/secretary", icon: "arrow" },
        { key: "workbench-expert", label: "查看专家中心", mode: "navigate", path: "/app/expert-center", icon: "arrow" },
      ],
    };
  }

  if (currentPath.startsWith("/app/secretary")) {
    return {
      sceneKey: "secretary",
      badge: "AI 主会场",
      title: "我已接住你当前的秘书会话",
      description: "你可以直接继续刚才的话题，或让我先帮你整理今天最该推进的事项。",
      heroSuggestion: "继续刚才任务，或让我先收敛今天最该推进的 3 件事。",
      tags: ["持续会话", "任务接管", "跨页面承接"],
      insights: ["我已识别你正在红智秘书主会场", "可以直接沿用最近会话背景", "也能承接员工、专家和工作台场景"],
      quickPrompts: ["继续刚才任务", "判断今天先做什么", "整理成行动清单"],
      promptPlaceholder: "直接说你现在要推进什么，我来接住上下文",
      resumeTitle: "可继续：上一段秘书任务",
      resumeHint: "我会沿用最近会话背景，不用你重新交代前情。",
      status: "chatting",
      actions: [
        {
          key: "secretary-continue",
          label: "继续上一段任务",
          mode: "secretary",
          type: "primary",
          icon: "sparkles",
          description: "沿用最近会话，直接续接当前任务",
          preview: "会先判断当前最该推进的下一步",
          prompt: "红智秘书：请直接继续我最近一段会话中的任务，先判断当前最值得推进的下一步，并说明原因。",
        },
        {
          key: "secretary-summary",
          label: "总结待处理事项",
          mode: "secretary",
          icon: "brain",
          description: "把最近会话里的待办快速收拢",
          preview: "会整理出最值得优先处理的事项",
          prompt: "红智秘书：请总结我最近会话中最值得优先处理的事项，按紧急程度和价值排序。",
        },
        {
          key: "secretary-outline",
          label: "生成今日行动提纲",
          mode: "secretary",
          icon: "message",
          description: "把当前会话整理成今天的行动安排",
          preview: "会输出今日目标、顺序和检查点",
          prompt: "红智秘书：请基于我最近会话与当前上下文，生成今天的行动提纲，包含目标、顺序与检查点。",
        },
      ],
      secondaryActions: [
        { key: "secretary-workbench", label: "进入智能工作台", mode: "navigate", path: "/app/research-experiment", icon: "arrow" },
        { key: "secretary-employee", label: "查看员工中心", mode: "navigate", path: "/app/employee-center", icon: "arrow" },
        { key: "secretary-expert", label: "查看专家中心", mode: "navigate", path: "/app/expert-center", icon: "arrow" },
      ],
    };
  }

  if (selectedKey === "member-learning" || selectedKey === "member-growth") {
    return {
      sceneKey: "member-learning-growth",
      badge: "AI 学习成长副驾",
      title: "我已接住你的学习成长联动",
      description: "我可以把当前页面直接转成学习补齐路径和成长行动项。",
      heroSuggestion: "建议先把当前内容整理成一条可执行的进阶路线。",
      tags: ["学习", "成长", "行动路线"],
      insights: ["可以直接串联学习与成长", "可以输出补齐路径", "也能整理成行动项"],
      quickPrompts: ["帮我串一下下一步", "给我学习补齐方案", "转成成长行动项"],
      promptPlaceholder: "直接告诉我你想先解决哪一步",
      resumeTitle: "可继续：学习成长路线",
      resumeHint: "我会把当前内容直接整理成下一步方案。",
      status: "suggesting",
      actions: [
        {
          key: "fallback-route",
          label: "生成进阶路线",
          mode: "secretary",
          type: "primary",
          icon: "sparkles",
          description: "把当前内容串成一条进阶路径",
          preview: "会输出阶段目标与建议顺序",
          prompt: "请结合当前页面上下文，生成一条学习到成长的进阶路线，包含阶段目标与建议顺序。",
        },
        {
          key: "fallback-gap",
          label: "解释当前缺口",
          mode: "secretary",
          icon: "brain",
          description: "判断最需要补齐的地方",
          preview: "会解释原因并给出补齐建议",
          prompt: "请结合当前页面上下文，解释我现在最需要补齐的缺口，并给出建议。",
        },
        {
          key: "fallback-actions",
          label: "转成行动项",
          mode: "secretary",
          icon: "message",
          description: "把当前内容整理成清单",
          preview: "会输出可直接推进的行动项",
          prompt: "请结合当前页面上下文，把当前内容转成一份可执行行动清单。",
        },
      ],
      secondaryActions: [
        { key: "fallback-learning", label: "进入学习中心", mode: "navigate", path: "/app/member/learning", icon: "arrow" },
        { key: "fallback-growth", label: "进入我的成长", mode: "navigate", path: "/app/member/growth", icon: "arrow" },
      ],
    };
  }

  return {
    sceneKey: "global",
    badge: "AI 全局副驾",
    title: "我已接住你当前页面",
    description: "告诉我你现在要推进什么，我会结合当前页面直接给出下一步。",
    heroSuggestion: "先让我判断当前页面最值得推进的下一步。",
    tags: ["全局在场", "页面承接", "一键执行"],
    insights: ["我会先结合当前页面给判断", "可以直接转成行动清单", "也可以随时切去红智秘书深聊"],
    quickPrompts: ["给我当前页下一步", "判断现在先做什么", "转成任务清单"],
    promptPlaceholder: "直接说你现在最想推进什么，我来给下一步",
    resumeTitle: "可继续：当前页面任务",
    resumeHint: "我会沿用当前页信息，先给你最直接的建议。",
    status: "aware",
    actions: [
      {
        key: "global-next-step",
        label: "给我下一步",
        mode: "secretary",
        type: "primary",
        icon: "sparkles",
        description: "先判断当前最该推进的动作",
        preview: "会输出一个最直接的下一步建议",
        prompt: "请结合我当前所在页面，先给我一个最直接的下一步建议，并说明原因。",
      },
      {
        key: "global-priority",
        label: "判断优先级",
        mode: "secretary",
        icon: "brain",
        description: "快速看清先做什么更值",
        preview: "会按紧急程度和价值排序",
        prompt: "请结合我当前所在页面，判断我现在最该先做什么，并按优先级排序。",
      },
      {
        key: "global-task-list",
        label: "转成任务清单",
        mode: "secretary",
        icon: "message",
        description: "把当前页面整理成可执行清单",
        preview: "会输出任务项、顺序和建议动作",
        prompt: "请结合我当前所在页面，把当前内容整理成一份可执行任务清单。",
      },
    ],
    secondaryActions: [
      { key: "global-secretary", label: "进入红智秘书", mode: "navigate", path: "/app/secretary", icon: "arrow" },
      { key: "global-workbench", label: "进入智能工作台", mode: "navigate", path: "/app/research-experiment", icon: "arrow" },
      { key: "global-expert", label: "进入专家中心", mode: "navigate", path: "/app/expert-center", icon: "arrow" },
    ],
  };
};
