import{i as X,v as Y,k as ee,r as n,j as e,w as se,C as u,T as te,B as d,a as v,b as f,S as w,e as F,t as ae,aD as D,y as L,aC as re,z as O,Z as G,a7 as ie,E as ne,aB as oe,s as de,P as le,l as N}from"./index-DxdDlf0e.js";import{A as ce}from"./arrow-left-DVZC9Wya.js";import{D as pe}from"./index-DfanRP2L.js";import{C as xe}from"./circle-check-L13yihWd.js";/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=[["path",{d:"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z",key:"m3kijz"}],["path",{d:"m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",key:"1fmvmk"}],["path",{d:"M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0",key:"1f8sc4"}],["path",{d:"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",key:"qeys4"}]],J=X("rocket",fe),{Title:W,Paragraph:he,Text:l}=te,me="copaw_scene_start_v1",ge="copaw_scene_pending_v1",K="copaw_scene_session_map_v1",a=r=>String(r||"").trim(),ue=()=>{try{const r=sessionStorage.getItem(K);if(!r)return{};const c=JSON.parse(r);return c&&typeof c=="object"?c:{}}catch{return{}}},ye=r=>{sessionStorage.setItem(K,JSON.stringify(r))};function je({src:r,title:c,onClose:z}){const[C,s]=n.useState(!0),[I,p]=n.useState(18);return n.useEffect(()=>{if(!r)return;s(!0),p(18);const m=window.setInterval(()=>{p(y=>y>=88?y:y+7)},180);return()=>window.clearInterval(m)},[r]),r?e.jsxs("div",{className:"ed-chat-shell",children:[e.jsxs("div",{className:"ed-chat-toolbar",children:[e.jsxs(w,{size:8,wrap:!0,children:[e.jsx(F,{color:"blue",style:{marginInlineEnd:0},children:"当前会话"}),e.jsx(l,{style:{fontSize:13,color:"#334155",fontWeight:600},children:c||"员工分身会话"})]}),e.jsx(d,{size:"small",onClick:z,children:"收起会话"})]}),C?e.jsxs("div",{className:"ed-chat-progress",children:[e.jsx("div",{style:{fontSize:13,fontWeight:700,color:"#1e3a8a",marginBottom:4},children:"分身会话正在同步"}),e.jsx("div",{style:{fontSize:12,color:"#64748b",marginBottom:8},children:"正在挂载员工上下文、恢复会话命名并生成首条场景内容..."}),e.jsx(le,{percent:I,size:"small",showInfo:!1,strokeColor:{from:"#60a5fa",to:"#2563eb"},trailColor:"#dbeafe",status:"active"})]}):null,e.jsx("div",{className:"ed-chat-frame-wrap",children:e.jsx("iframe",{src:r,title:"员工分身会话窗",onLoad:()=>{p(100),window.setTimeout(()=>s(!1),320)},style:{width:"100%",height:"70vh",border:"none",background:"#fff"}})})]}):null}function _e(){const{employeeId:r}=Y(),c=ee(),[z,C]=n.useState(!0),[s,I]=n.useState(null),[p,m]=n.useState(!1),[y,M]=n.useState("员工分身会话"),[E,U]=n.useState(""),[j,R]=n.useState(!1),B=n.useRef(null);n.useEffect(()=>{try{const t=sessionStorage.getItem(me);if(t){const o=JSON.parse(t);(o==null?void 0:o.key)===r&&(I(o),M(a(o.sessionName)||a(o.label)||"员工分身会话"))}}catch(t){console.error("Failed to parse employee info from session",t)}finally{C(!1)}},[r]);const x=n.useMemo(()=>s!=null&&s.context&&typeof s.context=="object"?s.context:{},[s]),i=n.useMemo(()=>a(x.target_user_name)||a(x.employee)||a(s==null?void 0:s.label).replace(/\s*数字分身\s*$/,"")||"员工",[s,x]),q=a(x.department)||"未分配部门",H=a(x.scene_target_user_id)||a(x.target_user_id)||a(x.scene_target_profile_id)||"-",g=a(s==null?void 0:s.key),h=a(s==null?void 0:s.sessionName)||`${i||"员工"} 数字分身会话`,b=a(s==null?void 0:s.prompt)||`我是当前协作者，不是${i}本人。现在我要和${i}的数字分身对话。请你直接以“${i}的数字分身”身份向我回应，先简洁说明你能代表${i}提供哪些档案事实信息，以及如果我要留言、通知或交办事项，应该如何转达给${i}。不要欢迎${i}回来，也不要把我当成${i}本人。`,Z=`已打开「${h}」，正在连接${i}的数字分身，请稍候查看首条协同回复。`,T=()=>{sessionStorage.setItem("copaw_secretary_scene_context",`正在查看员工 ${i} 的数字分身详情，并准备安排协作任务`),c("/app/secretary")},P=()=>{window.setTimeout(()=>{var t;(t=B.current)==null||t.scrollIntoView({behavior:"smooth",block:"start"})},80)},V=async()=>{var A;if(!s||!g)throw new Error("missing employee scene");const t={scene_key:g,scene_label:a(s.label)||`${i} 数字分身`,scene_trigger_key:a(s.triggerKey)||g,scene_prompt:b,hidden_user_prompt:b,hidden_prompt_history:b?[b]:[],scene_context:x,scene_skill:a(s.skill)||"employee_agent_link",scene_template_type:a(s.templateType)||"scene",locked_session_name:!0,session_display_name:h,scene_bootstrap_status:"ready"},o=ue(),S=a(o[g]);if(S&&N.peekSession(S))return await N.updateSession({id:S,name:h,meta:t}),{sessionId:S,isNew:!1};const $=await N.createSession({name:h,pushMessage:Z,meta:t}),_=a((A=$==null?void 0:$[0])==null?void 0:A.id);if(!_)throw new Error("create session failed");return await N.updateSession({id:_,name:h,meta:t}),o[g]=_,ye(o),{sessionId:_,isNew:!0}},k=async()=>{if(s){R(!0);try{const{sessionId:t,isNew:o}=await V();o&&sessionStorage.setItem(ge,JSON.stringify({id:t,prompt:b,processingText:"正在同步员工分身上下文并生成首条场景内容...",ts:Date.now()})),M(h),U(`/app/workspace-embed/${encodeURIComponent(t)}?simple=1&scene=${encodeURIComponent(g)}&t=${Date.now()}`),m(!0),P()}catch(t){console.error("Failed to open employee chat:",t),de.error("开启分身会话失败，请稍后重试")}finally{R(!1)}}},Q=()=>{if(p){m(!1);return}if(E){m(!0),P();return}k()};return z?e.jsx("div",{style:{textAlign:"center",padding:100},children:e.jsx(se,{size:"large"})}):s?e.jsxs("div",{style:{maxWidth:1620,margin:"0 auto",padding:"6px 4px 28px"},children:[e.jsx(u,{bordered:!1,style:{borderRadius:24,background:"linear-gradient(120deg, #0f172a 0%, #1e293b 45%, #334155 100%)",marginBottom:18,boxShadow:"0 20px 48px rgba(15, 23, 42, 0.32)"},styles:{body:{padding:28}},children:e.jsxs(v,{gutter:[18,18],align:"middle",children:[e.jsx(f,{xs:24,xl:16,children:e.jsxs(w,{direction:"vertical",size:8,children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"},children:[e.jsxs(F,{color:"cyan",style:{borderRadius:999,paddingInline:12},children:[e.jsx(ae,{size:12,style:{marginRight:6}})," Employee Digital Persona"]}),e.jsxs(l,{style:{color:"rgba(255,255,255,0.75)"},children:["ID: ",H]})]}),e.jsxs(W,{level:2,style:{color:"#fff",margin:0,display:"flex",alignItems:"center",gap:10},children:[e.jsx(D,{size:28})," ",i," 的数字分身"]}),e.jsx(l,{style:{color:"rgba(255,255,255,0.82)",fontSize:15},children:"详情页内可直接锁定会话、挂载隐藏提示词并展开会话区，避免首屏空白等待。"})]})}),e.jsx(f,{xs:24,xl:8,children:e.jsxs("div",{className:"ed-hero-actions",children:[e.jsxs(w,{wrap:!0,children:[e.jsx(d,{icon:e.jsx(ce,{size:14}),onClick:()=>c("/app/employee-center"),children:"返回员工中心"}),e.jsx(d,{icon:e.jsx(L,{size:14}),onClick:T,children:"咨询秘书"})]}),e.jsx(d,{type:"primary",size:"large",icon:e.jsx(J,{size:16}),onClick:()=>void k(),className:"ed-primary-btn ed-primary-btn-hero",loading:j,children:"分配任务 / 开启会话"}),e.jsx(l,{className:"ed-hero-tip",children:"会话命名锁定，首次打开将自动注入场景开场内容。"})]})})]})}),e.jsxs(v,{gutter:[18,18],children:[e.jsx(f,{xs:24,xl:17,children:e.jsxs(w,{direction:"vertical",size:18,style:{width:"100%"},children:[e.jsxs(u,{title:"员工分身档案",bordered:!1,className:"ed-surface-card",children:[e.jsx(he,{style:{fontSize:15,color:"#334155",marginBottom:12},children:"该分身用于承接跨部门沟通、任务交办与信息确认。系统将保持协作者身份，不会识别为员工本人。"}),e.jsx(pe,{style:{margin:"12px 0 16px"}}),e.jsxs(v,{gutter:[16,14],children:[e.jsxs(f,{xs:24,md:8,children:[e.jsx(l,{type:"secondary",children:"员工姓名"}),e.jsx("div",{className:"ed-info-value",children:i})]}),e.jsxs(f,{xs:24,md:8,children:[e.jsx(l,{type:"secondary",children:"所属部门"}),e.jsxs("div",{className:"ed-info-value",children:[e.jsx(re,{size:14})," ",q]})]}),e.jsxs(f,{xs:24,md:8,children:[e.jsx(l,{type:"secondary",children:"触发场景"}),e.jsx("div",{className:"ed-info-value",children:s.triggerKey})]})]})]}),e.jsx("div",{ref:B,children:e.jsx(u,{title:"会话区",bordered:!1,className:"ed-surface-card",extra:e.jsx(d,{type:p?"default":"primary",onClick:Q,loading:j,children:p?"收起会话区":"展开会话区"}),children:p&&E?e.jsx(je,{src:E,title:y||h,onClose:()=>m(!1)}):e.jsxs("div",{className:"ed-chat-collapsed",children:[e.jsxs("div",{children:[e.jsxs(l,{strong:!0,style:{fontSize:16,color:"#0f172a",display:"block",marginBottom:4},children:["一键进入 ",i," 的分身会话"]}),e.jsx(l,{type:"secondary",children:"打开后会先写入隐藏场景提示词，再展开内嵌会话区，保持首屏有明确开场内容。"}),e.jsx("div",{style:{marginTop:12},children:e.jsx(O,{status:"processing",text:"会话将复用原员工分身链路"})})]}),e.jsx(d,{type:"primary",icon:e.jsx(G,{size:14}),className:"ed-primary-btn",loading:j,onClick:()=>void k(),children:"立即展开会话"})]})})}),e.jsxs(u,{title:"协作能力",bordered:!1,className:"ed-surface-card",children:[s.skill?e.jsxs("div",{className:"ed-skill-banner",children:[e.jsx(ie,{size:19,color:"#4338ca",style:{marginTop:1}}),e.jsxs("div",{children:[e.jsx(l,{strong:!0,style:{fontSize:16,display:"block",marginBottom:2},children:s.skill}),e.jsx(l,{type:"secondary",children:"支持员工档案事实说明、留言代转、任务交办与协作跟进。"})]})]}):e.jsx(ne,{description:"当前分身使用默认协作能力"}),e.jsxs("div",{style:{marginTop:14},children:[e.jsx(l,{strong:!0,style:{display:"block",marginBottom:12},children:"标准协作项"}),e.jsx(v,{gutter:[12,12],children:["员工身份事实确认","留言与通知转达","任务交办建议生成","协作上下文保持"].map(t=>e.jsx(f,{xs:24,md:12,children:e.jsxs("div",{className:"ed-check-item",children:[e.jsx(xe,{size:16,color:"#22c55e"}),t]})},t))})]})]})]})}),e.jsx(f,{xs:24,xl:7,children:e.jsx(u,{title:"快速操作",bordered:!1,className:"ed-surface-card",style:{position:"sticky",top:16},children:e.jsxs(w,{direction:"vertical",style:{width:"100%"},children:[e.jsx(d,{block:!0,size:"large",type:"primary",icon:e.jsx(G,{size:14}),className:"ed-primary-btn",loading:j,onClick:()=>void k(),children:"开启该分身会话"}),e.jsx(d,{block:!0,size:"large",icon:e.jsx(oe,{size:14}),onClick:T,children:"让秘书协助交办"}),e.jsx(d,{block:!0,size:"large",icon:e.jsx(D,{size:14}),onClick:()=>c("/app/employee-center"),children:"返回员工中心"}),e.jsx("div",{className:"ed-note-box",children:e.jsx(O,{status:"processing",text:"会话命名已锁定，隐藏提示词仅首次自动注入"})})]})})})]}),e.jsxs("div",{className:"ed-float-actions",children:[e.jsx(d,{type:"primary",icon:e.jsx(J,{size:14}),className:"ed-primary-btn ed-float-primary",loading:j,onClick:()=>void k(),children:"开启会话"}),e.jsx(d,{icon:e.jsx(L,{size:14}),className:"ed-float-secondary",onClick:T,children:"分配任务"})]}),e.jsx("style",{dangerouslySetInnerHTML:{__html:`
            .ed-surface-card {
              border-radius: 18px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .ed-primary-btn {
              border: none !important;
              border-radius: 12px !important;
              background: linear-gradient(135deg, #3730a3 0%, #4f46e5 48%, #6366f1 100%) !important;
              box-shadow: 0 12px 26px rgba(79, 70, 229, 0.34);
            }
            .ed-primary-btn-hero {
              min-width: 240px;
              height: 48px;
              font-weight: 700;
            }
            .ed-hero-actions {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 12px;
            }
            .ed-hero-tip {
              color: rgba(255,255,255,0.76);
              font-size: 12px;
            }
            .ed-skill-banner {
              display: flex;
              gap: 12px;
              align-items: flex-start;
              background: linear-gradient(180deg, #f8faff 0%, #eef2ff 100%);
              border: 1px solid #dbe5ff;
              border-radius: 12px;
              padding: 14px;
            }
            .ed-info-value {
              margin-top: 6px;
              font-weight: 700;
              color: #0f172a;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .ed-check-item {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 10px 12px;
              width: 100%;
              border-radius: 10px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
            }
            .ed-note-box {
              border-radius: 10px;
              border: 1px dashed #c7d2fe;
              background: #eef2ff;
              padding: 10px 12px;
            }
            .ed-chat-collapsed {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 18px;
              border-radius: 16px;
              border: 1px solid #dbeafe;
              background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
            }
            .ed-chat-shell {
              border-radius: 20px;
              border: 1px solid #e2e8f0;
              box-shadow: 0 10px 30px rgba(15,23,42,0.06);
              overflow: hidden;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
            }
            .ed-chat-toolbar {
              padding: 12px 18px;
              border-bottom: 1px solid #e2e8f0;
              background: #f8fafc;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              flex-wrap: wrap;
            }
            .ed-chat-progress {
              padding: 14px 18px;
              background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
              border-bottom: 1px solid #dbeafe;
            }
            .ed-chat-frame-wrap {
              padding: 16px;
              background: #f1f5f9;
            }
            .ed-chat-frame-wrap iframe {
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(15,23,42,0.08);
            }
            .ed-float-actions {
              position: fixed;
              right: 24px;
              bottom: 28px;
              z-index: 1100;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .ed-float-primary {
              height: 44px;
              padding-inline: 16px !important;
              border-radius: 14px !important;
            }
            .ed-float-secondary {
              border-radius: 14px !important;
              box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
            }
            @media (max-width: 1200px) {
              .ed-hero-actions {
                align-items: flex-start;
              }
            }
            @media (max-width: 768px) {
              .ed-chat-collapsed {
                flex-direction: column;
                align-items: flex-start;
              }
              .ed-float-actions {
                right: 16px;
                bottom: 20px;
              }
            }
          `}})]}):e.jsxs(u,{style:{textAlign:"center",padding:40,borderRadius:16},bordered:!1,children:[e.jsx(W,{level:4,children:"未能加载员工分身详情"}),e.jsx(d,{onClick:()=>c("/app/employee-center"),type:"primary",children:"返回员工中心"})]})}export{_e as default};
