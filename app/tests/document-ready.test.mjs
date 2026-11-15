import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForDocument} from '../src/document-ready.mjs';

const page=overrides=>({isDestroyed:()=>false,getURL:()=> 'file:///app/index.html',...overrides});

test('A completed document remains ready after its load event, even if background loading stays active',async()=>{
 let queries=0;
 const contents=page({isLoading:()=>true,executeJavaScript:async()=>{queries++;return true;}});
 assert.equal(await waitForDocument(contents,1000),true);
 assert.equal(queries,1);
});

test('Readiness waits for the document itself rather than accepting a URL alone',async()=>{
 let queries=0;
 const contents=page({executeJavaScript:async()=>++queries>=2});
 assert.equal(await waitForDocument(contents,1000),true);
 assert.equal(queries,2);
});

test('Destroyed documents and renderer failures are reported without being treated as loaded',async()=>{
 await assert.rejects(waitForDocument(page({isDestroyed:()=>true}),1000),/fechado/);
 await assert.rejects(waitForDocument(page({executeJavaScript:async()=>{throw Error('Renderer unavailable');}}),1000),/Renderer unavailable/);
});

test('Missing URLs and stalled readiness expire instead of waiting for an event indefinitely',async()=>{
 await assert.rejects(waitForDocument(page({getURL:()=>''}),30),/Tempo limite/);
 await assert.rejects(waitForDocument(page({executeJavaScript:()=>new Promise(()=>{})}),30),/Tempo limite/);
});
