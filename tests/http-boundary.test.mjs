import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseSingleMessage, readSingleMessage } from '../dist/http-boundary.js';
const call={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'test'}};
test('rejects all JSON-RPC batches before SDK dispatch',()=>{
 for(const batch of [[],[call],[call,{...call,id:2}]]) assert.throws(()=>parseSingleMessage(JSON.stringify(batch)),e=>e.status===400);
});
test('accepts single method and rejects invalid JSON-RPC messages',()=>{
 assert.deepEqual(parseSingleMessage(JSON.stringify(call)),call);
 for(const value of ['{','null','1','{}','{"jsonrpc":"2.0","result":1}']) assert.throws(()=>parseSingleMessage(value),e=>e.status===400);
});
function req(body,headers={}) {const r=Readable.from([Buffer.from(body)]);r.headers=headers;return r;}
test('enforces actual and declared size cap before dispatch',async()=>{
 await assert.rejects(readSingleMessage(req('x'.repeat(65537))),e=>e.status===413);
 await assert.rejects(readSingleMessage(req('{}',{'content-length':'65537'})),e=>e.status===413);
 await assert.rejects(readSingleMessage(req('{}',{'content-encoding':'gzip'})),e=>e.status===415);
 assert.deepEqual(await readSingleMessage(req(JSON.stringify(call))),call);
});
