import{i as P,k as R,r as g,ap as M,j as e,C as u,a as v,b as m,S as W,e as z,t as q,T as D,K,s as $,I as O,ao as H,a6 as F,w as G,at as J,au as Y,aq as Q,aB as V,z as X,aC as Z,B as I,as as ee,E as w,P as te,aD as se,f as T,m as ae}from"./index-DxdDlf0e.js";import{P as re}from"./PageAiInsightCard-BKJ3eJc7.js";import{U as ne}from"./users-B1Ec4LFX.js";/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7",key:"132q7q"}],["rect",{x:"2",y:"4",width:"20",height:"16",rx:"2",key:"izxlao"}]],le=P("mail",ie),{Title:A,Text:j}=D,a=b=>String(b||"").trim();function pe(){const b=R(),[E,S]=g.useState(!1),[x,_]=g.useState([]),[y,U]=g.useState(""),[h,k]=g.useState("all"),[f,B]=g.useState("当前员工");g.useEffect(()=>{let t=!1;return(async()=>{S(!0);try{const r=await T.getMe();t||B(a(r.name)||"当前员工");const n=200;let l=1,o=null;const c=[];for(;;){const d=await T.listAdminUsers({page:l,page_size:n}),C=(d==null?void 0:d.items)||d||[];if(c.push(...C),typeof(d==null?void 0:d.total)=="number"&&(o=Number(d.total)),o!==null&&c.length>=o||o===null&&C.length<n)break;l+=1}t||_(c.filter(d=>a(d.name)).map(d=>({...d,name:a(d.name)})))}catch(r){try{const n=await ae.listActiveUsers(),l=((n==null?void 0:n.items)||[]).map((o,c)=>({id:Number(o.user_id)||c+1,user_id:String(o.user_id||""),profile_id:Number(o.user_id)||c+1,name:a(o.name)||`员工${c+1}`,phone:"",role:"employee",status:"active",created_at:"",department:a(o.department),position:a(o.position)}));t||_(l)}catch(n){console.error("Failed to load users:",r,n),t||($.error("加载员工列表失败"),_([]))}}finally{t||S(!1)}})(),()=>{t=!0}},[]);const p=g.useMemo(()=>{const t=new Set;return x.forEach(s=>{const r=a(s.department);r&&t.add(r)}),Array.from(t).sort()},[x]),i=g.useMemo(()=>{const t=y.toLowerCase().trim();return x.filter(s=>{const r=a(s.name).toLowerCase(),n=a(s.position).toLowerCase(),l=a(s.department).toLowerCase(),o=!t||r.includes(t)||n.includes(t)||l.includes(t),c=h==="all"||a(s.department)===h;return o&&c})},[x,y,h]),L=g.useMemo(()=>{const t=h==="all"?"全部部门":h,s=a(y)||"无关键词",r=i.slice(0,3).map(l=>a(l.name)||"员工").filter(Boolean),n=r[0]||"首位员工";return{path:"/app/employee-center",source:"employee-center",title:i.length>0?`当前正在查看 ${t} 的 ${i.length} 名员工`:"当前筛选下暂无可协同员工",summary:`筛选部门：${t}；搜索词：${s}；当前结果 ${i.length} 名；覆盖 ${p.length} 个部门。`,tags:[t==="全部部门"?"全员视图":t,s==="无关键词"?"未检索":`检索:${s}`],insights:[`优先关注：${r.join("、")||"请调整筛选条件"}`,`当前可直接发起分身协同：${n}`,`当前结果覆盖 ${p.length} 个部门`],quickPrompts:i.length>0?["基于当前筛选推荐最值得先联络的员工",`解释为什么应该优先联系${n}`,"围绕当前员工视图生成分工建议"]:["当前筛选没有结果，帮我判断应该如何调整搜索条件","基于全员视图推荐值得优先关注的协同对象"],promptContext:["页面：员工中心",`当前操作者：${f}`,`筛选部门：${t}`,`搜索关键词：${s}`,`当前结果数：${i.length}`,`部门总数：${p.length}`,`优先关注员工：${r.join("、")||"-"}`].join(`
`)}},[h,f,p.length,i,y]);M(L);const N=t=>{const s=a(t.name)||a(t.department)||"员工",r=a(t.user_id)||String(t.id||"").trim();if(!r){$.warning("员工标识缺失，暂时无法查看详情");return}const n=`employee-center-chat-${r}`,l=Date.now();sessionStorage.setItem("copaw_scene_start_v1",JSON.stringify({key:n,label:`${s} 数字分身`,triggerKey:"org-dept-staff",sessionName:`${s} 数字分身会话`,prompt:`我是${f}，不是${s}本人。现在我要和${s}的数字分身对话。请你直接以“${s}的数字分身”身份向我回应，先简洁说明你能代表${s}提供哪些档案事实信息，以及如果我要留言、通知或交办事项，应该如何转达给${s}。不要欢迎${s}回来，也不要把我当成${s}本人。`,context:{department:a(t.department),employee:s,target_name:s,target_user_name:s,target_type:"employee",scene_target_name:s,scene_target_user_name:s,scene_target_user_id:r,scene_target_profile_id:r,current_user_name:f,scene_actor_name:f,scene_actor_user_name:f,scene_actor_user_id:sessionStorage.getItem("copaw_user_id")||localStorage.getItem("copaw_user_id")||""},skill:"employee_agent_link",templateType:"scene",ts:l})),b(`/app/employee/${encodeURIComponent(n)}?t=${l}`)};return e.jsxs("div",{style:{padding:24,maxWidth:1620,margin:"0 auto"},children:[e.jsx(u,{bordered:!1,style:{borderRadius:24,marginBottom:20,background:"linear-gradient(120deg, #1e1b4b 0%, #3730a3 45%, #4f46e5 100%)",boxShadow:"0 20px 45px rgba(49, 46, 129, 0.35)"},styles:{body:{padding:28}},children:e.jsxs(v,{gutter:[16,16],align:"middle",children:[e.jsx(m,{xs:24,xl:16,children:e.jsxs(W,{direction:"vertical",size:8,children:[e.jsxs(z,{color:"geekblue",style:{width:"fit-content",borderRadius:999,paddingInline:12},children:[e.jsx(q,{size:12,style:{marginRight:6}})," Employee Collaboration Hub"]}),e.jsx(A,{level:2,style:{color:"#fff",margin:0,fontWeight:800},children:"员工中心"}),e.jsxs(j,{style:{color:"rgba(255,255,255,0.86)",fontSize:15},children:["欢迎你，",f,"。在这里统一查看员工数字分身并发起协作。"]})]})}),e.jsx(m,{xs:24,xl:8,children:e.jsxs(v,{gutter:12,children:[e.jsx(m,{span:8,children:e.jsxs("div",{className:"ec-stat-box",children:[e.jsx("div",{className:"ec-stat-value",children:x.length}),e.jsx("div",{className:"ec-stat-label",children:"员工总数"})]})}),e.jsx(m,{span:8,children:e.jsxs("div",{className:"ec-stat-box",children:[e.jsx("div",{className:"ec-stat-value",children:p.length}),e.jsx("div",{className:"ec-stat-label",children:"部门数量"})]})}),e.jsx(m,{span:8,children:e.jsxs("div",{className:"ec-stat-box",children:[e.jsx("div",{className:"ec-stat-value",children:i.length}),e.jsx("div",{className:"ec-stat-label",children:"当前结果"})]})})]})})]})}),e.jsx(re,{badge:"AI 协同推荐",tone:"indigo",title:i.length>0?`红智助手已为你识别 ${i.length} 个可协同分身`:"红智助手已识别当前筛选结果为空",description:"员工中心现在不仅展示员工列表，还会直接给出协同推荐、分身响应入口与下一步联动建议。",insights:[`当前结果：${i.length} 名员工`,`部门覆盖：${p.length} 个`,`优先关注：${i.slice(0,3).map(t=>a(t.name)||"员工").join("、")||"请先调整筛选条件"}`],suggestions:["先联系同部门或职责最匹配的员工分身，再决定是否扩大协同范围。","遇到多人协同场景时，先让秘书推荐分工和通知口径。","如需高阶判断，可从员工协同场景直接切到专家中心。"],actions:[{key:"employee-recommend",label:"让秘书推荐协同对象",type:"primary",onClick:()=>K(b,`员工中心：${f} 当前正在查看员工协同面板，共筛选出 ${i.length} 名员工、覆盖 ${p.length} 个部门。请推荐优先联络对象、分工方式与后续推进动作。`)},{key:"employee-first",label:i[0]?`让 ${a(i[0].name)||"首位员工"} 的分身响应`:"查看全部员工",onClick:()=>i[0]?N(i[0]):$.info("请先放宽筛选条件后再发起分身协同")},{key:"employee-expert",label:"进入专家中心",onClick:()=>b("/app/expert-center")}]}),e.jsxs(v,{gutter:20,children:[e.jsxs(m,{xs:24,lg:17,children:[e.jsxs(u,{bordered:!1,className:"ec-surface-card",style:{marginBottom:18},children:[e.jsx(O,{prefix:e.jsx(H,{size:18,color:"#64748b"}),placeholder:"搜索员工姓名、职位或部门",size:"large",allowClear:!0,value:y,onChange:t=>U(t.target.value),style:{borderRadius:12,height:46}}),e.jsx("div",{style:{marginTop:16},children:e.jsx(F,{activeKey:h,onChange:k,items:[{key:"all",label:"全部部门"},...p.map(t=>({key:t,label:t}))]})})]}),E?e.jsx(u,{bordered:!1,className:"ec-surface-card",style:{textAlign:"center",padding:48},children:e.jsx(G,{tip:"正在加载员工列表..."})}):e.jsx(v,{gutter:[16,16],children:i.length>0?i.map(t=>{const s=a(t.name)||"未命名员工",r=a(t.department)||"未分配部门",n=a(t.position)||"员工",l=a(t.phone)||"暂无联络方式",o=J(t.user_id??t.id??s,s),c=Y({seed:o,name:s,gender:t.gender??t.sex});return e.jsx(m,{xs:24,md:12,xxl:8,children:e.jsxs(u,{bordered:!1,hoverable:!0,className:"ec-employee-card",onClick:()=>N(t),children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:14,marginBottom:14},children:[e.jsx(Q,{size:56,src:c.src,style:{background:c.background,boxShadow:"0 10px 24px rgba(79,70,229,0.28)",fontWeight:700},children:c.fallback}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsx(A,{level:4,ellipsis:!0,style:{margin:0,fontSize:18},children:s}),e.jsxs(j,{type:"secondary",style:{display:"inline-flex",alignItems:"center",gap:6},children:[e.jsx(V,{size:12})," ",n]})]}),e.jsx(X,{status:"processing",text:"在线分身"})]}),e.jsxs("div",{className:"ec-kv-wrap",children:[e.jsxs("div",{className:"ec-kv-row",children:[e.jsx(Z,{size:13})," ",r]}),e.jsxs("div",{className:"ec-kv-row",children:[e.jsx(le,{size:13})," ",l]})]}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16},children:[e.jsx(z,{color:"blue",style:{borderRadius:8,margin:0},children:"employee_agent_link"}),e.jsxs(I,{type:"text",style:{color:"#4f46e5",fontWeight:600},children:["让分身响应 ",e.jsx(ee,{size:14})]})]})]})},`${t.id}-${t.user_id||""}`)}):e.jsx(m,{span:24,children:e.jsx(u,{bordered:!1,className:"ec-surface-card",children:e.jsx(w,{description:"暂未找到符合条件的员工"})})})})]}),e.jsx(m,{xs:24,lg:7,children:e.jsxs(u,{bordered:!1,className:"ec-surface-card",style:{position:"sticky",top:20},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:14},children:[e.jsx(ne,{size:18,color:"#4f46e5"}),e.jsx(j,{strong:!0,style:{fontSize:16},children:"部门分布"})]}),p.length===0?e.jsx(w,{image:w.PRESENTED_IMAGE_SIMPLE,description:"暂无部门数据"}):p.map(t=>{const s=x.filter(l=>a(l.department)===t).length,r=x.length?Math.round(s/x.length*100):0,n=h===t;return e.jsxs("div",{className:`ec-dept-item ${n?"active":""}`,onClick:()=>k(t),children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8},children:[e.jsx(j,{strong:!0,children:t}),e.jsxs(j,{type:"secondary",children:[s," 人"]})]}),e.jsx(te,{percent:r,size:"small",showInfo:!1,strokeColor:"#4f46e5"})]},t)}),e.jsx(I,{block:!0,style:{marginTop:12},icon:e.jsx(se,{size:14}),onClick:()=>k("all"),children:"查看全部员工"})]})})]}),e.jsx("style",{dangerouslySetInnerHTML:{__html:`
            .ec-surface-card {
              border-radius: 20px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .ec-employee-card {
              border-radius: 18px;
              background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
              border: 1px solid #edf2ff;
              transition: all 0.25s ease;
            }
            .ec-employee-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 16px 28px rgba(79, 70, 229, 0.18);
              border-color: #c7d2fe;
            }
            .ec-kv-wrap {
              background: #f8faff;
              border: 1px solid #e7ecff;
              border-radius: 12px;
              padding: 10px 12px;
              display: grid;
              gap: 8px;
            }
            .ec-kv-row {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              color: #475569;
              font-size: 13px;
            }
            .ec-stat-box {
              border: 1px solid rgba(255,255,255,0.22);
              background: rgba(255,255,255,0.1);
              border-radius: 14px;
              padding: 10px;
              text-align: center;
            }
            .ec-stat-value {
              color: #fff;
              font-size: 20px;
              line-height: 1;
              font-weight: 800;
            }
            .ec-stat-label {
              color: rgba(255,255,255,0.8);
              font-size: 12px;
              margin-top: 6px;
            }
            .ec-dept-item {
              border: 1px solid #edf2ff;
              border-radius: 12px;
              padding: 10px;
              margin-bottom: 10px;
              cursor: pointer;
              transition: all .2s ease;
            }
            .ec-dept-item:hover {
              border-color: #c7d2fe;
              background: #f8faff;
            }
            .ec-dept-item.active {
              border-color: #818cf8;
              background: #eef2ff;
            }
          `}})]})}export{pe as default};
