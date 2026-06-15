// Mock content for each book type

export const epubContent = {
  chapters: [
    { id: 1, title: "第一章·马孔多" },
    { id: 2, title: "第二章·失眠瘟疫" },
    { id: 3, title: "第三章·炼金术士" },
    { id: 4, title: "第四章·吉普赛人" },
    { id: 5, title: "第五章·战争的开始" },
    { id: 6, title: "第六章·奥雷里亚诺上校" },
    { id: 7, title: "第七章·香蕉热潮" },
  ],
  currentChapter: 3,
  pages: [
    {
      id: 1,
      text: `马孔多是个二十户人家的村庄，泥巴和芦苇盖成的屋子沿河岸排开，湍急的河水清澈见底，河床里卵石洁白光滑，活像史前巨蛋。

世界新生伊始，许多事物还没有名字，提到的时候尚需用手指指点点。每年三月，衣衫褴褛的吉普赛人都要在村边搭起帐篷，在笛鼓的喧嚣声中，向马孔多的居民展示科学技术的最新发明。

他们首先带来的是磁铁。一个身躯高大的吉普赛人，自称墨尔基亚德斯，满脸胡须，手指瘦削，在众目睽睽之下，用两大块磁铁从一座农舍到另一座农舍走过，铁锅、铁盆、铁钳、铁炉纷纷倒塌脱落，木器上的钉子和螺钉嘎吱作响，拼命想挣脱出来，连那些早就找不到的东西也从藏匿之处滚滚而出。`,
    },
    {
      id: 2,
      text: `"万物皆有灵性，"墨尔基亚德斯用刺耳的卡斯蒂利亚语大声宣布，"只需唤醒它们的灵性。"

何塞·阿尔卡蒂奥·布恩迪亚那时正值壮年，热情奔放，细瘦精干，对于幸运所赐之物，尚未来得及欣赏。他以两锭金砖换来了两块磁铁。乌苏拉原本可以管教好那两个孩子，已经费了九牛二虎之力。但她最终无力阻止丈夫，因为丈夫仿佛信仰新上帝一般，对那个磁铁顶礼膜拜。

何塞·阿尔卡蒂奥·布恩迪亚连续几夜没有睡觉，做了大量试验，力图用墨尔基亚德斯的磁铁来找到金子。他带着磁铁走遍了整个地区，甚至连奥雷里亚诺——他那位传授了他多少探矿秘诀的朋友——发现的那块地皮也没放过，但从地里拖拉出来的，不过是十五世纪的铁甲武士的骨骸，以及一块深厚的铁壳，里面压着一缕被时间锈蚀了的头发。`,
    },
  ],
};

export const pdfPages = [
  {
    id: 1,
    title: "第一章 以人为本的设计",
    content: [
      {
        type: "heading",
        text: "1.1 日常事物的心理学",
      },
      {
        type: "paragraph",
        text: "工业设计师们在设计一件产品时，往往将重点放在产品的外观形态和功能实现上，却忽视了使用者的感受。然而，一件产品无论多么精美，如果使用者不能直觉地理解如何操作它，这件产品就是失败的。",
      },
      {
        type: "paragraph",
        text: "Norman 将这种设计上的失败归结为缺乏两个基本设计要素：可视性（visibility）和反馈（feedback）。可视性意味着产品的功能是可以被用户发现的；而反馈则意味着当用户操作之后，产品能够即时告知用户操作的结果。",
      },
      {
        type: "callout",
        text: "优秀的设计让用户感到舒适自然，糟糕的设计让用户感到沮丧和困惑。",
      },
      {
        type: "heading",
        text: "1.2 设计的两种失败模式",
      },
      {
        type: "paragraph",
        text: `当一个设计不好用时，人们往往会责怪自己："我真笨，这么简单的东西都不会用。"这是设计师的失败，却被用户内化为自身的失败。一个好的设计，应该让用户感到聪明，而不是愚蠢。`,
      },
    ],
  },
];

export const docContent = {
  title: "Q4产品规划报告",
  subtitle: "2024年第四季度 · 产品团队",
  sections: [
    {
      heading: "执行摘要",
      content: "本报告梳理了2024年第四季度产品团队的核心规划方向，涵盖功能迭代路线图、资源分配计划及关键里程碑节点。经过与各业务方的充分对齐，本季度将重点聚焦在用户增长、留存优化及平台基础建设三大方向。",
    },
    {
      heading: "核心目标",
      bullets: ["月活跃用户（MAU）突破 500 万", "用户7日留存率提升至 42%", "完成新版设计系统上线", "推进 AI 智能推荐模块 Beta 测试"],
    },
    {
      heading: "功能路线图",
      content: "Q4 共规划 3 个迭代版本，分别于 10 月、11 月、12 月末发布。每个版本聚焦 2～3 个核心功能，辅以若干体验优化项和 Bug 修复。",
      table: {
        headers: ["版本", "发布时间", "核心功能", "负责人"],
        rows: [
          ["v4.2.0", "10月 15日", "AI 推荐 Beta · 搜索重构", "张伟"],
          ["v4.3.0", "11月 20日", "社交分享 · 用户标注", "李梅"],
          ["v4.4.0", "12月 28日", "新版设计系统 · 性能优化", "王强"],
        ],
      },
    },
    {
      heading: "资源分配",
      content: "研发团队本季度共 28 人参与，其中前端 8 人、后端 10 人、AI/算法 4 人、测试 4 人、设计 2 人。总研发投入预算为 ¥2,400,000，较上季度增加 15%。",
    },
  ],
};

export const pptSlides = [
  {
    id: 1,
    type: "cover",
    title: "2024 Q1 产品发布",
    subtitle: "新时代 · 新体验",
    date: "2024年3月15日",
    speaker: "产品团队",
    accent: "#c17f3a",
  },
  {
    id: 2,
    type: "agenda",
    title: "今日议程",
    items: ["01  本季度核心亮点", "02  新功能详情演示", "03  数据与增长", "04  下一步计划"],
    accent: "#3d6b8a",
  },
  {
    id: 3,
    type: "stats",
    title: "数据亮点",
    stats: [
      { value: "480万", label: "月活用户", change: "+23%" },
      { value: "38%", label: "7日留存", change: "+5.2pt" },
      { value: "4.8分", label: "应用评分", change: "+0.3" },
      { value: "¥1.2亿", label: "季度GMV", change: "+41%" },
    ],
    accent: "#5a8a3a",
  },
  {
    id: 4,
    type: "feature",
    title: "核心新功能：AI 智能推荐",
    description: "基于用户阅读行为和兴趣图谱，为每位用户生成个性化书单，推荐点击率提升 67%。",
    points: ["深度学习协同过滤算法", "实时行为捕捉与反馈", "冷启动优化策略", "A/B 测试验证效果"],
    accent: "#6a3a8a",
  },
  {
    id: 5,
    type: "closing",
    title: "谢谢聆听",
    subtitle: "让阅读更美好",
    contact: "product@cloudshelf.com",
    accent: "#c17f3a",
  },
];

export const excelData = {
  title: "2023年度财务分析报告",
  sheets: ["收入汇总", "部门支出", "同比分析"],
  activeSheet: 0,
  headers: ["部门", "Q1收入", "Q2收入", "Q3收入", "Q4收入", "年度合计", "同比增长"],
  rows: [
    ["电商业务", "¥12,450,000", "¥15,230,000", "¥18,900,000", "¥22,100,000", "¥68,680,000", "+34.2%"],
    ["订阅服务", "¥3,200,000", "¥3,580,000", "¥4,100,000", "¥4,800,000", "¥15,680,000", "+28.7%"],
    ["广告收入", "¥1,800,000", "¥2,100,000", "¥2,450,000", "¥2,900,000", "¥9,250,000", "+19.3%"],
    ["企业服务", "¥5,600,000", "¥6,200,000", "¥7,100,000", "¥8,400,000", "¥27,300,000", "+41.5%"],
    ["内容授权", "¥890,000", "¥920,000", "¥1,050,000", "¥1,200,000", "¥4,060,000", "+12.8%"],
    ["合计", "¥23,940,000", "¥28,030,000", "¥33,600,000", "¥39,400,000", "¥124,970,000", "+31.6%"],
  ],
  highlights: [5],
};

export const htmlContent = {
  toc: [
    { id: "s1", level: 1, title: "第1章 CSS 与文档" },
    { id: "s2", level: 2, title: "1.1 Web 样式的简短历史" },
    { id: "s3", level: 2, title: "1.2 元素" },
    { id: "s4", level: 2, title: "1.3 将 CSS 应用于 HTML" },
    { id: "s5", level: 1, title: "第2章 选择符" },
    { id: "s6", level: 2, title: "2.1 基本样式规则" },
    { id: "s7", level: 2, title: "2.2 类选择符与ID选择符" },
    { id: "s8", level: 2, title: "2.3 属性选择符" },
    { id: "s9", level: 1, title: "第3章 特殊性和级联" },
    { id: "s10", level: 2, title: "3.1 特殊性" },
    { id: "s11", level: 2, title: "3.2 继承" },
    { id: "s12", level: 2, title: "3.3 层叠" },
  ],
  html: `
<h1 id="s1">第1章 CSS 与文档</h1>
<p>层叠样式表（CSS）是一种强大的工具，它能改变一个或一组文档的外观，几乎触及 HTML 的每一个方面——从字体到布局再到鼠标悬浮时的颜色变化——因此 CSS 已经扩展到所谓的"富互联网应用"领域，包括 Web 应用界面的样式设计。</p>

<h2 id="s2">1.1 Web 样式的简短历史</h2>
<p>CSS 首次提出是在 1994 年，当时 Web 才刚刚开始走进大众视野。当时的浏览器给用户提供了各种各样的样式设置，而文档作者对文档的外观却没有任何控制权——至少没有正式的控制权。</p>
<p>Web 的创始人——欧洲核子研究委员会（CERN）的 Tim Berners-Lee——以 SGML 为基础设计了 HTML，并在其中定义了一些用于标记文档的元素。这些元素中有一部分具有结构性作用（如 <code>&lt;p&gt;</code> 元素标记段落），另一部分具有描述性作用（如 <code>&lt;em&gt;</code> 元素标记需要强调的内容）。</p>

<blockquote>
  <p>CSS 的提案于 1994 年 10 月 10 日首次公开，由 Håkon Wium Lie 提出，是为了解决 HTML 文档中关注点分离的问题——将内容与表现彻底分开。</p>
</blockquote>

<h2 id="s3">1.2 元素</h2>
<p>元素（element）是 CSS 运作的基础。在 HTML 中，每个元素都有其相应的 CSS 属性，而这些属性又会影响元素在浏览器中的呈现方式。</p>

<h3>置换元素与非置换元素</h3>
<p>CSS 中有两种基本的元素类型：<strong>置换元素</strong>（replaced element）和<strong>非置换元素</strong>（nonreplaced element）。</p>
<ul>
  <li><strong>置换元素</strong>：指用来置换元素内容的部分不由文档直接表示，如 <code>&lt;img&gt;</code>、<code>&lt;input&gt;</code>。</li>
  <li><strong>非置换元素</strong>：内容由用户代理（浏览器）在元素本身的框中显示，如 <code>&lt;span&gt;</code>、<code>&lt;p&gt;</code>。</li>
</ul>

<h2 id="s4">1.3 将 CSS 应用于 HTML</h2>
<p>将 CSS 应用于 HTML 文档有四种方式：link 元素、style 元素、@import 指令，以及行内样式。</p>

<pre><code>&lt;!-- 外部样式表 --&gt;
&lt;link rel="stylesheet" type="text/css" href="styles.css"&gt;

/* 行内样式 */
&lt;p style="color: red; font-size: 1.2em;"&gt;段落文本&lt;/p&gt;</code></pre>

<h1 id="s5">第2章 选择符</h1>
<p>CSS 选择符（selector）决定了样式规则将应用于文档中的哪些元素。从简单的元素选择符到复杂的伪类与属性选择符，CSS 提供了极为丰富的目标定位能力。</p>

<h2 id="s6">2.1 基本样式规则</h2>
<p>CSS 规则由两个基本部分构成：<strong>选择符</strong>（selector）和<strong>声明块</strong>（declaration block）。声明块中包含一条或多条声明，每条声明由属性和值组成。</p>

<pre><code>h1 {
  color: #5c3d1e;
  font-family: "Playfair Display", serif;
  font-size: 2rem;
}</code></pre>
`,
};

export const mangaPages = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=600&fit=crop&auto=format",
    alt: "漫画第1页",
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1612178537253-bccd437b730e?w=400&h=600&fit=crop&auto=format",
    alt: "漫画第2页",
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1614583225154-5fcdda07019e?w=400&h=600&fit=crop&auto=format",
    alt: "漫画第3页",
  },
];
