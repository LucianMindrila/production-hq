import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'mobile.spec.mjs',workers:1,use:{headless:true},projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit',hasTouch:true}}],reporter:'list'});
