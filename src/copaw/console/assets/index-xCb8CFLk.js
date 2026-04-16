import{$ as d,j as a,C as y,a1 as m,a0 as x}from"./index-DxdDlf0e.js";var f;function g(e,r){return r||(r=e.slice(0)),Object.freeze(Object.defineProperties(e,{raw:{value:Object.freeze(r)}}))}var v=d(f||(f=g([`
.`,`-card {
  border-radius: 6px;
  background-color: var(--`,`-color-bg-base);
  border: 1px solid var(--`,`-color-border-secondary);
}

.`,`-card {
  transition: box-shadow 0.4s ease;
  cursor: pointer;
  
  .`,`-card-body {
    padding: 0;
  }
  
  &:hover {
    box-shadow: 0px 4px 6px 0px rgba(0, 0, 0, 0.08);
  }
}

.`,`-card-wrapper {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  gap: 4px;
  
  > *:only-child {
    gap: 0;
  }
  
  .`,`-title {
    font-size: 14px;
    font-weight: 500;
    line-height: 24px;
    /* 中性色/color-text */
    color: var(--`,`-color-text);
  }
  
  .`,`-info {
    font-size: 12px;
    font-weight: normal;
    line-height: 18px;
    color: var(--`,`-color-text-tertiary);
  }
}
`])),function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.antPrefix},function(e){return e.sparkPrefix},function(e){return e.antPrefix},function(e){return e.sparkPrefix},function(e){return e.sparkPrefix},function(e){return e.antPrefix},function(e){return e.sparkPrefix},function(e){return e.antPrefix});function l(e){"@babel/helpers - typeof";return l=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(r){return typeof r}:function(r){return r&&typeof Symbol=="function"&&r.constructor===Symbol&&r!==Symbol.prototype?"symbol":typeof r},l(e)}var P=["title","info","children","className"];function u(e,r){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(e);r&&(t=t.filter(function(o){return Object.getOwnPropertyDescriptor(e,o).enumerable})),n.push.apply(n,t)}return n}function s(e){for(var r=1;r<arguments.length;r++){var n=arguments[r]!=null?arguments[r]:{};r%2?u(Object(n),!0).forEach(function(t){j(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):u(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function j(e,r,n){return r=O(r),r in e?Object.defineProperty(e,r,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[r]=n,e}function O(e){var r=h(e,"string");return l(r)=="symbol"?r:String(r)}function h(e,r){if(l(e)!="object"||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var t=n.call(e,r);if(l(t)!="object")return t;throw new TypeError("@@toPrimitive must return a primitive value.")}return(r==="string"?String:Number)(e)}function w(e,r){if(e==null)return{};var n=S(e,r),t,o;if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(o=0;o<i.length;o++)t=i[o],!(r.indexOf(t)>=0)&&Object.prototype.propertyIsEnumerable.call(e,t)&&(n[t]=e[t])}return n}function S(e,r){if(e==null)return{};var n={},t=Object.keys(e),o,i;for(i=0;i<t.length;i++)o=t[i],!(r.indexOf(o)>=0)&&(n[o]=e[o]);return n}const N=function(e){var r=e.title,n=e.info,t=e.children,o=e.className,i=w(e,P),p=v(),b=x(),c=b.sparkPrefix;return a.jsxs(a.Fragment,{children:[a.jsx(p,{}),a.jsx(y,s(s({className:m("".concat(c,"-card"),o)},i),{},{title:null,children:a.jsxs("div",{className:"".concat(c,"-card-wrapper"),children:[r&&a.jsx("div",{className:"".concat(c,"-title"),children:r}),n&&a.jsx("div",{className:"".concat(c,"-info"),children:n}),t&&a.jsx("div",{className:"".concat(c,"-content"),children:t})]})}))]})};export{N as C};
