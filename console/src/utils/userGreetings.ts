/**
 * 用户称谓和欢迎语处理工具
 */

export interface UserInfo {
  name: string;
  department?: string | null;
  hasCompleteProfile: boolean;
}

/**
 * 根据部门获取用户称谓
 * @param userInfo 用户信息
 * @returns 处理后的称谓
 */
export function getUserDisplayName(userInfo: UserInfo): string {
  const { name, department } = userInfo;
  
  // 总裁办特殊称谓：姓氏+总
  if (department === "总裁办" && name.length > 0) {
    return name.charAt(0) + "总";
  }
  
  return name;
}

/**
 * 获取个性化欢迎语
 * @param userInfo 用户信息
 * @returns 欢迎语
 */
export function getWelcomeMessage(userInfo: UserInfo): string {
  const displayName = getUserDisplayName(userInfo);
  
  if (userInfo.hasCompleteProfile) {
    return `欢迎回来，${displayName}，我是埃弗赛科技的小智 AI，今天能帮你做什么？`;
  } else {
    return `${displayName}你好，我是埃弗赛科技的小智 AI，今天能帮你做什么？`;
  }
}

/**
 * 获取引导语
 * @param hasCompleteProfile 是否有完整档案
 * @returns 引导语
 */
export function getGuideText(_hasCompleteProfile: boolean): string {
  // 不显示引导语，返回空字符串
  return "";
}

/**
 * 获取温暖的初次建档开场白
 * @returns 开场白文本
 */
export function getOnboardingWelcome(): string {
  return `嗨！很高兴认识你！😊 
为了让我能更好地帮助你，我们来聊聊你的工作情况吧～
这些问题都很简单，就像朋友间的聊天一样！`;
}

/**
 * 获取初次建档问题列表
 * @returns 问题数组
 */
export function getOnboardingQuestions(): Array<{
  question: string;
  description: string;
  type: 'text' | 'select';
  options?: string[];
}> {
  return [
    {
      question: "你现在在哪个部门呀？🤔",
      description: "研发部的技术大神？行政部的效率达人？总裁办的战略参谋？课题组的研究新星？还是其他有趣的部门呢？\n\n告诉我吧，我很好奇！✨",
      type: "select",
      options: ["研发部", "行政部", "总裁办", "课题组", "其他"]
    },
    {
      question: "在部门里你主要做什么工作呢？",
      description: "是写代码的程序猿/程序媛？💻\n还是统筹全局的产品经理？📊\n或者是专注研究的学者？📚\n\n不管是什么角色，都有自己独特的价值呢！\n快告诉我你的超能力是什么～",
      type: "text"
    },
    {
      question: "平时工作中你最喜欢做什么呀？",
      description: "是解决技术难题时的成就感？💡\n还是看到项目顺利推进的满足感？🚀\n或者是研究出新发现的兴奋感？🔍\n\n我也想知道你在工作中遇到挑战时，\n希望我怎样陪伴你一起面对呢？🤗",
      type: "text"
    },
    {
      question: "工作中有什么得力助手吗？",
      description: "比如那个让你爱不释手的软件，\n或者离不开的神奇工具？\n\n是代码编辑器里的小精灵？🧚‍♀️\n还是数据分析的好帮手？\n告诉我它们的名字，说不定我们会有共同话题呢！",
      type: "text"
    },
    {
      question: "想象一下，如果有个人工智能小伙伴，你最希望我在哪些时候出现帮帮你？",
      description: "是被bug困扰到抓狂的时候？🐞\n是需要整理思路的时候？💭\n还是想要学习新知识的时候？📖\n\n我会努力成为你最可靠的数字伙伴！💪",
      type: "text"
    },
    {
      question: "我们聊天的时候，你更喜欢：",
      description: "直接给答案，快速解决问题？\n还是一起慢慢探讨，享受思考的过程？\n\n是喜欢我一本正经地分析？\n还是可以开玩笑地说说笑笑？\n\n告诉我你的偏好，我会调整到最舒服的模式！😉",
      type: "select",
      options: ["直接给答案", "一起探讨过程", "一本正经分析", "轻松幽默交流"]
    }
  ];
}

/**
 * 获取建档完成的温馨结束语
 * @returns 结束语文本
 */
export function getOnboardingCompleteMessage(): string {
  return `谢谢你和我分享这么多！🥰
现在我对你的工作有了初步了解，
接下来我会根据你的特点来提供更贴心的帮助～

随时都可以找我聊天哦，
我就在这里等着成为你的专属AI伙伴！✨`;
}