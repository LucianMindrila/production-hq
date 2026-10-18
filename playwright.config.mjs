import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'mobile.spec.mjs',workers:1,use:{browserName:'chromium',headless:true},reporter:'list'});
