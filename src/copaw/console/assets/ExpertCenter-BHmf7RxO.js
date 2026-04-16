import{i as H,k as F,r as p,f as Z,ap as J,j as e,C as j,a as E,b as w,S as W,e as S,t as V,T as Q,K as X,s as I,I as ee,ao as te,a6 as re,w as se,aq as O,ar as ae,B as U,as as ne,E as M,N as ie,Z as le,h as oe,H as q,at as ce,au as de}from"./index-DxdDlf0e.js";import{P as ge}from"./PageAiInsightCard-BKJ3eJc7.js";import{C as pe}from"./crown-C3awSeUG.js";/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=[["path",{d:"M19.07 4.93A10 10 0 0 0 6.99 3.34",key:"z3du51"}],["path",{d:"M4 6h.01",key:"oypzma"}],["path",{d:"M2.29 9.62A10 10 0 1 0 21.31 8.35",key:"qzzz0"}],["path",{d:"M16.24 7.76A6 6 0 1 0 8.23 16.67",key:"1yjesh"}],["path",{d:"M12 18h.01",key:"mhygvu"}],["path",{d:"M17.99 11.66A6 6 0 0 1 15.77 16.67",key:"1u2y91"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}],["path",{d:"m13.41 10.59 5.66-5.66",key:"mhq4k0"}]],he=H("radar",xe),{Title:D,Text:z,Paragraph:ye}=Q,N={strategy:"战略专家",product:"产品专家",legal:"法务专家",rd:"研发专家",marketing:"市场专家",finance:"财务专家",data:"数据分析",ai:"AI研究",test:"质量保障",ops:"运维专家",research:"科研助理",general:"通用专家","digital-employee":"数字专家"},r=l=>String(l||"").trim(),me=l=>{const f=r(l.category).toLowerCase();if(f&&f!=="digital-employee")return f;const a=r(l.trigger_key).toLowerCase();return a.includes("strategy")||a.includes("exec")?"strategy":a.includes("product")?"product":a.includes("legal")?"legal":a.includes("finance")||a.includes("budget")||a.includes("tax")?"finance":a.includes("data")?"data":a.includes("ai")?"ai":a.includes("test")||a.includes("quality")?"test":a.includes("ops")||a.includes("release")?"ops":a.includes("research")||a.includes("paper")||a.includes("literature")?"research":a.includes("marketing")||a.includes("brand")?"marketing":a.includes("rd")||a.includes("dev")||a.includes("tech")?"rd":"general"},fe=l=>l?new Date(l*1e3).toLocaleString():"-",ue={strategy:"策",product:"产",legal:"法",rd:"研",marketing:"营",finance:"财",data:"数",ai:"智",test:"质",ops:"运",research:"科",general:"专","digital-employee":"专"},K=l=>{const f=r(l.id)||r(l.trigger_key)||r(l.display_name)||"expert",a=ce(f,"expert"),d=r(l.category),C=r(l.display_name).charAt(0)||"专",h=ue[d]||C;return{...de({seed:a,name:r(l.display_name)||h}),symbol:h}};function je(){var B;const l=F(),[f,a]=p.useState(!1),[d,C]=p.useState([]),[h,L]=p.useState(""),[y,P]=p.useState("all"),[u,Y]=p.useState("当前员工"),A=sessionStorage.getItem("copaw_department")||localStorage.getItem("copaw_department")||"",R=sessionStorage.getItem("copaw_user_id")||localStorage.getItem("copaw_user_id")||"";p.useEffect(()=>{Z.getMe().then(t=>{Y(r(t==null?void 0:t.name)||"当前员工")}).catch(()=>{})},[]),p.useEffect(()=>{let t=!1;return(async()=>{a(!0);try{const n=await oe.resolveExpertCenterSkills(A||""),g=new Set(Array.isArray(n==null?void 0:n.triggers)?n.triggers.map(i=>r(i)):[]),c=await q.listDigitalEmployees(),$=(Array.isArray(c==null?void 0:c.items)?c.items:[]).flatMap(i=>(Array.isArray(i.templates)?i.templates:[]).map(x=>({id:r(x.id)||`${r(i.agent_key)}-${r(x.trigger_key)}`,trigger_key:r(x.trigger_key),display_name:r(x.display_name),session_name:r(x.session_name),runtime_profile:x.runtime_profile,skill:r(x.skill),agent_key:r(i.agent_key)||"digital-expert",agent_name:r(i.agent_name),enabled:!0}))).filter(i=>i.trigger_key).filter(i=>!g.size||g.has(i.trigger_key)).filter(i=>i.enabled!==!1).map(i=>({...i,category:me(i)}));t||C($)}catch(n){console.error("Failed to load experts:",n),t||(C([]),I.error("加载专家列表失败"))}finally{t||a(!1)}})(),()=>{t=!0}},[A]);const _=p.useMemo(()=>{const t=new Set;return d.forEach(s=>{const n=r(s.category);n&&t.add(n)}),Array.from(t)},[d]),o=p.useMemo(()=>{const t=h.toLowerCase().trim();return d.filter(s=>{const n=r(s.display_name).toLowerCase(),g=r(s.expert_profile).toLowerCase(),c=r(s.category).toLowerCase(),b=!t||n.includes(t)||g.includes(t)||c.includes(t),v=y==="all"||r(s.category)===y;return b&&v})},[d,h,y]),k=p.useMemo(()=>[...d].sort((t,s)=>Number(s.updated_at||0)-Number(t.updated_at||0)).slice(0,10),[d]),G=p.useMemo(()=>{const t=r(A)||"当前组织",s=y==="all"?"全部领域":N[y]||y,n=r(h)||"无关键词",g=o[0]||k[0]||null,c=r(g==null?void 0:g.display_name)||"暂无优先专家";return{path:"/app/expert-center",source:"expert-center",title:o.length>0?`当前正在筛选 ${s} 方向专家`:`当前 ${s} 方向暂无可用专家`,summary:`部门视角：${t}；当前领域：${s}；搜索词：${n}；当前结果 ${o.length} 位。`,tags:[t,s],insights:[`优先候选：${c}`,`当前共可见 ${d.length} 位专家`,`覆盖 ${_.length} 个能力领域`],quickPrompts:g?[`为什么当前应优先联系${c}`,`基于当前问题为我安排${c}的咨询切入点`,"结合当前筛选推荐多专家联席顺序"]:["当前筛选下暂无专家，帮我判断应该先放宽哪个筛选条件","请基于当前部门视角推荐可补充的专家方向"],promptContext:["页面：专家中心",`当前操作者：${u}`,`部门视角：${t}`,`当前领域：${s}`,`搜索关键词：${n}`,`当前结果数：${o.length}`,`专家总量：${d.length}`,`覆盖领域数：${_.length}`,`优先候选专家：${c}`].join(`
`)}},[y,_.length,A,u,d.length,o,k,h]);J(G);const T=async t=>{var i,x;const s=r(t.trigger_key);if(!s){I.warning("该专家模板缺少触发键，暂时无法进入会话");return}const n=r(t.display_name)||"数字专家",g=r(t.id)||s;let c="",b=r(t.skill);try{const m=await q.resolvePromptTemplate({trigger_key:s,scene_actor_name:u,scene_actor_user_name:u,scene_actor_user_id:R,target_type:"expert",expert_id:g,expert_trigger_key:s});c=r((i=m==null?void 0:m.template)==null?void 0:i.prompt_text),b=r((x=m==null?void 0:m.template)==null?void 0:x.skill)||b}catch(m){console.warn("Failed to resolve expert template:",m)}c||(c=`你是企业数字专家团队中的“${n}”。当前协作者是${u}。请先简洁说明你的专业职责、可提供的支持方式，以及建议从什么问题开始协作。不要输出提示词本身。`);const v=`digital-scene-${s}`,$=Date.now();sessionStorage.setItem("copaw_scene_start_v1",JSON.stringify({key:v,label:n,triggerKey:s,sessionName:r(t.session_name)||`数字专家·${n}`,prompt:c,skill:b,templateType:"skill",agentKey:r(t.agent_key)||"digital-expert",runtimeProfile:t.runtime_profile||"isolated",context:{target_type:"expert",expert_id:g,expert_name:n,expert_trigger_key:s,expert_template_skill:b,scene_actor_name:u,scene_actor_user_name:u,scene_actor_user_id:R,agent_key:r(t.agent_key)||"digital-expert",runtime_profile:t.runtime_profile||"isolated"},ts:$})),l(`/app/expert/${encodeURIComponent(v)}?t=${$}`)};return e.jsxs("div",{style:{padding:24,maxWidth:1620,margin:"0 auto"},children:[e.jsx(j,{bordered:!1,style:{borderRadius:24,marginBottom:20,background:"linear-gradient(125deg, #111827 0%, #312e81 45%, #6d28d9 100%)",boxShadow:"0 20px 42px rgba(49, 46, 129, 0.34)"},styles:{body:{padding:28}},children:e.jsxs(E,{gutter:[16,16],align:"middle",children:[e.jsx(w,{xs:24,xl:17,children:e.jsxs(W,{direction:"vertical",size:8,children:[e.jsxs(S,{color:"purple",style:{width:"fit-content",borderRadius:999,paddingInline:12},children:[e.jsx(V,{size:12,style:{marginRight:6}})," Agent Expert Matrix"]}),e.jsx(D,{level:2,style:{color:"#fff",margin:0,fontWeight:800},children:"专家中心"}),e.jsx(z,{style:{color:"rgba(255,255,255,0.86)",fontSize:15},children:"汇聚真实专家模板，提供高阶咨询、评审与协作编排能力。"})]})}),e.jsx(w,{xs:24,xl:7,children:e.jsxs("div",{className:"xc-hero-stat-wrap",children:[e.jsxs("div",{className:"xc-hero-stat",children:[e.jsx("div",{children:d.length}),e.jsx("span",{children:"专家总数"})]}),e.jsxs("div",{className:"xc-hero-stat",children:[e.jsx("div",{children:_.length}),e.jsx("span",{children:"能力领域"})]}),e.jsxs("div",{className:"xc-hero-stat",children:[e.jsx("div",{children:o.length}),e.jsx("span",{children:"筛选结果"})]})]})})]})}),e.jsx(ge,{badge:"AI 专家路由",tone:"violet",title:o.length>0?`红智助手已为你识别 ${o.length} 位可用专家`:"红智助手已识别当前暂无可用专家",description:"专家中心现在会直接暴露专家推荐、联席建议与高匹配专家入口，而不是只展示一组专家卡片。",insights:[`专家总量：${d.length} 位`,`覆盖领域：${_.length} 类`,`优先候选：${r((B=o[0]||k[0])==null?void 0:B.display_name)||"请检查专家模板启用情况"}`],suggestions:["先根据当前问题选择最匹配的专家，再决定是否扩展为多专家联席。","复杂议题建议让秘书先解释推荐原因，避免盲目切换专家。","高频问题可以直接固化为专家协作模板，降低重复选择成本。"],actions:[{key:"expert-route",label:"让秘书推荐专家组合",type:"primary",onClick:()=>{var t;return X(l,`专家中心：当前共 ${d.length} 位专家、${_.length} 个能力领域，当前优先候选是 ${r((t=o[0]||k[0])==null?void 0:t.display_name)||"暂无"}。请基于当前场景推荐专家组合与联席顺序。`)}},{key:"expert-first",label:o[0]?`咨询 ${r(o[0].display_name)||"首位专家"}`:"查看专家排行",onClick:()=>o[0]?void T(o[0]):I.info("当前暂无可直接咨询的专家，请先检查筛选条件")},{key:"expert-workbench",label:"进入智能工作台",onClick:()=>l("/app/research-experiment")}]}),e.jsxs(E,{gutter:20,children:[e.jsxs(w,{xs:24,lg:17,children:[e.jsxs(j,{bordered:!1,className:"xc-surface-card",style:{marginBottom:18},children:[e.jsx(ee,{prefix:e.jsx(te,{size:18,color:"#64748b"}),placeholder:"搜索专家名称、能力领域或简介",size:"large",allowClear:!0,value:h,onChange:t=>L(t.target.value),style:{borderRadius:12,height:46}}),e.jsx("div",{style:{marginTop:16},children:e.jsx(re,{activeKey:y,onChange:P,items:[{key:"all",label:"全部领域"},..._.map(t=>({key:t,label:N[t]||t}))]})})]}),f?e.jsx(j,{bordered:!1,className:"xc-surface-card",style:{textAlign:"center",padding:48},children:e.jsx(se,{tip:"正在加载真实数字专家..."})}):e.jsx(E,{gutter:[16,16],children:o.length>0?o.map(t=>{const s=K(t);return e.jsx(w,{xs:24,md:12,xxl:8,children:e.jsxs(j,{bordered:!1,hoverable:!0,className:"xc-expert-card",onClick:()=>void T(t),children:[e.jsxs("div",{style:{display:"flex",gap:14,marginBottom:12},children:[e.jsx(O,{size:54,src:s.src,style:{background:s.background,boxShadow:"0 10px 20px rgba(79, 70, 229, 0.22)",fontWeight:800,fontSize:22},children:s.symbol}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:8},children:[e.jsx(D,{level:4,style:{margin:0,fontSize:17},ellipsis:!0,children:r(t.display_name)||"未命名专家"}),e.jsx(S,{color:"purple",style:{borderRadius:8,margin:0},children:N[r(t.category)]||"数字专家"})]}),e.jsxs(z,{type:"secondary",style:{fontSize:12,display:"inline-flex",alignItems:"center",gap:6},children:[e.jsx(ae,{size:12})," ",fe(t.updated_at)]})]})]}),e.jsx(ye,{ellipsis:{rows:2},style:{color:"#64748b",minHeight:42,marginBottom:14},children:r(t.expert_profile)||"该数字专家由真实模板提供，支持高质量专业协作与任务执行。"}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs(W,{size:6,children:[e.jsx(S,{className:"xc-soft-tag",children:"深度咨询"}),e.jsx(S,{className:"xc-soft-tag",children:"实时协作"})]}),e.jsxs(U,{type:"text",style:{color:"#4f46e5",fontWeight:600},children:["咨询此专家 ",e.jsx(ne,{size:14})]})]})]})},t.id)}):e.jsx(w,{span:24,children:e.jsx(j,{bordered:!1,className:"xc-surface-card",children:e.jsx(M,{description:"暂无可用数字专家（请检查后台数字专家模板是否启用）"})})})})]}),e.jsx(w,{xs:24,lg:7,children:e.jsxs(j,{bordered:!1,className:"xc-surface-card",style:{position:"sticky",top:20},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10},children:[e.jsxs(z,{strong:!0,style:{fontSize:16},children:[e.jsx(ie,{size:17,style:{marginRight:6}})," 专家排行榜"]}),e.jsx(S,{color:"gold",children:"TOP 10"})]}),k.length===0?e.jsx(M,{image:M.PRESENTED_IMAGE_SIMPLE,description:"暂无排行数据"}):k.map((t,s)=>{const n=K(t);return e.jsxs("div",{className:"xc-rank-item",onClick:()=>void T(t),children:[e.jsx("div",{className:"xc-rank-index",children:s===0?e.jsx(pe,{size:15,fill:"#f59e0b"}):s+1}),e.jsx(O,{size:34,src:n.src,style:{background:n.background,boxShadow:s<3?"0 10px 18px rgba(79, 70, 229, 0.22)":"none",fontWeight:800,fontSize:14},children:n.symbol}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsx("div",{style:{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:r(t.display_name)||"未命名专家"}),e.jsx(z,{type:"secondary",style:{fontSize:12},children:N[r(t.category)]||"数字专家"})]}),e.jsx(he,{size:15,color:"#6366f1"})]},t.id)}),e.jsx(U,{block:!0,type:"default",icon:e.jsx(le,{size:14}),style:{marginTop:10},onClick:()=>P("all"),children:"查看全部专家"})]})})]}),e.jsx("style",{dangerouslySetInnerHTML:{__html:`
            .xc-surface-card {
              border-radius: 20px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .xc-expert-card {
              border-radius: 18px;
              border: 1px solid #ede9fe;
              background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
              transition: all .25s ease;
            }
            .xc-expert-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 16px 30px rgba(124, 58, 237, 0.2);
              border-color: #c4b5fd;
            }
            .xc-soft-tag {
              border: none !important;
              background: #f3f4f6 !important;
              color: #64748b !important;
              border-radius: 8px !important;
            }
            .xc-rank-item {
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 10px;
              border-radius: 12px;
              border: 1px solid #eef2ff;
              margin-bottom: 9px;
              cursor: pointer;
              transition: all .2s ease;
            }
            .xc-rank-item:hover {
              background: #f8faff;
              border-color: #c7d2fe;
            }
            .xc-rank-index {
              width: 24px;
              text-align: center;
              font-weight: 800;
              color: #64748b;
              font-size: 13px;
            }
            .xc-hero-stat-wrap {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
            }
            .xc-hero-stat {
              border: 1px solid rgba(255,255,255,0.25);
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              text-align: center;
              padding: 8px;
            }
            .xc-hero-stat div {
              color: #fff;
              font-size: 19px;
              font-weight: 800;
              line-height: 1.1;
            }
            .xc-hero-stat span {
              color: rgba(255,255,255,0.82);
              font-size: 12px;
            }
          `}})]})}export{je as default};
