import{R as S,V as z,aL as j,g as q,s as Z,a as H,b as J,t as K,q as Q,_ as u,l as F,c as X,F as Y,L as tt,a5 as et,e as at,z as rt,G as it}from"./index-C0bwmo58.js";import{p as nt}from"./chunk-4BX2VUAB-DqfLw8Wb.js";import{p as ot}from"./treemap-GDKQZRPO-4MVOP2yO.js";import{d as P}from"./arc-DxM90Zdm.js";import{o as st}from"./ordinal-Cboi1Yqb.js";import"./index-DxdDlf0e.js";import"./maximize-2-CVKNouye.js";import"./DeleteOutlined-HDPy7qni.js";import"./DownloadOutlined-DuiWPMSd.js";import"./CloseOutlined-CFh_hkmr.js";import"./AntdIcon-Cl9yUw_o.js";import"./SparkFalseLine-TgO29bqt.js";import"./index-Dh6h6InG.js";import"./addEventListener-DgvP2cSS.js";import"./index-B2KL3k7F.js";import"./index--zPucITJ.js";import"./SparkPlusLine-BlvxJz95.js";import"./index-b4efyyb_.js";import"./index-BoRglvSz.js";import"./index-D2chs8gf.js";import"./index-gcuZNg-O.js";import"./_baseUniq-BxiLeHxj.js";import"./_basePickBy-DjLd95iq.js";import"./clone-CEKbYhrE.js";import"./init-Gi6I4Gst.js";function lt(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function ct(t){return t}function pt(){var t=ct,a=lt,m=null,x=S(0),o=S(z),l=S(0);function s(e){var i,c=(e=j(e)).length,g,y,h=0,p=new Array(c),n=new Array(c),v=+x.apply(this,arguments),w=Math.min(z,Math.max(-z,o.apply(this,arguments)-v)),f,C=Math.min(Math.abs(w)/c,l.apply(this,arguments)),$=C*(w<0?-1:1),d;for(i=0;i<c;++i)(d=n[p[i]=i]=+t(e[i],i,e))>0&&(h+=d);for(a!=null?p.sort(function(A,D){return a(n[A],n[D])}):m!=null&&p.sort(function(A,D){return m(e[A],e[D])}),i=0,y=h?(w-c*$)/h:0;i<c;++i,v=f)g=p[i],d=n[g],f=v+(d>0?d*y:0)+$,n[g]={data:e[g],index:i,value:d,startAngle:v,endAngle:f,padAngle:C};return n}return s.value=function(e){return arguments.length?(t=typeof e=="function"?e:S(+e),s):t},s.sortValues=function(e){return arguments.length?(a=e,m=null,s):a},s.sort=function(e){return arguments.length?(m=e,a=null,s):m},s.startAngle=function(e){return arguments.length?(x=typeof e=="function"?e:S(+e),s):x},s.endAngle=function(e){return arguments.length?(o=typeof e=="function"?e:S(+e),s):o},s.padAngle=function(e){return arguments.length?(l=typeof e=="function"?e:S(+e),s):l},s}var ut=it.pie,G={sections:new Map,showData:!1},T=G.sections,L=G.showData,gt=structuredClone(ut),dt=u(()=>structuredClone(gt),"getConfig"),mt=u(()=>{T=new Map,L=G.showData,rt()},"clear"),ft=u(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),ht=u(()=>T,"getSections"),vt=u(t=>{L=t},"setShowData"),St=u(()=>L,"getShowData"),I={getConfig:dt,clear:mt,setDiagramTitle:Q,getDiagramTitle:K,setAccTitle:J,getAccTitle:H,setAccDescription:Z,getAccDescription:q,addSection:ft,getSections:ht,setShowData:vt,getShowData:St},xt=u((t,a)=>{nt(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),yt={parse:u(async t=>{const a=await ot("pie",t);F.debug(a),xt(a,I)},"parse")},wt=u(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),At=wt,Dt=u(t=>{const a=[...t.values()].reduce((o,l)=>o+l,0),m=[...t.entries()].map(([o,l])=>({label:o,value:l})).filter(o=>o.value/a*100>=1).sort((o,l)=>l.value-o.value);return pt().value(o=>o.value)(m)},"createPieArcs"),Ct=u((t,a,m,x)=>{F.debug(`rendering pie chart
`+t);const o=x.db,l=X(),s=Y(o.getConfig(),l.pie),e=40,i=18,c=4,g=450,y=g,h=tt(a),p=h.append("g");p.attr("transform","translate("+y/2+","+g/2+")");const{themeVariables:n}=l;let[v]=et(n.pieOuterStrokeWidth);v??(v=2);const w=s.textPosition,f=Math.min(y,g)/2-e,C=P().innerRadius(0).outerRadius(f),$=P().innerRadius(f*w).outerRadius(f*w);p.append("circle").attr("cx",0).attr("cy",0).attr("r",f+v/2).attr("class","pieOuterCircle");const d=o.getSections(),A=Dt(d),D=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12];let b=0;d.forEach(r=>{b+=r});const N=A.filter(r=>(r.data.value/b*100).toFixed(0)!=="0"),E=st(D);p.selectAll("mySlices").data(N).enter().append("path").attr("d",C).attr("fill",r=>E(r.data.label)).attr("class","pieCircle"),p.selectAll("mySlices").data(N).enter().append("text").text(r=>(r.data.value/b*100).toFixed(0)+"%").attr("transform",r=>"translate("+$.centroid(r)+")").style("text-anchor","middle").attr("class","slice"),p.append("text").text(o.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText");const R=[...d.entries()].map(([r,M])=>({label:r,value:M})),k=p.selectAll(".legend").data(R).enter().append("g").attr("class","legend").attr("transform",(r,M)=>{const O=i+c,V=O*R.length/2,B=12*i,U=M*O-V;return"translate("+B+","+U+")"});k.append("rect").attr("width",i).attr("height",i).style("fill",r=>E(r.label)).style("stroke",r=>E(r.label)),k.append("text").attr("x",i+c).attr("y",i-c).text(r=>o.getShowData()?`${r.label} [${r.value}]`:r.label);const _=Math.max(...k.selectAll("text").nodes().map(r=>(r==null?void 0:r.getBoundingClientRect().width)??0)),W=y+e+i+c+_;h.attr("viewBox",`0 0 ${W} ${g}`),at(h,g,W,s.useMaxWidth)},"draw"),$t={draw:Ct},Qt={parser:yt,db:I,renderer:$t,styles:At};export{Qt as diagram};
