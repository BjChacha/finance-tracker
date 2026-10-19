/**
 * Copy for the report feature. UI text is Chinese; the model prompt is Chinese because the
 * analysis it returns is shown verbatim to a Chinese-speaking reader.
 */

/** Accent slot a value card may use; resolved against the active theme at render time. */
export type ValueTone = "primary" | "income" | "transfer" | "warning" | "expense";

/** Icons stay as plain strings so this data module never imports UI components. */
export const reportValueMeta = {
	self_care: { label: "自我照顾", icon: "heart-pulse", tone: "income" },
	social: { label: "社交连接", icon: "party-popper", tone: "transfer" },
	growth: { label: "成长投入", icon: "graduation-cap", tone: "primary" },
	efficiency: { label: "效率至上", icon: "clock", tone: "primary" },
	comfort: { label: "舒适优先", icon: "coffee", tone: "warning" },
	curiosity: { label: "好奇尝鲜", icon: "sparkles", tone: "transfer" },
} as const satisfies Record<string, { label: string; icon: string; tone: ValueTone }>;

export const reportsText = {
	title: "消费报告",
	entryHint: "AI 读懂这一期的消费情绪，并给出可以马上做的省钱动作",
	uncategorized: "未分类",
	otherCategories: (count: number) => `其余 ${count} 个分类`,
	amountBucketSmall: "<50元",
	amountBucketMedium: "50-200元",
	amountBucketLarge: "200-1000元",
	amountBucketHuge: "≥1000元",

	// —— 列表 / 入口 ——
	historyTitle: "往期报告",
	historyEmpty: "还没有报告。每个周期结束后，第一次打开应用时会自动生成。",
	historyOpen: "查看",
	latestTag: "最新一期",
	autoScheduleHint: "周期结束后首次打开应用时自动生成，之后可直接回看",
	pendingTitle: "本期报告还没生成",
	pendingBody: "等这个周期结束后，第一次打开应用时会自动生成，不需要手动操作。",

	// —— 详情区块 ——
	moodTitle: "本期消费情绪",
	moodScale: ["紧绷", "收紧", "平稳", "舒展", "松弛"],
	valuesTitle: "消费理念",
	dataTitle: "数据看点",
	categoryTitle: "分类里的情绪",
	suggestionsTitle: "可以马上做的",
	savingPotential: "预计每月可省",
	targetLabel: "目标",
	impactLabel: "预期",
	privacy:
		"发送给 AI 的数据已脱敏：仅包含分类、金额与周期聚合，不含备注、账户、项目与具体日期。",
	generatedAt: "生成于",
	modelLabel: "模型",
	costLabel: "本次费用",

	// —— 摘要 ——
	totalExpense: "总支出",
	totalIncome: "总收入",
	net: "结余",
	savingsRate: "结余率",
	expenseCount: "支出笔数",
	dailyAverage: "日均支出",
	largestExpense: "最大单笔",
	versusPrevious: "较上期",
	partial: "本期尚未结束，统计截至今天",
	topCategories: "支出构成",

	// —— 动作 ——
	generate: "生成 AI 报告",
	regenerate: "重新生成",
	regenerateHint: "重新生成会再次调用 AI 并产生费用",
	generating: "AI 正在读这一期…",
	empty: "本期还没有交易记录。",
	emptyPeriod: "本期没有可分析的交易",
	failed: "生成失败，请重试",

	// —— 失败文案（与识别共用分类） ——
	missingKey: "AI 分析服务未配置",
	unauthorized: "AI 服务鉴权失败",
	rateLimited: "AI 服务繁忙，请稍后再试",
	timeout: "AI 分析超时，请重试",
	server: "AI 服务暂时不可用",
	network: "网络连接失败",
	invalidResponse: "AI 返回结果无法解析，请重试",

	systemPrompt: [
		"你是一位懂人心的消费观察者，不是理财说教者。输入是一份已脱敏的周期性消费快照（不含备注、账户、项目与具体日期）。",
		"你的任务：把数字翻译成读者能共鸣的「消费情绪」和「消费理念」，再给出今天就能执行的省钱动作。",
		"只输出一个 json 对象，不要解释、不要 Markdown、不要代码块。结构：",
		'{"headline":"一句话标题，可带情绪或反差，不超过24字",',
		'"mood":{"label":"情绪词2到6字","score":1到5的整数（5=最松弛满足，1=最紧绷）","narrative":"60字内，解释情绪来由并引用真实数字"},',
		'"values":[{"id":"self_care|social|growth|efficiency|comfort|curiosity","label":"你的命名，不超过8字","narrative":"60字内，用数据说明这类消费如何体现生活方式"}],',
		'"dataPoints":[{"label":"指标名，不超过8字","value":"带单位的数值","note":"20字内的人话解读"}],',
		'"categoryStories":[{"category":"必须来自输入的 categories 名称","emotion":"这个分类带来的情绪，不超过8字","note":"40字内"}],',
		'"suggestions":[{"title":"动作标题，不超过10字","action":"何时、对什么、怎么做，60字内","target":"可验证的量化目标，如：本月外卖≤8次","impact":"预期影响，如：预计每月省下180元"}],',
		'"savingPotentialYuan":整数，按建议估算的每月可省金额}',
		"要求：",
		"- 只使用输入中出现的数字与分类，不得编造；引用金额时用「元」。",
		"- values 输出 2 到 4 条，id 必须来自给定枚举；语气像朋友观察，不像审讯。",
		"- dataPoints 输出 3 到 5 条，优先挑能制造「原来如此」的数字：占比、对比、频率、单笔峰值、工作日与周末差异。",
		"- categoryStories 最多 4 条，只写最有故事性的分类，没有就不写。",
		"- suggestions 输出 2 到 4 条，必须具体到场景（例如「工作日午餐」），禁止「少花钱」「理性消费」这类空话；每条都要有可验证目标和预期影响。",
		"- 若结余率为负或收入为 0，先讲收支安全感，再给建议；不要提供投资、医疗或法律建议。",
		"- 不评判人格、不说教；可以温和调侃消费选择，但不嘲讽。",
	].join("\n"),
} as const;
