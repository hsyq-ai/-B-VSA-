import{$ as w,j as a,M as l,a1 as S,a0 as _}from"./index-DxdDlf0e.js";import{R as k}from"./CloseOutlined-CFh_hkmr.js";var p;function D(n,e){return e||(e=n.slice(0)),Object.freeze(Object.defineProperties(n,{raw:{value:Object.freeze(e)}}))}var C=w(p||(p=D([`
.`,`-modal {
  .`,`-modal-title {
    min-height: 24px;
  }
  
  .`,`-modal-content {
    padding: 0;
    border: 1px solid var(--`,`-color-border-secondary);
    
    .`,`-modal-header {
      padding: 18px 20px;
      margin-bottom: 0;
      
      .`,`-modal-title {
        line-height: 28px;
        
        .`,`-modal-title-wrapper {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          
          .`,`-modal-title {
            flex: 1;
          }
          
          .`,`-modal-title-close {
            cursor: pointer;
          }
        }
      }
    }
    
    .`,`-modal-body {
      padding: 20px;
      color: var(--`,`-color-text-secondary);
    }
    
    .`,`-modal-footer {
      padding: 16px 20px;
      margin-top: 0;
      
      .`,`-modal-footer-wrapper {
        display: flex;
        justify-content: space-between;
        align-items: center;
        
        .`,`-modal-footer-info {
          font-size: 14px;
          font-weight: normal;
          line-height: 24px;
          color: var(--`,`-color-text-tertiary);
        }
        
        .`,`-modal-footer-origin-node {
          display: flex;
          gap: 12px;
        }
      }
    }
    
    .`,`-modal-close {
      width: 32px;
      height: 32px;
      top: 16px;
      right: 16px;
      
      .`,`-modal-close-icon {
        color: var(--`,`-color-text);
      }
      
      &:hover {
        background: none;
      }
    }
  }
}

.`,`-show-divider {
  .`,`-modal-content {
    .`,`-modal-header {
      border-bottom: 1px solid var(--`,`-color-border-secondary);
    }
    
    .`,`-modal-footer {
      border-top: 1px solid var(--`,`-color-border-secondary);
    }
  }
}
`])),function(n){return n.sparkPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.sparkPrefix},function(n){return n.sparkPrefix},function(n){return n.sparkPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.sparkPrefix},function(n){return n.sparkPrefix},function(n){return n.antPrefix},function(n){return n.sparkPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.sparkPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix},function(n){return n.antPrefix});function f(n){"@babel/helpers - typeof";return f=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},f(n)}var I=["showDivider","closable"];function m(n,e){var r=Object.keys(n);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(n);e&&(t=t.filter(function(o){return Object.getOwnPropertyDescriptor(n,o).enumerable})),r.push.apply(r,t)}return r}function x(n){for(var e=1;e<arguments.length;e++){var r=arguments[e]!=null?arguments[e]:{};e%2?m(Object(r),!0).forEach(function(t){b(n,t,r[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(n,Object.getOwnPropertyDescriptors(r)):m(Object(r)).forEach(function(t){Object.defineProperty(n,t,Object.getOwnPropertyDescriptor(r,t))})}return n}function b(n,e,r){return e=M(e),e in n?Object.defineProperty(n,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):n[e]=r,n}function M(n){var e=N(n,"string");return f(e)=="symbol"?e:String(e)}function N(n,e){if(f(n)!="object"||!n)return n;var r=n[Symbol.toPrimitive];if(r!==void 0){var t=r.call(n,e);if(f(t)!="object")return t;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(n)}function E(n,e){if(n==null)return{};var r=L(n,e),t,o;if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(n);for(o=0;o<i.length;o++)t=i[o],!(e.indexOf(t)>=0)&&Object.prototype.propertyIsEnumerable.call(n,t)&&(r[t]=n[t])}return r}function L(n,e){if(n==null)return{};var r={},t=Object.keys(n),o,i;for(i=0;i<t.length;i++)o=t[i],!(e.indexOf(o)>=0)&&(r[o]=n[o]);return r}var c=function(e){var r=C(),t=_(),o=t.sparkPrefix,i=e.showDivider,y=i===void 0?!0:i,d=e.closable,v=d===void 0?!0:d,g=E(e,I),P=function(u){return e.info?a.jsxs("div",{className:"".concat(o,"-modal-footer-wrapper"),children:[a.jsx("span",{className:"".concat(o,"-modal-footer-info"),children:e.info}),a.jsx("div",{className:"".concat(o,"-modal-footer-origin-node"),children:u})]}):u},h=v?e.closeIcon||a.jsx(k,{className:"".concat(o,"-modal-title-close"),onClick:function(u){var s;(s=e.onCancel)===null||s===void 0||s.call(e,u)}}):null,j=e.footer===void 0?P:e.footer;return a.jsxs(a.Fragment,{children:[a.jsx(r,{}),a.jsx(l,x(x({},g),{},{closeIcon:null,title:a.jsxs("div",{className:"".concat(o,"-modal-title-wrapper"),children:[a.jsx("div",{className:"".concat(o,"-modal-title"),children:e.title}),h]}),wrapClassName:S("".concat(o,"-modal"),b({},"".concat(o,"-show-divider"),y),e.wrapClassName,"animate-in"),footer:j,transitionName:""}))]})};c.useModal=l.useModal;c.success=l.success;c.error=l.error;c.warning=l.warning;c.info=l.info;c.confirm=l.confirm;c.SMALL_WIDTH=640;c.MEDIUM_WIDTH=800;c.LARGE_WIDTH=960;export{c as S};
