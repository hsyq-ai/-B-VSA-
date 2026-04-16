import{i as a,q as t}from"./index-DxdDlf0e.js";/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=[["path",{d:"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",key:"1sd12s"}],["path",{d:"M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 5.004 2.224 3 3 0 0 1-.832 2.083l-3.447 3.62a1 1 0 0 1-1.45-.001z",key:"hoo97p"}]],y=a("message-circle-heart",c);/**
 * @license lucide-react v0.562.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M12 16h.01",key:"1drbdi"}]],l=a("shield-alert",d),o="/party/organization-care",n=(e={})=>new URLSearchParams(Object.entries(e).reduce((r,[s,i])=>(r[s]=String(i),r),{})).toString(),h=e=>Array.isArray(e)?e:Array.isArray(e==null?void 0:e.items)?e.items:[],m={async list(e={}){const r=n(e),s=await t(`${o}${r?`?${r}`:""}`);return h(s)},detail:e=>t(`${o}/${encodeURIComponent(e)}`),create:e=>t(o,{method:"POST",body:JSON.stringify(e)}),update:(e,r)=>t(`${o}/${encodeURIComponent(e)}`,{method:"PUT",body:JSON.stringify(r)}),exportReport:(e={})=>{const r=n(e);return t(`${o}/export/file${r?`?${r}`:""}`)}};export{y as M,l as S,m as o};
