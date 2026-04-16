import{v as oe,k as le,r,f as de,j as e,w as ce,C as j,T as xe,B as o,a as A,b as y,S as b,e as L,t as pe,x as Z,y as K,Z as E,z as q,D as fe,E as me,P as ee,G as ge,s as he,H as ye,l as M}from"./index-DxdDlf0e.js";import{A as ue}from"./arrow-left-DVZC9Wya.js";import{D as V}from"./index-DfanRP2L.js";import{C as Q}from"./circle-check-L13yihWd.js";import{C as je}from"./clock-DhfkTrdO.js";const{Title:X,Paragraph:be,Text:l}=xe,Y="copaw_scene_start_v1",_e="copaw_scene_pending_v1",se="copaw_scene_session_map_v1",t=n=>String(n||"").trim(),ke=()=>{try{const n=sessionStorage.getItem(se);if(!n)return{};const c=JSON.parse(n);return c&&typeof c=="object"?c:{}}catch{return{}}},we=n=>{sessionStorage.setItem(se,JSON.stringify(n))};function Se({src:n,title:c,onClose:R}){const[B,a]=r.useState(!0),[P,m]=r.useState(18);return r.useEffect(()=>{if(!n)return;a(!0),m(18);const _=window.setInterval(()=>{m(N=>N>=88?N:N+7)},180);return()=>window.clearInterval(_)},[n]),n?e.jsxs("div",{className:"xd-chat-shell",children:[e.jsxs("div",{className:"xd-chat-toolbar",children:[e.jsxs(b,{size:8,wrap:!0,children:[e.jsx(L,{color:"purple",style:{marginInlineEnd:0},children:"当前会话"}),e.jsx(l,{style:{fontSize:13,color:"#334155",fontWeight:600},children:c||"数字专家会话"})]}),e.jsx(o,{size:"small",onClick:R,children:"收起会话"})]}),B?e.jsxs("div",{className:"xd-chat-progress",children:[e.jsx("div",{style:{fontSize:13,fontWeight:700,color:"#4c1d95",marginBottom:4},children:"专家会话正在同步"}),e.jsx("div",{style:{fontSize:12,color:"#64748b",marginBottom:8},children:"正在挂载数字专家上下文、锁定会话名并生成首条专业回复..."}),e.jsx(ee,{percent:P,size:"small",showInfo:!1,strokeColor:{from:"#a78bfa",to:"#6d28d9"},trailColor:"#ede9fe",status:"active"})]}):null,e.jsx("div",{className:"xd-chat-frame-wrap",children:e.jsx("iframe",{src:n,title:"数字专家会话窗",onLoad:()=>{m(100),window.setTimeout(()=>a(!1),320)},style:{width:"100%",height:"70vh",border:"none",background:"#fff"}})})]}):null}function Te(){const{expertId:n}=oe(),c=le(),[R,B]=r.useState(!0),[a,P]=r.useState(null),[m,_]=r.useState(!1),[N,F]=r.useState("数字专家会话"),[D,te]=r.useState(""),[C,G]=r.useState(!1),[k,J]=r.useState("当前员工"),W=r.useRef(null),U=t(sessionStorage.getItem("copaw_user_id")||localStorage.getItem("copaw_user_id"));r.useEffect(()=>{try{const s=sessionStorage.getItem(Y);if(s){const i=JSON.parse(s);(i==null?void 0:i.key)===n&&(P(i),F(t(i.sessionName)||t(i.label)||"数字专家会话"))}}catch(s){console.error("Failed to parse expert info from session",s)}finally{B(!1)}},[n]),r.useEffect(()=>{const s=t(sessionStorage.getItem("copaw_user_name")||localStorage.getItem("copaw_user_name"));s&&J(s),de.getMe().then(i=>{const x=t(i==null?void 0:i.name)||s||"当前员工";J(x)}).catch(()=>{})},[]);const ae=r.useMemo(()=>a!=null&&a.context&&typeof a.context=="object"?a.context:{},[a]),w=t(a==null?void 0:a.label)||"数字专家",S=t(a==null?void 0:a.key),g=t(a==null?void 0:a.sessionName)||`数字专家·${w}`,O=t(ae.expert_template_skill)||(t(a==null?void 0:a.skill)!=="expert_agent_link"?t(a==null?void 0:a.skill):""),z=t(a==null?void 0:a.prompt)||`你是企业数字专家团队中的“${w}”。当前协作者是${k}。请先简洁说明你的专业职责、可提供的支持方式，以及建议从什么问题开始协作。不要输出提示词本身。`,I=r.useMemo(()=>{var i;const s=((i=a==null?void 0:a.key)==null?void 0:i.length)||1;return{load:s*7%100,done:s*13%500+50,active:s*3%20,avg:(s*2.17%4+1.2).toFixed(1)}},[a==null?void 0:a.key]),$=()=>{sessionStorage.setItem("copaw_secretary_scene_context",`正在查看数字专家 ${w} 的详情并评估其能力`),c("/app/secretary")},H=()=>{window.setTimeout(()=>{var s;(s=W.current)==null||s.scrollIntoView({behavior:"smooth",block:"start"})},80)},ie=async s=>{var v,u;const i=t(s.triggerKey),x=t(s.label)||"数字专家",h=s.context&&typeof s.context=="object"?{...s.context}:{};let p=t(s.prompt),f=t(h.expert_template_skill)||(t(s.skill)!=="expert_agent_link"?t(s.skill):"");if(i)try{const d=await ye.resolvePromptTemplate({trigger_key:i,scene_actor_name:k,scene_actor_user_name:k,scene_actor_user_id:U,target_type:"expert",expert_id:t(h.expert_id)||t(s.key)||i,expert_trigger_key:i});p=t((v=d==null?void 0:d.template)==null?void 0:v.prompt_text)||p,f=t((u=d==null?void 0:d.template)==null?void 0:u.skill)||f}catch(d){console.warn("Failed to resolve expert template:",d)}return p||(p=`你是企业数字专家团队中的“${x}”。当前协作者是${k}。请先简洁说明你的专业职责、可提供的支持方式，以及建议从什么问题开始协作。不要输出提示词本身。`),{...s,prompt:p,skill:f,context:{...h,target_type:"expert",expert_id:t(h.expert_id)||t(s.key)||i,expert_name:x,expert_trigger_key:i,expert_template_skill:f,scene_actor_name:k,scene_actor_user_name:k,scene_actor_user_id:U,agent_key:t(s.agentKey)||t(h.agent_key)||"digital-expert",runtime_profile:t(s.runtimeProfile)||t(h.runtime_profile)||"isolated"}}},re=async s=>{var d;const i=s.context&&typeof s.context=="object"?s.context:{},x={scene_key:S,scene_label:t(s.label)||w,scene_trigger_key:t(s.triggerKey)||S,scene_prompt:t(s.prompt)||z,hidden_user_prompt:t(s.prompt)||z,hidden_prompt_history:t(s.prompt)||z?[t(s.prompt)||z]:[],scene_context:i,scene_skill:t(s.skill)||O,scene_template_type:t(s.templateType)||"skill",scene_agent_key:t(s.agentKey)||"digital-expert",scene_runtime_profile:t(s.runtimeProfile)||"isolated",locked_session_name:!0,session_display_name:g,scene_bootstrap_status:"ready"},h=`已打开「${g}」，正在挂载数字专家上下文，请稍候查看首条专业回复。`,p=ke(),f=t(p[S]);if(f&&M.peekSession(f))return await M.updateSession({id:f,name:g,meta:x}),{sessionId:f,isNew:!1};const v=await M.createSession({name:g,pushMessage:h,meta:x}),u=t((d=v==null?void 0:v[0])==null?void 0:d.id);if(!u)throw new Error("create session failed");return await M.updateSession({id:u,name:g,meta:x}),p[S]=u,we(p),{sessionId:u,isNew:!0}},T=async()=>{if(!(!a||!S)){G(!0);try{const s=await ie(a);P(s),sessionStorage.setItem(Y,JSON.stringify({...s,ts:Date.now()}));const{sessionId:i,isNew:x}=await re(s);x&&sessionStorage.setItem(_e,JSON.stringify({id:i,prompt:t(s.prompt)||z,processingText:"正在同步数字专家上下文并生成首条专业回复...",ts:Date.now()})),F(g),te(`/app/workspace-embed/${encodeURIComponent(i)}?simple=1&scene=${encodeURIComponent(S)}&t=${Date.now()}`),_(!0),H()}catch(s){console.error("Failed to open expert chat:",s),he.error("开启专家会话失败，请稍后重试")}finally{G(!1)}}},ne=()=>{if(m){_(!1);return}if(D){_(!0),H();return}T()};return R?e.jsx("div",{style:{textAlign:"center",padding:100},children:e.jsx(ce,{size:"large"})}):a?e.jsxs("div",{style:{maxWidth:1620,margin:"0 auto",padding:"6px 4px 28px"},children:[e.jsx(j,{bordered:!1,style:{borderRadius:24,marginBottom:18,background:"linear-gradient(120deg, #111827 0%, #312e81 42%, #7c3aed 100%)",boxShadow:"0 20px 48px rgba(49, 46, 129, 0.35)"},styles:{body:{padding:28}},children:e.jsxs(A,{gutter:[16,16],align:"middle",children:[e.jsx(y,{xs:24,xl:16,children:e.jsxs(b,{direction:"vertical",size:8,children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"},children:[e.jsxs(L,{color:"purple",style:{borderRadius:999,paddingInline:12},children:[e.jsx(pe,{size:12,style:{marginRight:6}})," Agent OS Digital Expert"]}),e.jsxs(l,{style:{color:"rgba(255,255,255,0.78)"},children:["ID: ",a.agentKey]})]}),e.jsxs(X,{level:2,style:{margin:0,color:"#fff",display:"flex",alignItems:"center",gap:10},children:[e.jsx(Z,{size:28})," ",w]}),e.jsx(l,{style:{color:"rgba(255,255,255,0.84)",fontSize:15},children:"详情页内可直接锁定专家会话、注入隐藏提示词并展开会话区，确保首屏先有场景开场内容。"})]})}),e.jsx(y,{xs:24,xl:8,children:e.jsxs("div",{className:"xd-hero-actions",children:[e.jsxs(b,{wrap:!0,children:[e.jsx(o,{icon:e.jsx(ue,{size:14}),onClick:()=>c("/app/expert-center"),children:"返回专家中心"}),e.jsx(o,{icon:e.jsx(K,{size:14}),onClick:$,children:"咨询秘书"})]}),e.jsx(o,{type:"primary",size:"large",icon:e.jsx(E,{size:16}),onClick:()=>void T(),className:"xd-primary-btn xd-primary-btn-hero",loading:C,children:"分配任务 / 开启会话"}),e.jsx(l,{className:"xd-hero-tip",children:"专家上下文将随会话首次打开自动注入，后续复用同一命名会话。"})]})})]})}),e.jsxs(A,{gutter:[18,18],children:[e.jsx(y,{xs:24,xl:17,children:e.jsxs(b,{direction:"vertical",size:18,style:{width:"100%"},children:[e.jsxs(j,{title:"专家档案",bordered:!1,className:"xd-surface-card",children:[e.jsx(be,{style:{fontSize:15,color:"#334155",marginBottom:12},children:"该数字专家面向组织专业场景，支持复杂任务拆解与多步骤执行，可通过独立运行时保障协作稳定性。"}),e.jsx(V,{style:{margin:"12px 0 16px"}}),e.jsxs(A,{gutter:[16,14],children:[e.jsxs(y,{xs:24,md:8,children:[e.jsx(l,{type:"secondary",children:"触发标识"}),e.jsx("div",{className:"xd-info-value",children:a.triggerKey})]}),e.jsxs(y,{xs:24,md:8,children:[e.jsx(l,{type:"secondary",children:"运行时环境"}),e.jsx("div",{style:{marginTop:6},children:e.jsx(L,{color:a.runtimeProfile==="isolated"?"purple":"cyan",children:a.runtimeProfile==="isolated"?"沙箱隔离模式":"标准模式"})})]}),e.jsxs(y,{xs:24,md:8,children:[e.jsx(l,{type:"secondary",children:"会话命名"}),e.jsx("div",{className:"xd-info-value",children:g})]})]})]}),e.jsx("div",{ref:W,children:e.jsx(j,{title:"会话区",bordered:!1,className:"xd-surface-card",extra:e.jsx(o,{type:m?"default":"primary",onClick:ne,loading:C,children:m?"收起会话区":"展开会话区"}),children:m&&D?e.jsx(Se,{src:D,title:N||g,onClose:()=>_(!1)}):e.jsxs("div",{className:"xd-chat-collapsed",children:[e.jsxs("div",{children:[e.jsxs(l,{strong:!0,style:{fontSize:16,color:"#0f172a",display:"block",marginBottom:4},children:["一键进入 ",w," 的专业会话"]}),e.jsx(l,{type:"secondary",children:"打开后会优先确保会话存在、锁定命名，再写入隐藏专家提示词并展开内嵌会话区。"}),e.jsx("div",{style:{marginTop:12},children:e.jsx(q,{status:"processing",text:"详情页内嵌会话区默认折叠，可随时再次展开"})})]}),e.jsx(o,{type:"primary",icon:e.jsx(E,{size:14}),className:"xd-primary-btn",loading:C,onClick:()=>void T(),children:"立即展开会话"})]})})}),e.jsxs(j,{title:"挂载技能",bordered:!1,className:"xd-surface-card",children:[O?e.jsxs("div",{className:"xd-skill-banner",children:[e.jsx(fe,{size:19,color:"#6d28d9",style:{marginTop:1}}),e.jsxs("div",{children:[e.jsx(l,{strong:!0,style:{fontSize:16,display:"block",marginBottom:2},children:O}),e.jsx(l,{type:"secondary",children:"该专家已绑定核心技能，可直接调度底层能力进行任务闭环执行。"})]})]}):e.jsx(me,{description:"该专家暂未绑定特定技能插件，使用通用能力"}),e.jsxs("div",{style:{marginTop:14},children:[e.jsx(l,{strong:!0,style:{display:"block",marginBottom:12},children:"标准能力矩阵"}),e.jsx(A,{gutter:[12,12],children:["自然语言意图理解","跨节点 IAP 协议通信","独立沙箱存储","任务进度异步回调"].map(s=>e.jsx(y,{xs:24,md:12,children:e.jsxs("div",{className:"xd-check-item",children:[e.jsx(Q,{size:16,color:"#22c55e"}),s]})},s))})]})]})]})}),e.jsx(y,{xs:24,xl:7,children:e.jsxs(b,{direction:"vertical",size:18,style:{width:"100%"},children:[e.jsx(j,{title:"快速操作",bordered:!1,className:"xd-surface-card",style:{position:"sticky",top:16},children:e.jsxs(b,{direction:"vertical",style:{width:"100%"},children:[e.jsx(o,{block:!0,size:"large",type:"primary",icon:e.jsx(E,{size:14}),className:"xd-primary-btn",loading:C,onClick:()=>void T(),children:"开启该专家会话"}),e.jsx(o,{block:!0,size:"large",icon:e.jsx(K,{size:14}),onClick:$,children:"让秘书协助评估"}),e.jsx(o,{block:!0,size:"large",icon:e.jsx(Z,{size:14}),onClick:()=>c("/app/expert-center"),children:"返回专家中心"}),e.jsx("div",{className:"xd-note-box",children:e.jsx(q,{status:"processing",text:"会话命名已锁定，专家提示词仅首次自动注入"})})]})}),e.jsxs(j,{title:"运行负载",bordered:!1,className:"xd-surface-card",children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:16},children:[e.jsx(ee,{type:"dashboard",percent:I.load,strokeColor:I.load>80?"#ef4444":"#6366f1",size:170}),e.jsx("div",{style:{marginTop:8,color:"#475569"},children:"当前算力占用率"})]}),e.jsx(V,{style:{margin:"8px 0 14px"}}),e.jsxs(b,{direction:"vertical",style:{width:"100%"},size:12,children:[e.jsxs("div",{className:"xd-stat-row",children:[e.jsxs("span",{children:[e.jsx(ge,{size:15})," 并发处理中"]}),e.jsxs("b",{children:[I.active," 任务"]})]}),e.jsxs("div",{className:"xd-stat-row",children:[e.jsxs("span",{children:[e.jsx(Q,{size:15})," 累计完成"]}),e.jsxs("b",{children:[I.done," 任务"]})]}),e.jsxs("div",{className:"xd-stat-row",children:[e.jsxs("span",{children:[e.jsx(je,{size:15})," 平均响应耗时"]}),e.jsxs("b",{children:[I.avg,"s"]})]})]})]})]})})]}),e.jsxs("div",{className:"xd-float-actions",children:[e.jsx(o,{type:"primary",icon:e.jsx(E,{size:14}),className:"xd-primary-btn xd-float-primary",loading:C,onClick:()=>void T(),children:"开启会话"}),e.jsx(o,{icon:e.jsx(K,{size:14}),className:"xd-float-secondary",onClick:$,children:"分配任务"})]}),e.jsx("style",{dangerouslySetInnerHTML:{__html:`
            .xd-surface-card {
              border-radius: 18px;
              background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .xd-primary-btn {
              border: none !important;
              border-radius: 12px !important;
              background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
              box-shadow: 0 12px 26px rgba(99, 102, 241, 0.32);
            }
            .xd-primary-btn-hero {
              min-width: 240px;
              height: 48px;
              font-weight: 700;
            }
            .xd-hero-actions {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 12px;
            }
            .xd-hero-tip {
              color: rgba(255,255,255,0.76);
              font-size: 12px;
            }
            .xd-skill-banner {
              display: flex;
              gap: 12px;
              align-items: flex-start;
              background: linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%);
              border: 1px solid #e9d5ff;
              border-radius: 12px;
              padding: 14px;
            }
            .xd-info-value {
              margin-top: 6px;
              font-weight: 700;
              color: #0f172a;
              word-break: break-all;
            }
            .xd-check-item {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              width: 100%;
              padding: 10px 12px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #f8fafc;
            }
            .xd-chat-collapsed {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 18px;
              border-radius: 16px;
              border: 1px solid #e9d5ff;
              background: linear-gradient(135deg, #faf5ff 0%, #fcfcff 100%);
            }
            .xd-chat-shell {
              border-radius: 20px;
              border: 1px solid #e9d5ff;
              box-shadow: 0 10px 30px rgba(15,23,42,0.06);
              overflow: hidden;
              background: linear-gradient(180deg, #ffffff 0%, #faf5ff 100%);
            }
            .xd-chat-toolbar {
              padding: 12px 18px;
              border-bottom: 1px solid #ede9fe;
              background: #faf5ff;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              flex-wrap: wrap;
            }
            .xd-chat-progress {
              padding: 14px 18px;
              background: linear-gradient(135deg, #faf5ff 0%, #fcfcff 100%);
              border-bottom: 1px solid #ede9fe;
            }
            .xd-chat-frame-wrap {
              padding: 16px;
              background: #f5f3ff;
            }
            .xd-chat-frame-wrap iframe {
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(15,23,42,0.08);
            }
            .xd-stat-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 10px 12px;
            }
            .xd-stat-row span {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              color: #475569;
            }
            .xd-note-box {
              border-radius: 10px;
              border: 1px dashed #c4b5fd;
              background: #f5f3ff;
              padding: 10px 12px;
            }
            .xd-float-actions {
              position: fixed;
              right: 24px;
              bottom: 28px;
              z-index: 1100;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .xd-float-primary {
              height: 44px;
              padding-inline: 16px !important;
              border-radius: 14px !important;
            }
            .xd-float-secondary {
              border-radius: 14px !important;
              box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
            }
            @media (max-width: 1200px) {
              .xd-hero-actions {
                align-items: flex-start;
              }
            }
            @media (max-width: 768px) {
              .xd-chat-collapsed {
                flex-direction: column;
                align-items: flex-start;
              }
              .xd-float-actions {
                right: 16px;
                bottom: 20px;
              }
            }
          `}})]}):e.jsxs(j,{style:{textAlign:"center",padding:40,borderRadius:16},bordered:!1,children:[e.jsx(X,{level:4,children:"未能加载数字专家详情"}),e.jsx(o,{onClick:()=>c("/app/expert-center"),type:"primary",children:"返回专家中心"})]})}export{Te as default};
