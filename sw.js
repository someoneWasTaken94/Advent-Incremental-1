if(!self.define){let e,s={};const i=(i,n)=>(i=new URL(i+".js",n).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(n,l)=>{const r=e||("document"in self?document.currentScript.src:"")||location.href;if(s[r])return;let t={};const o=e=>i(e,r),u={module:{uri:r},exports:t,require:o};s[r]=Promise.all(n.map((e=>u[e]||o(e)))).then((e=>(l(...e),t)))}}define(["./workbox-958fa2bd"],(function(e){"use strict";self.addEventListener("message",(e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()})),e.precacheAndRoute([{url:"assets/@fontsource.c175eac8.css",revision:null},{url:"assets/@vue.4ce677c2.js",revision:null},{url:"assets/gameLoop.c1762cfe.js",revision:null},{url:"assets/index.164c34c6.js",revision:null},{url:"assets/index.efcf3a7b.css",revision:null},{url:"assets/is-plain-object.906d88e8.js",revision:null},{url:"assets/lz-string.731cedc5.js",revision:null},{url:"assets/nanoevents.1080beb7.js",revision:null},{url:"assets/sortablejs.29100d8a.js",revision:null},{url:"assets/vue-next-select.9e6f4164.css",revision:null},{url:"assets/vue-next-select.a2bfab1d.js",revision:null},{url:"assets/vue-textarea-autosize.35804eaf.js",revision:null},{url:"assets/vue-toastification.4b5f8ac8.css",revision:null},{url:"assets/vue-toastification.6f567382.js",revision:null},{url:"assets/vue.92681fcb.js",revision:null},{url:"assets/vuedraggable.7949458c.js",revision:null},{url:"assets/workbox-window.8d14e8b7.js",revision:null},{url:"index.html",revision:"9bf4052791b1aa82e7d51d51fa638a1a"},{url:"favicon.ico",revision:"eead31eb5b19fa3bdc34af83d898c0b7"},{url:"robots.txt",revision:"5e0bd1c281a62a380d7a948085bfe2d1"},{url:"apple-touch-icon.png",revision:"26e53bb981d06c8069ffd9d2a14fce0e"},{url:"pwa-192x192.png",revision:"a16785d9e890858c5b508e0ef6954aaf"},{url:"pwa-512x512.png",revision:"b84004b93fd62ef6599ff179372861a1"},{url:"manifest.webmanifest",revision:"5f32ad2a77eb001e1b6a588835dc1efc"}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))}));
