import{$ as j,r as p,j as a,F as l,a1 as O,a0 as h,a2 as S,R as I}from"./index-DxdDlf0e.js";import{R as w}from"./index-BnEVknQ_.js";var b;function F(e,r){return r||(r=e.slice(0)),Object.freeze(Object.defineProperties(e,{raw:{value:Object.freeze(r)}}))}var _=j(b||(b=F([`
.`,`-form {
  .`,`-required-mark {
    color: var(--`,`-color-error);
    line-height: 1;
    margin-top: 0;
    font-size: 16px;
  }
  
  .`,"-form-item .",`-form-item-label {
    text-align: left;
  }
}

.`,"-form-item .",`-form-item-label > label {
  font-weight: 500;
  white-space: normal;
  font-size: 13px;
  line-height: 20px;
  color: var(--`,`-color-text);
  gap: 4px;
}

.`,`-form-label-margin-small {
  .`,`-form-item-label > label {
    margin-right: 8px;
  }
}

.`,`-col {
  min-height: unset;
}
`])),function(e){return e.sparkPrefix},function(e){return e.sparkPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.sparkPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix}),R=["labelMarginRight"],k=["tooltip"];function c(e){"@babel/helpers - typeof";return c=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(r){return typeof r}:function(r){return r&&typeof Symbol=="function"&&r.constructor===Symbol&&r!==Symbol.prototype?"symbol":typeof r},c(e)}function g(e,r){var t=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);r&&(n=n.filter(function(o){return Object.getOwnPropertyDescriptor(e,o).enumerable})),t.push.apply(t,n)}return t}function f(e){for(var r=1;r<arguments.length;r++){var t=arguments[r]!=null?arguments[r]:{};r%2?g(Object(t),!0).forEach(function(n){E(e,n,t[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):g(Object(t)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(t,n))})}return e}function E(e,r,t){return r=C(r),r in e?Object.defineProperty(e,r,{value:t,enumerable:!0,configurable:!0,writable:!0}):e[r]=t,e}function C(e){var r=L(e,"string");return c(r)=="symbol"?r:String(r)}function L(e,r){if(c(e)!="object"||!e)return e;var t=e[Symbol.toPrimitive];if(t!==void 0){var n=t.call(e,r);if(c(n)!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(r==="string"?String:Number)(e)}function y(e,r){if(e==null)return{};var t=M(e,r),n,o;if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(o=0;o<i.length;o++)n=i[o],!(r.indexOf(n)>=0)&&Object.prototype.propertyIsEnumerable.call(e,n)&&(t[n]=e[n])}return t}function M(e,r){if(e==null)return{};var t={},n=Object.keys(e),o,i;for(i=0;i<n.length;i++)o=n[i],!(r.indexOf(o)>=0)&&(t[o]=e[o]);return t}var q=p.forwardRef(function(e,r){var t=e.labelMarginRight,n=t===void 0?void 0:t,o=y(e,R),i=p.useRef(null),s=h(),m=s.sparkPrefix,P=_();return p.useImperativeHandle(r,function(){return i.current}),a.jsxs(a.Fragment,{children:[a.jsx(P,{}),a.jsx(l,f(f({},o),{},{className:O(e.className,"".concat(m,"-form"),n==="small"&&"".concat(m,"-form-label-margin-small")),ref:i,requiredMark:function(x,d){return a.jsxs(a.Fragment,{children:[x,d.required&&a.jsx("span",{className:"".concat(m,"-required-mark"),children:"*"})]})}}))]})}),z=function(r){var t=r.tooltip,n=y(r,k),o=a.jsx(w,{});function i(){if(t){var s=c(t)==="object"&&!I.isValidElement(t)?f(f({},t),{},{icon:t.icon||o}):{title:t,icon:o};return s}}return a.jsx(l.Item,f(f({},n),{},{tooltip:i(),labelCol:r.labelCol||(r.layout==="vertical"?{flex:"unset"}:void 0)}))},v=z;v.useStatus=S.useStatus;var u=q;u.Item=v;u.List=l.List;u.ErrorList=l.ErrorList;u.Provider=l.Provider;u.useForm=l.useForm;u.useFormInstance=l.useFormInstance;u.useWatch=l.useWatch;export{u as S};
