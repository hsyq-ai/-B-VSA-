import{$ as v,R as s,j as a,I as u,a1 as x,a0 as b}from"./index-DxdDlf0e.js";var p;function g(n,r){return r||(r=n.slice(0)),Object.freeze(Object.defineProperties(n,{raw:{value:Object.freeze(r)}}))}var P=v(p||(p=g([`
.`,`-input-outlined,
.`,"-input-outlined.",`-input-disabled,
.`,`-input-outlined[disabled] {
  border-color: var(--`,`-color-border-secondary);
}

.`,`-input-outlined {
  background-color: var(--`,`-color-bg-base);
}

.`,`-input {
  font-weight: 400;
  border-radius: 6px;
  
  .`,`-input-show-count-suffix,
  .`,`-input-data-count-suffix {
    color: var(--`,`-color-text-tertiary);
  }
  
  &::placeholder {
    color: var(--`,`-color-text-tertiary);
  }
}

/* prefix间距 */
.`,`-input-affix-wrapper {
  .`,`-input-prefix {
    margin-inline-end: 8px;
    color: var(--`,`-color-text-tertiary);
  }
}

.`,"-input-affix-wrapper .",`-input-clear-icon {
  font-size: 15px;
}

.`,`-input-round {
  border-radius: 999px;
}

.`,`-text-area {
  border-color: var(--`,`-color-border-secondary);
}

.`,`-input-sm {
  height: 24px;
  font-size: 12px;
}
`])),function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix});function f(n){"@babel/helpers - typeof";return f=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(r){return typeof r}:function(r){return r&&typeof Symbol=="function"&&r.constructor===Symbol&&r!==Symbol.prototype?"symbol":typeof r},f(n)}var O=["shape"];function l(n,r){var t=Object.keys(n);if(Object.getOwnPropertySymbols){var e=Object.getOwnPropertySymbols(n);r&&(e=e.filter(function(i){return Object.getOwnPropertyDescriptor(n,i).enumerable})),t.push.apply(t,e)}return t}function c(n){for(var r=1;r<arguments.length;r++){var t=arguments[r]!=null?arguments[r]:{};r%2?l(Object(t),!0).forEach(function(e){y(n,e,t[e])}):Object.getOwnPropertyDescriptors?Object.defineProperties(n,Object.getOwnPropertyDescriptors(t)):l(Object(t)).forEach(function(e){Object.defineProperty(n,e,Object.getOwnPropertyDescriptor(t,e))})}return n}function y(n,r,t){return r=j(r),r in n?Object.defineProperty(n,r,{value:t,enumerable:!0,configurable:!0,writable:!0}):n[r]=t,n}function j(n){var r=h(n,"string");return f(r)=="symbol"?r:String(r)}function h(n,r){if(f(n)!="object"||!n)return n;var t=n[Symbol.toPrimitive];if(t!==void 0){var e=t.call(n,r);if(f(e)!="object")return e;throw new TypeError("@@toPrimitive must return a primitive value.")}return(r==="string"?String:Number)(n)}function S(n,r){if(n==null)return{};var t=w(n,r),e,i;if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(n);for(i=0;i<o.length;i++)e=o[i],!(r.indexOf(e)>=0)&&Object.prototype.propertyIsEnumerable.call(n,e)&&(t[e]=n[e])}return t}function w(n,r){if(n==null)return{};var t={},e=Object.keys(n),i,o;for(o=0;o<e.length;o++)i=e[o],!(r.indexOf(i)>=0)&&(t[i]=n[i]);return t}var _=s.forwardRef(function(n,r){var t=n.shape,e=t===void 0?"default":t,i=S(n,O),o=b(),d=o.antPrefix,m=P();return a.jsxs(a.Fragment,{children:[a.jsx(m,{}),a.jsx(u,c(c({},i),{},{className:x(n.className,y({},"".concat(d,"-input-round"),e==="round")),ref:r}))]})}),D=s.forwardRef(function(n,r){var t=b(),e=t.antPrefix,i=P();return a.jsxs(a.Fragment,{children:[a.jsx(i,{}),a.jsx(u.TextArea,c(c({},n),{},{className:x("".concat(e,"-text-area"),n.className),ref:r}))]})});Object.assign(_,{TextArea:D,Search:u.Search,Password:u.Password,OTP:u.OTP});export{_ as S};
